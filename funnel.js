/* Counts shopping steps without recording names, email, addresses, query strings,
   review links, referrers, key presses, or cart contents. No third-party service. */
(()=>{
 if(navigator.doNotTrack==='1' || navigator.globalPrivacyControl===true || location.search.includes('checkout=') || document.getElementById('reviews-preview-banner'))return;
 let page=location.pathname.replace(/^\//,'').replace(/\.html$/,'') || 'home';if(page==='index')page='home';if(page==='review')return;
 const key='clickerlab_funnel_session';let session;
 try{const saved=JSON.parse(sessionStorage.getItem(key));session=saved && Date.now()-saved.at<30*60*1000?saved.id:crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({id:session,at:Date.now()}));}catch{return;}
 let queue=[],timer,lastActivity=Date.now();
 const flush=()=>{clearTimeout(timer);if(!queue.length)return;const events=queue.splice(0,10);try{fetch('/api/funnel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,events}),keepalive:true}).catch(()=>{});}catch{} };
 const track=(event,product)=>{try{if(Date.now()-lastActivity>=30*60*1000){flush();session=crypto.randomUUID();}lastActivity=Date.now();sessionStorage.setItem(key,JSON.stringify({id:session,at:lastActivity}));queue.push({id:crypto.randomUUID(),event,page,...(product?{product}: {})});if(queue.length>=10)flush();else{clearTimeout(timer);timer=setTimeout(flush,500);}}catch{} };
 window.ClickerFunnel={track,flush,session:()=>session};
 track('page_view');
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
 addEventListener('pagehide',flush);
})();
