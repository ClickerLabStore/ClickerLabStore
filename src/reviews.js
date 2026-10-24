import {PRODUCTS,BUNDLES} from './commerce.js';
import {paymentMode} from './payment-mode.js';

const catalog={...PRODUCTS,...BUNDLES};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export function purchasedProducts(order){
 const ids=new Set();
 try{for(const line of JSON.parse(order.cart_json)){
  if(Object.hasOwn(catalog,line.productId))ids.add(line.productId);
  if(Object.hasOwn(BUNDLES,line.productId))for(const part of line.options?.clickers || [])if(Object.hasOwn(PRODUCTS,part.productId))ids.add(part.productId);
 }}catch{return [];}
 return [...ids].map(id=>({id,name:catalog[id].name}));
}
function eligibleOrder(order,env){return order?.status==='paid' && Number.isInteger(order.paid_at) && order.payment_mode===paymentMode(env);}
async function signature(order,env){
 if(!env.REVIEWS_SIGNING_SECRET)throw Error('Reviews not configured');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.REVIEWS_SIGNING_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`clickerlab-review:v1:${order.id}:${order.session_id}:${order.payment_mode}`));
 return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function tokenFor(order,env){return order.id+'.'+await signature(order,env);}
async function tokenOrder(token,env){
 if(typeof token!=='string' || token.length>110)return null;
 const [id,mac,...extra]=token.split('.');if(extra.length || !UUID.test(id || '') || !/^[a-f0-9]{64}$/.test(mac || ''))return null;
 const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
 if(!eligibleOrder(order,env))return null;
 const expected=await signature(order,env);let difference=0;
 for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^mac.charCodeAt(i);
 return difference===0?order:null;
}
async function invitation(order,env){
 const {results}=await env.DB.prepare('SELECT product_id,rating,display_name,body,status,created_at,updated_at FROM product_reviews WHERE order_id=?').bind(order.id).all();
 return {token:await tokenFor(order,env),demo:env.REVIEWS_PREVIEW==='true',items:purchasedProducts(order).map(item=>({...item,review:results.find(row=>row.product_id===item.id) || null}))};
}
export async function reviewAccess(request,env,tokenOnly=false){
 if(!env.REVIEWS_SIGNING_SECRET)return reply({error:'Reviews are not configured yet.'},503);
 let body;try{body=await request.json();}catch{return reply({error:'Invalid review request.'},400);}
 let order;
 if(tokenOnly)order=await tokenOrder(body.token,env);
 else{
  if(typeof body.sessionId!=='string' || !/^cs_(?:test|live)_[A-Za-z0-9]{6,200}$/.test(body.sessionId))return reply({error:'Use your private purchase review link.'},403);
  order=await env.DB.prepare('SELECT * FROM orders WHERE session_id=?').bind(body.sessionId).first();
  if(!eligibleOrder(order,env))order=null;
 }
 if(!order)return reply({error:'This link does not match a confirmed purchase. Please use your private review link after payment is confirmed.'},403);
 return reply(await invitation(order,env));
}
export async function previewReviewAccess(env){
 if(env.REVIEWS_PREVIEW!=='true')return reply({error:'Not found'},404);
 const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(env.REVIEWS_DEMO_ORDER_ID || '').first();
 if(!eligibleOrder(order,env))return reply({error:'Demo order unavailable.'},503);
 return reply(await invitation(order,env));
}
export async function listReviews(request,env){
 const url=new URL(request.url),product=url.searchParams.get('product'),page=Number(url.searchParams.get('page') || '0');
 if(!Object.hasOwn(catalog,product || '') || !Number.isInteger(page) || page<0 || page>10000)return reply({error:'Invalid product or page.'},400);
 const summary=await env.DB.prepare("SELECT COUNT(*) AS count,AVG(rating) AS average FROM product_reviews WHERE product_id=? AND status='published'").bind(product).first();
 const {results}=await env.DB.prepare(`SELECT id,rating,display_name,body,created_at,updated_at FROM product_reviews
   WHERE product_id=? AND status='published' ORDER BY created_at DESC,id LIMIT 10 OFFSET ?`).bind(product,page*10).all();
 return reply({product,name:catalog[product].name,count:summary.count,average:summary.average,hasMore:(page+1)*10<summary.count,reviews:results,demo:env.REVIEWS_PREVIEW==='true'});
}
export async function submitReview(request,env){
 if(!env.REVIEWS_SIGNING_SECRET)return reply({error:'Reviews are not configured yet.'},503);
 let data;try{data=await request.json();}catch{return reply({error:'Invalid review.'},400);}
 const order=await tokenOrder(data.token,env);
 if(!order)return reply({error:'Use your private verified-purchase review link.'},403);
 if(!purchasedProducts(order).some(item=>item.id===data.productId))return reply({error:'This product was not included in your purchase.'},403);
 if(!Number.isInteger(data.rating) || data.rating<1 || data.rating>5 || typeof data.displayName!=='string' || typeof data.body!=='string')return reply({error:'Choose 1–5 stars and enter a name or nickname.'},400);
 const name=data.displayName.trim(),body=data.body.trim();
 if(name.length<1 || name.length>40 || body.length>1500)return reply({error:'Use a name up to 40 characters and a review up to 1,500 characters.'},400);
 if(/https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[^\s@]+/i.test(name+' '+body))return reply({error:'Please remove links and email addresses from your public review.'},400);
 const time=Math.floor(Date.now()/1000);
 await env.DB.prepare(`INSERT INTO product_reviews(id,order_id,product_id,rating,display_name,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)
   ON CONFLICT(order_id,product_id) DO UPDATE SET rating=excluded.rating,display_name=excluded.display_name,body=excluded.body,updated_at=excluded.updated_at`)
   .bind(crypto.randomUUID(),order.id,data.productId,data.rating,name,body,time,time).run();
 const saved=await env.DB.prepare('SELECT status FROM product_reviews WHERE order_id=? AND product_id=?').bind(order.id,data.productId).first();
 return reply({ok:true,status:saved.status,demo:env.REVIEWS_PREVIEW==='true'});
}
