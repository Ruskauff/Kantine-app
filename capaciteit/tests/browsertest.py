import json, re, uuid, sys, os
from playwright.sync_api import sync_playwright
d=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'capaciteit-import.json')))
teams=[dict(t,actief=True,kantine_team_id=None) for t in d['teams']]
slots=[dict(id=str(uuid.uuid4()),team_ids=s['team_ids'],label=s['label'],kind=s['kind'],weekday=s['weekday'],
  start_time=s['start']+':00',end_time=s['end']+':00',units=s['units'],note=None) for s in d['slots']]
editor={'v':False}; log=[]
def handle(route,req):
    u=req.url; m=req.method
    def j(x,st=200): route.fulfill(status=st,content_type='application/json',body=json.dumps(x))
    if 'auth/v1/token' in u:
        b=json.loads(req.post_data)
        if b.get('password')=='goed': return j(dict(access_token='AT',refresh_token='RT',expires_in=3600,user=dict(id='u1',email=b['email'])))
        return j(dict(error_description='Invalid login credentials'),400)
    if 'rpc/cap_is_editor' in u: return j(editor['v'])
    if 'cap_matches' in u: return j([])
    if 'cap_teams' in u and m=='GET': return j(teams)
    if 'cap_settings' in u: return j([{'kleedkamers':12}])
    if 'cap_slots' in u:
        if m=='GET': return j(slots)
        if m=='POST':
            r=json.loads(req.post_data); r['id']=str(uuid.uuid4()); r['start_time']+=':00'; r['end_time']+=':00'; slots.append(r); log.append(('POST',r)); return j([r],201)
        if m=='PATCH':
            sid=re.search(r'id=eq\.([^&]+)',u).group(1); r=json.loads(req.post_data)
            for s in slots:
                if s['id']==sid: s.update(r); s['start_time']=r['start_time']+':00'; s['end_time']=r['end_time']+':00'; log.append(('PATCH',s)); return j([s])
        if m=='DELETE':
            sid=re.search(r'id=eq\.([^&]+)',u).group(1); x=[s for s in slots if s['id']==sid]; slots[:]=[s for s in slots if s['id']!=sid]; log.append(('DEL',sid)); return j(x)
    if 'cap_teams' in u and m=='PATCH': return j([{}])
    route.continue_()
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for W,name in [(1280,'desk'),(390,'mob')]:
        pg=b.new_page(viewport={'width':W,'height':900})
        pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
        pg.route('**/*supabase.co/**',handle)
        pg.goto('file://'+os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','site','index.html')+''); pg.wait_for_selector('.blk')
        pg.click('#days button:nth-child(1)'); pg.wait_for_timeout(200)
        print(name,'ma blokken',pg.locator('.blk').count(),'stats',pg.inner_text('#stats').replace('\n',' '))
        print(name,'pagina breder dan scherm?',pg.evaluate('document.documentElement.scrollWidth>innerWidth'))
        pg.screenshot(path=f'{name}-ma.png',full_page=True)
    pg=b.new_page(viewport={'width':1280,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/*supabase.co/**',handle); pg.goto('file://'+os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','site','index.html')+''); pg.wait_for_selector('.blk')
    for i in range(1,8):
        pg.click(f'#days button:nth-child({i})'); pg.wait_for_timeout(100)
        print('dag',i,pg.locator('.blk').count(),'blokken |',pg.inner_text('#stats').replace('\n',' '))
    # team kiezen
    pg.select_option('#teamSel','O12-1'); pg.wait_for_timeout(100); print('mijn:',pg.inner_text('#mine').replace('\n',' | '))
    pg.screenshot(path='/tmp/cap-team.png',full_page=True)
    pg.select_option('#teamSel','O7-3'); print('O7-3:',pg.inner_text('#mine').replace('\n',' | ')[:150])
    pg.select_option('#teamSel','')
    # teamsview
    pg.click('#views button[data-v=teams]'); print('teamsrijen',pg.locator('#viewTeams tbody tr').count()); pg.screenshot(path='/tmp/cap-teams.png',full_page=True)
    pg.click('#views button[data-v=bord]')
    # login fout & goed (geen editor)
    pg.click('#loginBtn'); pg.fill('#lEmail','x@x.nl'); pg.fill('#lPass','fout'); pg.click('#lGo'); pg.wait_for_timeout(200); print('fout:',pg.inner_text('#lErr'))
    pg.fill('#lPass','goed'); pg.click('#lGo'); pg.wait_for_timeout(300); print('niet-editor newBtn hidden:',pg.locator('#newBtn').is_hidden(), pg.inner_text('#hSub'))
    pg.click('#logoutBtn'); editor['v']=True
    pg.click('#loginBtn'); pg.fill('#lEmail','ws@x.nl'); pg.fill('#lPass','goed'); pg.click('#lGo'); pg.wait_for_timeout(300)
    print('editor:',pg.inner_text('#hSub'), 'newBtn zichtbaar', pg.locator('#newBtn').is_visible())
    # vrijdag: nieuwe training via lege cel KG3-A1 17:00 (vrijdag 17:00 rij)
    pg.click('#days button:nth-child(5)'); pg.wait_for_timeout(100)
    pg.click('#newBtn'); pg.select_option('#eAddTeam','O9-3'); pg.select_option('#eStart','17:00'); pg.select_option('#eEnd','18:00')
    pg.click('#ePicker button[data-u="KG3-A1"]'); pg.click('#eSave'); pg.wait_for_timeout(300); print('nieuw:',log[-1][0], log[-1][1]['units'], pg.locator('.blk').count())
    # botsing: nieuwe training op KG2-A1 18:00 vrijdag (O9-3 staat er al)
    pg.click('#newBtn'); pg.select_option('#eAddTeam','O10-1'); pg.select_option('#eStart','18:30'); pg.select_option('#eEnd','19:30')
    pg.click('#ePicker button[data-u="KG2-A1"]'); pg.click('#eSave'); pg.wait_for_timeout(200); print('botsing:',pg.inner_text('#eErr')[:160], '|knop:',pg.inner_text('#eSave'))
    pg.click('#eSave'); pg.wait_for_timeout(300); print('conflictkaart:',pg.inner_text('#conflicts').replace('\n',' | ')[:200])
    pg.screenshot(path='/tmp/cap-conflict.png',full_page=True)
    # bewerken + verwijderen van conflicterende
    pg.locator('.blk.conf', has_text='O10-1').first.click(); pg.wait_for_timeout(100)
    print('edit titel',pg.inner_text('#eTitle'), pg.input_value('#eStart'))
    pg.click('#eDel'); pg.click('#eDel'); pg.wait_for_timeout(300); print('na delete conflicts leeg:', pg.inner_text('#conflicts')=='' , log[-1][0])
    # wijzigen: O9-3 nieuwe training verlengen
    pg.locator('.blk', has_text='O9-3').first.click(); print('open:',pg.input_value('#eStart'),pg.input_value('#eEnd')); pg.select_option('#eEnd','19:30'); pg.click('#eSave'); pg.wait_for_timeout(300); print('patch:',log[-1][0],log[-1][1]['end_time'] if log[-1][0]=='PATCH' else '', pg.inner_text('#eErr'))
    # cel klikken opent nieuw met voorinvulling
    pg.locator('.cell.edit').nth(5).click(); print('cel->',pg.inner_text('#eTitle'),pg.input_value('#eStart'),pg.inner_text('#eUnitsTxt'))
    pg.keyboard.press('Escape')
    pg.click('#days button:nth-child(6)'); print('za:',pg.inner_text('#board')[:80])
    b.close()
print('JS-fouten:',errs)
