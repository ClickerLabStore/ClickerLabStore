import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {purchaseOrderLabel,processShippingLabels} from '../src/labels.js';
import {checkout,webhook} from '../src/commerce.js';
import {reconcileCheckouts} from '../src/reconciliation.js';
import worker from '../src/index.js';

const seconds=()=>Math.floor(Date.now()/1000);
const address={name:'Fixture Customer',street1:'123 Example St',street2:'',city:'San Marino',state:'CA',zip:'91108',country:'US'};
const sender={...address,name:'Fixture Store',street1:'456 Sender St'};
const rateId='a'.repeat(32),shipmentId='b'.repeat(32),transactionId='c'.repeat(32);
function fixture({paid=true,eligible=1,mode='live',seed=true}={}){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE keycaps(id INTEGER PRIMARY KEY,name TEXT,stock INTEGER); INSERT INTO keycaps VALUES(8,'Fixture',100)");
 const migrations=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,migrations),'utf8'));
 const order={id:'11111111-1111-4111-8111-111111111111',session_id:`cs_${mode}_fixture`,payment_mode:mode,amount:249,shipping_amount:525};
 let failWrite=null;
 const DB={db,prepare(sql){return {values:[],bind(...values){this.values=values;return this;},
  async first(){return db.prepare(sql).get(...this.values) || null;},
  async all(){return {results:db.prepare(sql).all(...this.values)};},
  async run(){if(failWrite && sql.includes(failWrite)){failWrite=null;throw Error('Simulated persistence interruption');}return {meta:{changes:db.prepare(sql).run(...this.values).changes}};}
 }},async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const quoteId='22222222-2222-4222-8222-222222222222';
 db.prepare('INSERT INTO shipping_quotes VALUES(?,?,?,?,?)').run(quoteId,JSON.stringify(address),JSON.stringify([{id:rateId,amount:525,service:'USPS Ground Advantage'}]),seconds(),mode);
 if(seed){
  db.prepare(`INSERT INTO orders(id,status,session_id,payment_mode,amount,shipping_amount,currency,created_at,cart_json,shipping_countries,
   shipping_quote_id,shipping_rate_id,shipping_address_json,shipping_service,auto_label_eligible) VALUES(?,'creating',?,?,?,?,'usd',?,'[]','US',?,?,?,'USPS Ground Advantage',?)`)
   .run(order.id,order.session_id,mode,249,525,seconds()-7200,quoteId,rateId,JSON.stringify(address),eligible);
  db.prepare("INSERT INTO order_components VALUES(?,'base',1,1)").run(order.id);
  db.prepare("INSERT INTO order_components VALUES(?,'keycap',8,1)").run(order.id);
  db.prepare("UPDATE orders SET status='open' WHERE id=?").run(order.id);
  if(paid)db.prepare("UPDATE orders SET status='paid',paid_at=? WHERE id=?").run(seconds(),order.id);
 }
 const live=mode==='live';
 const session={id:order.session_id,url:'https://checkout.stripe.com/c/pay/fixture',livemode:live,status:'complete',payment_status:'paid',currency:'usd',amount_subtotal:249,amount_total:774,
  metadata:{order_id:order.id},client_reference_id:order.id,payment_intent:{id:'pi_fixture',livemode:live,status:'succeeded',currency:'usd',amount_received:774,
   shipping:{name:address.name,address:{line1:address.street1,line2:'',city:address.city,state:address.state,postal_code:address.zip,country:'US'}},
   latest_charge:{id:'ch_fixture',payment_intent:'pi_fixture',livemode:live,paid:true,captured:true,refunded:false,amount_refunded:0,disputed:false,amount:774,currency:'usd'}}};
 const rate={object_id:rateId,test:!live,provider:'USPS',currency:'USD',amount:'5.25',shipment:shipmentId,servicelevel:{token:'usps_ground_advantage'}};
 const shipment={object_id:shipmentId,test:!live,address_from:sender,address_to:address,parcels:[{length:'6.000',width:'4.000',height:'2.000',distance_unit:'in',weight:'0.200',mass_unit:'lb'}]};
 const transaction={object_id:transactionId,rate:rateId,test:!live,metadata:`clickerlab:${order.id}`,status:'SUCCESS',label_url:'https://labels.example/fixture.pdf',tracking_number:'9400111899223856928499',tracking_url_provider:'https://tools.usps.com/fixture'};
 const env={DB,AUTO_PURCHASE_LABELS:'true',PAYMENT_MODE:mode,STRIPE_SECRET_KEY:`sk_${mode}_fixture`,STRIPE_WEBHOOK_SECRET:'whsec_fixture',SHIPPO_API_TOKEN:'shippo_fixture',SHIP_FROM_ADDRESS:JSON.stringify(sender),STORE_URL:'https://store.example'};
 const f={db,DB,env,order,quoteId,session,rate,shipment,transaction,calls:[],handler:null,job:()=>db.prepare('SELECT * FROM shipping_labels WHERE order_id=?').get(order.id),failNextWrite:sql=>{failWrite=sql;}};
 f.fetch=async(url,options)=>{
  const call={url,method:options.method,payload:options.body?JSON.parse(url.startsWith('https://api.goshippo.com')?options.body:'null'):null};f.calls.push(call);
  const custom=await f.handler?.(call);if(custom)return custom;
  if(url.startsWith('https://api.stripe.com/v1/checkout/sessions'))return Response.json(session);
  if(url===`https://api.goshippo.com/rates/${rateId}/`)return Response.json(rate);
  if(url===`https://api.goshippo.com/shipments/${shipmentId}/`)return Response.json(shipment);
  if(url===`https://api.goshippo.com/transactions/${transactionId}/`)return Response.json(transaction);
  if(url==='https://api.goshippo.com/transactions/' && options.method==='POST')return Response.json(transaction);
  throw Error('Unexpected provider request');
 };
 return f;
}
async function withProvider(f,fn){const previous=globalThis.fetch;globalThis.fetch=f.fetch;try{return await fn();}finally{globalThis.fetch=previous;f.db.close();}}
const purchases=f=>f.calls.filter(c=>c.url==='https://api.goshippo.com/transactions/' && c.method==='POST');
function eventRequest(f,valid=true,change={}){
 const raw=JSON.stringify({type:'checkout.session.completed',data:{object:{...f.session,...change}}}),timestamp=seconds();
 const signature=createHmac('sha256',f.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
 return new Request('https://store.example/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':valid?`t=${timestamp},v1=${signature}`:'invalid'},body:raw});
}

