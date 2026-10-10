import {test} from 'node:test';
import assert from 'node:assert/strict';
import {protectRequest,reservationOwner,cleanupAbuseData} from '../src/abuse.js';
function setup() {
 const counts=new Map();
 const env={STORE_URL:'https://store.test',STRIPE_WEBHOOK_SECRET:'fixture',DB:{
  prepare(sql) {
   return {bind(key,window) {
    return {async first() {
     const previous=counts.get(key);
     const count=previous?.window===window?previous.count+1:1;
     counts.set(key,{window,count});return {count};
    }};
   }};
  }
 }};
 return {env,counts};
}

function req(ip='192.0.2.1',body='{}',origin='https://store.test'){return new Request('https://store.test/api/shipping-rates',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip},body});}
test('shipping and checkout limits preserve body, separate budgets and return retry instructions',async()=>{
 const {env}=setup();for(let i=0;i<6;i++){const result=await protectRequest(req(),env,'/api/shipping-rates');assert.equal(await result.request.text(),'{}');}
 const blocked=await protectRequest(req(),env,'/api/shipping-rates');assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'60');
 assert.ok((await protectRequest(req(),env,'/api/checkout')).owner);
 assert.ok((await protectRequest(req('192.0.2.2'),env,'/api/shipping-rates')).owner);
});
test('global budget restricts requests spread across network addresses',async()=>{
 const {env}=setup();for(let i=0;i<60;i++)assert.ok((await protectRequest(req(`192.0.2.${i}`),env,'/api/checkout')).owner);
 assert.equal((await protectRequest(req('198.51.100.1'),env,'/api/checkout')).status,429);
});
test('invalid origin, oversized streamed body and missing trusted address fail closed',async()=>{
 const {env}=setup();assert.equal((await protectRequest(req('192.0.2.1','{}','https://evil.test'),env,'/api/checkout')).status,403);
 assert.equal((await protectRequest(req('192.0.2.1','x'.repeat(32769)),env,'/api/checkout')).status,413);
 const missing=req();missing.headers.delete('CF-Connecting-IP');await assert.rejects(()=>protectRequest(missing,env,'/api/checkout'));
 assert.notEqual(await reservationOwner(req(),env),'192.0.2.1');
});
test('old windows reset counters and raw IPs never enter database keys',async()=>{
 const {env,counts}=setup();const owner=await reservationOwner(req(),env);counts.set('/api/checkout:'+owner,{window:0,count:999});assert.ok((await protectRequest(req(),env,'/api/checkout')).owner);assert.ok([...counts.keys()].every(k=>!k.includes('192.0.2.1')));
});
test('cleanup keeps quotes referenced by orders',async()=>{
 let statements;await cleanupAbuseData({DB:{prepare(sql){return {sql,bind(){return this}}},async batch(s){statements=s}}});assert.equal(statements.length,2);assert.match(statements[1].sql,/NOT IN \(SELECT shipping_quote_id FROM orders\)/);
});
test('Worker leaves Stripe signature handling outside customer request limits',async()=>{
 const worker=(await import('../src/index.js')).default;
 const response=await worker.fetch(new Request('https://store.test/api/stripe/webhook',{method:'POST',body:'{}'}),{STRIPE_WEBHOOK_SECRET:'fixture'});
 assert.equal(response.status,400);
 assert.equal(await response.text(),'Invalid signature');
});
