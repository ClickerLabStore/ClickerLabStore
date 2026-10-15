import {stripeRequest} from './commerce.js';
import {shippoRequest,normalizeAddress,rateAmount} from './shipping.js';
import {paymentMode,isLive} from './payment-mode.js';

const ID=/^[a-f0-9]{32}$/;
const now=()=>Math.floor(Date.now()/1000);
class Review extends Error {}
function requireMatch(matches,reason){if(!matches)throw new Review(reason);}
function sameAddress(a,b){
  const clean=address=>Object.values(normalizeAddress(address)).map(s=>s.toLowerCase().replace(/\s+/g,' '));
  return JSON.stringify(clean(a))===JSON.stringify(clean(b));
}
function httpsURL(value){try{return typeof value==='string' && value.length<4096 && new URL(value).protocol==='https:';}catch{return false;}}
function remaining(deadline){const value=deadline-Date.now();if(value<500)throw new Error('Time budget');return Math.min(6000,value);}
async function review(env,id,token,reason,transactionId=null){
  await env.DB.prepare(`UPDATE shipping_labels SET state='needs_review',review_reason=?,updated_at=?,
    transaction_id=COALESCE(?,transaction_id) WHERE order_id=? AND claim_token=? AND state!='success'`)
    .bind(reason,now(),transactionId,id,token).run();
  return 'needs_review';
}

async function preflight(env,order,deadline){
  requireMatch(order.status==='paid' && order.paid_at!==null && order.auto_label_eligible===1,'order_not_paid');
  requireMatch(order.payment_mode===paymentMode(env),'payment_mode_mismatch');
  requireMatch(new RegExp(`^cs_${order.payment_mode}_[A-Za-z0-9]+$`).test(order.session_id || ''),'invalid_session');
  requireMatch(ID.test(order.shipping_rate_id || '') && order.currency==='usd' && order.shipping_service==='USPS Ground Advantage','invalid_shipping');
  let destination,from;
  try{destination=normalizeAddress(JSON.parse(order.shipping_address_json));from=normalizeAddress(JSON.parse(env.SHIP_FROM_ADDRESS));}
  catch{throw new Review('invalid_address');}

  const session=await stripeRequest(env,`/checkout/sessions/${order.session_id}?expand[]=payment_intent.latest_charge`,undefined,undefined,remaining(deadline));
  const intent=session.payment_intent,charge=intent?.latest_charge,total=order.amount+order.shipping_amount;
  requireMatch(session.id===order.session_id && session.livemode===isLive(env) && session.status==='complete' && session.payment_status==='paid' &&
    session.metadata?.order_id===order.id && session.client_reference_id===order.id && session.currency==='usd' && session.amount_subtotal===order.amount && session.amount_total===total,'payment_mismatch');
  requireMatch(typeof intent?.id==='string' && intent.id.startsWith('pi_') && intent.status==='succeeded' && intent.livemode===isLive(env) && intent.currency==='usd' && intent.amount_received===total &&
    typeof charge?.id==='string' && charge.id.startsWith('ch_') && charge.payment_intent===intent.id && charge.livemode===isLive(env) && charge.paid===true && charge.captured===true &&
    charge.refunded===false && charge.amount_refunded===0 && charge.disputed===false && charge.amount===total && charge.currency==='usd','payment_refunded_or_unverified');
  const address=intent.shipping?.address;
  let addressMatches=false;
  try{addressMatches=sameAddress(destination,{name:intent.shipping?.name,street1:address?.line1,street2:address?.line2 || '',city:address?.city,state:address?.state,zip:address?.postal_code,country:address?.country});}catch{}
  requireMatch(addressMatches,'payment_address_mismatch');

  const rate=await shippoRequest(env,`/rates/${order.shipping_rate_id}/`,undefined,remaining(deadline));
  requireMatch(rate.object_id===order.shipping_rate_id && rate.test===!isLive(env) && rate.provider==='USPS' && rate.currency==='USD' &&
    rate.servicelevel?.token==='usps_ground_advantage' && ID.test(rate.shipment || ''),'rate_mismatch');
  let amount;try{amount=rateAmount(rate.amount);}catch{throw new Review('invalid_rate_amount');}
  requireMatch(amount===order.shipping_amount,'rate_price_changed');
  const shipment=await shippoRequest(env,`/shipments/${rate.shipment}/`,undefined,remaining(deadline));
  let shipmentMatches=false;
  try{shipmentMatches=sameAddress(shipment.address_to,destination) && sameAddress(shipment.address_from,from);}catch{}
  const parcel=shipment.parcels?.[0];
  requireMatch(shipment.object_id===rate.shipment && shipment.test===!isLive(env) && shipmentMatches && shipment.parcels?.length===1 &&
    parcel.distance_unit==='in' && parcel.mass_unit==='lb' && Number(parcel.length)===6 && Number(parcel.width)===4 && Number(parcel.height)===2 && Number(parcel.weight)===0.2,'shipment_mismatch');
  return amount;
}

