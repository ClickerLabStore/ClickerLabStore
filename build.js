(() => {
 const prices={1:2.49,2:3.99,3:5.99,4:6.99,9:14.99};
 let step=1,size=null,switchType=null,keycaps=[],active=0,busy=false;
 const next=document.getElementById('builder-next'),back=document.getElementById('builder-back'),status=document.getElementById('builder-status'),quantity=document.getElementById('builder-quantity');
 const picker=document.createElement('dialog');picker.className='bundle-picker';picker.setAttribute('aria-labelledby','builder-picker-title');picker.innerHTML='<div class="bundle-picker-header"><h2 id="builder-picker-title">Choose a keycap</h2><button type="button" class="bundle-picker-close" aria-label="Close keycap picker">×</button></div><div class="bundle-picker-grid"></div>';document.body.appendChild(picker);
 const qty=()=>Number(quantity.value);
 const validQty=()=>Number.isInteger(qty())&&qty()>=1&&qty()<=99;
 function stockFits(){
  if(!size||!window.ClickerInventory.ready()||!validQty())return false;
  if(window.ClickerInventory.availableBase(`${size}-key-clicker`)<qty())return false;
  const counts={};for(const id of keycaps){if(!id)return false;counts[id]=(counts[id]||0)+1;}
  return Object.entries(counts).every(([id,n])=>window.ClickerInventory.available(Number(id))>=n*qty());
 }
 function update(){
  const ready=window.ClickerInventory.ready();
  document.querySelectorAll('[data-size]').forEach(b=>{b.disabled=busy||!ready||window.ClickerInventory.availableBase(`${b.dataset.size}-key-clicker`)===0;});
  next.disabled=busy||!ready||(step===1?!size||window.ClickerInventory.availableBase(`${size}-key-clicker`)===0:step===2?!switchType:!stockFits());
  status.textContent=!ready?'Unable to check inventory. Please refresh and try again.':step===3?(stockFits()?'Your clicker is ready. Stock is checked again before adding.':'Choose every keycap and a quantity that fits the available stock.'):'Select an option, then continue to the next step.';
  if(picker.open)buildPicker();
 }
 function showStep(value){
  step=value;document.querySelectorAll('[data-step]').forEach(e=>e.hidden=Number(e.dataset.step)!==step);
  document.querySelectorAll('.builder-progress li').forEach((e,i)=>{e.classList.toggle('active',i+1===step);if(i+1===step)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
  back.hidden=step===1;next.textContent=step===1?'Next: Switches →':step===2?'Next: Keycaps →':'Add to Cart';
  if(step===3){document.getElementById('builder-summary').textContent=`${size}-Key Clicker · ${switchType} · $${prices[size].toFixed(2)} each`;renderSlots();}
  update();document.querySelector(`[data-step="${step}"] h2`).focus();
 }
 function renderSlots(){
  const container=document.querySelector('.builder-slots');container.replaceChildren();
  keycaps.forEach((id,i)=>{const b=document.createElement('button');b.type='button';b.className='builder-slot'+(id?' selected':'');b.setAttribute('aria-label',`Key ${i+1}: ${id?'Keycap '+id+', change keycap':'choose keycap'}`);b.innerHTML=`<span class="builder-preview">${id?`<img src="/keycap-${id}.png" alt="Keycap ${id}">`:'+'}</span><span class="builder-slot-label">${id?'Keycap '+id:'Key '+(i+1)}</span>`;b.addEventListener('click',()=>{active=i;picker.querySelector('h2').textContent=`Choose a keycap for key ${i+1}`;buildPicker();picker.showModal();window.ClickerInventory.refresh().catch(()=>{});});container.appendChild(b);});
 }
 function buildPicker(){
  const grid=picker.querySelector('.bundle-picker-grid');grid.replaceChildren();const amount=validQty()?qty():1;
  for(let id=1;id<=11;id++){
   const used=keycaps.filter((v,i)=>i!==active&&v===id).length;
   const available=Math.max(0,window.ClickerInventory.available(id)-used*amount);
   const b=document.createElement('button');b.type='button';b.className='bundle-picker-option'+(keycaps[active]===id?' selected':'');b.disabled=!window.ClickerInventory.ready()||available<amount;b.setAttribute('aria-label',`Keycap ${id}, ${available} available`);b.setAttribute('aria-pressed',String(keycaps[active]===id));b.innerHTML=`<img src="/keycap-${id}.png" alt="Keycap ${id}"><span>Keycap ${id} · ${b.disabled?'Unavailable':available+' available'}</span>`;b.addEventListener('click',()=>{keycaps[active]=id;renderSlots();picker.close();update();});grid.appendChild(b);
  }
 }
 document.querySelectorAll('[data-size]').forEach(b=>b.addEventListener('click',()=>{const chosen=Number(b.dataset.size);if(size!==chosen){size=chosen;keycaps=Array(size).fill(null);}document.querySelectorAll('[data-size]').forEach(e=>{e.classList.toggle('selected',e===b);e.setAttribute('aria-pressed',String(e===b));});update();}));
 document.querySelectorAll('[data-switch]').forEach(b=>b.addEventListener('click',()=>{switchType=b.dataset.switch;document.querySelectorAll('[data-switch]').forEach(e=>{e.classList.toggle('selected',e===b);e.setAttribute('aria-pressed',String(e===b));});update();}));
 back.addEventListener('click',()=>{if(!busy)showStep(step-1);});
 next.addEventListener('click',async()=>{
  if(busy||next.disabled)return;if(step<3){showStep(step+1);return;}
  const item={productId:`${size}-key-clicker`,name:`${size}-Key Clicker`,price:prices[size],image:size===9?'9-key clicker.png':`${size}-key-clicker.png`,quantity:qty(),options:{switchType,keycaps:[...keycaps]}};
  busy=true;back.disabled=true;update();
  try{if(await window.ClickerCart.addItem(item))status.textContent='Your custom clicker was added to the cart.';}finally{busy=false;back.disabled=false;next.disabled=!stockFits();}
 });
 quantity.addEventListener('input',update);picker.querySelector('.bundle-picker-close').addEventListener('click',()=>picker.close());picker.addEventListener('close',()=>document.querySelectorAll('.builder-slot')[active]?.focus());
 picker.addEventListener('click',e=>{if(e.target===picker){const r=picker.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)picker.close();}});
 window.addEventListener('clickerlab-inventory-change',update);window.ClickerInventory.refresh().catch(()=>{});
})();
