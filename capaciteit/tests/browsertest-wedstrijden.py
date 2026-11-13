import json, re, uuid, os
from playwright.sync_api import sync_playwright
base=os.path.dirname(os.path.abspath(__file__))
d=json.load(open(os.path.join(base,'capaciteit-import.json')))
teams=[dict(t,actief=True,kantine_team_id=None) for t in d['teams']]
slots=[dict(id=str(uuid.uuid4()),team_ids=s['team_ids'],label=s['label'],kind=s['kind'],weekday=s['weekday'],start_time=s['start']+':00',end_time=s['end']+':00',units=s['units'],note=None) for s in d['slots']]
m7=json.load(open(os.path.join(base,'matches7.json')))
matches=[dict(id=str(uuid.uuid4()),datum=r['datum'],start_time=r['start']+':00',end_time=r['end']+':00',thuis=r['thuis'],uit=r['uit'],team_id=r['team_id'],leeftijd=r['leeftijd'],units=r['units'],deel=r['deel'],kk_thuis=r['kk_thuis'],kk_uit=r['kk_uit'],status='akkoord',wedstrijdnr=r['nr'],bron='voetbal.nl',note=None) for r in m7]
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
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    pg.route('**/*supabase.co/**',handle)
    pg.goto(url+'?datum=2026-11-07'); pg.wait_for_selector('.blk')
    print('za blokken',pg.locator('.blk').count(),'|',pg.inner_text('#stats').replace('\n',' '))
    print('week',pg.inner_text('#wLabel').replace('\n',' '))
    print('conflicten:',pg.inner_text('#conflicts').replace('\n',' | ')[:500])
    pg.screenshot(path='/tmp/cap-za7.png',full_page=True)
    pg.click('#days button:nth-child(1)'); pg.wait_for_timeout(100); print('ma',pg.locator('.blk').count())
    pg.click('#days button:nth-child(6)')
    # ruimte zoeken als bezoeker
    pg.click('#findBtn'); pg.select_option('#fAge','13'); pg.wait_for_timeout(100)
    print('ruimte O13:',pg.inner_text('#fRes').replace('\n',' ')[:400])
    pg.select_option('#fAge','9'); print('ruimte O9:',pg.inner_text('#fRes').replace('\n',' ')[:300])
    pg.screenshot(path='/tmp/cap-find.png'); pg.keyboard.press('Escape')
    # inloggen als editor
    editor['v']=True; pg.click('#loginBtn'); pg.fill('#lEmail','ws@x.nl'); pg.fill('#lPass','x'); pg.click('#lGo'); pg.wait_for_timeout(300)
    # wedstrijd toevoegen via ruimte zoeken
    pg.click('#findBtn'); pg.select_option('#fAge','9'); pg.wait_for_timeout(100)
    pg.locator('#fRes .res-row').first.locator('button').first.click(); pg.wait_for_timeout(100)
    print('nieuw form:',pg.input_value('#mDate'),pg.input_value('#mStart'),pg.input_value('#mEnd'),pg.inner_text('#mUnitsTxt'))
    pg.fill('#mUit','Test FC O9-1'); pg.select_option('#mTeam','O9-2'); pg.select_option('#mKkU','9'); pg.click('#mSave'); pg.wait_for_timeout(300)
    print('na opslaan:',log[-1][0] if log else None, pg.inner_text('#mErr'))
    # botsende wedstrijd: O13 op HV om 10:00
    pg.click('#newMatchBtn'); pg.select_option('#mTeam','O13-3'); pg.fill('#mUit','Botsing O13'); pg.select_option('#mStart','10:30')
    pg.locator('#mPicker .pf').first.locator('.pn button').click(); pg.select_option('#mKkU','12'); pg.click('#mSave'); pg.wait_for_timeout(200)
    print('botsing:',pg.inner_text('#mErr')[:300]); pg.click('#mSave'); pg.wait_for_timeout(300)
    print('conflictkaart:',pg.inner_text('#conflicts').replace('\n',' | ')[:300])
    pg.screenshot(path='/tmp/cap-za7-edit.png',full_page=True)
    # wedstrijd openen en tijd verschuiven, dan verwijderen
    pg.locator('.blk.conf',has_text='O13-3').first.click(); pg.wait_for_timeout(200); print('geopend:',pg.inner_text('#mTitle'),pg.input_value('#mThuis'),pg.locator('#matchModal').is_visible()); pg.select_option('#mStart','18:45'); pg.click('#mSave'); pg.wait_for_timeout(300); print('fout:',pg.inner_text('#mErr'))
    print('verschoven:',log[-1][0],log[-1][1]['start_time'],log[-1][1]['end_time'], '| conflicten nu:',pg.inner_text('#conflicts')[:80])
    pg.locator('.blk',has_text='O13-3').first.click(); pg.click('#mDel'); pg.click('#mDel'); pg.wait_for_timeout(300); print('del:',log[-1][0])
    # mobiel
    pg2=b.new_page(viewport={'width':390,'height':900}); pg2.route('**/*supabase.co/**',handle); pg2.on('pageerror',lambda e:errs.append(str(e)))
    pg2.goto(url+'?datum=2026-11-07'); pg2.wait_for_selector('.blk'); print('mobiel breder?',pg2.evaluate('document.documentElement.scrollWidth>innerWidth')); pg2.screenshot(path='/tmp/cap-za7-mob.png')
    b.close()
print('JS-fouten:',errs)