async function saveTransaction(env,order,job,transaction){
  const id=ID.test(transaction?.object_id || '')?transaction.object_id:null;
  if(!id || (job.transaction_id && job.transaction_id!==id) || transaction.test!==!isLive(env) || transaction.metadata!==`clickerlab:${order.id}` ||
     (typeof transaction.rate==='string'?transaction.rate:transaction.rate?.object_id)!==order.shipping_rate_id){
    return review(env,order.id,job.claim_token,'transaction_mismatch',id);
  }
  if(transaction.status==='SUCCESS'){
    if(!httpsURL(transaction.label_url) || typeof transaction.tracking_number!=='string' || !/^[A-Za-z0-9 -]{5,100}$/.test(transaction.tracking_number))return review(env,order.id,job.claim_token,'incomplete_label',id);
    await env.DB.prepare(`UPDATE shipping_labels SET state='success',transaction_id=?,label_url=?,tracking_number=?,tracking_url=?,updated_at=?,review_reason=NULL
      WHERE order_id=? AND claim_token=? AND state IN ('purchasing','waiting')`)
      .bind(id,transaction.label_url,transaction.tracking_number,httpsURL(transaction.tracking_url_provider)?transaction.tracking_url_provider:null,now(),order.id,job.claim_token).run();
    return 'success';
  }
  if(['WAITING','QUEUED'].includes(transaction.status)){
    await env.DB.prepare(`UPDATE shipping_labels SET state='waiting',transaction_id=?,updated_at=?,next_attempt_at=?
      WHERE order_id=? AND claim_token=? AND state IN ('purchasing','waiting')`)
      .bind(id,now(),now()+900,order.id,job.claim_token).run();
    return 'waiting';
  }
  return review(env,order.id,job.claim_token,'provider_requires_review',id);
}

// No Shippo POST is ever retried automatically. A durable conditional claim is
// written before the purchase; ambiguous results require human investigation.
export async function purchaseOrderLabel(env,orderId,deadline=Date.now()+25000){
  if(env.AUTO_PURCHASE_LABELS!=='true')return 'disabled';
  if(!env.STRIPE_SECRET_KEY || !env.SHIPPO_API_TOKEN || !env.SHIP_FROM_ADDRESS)return 'unconfigured';
  const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  let job=await env.DB.prepare('SELECT * FROM shipping_labels WHERE order_id=?').bind(orderId).first();
  if(!order || !job)return 'missing';
  if(order.payment_mode!==paymentMode(env))return 'other_mode';
  if(job.state==='waiting'){
    if(job.next_attempt_at>now())return 'waiting';
    if(!ID.test(job.transaction_id || ''))return review(env,orderId,job.claim_token,'missing_transaction');
    try{return await saveTransaction(env,order,job,await shippoRequest(env,`/transactions/${job.transaction_id}/`,undefined,remaining(deadline)));}
    catch{
      await env.DB.prepare("UPDATE shipping_labels SET updated_at=?,next_attempt_at=? WHERE order_id=? AND state='waiting'").bind(now(),now()+900,orderId).run();
      return 'waiting';
    }
  }
  if(job.state!=='pending' || job.next_attempt_at>now())return job.state;
  const token=crypto.randomUUID();
  const claim=await env.DB.prepare(`UPDATE shipping_labels SET state='preparing',claim_token=?,attempts=attempts+1,updated_at=?
    WHERE order_id=? AND state='pending' AND next_attempt_at<=?`).bind(token,now(),orderId,now()).run();
  if(claim.meta.changes!==1)return 'claimed';
  job={...job,claim_token:token};
  let amount;
  try{
    amount=await preflight(env,order,deadline);
    if(deadline-Date.now()<3000)throw new Error('Time budget');
  }catch(error){
    if(error instanceof Review)return review(env,orderId,token,error.message);
    await env.DB.prepare(`UPDATE shipping_labels SET state=CASE WHEN attempts>=5 THEN 'needs_review' ELSE 'pending' END,
      review_reason='preflight_unavailable',updated_at=?,next_attempt_at=? WHERE order_id=? AND claim_token=? AND state='preparing'`)
      .bind(now(),now()+900,orderId,token).run();
    return 'preflight_unavailable';
  }
  const purchase=await env.DB.prepare(`UPDATE shipping_labels SET state='purchasing',rate_id=?,postage_amount=?,updated_at=?
    WHERE order_id=? AND claim_token=? AND state='preparing'`).bind(order.shipping_rate_id,amount,now(),orderId,token).run();
  if(purchase.meta.changes!==1)return 'claimed';
  let transaction;
  try{
    transaction=await shippoRequest(env,'/transactions/',{rate:order.shipping_rate_id,label_file_type:'PDF_4x6',async:true,metadata:`clickerlab:${orderId}`},remaining(deadline));
    return await saveTransaction(env,order,job,transaction);
  }catch{return review(env,orderId,token,'purchase_result_unknown',ID.test(transaction?.object_id || '')?transaction.object_id:null);}
}

export async function processShippingLabels(env){
  if(env.AUTO_PURCHASE_LABELS!=='true')return;
  const deadline=Date.now()+25000;
  // A stale preflight can be retried (only GETs); an interrupted purchase cannot.
  await env.DB.prepare(`UPDATE shipping_labels SET state='pending',claim_token=NULL,next_attempt_at=?,updated_at=?
    WHERE state='preparing' AND updated_at<?`).bind(now(),now(),now()-600).run();
  await env.DB.prepare(`UPDATE shipping_labels SET state='needs_review',review_reason='purchase_result_unknown',updated_at=?
    WHERE state='purchasing' AND updated_at<?`).bind(now(),now()-600).run();
  const {results}=await env.DB.prepare(`SELECT l.order_id FROM shipping_labels l JOIN orders o ON o.id=l.order_id
    WHERE l.state IN ('pending','waiting') AND l.next_attempt_at<=? AND o.payment_mode=?
    ORDER BY l.next_attempt_at,l.updated_at,l.order_id LIMIT 3`).bind(now(),paymentMode(env)).all();
  const counts={checked:0,errors:0};
  for(const job of results){
    if(deadline-Date.now()<3000)break;
    try{const state=await purchaseOrderLabel(env,job.order_id,deadline);counts.checked++;counts[state]=(counts[state] || 0)+1;}catch{counts.errors++;}
  }
  // Do not expose customer addresses, label URLs, credentials, or provider bodies.
  console.log('Shipping label processing',JSON.stringify(counts));
  return counts;
}
