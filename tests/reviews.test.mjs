import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {reviewAccess,submitReview,listReviews,previewReviewAccess} from '../src/reviews.js';
import worker from '../src/index.js';

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE keycaps(id INTEGER PRIMARY KEY,name TEXT,stock INTEGER)');
 const directory=new URL('../migrations/',import.meta.url);for(const file of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(file,directory),'utf8'));
 const DB={prepare(sql){return {v:[],bind(...v){this.v=v;return this;},async first(){return db.prepare(sql).get(...this.v) || null;},async all(){return {results:db.prepare(sql).all(...this.v)};},async run(){return {meta:{changes:db.prepare(sql).run(...this.v).changes}};}};}};
 const env={DB,PAYMENT_MODE:'live',STORE_URL:'https://store.test',STRIPE_WEBHOOK_SECRET:'rate-fixture',REVIEWS_SIGNING_SECRET:'review-signing-fixture-only'};
 function order({status='paid',mode='live',products=[{productId:'1-key-clicker',quantity:1}],paidAt=2}={}){
  const id=crypto.randomUUID(),session=`cs_${mode}_`+id.replaceAll('-','');db.prepare(`INSERT INTO orders(id,status,session_id,payment_mode,amount,shipping_amount,shipping_countries,cart_json,created_at,paid_at) VALUES(?,?,?,?,249,525,'US',?,1,?)`).run(id,status,session,mode,JSON.stringify(products),status==='paid'?paidAt:null);return {id,session};
 }
 const paid=order();
 return {db,env,order,paid,close:()=>db.close()};
}
const request=(path,data,headers={})=>new Request('https://store.test'+path,{method:'POST',headers:{Origin:'https://store.test','Content-Type':'application/json','CF-Connecting-IP':'203.0.113.5',...headers},body:JSON.stringify(data)});
async function access(f,order=f.paid){const response=await reviewAccess(request('/api/reviews/access',{sessionId:order.session}),f.env);assert.equal(response.status,200);return response.json();}
const payload=(token,change={})=>({token,productId:'1-key-clicker',rating:5,displayName:'Fixture buyer',body:'A satisfying clicker.',...change});
const listing=async f=>{const response=await listReviews(new Request('https://store.test/api/reviews?product=1-key-clicker'),f.env);return response.json();};

