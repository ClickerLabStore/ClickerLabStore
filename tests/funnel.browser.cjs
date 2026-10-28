const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
for(const width of [1440,390]){const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),events=[],checkout=[],errors=[];let shippingFails=true;
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
await page.route('https://checkout.stripe.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Mock checkout — no real payment</h1>'}));
await page.route('https://store.test/**',r=>{const p=new URL(r.request().url()).pathname;
if(p==='/api/funnel'){events.push(...r.request().postDataJSON().events);return r.fulfill({status:204});}
if(p==='/api/keycaps')return r.fulfill({json:{keycaps:Array.from({length:19},(_,i)=>({id:i+1,name:'Keycap '+(i+1),stock:50})),bases:[1,2,3,4,9].map(id=>({id,stock:50})),lights:['White','Red','Blue','Yellow','Green'].map((name,i)=>({id:i+1,name,stock:20}))}});
if(p==='/api/shipping-rates')return r.fulfill(shippingFails?{status:502,json:{error:'Mock shipping unavailable'}}:{json:{quoteId:'11111111-1111-4111-8111-111111111111',rates:[{id:'a'.repeat(32),amount:525,service:'USPS Ground Advantage'}]}});
if(p==='/api/checkout'){checkout.push(r.request().postDataJSON());return r.fulfill({json:{url:'https://checkout.stripe.com/c/pay/mock'}});}
if(p.startsWith('/api/'))return r.fulfill({status:404,json:{}});
const file=path.join(process.cwd(),p);if(!fs.existsSync(file)||!fs.statSync(file).isFile())return r.fulfill({status:404,body:''});return r.fulfill({path:file,contentType:p.endsWith('.html')?'text/html':p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'image/png'});
});
await page.goto('https://store.test/shop.html',{waitUntil:'domcontentloaded'});await page.evaluate(()=>window.ClickerFunnel.flush());
await page.goto('https://store.test/1-key-clicker.html',{waitUntil:'domcontentloaded'});
await page.evaluate(()=>window.ClickerCart.addItem({productId:'1-key-clicker',name:'1-Key Clicker',price:2.49,quantity:1,maxQuantity:50,options:{switchType:'Clicky',keycaps:[1]}}));
await page.locator('#clicker-cart-checkout').click();await page.locator('#clicker-shipping-details[open]').waitFor();
for(const [name,value] of Object.entries({name:'Fixture Buyer',street1:'123 Test St',city:'San Marino',state:'CA',zip:'91108'}))await page.locator('#clicker-shipping-form [name='+name+']').fill(value);
await page.locator('#clicker-get-shipping').click();await page.getByText('Mock shipping unavailable',{exact:true}).waitFor();
shippingFails=false;await page.locator('#clicker-get-shipping').click();await page.locator('#clicker-shipping-choice:not([hidden])').waitFor();
await page.locator('#clicker-cart-checkout').click();await page.waitForURL('https://checkout.stripe.com/**');
for(const step of ['page_view','add_to_cart','cart_open','checkout_blocked','shipping_requested','shipping_error','shipping_quoted','checkout_requested','checkout_redirect'])assert.ok(events.some(e=>e.event===step),'Missing '+step);
assert.match(checkout[0].analyticsSession,/^[0-9a-f-]{36}$/);assert.equal(checkout[0].analyticsSession,checkout.at(-1).analyticsSession);assert.ok(!JSON.stringify(events).includes('Fixture Buyer'));assert.ok(!JSON.stringify(events).includes('123 Test St'));assert.deepEqual(errors,[]);console.log('PASS',width,'shopping flow, errors, redirect, and private-data exclusion');await context.close();}
await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
