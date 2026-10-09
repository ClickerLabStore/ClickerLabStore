import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateCart, verifySignature, webhook, checkout} from '../src/commerce.js';
const item=(productId,keycaps,quantity=1)=>({productId,quantity,price:0.01,options:{switchType:'Clicky',keycaps}});
test('server prices and components include shared bases and repeated keycaps',()=>{
 const cart=validateCart([item('3-key-clicker',[1,1,2],2),{...item('1-key-light-up-clicker',[1],1),options:{switchType:'Creamy',lightColor:'Blue',keycaps:[1]}}]);
 assert.equal(cart.amount,2*599+349);
 assert.deepEqual(cart.components,[{kind:'base',id:3,quantity:2},{kind:'keycap',id:1,quantity:5},{kind:'keycap',id:2,quantity:2},{kind:'base',id:1,quantity:1}]);
});
test('tampered products, incomplete selections and invalid quantities rejected',()=>{
 for(const items of [[],[item('unknown',[1])],[item('4-key-clicker',[1])],[item('1-key-clicker',[12])],[item('1-key-clicker',[1],0)],[item('1-key-clicker',[1],1.5)]]) assert.throws(()=>validateCart(items));
});
const sign=(raw,t=Math.floor(Date.now()/1000))=>`t=${t},v1=${createHmac('sha256','whsec_test').update(`${t}.${raw}`).digest('hex')}`;
test('webhook HMAC rejects forgery, body changes and stale replay',async()=>{
 const raw='{"test":true}';
 assert.equal(await verifySignature(raw,sign(raw),'whsec_test'),true);
 assert.equal(await verifySignature(raw+' ',sign(raw),'whsec_test'),false);
 assert.equal(await verifySignature(raw,sign(raw,1),'whsec_test'),false);
 assert.equal(await verifySignature(raw,sign(raw),'wrong'),false);
});
test('signed paid events deduct once; unsigned/unpaid/mismatched events do not',async()=>{
 const order={id:'order',session_id:'cs_test_a',status:'open',amount:499,shipping_amount:0,currency:'usd'};
 let deductions=0;
 const env={STRIPE_WEBHOOK_SECRET:'whsec_test',DB:{prepare(sql){return {bind(){return this;},async first(){return order;},async run(){if(sql.includes("status='paid'") && order.status==='open'){order.status='paid';deductions++;}return {};}};}}};
 const event={type:'checkout.session.completed',data:{object:{id:'cs_test_a',client_reference_id:'order',metadata:{order_id:'order'},payment_status:'paid',livemode:false,currency:'usd',amount_subtotal:499,amount_total:499}}};
 const send=async(valid=true)=>{const raw=JSON.stringify(event);return webhook(new Request('https://store/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':valid?sign(raw):'bad'},body:raw}),env);};
 assert.equal((await send(false)).status,400);assert.equal(deductions,0);
 event.data.object.payment_status='unpaid';assert.equal((await send()).status,200);assert.equal(deductions,0);
 event.data.object.payment_status='paid'; event.data.object.amount_total=1;assert.equal((await send()).status,400);
 event.data.object.amount_total=499;assert.equal((await send()).status,200);assert.equal((await send()).status,200);assert.equal(deductions,1);
});
test('unconfigured checkout is disabled',async()=>{
 assert.equal((await checkout(new Request('https://store/api/checkout',{method:'POST'}),{})).status,503);
});
test('Checkout charges server prices, uses US shipping and reuses the attempt',async()=>{
 let order=null, reservations=0, stripeCalls=0;
 const env={STRIPE_SECRET_KEY:'test-fixture',STORE_URL:'https://store.test',STRIPE_WEBHOOK_SECRET:'test-signing',SHIPPO_API_TOKEN:'test-fixture',SHIP_FROM_ADDRESS:'configured',DB:{
  prepare(sql){let values; return {bind(...v){values=v;return this;},async first(){if(sql.includes('shipping_quotes')) return {id:'11111111-1111-4111-8111-111111111111',created_at:Math.floor(Date.now()/1000),address_json:JSON.stringify({name:'Test Buyer',street1:'123 Test St',city:'San Marino',state:'CA',zip:'91108',country:'US'}),rates_json:JSON.stringify([{id:'a'.repeat(32),amount:525,service:'USPS Ground Advantage'}])}; return order;},async run(){if(sql.startsWith('UPDATE orders SET status=\'open\'')){order.status='open';order.session_id=values[0];}return {};},sql,get values(){return values;}};},
  async batch(statements){reservations++;const v=statements[0].values;order={id:v[0],status:'creating',amount:v[1],cart_json:v[2],created_at:v[3],shipping_amount:v[4],shipping_countries:v[5],shipping_quote_id:v[6],shipping_rate_id:v[7],shipping_address_json:v[8],shipping_service:v[9]};return [];}
 }};
 const previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  if(url.startsWith('https://api.goshippo.com')) return Response.json({object_id:'a'.repeat(32),provider:'USPS',currency:'USD',servicelevel:{token:'usps_ground_advantage'},test:true,amount:'5.25'});
  stripeCalls++;
  assert.match(url,/^https:\/\/api.stripe.com\/v1\/checkout\/sessions/);
  if(options.method==='POST'){
   const params=new URLSearchParams(options.body);
   assert.equal(params.get('line_items[0][price_data][unit_amount]'),'599');
   assert.equal(params.has('payment_method_types[0]'),false);
   assert.equal(params.get('payment_intent_data[shipping][address][postal_code]'),'91108');
   assert.equal(params.get('shipping_address_collection[allowed_countries][0]'),null);
   assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'525');
   assert.equal(options.headers['Idempotency-Key'],`checkout-v2-${order.id}`);
  }
  return Response.json({id:'cs_test_checkout',url:'https://checkout.stripe.com/c/pay/test',status:'open',livemode:false});
 };
 try {
  const body={requestId:crypto.randomUUID(),quoteId:'11111111-1111-4111-8111-111111111111',rateId:'a'.repeat(32),items:[item('3-key-clicker',[1,1,2],2)]};
  const request=()=>new Request('https://store.test/api/checkout',{method:'POST',headers:{Origin:'https://store.test'},body:JSON.stringify(body)});
  assert.equal((await checkout(request(),env)).status,200);
  assert.equal((await checkout(request(),env)).status,200);
  assert.equal(reservations,1);assert.equal(stripeCalls,2);
  body.items[0].quantity=3;assert.equal((await checkout(request(),env)).status,409);
 } finally {globalThis.fetch=previous;}
});
test('9-key server price and repeated component quantities',()=>{
 const cart=validateCart([item('9-key-clicker',[1,1,1,1,2,2,2,2,3],2)]);
 assert.equal(cart.amount,2998);
 assert.deepEqual(cart.components,[{kind:'base',id:9,quantity:2},{kind:'keycap',id:1,quantity:8},{kind:'keycap',id:2,quantity:8},{kind:'keycap',id:3,quantity:2}]);
 assert.throws(()=>validateCart([item('9-key-clicker',[1,2,3])]));
});
test('all bundles use fixed prices and reserve every included base and keycap',()=>{
 for(const [id,price,sizes] of [['starter-pack',849,[1,4]],['starter-lab',999,[2,4]],['clicker-trio',1149,[1,2,4]],['trio-lab',1199,[1,3,4]],['clickerlab-pack',2699,[1,2,3,4,9]]]) {
  const line={productId:id,quantity:2,price:0.01,options:{clickers:sizes.map(n=>({productId:`${n}-key-clicker`,switchType:'Creamy',keycaps:Array(n).fill(1)}))}};
  const result=validateCart([line]);
  assert.equal(result.amount,price*2);
  assert.equal(result.components.find(c=>c.kind==='keycap').quantity,sizes.reduce((a,b)=>a+b,0)*2);
  assert.deepEqual(result.components.filter(c=>c.kind==='base').map(c=>[c.id,c.quantity]),sizes.map(n=>[n,2]));
  line.options.clickers[0].productId='9-key-clicker'; assert.throws(()=>validateCart([line]));
 }
});
