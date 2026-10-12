(() => {
 const camera='<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 13h10l3-5h8l3 5h10v27H7z"/><circle cx="24" cy="26" r="9"/></svg>';
 document.querySelectorAll('.product-photo,.bundle-detail-photo').forEach(photo=>{
  const main=photo.querySelector('img');if(!main || photo.closest('.product-gallery'))return;
  const gallery=document.createElement('div');gallery.className='product-gallery';
  photo.before(gallery);gallery.appendChild(photo);
  const original={src:main.getAttribute('src'),alt:main.alt};
  const url=new URL(original.src,location.href);
  const secondary=photo.dataset.gallerySecond || url.pathname.replace(/\.[^/.]+$/,'-2.png');
  const placeholder=document.createElement('div');placeholder.className='product-gallery-placeholder';placeholder.hidden=true;
  placeholder.setAttribute('role','img');placeholder.setAttribute('aria-label',`${original.alt}: second photo coming soon`);
  placeholder.innerHTML=camera+'<strong>Photo 2 coming soon</strong><span>Another look at your clicker</span>';photo.appendChild(placeholder);
  // Preserve the main photo and its existing missing-image handler.
  const second=document.createElement('img');second.alt=`${original.alt}, second view`;second.hidden=true;photo.appendChild(second);
  const thumbnails=document.createElement('div');thumbnails.className='product-gallery-thumbnails';thumbnails.setAttribute('role','group');thumbnails.setAttribute('aria-label','Product photos');gallery.appendChild(thumbnails);
  const firstButton=document.createElement('button');firstButton.type='button';firstButton.className='product-gallery-thumb';firstButton.setAttribute('aria-label',`Show main photo of ${original.alt}`);
  const firstThumb=document.createElement('img');firstThumb.src=original.src;firstThumb.alt='';firstButton.appendChild(firstThumb);
  const secondButton=document.createElement('button');secondButton.type='button';secondButton.className='product-gallery-thumb';secondButton.setAttribute('aria-label',`Show second photo of ${original.alt}`);secondButton.innerHTML=camera+'<span>Photo 2</span>';
  const count=document.createElement('span');count.className='product-gallery-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');
  thumbnails.append(firstButton,secondButton,count);
  let selected=0,loaded=false,attempted=false;
  const existingFallbacks=[...photo.children].filter(child=>child!==main && child!==placeholder && child!==second);
  const originalHidden=new Map(existingFallbacks.map(child=>[child,child.hidden]));
  function show(index){
   selected=index;firstButton.setAttribute('aria-pressed',String(index===0));secondButton.setAttribute('aria-pressed',String(index===1));count.textContent=`${index+1} / 2`;
   main.hidden=index!==0 || !main.complete || main.naturalWidth===0;
   existingFallbacks.forEach(child=>{child.hidden=index===1 || originalHidden.get(child);});
   second.hidden=index!==1 || !loaded;placeholder.hidden=index!==1 || loaded;
   if(index===1 && !attempted){attempted=true;second.src=secondary;}
  }
  second.addEventListener('load',()=>{
   loaded=true;const thumb=document.createElement('img');thumb.src=secondary;thumb.alt='';secondButton.replaceChildren(thumb);show(selected);
  });
  second.addEventListener('error',()=>{loaded=false;show(selected);});
  main.addEventListener('load',()=>{if(selected===0)main.hidden=false;});
  main.addEventListener('error',()=>{
   existingFallbacks.forEach(child=>{originalHidden.set(child,child.hidden);if(selected===1)child.hidden=true;});
  });
  firstButton.addEventListener('click',()=>show(0));secondButton.addEventListener('click',()=>show(1));
  thumbnails.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?1:1-selected;show(index);(index===0?firstButton:secondButton).focus();
  });
  // Do not hide the existing image while it is still loading.
  firstButton.setAttribute('aria-pressed','true');secondButton.setAttribute('aria-pressed','false');count.textContent='1 / 2';
  // Known uploaded photos get a real thumbnail immediately; empty slots stay lazy.
  if(photo.dataset.gallerySecond){attempted=true;second.src=secondary;}
 });
})();
