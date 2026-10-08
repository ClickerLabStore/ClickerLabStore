import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAddress,rateAmount,shippingRates,checkoutShipping} from '../src/shipping.js';
const address={name:'Test Buyer',street1:'123 Test St',city:'San Marino',state:'CA',zip:'91108',country:'US'};
const rate={object_id:'a'.repeat(32),provider:'USPS',currency:'USD',amount:'5.25',servicelevel:{token:'usps_ground_advantage'},estimated_days:3,test:true};
function fixture(){let quote;return {env:{SHIPPO_API_TOKEN:'fixture',SHIP_FROM_ADDRESS:JSON.stringify(address),STORE_URL:'https://store.test',DB:{prepare(){return {bind(...values){this.values=values;return this;},async run(){quote={id:this.values[0],address_json:this.values[1],rates_json:this.values[2],created_at:this.values[3]};},async first(){return quote;}};}}},quote:()=>quote};}
const request=(data=address)=>new Request('https://store.test/api/shipping-rates',{method:'POST',headers:{Origin:'https://store.test'},body:JSON.stringify({address:data})});
test('US addresses and exact monetary conversion',()=>{
 assert.equal(normalizeAddress({...address,state:'ca'}).state,'CA');
 for(const change of [{country:'CA'},{zip:'bad'},{street1:''},{state:'ZZ'}])assert.throws(()=>normalizeAddress({...address,...change}));
 assert.equal(rateAmount('5.25'),525);
 for(const amount of ['0.00','-1.00','5.255','1e3',5.25])assert.throws(()=>rateAmount(amount));
});
test('USPS quote uses exact parcel, filters carriers and is revalidated for Checkout',async()=>{
 const f=fixture();const previous=globalThis.fetch;let changed=false;
 globalThis.fetch=async(url,opts)=>{
  assert.equal(opts.headers.Authorization,'ShippoToken fixture');
  if(url.endsWith('/shipments/')){
   const payload=JSON.parse(opts.body);assert.deepEqual(payload.parcels,[{length:'6',width:'4',height:'2',distance_unit:'in',weight:'0.2',mass_unit:'lb'}]);
   assert.equal(payload.async,false);assert.equal(payload.address_from.zip,'91108');
   return Response.json({test:true,rates:[rate,{...rate,provider:'UPS'}]});
  }
  return Response.json({...rate,amount:changed?'6.25':'5.25'});
 };
 try{
  const response=await shippingRates(request(),f.env);assert.equal(response.status,200);
  const quote=await response.json();assert.equal(quote.rates.length,1);assert.equal(quote.rates[0].amount,525);
  const body={quoteId:quote.quoteId,rateId:rate.object_id,shippingAmount:1};
  assert.equal((await checkoutShipping(f.env,body)).amount,525);
  changed=true;await assert.rejects(()=>checkoutShipping(f.env,body),/rates changed/);
  await assert.rejects(()=>checkoutShipping(f.env,{...body,rateId:'b'.repeat(32)}),/Invalid shipping rate/);
  f.quote().created_at=1;await assert.rejects(()=>checkoutShipping(f.env,body),/expired/);
 }finally{globalThis.fetch=previous;}
});
test('missing config, invalid addresses, carrier failure and live rates fail closed',async()=>{
 assert.equal((await shippingRates(request(),{})).status,503);
 const f=fixture();assert.equal((await shippingRates(request({...address,country:'CA'}),f.env)).status,400);
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('',{status:401});assert.equal((await shippingRates(request(),f.env)).status,502);
  globalThis.fetch=async()=>Response.json({test:false,rates:[rate]});assert.equal((await shippingRates(request(),f.env)).status,502);
  globalThis.fetch=async()=>Response.json({test:true,rates:[]});assert.equal((await shippingRates(request(),f.env)).status,502);
 }finally{globalThis.fetch=previous;}
});
