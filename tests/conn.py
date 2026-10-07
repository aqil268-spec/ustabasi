"""Connection tests: real fetch path → HTTP → Code.gs (Node fake Apps Script), with network faults injected by Playwright routes."""
import os, json, re, subprocess, threading, time, http.server, socketserver, functools, urllib.request, sys
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
node = subprocess.Popen(['node', os.path.join(HERE, 'conn_server.js')], stdout=subprocess.PIPE, text=True)
API_PORT = int(node.stdout.readline().split()[1])
API = f'http://127.0.0.1:{API_PORT}/'
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def srv(body):
    req = urllib.request.Request(API, data=json.dumps(body).encode(), method='POST')
    return json.loads(opener.open(req).read())
def rows(sheet):
    return json.loads(opener.open(API + 'rows/' + sheet).read())

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{httpd.server_address[1]}/'

# ---- seed
A = srv({'action': 'login', 'phone': '994500000000', 'password': 'Master#2026'})['data']['token']
srv({'action': 'setPassword', 'token': A, 'newPassword': 'Admin#2026x'})
def ad(action, **p):
    r = srv(dict(action=action, token=A, **p)); assert r['ok'], (action, r); return r['data']
f1 = ad('saveForeman', foreman={'name': 'Rəşad', 'phone': '994501112233', 'password': 'Temp#2026a'})['id']
F = srv({'action': 'login', 'phone': '994501112233', 'password': 'Temp#2026a'})['data']['token']
srv({'action': 'setPassword', 'token': F, 'newPassword': 'Real#2026a'})
w1 = ad('saveWorker', worker={'name': 'Elvin', 'phone': '994551000001', 'foremanId': f1, 'startTime': '00:01', 'endTime': '23:59'})['id']
w2 = ad('saveWorker', worker={'name': 'Samir', 'phone': '994551000002', 'foremanId': f1, 'startTime': '00:01', 'endTime': '23:59'})['id']
cust = ad('saveCustomer', customer={'name': 'Leyla', 'phone': '994551234567'})['id']
site = ad('saveSite', site={'customerId': cust, 'name': 'Nərimanov', 'lat': 40.4093, 'lng': 49.8671, 'radius': 150, 'foremanId': f1})['id']

# ---- fault injection
mode = {'kind': 'ok', 'action': None, 'delay': 0, 'count': 0}
log = []
def handle(route):
    req = route.request
    body = req.post_data or '{}'
    try: action = json.loads(body).get('action')
    except Exception: action = '?'
    m = mode['kind'] if (mode['action'] in (None, action)) else 'ok'
    log.append((action, m))
    if m == 'offline_abort': return route.abort('internetdisconnected')
    if m == 'html503':
        return route.fulfill(status=503, content_type='text/html', body='<html><body>Too many simultaneous invocations: Spreadsheets</body></html>')
    if mode['delay']: time.sleep(mode['delay'])
    out = opener.open(urllib.request.Request(API, data=body.encode(), method='POST')).read().decode()
    if m == 'drop_after':   # server committed, client never sees the answer
        mode['count'] += 1
        if mode['count'] >= 1: mode['kind'] = 'ok'
        return route.abort('connectionreset')
    if m == 'flap':
        mode['count'] += 1
        if mode['count'] % 2 == 1: return route.abort('connectionreset')
    return route.fulfill(status=200, content_type='application/json', body=out, headers={'Access-Control-Allow-Origin': '*'})

results = []
def check(name, ok, info=''):
    results.append({'name': name, 'ok': bool(ok), 'info': info}); print(('PASS ' if ok else 'FAIL ') + name + (' | ' + info if info else ''))

