const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.GALLERY_URL || 'http://127.0.0.1:8791';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const pages=[...[1,2,3,4,9].map(n=>`${n}-key-clicker.html`),...[1,2,3,4].map(n=>`${n}-key-light-up-clicker.html`),...['starter-pack','starter-lab','clicker-trio','trio-lab','clickerlab-pack'].map(b=>`bundle-details.html?bundle=${b}`)];
 const inventory={keycaps:Array.from({length:11},(_,i)=>({id:i+1,name:`Keycap ${i+1}`,stock:100})),bases:[1,2,3,4,9].map(id=>({id,stock:100})),lights:['White','Red','Blue','Yellow','Green'].map((name,i)=>({id:i+1,name,stock:20}))};
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.route('**/api/keycaps',route=>route.fulfill({json:inventory}));
  await context.route('**/*-2.png',route=>route.fulfill({status:404,body:'Not found fixture'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const product of pages){
   await page.goto(base+'/'+product);
   await page.waitForFunction(()=>document.querySelector('.product-gallery')?.querySelector('img')?.naturalWidth>0);
   const gallery=page.locator('.product-gallery'),buttons=gallery.getByRole('button');
   assert.equal(await buttons.count(),2);const original=await gallery.locator('.product-photo>img,.bundle-detail-photo>img').first().getAttribute('src');
   const title=await page.locator('h1').textContent();
   await buttons.nth(1).click();assert.equal(await gallery.locator('.product-gallery-placeholder').isVisible(),true);
   assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'true');
   assert.equal(await gallery.locator('.product-gallery-count').textContent(),'2 / 2');
   await page.keyboard.press('ArrowLeft');
   assert.equal(await gallery.locator('.product-gallery-placeholder').isVisible(),false);
   assert.equal(await gallery.locator('.product-photo>img,.bundle-detail-photo>img').first().getAttribute('src'),original);
   assert.equal(await gallery.locator('.product-photo>img,.bundle-detail-photo>img').first().isVisible(),true);
   assert.equal(await page.locator('h1').textContent(),title);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(product==='4-key-clicker.html'){
    await buttons.nth(1).click();await page.screenshot({path:`/tmp/product-gallery-${width}.png`,fullPage:true});
    assert.equal(await page.locator('.switch-option').count(),2);
    await page.locator('.switch-option').first().click();assert.equal(await page.locator('.switch-option.selected').count(),1);
   }
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: all 14 products, placeholder switching, keyboard navigation, preserved main images and controls, no overflow/errors`);
  await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage();
 await context.route('**/api/keycaps',r=>r.fulfill({json:inventory}));
 await context.route('**/4-key-clicker-2.png',r=>r.fulfill({path:path.resolve('4-key-clicker.png'),contentType:'image/png'}));
 await page.goto(base+'/4-key-clicker.html');
 await page.getByRole('button',{name:'Show second photo of 4-Key Clicker',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.product-photo>img:nth-of-type(2)')?.naturalWidth>0);
 assert.equal(await page.locator('.product-gallery-placeholder').isVisible(),false);
 assert.equal(await page.locator('.product-photo>img').nth(1).isVisible(),true);
 await page.getByRole('button',{name:'Show main photo of 4-Key Clicker',exact:true}).click();
 assert.equal(await page.locator('.product-photo>img').first().isVisible(),true);
 console.log('PASS: an available second image replaces the placeholder and restores the main image');
 await context.route('**/1-key-light-up-clicker.png',r=>r.fulfill({status:404,body:'Unavailable primary fixture'}));
 await context.route('**/1-key-light-up-clicker-2.png',r=>r.fulfill({status:404,body:'Unavailable secondary fixture'}));
 await page.goto(base+'/1-key-light-up-clicker.html');
 await page.getByText('Product Photo Coming Soon',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Show second photo of 1-Key Light Up Clicker',exact:true}).click();
 await page.getByRole('button',{name:'Show main photo of 1-Key Light Up Clicker',exact:true}).click();
 assert.equal(await page.getByText('Product Photo Coming Soon',{exact:true}).isVisible(),true);
 assert.equal(await page.locator('.product-gallery-placeholder').isVisible(),false);
 console.log('PASS: original light-up photo fallback survives gallery switching');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
