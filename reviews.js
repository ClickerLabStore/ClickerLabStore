(() => {
 const script=document.currentScript,product=script?.dataset.reviewProduct==='bundle'?new URLSearchParams(location.search).get('bundle'):script?.dataset.reviewProduct;
 const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
 async function api(path,data){
  const response=await fetch(path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});
  const result=await response.json();if(!response.ok)throw Error(result.error || 'Unable to load reviews. Please try again.');return result;
 }
 function previewBanner(){if(document.getElementById('reviews-preview-banner'))return;const banner=node('aside','reviews-preview-banner','Review preview — all orders and reviews here are demo examples. Checkout and payments are disabled.');banner.id='reviews-preview-banner';document.body.prepend(banner);}
 function policy(){const details=node('details','reviews-policy');details.append(node('summary','','How verified reviews work'),node('p','','A verified purchase means a private review link matched a confirmed paid order containing this product. Each purchased product can be reviewed once per order, and buyers can edit their review using the same link. A review describes the buyer’s opinion; purchase verification does not guarantee every claim is correct.'),node('p','','Positive and negative reviews follow the same rules. Reviews publish without a rating-based approval step. Reviews may be removed only for spam, abuse, personal information, or unrelated content. No review incentive is offered.'));return details;}
 async function showProduct(){
  if(!product)return;
  const section=node('section','product-reviews');section.id='reviews';section.setAttribute('aria-labelledby','reviews-title');
  const heading=node('div','reviews-heading'),title=node('h2','','Customer reviews');title.id='reviews-title';
  const write=node('a','reviews-action','Write a verified review');write.href='/review.html?product='+encodeURIComponent(product);heading.append(title,write);
  const summary=node('p','reviews-summary','Loading reviews…');summary.setAttribute('role','status');const list=node('div','reviews-list'),more=node('button','reviews-more','Load more reviews');more.type='button';more.hidden=true;
  section.append(heading,summary,list,more,policy());document.querySelector('main').after(section);
  let page=0,busy=false;
  async function load(){
   if(busy)return;busy=true;more.disabled=true;
   try{
    const data=await api('/api/reviews?product='+encodeURIComponent(product)+'&page='+page);
    if(data.demo){previewBanner();write.textContent='Try a demo review';write.onclick=async event=>{event.preventDefault();write.textContent='Opening demo…';try{const access=await api('/api/reviews/demo');location.href=write.href+'#token='+encodeURIComponent(access.token);}catch(e){summary.textContent=e.message;write.textContent='Try a demo review';}};}
    if(page===0){list.replaceChildren();summary.replaceChildren();
     if(data.count){summary.append(node('strong','',Number(data.average).toFixed(1)+' / 5'),document.createTextNode(` · ${data.count} verified-purchase review${data.count===1?'':'s'}`));}
     else{summary.textContent='No reviews yet';list.append(node('p','reviews-empty','Be the first verified buyer to share your experience. Honest feedback helps other clicker fans choose.'));}
    }
    for(const review of data.reviews){
     const article=node('article','reviews-entry'),top=node('div','reviews-entry-top'),stars=node('span','reviews-stars','★'.repeat(review.rating)+'☆'.repeat(5-review.rating));stars.setAttribute('aria-label',`${review.rating} out of 5 stars`);
     top.append(node('span','reviews-author',review.display_name),node('span','reviews-badge','Verified purchase'));
     if(data.demo)top.append(node('span','reviews-demo-label','Demo example'));
     const date=node('time','reviews-date',new Date(review.created_at*1000).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}));date.dateTime=new Date(review.created_at*1000).toISOString();
     article.append(top,stars,document.createTextNode(' '),date);if(review.updated_at>review.created_at)article.append(node('span','reviews-date',' · Edited'));
     if(review.body)article.append(node('p','reviews-body',review.body));list.append(article);
    }
    page++;more.hidden=!data.hasMore;more.textContent='Load more reviews';
   }catch(error){if(!page)summary.textContent=error.message;more.hidden=false;more.textContent='Try again';}
   finally{busy=false;more.disabled=false;}
  }
  more.addEventListener('click',load);await load();
 }
 async function showForm(){
  const form=document.getElementById('verified-review-form');if(!form)return;
  const status=document.getElementById('review-status'),select=form.elements.productId,submit=form.querySelector('[type=submit]'),link=document.getElementById('review-product-link');
  let token,items=[],demo=false;
  function fill(){const item=items.find(item=>item.id===select.value),review=item?.review;form.elements.displayName.value=review?.display_name || '';form.elements.body.value=review?.body || '';for(const radio of form.elements.rating)radio.checked=Number(radio.value)===review?.rating;submit.textContent=review?'Update review':'Publish review';link.href=item?.id.includes('-key-')?`/${item.id}.html#reviews`:`/bundle-details.html?bundle=${encodeURIComponent(item?.id || '')}#reviews`;link.hidden=false;}
  try{
   const fragment=new URLSearchParams(location.hash.slice(1));let stored,savedSession;try{stored=localStorage.getItem('clickerlab_review_token');savedSession=sessionStorage.getItem('clickerlab_review_session');}catch{}
   const session=fragment.get('token')?null:fragment.get('session') || savedSession;
   token=fragment.get('token') || (session?null:stored);
   if(!token && !session){status.textContent='Use the private review link on your payment confirmation. Only buyers with a confirmed paid order can leave a review. You can save that link and return after trying your clicker.';return;}
   const access=await api(session?'/api/reviews/access':'/api/reviews/eligibility',session?{sessionId:session}:{token});
   token=access.token;items=access.items;demo=access.demo;
   if(!items.length){status.textContent='No reviewable products were found in this purchase.';return;}
   history.replaceState(null,'',location.pathname+location.search+'#token='+encodeURIComponent(token));
   if(!demo)try{localStorage.setItem('clickerlab_review_token',token);}catch{}
   if(demo)previewBanner();
   for(const item of items){const option=node('option','',item.name);option.value=item.id;select.append(option);}
   const requested=new URLSearchParams(location.search).get('product');if(items.some(item=>item.id===requested))select.value=requested;
   fill();form.hidden=false;status.textContent=demo?'Demo purchase verified. Try posting any rating, including a low rating. These are sample reviews only.':'Purchase verified. Share an honest review after you have tried your clicker.';
  }catch(error){status.textContent=error.message;return;}
  select.addEventListener('change',fill);
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(!form.reportValidity())return;submit.disabled=true;select.disabled=true;status.textContent='Saving review…';
   try{
    const data={token,productId:select.value,rating:Number(form.elements.rating.value),displayName:form.elements.displayName.value,body:form.elements.body.value};
    const result=await api('/api/reviews',data);items.find(item=>item.id===select.value).review={rating:data.rating,display_name:data.displayName,body:data.body,status:result.status};
    status.textContent=result.status==='published'?(demo?'Demo review published. It is clearly labeled as a demo.':'Your verified-purchase review is published. Thank you for sharing your experience.'):'Your changes were saved. This review is hidden under our publishing rules.';submit.textContent='Update review';
   }catch(error){status.textContent=error.message;}
   finally{submit.disabled=false;select.disabled=false;}
  });
 }
 showProduct();showForm();
})();
