"""XSS test: every free-text field gets an HTML payload; all screens are opened; the DOM must not contain injected elements."""
import os, json, re, threading, http.server, socketserver, functools, sys
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}/'
shim = open(os.path.join(HERE, 'gas-shim.js'), encoding='utf8').read()
code = open(ROOT + '/server/Code.gs', encoding='utf8').read()

P = '<img src=x1 onerror="window.__x=(window.__x||0)+1"><svg onload="window.__x=9">'
SEED = """
async (P) => {
  const call = (a, p) => window.__mockCall(Object.assign({ action: a }, p || {}));
  await call('ping');
  let L = await call('login', { phone: '994500000000', password: 'Master#2026' });
  const T = L.data.token;
  const c = async (a, p) => { const x = await call(a, Object.assign({ token: T }, p)); if (!x.ok) throw new Error(a + ': ' + x.error + ' ' + (x.detail||'')); return x.data; };
  await c('setPassword', { newPassword: 'Admin#2026' });
  await c('saveSettings', { settings: { companyName: 'Co' + P, companyAddress: P, expenseCategories: 'Material,' + P, penaltyTypes: 'Gecikmə,' + P } });
  const f1 = await c('saveForeman', { foreman: { name: 'F' + P, phone: '994501112233', password: 'Temp#2026', payModel: 'STD_BONUS', baseAmount: 1000, bonusPercent: 10 } });
  const w = await c('saveWorker', { worker: { name: 'W' + P, phone: '994551000001', foremanId: f1.id, specialty: P, payType: 'MONTH', baseAmount: 800, payModel: 'STD_BONUS', startTime: '00:01', endTime: '23:59' } });
  const cust = await c('saveCustomer', { customer: { name: 'C' + P, phone: '994551234567', lang: 'az' } });
  const site = await c('saveSite', { site: { customerId: cust.id, name: 'S' + P, address: P, lat: 40.4093, lng: 49.8671, radius: 150, foremanId: f1.id, contractNo: P } });
  const wt = await c('saveWorkType', { workType: { name: 'T' + P, unit: P, normType: 'DAY', normQty: 10 } });
  await c('saveEstimate', { estimate: { siteId: site.id, workTypeId: wt.id, planQty: 100, clientPrice: 5 } });
  await c('addDeduction', { deduction: { workerId: w.id, type: 'PENALTY', amount: 5, reason: P, category: P, date: new Date().toISOString().slice(0,10) } });
  const L2 = await call('login', { phone: '994501112233', password: 'Temp#2026' });
  const FT = L2.data.token;
  await call('setPassword', { token: FT, newPassword: 'Fore#2026x' });
  const f = async (a, p) => { const x = await call(a, Object.assign({ token: FT }, p)); if (!x.ok) throw new Error(a + ': ' + x.error + ' ' + (x.detail||'')); return x.data; };
  const tin = await f('createToken', { kind: 'IN', workerId: w.id, siteId: site.id });
  const we = await f('saveWorkEntry', { entry: { siteId: site.id, workTypeId: wt.id, qty: 20, note: P }, shares: [{ workerId: w.id, share: 100 }] });
  const adv = await f('requestAdvance', { workerId: w.id, amount: 10, reason: P });
  const adv2 = await f('requestAdvance', { workerId: w.id, amount: 12, reason: P });
  await c('decide', { type: 'adv', id: adv2.id, decision: 'approve' });
  await f('markAdvance', { id: adv2.id, status: 'GIVEN' });
  const ml = await f('moneyLink', { kind: 'ADV', id: adv2.id });
  const pay = await f('addPayment', { payment: { siteId: site.id, amount: 100, note: P } });
  const ex = await f('saveExpense', { expense: { siteId: site.id, amount: 5, category: P, note: P } });
  await f('manualAttendance', { workerId: w.id, siteId: site.id, kind: 'IN', reason: P });
  await c('decide', { type: 'pay', id: pay.id, decision: 'return', reason: P });
  return { admin: T, fm: FT, tin: tin.token, twork: we.links[0].token, tadv: ml.token, site: site.id, worker: w.id, adv: adv2.id };
}
"""
found = []
def probe(page, name):
    page.wait_for_timeout(500)
    r = page.evaluate("() => ({ x: window.__x || 0, n: document.querySelectorAll('img[src=x1], svg[onload]').length })")
    if r['x'] or r['n']: found.append(f'{name}: executed={r["x"]} injected_elements={r["n"]}')
    return r

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(geolocation={'latitude': 40.40942, 'longitude': 49.86728}, permissions=['geolocation'])
    ctx.add_init_script(shim + '\n' + code + '\nwindow.setup = setup; window.doPost = doPost;')
    ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.abort())
    ctx.route(re.compile(r'.*/config\.js(\?.*)?$'), lambda r: r.fulfill(status=200, content_type='application/javascript', body="window.USTABASI_CONFIG={API_URL:'mock',APP_URL:''};"))
    pg = ctx.new_page(); pg.goto(BASE + 'index.html')
    ids = pg.evaluate(SEED, P)
    screens = 0
    for role, tok, routes in [
        ('admin', ids['admin'], ['', 'approvals', 'money', 'payroll', 'foremen', 'workers', 'sites', 'reports', 'catalog', 'journal', 'settings', 'more', 'print/receipt/' + ids['adv']]),
        ('foreman', ids['fm'], ['', 'workers', 'work', 'advances', 'payments', 'expenses', 'sites', 'settings', 'more', 'interim?w=' + ids['worker'], 'link?w=' + ids['worker'] + '&k=IN'])]:
        pg.evaluate('t => { localStorage.setItem("ub_token", t); localStorage.removeItem("ub_snap"); }', tok)
        for r in routes:
            pg.goto(BASE + 'index.html#/' + r); pg.reload(); pg.wait_for_timeout(900)
            probe(pg, f'{role} #/{r}'); screens += 1
            # open every clickable row/dialog on the screen (first 6)
            rows = pg.query_selector_all('.click, [data-act=edit], [data-act=open]')[:6]
            for i in range(len(rows)):
                try:
                    el = pg.query_selector_all('.click, [data-act=edit], [data-act=open]')[i]
                    el.click(timeout=1500); probe(pg, f'{role} #/{r} → click {i}'); screens += 1
                    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
                except Exception: pass
    # link pages
    pg.evaluate('() => localStorage.removeItem("ub_token")')
    for k in ['tin', 'twork', 'tadv']:
        pg.goto(BASE + 'u.html?t=' + ids[k]); probe(pg, 'link ' + k); screens += 1
    br.close()
print('screens/dialogs checked:', screens)
print('XSS FOUND:' if found else 'No XSS found.')
for f in found: print('  ', f)
json.dump({'screens': screens, 'found': found}, open(os.path.join(HERE, 'xss.result.json'), 'w'))
sys.exit(1 if found else 0)
