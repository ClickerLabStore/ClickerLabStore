const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert=require('node:assert/strict');
const base=process.env.CART_URL || 'http://127.0.0.1:8793';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const [width,height] of [[1440,900],[390,844],[390,600]]){
  const context=await browser.newContext({viewport:{width,height}});
  const item={cartId:'fixture-item',productId:'1-key-clicker',name:'1-Key Clicker',price:2.49,quantity:1,image:'/1-key-clicker.png',options:{switchType:'Clicky',keycaps:[8]}};
  await context.addInitScript(item=>localStorage.setItem('clickerlab_cart',JSON.stringify([item])),item);
  await context.route('**/api/keycaps',r=>r.fulfill({json:{keycaps:Array.from({length:11},(_,i)=>({id:i+1,stock:100})),bases:[1,2,3,4,9].map(id=>({id,stock:100})),lights:['White','Red','Blue','Yellow','Green'].map((name,i)=>({id:i+1,name,stock:20}))}}));
  let shippingCalls=0,checkoutCalls=0;
  await context.route('**/api/shipping-rates',r=>{shippingCalls++;const body=r.request().postDataJSON();assert.equal(body.address.country,'US');assert.equal(body.address.zip,'91108');return r.fulfill({json:{quoteId:'fixture-quote',rates:[{id:'fixture-rate',service:'USPS Ground Advantage',amount:595}]}});});
  await context.route('**/api/checkout',r=>{checkoutCalls++;return r.fulfill({status:503,json:{error:'Fixture stops payment'}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/');await page.locator('#cart-button').click();
  const details=page.locator('#clicker-shipping-details'),footer=page.locator('.clicker-cart-footer'),items=page.locator('#clicker-cart-items');
  assert.equal(await details.evaluate(e=>e.open),false);
  assert.equal(await page.locator('#clicker-cart-subtotal').textContent(),'$2.49');
  const itemRect=await items.boundingBox(),footRect=await footer.boundingBox();assert.ok(itemRect.height>height*.5);assert.ok(footRect.height<190);
  await page.screenshot({path:`/tmp/cart-compact-${width}-${height}.png`});
  await page.locator('.clicker-cart-quantity button').last().click();await page.waitForFunction(()=>document.getElementById('clicker-cart-subtotal').textContent==='$4.98');
  await page.locator('.clicker-cart-quantity button').first().click();assert.equal(await page.locator('#clicker-cart-subtotal').textContent(),'$2.49');
  await page.locator('#clicker-cart-checkout').click();assert.equal(await details.evaluate(e=>e.open),true);assert.equal(checkoutCalls,0);
  const form=page.locator('#clicker-shipping-form');for(const [name,value] of Object.entries({name:'Test Customer',street1:'2085 San Marino Ave',city:'San Marino',state:'CA',zip:'91108'}))await form.locator(`[name="${name}"]`).fill(value);
  await page.locator('#clicker-get-shipping').click();await page.locator('#clicker-shipping-choice').waitFor();assert.equal(shippingCalls,1);assert.equal(await page.locator('#clicker-shipping-rate').inputValue(),'fixture-rate');assert.match(await page.locator('#clicker-shipping-rate option').textContent(),/\$5.95/);
  await details.locator('summary').click();assert.equal(await details.evaluate(e=>e.open),false);await details.locator('summary').click();assert.equal(await form.locator('[name="zip"]').inputValue(),'91108');
  await form.locator('[name="zip"]').fill('91109');assert.equal(await page.locator('#clicker-shipping-choice').isVisible(),false);
  await details.locator('summary').click();await page.locator('.clicker-cart-remove').click();assert.equal(await page.locator('#clicker-cart-subtotal').textContent(),'$0.00');assert.equal(await page.locator('#clicker-cart-checkout').isDisabled(),true);
  assert.ok(await page.locator('.clicker-cart-drawer').evaluate(e=>e.scrollWidth<=e.clientWidth));assert.deepEqual(errors,[]);
  console.log(`PASS ${width}x${height}: compact footer gives items over half the screen; quantities, shipping expansion/quote/address changes, and removal work without payment calls`);await context.close();
 }
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
