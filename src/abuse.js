// Cloudflare supplies CF-Connecting-IP at the edge. Never trust X-Forwarded-For.
export async function reservationOwner(request,env) {
  const ip=request.headers.get('CF-Connecting-IP');
  if(!ip || !env.STRIPE_WEBHOOK_SECRET) throw new Error('Abuse protection unavailable');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('reservation-owner:'+ip));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function protectRequest(request,env,path) {
  if(request.headers.get('Origin')!==new URL(env.STORE_URL).origin) return Response.json({error:'Invalid origin'},{status:403});
  if(!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return Response.json({error:'Send a JSON request.'},{status:415});
  // Limit actual streamed bytes as well as the untrusted Content-Length header.
  const reader=request.body?.getReader();let length=0;const chunks=[];
  if(reader) {
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>32768){await reader.cancel();return Response.json({error:'Request is too large.'},{status:413});}chunks.push(value);}
  }
  const owner=await reservationOwner(request,env);
  const window=Math.floor(Date.now()/60000);
  const limit=path==='/api/shipping-rates'?6:10;
  const consume=async(key,max)=>{
    const row=await env.DB.prepare(`INSERT INTO request_limits(key,window,count) VALUES (?,?,1)
      ON CONFLICT(key) DO UPDATE SET window=excluded.window,
      count=CASE WHEN request_limits.window=excluded.window THEN request_limits.count+1 ELSE 1 END
      RETURNING count`).bind(key,window).first();
    return row.count<=max;
  };
  // Consume the global budget only for requests within their individual allowance.
  if(!await consume(path+':'+owner,limit) || !await consume(path+':global',path==='/api/shipping-rates'?120:60)) {
    return Response.json({error:'Too many requests. Please wait a minute and try again.'},{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
  }
  const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  return {owner,request:new Request(request.url,{method:request.method,headers:request.headers,body})};
}
// Remove counters after they stop affecting limits; retain no raw network addresses.
export async function cleanupAbuseData(env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM request_limits WHERE window < ?').bind(Math.floor(Date.now()/60000)-120),
    env.DB.prepare('DELETE FROM shipping_quotes WHERE created_at < ? AND id NOT IN (SELECT shipping_quote_id FROM orders)').bind(Math.floor(Date.now()/1000)-86400)
  ]);
}
