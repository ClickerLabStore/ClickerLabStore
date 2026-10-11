export function paymentMode(env) {
  const mode=env.PAYMENT_MODE || 'test';
  if(!['test','live'].includes(mode)) throw new Error('Invalid payment mode');
  return mode;
}
export function isLive(env) {return paymentMode(env)==='live';}
