// Local mock for the third-party APIs IVIS calls (ROP vehicle lookup + payment status).
// No dependencies: `node apis/server.js`  (or `npm run dev` inside apis/).
//
//   ROP lookup      GET /rop-api?plateNumber=XXXX     -> { success, data }   (404 if unknown and autogen off)
//   Payment status  GET /payment-api?plate=XXXX       -> { advance, paid }
//   Control panel   GET /docs                         -> HTML page to add / edit / delete plates
//
// Env: PORT (3400), MOCK_AUTOGEN (default "true": any unknown plate gets a generated ROP record
// and payment status paid=true, so tests never stall on missing data. Set "false" to test the
// "no ROP record" / unpaid paths).

const http = require('http');

const PORT = Number(process.env.PORT) || 3400;
const AUTOGEN = (process.env.MOCK_AUTOGEN || 'true').toLowerCase() !== 'false';

const norm = (p) => String(p || '').toUpperCase().replace(/\s+/g, '');
const rop = new Map(); // plate -> ROP data
const pay = new Map(); // plate -> { advance, paid }

const makeRop = (plate) => ({
  plateNumber: plate,
  vinNumber: 'VIN' + plate.padEnd(14, '0').slice(0, 14),
  ownerName: 'Test Owner ' + plate,
  ownerPhone: '91234567',
  driverName: 'Test Driver ' + plate,
  driverPhone: '92345678',
  mulkiyaId: 'MUL' + plate.replace(/\W/g, '').padEnd(8, '0').slice(0, 8),
  make: 'Toyota',
  model: 'Corolla',
  year: 2020,
  color: 'White',
  plateColour: 'White',
  vehicleColor: 'White',
  vehicleType: 'Private',
  vehicleCategory: 'Light',
  insurance: 'Test Insurance Co',
  insurancePolicyNo: 'POL-' + plate,
  insuranceExpiry: '2030-12-31',
  regExpiry: '2030-12-31',
});

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => {
      try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); }
    });
  });

const PAGE = `<!doctype html><meta charset=utf-8><title>IVIS Mock APIs</title>
<style>body{font:14px system-ui;max-width:860px;margin:24px auto;padding:0 16px}input,select,button{padding:6px;margin:2px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}code{background:#eee;padding:1px 4px}</style>
<h2>IVIS Mock APIs</h2>
<p>ROP: <code>GET /rop-api?plateNumber=</code> &nbsp; Payment: <code>GET /payment-api?plate=</code> &nbsp; Autogen: <b id=ag></b></p>
<h3>Add / update plate</h3>
<div>Plate <input id=plate placeholder="12345 AB">
Owner <input id=owner placeholder="optional">
Mulkiya ID <input id=mul placeholder="optional">
Paid <select id=paid><option value=true>Paid</option><option value=false>Unpaid</option></select>
Advance (OMR) <input id=adv type=number value=0 style="width:70px">
<button onclick=save()>Save</button></div>
<h3>Plates</h3><table id=t><tr><th>Plate<th>Owner<th>Mulkiya<th>Paid<th>Advance<th></table>
<script>
async function load(){const r=await (await fetch('/mock/plates')).json();ag.textContent=r.autogen?'ON (unknown plates auto-created)':'OFF (unknown plate = 404 / not paid)';
t.innerHTML='<tr><th>Plate<th>Owner<th>Mulkiya<th>Paid<th>Advance<th>';
r.plates.forEach(p=>{t.innerHTML+='<tr><td>'+p.plate+'<td>'+(p.rop?p.rop.ownerName:'-')+'<td>'+(p.rop?p.rop.mulkiyaId:'-')+'<td>'+(p.pay?p.pay.paid:'-')+'<td>'+(p.pay?p.pay.advance:'-')+'<td><button onclick="del(\\''+p.plate+'\\')">Delete</button>'})}
async function save(){await fetch('/mock/plates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plate:plate.value,ownerName:owner.value||undefined,mulkiyaId:mul.value||undefined,paid:paid.value==='true',advance:Number(adv.value)||0})});load()}
async function del(p){await fetch('/mock/plates/'+encodeURIComponent(p),{method:'DELETE'});load()}
load()
</script>`;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/$/, '') || '/';
    console.log(new Date().toISOString(), req.method, req.url);

    if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
    if (path === '/' || path === '/docs') return send(res, 200, PAGE, 'text/html');

    if (path === '/rop-api' && req.method === 'GET') {
      const plate = norm(url.searchParams.get('plateNumber'));
      if (!plate) return send(res, 400, { success: false, message: 'plateNumber required' });
      let data = rop.get(plate);
      if (!data && AUTOGEN) { data = makeRop(plate); rop.set(plate, data); }
      if (!data) return send(res, 404, { success: false, message: 'No ROP record for plate' });
      return send(res, 200, { success: true, data });
    }

    if (path === '/payment-api' && req.method === 'GET') {
      const plate = norm(url.searchParams.get('plate'));
      let p = pay.get(plate);
      if (!p) p = AUTOGEN ? { advance: 0, paid: true } : { advance: 0, paid: false };
      return send(res, 200, p);
    }

    if (path === '/mock/plates' && req.method === 'GET') {
      const keys = new Set([...rop.keys(), ...pay.keys()]);
      return send(res, 200, {
        autogen: AUTOGEN,
        plates: [...keys].map((plate) => ({ plate, rop: rop.get(plate), pay: pay.get(plate) })),
      });
    }

    if (path === '/mock/plates' && req.method === 'POST') {
      const b = await readBody(req);
      const plate = norm(b.plate);
      if (!plate) return send(res, 400, { success: false, message: 'plate required' });
      const base = rop.get(plate) || makeRop(plate);
      rop.set(plate, { ...base, ...(b.rop || {}), ...(b.ownerName && { ownerName: b.ownerName }), ...(b.mulkiyaId && { mulkiyaId: b.mulkiyaId }) });
      pay.set(plate, { advance: Number(b.advance) || 0, paid: b.paid !== false });
      return send(res, 200, { success: true });
    }

    if (path.startsWith('/mock/plates/') && req.method === 'DELETE') {
      const plate = norm(decodeURIComponent(path.slice('/mock/plates/'.length)));
      rop.delete(plate); pay.delete(plate);
      return send(res, 200, { success: true });
    }

    send(res, 404, { success: false, message: 'Not found' });
  })
  .listen(PORT, () => console.log(`IVIS mock APIs on http://localhost:${PORT}  (docs: /docs, autogen: ${AUTOGEN})`));