test('migration excludes old paid/unpaid orders; only eligible confirmed payment enqueues once',async()=>{
 for(const paid of [false,true]){const f=fixture({paid,eligible:0});await withProvider(f,async()=>{assert.equal(f.job(),undefined);assert.equal(await purchaseOrderLabel(f.env,f.order.id),'missing');assert.equal(f.calls.length,0);});}
 const f=fixture({paid:false});await withProvider(f,async()=>{
  assert.equal(f.job(),undefined);await webhook(eventRequest(f),f.env);await webhook(eventRequest(f),f.env);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM shipping_labels').get().n,1);assert.equal(f.job().state,'pending');
  assert.equal(f.db.prepare('SELECT stock FROM keycaps WHERE id=8').get().stock,99);
 });
});
test('only newly created enabled checkouts opt in; existing attempts stay unchanged',async()=>{
 for(const enabled of ['true','false']){
  const f=fixture({seed:false});f.env.AUTO_PURCHASE_LABELS=enabled;
  await withProvider(f,async()=>{
   const request=()=>new Request('https://store.example/api/checkout',{method:'POST',headers:{Origin:'https://store.example'},body:JSON.stringify({requestId:f.order.id,quoteId:f.quoteId,rateId,items:[{productId:'1-key-clicker',quantity:1,options:{keycaps:[8],switchType:'Clicky'}}]})});
   assert.equal((await checkout(request(),f.env)).status,200);
   assert.equal(f.db.prepare('SELECT auto_label_eligible FROM orders').get().auto_label_eligible,enabled==='true'?1:0);
   f.env.AUTO_PURCHASE_LABELS=enabled==='true'?'false':'true';assert.equal((await checkout(request(),f.env)).status,409); // Fixture session is complete.
   assert.equal(f.db.prepare('SELECT auto_label_eligible FROM orders').get().auto_label_eligible,enabled==='true'?1:0);
   assert.equal(purchases(f).length,0);
  });
 }
});
test('verified payment buys selected USPS rate as PDF, storing label/tracking privately',async()=>{
 const f=fixture();await withProvider(f,async()=>{
  assert.equal(await purchaseOrderLabel(f.env,f.order.id),'success');
  assert.deepEqual(purchases(f)[0].payload,{rate:rateId,label_file_type:'PDF_4x6',async:true,metadata:`clickerlab:${f.order.id}`});
  assert.equal(f.job().postage_amount,525);assert.equal(f.job().transaction_id,transactionId);assert.equal(f.job().label_url,f.transaction.label_url);assert.equal(f.job().tracking_number,f.transaction.tracking_number);
  assert.equal(await purchaseOrderLabel(f.env,f.order.id),'success');assert.equal(purchases(f).length,1);
  const result=await worker.fetch(new Request(`https://store.example/api/order-status?session_id=${f.order.session_id}`),f.env);
  assert.deepEqual(await result.json(),{status:'paid',orderId:f.order.id});
  assert.equal((await worker.fetch(new Request('https://store.example/api/shipping-label'),f.env)).status,404);
 });
});
test('overlapping workers and replayed signed webhooks cannot buy a second label',async()=>{
 const f=fixture();await withProvider(f,async()=>{
  await Promise.all(Array.from({length:6},()=>purchaseOrderLabel(f.env,f.order.id)));
  await webhook(eventRequest(f),f.env,()=>{});await processShippingLabels(f.env);
  assert.equal(f.job().state,'success');assert.equal(purchases(f).length,1);
 });
});
test('signed Worker webhook starts background fulfillment; bad signature and unpaid events cannot',async()=>{
 const f=fixture({paid:false});await withProvider(f,async()=>{
  const pending=[],ctx={waitUntil:p=>pending.push(p)};
  assert.equal((await worker.fetch(eventRequest(f,false),f.env,ctx)).status,400);
  assert.equal((await worker.fetch(eventRequest(f,true,{payment_status:'unpaid'}),f.env,ctx)).status,200);assert.equal(pending.length,0);assert.equal(f.job(),undefined);
  assert.equal((await worker.fetch(eventRequest(f),f.env,ctx)).status,200);await Promise.all(pending);
  assert.equal(f.job().state,'success');assert.equal(purchases(f).length,1);
 });
});
test('missed paid webhook is recovered and queued by existing reconciliation',async()=>{
 const f=fixture({paid:false});await withProvider(f,async()=>{
  await reconcileCheckouts(f.env);assert.equal(f.job().state,'pending');await processShippingLabels(f.env);
  assert.equal(purchases(f).length,1);assert.equal(f.job().state,'success');
 });
});
test('pending provider transaction is retrieved only, without another purchase',async()=>{
 const f=fixture();await withProvider(f,async()=>{
  f.transaction.status='QUEUED';assert.equal(await purchaseOrderLabel(f.env,f.order.id),'waiting');assert.equal(f.job().transaction_id,transactionId);
  f.db.prepare('UPDATE shipping_labels SET next_attempt_at=0').run();f.transaction.status='SUCCESS';
  assert.equal(await purchaseOrderLabel(f.env,f.order.id),'success');assert.equal(purchases(f).length,1);assert.ok(f.calls.some(c=>c.url.endsWith(`/transactions/${transactionId}/`)));
 });
});
test('ambiguous POST, malformed response, and persistence failure stop for review without retrying',async()=>{
 for(const failure of ['timeout','http','json','save']){
  const f=fixture();await withProvider(f,async()=>{
   f.handler=call=>{if(call.method==='POST'){
    if(failure==='timeout')throw Error('Timeout after possible charge');
    if(failure==='http')return new Response('Provider failure',{status:500});
    if(failure==='json')return new Response('bad JSON',{status:200});
    f.failNextWrite("state='success'");
   }};
   assert.equal(await purchaseOrderLabel(f.env,f.order.id),'needs_review');assert.equal(f.job().review_reason,'purchase_result_unknown');
   if(failure==='save')assert.equal(f.job().transaction_id,transactionId);
   await processShippingLabels(f.env);await purchaseOrderLabel(f.env,f.order.id);assert.equal(purchases(f).length,1);
  });
 }
});
test('preflight transport errors may retry GETs, never a charge; stop after five failures',async()=>{
 const f=fixture();await withProvider(f,async()=>{
  f.handler=()=>new Response('Unavailable',{status:503});
  for(let i=0;i<5;i++){await purchaseOrderLabel(f.env,f.order.id);f.db.prepare('UPDATE shipping_labels SET next_attempt_at=0').run();}
  assert.equal(f.job().state,'needs_review');assert.equal(f.job().attempts,5);assert.equal(purchases(f).length,0);
 });
});
test('stale preflight can recover; interrupted purchase is never posted again',async()=>{
 for(const state of ['preparing','purchasing']){
  const f=fixture();await withProvider(f,async()=>{
   f.db.prepare('UPDATE shipping_labels SET state=?,claim_token=?,updated_at=?').run(state,'old-claim',seconds()-1000);
   await processShippingLabels(f.env);assert.equal(purchases(f).length,state==='preparing'?1:0);assert.equal(f.job().state,state==='preparing'?'success':'needs_review');
  });
 }
});
test('refunds, disputes, unpaid or mismatched Stripe details cannot purchase postage',async()=>{
 const changes=[s=>s.payment_status='unpaid',s=>s.status='open',s=>s.amount_total=1,s=>s.client_reference_id='other',s=>s.metadata.order_id='other',s=>s.livemode=false,
  s=>s.payment_intent.latest_charge.refunded=true,s=>s.payment_intent.latest_charge.amount_refunded=1,s=>s.payment_intent.latest_charge.disputed=true,
  s=>s.payment_intent.latest_charge.captured=false,s=>s.payment_intent.status='processing',s=>s.payment_intent.latest_charge.payment_intent='pi_other',s=>s.payment_intent.latest_charge=null,
  s=>s.payment_intent.shipping.address.postal_code='91109'];
 for(const change of changes){const f=fixture();change(f.session);await withProvider(f,async()=>{assert.equal(await purchaseOrderLabel(f.env,f.order.id),'needs_review');assert.equal(purchases(f).length,0);});}
});
test('different carrier, mode, rate price, address, sender, or parcel requires review',async()=>{
 const changes=[f=>f.rate.amount='6.25',f=>f.rate.provider='UPS',f=>f.rate.currency='CAD',f=>f.rate.test=true,f=>f.rate.servicelevel.token='usps_priority',f=>f.rate.object_id='d'.repeat(32),
  f=>f.shipment.address_to={...address,zip:'91109'},f=>f.shipment.address_from={...sender,street1:'Wrong sender'},f=>f.shipment.test=true,
  f=>f.shipment.parcels[0].weight='0.4',f=>f.shipment.parcels[0].length='7',f=>f.shipment.parcels.push({...f.shipment.parcels[0]}),f=>f.shipment.parcels[0].mass_unit='oz'];
 for(const change of changes){const f=fixture();change(f);await withProvider(f,async()=>{assert.equal(await purchaseOrderLabel(f.env,f.order.id),'needs_review');assert.equal(purchases(f).length,0);});}
});
test('invalid, incomplete, refunded or mismatched transaction cannot become a successful label',async()=>{
 for(const change of [t=>t.metadata='other',t=>t.test=true,t=>t.rate='d'.repeat(32),t=>t.object_id='invalid',t=>t.status='ERROR',t=>t.status='REFUNDED',t=>t.label_url='http://unsafe.example',t=>t.tracking_number=null]){
  const f=fixture();change(f.transaction);await withProvider(f,async()=>{assert.equal(await purchaseOrderLabel(f.env,f.order.id),'needs_review');assert.equal(purchases(f).length,1);await processShippingLabels(f.env);assert.equal(purchases(f).length,1);});
 }
});
test('queued transaction lookup errors retry GET only; disabling automation stops purchases',async()=>{
 const f=fixture();await withProvider(f,async()=>{
  f.env.AUTO_PURCHASE_LABELS='false';assert.equal(await purchaseOrderLabel(f.env,f.order.id),'disabled');assert.equal(f.calls.length,0);
  f.env.AUTO_PURCHASE_LABELS='true';f.transaction.status='WAITING';await purchaseOrderLabel(f.env,f.order.id);
  f.db.prepare('UPDATE shipping_labels SET next_attempt_at=0').run();f.handler=()=>{throw Error('GET network failure')};
  assert.equal(await purchaseOrderLabel(f.env,f.order.id),'waiting');assert.equal(purchases(f).length,1);
 });
});
test('test/live separation never uses live postage for a historical test order',async()=>{
 const f=fixture({mode:'test'});await withProvider(f,async()=>{
  f.env.PAYMENT_MODE='live';assert.equal(await purchaseOrderLabel(f.env,f.order.id),'other_mode');assert.equal(f.calls.length,0);
  f.env.PAYMENT_MODE='test';assert.equal(await purchaseOrderLabel(f.env,f.order.id),'success');assert.equal(purchases(f).length,1);
 });
});
test('failed atomic inventory fulfillment never enqueues or purchases a label',async()=>{
 const f=fixture({paid:false});await withProvider(f,async()=>{
  f.db.prepare('UPDATE keycaps SET stock=0 WHERE id=8').run();const pending=[];
  const response=await worker.fetch(eventRequest(f),f.env,{waitUntil:p=>pending.push(p)});
  assert.equal(response.status,500);assert.equal(f.job(),undefined);assert.equal(pending.length,0);assert.equal(purchases(f).length,0);
  assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'open');
 });
});
