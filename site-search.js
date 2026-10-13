(() => {
 function initializeSearch(){
  const trigger=document.getElementById('search-button');if(!trigger)return;
  trigger.setAttribute('aria-label','Search products');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','site-search');
  const dialog=document.createElement('dialog');dialog.id='site-search';dialog.className='site-search';dialog.setAttribute('aria-labelledby','site-search-title');
  dialog.innerHTML='<div class="site-search-heading"><h2 id="site-search-title">Find your clicker</h2><button type="button" class="site-search-close" aria-label="Close search">×</button></div><form class="site-search-form" role="search"><label for="site-search-query">Search products, bundles, and more</label><input id="site-search-query" type="search" placeholder="Try 3 key, light up, or Trio Lab" autocomplete="off" maxlength="120"><button type="submit">Search</button></form><p class="site-search-status" role="status" aria-live="polite"></p><div class="site-search-results"></div><button type="button" class="site-search-retry" hidden>Try again</button>';
  document.body.appendChild(dialog);
  const input=dialog.querySelector('input'),status=dialog.querySelector('.site-search-status'),results=dialog.querySelector('.site-search-results'),retry=dialog.querySelector('.site-search-retry');
  let catalog=null,loading=null;
  const normalize=value=>value.toLowerCase().replace(/lightup/g,'light up').replace(/(\d)([a-z])/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim();
  const text=(node,selector)=>node.querySelector(selector)?.textContent.replace(/\s+/g,' ').trim() || '';
  function localURL(raw,base){if(!raw)return null;const url=new URL(raw,base);return url.origin===location.origin && ['http:','https:'].includes(url.protocol)?url:null;}
  async function readListing(path,cardSelector){
   const response=await fetch(path,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Search listing unavailable');
   const doc=new DOMParser().parseFromString(await response.text(),'text/html'),base=new URL(path,location.href);
   const cards=[...doc.querySelectorAll(cardSelector)];if(!cards.length)throw new Error('Search listing empty');
   return cards.map(card=>{
    const link=localURL(card.querySelector('.product-button,.bundle-button')?.getAttribute('href'),base);
    const photo=localURL(card.querySelector('.product-image img,.bundle-image img')?.getAttribute('src'),base);
    const title=text(card,'h2'),price=text(card,'.product-price,.bundle-price'),description=text(card,'.product-description,.bundle-items');
    if(!link || !title || !price)throw new Error('Search listing incomplete');
    return {title,price,description,href:link.pathname+link.search,image:photo?.pathname,keywords:normalize(title+' '+description+' '+text(card,'.included-list')+' '+(card.matches('.bundle-card')?'bundle set pack':'clicky creamy keycaps customizable'))};
   });
  }
  function render(){
   if(!catalog)return;
   const terms=normalize(input.value).split(' ').filter(Boolean),matches=catalog.filter(item=>terms.every(term=>item.keywords.includes(term)));
   results.replaceChildren();status.textContent=terms.length?`${matches.length} result${matches.length===1?'':'s'}`:'Explore clickers, bundles, and more';
   if(!matches.length){const empty=document.createElement('p');empty.className='site-search-empty';empty.textContent='No matches. Try a key count, “light up”, or “bundle”.';results.appendChild(empty);return;}
   for(const item of matches){
    const link=document.createElement('a');link.className='site-search-result';link.href=item.href;
    if(item.image){const img=document.createElement('img');img.src=item.image;img.alt='';img.loading='lazy';img.addEventListener('error',()=>{img.hidden=true;});link.appendChild(img);}
    const info=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('span');title.textContent=item.title;detail.textContent=item.price || item.description;info.append(title,detail);link.appendChild(info);results.appendChild(link);
   }
  }
  async function load(){
   if(catalog){render();return;}if(loading)return loading;
   status.textContent='Loading products…';retry.hidden=true;
   loading=(async()=>{
    try{
     const listings=await Promise.all([readListing('/shop.html','.product-card'),readListing('/bundles.html','.bundle-card')]);
     const pages=[['Build Your Own','Choose keys, switches, and keycaps','/build.html','custom customize customisation customization keycaps clicky creamy'],['FAQ','Answers to common questions','/faq.html','shipping delivery prebuilt questions'],['About ClickerLabStore','Get to know ClickerLabStore','/about.html','about story'],['Click Rhythm','Play our clicker rhythm game','/click-rhythm.html','game play music rhythm']];
     catalog=[...listings.flat(),...pages.map(([title,description,href,keywords])=>({title,description,href,keywords:normalize(title+' '+description+' '+keywords)}))];render();
    }catch{results.replaceChildren();status.textContent='Search could not load. Please try again.';retry.hidden=false;}
    finally{loading=null;}
   })();return loading;
  }
  trigger.addEventListener('click',()=>{if(!dialog.open)dialog.showModal();input.focus();load();});
  dialog.querySelector('.site-search-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>trigger.focus());
  dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();if(catalog)render();else load();});
  input.addEventListener('input',render);retry.addEventListener('click',load);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeSearch);else initializeSearch();
})();