test('private access requires a paid order in the current mode and returns only purchased products',async()=>{
 const f=fixture();try{
  const invite=await access(f);assert.deepEqual(invite.items.map(i=>i.id),['1-key-clicker']);assert.match(invite.token,/^[a-f0-9-]{36}\.[a-f0-9]{64}$/);
  for(const status of ['open','creating','expired','failed']){const o=f.order({status});assert.equal((await reviewAccess(request('/api/reviews/access',{sessionId:o.session}),f.env)).status,403);}
  const oldTest=f.order({mode:'test'});assert.equal((await reviewAccess(request('/api/reviews/access',{sessionId:oldTest.session}),f.env)).status,403);
  const noPaidAt=f.order({paidAt:null});assert.equal((await reviewAccess(request('/api/reviews/access',{sessionId:noPaidAt.session}),f.env)).status,403);
  assert.equal((await reviewAccess(request('/api/reviews/access',{sessionId:'cs_live_unknown123'}),f.env)).status,403);
 }finally{f.close();}
});
test('forged tokens, public order IDs, and products not in the order cannot submit',async()=>{
 const f=fixture();try{
  const {token}=await access(f);
  for(const bad of [f.paid.id,token.slice(0,-1)+(token.endsWith('0')?'1':'0'),token+'.extra','not-a-token',null])assert.equal((await submitReview(request('/api/reviews',payload(bad)),f.env)).status,403);
  assert.equal((await submitReview(request('/api/reviews',payload(token,{productId:'9-key-clicker'})),f.env)).status,403);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM product_reviews').get().n,0);
 }finally{f.close();}
});
test('one review per purchased product/order; edits keep original date and update average without extra votes',async()=>{
 const f=fixture();try{
  const {token}=await access(f);
  assert.equal((await submitReview(request('/api/reviews',payload(token)),f.env)).status,200);
  const first=f.db.prepare('SELECT * FROM product_reviews').get();
  assert.equal((await submitReview(request('/api/reviews',payload(token,{rating:2,body:'I prefer a softer feel.'})),f.env)).status,200);
  const publicData=await listing(f);assert.equal(publicData.count,1);assert.equal(publicData.average,2);assert.equal(publicData.reviews[0].created_at,first.created_at);assert.equal(publicData.reviews[0].id,first.id);
  const eligible=await reviewAccess(request('/api/reviews/eligibility',{token}),f.env,true);const data=await eligible.json();assert.equal(data.items[0].review.rating,2);
 }finally{f.close();}
});
test('one-star negative feedback publishes just like five stars and participates in totals',async()=>{
 const f=fixture();try{
  const a=await access(f),b=await access(f,f.order());
  await submitReview(request('/api/reviews',payload(a.token,{rating:1,body:'Not the feel I expected.'})),f.env);
  await submitReview(request('/api/reviews',payload(b.token,{rating:5})),f.env);
  const data=await listing(f);assert.equal(data.count,2);assert.equal(data.average,3);assert.deepEqual(data.reviews.map(r=>r.rating).sort(),[1,5]);
 }finally{f.close();}
});
test('bundle purchases allow the purchased bundle and its actual component clickers only',async()=>{
 const f=fixture();try{
  const o=f.order({products:[{productId:'trio-lab',quantity:1,options:{clickers:[{productId:'1-key-clicker'},{productId:'3-key-clicker'},{productId:'4-key-clicker'}]}}]});
  const invite=await access(f,o);assert.deepEqual(invite.items.map(i=>i.id),['trio-lab','1-key-clicker','3-key-clicker','4-key-clicker']);
  for(const productId of ['trio-lab','3-key-clicker'])assert.equal((await submitReview(request('/api/reviews',payload(invite.token,{productId})),f.env)).status,200);
  assert.equal((await submitReview(request('/api/reviews',payload(invite.token,{productId:'2-key-clicker'})),f.env)).status,403);
 }finally{f.close();}
});
test('ratings, field lengths, contact information and malformed submissions are validated',async()=>{
 const f=fixture();try{
  const {token}=await access(f);
  for(const rating of [0,6,1.5,'5',null])assert.equal((await submitReview(request('/api/reviews',payload(token,{rating})),f.env)).status,400);
  for(const change of [{displayName:''},{displayName:' '.repeat(5)},{displayName:'x'.repeat(41)},{body:'x'.repeat(1501)},{displayName:'buyer@example.com'},{body:'Visit https://spam.example'},{body:null}])assert.equal((await submitReview(request('/api/reviews',payload(token,change)),f.env)).status,400);
  assert.equal((await submitReview(request('/api/reviews',payload(token,{body:''})),f.env)).status,200);
 }finally{f.close();}
});
test('public results never expose private order/session/token information; unsafe markup remains plain data',async()=>{
 const f=fixture();try{
  const {token}=await access(f);await submitReview(request('/api/reviews',payload(token,{displayName:'<b>Buyer</b>',body:'<img src=x onerror=alert(1)>'})),f.env);
  const data=await listing(f);assert.equal(data.reviews[0].body,'<img src=x onerror=alert(1)>');
  assert.deepEqual(Object.keys(data.reviews[0]).sort(),['body','created_at','display_name','id','rating','updated_at']);
  const raw=JSON.stringify(data);assert.ok(!raw.includes(f.paid.id)&&!raw.includes(f.paid.session)&&!raw.includes(token));
 }finally{f.close();}
});
test('moderation needs a stated non-rating reason; buyer edits do not republish a hidden review',async()=>{
 const f=fixture();try{
  const {token}=await access(f);await submitReview(request('/api/reviews',payload(token)),f.env);
  assert.throws(()=>f.db.exec("UPDATE product_reviews SET status='hidden'"),/CHECK/);
  assert.throws(()=>f.db.exec("UPDATE product_reviews SET status='hidden',moderation_reason='low_rating'"),/CHECK/);
  f.db.exec("UPDATE product_reviews SET status='hidden',moderation_reason='personal_information'");
  await submitReview(request('/api/reviews',payload(token,{rating:1,body:'Edited review'})),f.env);
  assert.equal(f.db.prepare('SELECT status FROM product_reviews').get().status,'hidden');assert.equal((await listing(f)).count,0);
 }finally{f.close();}
});
test('SQLite also blocks direct insertion for an unpaid or unrelated order',()=>{
 const f=fixture();try{
  const open=f.order({status:'open'});const insert=f.db.prepare("INSERT INTO product_reviews(id,order_id,product_id,rating,display_name,body,created_at,updated_at) VALUES(?,?,?,5,'Buyer','',1,1)");
  assert.throws(()=>insert.run(crypto.randomUUID(),open.id,'1-key-clicker'),/Paid purchase/);
  assert.throws(()=>insert.run(crypto.randomUUID(),f.paid.id,'9-key-clicker'),/Purchased product/);
 }finally{f.close();}
});
test('public pagination is bounded and excludes hidden rows',async()=>{
 const f=fixture();try{
  for(let i=0;i<12;i++){const {token}=await access(f,i?f.order():f.paid);await submitReview(request('/api/reviews',payload(token)),f.env);}
  const first=await listing(f);assert.equal(first.reviews.length,10);assert.equal(first.hasMore,true);
  const second=await (await listReviews(new Request('https://store.test/api/reviews?product=1-key-clicker&page=1'),f.env)).json();assert.equal(second.reviews.length,2);assert.equal(second.hasMore,false);
  assert.equal((await listReviews(new Request('https://store.test/api/reviews?product=unknown'),f.env)).status,400);
  assert.equal((await listReviews(new Request('https://store.test/api/reviews?product=1-key-clicker&page=-1'),f.env)).status,400);
 }finally{f.close();}
});
test('Worker enforces origin, JSON, body limits, request budgets and private POST access',async()=>{
 const f=fixture();try{
  assert.equal((await worker.fetch(request('/api/reviews/access',{sessionId:f.paid.session},{Origin:'https://evil.example'}),f.env)).status,403);
  assert.equal((await worker.fetch(request('/api/reviews/access',{}, {'Content-Type':'text/plain'}),f.env)).status,415);
  assert.equal((await worker.fetch(request('/api/reviews/access',{padding:'x'.repeat(33000)}),f.env)).status,413);
  for(let i=0;i<10;i++)assert.equal((await worker.fetch(request('/api/reviews/access',{sessionId:f.paid.session}),f.env)).status,200);
  assert.equal((await worker.fetch(request('/api/reviews/access',{sessionId:f.paid.session}),f.env)).status,429);
  assert.equal((await worker.fetch(new Request('https://store.test/api/reviews/eligibility'),f.env)).status,405);
 }finally{f.close();}
});
test('demo access exists only on the isolated preview; payment and scheduled jobs are disabled there',async()=>{
 const f=fixture();try{
  assert.equal((await previewReviewAccess(f.env)).status,404);
  f.env.REVIEWS_PREVIEW='true';f.env.REVIEWS_DEMO_ORDER_ID=f.paid.id;
  assert.equal((await (await previewReviewAccess(f.env)).json()).demo,true);
  for(const route of ['/api/checkout','/api/shipping-rates','/api/stripe/webhook'])assert.equal((await worker.fetch(request(route,{}),f.env)).status,503);
  let scheduled=false;await worker.scheduled({},f.env,{waitUntil(){scheduled=true;}});assert.equal(scheduled,false);
 }finally{f.close();}
});
