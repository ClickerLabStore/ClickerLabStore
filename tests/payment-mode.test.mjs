import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {paymentMode,isLive} from '../src/payment-mode.js';
import {webhook,checkout} from '../src/commerce.js';
import {shippingRates,checkoutShipping} from '../src/shipping.js';
test('live mode is explicit and invalid configuration fails closed',()=>{
 assert.equal(paymentMode({}),'test');assert.equal(isLive({PAYMENT_MODE:'live'}),true);assert.throws(()=>paymentMode({PAYMENT_MODE:'other'}));
});
test('live paid webhook matches stored mode; test event cannot fulfill live order',async()=>{
 const order={id:'order',session_id:'cs_live_fixture',payment_mode:'live',status:'open',amount:249,shipping_amount:500,currency:'usd'};let deducted=0;
 const env={STRIPE_WEBHOOK_SECRET:'fixture',DB:{prepare(){return {bind(){return this},async first(){return order},async run(){if(order.status==='open'){order.status='paid';deducted++}}}}}};
 const session={id:order.session_id,client_reference_id:order.id,metadata:{order_id:order.id},livemode:false,payment_status:'paid',currency:'usd',amount_subtotal:249,amount_total:749};
 async function send(){const timestamp=Math.floor(Date.now()/1000);const raw=JSON.stringify({type:'checkout.session.completed',data:{object:session}});const sig=createHmac('sha256','fixture').update(`${timestamp}.${raw}`).digest('hex');return webhook(new Request('https://store/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${sig}`},body:raw}),env)}
 assert.equal((await send()).status,400);assert.equal(deducted,0);session.livemode=true;assert.equal((await send()).status,200);assert.equal((await send()).status,200);assert.equal(deducted,1);
});
test('test Stripe credential cannot start live checkout',async()=>{
 const env={PAYMENT_MODE:'live',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'fixture',STORE_URL:'https://store',SHIPPO_API_TOKEN:'fixture',SHIP_FROM_ADDRESS:'configured'};
 assert.equal((await checkout(new Request('https://store/api/checkout',{method:'POST'}),env)).status,503);
});
test('live shipping accepts live rates and rejects old test quotes',async()=>{
 const previous=globalThis.fetch;let stored;
 const env={PAYMENT_MODE:'live',SHIPPO_API_TOKEN:'fixture',STORE_URL:'https://store',SHIP_FROM_ADDRESS:JSON.stringify({name:'Store',street1:'1 Main St',city:'San Marino',state:'CA',zip:'91108',country:'US'}),DB:{prepare(){return {bind(...v){stored=v;return this},async run(){},async first(){return {payment_mode:'test',created_at:Math.floor(Date.now()/1000)}}}}}};
 globalThis.fetch=async()=>Response.json({test:false,rates:[{object_id:'a'.repeat(32),provider:'USPS',currency:'USD',servicelevel:{token:'usps_ground_advantage'},amount:'5.00'}]});
 try{const response=await shippingRates(new Request('https://store/api/shipping-rates',{method:'POST',headers:{Origin:'https://store'},body:JSON.stringify({address:{name:'Buyer',street1:'2 Main St',city:'San Marino',state:'CA',zip:'91108',country:'US'}})}),env);assert.equal(response.status,200);assert.equal(stored[4],'live');await assert.rejects(()=>checkoutShipping(env,{quoteId:'11111111-1111-4111-8111-111111111111',rateId:'a'.repeat(32)}),/payment mode changed/);}finally{globalThis.fetch=previous;}
});
