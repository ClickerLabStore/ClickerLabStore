import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {validateCart,inventory} from '../src/commerce.js';
const stocks={12:18,13:13,14:19,15:18,16:5,17:30,18:5,19:7};
const item=(keys,quantity=1)=>({productId:`${keys.length}-key-clicker`,quantity,options:{switchType:'Creamy',keycaps:keys}});
test('checkout accepts all new keycaps, preserves repeat quantities and rejects out-of-catalog IDs',()=>{
 for(const id of Object.keys(stocks).map(Number))assert.equal(validateCart([item([id])]).components.find(c=>c.kind==='keycap').id,id);
 const cart=validateCart([item([18,18,19],2)]);assert.deepEqual(cart.components.filter(c=>c.kind==='keycap'),[{kind:'keycap',id:18,quantity:4},{kind:'keycap',id:19,quantity:2}]);
 const bundle=validateCart([{productId:'starter-pack',quantity:1,options:{clickers:[{productId:'1-key-clicker',switchType:'Clicky',keycaps:[12]},{productId:'4-key-clicker',switchType:'Creamy',keycaps:[19,19,18,17]}]}}]);
 assert.equal(bundle.components.find(c=>c.kind==='keycap'&&c.id===19).quantity,2);
 for(const id of [0,20,-1,12.5,'19'])assert.throws(()=>validateCart([item([id])]));
});
test('new stock migration preserves existing stock and live holds; fulfillment deducts new components once',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("CREATE TABLE keycaps(id INTEGER PRIMARY KEY,name TEXT NOT NULL,stock INTEGER NOT NULL DEFAULT 0); INSERT INTO keycaps VALUES(1,'Original',7)");
  const directory=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,directory),'utf8'));
  for(const [id,stock] of Object.entries(stocks))assert.equal(db.prepare('SELECT stock FROM keycaps WHERE id=?').get(Number(id)).stock,stock);
  assert.equal(db.prepare('SELECT stock FROM keycaps WHERE id=1').get().stock,7);
  db.exec("INSERT INTO orders(id,status,amount,cart_json,created_at,shipping_amount,shipping_countries) VALUES('new-caps','creating',399,'[]',0,0,'US'); INSERT INTO order_components VALUES('new-caps','base',2,1); INSERT INTO order_components VALUES('new-caps','keycap',18,2); UPDATE orders SET status='open' WHERE id='new-caps';");
  const DB={prepare(sql){return {bind(...v){this.v=v;return this;},async all(){return {results:db.prepare(sql).all(...this.v)};}};}};
  assert.equal((await inventory(DB)).keycaps.find(c=>c.id===18).stock,3);
  assert.throws(()=>db.exec("INSERT INTO orders(id,status,amount,cart_json,created_at,shipping_amount,shipping_countries) VALUES('over','creating',699,'[]',0,0,'US'); INSERT INTO order_components VALUES('over','keycap',18,4);"),/Insufficient inventory/);
  db.exec("UPDATE orders SET status='paid',paid_at=1 WHERE id='new-caps'; UPDATE orders SET status='paid' WHERE id='new-caps';");
  assert.equal(db.prepare('SELECT stock FROM keycaps WHERE id=18').get().stock,3);
  db.exec(readFileSync(new URL('0009_keycaps_12_through_19.sql',directory),'utf8'));
  assert.equal(db.prepare('SELECT stock FROM keycaps WHERE id=18').get().stock,3);assert.equal(db.prepare('SELECT stock FROM keycaps WHERE id=1').get().stock,7);
 }finally{db.close();}
});
