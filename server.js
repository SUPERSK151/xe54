// XE 54 Intelligence Solutions — website
// Zero-dependency server: Node 22.5+ (node:http + node:sqlite). Run: npm start, then open http://localhost:3000
//
// Settings (Render → Environment):
//   RESEND_API_KEY  Resend API key. If missing, enquiry emails are printed to the log instead of sent.
//   MAIL_FROM       e.g.  XE 54 Intelligence <noreply@xe54intelligence.co.za>
//   ENQUIRY_EMAIL   where enquiries go (default skshange@xe54intelligence.co.za; comma-separate for several)
//   ADMIN_KEY       set to enable GET /api/admin/enquiries (send it in the x-admin-key header)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'XE 54 Intelligence <noreply@xe54intelligence.co.za>';
const ENQUIRY_EMAIL = (process.env.ENQUIRY_EMAIL || 'skshange@xe54intelligence.co.za').split(',').map(s => s.trim()).filter(Boolean);

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'xe54.db'));
db.exec(`CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  organisation TEXT,
  details TEXT,           -- JSON of the remaining form fields
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now'))
)`);

// ---------- Forms ----------
// Each form: label used in emails, and the extra fields it accepts (all optional unless listed in required).
const FORMS = {
  investor: { label: 'Investor access request', extra: ['role', 'investor_type', 'ticket_size', 'country', 'message'], required: ['organisation', 'investor_type', 'accredited'] },
  partner:  { label: 'Partnership enquiry',     extra: ['role', 'partner_type', 'country', 'message'], required: ['organisation', 'partner_type', 'message'] },
  career:   { label: 'Career application',      extra: ['area', 'experience', 'clearance', 'profile_link', 'message'], required: ['area', 'message'] },
  contact:  { label: 'Contact message',         extra: ['subject', 'message'], required: ['message'] },
};
const FIELD_LABELS = {
  role: 'Role / title', investor_type: 'Investor type', ticket_size: 'Indicative ticket size', country: 'Country',
  partner_type: 'Partnership type', area: 'Area of interest', experience: 'Years of experience', clearance: 'Security clearance',
  profile_link: 'CV / LinkedIn link', subject: 'Subject', message: 'Message', accredited: 'Confirmed qualifying investor',
};

const clean = (v, max = 200) => (v == null ? '' : String(v).trim().slice(0, max));
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isPhone = p => !p || /^[+0-9 ()-]{9,18}$/.test(p);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Simple flood protection: max 5 submissions per IP per 10 minutes.
const hits = new Map();
function tooMany(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 600000);
  list.push(now); hits.set(ip, list);
  return list.length > 5;
}

async function sendMail({ to, subject, html, text, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email not sent: RESEND_API_KEY not set] To: ${[].concat(to).join(', ')} | ${subject}\n${text}\n`);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [].concat(to), subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) throw new Error(`Email failed (${r.status}): ${await r.text()}`);
}

function emailShell(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#0a142b;font-family:Helvetica,Arial,sans-serif;color:#0e1b38">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff">
<tr><td style="background:#0e1b38;padding:22px 28px;color:#fff;font-size:15px;letter-spacing:3px">XE 54 INTELLIGENCE SOLUTIONS</td></tr>
<tr><td style="height:3px;background:#3fe0b8"></td></tr>
<tr><td style="padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px;background:#eef1f6;font-size:12px;color:#5b6884">XE 54 Intelligence Solutions · Pretoria, South Africa · xe54intelligence.co.za</td></tr>
</table></td></tr></table></body></html>`;
}

