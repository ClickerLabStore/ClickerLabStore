import { stripeRequest } from './commerce.js';

const BATCH_SIZE = 5;
const DISCOVERY_PAGES = 2;

function credentials(env, mode) {
  const matches = key => typeof key === 'string' && new RegExp(`^(?:sk|rk)_${mode}_`).test(key);
  if (mode === 'test' && matches(env.STRIPE_TEST_SECRET_KEY)) return env.STRIPE_TEST_SECRET_KEY;
  return matches(env.STRIPE_SECRET_KEY) ? env.STRIPE_SECRET_KEY : null;
}

function matchesOrder(session, order) {
  return typeof session?.id === 'string' &&
    new RegExp(`^cs_${order.payment_mode}_[A-Za-z0-9]+$`).test(session.id) &&
    (!order.session_id || order.session_id === session.id) &&
    session.livemode === (order.payment_mode === 'live') &&
    session.metadata?.order_id === order.id && session.client_reference_id === order.id &&
    session.currency === order.currency && session.amount_subtotal === order.amount &&
    session.amount_total === order.amount + order.shipping_amount;
}

// A creation timeout can leave a Stripe session without a saved ID. Scan the
// bounded creation window, never treating a missing/incomplete listing as expiry.
async function discoverSession(request, order) {
  const matches = [];
  let cursor;
  for (let page = 0; page < DISCOVERY_PAGES; page++) {
    const params = new URLSearchParams({limit:'100',
      'created[gte]':String(order.created_at), 'created[lte]':String(order.created_at + 3600)});
    if (cursor) params.set('starting_after',cursor);
    const list = await request(`/checkout/sessions?${params}`);
    if (!Array.isArray(list.data) || typeof list.has_more !== 'boolean') return null;
    for (const session of list.data) {
      if (session.metadata?.order_id === order.id || session.client_reference_id === order.id) matches.push(session);
    }
    if (!list.has_more) return matches.length === 1 && matchesOrder(matches[0],order) ? matches[0] : null;
    cursor = list.data.at(-1)?.id;
    if (typeof cursor !== 'string' || !/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(cursor)) return null;
  }
  return null;
}

export async function reconcileCheckouts(env, now = Math.floor(Date.now()/1000)) {
  const deadline = Date.now() + 25000;
  const counts = {checked:0,expired:0,paid:0,recovered:0,retained:0,errors:0,missingCredentials:0,deferred:0};
  for (const mode of ['live','test']) {
    const {results:orders} = await env.DB.prepare(`SELECT * FROM orders
      WHERE payment_mode=? AND status IN ('creating','open') AND paid_at IS NULL AND created_at <= ?
      ORDER BY reconciliation_checked_at,created_at,id LIMIT ?`).bind(mode,now-3600,BATCH_SIZE).all();
    const key = credentials(env,mode);
    if (!key) { counts.missingCredentials += orders.length; continue; }
    const stripeEnv = {...env,STRIPE_SECRET_KEY:key};
    const request = path => {
      const remaining = deadline-Date.now();
      if (remaining <= 0) throw new Error('Reconciliation time budget exhausted');
      return stripeRequest(stripeEnv,path,undefined,undefined,Math.min(5000,remaining));
    };
    for (const order of orders) {
      if (Date.now() >= deadline) { counts.deferred++; continue; }
      try {
        await env.DB.prepare(`UPDATE orders SET reconciliation_checked_at=?
          WHERE id=? AND status IN ('creating','open') AND paid_at IS NULL`).bind(now,order.id).run();
        counts.checked++;
        if (order.session_id && !new RegExp(`^cs_${mode}_[A-Za-z0-9]+$`).test(order.session_id)) {
          counts.retained++; continue;
        }
        const found = order.session_id ? {id:order.session_id} : await discoverSession(request,order);
        if (!found) { counts.retained++; continue; }
        // Retrieve again after discovery: a payment or expiry may have happened during pagination.
        const session = await request(`/checkout/sessions/${found.id}`);
        if (!matchesOrder(session,order) || session.id !== found.id) { counts.retained++; continue; }
        if (order.status === 'creating') {
          const attached = await env.DB.prepare(`UPDATE orders SET status='open',session_id=?
            WHERE id=? AND status='creating' AND paid_at IS NULL AND (session_id IS NULL OR session_id=?)`)
            .bind(session.id,order.id,session.id).run();
          if (attached.meta.changes > 0) counts.recovered++;
        }
        let status;
        if (session.status === 'expired' && session.payment_status === 'unpaid') status = 'expired';
        else if (session.status === 'complete' && session.payment_status === 'paid') status = 'paid';
        else { counts.retained++; continue; }
        // Conditional transition makes overlapping cron runs and webhooks harmless.
        // The existing D1 paid trigger deducts every component atomically, once.
        const result = await env.DB.prepare(`UPDATE orders SET status=?,paid_at=?
          WHERE id=? AND session_id=? AND payment_mode=? AND status='open' AND paid_at IS NULL`)
          .bind(status,status === 'paid' ? now : null,order.id,session.id,mode).run();
        if (result.meta.changes > 0) counts[status]++;
      } catch {
        // Keep uncertain holds. Do not log credentials, customer data, or Stripe responses.
        counts.errors++;
      }
    }
  }
  console.log('Checkout reconciliation',JSON.stringify(counts));
  return counts;
}
