import { paymentMode, isLive } from "./payment-mode.js";
import { checkoutShipping } from "./shipping.js";
export const LIGHT_IDS={White:1,Red:2,Blue:3,Yellow:4,Green:5};
export const PRODUCTS = {
  '2-key-light-up-clicker': {name:'2-Key Light Up Clicker',price:449,base:2,light:true},
  '3-key-light-up-clicker': {name:'3-Key Light Up Clicker',price:699,base:3,light:true},
  '4-key-light-up-clicker': {name:'4-Key Light Up Clicker',price:849,base:4,light:true},
  '1-key-clicker': { name: '1-Key Clicker', price: 249, base: 1 },
  '1-key-light-up-clicker': { name: '1-Key Light Up Clicker', price: 349, base: 1, light: true },
  '2-key-clicker': { name: '2-Key Clicker', price: 399, base: 2 },
  '3-key-clicker': { name: '3-Key Clicker', price: 599, base: 3 },
  '4-key-clicker': { name: '4-Key Clicker', price: 699, base: 4 },
  '9-key-clicker': { name: '9-Key Clicker', price: 1499, base: 9 }
};
export const BUNDLES = {
  'starter-pack': {name:'Starter Pack',price:849,bases:[1,4]},
  'starter-lab': {name:'Starter Lab',price:999,bases:[2,4]},
  'clicker-trio': {name:'Clicker Trio',price:1149,bases:[1,2,4]},
  'trio-lab': {name:'Trio Lab',price:1249,bases:[1,3,4]},
  'clickerlab-pack': {name:'ClickerLab Pack',price:2699,bases:[1,2,3,4,9]}
};
export function validateCart(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error('Invalid cart');
  const components = new Map();
  const add = (kind, id, qty) => {
    const key = `${kind}:${id}`;
    const previous = components.get(key);
    components.set(key, { kind, id, quantity: qty + (previous?.quantity || 0) });
  };
  let amount = 0;
  const lines = items.map(item => {
    const bundle = Object.hasOwn(BUNDLES,item.productId) && BUNDLES[item.productId];
    if (bundle) {
      const clickers = item.options?.clickers;
      if (!Array.isArray(clickers) || clickers.length !== bundle.bases.length) throw new Error('Invalid bundle selection');
      const validated = validateCart(clickers.map((clicker,i) => {
        if (clicker.productId !== `${bundle.bases[i]}-key-clicker`) throw new Error('Invalid bundle clicker');
        return {productId:clicker.productId,quantity:item.quantity,options:clicker};
      }));
      for (const component of validated.components) add(component.kind,component.id,component.quantity);
      amount += bundle.price * item.quantity;
      return {productId:item.productId,quantity:item.quantity,name:bundle.name,price:bundle.price,
        options:{clickers:validated.lines.map(line=>({productId:line.productId,...line.options}))}};
    }
    const product = Object.hasOwn(PRODUCTS, item.productId) && PRODUCTS[item.productId];
    const { keycaps, switchType, lightColor, lightColors } = item.options || {};
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 ||
        !Array.isArray(keycaps) || keycaps.length !== product.base ||
        keycaps.some(id => !Number.isInteger(id) || id < 1 || id > 11) ||
        !['Clicky','Creamy'].includes(switchType) ||
        (product.light && (lightColors !== undefined ? (!Array.isArray(lightColors) || lightColors.length !== product.base || lightColors.some(color=>!['White','Red','Blue','Yellow','Green'].includes(color))) : !['White','Red','Blue','Yellow','Green'].includes(lightColor)))) {
      throw new Error('Invalid product selection');
    }
    add('base', product.base, item.quantity);
    for (const id of keycaps) add('keycap', id, item.quantity);
    if(product.light) for(const color of lightColors || Array(product.base).fill(lightColor)) add('light',LIGHT_IDS[color],item.quantity);
    amount += product.price * item.quantity;
    return { productId: item.productId, quantity: item.quantity,
      name: product.name, price: product.price,
      options: { switchType, keycaps, ...(product.light ? (lightColors !== undefined ? {lightColors:[...lightColors]} : {lightColor}) : {}) } };
  });
  return { lines, components: [...components.values()], amount };
}
export async function verifySignature(raw, signature, secret, now = Date.now()) {
  if (!secret || !signature) return false;
  const parts = signature.split(',').map(part => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const expected = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
  return parts.filter(([key]) => key === 'v1').some(([,value]) => {
    if (!value || value.length !== expected.length) return false;
    let diff = 0;
    for(let i=0;i<expected.length;i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}
export async function inventory(DB) {
  const read = (table, kind) => DB.prepare(`SELECT i.id, i.name,
    MAX(0, i.stock - COALESCE((SELECT SUM(c.quantity) FROM order_components c
      JOIN orders o ON o.id=c.order_id WHERE c.kind=? AND c.component_id=i.id
      AND o.status IN ('creating','open')),0)) AS stock FROM ${table} i ORDER BY i.id`).bind(kind).all();
  const [keycaps,bases,lights] = await Promise.all([read('keycaps','keycap'),read('bases','base'),read('lights','light')]);
  return { keycaps:keycaps.results, bases:bases.results,lights:lights.results };
}
export async function stripeRequest(env, path, params, idempotencyKey) {
  const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  if(params) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if(idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method:params ? 'POST':'GET', headers, body:params?.toString(), signal:AbortSignal.timeout(20000)
  });
  const data = await response.json();
  if(!response.ok) {
    const error = new Error('Stripe request failed');
    const safe = value => typeof value === 'string' && /^[A-Za-z0-9_\[\].-]{1,100}$/.test(value) ? value : 'unknown';
    error.stripeFailure = [response.status,safe(data.error?.type),safe(data.error?.code),safe(data.error?.param)].join(':');
    throw error;
  }
  return data;
}
export async function checkout(request, env, reservationOwner = null) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.STORE_URL ||
      !env.SHIPPO_API_TOKEN || !env.SHIP_FROM_ADDRESS) {
    return Response.json({error:'Checkout is not configured yet.'},{status:503});
  }
  const mode=paymentMode(env);
  if(env.PAYMENT_MODE && !env.STRIPE_SECRET_KEY.startsWith(mode==='live'?'sk_live_':'sk_test_')) return Response.json({error:'Payment credentials do not match the store mode.'},{status:503});
  const origin = new URL(env.STORE_URL).origin;
  if (request.headers.get('Origin') !== origin) return Response.json({error:'Invalid origin'},{status:403});
  let cart, body;
  try { body = await request.json(); cart = validateCart(body.items); }
  catch { return Response.json({error:'Please check your product selections.'},{status:400}); }
  const clickerCount=cart.lines.reduce((sum,line)=>sum+line.quantity*(BUNDLES[line.productId]?.bases.length || 1),0);
  if(clickerCount>10) return Response.json({error:'Please limit each checkout to 10 clickers.'},{status:400});
  const id = body?.requestId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) {
    return Response.json({error:'Invalid Checkout attempt.'},{status:400});
  }
  let order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if(order && (order.payment_mode || 'test')!==mode) return Response.json({error:'Store payment mode changed. Please calculate shipping again.'},{status:409});
  if (order && (order.cart_json !== JSON.stringify(cart.lines) ||
      order.shipping_quote_id !== body.quoteId || order.shipping_rate_id !== body.rateId)) return Response.json({error:'Checkout attempt changed.'},{status:409});
  if (order?.status === 'open') {
    const existing = await stripeRequest(env,`/checkout/sessions/${order.session_id}`);
    if(existing.status === 'open') return Response.json({url:existing.url});
    return Response.json({error:'This Checkout has ended. Please calculate shipping again.'},{status:409});
  }
  if (order && order.status !== 'creating') return Response.json({error:'Checkout has already ended. Please calculate shipping again.'},{status:409});
  if (!order) {
    if(reservationOwner) {
      const holds=await env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE reservation_owner=? AND status IN ('creating','open')").bind(reservationOwner).first();
      if(holds.count>=2) return Response.json({error:'You already have two unpaid checkouts. Complete or wait for those to expire before starting another.'},{status:429,headers:{'Retry-After':'60'}});
    }
    let shipping;
    try { shipping = await checkoutShipping(env,body); } catch(error) {
      return Response.json({error:error.message},{status:409});
    }
    const now = Math.floor(Date.now()/1000);
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO orders(id,status,amount,cart_json,created_at,shipping_amount,shipping_countries,shipping_quote_id,shipping_rate_id,shipping_address_json,shipping_service,reservation_owner,payment_mode) VALUES (?,'creating',?,?,?,?,?,?,?,?,?,?,?)")
          .bind(id,cart.amount,JSON.stringify(cart.lines),now,shipping.amount,'US',shipping.quoteId,shipping.rateId,JSON.stringify(shipping.address),shipping.service,reservationOwner,mode),
        ...cart.components.map(c => env.DB.prepare('INSERT INTO order_components(order_id,kind,component_id,quantity) VALUES (?,?,?,?)')
          .bind(id,c.kind,c.id,c.quantity))
      ]);
    } catch {
      return Response.json({error:'Inventory changed. Please refresh your cart and try again.'},{status:409});
    }
    order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  }
  // Stripe retains idempotency keys for at least 24 hours. Never recreate a stale uncertain attempt.
  if (Date.now()/1000 - order.created_at > 23*3600) {
    return Response.json({error:'Please contact the store to reconcile this Checkout attempt.'},{status:409});
  }
  const params = new URLSearchParams({mode:'payment',success_url:`${origin}/shop.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${origin}/shop.html?checkout=cancelled`,client_reference_id:id,'metadata[order_id]':id,
    expires_at:String(order.created_at+3600)});
  // Use the quoted destination as the PaymentIntent's shipping address. Do not let
  // Checkout collect a different destination while keeping the original price.
  const shippingAddress = JSON.parse(order.shipping_address_json);
  params.set('payment_intent_data[shipping][name]',shippingAddress.name);
  for (const [field,value] of Object.entries({line1:shippingAddress.street1,line2:shippingAddress.street2,
      city:shippingAddress.city,state:shippingAddress.state,postal_code:shippingAddress.zip,country:'US'})) {
    if(value) params.set(`payment_intent_data[shipping][address][${field}]`,value);
  }
  params.set('shipping_options[0][shipping_rate_data][type]','fixed_amount');
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]',String(order.shipping_amount));
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]','usd');
  params.set('shipping_options[0][shipping_rate_data][display_name]',order.shipping_service);
  cart.lines.forEach((line,i)=>{
    const prefix=`line_items[${i}]`;
    params.set(`${prefix}[quantity]`,String(line.quantity));
    params.set(`${prefix}[price_data][currency]`,'usd');
    params.set(`${prefix}[price_data][unit_amount]`,String(line.price));
    params.set(`${prefix}[price_data][product_data][name]`,line.name);
    params.set(`${prefix}[price_data][product_data][description]`,
      line.options.clickers ? line.options.clickers.map(c => `${PRODUCTS[c.productId].name}: ${c.switchType}; Keycaps: ${c.keycaps.join(', ')}`).join(' | ') : `${line.options.switchType}; Keycaps: ${line.options.keycaps.join(', ')}${line.options.lightColors ? '; Lights by key: '+line.options.lightColors.map((c,i)=>`${i+1}: ${c}`).join(', ') : line.options.lightColor ? '; Light: '+line.options.lightColor:''}`);
  });
  let session;
  try {
    session = await stripeRequest(env,'/checkout/sessions',params,`checkout-v2-${id}`);
    if (session.livemode !== isLive(env)) {
      await stripeRequest(env,`/checkout/sessions/${session.id}/expire`,new URLSearchParams());
      await env.DB.prepare("UPDATE orders SET status='failed' WHERE id=? AND status='creating'").bind(id).run();
      return Response.json({error:'Stripe payment mode does not match the store.'},{status:503});
    }
    await env.DB.prepare("UPDATE orders SET status='open',session_id=? WHERE id=? AND status='creating'")
      .bind(session.id,id).run();
    return Response.json({url:session.url});
  } catch(error) {
    // Keep uncertain Stripe requests reserved: a session may exist even after a timeout.
    // Reconciliation must expire/retrieve that session before releasing its inventory.
    return Response.json({error:'Checkout could not start. Please contact the store before retrying.'},{status:502,headers:{'X-Checkout-Failure':error.stripeFailure || 'unknown'}});
  }
}
export async function webhook(request,env) {
  const raw = await request.text();
  if(!env.STRIPE_WEBHOOK_SECRET) return new Response('Webhook not configured',{status:503});
  if(!await verifySignature(raw,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET)) {
    return new Response('Invalid signature',{status:400});
  }
  let event;
  try { event=JSON.parse(raw); } catch { return new Response('Invalid payload',{status:400}); }
  if(!['checkout.session.completed','checkout.session.expired'].includes(event.type)) return new Response('OK');
  const session=event.data.object;
  const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(session.metadata?.order_id || '').first();
  if(!order) return new Response('Unknown order',{status:400});
  if(session.livemode!==((order.payment_mode || 'test')==='live')) return new Response('Payment mode mismatch',{status:400});
  if(order.status==='creating') return new Response('Order not attached yet',{status:503});
  if(order.session_id!==session.id || session.client_reference_id!==order.id) return new Response('Order mismatch',{status:400});
  if(event.type==='checkout.session.completed') {
    if(session.payment_status!=='paid') return new Response('OK');
    const shipping=order.shipping_amount;
    if(session.currency!==order.currency || session.amount_subtotal!==order.amount ||
        session.amount_total!==order.amount+shipping) return new Response('Amount mismatch',{status:400});
    await env.DB.prepare("UPDATE orders SET status='paid',paid_at=? WHERE id=? AND status='open'")
      .bind(Math.floor(Date.now()/1000),order.id).run();
  } else {
    await env.DB.prepare("UPDATE orders SET status='expired' WHERE id=? AND status='open'").bind(order.id).run();
  }
  return new Response('OK');
}