async function notify(form, e) {
  const rows = [['Name', e.name], ['Email', e.email], ['Phone', e.phone], ['Organisation', e.organisation],
    ...Object.entries(e.details).map(([k, v]) => [FIELD_LABELS[k] || k, v])].filter(([, v]) => v);
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows.map(([k, v]) =>
    `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #e3e7ef;color:#5b6884;vertical-align:top;width:38%">${esc(k)}</td>
     <td style="padding:8px 0;border-bottom:1px solid #e3e7ef;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  const jobs = [sendMail({
    to: ENQUIRY_EMAIL, replyTo: e.email,
    subject: `${form.label} #${e.id}: ${e.name}${e.organisation ? ` (${e.organisation})` : ''}`,
    html: emailShell(`${form.label} #${e.id}`, table + `<p style="font-size:13px;color:#5b6884;margin-top:18px">Reply to this email to respond directly to ${esc(e.name)}.</p>`),
    text,
  })];

  // Acknowledgement to the person who submitted
  const ack = {
    investor: 'Thank you for your interest in XE 54 Intelligence Solutions. Our investor relations team reviews every request individually. If your request is approved, we will be in touch to arrange a non-disclosure agreement before sharing the confidential investor pack.',
    partner: 'Thank you for your partnership enquiry. Our strategy team will review it and respond within five working days.',
    career: 'Thank you for your interest in joining XE 54 Intelligence Solutions. We review every application and will contact you if there is a suitable role. Some positions require security vetting before appointment.',
    contact: 'Thank you for contacting XE 54 Intelligence Solutions. We have received your message and will respond shortly.',
  }[e.type];
  jobs.push(sendMail({
    to: e.email, replyTo: ENQUIRY_EMAIL[0],
    subject: 'We have received your enquiry: XE 54 Intelligence Solutions',
    html: emailShell(`Dear ${e.name.split(' ')[0]},`, `<p style="font-size:15px;line-height:1.6">${esc(ack)}</p>
      <p style="font-size:13px;color:#5b6884">Reference: XE-${e.id}</p>`),
    text: `Dear ${e.name.split(' ')[0]},\n\n${ack}\n\nReference: XE-${e.id}\n\nXE 54 Intelligence Solutions`,
  }));
  (await Promise.allSettled(jobs)).forEach(r => r.status === 'rejected' && console.error(r.reason));
}

// ---------- HTTP ----------
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 50000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/enquiry') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (tooMany(ip)) return send(res, 429, { error: 'Too many submissions. Please try again in a few minutes.' });
    const b = await readBody(req).catch(() => null);
    if (!b) return send(res, 400, { error: 'Invalid request.' });
    if (b.website) return send(res, 200, { ok: true }); // honeypot: bots fill the hidden field
    const form = FORMS[b.type];
    if (!form) return send(res, 400, { error: 'Unknown form.' });

    const e = { type: b.type, name: clean(b.name), email: clean(b.email).toLowerCase(), phone: clean(b.phone, 30), organisation: clean(b.organisation) };
    if (!e.name) return send(res, 400, { error: 'Please enter your full name.' });
    if (!isEmail(e.email)) return send(res, 400, { error: 'Please enter a valid email address.' });
    if (!isPhone(e.phone)) return send(res, 400, { error: 'Please enter a valid phone number.' });
    if (!b.popia_consent) return send(res, 400, { error: 'Please accept the privacy notice so we can process your enquiry.' });
    e.details = {};
    for (const f of form.extra) { const v = clean(b[f], f === 'message' ? 3000 : 300); if (v) e.details[f] = v; }
    if (b.type === 'investor') e.details.accredited = b.accredited ? 'Yes' : '';
    for (const f of form.required) {
      if (!(f === 'organisation' ? e.organisation : e.details[f]))
        return send(res, 400, { error: f === 'accredited' ? 'Please confirm that you are a qualifying investor.' : `Please complete: ${FIELD_LABELS[f] || f}.` });
    }

    const info = db.prepare('INSERT INTO enquiries (type, name, email, phone, organisation, details) VALUES (?, ?, ?, ?, ?, ?)')
      .run(e.type, e.name, e.email, e.phone, e.organisation, JSON.stringify(e.details));
    e.id = Number(info.lastInsertRowid);
    send(res, 201, { ok: true, reference: `XE-${e.id}` });
    notify(form, e).catch(console.error);
    return;
  }

  if (url.pathname === '/api/admin/enquiries') {
    if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) return send(res, 403, { error: 'Forbidden' });
    const rows = db.prepare('SELECT * FROM enquiries ORDER BY id DESC').all().map(r => ({ ...r, details: JSON.parse(r.details || '{}') }));
    return send(res, 200, rows);
  }
  return send(res, 404, { error: 'Not found' });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (!path.extname(p)) p += '.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC, '404.html'), (e2, b2) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(b2 || 'Not found');
      });
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}).listen(PORT, () => console.log(`XE 54 website running at http://localhost:${PORT}`));
