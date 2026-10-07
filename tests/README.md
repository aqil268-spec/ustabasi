# Testlər

Bütün testlər lokal işləyir: server kodu (`server/Code.gs`) saxta Apps Script mühitində (`fakegas.js`, `gas-shim.js`) işə düşür. Canlı server və Google kvotası istifadə olunmur.

| Fayl | Nə yoxlayır | Necə işə salmaq |
| --- | --- | --- |
| `sec.test.js` | Təhlükəsizlik: giriş, rol sərhədi, başqasının datası, linklər, daxil edilən data | `node tests/sec.test.js` |
| `xss.py` | Ekranlarda XSS (HTML/JS yeridilməsi) | `python3 tests/xss.py` |
| `stress.js` | Böyük data (2 il, 200 usta), sürət, cavab ölçüsü, Sheets limiti | `node --max-old-space-size=6000 tests/stress.js` |
| `conn.py` | Zəif / kəsilən internet, oflayn növbə, dublikat, Google "çox sorğu" cavabı | `python3 tests/conn.py` |
| `flow.test.js`, `payroll.test.js`, `seed.test.js`, `cache.test.js` | Biznes axınları, vedomost hesabı, test datası, keş | `node tests/<fayl>` (cache: repo qovluğundan) |
| `e2e3.py` | Tam istifadəçi ssenarisi brauzerdə, ekran şəkilləri | `python3 tests/e2e3.py` |
| `keys.js` | Tərcümə açarları | `node tests/keys.js check` |

Brauzer testləri üçün Playwright və Chromium lazımdır.
