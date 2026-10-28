import {PRODUCTS,BUNDLES} from './commerce.js';
export const FUNNEL_EVENTS=new Set(['page_view','add_to_cart','cart_open','shipping_requested','shipping_quoted','shipping_error','checkout_requested','checkout_blocked','checkout_redirect','checkout_error']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pages=new Set(['home','shop','bundles','bundle-details','build','faq','about','click-rhythm',...Object.keys(PRODUCTS)]);
export async function collectFunnel(request,env){
 if(env.REVIEWS_PREVIEW==='true')return new Response(null,{status:204});
 let body;try{body=await request.json();}catch{return new Response('Invalid event',{status:400});}
 if(typeof body?.session!=='string' || !UUID.test(body.session) || !Array.isArray(body.events) || !body.events.length || body.events.length>10)return new Response('Invalid events',{status:400});
 const rows=[];
 for(const e of body.events){
  if(!e || (typeof e.id!=='string' || !UUID.test(e.id)) || !FUNNEL_EVENTS.has(e.event) || !pages.has(e.page) || (e.product!=null && (typeof e.product!=='string' || (!Object.hasOwn(PRODUCTS,e.product) && !Object.hasOwn(BUNDLES,e.product)))))return new Response('Invalid event',{status:400});
  rows.push(env.DB.prepare('INSERT OR IGNORE INTO funnel_events(id,session_id,event,page,product,created_at) VALUES (?,?,?,?,?,?)').bind(e.id,body.session,e.event,e.page,e.product || null,Math.floor(Date.now()/1000)));
 }
 await env.DB.batch(rows);
 return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
}
