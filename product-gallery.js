(() => {
 const camera='<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 13h10l3-5h8l3 5h10v27H7z"/><circle cx="24" cy="26" r="9"/></svg>';
 document.querySelectorAll('.product-photo,.bundle-detail-photo').forEach(photo=>{
  const main=photo.querySelector('img');if(!main || photo.closest('.product-gallery'))return;
  const gallery=document.createElement('div');gallery.className='product-gallery';photo.before(gallery);gallery.appendChild(photo);
  const original={src:main.getAttribute('src'),alt:main.alt};
  const existingFallbacks=[...photo.children].filter(child=>child!==main);
  const originalHidden=new Map(existingFallbacks.map(child=>[child,child.hidden]));
  const url=new URL(original.src,location.href);
  const paths=[original.src,photo.dataset.gallerySecond || url.pathname.replace(/\.[^/.]+$/,'-2.png')];
  if(photo.dataset.galleryThird)paths.push(photo.dataset.galleryThird);
  const names=['main','second','third'];let selected=0;
  function blendDarkPhoto(image,src){
   if(!/\/[1-4]-key-(?:dark-light-up-clicker|light-up-clicker-2)\.png$/.test(new URL(src,location.href).pathname))return;
   image.classList.add('product-gallery-dark-image');
   const size=()=>{if(!image.naturalWidth)return;const ratio=image.naturalWidth/image.naturalHeight;image.style.setProperty('--photo-width',`${Math.min(1,ratio)*100}%`);image.style.setProperty('--photo-height',`${Math.min(1,1/ratio)*100}%`);};
   image.addEventListener('load',size);size();
  }
  const thumbnails=document.createElement('div');thumbnails.className='product-gallery-thumbnails';thumbnails.setAttribute('role','group');thumbnails.setAttribute('aria-label','Product photos');gallery.appendChild(thumbnails);
  const entries=paths.map((src,index)=>{
   const image=index===0?main:document.createElement('img');
   blendDarkPhoto(image,src);
   const button=document.createElement('button');button.type='button';button.className='product-gallery-thumb';button.setAttribute('aria-label',`Show ${names[index]} photo of ${original.alt}`);button.setAttribute('aria-pressed',String(index===0));
   let placeholder=null;
   if(index===0){const thumb=document.createElement('img');thumb.src=src;thumb.alt='';button.appendChild(thumb);}
   else{
    image.alt=`${original.alt}, ${names[index]} view`;image.hidden=true;
    placeholder=document.createElement('div');placeholder.className='product-gallery-placeholder';placeholder.hidden=true;placeholder.setAttribute('role','img');placeholder.setAttribute('aria-label',`${original.alt}: photo ${index+1} coming soon`);
    placeholder.innerHTML=camera+`<strong>Photo ${index+1} coming soon</strong><span>Another look at your clicker</span>`;
    photo.append(image,placeholder);button.innerHTML=camera+`<span>Photo ${index+1}</span>`;
   }
   thumbnails.appendChild(button);return {src,image,button,placeholder,loaded:index===0,attempted:index===0};
  });
  const count=document.createElement('span');count.className='product-gallery-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');thumbnails.appendChild(count);count.textContent=`1 / ${entries.length}`;
  function show(index){
   selected=index;count.textContent=`${index+1} / ${entries.length}`;
   photo.classList.toggle('product-gallery-dark',entries[index].image.classList.contains('product-gallery-dark-image'));
   photo.style.setProperty('--photo-backdrop',`url("${new URL(entries[index].src,location.href).href}")`);
   entries.forEach((entry,i)=>{entry.button.setAttribute('aria-pressed',String(i===index));entry.image.hidden=i!==index || (i===0?main.complete && main.naturalWidth===0:!entry.loaded);if(entry.placeholder)entry.placeholder.hidden=i!==index || entry.loaded;});
   existingFallbacks.forEach(child=>{child.hidden=index!==0 || originalHidden.get(child);});
   const entry=entries[index];if(index>0 && !entry.attempted){entry.attempted=true;entry.image.src=entry.src;}
  }
  entries.forEach((entry,index)=>{
   entry.button.addEventListener('click',()=>show(index));
   if(index===0)return;
   entry.image.addEventListener('load',()=>{entry.loaded=true;const thumb=document.createElement('img');thumb.src=entry.src;thumb.alt='';entry.button.replaceChildren(thumb);show(selected);});
   entry.image.addEventListener('error',()=>{entry.loaded=false;show(selected);});
  });
  main.addEventListener('load',()=>{if(selected===0)main.hidden=false;});
  main.addEventListener('error',()=>{existingFallbacks.forEach(child=>{originalHidden.set(child,child.hidden);if(selected!==0)child.hidden=true;});});
  thumbnails.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?entries.length-1:(selected+(event.key==='ArrowRight'?1:-1)+entries.length)%entries.length;
   show(index);entries[index].button.focus();
  });
  entries.forEach((entry,index)=>{if(index>0 && photo.dataset[index===1?'gallerySecond':'galleryThird']){entry.attempted=true;entry.image.src=entry.src;}});
  show(0);
 });
})();
