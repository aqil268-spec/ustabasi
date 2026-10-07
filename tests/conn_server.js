// Real Code.gs (fake Apps Script) behind an HTTP endpoint, for connection tests with the real fetch path.
// Prints "PORT <n>" when ready. POST / → doPost. GET /rows/<Sheet> → row count (non-empty).
const http = require('http');
const { load } = require('./fakegas');
const { env, api } = load(process.argv[2] || require('path').join(__dirname, '..', 'server', 'Code.gs'));
api.setup();
const srv = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/rows/')) {
    const n = decodeURIComponent(req.url.slice(6));
    const rows = (env.state.sheets[n] || { rows: [] }).rows;
    const head = rows[0] || [];
    const list = rows.slice(1).filter(r => r && r.some(v => v !== '' && v !== undefined)).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(list));
  }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    env.reset();
    let out;
    try { out = api.doPost({ postData: { contents: body } }).s; } catch (e) { out = JSON.stringify({ ok: false, error: 'server', detail: String(e) }); }
    env.endExec();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(out);
  });
});
srv.listen(0, '127.0.0.1', () => console.log('PORT ' + srv.address().port));
