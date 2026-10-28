"""Private owner report. Requires Cloudflare D1 read access; prints no customer details."""
import os,json,urllib.request,argparse,datetime
parser=argparse.ArgumentParser();parser.add_argument('--days',type=int,default=30);parser.add_argument('--database',default='f9b1db32-77ce-4743-9478-63f0da6d486d');parser.add_argument('--output');args=parser.parse_args()
assert 1<=args.days<=30,'Choose 1–30 days (event retention is 30 days).'
start=int(datetime.datetime.now(datetime.timezone.utc).timestamp())-args.days*86400
sql=f"""
SELECT event,COUNT(*) AS events,COUNT(DISTINCT session_id) AS sessions FROM funnel_events WHERE created_at>={start} GROUP BY event ORDER BY event;
SELECT page,COUNT(*) AS views,COUNT(DISTINCT session_id) AS sessions FROM funnel_events WHERE event='page_view' AND created_at>={start} GROUP BY page ORDER BY views DESC;
WITH visits AS (SELECT DISTINCT session_id FROM funnel_events WHERE created_at>={start}) SELECT COUNT(DISTINCT o.analytics_session_id) AS paid_sessions,COUNT(*) AS paid_orders FROM orders o JOIN visits v ON v.session_id=o.analytics_session_id WHERE o.payment_mode='live' AND o.status='paid' AND o.paid_at IS NOT NULL;
WITH views AS (SELECT page,session_id,LEAD(page) OVER(PARTITION BY session_id ORDER BY created_at,rowid) AS next_page FROM funnel_events WHERE event='page_view' AND created_at>={start}) SELECT page,next_page,COUNT(*) AS transitions FROM views WHERE next_page IS NOT NULL AND page!=next_page GROUP BY page,next_page ORDER BY transitions DESC LIMIT 20;
SELECT kind,code,datetime(updated_at,'unixepoch') AS time_utc FROM store_diagnostics;
"""
request=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database/'+args.database+'/query',headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},data=json.dumps({'sql':sql}).encode())
response=json.load(urllib.request.urlopen(request,timeout=30))
if not response.get('success'):raise SystemExit('Unable to read private funnel report.')
sections=['Shopping steps (sessions are deduplicated per step)','Page views','Verified paid conversions among measured sessions','Common page transitions','Latest internal diagnostics']
text='# ClickerLabStore funnel report\n\nLast '+str(args.days)+' days. These are measured browser-tab sessions, not unique people. Bots, blockers, opt-outs, separate tabs and retries affect counts. Step counts are not a strict ordered funnel. Payments are verified using paid live orders, not browser claims.\n'
for title,result in zip(sections,response['result']):
 text+='\n## '+title+'\n\n';rows=result['results']
 if not rows:text+='No data yet.\n';continue
 keys=list(rows[0]);text+='| '+' | '.join(keys)+' |\n| '+' | '.join('---' for _ in keys)+' |\n'
 for row in rows:text+='| '+' | '.join(str(row[k] if row[k] is not None else '') for k in keys)+' |\n'
if args.output:open(args.output,'w').write(text);print('Private report saved:',args.output)
else:print(text)
