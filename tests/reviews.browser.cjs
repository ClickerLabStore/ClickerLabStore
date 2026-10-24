const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert=require('node:assert/strict');
const base=process.env.REVIEWS_URL || 'http://127.0.0.1:8794';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',()=>errors.push('Unexpected script execution'));
  await page.goto(base+'/1-key-clicker.html#reviews');
  await page.locator('.reviews-entry').first().waitFor();assert.equal(await page.locator('#reviews-preview-banner').count(),1);
  assert.ok(await page.getByLabel('2 out of 5 stars',{exact:true}).count()>0);
  const initial=await page.evaluate(()=>fetch('/api/reviews?product=1-key-clicker').then(r=>r.json()));
  const demo=await page.evaluate(()=>fetch('/api/reviews/demo').then(r=>r.json()));const existed=demo.items.find(i=>i.id==='1-key-clicker').review;
  await page.getByRole('link',{name:'Try a demo review',exact:true}).click();
  await page.locator('#verified-review-form').waitFor({state:'visible'});assert.ok(page.url().includes('#token='));assert.ok(!page.url().includes('session='));
  assert.equal(await page.locator('select[name="productId"]').inputValue(),'1-key-clicker');
  await page.getByLabel('2 stars',{exact:true}).check();await page.getByLabel('Public name or nickname',{exact:true}).fill('Preview visitor');
  const body='A two-star demo review. <img src=x onerror=alert(1)> The sound was louder than I expected.';
  await page.locator('textarea[name="body"]').fill(body);await page.getByRole('button',{name:/Publish review|Update review/}).click();
  await page.getByText('Demo review published. It is clearly labeled as a demo.',{exact:true}).waitFor();
  const after=await page.evaluate(()=>fetch('/api/reviews?product=1-key-clicker').then(r=>r.json()));assert.equal(after.count,initial.count+(existed?0:1));
  const link=page.url();await page.reload();await page.locator('#verified-review-form').waitFor({state:'visible'});assert.equal(await page.locator('textarea[name="body"]').inputValue(),body);
  await page.getByLabel('1 star',{exact:true}).check();await page.getByRole('button',{name:'Update review',exact:true}).click();await page.getByText('Demo review published. It is clearly labeled as a demo.',{exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>fetch('/api/reviews?product=1-key-clicker').then(r=>r.json()))).count,after.count);
  await page.locator('#review-product-link').click();await page.locator('.reviews-entry').first().waitFor();
  const own=page.locator('.reviews-entry').filter({has:page.getByText('Preview visitor',{exact:true})});assert.equal(await own.count(),1);assert.equal(await own.getByLabel('1 out of 5 stars',{exact:true}).count(),1);
  assert.equal(await own.locator('.reviews-body').textContent(),body);assert.equal(await own.locator('img').count(),0);assert.equal(await own.getByText('Verified purchase',{exact:true}).count(),1);assert.equal(await own.getByText('Demo example',{exact:true}).count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#reviews').screenshot({path:`/tmp/verified-reviews-${width}.png`});
  await page.goto(link);await page.locator('#verified-review-form').waitFor({state:'visible'});await page.locator('.review-page').screenshot({path:`/tmp/verified-review-form-${width}.png`});
  const anonymous=await context.newPage();await anonymous.goto(base+'/review.html');await anonymous.getByText(/Use the private review link on your payment confirmation/).waitFor();assert.equal(await anonymous.locator('#verified-review-form').isVisible(),false);
  await anonymous.goto(base+'/bundle-details.html?bundle=trio-lab');await anonymous.getByText('No reviews yet',{exact:true}).waitFor();assert.equal(await anonymous.locator('#reviews').count(),1);
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: published negative verified review, one-vote editing, private link reload, safe plain text, demo labeling, unauthorized form, bundle reviews and layout`);await context.close();
 }
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
