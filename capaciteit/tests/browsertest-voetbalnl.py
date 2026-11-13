import json, re, uuid, os
from playwright.sync_api import sync_playwright
base=os.path.dirname(os.path.abspath(__file__))
d=json.load(open(os.path.join(base,'capaciteit-import.json')))
teams=[dict(t,actief=True,kantine_team_id=None) for t in d['teams']]
slots=[dict(id=str(uuid.uuid4()),team_ids=s['team_ids'],label=s['label'],kind=s['kind'],weekday=s['weekday'],start_time=s['start']+':00',end_time=s['end']+':00',units=s['units'],note=None) for s in d['slots']]
m7=json.load(open(os.path.join(base,'matches7.json')))+json.load(open(os.path.join(base,'capaciteit-wedstrijden-voetbalnl.json')))
matches=[dict(id=str(uuid.uuid4()),datum=r['datum'],start_time=r['start']+':00',end_time=r['end']+':00',thuis=r['thuis'],uit=r['uit'],team_id=r['team_id'],leeftijd=r['leeftijd'],units=r['units'],deel=r['deel'],kk_thuis=r['kk_thuis'],kk_uit=r['kk_uit'],status='akkoord',wedstrijdnr=r['nr'],bron='voetbal.nl',note=r.get('note')) for r in m7]
editor={'v':False}; log=[]; errs=[]
def fix(r):
    for k in ('start_time','end_time'):
        if len(r[k])==5: r[k]+=':00'
    return r
def handle(route,req):
    u=req.url; m=req.method
    def j(x,st=200): route.fulfill(status=st,content_type='application/json',body=json.dumps(x))
    if 'auth/v1/token' in u: return j(dict(access_token='AT',refresh_token='RT',expires_in=3600,user=dict(id='u1',email='ws@x.nl')))
    if 'rpc/cap_is_editor' in u: return j(editor['v'])
    if 'cap_teams' in u: return j(teams if m=='GET' else [{}])
    if 'cap_settings' in u: return j([{'id':1,'kleedkamers':12,'duur':{"7":20,"8":60,"9":60,"10":75,"11":75,"12":90,"13":90,"14":105,"15":105,"16":120,"17":120,"19":135,"99":135}}])
    if 'cap_slots' in u:
        if m=='GET': return j(slots)
    if 'cap_matches' in u:
        if m=='GET':
            lo=re.search(r'datum=gte\.([\d-]+)',u).group(1); hi=re.search(r'datum=lte\.([\d-]+)',u).group(1)
            return j([x for x in matches if lo<=x['datum']<=hi])
        if m=='POST': r=fix(json.loads(req.post_data)); r['id']=str(uuid.uuid4()); matches.append(r); log.append(('POST',r)); return j([r],201)
        if m=='PATCH':
            sid=re.search(r'id=eq\.([^&]+)',u).group(1); r=fix(json.loads(req.post_data))
            for x in matches:
                if x['id']==sid: x.update(r); log.append(('PATCH',x)); return j([x])
        if m=='DELETE':
            sid=re.search(r'id=eq\.([^&]+)',u).group(1); x=[s for s in matches if s['id']==sid]; matches[:]=[s for s in matches if s['id']!=sid]; log.append(('DEL',sid)); return j(x)
    route.continue_()
url='file://'+os.path.join(base,'..','site','index.html')
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1280,'height':1000})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/*supabase.co/**',handle)
    for d in ['2026-11-13','2026-11-14','2026-11-18','2026-11-21','2026-11-27','2026-11-28','2026-11-29']:
        pg.goto(url+'?datum='+d); pg.wait_for_timeout(700)
        print(d, pg.locator('.blk').count(),'|',pg.inner_text('#stats').replace('\n',' '),'|',pg.inner_text('#conflicts').replace('\n',' / ')[:260])
        pg.screenshot(path='/tmp/cap-d'+d+'.png',full_page=True)
    # in te delen 27-11: plek zoeken als editor
    editor['v']=True; pg.goto(url+'?datum=2026-11-27'); pg.wait_for_timeout(600)
    pg.click('#loginBtn'); pg.fill('#lEmail','ws@x.nl'); pg.fill('#lPass','x'); pg.click('#lGo'); pg.wait_for_timeout(400)
    pg.locator('#conflicts button',has_text='Plek zoeken').first.click(); pg.wait_for_timeout(200)
    print('intro:',pg.inner_text('#fIntro')); print('res:',pg.inner_text('#fRes').replace('\n',' ')[:200])
    pg.locator('#fRes .res-row button').first.click(); pg.wait_for_timeout(200)
    print('form:',pg.inner_text('#mTitle'),pg.input_value('#mStart'),pg.input_value('#mEnd'),pg.inner_text('#mUnitsTxt'))
    pg.click('#mSave'); pg.wait_for_timeout(300); print('save:',log[-1][0] if log else None,pg.inner_text('#mErr')[:150])
    print('daarna:',pg.inner_text('#conflicts').replace('\n',' / ')[:120])
    b.close()
print('JS-fouten:',errs)
