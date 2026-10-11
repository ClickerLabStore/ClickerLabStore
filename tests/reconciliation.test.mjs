import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCheckouts} from '../src/reconciliation.js';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {inventory} from '../src/commerce.js';
import worker from '../src/index.js';

const NOW = 100000;
function order(overrides={}) {
  return {id:'order',status:'open',session_id:`cs_live_${overrides.id || 'fixture'}`,payment_mode:'live',
    amount:699,shipping_amount:500,currency:'usd',created_at:NOW-7200,paid_at:null,
    reconciliation_checked_at:0,...overrides};
}
function session(o,overrides={}) {
  return {id:o.session_id || `cs_${o.payment_mode}_discovered`,livemode:o.payment_mode==='live',
    metadata:{order_id:o.id},client_reference_id:o.id,currency:o.currency,
    amount_subtotal:o.amount,amount_total:o.amount+o.shipping_amount,
    status:'expired',payment_status:'unpaid',...overrides};
}
// Execute production queries against real SQLite and all production migrations.
function database(orders) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE keycaps(id INTEGER PRIMARY KEY,name TEXT,stock INTEGER); INSERT INTO keycaps VALUES (1,'Fixture',20)");
  const migrations=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file,migrations),'utf8'));
  for(const o of orders){
    sqlite.prepare(`INSERT INTO orders(id,status,session_id,payment_mode,amount,shipping_amount,currency,created_at,paid_at,reconciliation_checked_at,cart_json,shipping_countries)
      VALUES (?,?,?,?,?,?,?,?,?,?,'[]','US')`).run(o.id,['creating','open'].includes(o.status)?'creating':o.status,o.session_id,o.payment_mode,o.amount,o.shipping_amount,o.currency,o.created_at,o.paid_at,o.reconciliation_checked_at);
    if(['creating','open'].includes(o.status)){
      for(const [kind,id] of [['base',3],['keycap',1],['light',1]]) sqlite.prepare('INSERT INTO order_components VALUES (?,?,?,1)').run(o.id,kind,id);
      sqlite.prepare('UPDATE orders SET status=? WHERE id=?').run(o.status,o.id);
    }
  }
  function refresh(){for(const o of orders) Object.assign(o,sqlite.prepare('SELECT * FROM orders WHERE id=?').get(o.id));}
  return {sqlite,orders,get physicalStock(){return sqlite.prepare('SELECT stock FROM keycaps WHERE id=1').get().stock},
    async batch(statements){
      sqlite.exec('BEGIN');
      try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    },
    prepare(sql){return {bind(...v){this.v=v;return this},
      async all(){return {results:sqlite.prepare(sql).all(...this.v)}},
      async run(){const result=sqlite.prepare(sql).run(...this.v);refresh();return {meta:{changes:result.changes}}}
    }}
  };
}
async function run(orders,handler,extraEnv={}) {
  const DB=database(orders),calls=[],previous=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{calls.push({url,authorization:options.headers.Authorization});return handler(url,options,DB)};
  try {return {counts:await reconcileCheckouts({DB,STRIPE_SECRET_KEY:'rk_live_fixture',...extraEnv},NOW),DB,calls};}
  finally {globalThis.fetch=previous;}
}
test('expired unpaid session releases the hold without deducting physical inventory',async()=>{
  const o=order();const r=await run([o],()=>Response.json(session(o)));
  assert.equal(o.status,'expired');assert.equal(r.counts.expired,1);assert.equal(r.DB.physicalStock,20);
  const available=await inventory(r.DB);
  assert.equal(available.bases.find(b=>b.id===3).stock,100);
  assert.equal(available.keycaps[0].stock,20);assert.equal(available.lights[0].stock,20);
});
test('missed paid event fulfills exactly once across repeated reconciliation',async()=>{
  const o=order();const r=await run([o],()=>Response.json(session(o,{status:'complete',payment_status:'paid'})));
  assert.equal(o.status,'paid');assert.equal(o.paid_at,NOW);assert.equal(r.DB.physicalStock,19);
  assert.equal((await reconcileCheckouts({DB:r.DB,STRIPE_SECRET_KEY:'rk_live_fixture'},NOW)).checked,0);
  assert.equal(r.DB.physicalStock,19);
  assert.equal(r.DB.sqlite.prepare('SELECT stock FROM bases WHERE id=3').get().stock,99);
  assert.equal(r.DB.sqlite.prepare('SELECT stock FROM lights WHERE id=1').get().stock,19);
});
test('open, pending payment, and inconsistent expired-paid sessions retain stock holds',async()=>{
  for(const state of [{status:'open',payment_status:'unpaid'},{status:'complete',payment_status:'unpaid'},
    {status:'expired',payment_status:'paid'},{status:'complete',payment_status:'no_payment_required'}]){
    const o=order();const r=await run([o],()=>Response.json(session(o,state)));
    assert.equal(o.status,'open');assert.equal(r.counts.retained,1);assert.equal(r.DB.physicalStock,20);
  }
});
test('mode, identity, reference, currency and amounts must all match',async()=>{
  for(const mismatch of [{livemode:false},{id:'cs_live_other'},{metadata:{order_id:'other'}},
    {client_reference_id:'other'},{currency:'eur'},{amount_total:1},{amount_subtotal:1}]){
    const o=order();const r=await run([o],()=>Response.json(session(o,mismatch)));
    assert.equal(o.status,'open');assert.equal(r.counts.retained,1);
  }
});
test('Stripe authentication, missing session, rate limit, malformed response and network failures keep holds',async()=>{
  for(const handler of [()=>Response.json({error:{}},{status:401}),()=>Response.json({error:{}},{status:404}),
    ()=>Response.json({error:{}},{status:429}),()=>new Response('invalid json'),()=>{throw new Error('timeout')}]){
    const o=order();const r=await run([o],handler);assert.equal(o.status,'open');assert.equal(r.counts.errors,1);
  }
});
test('test holds use a separate test secret; live credentials never query test sessions',async()=>{
  const a=order(),b=order({id:'test',payment_mode:'test',session_id:'cs_test_fixture'});
  const r=await run([a,b],url=>Response.json(session(url.endsWith('cs_test_fixture')?b:a)),{STRIPE_TEST_SECRET_KEY:'sk_test_fixture'});
  assert.deepEqual(r.calls.map(c=>c.authorization),['Bearer rk_live_fixture','Bearer sk_test_fixture']);
  assert.equal(r.counts.expired,2);
  const c=order({payment_mode:'test',session_id:'cs_test_fixture'});
  const missing=await run([c],()=>{throw new Error('Must not call Stripe')});
  assert.equal(missing.calls.length,0);assert.equal(missing.counts.missingCredentials,1);assert.equal(c.status,'open');
});
test('current checkouts and ended orders are not reconciled',async()=>{
  const orders=[order({created_at:NOW-3599}),order({id:'paid',status:'paid',paid_at:NOW-1}),order({id:'expired',status:'expired'})];
  const r=await run(orders,()=>{throw new Error('Must not call Stripe')});assert.equal(r.calls.length,0);
});
test('a concurrent paid webhook cannot be overwritten by expiry',async()=>{
  const o=order();const r=await run([o],(url,options,DB)=>{
    DB.sqlite.prepare("UPDATE orders SET status='paid',paid_at=? WHERE id=? AND status='open'").run(NOW,o.id);
    return Response.json(session(o));
  });assert.equal(o.status,'paid');assert.equal(r.counts.expired,0);assert.equal(r.DB.physicalStock,19);
});
test('recover unattached creation through paginated discovery and retrieve its fresh status',async()=>{
  const o=order({status:'creating',session_id:null});let requests=0;
  const r=await run([o],url=>{
    requests++;
    if(requests===1) return Response.json({data:[{id:'cs_live_unrelated'}],has_more:true});
    if(requests===2){assert.match(url,/starting_after=cs_live_unrelated/);return Response.json({data:[session(o,{status:'open'})],has_more:false});}
    return Response.json(session(o));
  });assert.equal(requests,3);assert.equal(o.status,'expired');assert.equal(r.counts.recovered,1);assert.equal(r.DB.physicalStock,20);
});
test('creating order with a missed paid event is attached before fulfilling',async()=>{
  const o=order({status:'creating',session_id:null});const s=session(o,{status:'complete',payment_status:'paid'});
  const r=await run([o],url=>Response.json(url.includes('?')?{data:[s],has_more:false}:s));
  assert.equal(o.status,'paid');assert.equal(r.DB.physicalStock,19);assert.equal(r.counts.paid,1);
});
test('empty, ambiguous, mismatched or incomplete discovery never releases uncertain stock',async()=>{
  const o=order({status:'creating',session_id:null});
  for(const list of [{data:[],has_more:false},{data:[session(o),session(o)],has_more:false},
    {data:[session(o,{livemode:false})],has_more:false},{data:[session(o)],has_more:true},{data:[]}]){
    const candidate=order({status:'creating',session_id:null});const r=await run([candidate],()=>Response.json(list));
    assert.equal(candidate.status,'creating');assert.equal(r.counts.retained,1);assert.ok(r.calls.length<=2);
  }
});
test('failed oldest orders rotate behind unchecked orders and each mode has a bounded batch',async()=>{
  const orders=Array.from({length:6},(_,i)=>order({id:`order${i}`,created_at:NOW-7200+i}));
  const r=await run(orders,()=>Response.json({error:{}},{status:429}));assert.equal(r.counts.checked,5);
  assert.equal(orders[5].reconciliation_checked_at,0);
  const previous=globalThis.fetch;const calls=[];
  globalThis.fetch=async()=>{calls.push(1);return Response.json({error:{}},{status:429})};
  try{await reconcileCheckouts({DB:r.DB,STRIPE_SECRET_KEY:'rk_live_fixture'},NOW+900)}finally{globalThis.fetch=previous}
  assert.equal(orders[5].reconciliation_checked_at,NOW+900);assert.equal(calls.length,5);
});
test('time budget defers remaining holds without checking or releasing them',async()=>{
  const orders=[order({id:'first'}),order({id:'second'})];const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
  try{
    const r=await run(orders,()=>{clock+=26000;return Response.json(session(orders[0]));});
    assert.equal(r.calls.length,1);assert.equal(r.counts.deferred,1);
    assert.equal(orders[1].status,'open');assert.equal(orders[1].reconciliation_checked_at,0);
  }finally{Date.now=realNow;}
});
test('scheduled Worker runs reconciliation and temporary-data cleanup together',async()=>{
  const o=order(),DB=database([o]),pending=[];const previous=globalThis.fetch;
  DB.sqlite.prepare('INSERT INTO request_limits VALUES (?,0,1)').run('fixture');
  globalThis.fetch=async()=>Response.json(session(o));
  try{
    await worker.scheduled({}, {DB,STRIPE_SECRET_KEY:'rk_live_fixture'}, {waitUntil(promise){pending.push(promise)}});
    await Promise.all(pending);
    assert.equal(o.status,'expired');assert.equal(DB.physicalStock,20);
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS count FROM request_limits').get().count,0);
  }finally{globalThis.fetch=previous;}
});