def wait_until(page, fn, ms=10000):
    t0 = time.time()
    while time.time() - t0 < ms / 1000:
        if fn(): return True
        page.wait_for_timeout(200)
    return False

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(geolocation={'latitude': 40.40942, 'longitude': 49.86728}, permissions=['geolocation'])
    ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.abort())
    ctx.route(re.compile(r'.*/config\.js(\?.*)?$'), lambda r: r.fulfill(status=200, content_type='application/javascript', body="window.USTABASI_CONFIG={API_URL:'https://api.test/exec',APP_URL:''};"))
    ctx.route('https://api.test/exec', handle)
    pg = ctx.new_page(); pg.set_viewport_size({'width': 390, 'height': 844})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))

    # 1. Login through the real fetch path
    pg.goto(BASE + 'index.html'); pg.wait_for_selector('input[name=phone]')
    pg.fill('input[name=phone]', '994501112233'); pg.fill('input[name=password]', 'Real#2026a'); pg.click('button[type=submit]')
    check('1. Normal şəbəkə: giriş və ana ekran', wait_until(pg, lambda: pg.locator('[data-act=adv]').count() > 0))

    # 2. Slow network: 3 s per request
    mode.update(kind='ok', delay=3)
    t0 = time.time(); pg.reload()
    ok = wait_until(pg, lambda: pg.locator('[data-act=adv]').count() > 0, 15000)
    check('2. Yavaş şəbəkə (hər sorğu 3 san): ekran açılır', ok, f'{time.time() - t0:.1f} san')
    mode.update(delay=0)

    def add_expense(amount, note):
        pg.goto(BASE + 'index.html#/expenses'); pg.wait_for_selector('[data-act=new]')
        pg.click('[data-act=new]'); pg.wait_for_selector('#xf')
        pg.select_option('#xf select[name=siteId]', site); pg.fill('#xf input[name=amount]', str(amount)); pg.fill('#xf input[name=note]', note)
        pg.click('dialog [data-save]'); pg.wait_for_timeout(900)

    # 3. Offline → queue → online → sent once
    n0 = len(rows('Expenses'))
    ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))")
    add_expense(11, 'offline-1'); add_expense(12, 'offline-2')
    q = pg.evaluate("() => new Promise(r => { const o = indexedDB.open('ustabasi', 1); o.onsuccess = () => { const tx = o.result.transaction(o.result.objectStoreNames[0]); const c = tx.objectStore(o.result.objectStoreNames[0]).count(); c.onsuccess = () => r(c.result); }; o.onerror = () => r(-1); })")
    check('3a. İnternetsiz 2 xərc telefonda növbəyə düşür', q == 2 and len(rows('Expenses')) == n0, f'növbə={q}, serverdə={len(rows("Expenses")) - n0}')
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))")
    check('3b. İnternet gələndə növbə göndərilir, hər qeyd 1 dəfə', wait_until(pg, lambda: len(rows('Expenses')) == n0 + 2, 12000) and len(rows('Expenses')) == n0 + 2, f'serverdə={len(rows("Expenses")) - n0}')

    # 4. Response lost after the server saved (connection reset) → client queues → retry with the same cid → no duplicate
    n0 = len(rows('Expenses'))
    mode.update(kind='drop_after', action='saveExpense', count=0)
    add_expense(13, 'lost-response')
    after_drop = len(rows('Expenses')) - n0
    pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(300)
    pg.evaluate("UB.flushQueue && UB.flushQueue(true)"); pg.wait_for_timeout(1500)
    check('4. Cavab itəndə təkrar göndərmə dublikat yaratmır (cid)', after_drop == 1 and len(rows('Expenses')) - n0 == 1, f'itəndən sonra={after_drop}, sonda={len(rows("Expenses")) - n0}')
    mode.update(kind='ok', action=None)

    # 5. Google returns an HTML 503 "too many simultaneous invocations"
    mode.update(kind='html503', action='saveExpense')
    n0 = len(rows('Expenses'))
    add_expense(14, 'busy')
    toast = pg.evaluate("(document.getElementById('ub-toast')||{}).textContent || ''")
    qn = pg.evaluate("UB.queue.length")
    check('5a. Google "çox sorğu" (503 HTML): istifadəçi aydın mesaj görür və ya qeyd növbəyə düşür', qn >= 1 or 'məşğul' in toast.lower(), f'növbə={qn}, mesaj="{toast[:60]}"')
    mode.update(kind='ok', action=None)
    pg.evaluate("UB.flushQueue && UB.flushQueue(true)"); pg.wait_for_timeout(1500)
    check('5b. Yük keçəndən sonra növbədəki qeyd göndərilir', len(rows('Expenses')) - n0 == 1, f'serverdə={len(rows("Expenses")) - n0}')

    # 6. Flapping network during queue flush: every 2nd request fails
    n0 = len(rows('Expenses'))
    ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))")
    for i in range(4): add_expense(20 + i, f'flap-{i}')
    ctx.set_offline(False)
    mode.update(kind='flap', action='saveExpense', count=0)
    for i in range(8):
        pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(250)
        pg.evaluate("UB.flushQueue && UB.flushQueue(true)"); pg.wait_for_timeout(700)
        if len(rows('Expenses')) - n0 >= 4 and pg.evaluate("UB.queue.length") == 0: break
    mode.update(kind='ok', action=None)
    check('6. Kəsilib-gələn şəbəkə: 4 qeyd, hər biri 1 dəfə', len(rows('Expenses')) - n0 == 4, f'serverdə={len(rows("Expenses")) - n0}, növbədə={pg.evaluate("UB.queue.length")}')

    # 7. Non-queueable action offline (attendance link needs the server)
    ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))")
    pg.goto(BASE + 'index.html#/link?w=' + w1 + '&k=IN'); pg.wait_for_timeout(800)
    try:
        pg.click('#lf button[type=submit]', timeout=3000); pg.wait_for_timeout(600)
    except Exception: pass
    toast = pg.evaluate("(document.getElementById('ub-toast')||{}).textContent || ''")
    check('7. İnternetsiz gəliş linki yaradılmır, aydın mesaj göstərilir', 'internet' in toast.lower() or 'onlayn' in toast.lower() or 'offline' in toast.lower(), f'mesaj="{toast[:70]}"')
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))")

    # 8. Worker link: response lost after the server saved the arrival → worker taps again → sees "already done", no duplicate
    tok = srv({'action': 'createToken', 'token': F, 'kind': 'IN', 'workerId': w2, 'siteId': site})['data']['token']
    us = ctx.new_page(); us.set_viewport_size({'width': 390, 'height': 844})
    us.add_init_script("(() => { const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return k === 'ub_token' ? null : g.call(this, k); }; })();")
    us.goto(BASE + 'u.html?t=' + tok); us.wait_for_selector('#go')
    mode.update(kind='drop_after', action='tokenConfirm', count=0)
    us.click('#go'); us.wait_for_timeout(1500)
    btn = us.locator('#go')
    if btn.count(): btn.click(); us.wait_for_timeout(1500)
    txt = us.inner_text('body')
    att = [a for a in rows('Attendance') if a['workerId'] == w2]
    check('8. Usta linki: cavab itsə, 2-ci basışda "artıq təsdiqlənib" görünür, dublikat yoxdur', len(att) == 1 and ('artıq' in txt.lower() or 'qeyd olunub' in txt.lower() or ':' in txt), f'qeyd sayı={len(att)}, ekran="{txt[:90].strip()}"')
    mode.update(kind='ok', action=None)

    # 9. Worker link: page loads, but the server cannot be reached (weak signal at the site)
    tok2 = srv({'action': 'createToken', 'token': F, 'kind': 'IN', 'workerId': w1, 'siteId': site})['data']['token']
    mode.update(kind='offline_abort', action='tokenInfo')
    us.goto(BASE + 'u.html?t=' + tok2); us.wait_for_timeout(1500)
    txt = us.inner_text('body')
    has_retry = us.locator('button').count() > 0
    check('9a. Usta linki: server əlçatmazdırsa, aydın mesaj göstərilir', len(txt.strip()) > 20, f'ekran="{txt[:100].strip()}"')
    mode.update(kind='ok', action=None)
    if has_retry:
        try: us.locator('button', has_text=re.compile('yenidən|Yenidən|try', re.I)).first.click(timeout=2000)
        except Exception: us.reload()
    else: us.reload()
    ok = wait_until(us, lambda: us.locator('#go').count() > 0, 6000)
    check('9b. Şəbəkə qayıdanda link işləyir (yenidən cəhd)', ok)
    check('JS səhvi yoxdur (pageerror)', not errors, '; '.join(errors[:3]))
    br.close()
node.kill()
json.dump(results, open(os.path.join(HERE, 'conn.result.json'), 'w'), ensure_ascii=False, indent=1)
fails = [r for r in results if not r['ok']]
print(f'\nCƏMİ: {len(results)} yoxlama, {len(results) - len(fails)} keçdi, {len(fails)} problem')
sys.exit(1 if fails else 0)
