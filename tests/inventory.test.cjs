const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const files = ['1-key-clicker.html','1-key-light-up-clicker.html','2-key-clicker.html','3-key-clicker.html','4-key-clicker.html'];
function setup(page, initial = []) {
    const elements = new Map();
    const listeners = {};
    const element = () => ({classList: {add(){}, remove(){}, contains(){return false;}}, style:{}, appendChild(){}, addEventListener(){}, querySelectorAll(){return [];}, innerHTML:'', textContent:'', disabled:false});
    const storage = new Map([['clickerlab_cart', JSON.stringify(initial)]]);
    let stock = 8, failed = false, calls = 0, rows;
    const context = vm.createContext({ console, Event, AbortSignal, alert(message){context.alerts.push(message);}, alerts:[],
        localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
        document:{readyState:'loading',body:element(),addEventListener(){},getElementById(id){if (!elements.has(id)) elements.set(id,element()); return elements.get(id);},createElement:element},
        fetch:async (url, options)=>{assert.equal(url,'/api/keycaps'); assert.equal(options.cache,'no-store'); calls++; return {ok:!failed,json:async()=>({keycaps:rows || Array.from({length:11},(_,i)=>({id:i+1,name:`Keycap ${i+1}`,stock})),bases:Array.from({length:4},(_,i)=>({id:i+1,name:`Base ${i+1}`,stock:100}))})};}
    });
    context.window = context;
    context.addEventListener=(name,fn)=>(listeners[name] ||= []).push(fn);
    context.dispatchEvent=event=>(listeners[event.type] || []).forEach(fn=>fn(event));
    vm.runInContext(fs.readFileSync('app.js','utf8'),context);
    if(page) {
        const scripts=[...fs.readFileSync(page,'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)];
        for(const [,script] of scripts) vm.runInContext(script,context);
    }
    return {context, elements, storage, run:code=>vm.runInContext(code,context),setStock:n=>stock=n,setFailure:v=>failed=v,setRows:r=>rows=r,calls:()=>calls};
}
const item=(keycaps,quantity=1,productId=keycaps.length+'-key-clicker')=>({productId,name:'Test',price:2.49,quantity,options:{keycaps}});
test('repeated keycaps and stock across cart lines, fresh stock on add',async()=>{
 const h=setup(); await h.context.ClickerCart.addItem(item([1,1],2));
 await h.context.ClickerCart.addItem(item([1],3,'1-key-light-up-clicker'));
 assert.equal(h.context.ClickerInventory.available(1),1);
 assert.equal(await h.context.ClickerCart.addItem(item([1,1])),false);
 h.setStock(7); assert.equal(await h.context.ClickerCart.addItem(item([1])),false);
 assert.equal(h.context.ClickerCart.getItems().length,2); assert.equal(h.calls(),4);
});
test('merged lines add exact quantities without stale maxQuantity truncation',async()=>{
 const h=setup(); await h.context.ClickerCart.addItem({...item([1],2),maxQuantity:2});
 await h.context.ClickerCart.addItem({...item([1],2),maxQuantity:2});
 assert.equal(h.context.ClickerCart.getItems()[0].quantity,4);
});
test('serialized simultaneous adds cannot exceed stock',async()=>{
 const h=setup(); h.setStock(1);
 const results=await Promise.all([h.context.ClickerCart.addItem(item([1])),h.context.ClickerCart.addItem(item([1]))]);
 assert.deepEqual(results,[true,false]);
});
test('HTTP, malformed and incomplete inventory block additions, then recover',async()=>{
 const h=setup(); h.setFailure(true);
 assert.equal(await h.context.ClickerCart.addItem(item([1])),false);
 h.setFailure(false); h.setRows([{id:1,stock:10}]);
 assert.equal(await h.context.ClickerCart.addItem(item([1])),false);
 h.setRows(Array.from({length:11},(_,i)=>({id:i+1,stock:i===0?-1:8})));
 assert.equal(await h.context.ClickerCart.addItem(item([1])),false);
 h.setRows(null); assert.equal(await h.context.ClickerCart.addItem(item([1])),true);
});
test('cart plus uses live stock, decreases and removals work offline',async()=>{
 const h=setup(); h.setStock(2); await h.context.ClickerCart.addItem(item([1]));
 const id=h.context.ClickerCart.getItems()[0].cartId;
 await h.run(`changeCartQuantity(${JSON.stringify(id)},1)`);
 assert.equal(h.context.ClickerCart.getItems()[0].quantity,2);
 assert.equal(await h.run(`changeCartQuantity(${JSON.stringify(id)},1)`),false);
 h.setFailure(true); h.run(`changeCartQuantity(${JSON.stringify(id)},-1)`);
 assert.equal(h.context.ClickerCart.getItems()[0].quantity,1);
 h.run(`changeCartQuantity(${JSON.stringify(id)},-1)`); assert.equal(h.context.ClickerCart.getItems().length,0);
});
for(const [i,page] of files.entries()) test(`${page}: existing selectors, prices and live quantity limits`,async()=>{
 const h=setup(page); await h.context.ClickerInventory.refresh();
 h.run('selectSwitch("Clicky")');
 if(i===1) h.run('selectedColor = "Blue"');
 const count=i<2?1:i;
 if(count===1) h.run('selectedKeycap=1'); else h.run(`selectedKeycaps=${JSON.stringify(Array(count).fill(1))}`);
 h.run('updateProduct()');
 assert.equal(h.run('getMaximumQuantity()'),Math.floor(8/count));
 await h.run('addCurrentProductToCart()');
 assert.equal(h.context.ClickerCart.getItems()[0].options.keycaps.length,count);
 assert.equal(h.run('getMaximumQuantity()'),Math.floor((8-count)/count));
 h.setStock(0); await h.run('addCurrentProductToCart()');
 assert.equal(h.context.ClickerCart.getItems()[0].quantity,1);
 assert.equal(h.elements.get('add-to-cart').disabled,true);
 h.setFailure(true); await h.context.ClickerInventory.refresh().catch(()=>{});
 assert.match(h.elements.get('quantity-stock-message').textContent,/Inventory unavailable/);
});
test('network errors and invalid JSON fail closed',async()=>{
 const h=setup(); h.context.fetch=async()=>{throw new Error('Network unavailable');};
 assert.equal(await h.context.ClickerCart.addItem(item([1])),false);
 h.context.fetch=async()=>({ok:true,json:async()=>{throw new SyntaxError('Invalid JSON');}});
 assert.equal(await h.context.ClickerCart.addItem(item([1])),false);
 assert.equal(h.context.ClickerCart.getItems().length,0);
});
test('saved cart from another page is included before adding',async()=>{
 const h=setup(); h.setStock(2);
 h.storage.set('clickerlab_cart',JSON.stringify([item([1],2,'1-key-light-up-clicker')]));
 assert.equal(await h.context.ClickerCart.addItem(item([1])),false);
 assert.equal(h.context.ClickerInventory.available(1),0);
});
test('standard and light-up 1-key products share scarce bases',async()=>{
 const h=setup(); h.context.fetch=async()=>({ok:true,json:async()=>({keycaps:Array.from({length:11},(_,i)=>({id:i+1,stock:100})),bases:Array.from({length:4},(_,i)=>({id:i+1,stock:1}))})});
 assert.equal(await h.context.ClickerCart.addItem(item([1])),true);
 assert.equal(h.context.ClickerInventory.availableBase('1-key-light-up-clicker'),0);
 assert.equal(await h.context.ClickerCart.addItem(item([2],1,'1-key-light-up-clicker')),false);
 assert.equal(await h.context.ClickerCart.addItem(item([1,1],1,'2-key-clicker')),true);
});
test('9-key page counts repeats and cart usage against the new base',async()=>{
 const h=setup('9-key-clicker.html');
 h.context.fetch=async()=>({ok:true,json:async()=>({keycaps:Array.from({length:11},(_,i)=>({id:i+1,stock:20})),bases:[1,2,3,4,9].map(id=>({id,stock:100}))})});
 await h.context.ClickerInventory.refresh();
 h.run('selectSwitch("Clicky"); selectedKeycaps=Array(9).fill(1); updateProduct()');
 assert.equal(h.run('getMaximumQuantity()'),2);
 await h.run('addCurrentProductToCart()');
 assert.equal(h.context.ClickerCart.getItems()[0].options.keycaps.length,9);
 assert.equal(h.context.ClickerInventory.availableBase('9-key-clicker'),99);
 assert.equal(h.run('getMaximumQuantity()'),1);
});
test('absent 9-key base fails closed without breaking existing base inventory',async()=>{
 const h=setup();await h.context.ClickerInventory.refresh();
 assert.equal(h.context.ClickerInventory.ready(),true);
 assert.equal(h.context.ClickerInventory.availableBase('9-key-clicker'),0);
 assert.equal(await h.context.ClickerCart.addItem(item(Array(9).fill(1),1,'9-key-clicker')),false);
});
