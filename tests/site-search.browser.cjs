const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert=require('node:assert/strict');
const base=process.env.SEARCH_URL || 'http://127.0.0.1:8793';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/api/keycaps',r=>r.fulfill({status:503,json:{error:'Inventory fixture unavailable'}}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await page.locator('#search-button').click();
  const dialog=page.getByRole('dialog'),input=dialog.getByLabel('Search products, bundles, and more');
  await dialog.locator('.site-search-result').nth(17).waitFor();
  assert.equal(await dialog.locator('.site-search-result').count(),18);
  assert.equal(await input.evaluate(el=>document.activeElement===el),true);
  await input.fill('lightup');assert.equal(await dialog.locator('.site-search-result').count(),4);
  await input.fill('3key');assert.ok(await dialog.getByRole('link',{name:'3-Key Clicker $5.99',exact:true}).isVisible());
  await input.fill('Trio Lab');const trio=dialog.getByRole('link',{name:'Trio Lab $12.49',exact:true});assert.equal(await trio.getAttribute('href'),'/bundle-details.html?bundle=trio-lab');
  await input.press('Enter');assert.equal(await dialog.isVisible(),true);
  await input.fill('<img src=x onerror=alert(1)>');assert.equal(await dialog.locator('.site-search-result').count(),0);assert.equal(await dialog.locator('.site-search-empty').isVisible(),true);assert.equal(await dialog.locator('img[src="x"]').count(),0);
  await input.fill('');assert.equal(await dialog.locator('.site-search-result').count(),18);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth));
  const rect=await dialog.boundingBox();assert.ok(Math.abs(rect.x+rect.width/2-width/2)<2);
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await page.locator('#search-button').evaluate(el=>document.activeElement===el),true);
  await page.locator('#search-button').click();await dialog.getByRole('button',{name:'Close search'}).click();assert.equal(await dialog.isVisible(),false);
  await context.route('**/shop.html',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.goto(base+'/about.html');await page.locator('#search-button').click();await page.getByText('Search could not load. Please try again.',{exact:true}).waitFor();
  await context.unroute('**/shop.html');await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('.site-search-result').nth(17).waitFor();
  await page.locator('#site-search-query').fill('9 key');await page.getByRole('link',{name:/^9-Key Clicker/}).click();await page.waitForURL('**/9-key-clicker.html');
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: catalog, photos/prices, aliases, bundle link, keyboard, empty results, safe input, retry, product navigation and no overflow/errors`);
  await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage();
 await context.route('**/api/keycaps',r=>r.fulfill({status:503,json:{error:'Inventory fixture unavailable'}}));
 const pages=['shop.html','bundles.html','bundle-details.html?bundle=trio-lab','build.html','faq.html','about.html','click-rhythm.html',...[1,2,3,4,9].map(n=>`${n}-key-clicker.html`),...[1,2,3,4].map(n=>`${n}-key-light-up-clicker.html`)];
 for(const path of pages){await page.goto(base+'/'+path);await page.locator('#search-button').click();await page.locator('.site-search-result').nth(17).waitFor();await page.keyboard.press('Escape');}
 console.log('PASS: search opens and loads on every page with the navbar search button');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
