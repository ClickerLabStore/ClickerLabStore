// Package only public static files for an isolated Worker preview. This avoids
// asset-upload JWT support being required from the cloud credential proxy.
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const output=process.argv[2];if(!output)throw Error('Pass an output directory outside the checkout');
const directory=resolve(output);if(directory.startsWith(root+'/') || directory===root)throw Error('Preview output must be outside the public checkout');
mkdirSync(directory,{recursive:true});
const text={},media=[];
for(const name of readdirSync(root)){
 if(/\.(html|js|css|svg)$/.test(name))text['/'+name]=readFileSync(resolve(root,name),'utf8');
 if(/\.(png|wav)$/.test(name))media.push('/'+name);
}
writeFileSync(resolve(directory,'static.mjs'),'export const text='+JSON.stringify(text)+';\nexport const media=new Set('+JSON.stringify(media)+');\n');
writeFileSync(resolve(directory,'entry.mjs'),`import app from ${JSON.stringify(resolve(root,'src/index.js'))};
import {text,media} from './static.mjs';
export default { ...app, async fetch(request,env,ctx){
 const ASSETS={async fetch(request){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  let path;try{path=decodeURIComponent(new URL(request.url).pathname);}catch{return new Response('Not found',{status:404});}
  if(media.has(path)){
   const response=await fetch('https://clickerlabstore.com'+encodeURI(path),{method:request.method});
   return new Response(response.body,{status:response.status,headers:response.headers});
  }
  if(path==='/')path='/index.html';else if(!path.split('/').at(-1).includes('.'))path+='.html';
  if(!Object.hasOwn(text,path))return new Response('Not found',{status:404});
  const type=path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'application/javascript';
  return new Response(request.method==='HEAD'?null:text[path],{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'}});
 }};
 return app.fetch(request,{...env,ASSETS},ctx);
}};
`);
console.log('Bundled public preview assets; media is read-only from existing public image URLs.');
