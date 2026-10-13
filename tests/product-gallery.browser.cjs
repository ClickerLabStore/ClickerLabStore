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
  await context.route('**/*-key-top-view-clicker.png',route=>route.fulfill({status:404,body:'Not found fixture'}));
  await context.route('**/*-key-light-up-clicker-top-view.png',route=>route.fulfill({status:404,body:'Not found fixture'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const product of pages){
   await page.goto(base+'/'+product);
   await page.waitForFunction(()=>document.querySelector('.product-gallery')?.querySelector('img')?.naturalWidth>0);
   const gallery=page.locator('.product-gallery'),buttons=gallery.getByRole('button');
   const light=product.includes('-light-up-clicker');const total=light?4:2;assert.equal(await buttons.count(),total);const original=await gallery.locator('.product-photo>img,.bundle-detail-photo>img').first().getAttribute('src');
   const title=await page.locator('h1').textContent();
   const selected=total-1;await buttons.nth(selected).click();assert.equal(await gallery.locator('.product-gallery-placeholder').last().isVisible(),true);
   assert.equal(await buttons.nth(selected).getAttribute('aria-pressed'),'true');
   assert.equal(await gallery.locator('.product-gallery-count').textContent(),`${total} / ${total}`);
   await page.keyboard.press('ArrowLeft');
   assert.equal(await buttons.nth(selected-1).getAttribute('aria-pressed'),'true');
   await page.keyboard.press('Home');
   assert.equal(await gallery.locator('.product-gallery-placeholder:visible').count(),0);
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
 await context.route('**/4-key-top-view-clicker.png',r=>r.fulfill({path:path.resolve('4-key-clicker.png'),contentType:'image/png'}));
 await page.goto(base+'/4-key-clicker.html');
 await page.getByRole('button',{name:'Show second photo of 4-Key Clicker',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.product-photo>img:nth-of-type(2)')?.naturalWidth>0 && !document.querySelector('.product-photo>img:nth-of-type(2)').hidden);
 assert.equal(await page.locator('.product-gallery-placeholder:visible').count(),0);
 assert.equal(await page.locator('.product-photo>img').nth(1).isVisible(),true);
 await page.getByRole('button',{name:'Show main photo of 4-Key Clicker',exact:true}).click();
 assert.equal(await page.locator('.product-photo>img').first().isVisible(),true);
 console.log('PASS: an available second image replaces the placeholder and restores the main image');
 await context.route('**/1-key-dark-light-up-clicker.png',r=>r.fulfill({status:404,body:'Unavailable primary fixture'}));
 await context.route('**/1-key-light-up-clicker-2.png',r=>r.fulfill({status:404,body:'Unavailable secondary fixture'}));
 await page.goto(base+'/1-key-light-up-clicker.html');
 await page.getByText('Product Photo Coming Soon',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Show second photo of 1-Key Light Up Clicker',exact:true}).click();
 await page.getByRole('button',{name:'Show main photo of 1-Key Light Up Clicker',exact:true}).click();
 assert.equal(await page.getByText('Product Photo Coming Soon',{exact:true}).isVisible(),true);
 assert.equal(await page.locator('.product-gallery-placeholder:visible').count(),0);
 console.log('PASS: original light-up photo fallback survives gallery switching');
 for(const width of [1440,390]){
  const liveContext=await browser.newContext({viewport:{width,height:1000}});
  await liveContext.route('**/api/keycaps',r=>r.fulfill({json:inventory}));const live=await liveContext.newPage();
  for(const size of [1,2,3,4]){
   await live.goto(`${base}/${size}-key-light-up-clicker.html`);
   const buttons=live.locator('.product-gallery-thumb');
   await live.waitForFunction(()=>[...document.querySelectorAll('.product-gallery-thumb img')].length===4 && [...document.querySelectorAll('.product-gallery-thumb img')].every(i=>i.naturalWidth>0));
   const expected=[`${size}-key-dark-light-up-clicker.png`,`${size}-key-light-up-clicker.png`,`${size}-key-light-up-clicker-2.png`,`${size}-key-light-up-clicker-top-view.png`];
   for(let i=0;i<4;i++){
    await buttons.nth(i).click();const image=live.locator('.product-photo>img').nth(i);await image.waitFor({state:'visible'});
    assert.equal((await image.getAttribute('src')).split('/').at(-1),expected[i]);
    assert.equal(await live.locator('.product-gallery-placeholder:visible').count(),0);
    assert.equal(await live.locator('.product-gallery-count').textContent(),`${i+1} / 4`);
   }
   await live.keyboard.press('ArrowRight');assert.equal(await buttons.nth(0).getAttribute('aria-pressed'),'true');
   await live.keyboard.press('End');assert.equal(await buttons.nth(3).getAttribute('aria-pressed'),'true');
   assert.ok(await live.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  console.log(`PASS ${width}px: all four LIGHT UP galleries show dark/main, original/second, existing/third and uploaded top-view/fourth with real images`);
  await liveContext.close();
 }
 for(const width of [1440,390]){
  const standard=await browser.newContext({viewport:{width,height:1000}});
  await standard.route('**/api/keycaps',r=>r.fulfill({json:inventory}));const p=await standard.newPage();
  for(const size of [1,2,3,4]){
   await p.goto(`${base}/${size}-key-clicker.html`);
   await p.waitForFunction(()=>document.querySelectorAll('.product-gallery-thumb img').length===2 && [...document.querySelectorAll('.product-gallery-thumb img')].every(i=>i.naturalWidth>0));
   await p.locator('.product-gallery-thumb').nth(1).click();
   const second=p.locator('.product-photo>img').nth(1);assert.equal(await second.isVisible(),true);
   assert.equal(await second.getAttribute('src'),`/${size}-key-top-view-clicker.png`);
   assert.equal(await p.locator('.product-gallery-placeholder:visible').count(),0);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.locator('.product-gallery-thumb').first().click();assert.equal(await p.locator('.product-photo>img').first().isVisible(),true);
  }
  console.log(`PASS ${width}px: four actual standard clicker top-view photos load second; original main photos preserved`);await standard.close();
 }
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
