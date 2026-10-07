"""E2E v0.3: real Code.gs in the browser (gas-shim) + the app UI. Screenshots in test/shots3/."""
import io, json, os, re, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SHOTS = os.path.join(HERE, 'shots3')
os.makedirs(SHOTS, exist_ok=True)
for f in os.listdir(SHOTS): os.remove(os.path.join(SHOTS, f))

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Quiet(handler.func):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}/'

shim = open(os.path.join(HERE, 'gas-shim.js'), encoding='utf8').read()
code = open(ROOT + '/server/Code.gs', encoding='utf8').read()
I18N_KEYS = set(re.findall(r"\b([a-z][a-z0-9]*_[a-z0-9_]+):", open(ROOT + '/assets/i18n.js', encoding='utf8').read()))

buf = io.BytesIO(); Image.new('RGB', (640, 480), (200, 120, 40)).save(buf, 'JPEG'); JPEG = buf.getvalue()

errors = []
def watch(page, name):
    page.on('console', lambda m: errors.append(f'[{name}] console.{m.type}: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append(f'[{name}] pageerror: {e}'))

def shot(page, name, full=True):
    page.wait_for_timeout(350)
    page.screenshot(path=f'{SHOTS}/{name}.png', full_page=full)
    txt = page.inner_text('body')
    rk = [w for w in re.findall(r'\b[a-z]+_[a-z0-9_]+\b', txt) if w in I18N_KEYS]
    if rk: errors.append(f'[{name}] untranslated keys: {sorted(set(rk))}')

def wait(page, sel, name='fail', timeout=8000):
    try:
        page.wait_for_selector(sel, timeout=timeout)
    except Exception:
        t = page.evaluate("(document.getElementById('ub-toast')||{}).textContent || ''")
        page.screenshot(path=f'{SHOTS}/FAIL-{name}.png', full_page=True)
        print('FAILED waiting', sel, '| toast:', t, '| errors:', errors[-5:])
        raise

def use(page, token):
    page.evaluate('t => { localStorage.setItem("ub_token", t); localStorage.removeItem("ub_snap"); }', token)
    page.reload(); page.wait_for_timeout(600)

def toast(page):
    return page.evaluate("(document.getElementById('ub-toast')||{}).textContent || ''")

SEED = """
async () => {
  const call = (a, p) => window.__mockCall(Object.assign({ action: a }, p || {}));
  const ping = await call('ping');
  if (!ping.ok) throw new Error('auto-setup ping ' + ping.error);
  let L = await call('login', { phone: '994500000000', password: 'Master#2026' });
  if (!L.ok || !L.data.mustChange) throw new Error('admin login ' + JSON.stringify(L));
  const T = L.data.token;
  const c = async (a, p) => { const x = await call(a, Object.assign({ token: T }, p)); if (!x.ok) throw new Error(a + ': ' + x.error + ' ' + (x.detail || '')); return x.data; };
  await c('setPassword', { newPassword: 'Admin#2026' });
  await c('saveSettings', { settings: { companyName: 'Usta Təmir MMC', companyVoen: '1700123451', companyPhone: '+994 12 555 00 00', companyAddress: 'Bakı, Nizami küç. 10' } });
  const f1 = await c('saveForeman', { foreman: { name: 'Rəşad Məmmədov', phone: '994501112233', password: 'Temp#2026', payType: 'MONTH', payModel: 'STD_BONUS', baseAmount: 1000, bonusPercent: 10 } });
  const f2 = await c('saveForeman', { foreman: { name: 'Elşən Quliyev', phone: '994502223344', password: 'Temp#2026', payModel: 'STD', baseAmount: 900 } });
  const W = [
    ['Elvin Məmmədov', '994551000001', f1.id, 'Kafelçi', 'senior', 'MONTH', 800, 'STD_BONUS', 'az', '09:00'],
    ['Samir Abbasov', '994551000002', f1.id, 'Suvaqçı', 'master', 'DAY', 40, 'STD', 'tr', '09:00'],
    ['Fərid Kərimov', '994551000003', f1.id, 'Elektrik', 'master', 'MONTH', 700, 'STD_BONUS', 'ru', '07:00'],
    ['Anar Novruzov', '994551000004', f1.id, 'Köməkçi', 'helper', 'DAY', 30, 'BONUS', 'az', '09:00'],
    ['Orxan Qasımov', '994551000005', f2.id, 'Boyaqçı', 'master', 'MONTH', 650, 'STD', 'en', '09:00']
  ];
  const ids = [];
  for (const w of W) ids.push((await c('saveWorker', { worker: { name: w[0], phone: w[1], foremanId: w[2], specialty: w[3], grade: w[4], payType: w[5], baseAmount: w[6], payModel: w[7], lang: w[8], startTime: w[9], endTime: '18:00' } })).id);
  const cust = await c('saveCustomer', { customer: { name: 'Leyla Hüseynova', phone: '994551234567', voen: '1234567890', lang: 'ru' } });
  const site = await c('saveSite', { site: { customerId: cust.id, name: 'Nərimanov, A. Rəcəbli 12, m. 34', address: 'A. Rəcəbli küç. 12', lat: 40.4093, lng: 49.8671, radius: 150, foremanId: f1.id, contractNo: 'M-17', contractDate: '2026-09-20', contractAmount: 14500 } });
  const site2 = await c('saveSite', { site: { customerId: cust.id, name: 'Yasamal, Ş. Mehdiyev 27', address: 'Ş. Mehdiyev 27', lat: 40.3850, lng: 49.8150, radius: 150, foremanId: f2.id } });
  const b = await c('bootstrap', {});
  const kafel = b.workTypes.find(x => x.name === 'Kafel döşəmə'), suvaq = b.workTypes.find(x => x.name === 'Suvaq');
  await c('saveWorkType', { workType: Object.assign({}, kafel, { normType: 'MONTH', normQty: 30 }) });
  await c('saveWorkType', { workType: Object.assign({}, suvaq, { normType: 'DAY', normQty: 20 }) });
  await c('saveEstimate', { estimate: { siteId: site.id, workTypeId: suvaq.id, planQty: 220, clientPrice: 6 } });
  await c('saveEstimate', { estimate: { siteId: site.id, workTypeId: kafel.id, planQty: 90, clientPrice: 18 } });
  return { f1: f1.id, site: site.id, cust: cust.id, workers: ids, kafel: kafel.id, suvaq: suvaq.id };
}
"""

def tok(page, kind, worker_id=None, ref=None):
    return page.evaluate("""([kind, wid, ref]) => {
      const rows = JSON.parse(localStorage.getItem('ub_mock_book')).sheets['Tokens'];
      const H = rows[0];
      const objs = rows.slice(1).map(r => Object.fromEntries(H.map((h, i) => [h, r[i]])));
      const t = objs.filter(o => o.kind === kind && !o.usedAt && !o.cancelledAt && (!wid || o.workerId === wid) && (!ref || o.refId === ref)).pop();
      return t ? t.token : null;
    }""", [kind, worker_id, ref])

def rows(page, sheet):
    return page.evaluate("""(s) => { const rows = JSON.parse(localStorage.getItem('ub_mock_book')).sheets[s]; const H = rows[0]; return rows.slice(1).filter(r => r && r.some(v => v !== '' && v != null)).map(r => Object.fromEntries(H.map((h, i) => [h, r[i]]))); }""", sheet)

NO_STAFF = "(() => { const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return k === 'ub_token' ? null : g.call(this, k); }; })();"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(geolocation={'latitude': 40.40942, 'longitude': 49.86728}, permissions=['geolocation'], locale='az-AZ', accept_downloads=True)
    ctx.add_init_script(shim + '\n' + code + '\nwindow.setup = setup; window.doPost = doPost;')
    ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'), lambda r: r.abort())
    ctx.route(re.compile(r'.*/config\.js(\?.*)?$'), lambda r: r.fulfill(status=200, content_type='application/javascript', body="window.USTABASI_CONFIG={API_URL:'mock',APP_URL:''};"))

    pg = ctx.new_page(); watch(pg, 'seed')
    pg.goto(BASE + 'index.html')
    ids = pg.evaluate(SEED)
    W = ids['workers']
    print('seeded')

    # ---------- foreman: first login → own password
    fm = ctx.new_page(); watch(fm, 'foreman')
    fm.set_viewport_size({'width': 390, 'height': 844})
    fm.goto(BASE + 'index.html')
    shot(fm, '01-login')
    fm.fill('input[name=phone]', '994501112233'); fm.fill('input[name=password]', 'Temp#2026'); fm.click('button[type=submit]')
    wait(fm, '#pw-form', 'pw-setup')
    fm.fill('#pw-form input[name=newPassword]', 'rəşad2026')
    shot(fm, '02-password-rules')
    fm.fill('#pw-form input[name=newPassword]', 'Rəşad#2026'); fm.fill('#pw-form input[name=repeat]', 'Rəşad#2026')
    fm.click('#pw-form button[type=submit]')
    wait(fm, 'text=Salam, Rəşad', 'home')
    shot(fm, '03-foreman-home')

    # ---------- foreman: new site needs a photo
    fm.goto(BASE + 'index.html#/sites'); wait(fm, '[data-act=add]'); fm.click('[data-act=add]')
    wait(fm, '#sf')
    fm.select_option('#sf select[name=customerId]', ids['cust'])
    fm.fill('#sf input[name=name]', 'Xətai, Babək pr. 5, m. 12'); fm.fill('#sf input[name=address]', 'Babək pr. 5')
    fm.click('[data-gps]'); fm.wait_for_timeout(400)
    fm.click('dialog [data-save]'); fm.wait_for_timeout(300)
    assert 'şəkil' in toast(fm).lower(), 'photo required toast: ' + toast(fm)
    fm.set_input_files('#sph', files=[{'name': 'site.jpg', 'mimeType': 'image/jpeg', 'buffer': JPEG}])
    fm.wait_for_selector('#sph-prev img'); fm.wait_for_timeout(500)
    shot(fm, '04-foreman-site-photo')
    fm.click('dialog [data-save]'); fm.wait_for_timeout(900)
    new_site = [s for s in rows(fm, 'Sites') if s['name'].startswith('Xətai')][0]
    assert new_site['status'] == 'PENDING' and new_site['photos'] and new_site['photoLat'], new_site

    # ---------- attendance: link reuse, other phone, staff phone
    fm.goto(BASE + 'index.html#/link?w=' + W[0] + '&k=IN'); wait(fm, '#lf'); fm.click('#lf button[type=submit]'); wait(fm, '[data-wa]')
    t_in = tok(fm, 'IN', W[0])
    fm.goto(BASE + 'index.html#/link?w=' + W[0] + '&k=IN'); wait(fm, '#lf'); fm.click('#lf button[type=submit]'); wait(fm, '[data-wa]')
    assert tok(fm, 'IN', W[0]) == t_in, 'same link reused'
    shot(fm, '05-foreman-link-reused')
    # staff phone (foreman's own browser) → refused
    st = ctx.new_page(); watch(st, 'staff'); st.set_viewport_size({'width': 390, 'height': 844})
    st.goto(BASE + 'u.html?t=' + t_in); wait(st, 'h1')
    shot(st, '06-link-staff-phone')
    st.close()
    us = ctx.new_page(); watch(us, 'usta'); us.add_init_script(NO_STAFF)
    us.set_viewport_size({'width': 390, 'height': 844})
    us.goto(BASE + 'u.html?t=' + t_in); wait(us, '#go')
    shot(us, '07-usta-in')
    us.click('#go'); wait(us, 'text=Təşəkkürlər')
    # other phone → refused and logged
    other = ctx.new_page(); watch(other, 'other'); other.add_init_script(NO_STAFF + "localStorage.setItem('ub_dev','dOTHERPHONE-123');")
    other.set_viewport_size({'width': 390, 'height': 844})
    other.goto(BASE + 'u.html?t=' + t_in); wait(other, 'h1')
    shot(other, '08-link-other-phone')
    other.close()
    us.evaluate("localStorage.setItem('ub_dev', 'dUSTA1-12345678')")
    # Fərid: late (schedule 07:00)
    fm.goto(BASE + 'index.html#/link?w=' + W[2] + '&k=IN'); wait(fm, '#lf'); fm.click('#lf button[type=submit]'); wait(fm, '[data-wa]')
    us.goto(BASE + 'u.html?t=' + tok(fm, 'IN', W[2])); wait(us, '#go'); us.click('#go'); wait(us, '.lg-pin')

    # ---------- work entries (kafel 45 m² Elvin; suvaq 60 m² Elvin 60 / Fərid 40)
    fm.goto(BASE + 'index.html#/work/new'); wait(fm, '#wf')
    fm.select_option('#wf select[name=workTypeId]', ids['kafel']); fm.fill('#wf input[name=qty]', '45'); fm.select_option('#shares select', W[0])
    shot(fm, '09-work-form-norm')
    fm.click('#wf button[type=submit]'); wait(fm, 'text=İş qeydi yadda saxlandı', 'work')
    fm.goto(BASE + 'index.html#/work/new'); wait(fm, '#wf')
    fm.select_option('#wf select[name=workTypeId]', ids['suvaq']); fm.fill('#wf input[name=qty]', '60')
    fm.select_option('#shares select', W[0]); fm.click('[data-act=addShare]'); fm.select_option('#shares select >> nth=1', W[2])
    fm.fill('#shares input >> nth=0', '60'); fm.fill('#shares input >> nth=1', '40')
    fm.click('#wf button[type=submit]'); wait(fm, 'text=İş qeydi yadda saxlandı', 'work2')
    for w in (W[0], W[0], W[2]):
        t2 = tok(fm, 'WORK', w)
        if not t2: continue
        us.goto(BASE + 'u.html?t=' + t2); wait(us, '#yes', 'usta-work')
        if w == W[2]: shot(us, '10-usta-work-ru')
        us.click('#yes'); us.wait_for_selector('.lg-pin')

    # ---------- advance: request
    fm.goto(BASE + 'index.html#/'); wait(fm, '[data-act=adv]'); fm.click('[data-act=adv]')
    fm.select_option('#af select[name=workerId]', W[0]); fm.fill('#af input[name=amount]', '200'); fm.fill('#af input[name=reason]', 'Ailə xərci')
    fm.click('[data-save]'); fm.wait_for_timeout(700)
    # customer payment + expense by foreman
    fm.goto(BASE + 'index.html#/payments'); wait(fm, '[data-act=new]'); fm.click('[data-act=new]'); wait(fm, '#pf')
    fm.select_option('#pf select[name=siteId]', ids['site']); fm.fill('#pf input[name=amount]', '5000'); fm.fill('#pf input[name=note]', 'Avans ödəniş')
    shot(fm, '11-foreman-payment-form')
    fm.click('dialog [data-save]'); fm.wait_for_timeout(700)
    fm.goto(BASE + 'index.html#/expenses'); wait(fm, '[data-act=new]'); fm.click('[data-act=new]'); wait(fm, '#xf')
    fm.select_option('#xf select[name=siteId]', ids['site']); fm.fill('#xf input[name=amount]', '420'); fm.fill('#xf input[name=note]', 'Kafel yapışqanı')
    fm.set_input_files('#xph', files=[{'name': 'qebz.jpg', 'mimeType': 'image/jpeg', 'buffer': JPEG}]); fm.wait_for_selector('#xph-prev img')
    fm.click('dialog [data-save]'); fm.wait_for_timeout(700)

    # ---------- admin (desktop)
    ad = ctx.new_page(); watch(ad, 'admin')
    ad.set_viewport_size({'width': 1280, 'height': 900})
    ftoken = fm.evaluate("localStorage.getItem('ub_token')")
    ad.goto(BASE + 'index.html'); ad.evaluate("localStorage.removeItem('ub_token'); localStorage.removeItem('ub_snap')"); ad.reload()
    ad.fill('input[name=phone]', '994500000000'); ad.fill('input[name=password]', 'Admin#2026'); ad.click('button[type=submit]')
    wait(ad, '#kpi-fund'); ad.wait_for_function("document.querySelector('#kpi-fund').textContent !== '…'")
    atoken = ad.evaluate("localStorage.getItem('ub_token')")
    shot(ad, '12-admin-dashboard')
    ad.click('[data-act=kpi][data-k=late]'); wait(ad, 'dialog[open]')
    shot(ad, '13-admin-late-list', full=False)
    assert 'Fərid' in ad.inner_text('dialog[open]'), 'late list shows Fərid'
    ad.keyboard.press('Escape')
    # site approval with map button and photo
    ad.goto(BASE + 'index.html#/approvals?tab=site'); wait(ad, '[data-d=approve]')
    shot(ad, '14-admin-approve-site')
    assert ad.locator('a[href*="google.com/maps"]').count() >= 1
    ad.locator('[data-d=approve]').first.click(); ad.wait_for_timeout(700)
    # work: approve all
    ad.goto(BASE + 'index.html#/approvals?tab=work'); wait(ad, '[data-d=approve]')
    shot(ad, '15-admin-approvals-work')
    while ad.locator('[data-act=dec][data-d=approve]').count():
        ad.locator('[data-act=dec][data-d=approve]').first.click(); ad.wait_for_timeout(600)
    # payment and expense approvals
    ad.goto(BASE + 'index.html#/approvals?tab=pay'); wait(ad, '[data-d=approve]'); shot(ad, '16-admin-approve-payment')
    ad.locator('[data-d=approve]').first.click(); ad.wait_for_timeout(600)
    ad.goto(BASE + 'index.html#/approvals?tab=exp'); wait(ad, '[data-d=return]')
    ad.locator('[data-d=return]').first.click(); wait(ad, 'dialog[open] textarea'); ad.fill('dialog[open] textarea', 'Qəbz şəkli aydın deyil'); ad.click('dialog[open] [data-ok]'); ad.wait_for_timeout(700)
    ad.goto(BASE + 'index.html#/approvals?tab=adv'); wait(ad, '[data-d=approve]')
    ad.locator('[data-d=approve]').first.click(); ad.wait_for_timeout(700)

    # ---------- foreman: Verdim → link → usta writes a different amount → conflict
    use(fm, ftoken); fm.goto(BASE + 'index.html#/advances'); wait(fm, '[data-ma=given]')
    shot(fm, '17-foreman-adv-approved')
    fm.click('[data-ma=given]'); fm.wait_for_timeout(700)
    fm.goto(BASE + 'index.html#/advances'); wait(fm, '[data-ma=link]'); fm.click('[data-ma=link]'); wait(fm, 'dialog[open] [data-wa]')
    shot(fm, '18-foreman-adv-link', full=False)
    fm.keyboard.press('Escape'); fm.wait_for_timeout(400)
    adv = rows(fm, 'Advances')[0]
    t_adv = tok(fm, 'ADV', None, adv['id'])
    us.goto(BASE + 'u.html?t=' + t_adv); wait(us, '#mf')
    shot(us, '19-usta-advance')
    assert '200' not in us.inner_text('#mf'), 'amount hidden from worker'
    us.fill('#mf input[name=amount]', '150'); us.click('#go'); wait(us, 'dialog[open] [data-ok]'); us.click('dialog[open] [data-ok]')
    wait(us, 'h1:has-text("Məlumat göndərildi")', 'usta-diff')
    shot(us, '20-usta-advance-conflict')
    # admin resolves: return to foreman
    ad.goto(BASE + 'index.html#/money?tab=conflicts'); use(ad, atoken); wait(ad, '[data-ma=conflict]')
    shot(ad, '21-admin-conflicts')
    ad.click('[data-ma=conflict]'); wait(ad, 'dialog[open] textarea'); shot(ad, '22-admin-conflict-dialog', full=False)
    ad.fill('dialog[open] textarea', 'Usta 150 yazıb — yoxlayın'); ad.click('dialog[open] [data-op=return]'); ad.wait_for_timeout(700)
    use(fm, ftoken); fm.goto(BASE + 'index.html#/advances'); wait(fm, '[data-ma=fix]'); fm.click('[data-ma=fix]'); wait(fm, '#af')
    fm.fill('#af input[name=amount]', '150'); fm.click('dialog [data-save]'); fm.wait_for_timeout(700)
    ad.goto(BASE + 'index.html#/approvals?tab=adv'); use(ad, atoken); wait(ad, '[data-d=approve]'); ad.locator('[data-d=approve]').first.click(); ad.wait_for_timeout(700)
    use(fm, ftoken); fm.goto(BASE + 'index.html#/advances'); wait(fm, '[data-ma=given]'); fm.click('[data-ma=given]'); fm.wait_for_timeout(700)
    fm.goto(BASE + 'index.html#/advances'); wait(fm, '[data-ma=link]'); fm.click('[data-ma=link]'); wait(fm, 'dialog[open] [data-wa]'); fm.keyboard.press('Escape'); fm.wait_for_timeout(400)
    us.goto(BASE + 'u.html?t=' + tok(fm, 'ADV', None, adv['id'])); wait(us, '#mf')
    us.fill('#mf input[name=amount]', '150'); us.click('#go'); wait(us, 'dialog[open] [data-ok]'); us.click('dialog[open] [data-ok]')
    wait(us, '#pdf', 'usta-ok')
    shot(us, '23-usta-advance-ok')
    with us.expect_download() as dl:
        us.click('#pdf')
    pdf_path = SHOTS + '/avans.pdf'; dl.value.save_as(pdf_path)
    assert open(pdf_path, 'rb').read(5) == b'%PDF-', 'valid PDF'
    assert [a for a in rows(fm, 'Advances') if a['id'] == adv['id']][0]['status'] == 'CLOSED'

    # ---------- customer payment link (customer language RU)
    use(fm, ftoken); fm.goto(BASE + 'index.html#/payments'); wait(fm, '[data-ma=link]'); fm.click('[data-ma=link]'); wait(fm, 'dialog[open] [data-wa]'); fm.keyboard.press('Escape'); fm.wait_for_timeout(400)
    pay = rows(fm, 'CustomerPayments')[0]
    cu = ctx.new_page(); watch(cu, 'customer'); cu.add_init_script(NO_STAFF + "localStorage.setItem('ub_dev','dCUSTOMER');")
    cu.set_viewport_size({'width': 390, 'height': 844})
    cu.goto(BASE + 'u.html?t=' + tok(fm, 'PAY', None, pay['id'])); wait(cu, '#mf')
    shot(cu, '24-customer-payment-ru')
    cu.fill('#mf input[name=amount]', '5000'); cu.click('#go'); wait(cu, 'dialog[open] [data-ok]'); cu.click('dialog[open] [data-ok]'); wait(cu, '#pdf', 'cust-ok')
    shot(cu, '25-customer-payment-ok')
    # receipt image (print route) + PDF from staff side
    use(fm, ftoken); fm.goto(BASE + 'index.html#/payments'); wait(fm, '[data-ma=pdf]')
    pdfbytes = fm.evaluate("""async () => { const p = UB.data.payments.find(x => x.status === 'CLOSED'); const b = window.UBCore.receiptPdf(UB.receiptData('PAY', p), 'ru'); return new Uint8Array(await b.arrayBuffer()).slice(0, 5).join(','); }""")
    assert pdfbytes == '37,80,68,70,45'
    fm.goto(BASE + 'index.html#/print/preceipt/' + pay['id']); wait(fm, '.receipt-img')
    shot(fm, '26-receipt-print')

    # ---------- foreman fixes returned expense; admin approves
    fm.goto(BASE + 'index.html#/expenses'); wait(fm, '[data-act=fix]'); fm.click('[data-act=fix]'); wait(fm, '#xf')
    fm.set_input_files('#xph', files=[{'name': 'qebz2.jpg', 'mimeType': 'image/jpeg', 'buffer': JPEG}]); fm.wait_for_selector('#xph-prev img')
    fm.click('dialog [data-save]'); fm.wait_for_timeout(700)
    ad.goto(BASE + 'index.html#/approvals?tab=exp'); use(ad, atoken); wait(ad, '[data-d=approve]'); ad.locator('[data-d=approve]').first.click(); ad.wait_for_timeout(700)

    # ---------- offline: foreman writes an expense offline → queued → online → sent
    fm.goto(BASE + 'index.html#/expenses'); wait(fm, '[data-act=new]')
    ctx.set_offline(True)
    fm.evaluate("window.dispatchEvent(new Event('offline'))"); fm.wait_for_timeout(300)
    fm.click('[data-act=new]'); wait(fm, '#xf')
    fm.select_option('#xf select[name=siteId]', ids['site']); fm.fill('#xf input[name=amount]', '35'); fm.fill('#xf input[name=note]', 'Taksi (offline)')
    fm.click('dialog [data-save]'); fm.wait_for_timeout(800)
    wait(fm, '#ub-net[data-s=off]', 'netbar')
    shot(fm, '27-foreman-offline-queued', full=False)
    fm.goto(BASE + 'index.html#/queue'); fm.wait_for_timeout(500); shot(fm, '28-foreman-queue')
    n_before = len(rows(fm, 'Expenses'))
    ctx.set_offline(False)
    fm.evaluate("window.dispatchEvent(new Event('online'))")
    for i in range(40):
        if len(rows(fm, 'Expenses')) == n_before + 1 and fm.locator('#ub-net').count() == 0: break
        fm.wait_for_timeout(250)
    assert len(rows(fm, 'Expenses')) == n_before + 1, 'queued expense sent after reconnect'
    assert fm.locator('#ub-net').count() == 0, 'netbar gone'
    # offline: attendance link is refused (needs server)
    print('offline queue ok')

    # ---------- admin: payroll, close blockers, reports, journal, settings
    ad.goto(BASE + 'index.html#/payroll'); use(ad, atoken); wait(ad, '#pdf')
    ad.fill('#pdf input[name=days]', '22'); ad.click('#pdf button'); ad.wait_for_timeout(700)
    ad.goto(BASE + 'index.html#/payroll'); wait(ad, 'table.t')
    shot(ad, '29-admin-payroll')
    payroll = ad.evaluate("""async () => { const r = await window.UBCore.API.call('calcPayroll', {}); return r.lines.map(l => [l.name, l.daysWorked, l.S, l.bonus, l.advance, l.total, (l.detail||[]).map(d => d.name + ':' + d.fakt + '/' + d.norm + '=' + d.amount).join(' ')]); }""")
    print('payroll lines:'); [print('  ', x) for x in payroll]
    ad.locator('tr.click').first.click(); wait(ad, 'dialog[open]'); shot(ad, '30-admin-payroll-line', full=False); ad.keyboard.press('Escape')
    ad.click('[data-act=close]'); wait(ad, 'dialog[open]')
    shot(ad, '31-admin-close-blockers', full=False)
    ad.keyboard.press('Escape')
    ad.goto(BASE + 'index.html#/reports'); wait(ad, 'table.t'); shot(ad, '32-admin-reports-site-result')
    ad.goto(BASE + 'index.html#/money?tab=pay'); ad.wait_for_timeout(600); shot(ad, '33-admin-money-payments')
    ad.goto(BASE + 'index.html#/journal'); wait(ad, '#jf'); shot(ad, '34-admin-journal')
    ad.goto(BASE + 'index.html#/journal?tab=attempts'); ad.wait_for_timeout(700); shot(ad, '35-admin-attempts')
    ad.goto(BASE + 'index.html#/journal?tab=links'); ad.wait_for_timeout(700); shot(ad, '36-admin-links')
    ad.goto(BASE + 'index.html#/settings'); wait(ad, '#diag-run'); ad.click('#backup-now'); ad.wait_for_timeout(700); shot(ad, '37-admin-settings')
    ad.goto(BASE + 'index.html#/catalog'); ad.wait_for_timeout(500); shot(ad, '38-admin-catalog')
    ad.goto(BASE + 'index.html#/sites'); ad.wait_for_timeout(400); ad.locator('tr.click').first.click(); wait(ad, 'dialog[open]'); ad.wait_for_timeout(700)
    shot(ad, '39-admin-site-detail', full=False); ad.keyboard.press('Escape')
    # admin mobile + print payroll on phone (white background)
    ad.set_viewport_size({'width': 390, 'height': 844})
    ad.goto(BASE + 'index.html#/'); ad.wait_for_timeout(800); shot(ad, '40-admin-mobile')
    ad.goto(BASE + 'index.html#/more'); ad.wait_for_timeout(400); shot(ad, '41-admin-more-logout')
    ad.goto(BASE + 'index.html#/print/payroll'); wait(ad, 'table.pt'); ad.wait_for_timeout(500)
    shot(ad, '42-print-payroll-mobile')
    bg = ad.evaluate("getComputedStyle(document.documentElement).backgroundColor")
    assert bg in ('rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)'), 'print page html background is white: ' + bg
    ad.set_viewport_size({'width': 1280, 'height': 900})
    ad.emulate_media(media='print'); ad.wait_for_timeout(300); ad.screenshot(path=SHOTS + '/43-print-payroll-printmedia.png', full_page=True); ad.emulate_media(media='screen')
    ad.pdf(path=SHOTS + '/vedomost.pdf') if hasattr(ad, 'pdf') else None

    # ---------- Turkish UI
    fm.goto(BASE + 'index.html#/settings'); wait(fm, '.main [data-g=lang][data-l=tr]'); fm.click('.main [data-g=lang][data-l=tr]'); fm.wait_for_timeout(500)
    fm.goto(BASE + 'index.html#/'); fm.wait_for_timeout(500); shot(fm, '44-foreman-home-tr')
    fm.goto(BASE + 'index.html#/more'); fm.wait_for_timeout(300); shot(fm, '45-foreman-more-tr')

    browser.close()

httpd.shutdown()
print('\nERRORS:' if errors else '\nNo console errors.')
for e in errors: print(' ', e)
