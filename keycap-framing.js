(() => {
 // Visible keycap bounds in the owner's original photos; backgrounds/shadows
 // are excluded. Keeping source files intact also preserves full-size downloads.
 const bounds={
  12:[60,261,1030,1214],13:[87,272,1018,1199],
  14:[75,285,1008,1215],15:[55,236,1031,1229],
  16:[69,279,1027,1234],17:[72,294,1014,1221],
  18:[93,296,1008,1178],19:[57,269,1030,1234]
 };
 const photoVersion='d068fb4';
 function initialize(){
  const observed=new Set();
  const resize=new ResizeObserver(entries=>entries.forEach(entry=>frame(entry.target)));
  function release(image){
   if(!observed.delete(image))return;
   resize.unobserve(image);
   for(const property of ['transform','transform-origin','clip-path','object-fit','object-position'])image.style.removeProperty(property);
  }
  function frame(image){
   const match=/(?:^|\/)keycap-(1[2-9])\.png(?:\?.*)?$/.exec(image.getAttribute('src') || '');
   if(!match || !image.isConnected){release(image);return;}
   // Replacing a photo under its existing filename must refresh every picker,
   // selected preview, and game note, including dynamically inserted images.
   const source=new URL(image.getAttribute('src'),location.href);
   if(source.searchParams.get('v')!==photoVersion){
    source.searchParams.set('v',photoVersion);image.src=source.pathname+source.search;return;
   }
   if(!observed.has(image)){observed.add(image);resize.observe(image);}
   if(!image.complete || !image.naturalWidth)return;
   const width=image.clientWidth,height=image.clientHeight;
   if(!width || !height)return; // ResizeObserver frames a hidden picker when it opens.
   if(!image.closest('.beat-page,.beat-picker')){
    // Product photo frames are square: fill the full box without the inset
    // produced by the earlier subject-size normalization.
    image.style.objectFit='cover';image.style.objectPosition='center';
    image.style.transform='none';image.style.clipPath='none';
    return;
   }
   const [left,top,right,bottom]=bounds[Number(match[1])];
   const sourceWidth=image.naturalWidth,sourceHeight=image.naturalHeight;
   const fit=getComputedStyle(image).objectFit==='cover'?Math.max:Math.min;
   const nativeScale=fit(width/sourceWidth,height/sourceHeight);
   const zoom=.72*Math.min(width,height)/(Math.max(right-left,bottom-top)*nativeScale);
   const x=-(left+right-sourceWidth)/2*nativeScale*zoom;
   const y=-(top+bottom-sourceHeight)/2*nativeScale*zoom;
   image.style.transformOrigin='center';
   image.style.transform=`translate(${x.toFixed(3)}px,${y.toFixed(3)}px) scale(${zoom.toFixed(5)})`;
   // Clip in source coordinates so an enlarged photo cannot cover labels or
   // stock badges below its image box, even in the compact game picker.
   const insets=[height/2-(height/2+y)/zoom,width/2-(width/2-x)/zoom,
    height/2-(height/2-y)/zoom,width/2-(width/2+x)/zoom];
   image.style.clipPath=`inset(${insets.map(value=>value.toFixed(3)+'px').join(' ')})`;
  }
  function scan(node){
   if(node.nodeType!==1)return;
   if(node.tagName==='IMG')frame(node);
   node.querySelectorAll('img').forEach(frame);
  }
  document.addEventListener('load',event=>{if(event.target.tagName==='IMG')frame(event.target);},true);
  new MutationObserver(records=>{
   for(const record of records){
    if(record.type==='attributes')frame(record.target);
    else record.addedNodes.forEach(scan);
   }
   for(const image of observed)if(!image.isConnected)release(image);
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  scan(document.body);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
