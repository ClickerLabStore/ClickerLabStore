const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.CATALOG_URL || 'http://127.0.0.1:8793';
const stocks={12:18,13:13,14:19,15:18,16:5,17:30,18:5,19:7};
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.route('**/api/keycaps',r=>r.fulfill({json:{keycaps:Array.from({length:19},(_,i)=>({id:i+1,name:`Keycap ${i+1}`,stock:stocks[i+1] ?? 100})),bases:[1,2,3,4,9].map(id=>({id,stock:100})),lights:['White','Red','Blue','Yellow','Green'].map((name,i)=>({id:i+1,name,stock:20}))}}));
  // One uploaded-photo fixture and seven missing photos exercise both paths.
  await context.route('**/keycap-12.png*',r=>r.fulfill({path:path.resolve('keycap-1.png'),contentType:'image/png'}));
  for(const id of [13,14,15,16,17,18,19])await context.route(`**/keycap-${id}.png*`,r=>r.fulfill({status:404,body:'Awaiting owner upload fixture'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const product of [...[1,2,3,4,9].map(n=>`${n}-key-clicker`),...[1,2,3,4].map(n=>`${n}-key-light-up-clicker`)]){
   await page.goto(`${base}/${product}.html`);await page.waitForFunction(()=>window.ClickerInventory?.ready());
   const slot=page.locator('.keycap-selector,.keycap-slot').first();await slot.click();
   assert.equal(await page.locator('.keycap-option').count(),19);
   assert.match(await page.locator('.keycap-option.keycap-19 .stock-badge').textContent(),/7 available/);
   await page.waitForFunction(()=>document.querySelector('.keycap-option.keycap-12 img').naturalWidth>0);
   assert.equal(new URL(await page.locator('.keycap-option.keycap-12 img').getAttribute('src'),base).pathname,'/keycap-12.png');
   assert.match(await page.locator('.keycap-option.keycap-12 img').getAttribute('src'),/[?&]v=d068fb4/);
   await page.locator('.keycap-option.keycap-19').click();
   assert.match(await slot.textContent(),/Keycap 19/);
   await page.waitForFunction(()=>[...document.querySelectorAll('.keycap-selector img,.keycap-slot img')].some(i=>i.getAttribute('src')==='/keycap-photo-coming-soon.svg'&&i.naturalWidth>0));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.goto(`${base}/build.html?from=click-rhythm&keys=12,13,18,19&switch=Creamy`);
  await page.waitForFunction(()=>window.ClickerInventory?.ready());assert.equal(await page.locator('[data-step="4"]').isVisible(),true);
  await page.locator('.builder-slot').first().click();assert.equal(await page.locator('.bundle-picker-option').count(),19);
  await page.getByRole('button',{name:'Keycap 17, 30 available',exact:true}).click();
  await page.locator('#builder-next:not([disabled])').click();await page.getByText('Your custom clicker was added to the cart.',{exact:true}).waitFor();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('clickerlab_cart')));assert.deepEqual(cart[0].options.keycaps,[17,13,18,19]);
  await page.goto(`${base}/bundle-details.html?bundle=starter-pack`);await page.waitForFunction(()=>window.ClickerInventory?.ready());
  const slots=page.locator('.bundle-keycap');assert.equal(await slots.count(),5);
  for(let i=0;i<5;i++){await slots.nth(i).click();assert.equal(await page.locator('.bundle-picker-option').count(),19);await page.getByRole('button',{name:new RegExp(`^Keycap 12, ${18-i} available$`)}).click();}
  await page.locator('#bundle-add').click();await page.getByText('Bundle added to your cart.',{exact:true}).waitFor();
  const bundle=await page.evaluate(()=>JSON.parse(localStorage.getItem('clickerlab_cart')).at(-1));assert.deepEqual(bundle.options.clickers.flatMap(c=>c.keycaps),[12,12,12,12,12]);
  await page.goto(`${base}/click-rhythm.html`);await page.locator('[data-cat-choice="0"]').click();assert.equal(await page.locator('[data-picker-cat]').count(),19);await page.locator('[data-picker-cat="19"]').click();
  await page.locator('#beat-build').click();await page.locator('[data-step="4"]').waitFor({state:'visible'});assert.match(await page.locator('.builder-slot').first().textContent(),/Keycap 19/);
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: new keycaps on all 9 products, accurate stock, upload/placeholder paths, builder/cart, repeated bundle selections, and game-to-builder handoff`);
  await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
