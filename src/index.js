import { protectRequest, cleanupAbuseData } from "./abuse.js";
import { shippingRates } from "./shipping.js";
import { inventory, checkout, webhook } from "./commerce.js";
import { reconcileCheckouts } from "./reconciliation.js";
import { purchaseOrderLabel, processShippingLabels } from "./labels.js";
import { listReviews,reviewAccess,submitReview,previewReviewAccess } from "./reviews.js";

export default {
  async scheduled(event,env,ctx) {
    if(env.REVIEWS_PREVIEW==='true')return;
    ctx.waitUntil((async()=>{
      const outcomes=await Promise.allSettled([cleanupAbuseData(env),reconcileCheckouts(env)]);
      if(outcomes.some(result=>result.status==='rejected'))console.warn('Scheduled checkout maintenance requires review');
      await processShippingLabels(env);
    })());
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if(url.pathname.startsWith('/api/reviews')){
      try{
        if(url.pathname==='/api/reviews' && request.method==='GET')return await listReviews(request,env);
        if(url.pathname==='/api/reviews/demo' && request.method==='GET')return await previewReviewAccess(env);
        if(['/api/reviews','/api/reviews/access','/api/reviews/eligibility'].includes(url.pathname)){
          if(request.method!=='POST')return new Response('Method not allowed',{status:405});
          const protection=await protectRequest(request,env,url.pathname);
          if(protection instanceof Response)return protection;
          return url.pathname==='/api/reviews'?await submitReview(protection.request,env):await reviewAccess(protection.request,env,url.pathname.endsWith('/eligibility'));
        }
        return new Response('Not found',{status:404});
      }catch{return Response.json({error:'Reviews are temporarily unavailable. Please try again.'},{status:503,headers:{'Cache-Control':'no-store'}});}
    }

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "ClickerLabStore" });
    }

    if (url.pathname === "/api/keycaps") {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }

      try {
        const result = await inventory(env.DB);

        return Response.json(
          result,
          { headers: { "Cache-Control": "no-store" } }
        );
      } catch (error) {
        console.error("Inventory query failed", error);
        return Response.json(
          { error: "Unable to load inventory" },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/order-status") {
      if (request.method !== "GET") return new Response("Method not allowed", {status:405});
      const session = url.searchParams.get("session_id") || "";
      if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(session)) return new Response("Invalid session",{status:400});
      const order = await env.DB.prepare("SELECT id,status FROM orders WHERE session_id=?").bind(session).first();
      return Response.json({status:order?.status || "pending",orderId:order?.id || null},{headers:{"Cache-Control":"no-store"}});
    }

    if (url.pathname === "/api/shipping-rates" || url.pathname === "/api/checkout" || url.pathname === "/api/stripe/webhook") {
      if(env.REVIEWS_PREVIEW==='true')return Response.json({error:'Checkout and payments are disabled in this review preview.'},{status:503});
      if (request.method !== "POST") return new Response("Method not allowed", {status:405});
      try {
        let owner;
        if (url.pathname !== "/api/stripe/webhook") {
          const protection=await protectRequest(request,env,url.pathname);
          if(protection instanceof Response) return protection;
          request=protection.request; owner=protection.owner;
        }
        if (url.pathname === "/api/shipping-rates") return await shippingRates(request,env);
        return url.pathname === "/api/checkout" ? await checkout(request,env,owner) : await webhook(request,env,id=>{
          if(ctx)ctx.waitUntil(purchaseOrderLabel(env,id).catch(()=>console.warn('Shipping label background processing failed')));
        });
      } catch {
        return Response.json({error:"Unable to process this request. Please try again."},{status:500});
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    const response=await env.ASSETS.fetch(request);
    if(env.REVIEWS_PREVIEW==='true'){
      const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Cache-Control','no-store');
      const preview=new Response(response.body,{status:response.status,headers});
      if((headers.get('Content-Type') || '').includes('text/html'))return new HTMLRewriter().on('body',{element(element){
        element.prepend('<aside id="reviews-preview-banner" style="padding:13px 20px;background:#fff1ce;color:#604407;text-align:center;font:700 14px/1.5 system-ui,sans-serif">Review preview — all orders and reviews here are demo examples. Checkout and payments are disabled.</aside>',{html:true});
      }}).transform(preview);
      return preview;
    }
    return response;
  }
};
