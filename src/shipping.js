const STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
export function normalizeAddress(address) {
  const result = {};
  for (const field of ['name','street1','street2','city','state','zip','country']) {
    if (address?.[field] !== undefined && typeof address[field] !== 'string') throw new Error('Invalid address');
    result[field] = (address?.[field] || '').trim();
    if (result[field].length > 150) throw new Error('Invalid address');
  }
  result.state = result.state.toUpperCase();
  result.country = result.country.toUpperCase();
  if(!result.name || !result.street1 || !result.city || !STATES.has(result.state) ||
     !/^\d{5}(-\d{4})?$/.test(result.zip) || result.country !== 'US') throw new Error('Enter a complete US shipping address.');
  return result;
}
export function rateAmount(value) {
  if(typeof value !== 'string' || !/^\d{1,5}\.\d{2}$/.test(value)) throw new Error('Invalid shipping amount');
  const [whole,cents] = value.split('.');
  const amount = Number(whole)*100+Number(cents);
  if(!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid shipping amount');
  return amount;
}
export async function shippoRequest(env,path,payload) {
  const response = await fetch(`https://api.goshippo.com${path}`,{
    method:payload ? 'POST':'GET',
    headers:{Authorization:`ShippoToken ${env.SHIPPO_API_TOKEN}`,'Content-Type':'application/json','SHIPPO-API-VERSION':'2018-02-08'},
    body:payload ? JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)
  });
  if(!response.ok) throw new Error('Shippo API returned HTTP '+response.status);
  return response.json();
}
export async function shippingRates(request,env) {
  if(!env.SHIPPO_API_TOKEN || !env.SHIP_FROM_ADDRESS || !env.STORE_URL) {
    return Response.json({error:'Shipping rates are not configured yet.'},{status:503});
  }
  if(request.headers.get('Origin') !== new URL(env.STORE_URL).origin) return Response.json({error:'Invalid origin'},{status:403});
  let address;
  try {address = normalizeAddress((await request.json()).address);} catch {
    return Response.json({error:'Enter a complete US shipping address.'},{status:400});
  }
  try {
    const from = normalizeAddress(JSON.parse(env.SHIP_FROM_ADDRESS));
    const shipment = await shippoRequest(env,'/shipments/',{
      address_from:from,address_to:address,
      parcels:[{length:'6',width:'4',height:'2',distance_unit:'in',weight:'0.2',mass_unit:'lb'}],async:false
    });
    if(shipment.test !== true) throw new Error('Shippo test mode is required.');
    const rates = (shipment.rates || []).filter(rate=>
      rate.provider === 'USPS' && rate.currency === 'USD' && rate.servicelevel?.token === 'usps_ground_advantage'
    ).map(rate=>({id:rate.object_id,amount:rateAmount(rate.amount),service:'USPS Ground Advantage',days:rate.estimated_days || null}));
    if(!rates.length || rates.some(rate=>!/^[a-f0-9]{32}$/.test(rate.id))) throw new Error('No USPS Ground Advantage rate is available for this address.');
    rates.sort((a,b)=>a.amount-b.amount);
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO shipping_quotes(id,address_json,rates_json,created_at) VALUES (?,?,?,?)')
      .bind(id,JSON.stringify(address),JSON.stringify(rates),Math.floor(Date.now()/1000)).run();
    return Response.json({quoteId:id,rates},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    // Log only our own diagnostics, never tokens, addresses, or provider bodies.
    console.warn('shipping-rate-check',error.message);
    return Response.json({error:error.message.startsWith('No USPS') ? error.message:'Unable to retrieve USPS rates. Please try again.'},{status:502});
  }
}
export async function checkoutShipping(env,body) {
  if(!/^[a-f0-9-]{36}$/.test(body.quoteId || '') || !/^[a-f0-9]{32}$/.test(body.rateId || '')) throw new Error('Choose a USPS shipping rate first.');
  const quote = await env.DB.prepare('SELECT * FROM shipping_quotes WHERE id=?').bind(body.quoteId).first();
  if(!quote || Date.now()/1000-quote.created_at>900) throw new Error('Your shipping quote expired. Please get a new rate.');
  const selected = JSON.parse(quote.rates_json).find(rate=>rate.id===body.rateId);
  if(!selected) throw new Error('Invalid shipping rate.');
  const fresh = await shippoRequest(env,`/rates/${selected.id}/`);
  if(fresh.object_id!==selected.id || fresh.provider!=='USPS' || fresh.currency!=='USD' ||
     fresh.servicelevel?.token!=='usps_ground_advantage' || fresh.test!==true || rateAmount(fresh.amount)!==selected.amount) {
    throw new Error('Shipping rates changed. Please get a new rate.');
  }
  return {quoteId:quote.id,rateId:selected.id,amount:selected.amount,service:selected.service,address:JSON.parse(quote.address_json)};
}
