(() => {
'use strict';

/* ---------- safe HTML templates: every ${value} is escaped unless wrapped by html`` or raw() ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Raw { constructor(s) { this.s = s; } }
const raw = s => new Raw(s);
const fmt = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join('') : (v === null || v === undefined || v === false) ? '' : esc(v);
const html = (strs, ...vals) => new Raw(strs.reduce((a, s, i) => a + s + (i < vals.length ? fmt(vals[i]) : ''), ''));

const $ = (sel, root = document) => root.querySelector(sel);
const usd = n => '$' + Number(n || 0).toFixed(2);
const fdate = s => s ? new Date(s.endsWith('Z') ? s : s + 'Z').toLocaleString() : '—';
const origin = location.origin;

const state = {
  token: localStorage.getItem('token') || '', user: null, sub: null,
  lang: localStorage.getItem('lang') || 'en', plans: [], cfg: { app_name: 'BizPilot AI' },
  convId: null, newKey: null, products: [], plansAdmin: [],
};
if (!LANGS[state.lang]) state.lang = 'en';

const t = (k, vars) => {
  let s = (I18N[state.lang] || {})[k] ?? I18N.en[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};

function toast(msg, bad) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = ''; }, 4500);
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && state.token && !path.startsWith('/api/auth/')) logout(false);
    const d = data && data.detail;
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map(x => x.msg).join('; ') : `Request failed (${res.status})`);
  }
  return data;
}

function setSession(r) {
  state.token = r.token; state.user = r.user; state.sub = null;
  localStorage.setItem('token', r.token);
}
function logout(go) {
  state.token = ''; state.user = null; state.sub = null;
  localStorage.removeItem('token');
  if (go !== false) location.hash = '#/';
  render();
}

/* ---------- layout ---------- */
function shell(content) {
  const u = state.user;
  return html`
  <header class="top"><div class="wrap bar">
    <a class="brand" href="#/">${state.cfg.app_name}</a>
    <nav class="links">
      <a href="#/pricing">${t('nav_pricing')}</a>
      <a href="/docs" target="_blank" rel="noopener">${t('nav_docs')}</a>
      ${u ? html`<a href="#/app/overview">${t('dashboard')}</a>
        ${u.role === 'admin' ? html`<a href="#/admin/stats">${t('admin')}</a>` : ''}
        <button class="link" data-action="logout">${t('logout')}</button>`
        : html`<a href="#/login">${t('login')}</a><a class="btn small" href="#/register">${t('register')}</a>`}
      <select id="lang" aria-label="${t('language')}">
        ${Object.entries(LANGS).map(([k, v]) => html`<option value="${k}" ${k === state.lang ? 'selected' : ''}>${v}</option>`)}
      </select>
    </nav></div></header>
  <main>${content}</main>
  <footer class="foot">© ${new Date().getFullYear()} ${state.cfg.app_name}</footer>`;
}

const planLabel = p => p.months === 12 ? t('year') : p.months === 1 ? t('month1') : t('months', { n: p.months });

function pricingSection() {
  return html`<section class="wrap" id="pricing">
    <h2 class="center">${t('pricing_title')}</h2><p class="center muted">${t('pricing_sub')}</p>
    <div class="grid3">${state.plans.map(p => html`
      <article class="card plan"><h3>${p.name}</h3>
        <div class="price">${usd(p.price_usd)}</div><div class="muted">${planLabel(p)}</div>
        <p>${p.description}</p>
        <ul><li>${Number(p.requests_per_month).toLocaleString()} ${t('req_month')}</li></ul>
        <a class="btn" href="#/${state.token ? 'app/billing' : 'register'}">${t('buy_now')}</a></article>`)}
    </div></section>`;
}

function homePage() {
  const feats = [['f1t', 'f1d', '📦'], ['f2t', 'f2d', '💬'], ['f3t', 'f3d', '✉️'], ['f4t', 'f4d', '📈'], ['f5t', 'f5d', '🔑'], ['f6t', 'f6d', '🌍']];
  return html`
  <section class="hero"><div class="wrap"><h1>${t('hero_title')}</h1><p>${t('hero_sub')}</p>
    <div class="row"><a class="btn" href="#/register">${t('get_started')}</a><a class="btn ghost" href="#/pricing">${t('see_pricing')}</a></div></div></section>
  <section class="wrap grid3">${feats.map(([a, b, i]) => html`<article class="card"><div class="ico">${i}</div><h3>${t(a)}</h3><p class="muted">${t(b)}</p></article>`)}</section>
  ${pricingSection()}`;
}

function authPage(mode) {
  const reg = mode === 'register';
  return html`<section class="wrap narrow"><form class="card form" data-form="${mode}">
    <h2>${reg ? t('create_account') : t('sign_in')}</h2>
    ${reg ? html`<label>${t('full_name')}<input name="name" required maxlength="120" autocomplete="name"></label>
      <label>${t('business_name')}<input name="business_name" maxlength="160"></label>` : ''}
    <label>${t('email')}<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
    <label>${t('password')}<input type="password" name="password" required minlength="8" maxlength="128" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
    <button class="btn" type="submit">${reg ? t('create_account') : t('sign_in')}</button>
    <p class="muted">${reg ? html`<a href="#/login">${t('sign_in')}</a>` : html`<a href="#/register">${t('create_account')}</a>`}</p>
  </form></section>`;
}

const TABS = [['overview', 't_overview'], ['products', 't_products'], ['orders', 't_orders'], ['chat', 't_chat'], ['email', 't_email'],
  ['ads', 't_ads'], ['keys', 't_keys'], ['billing', 't_billing'], ['settings', 't_settings'], ['docs', 't_docs']];
const ATABS = [['stats', 'Overview'], ['clients', 'Clients'], ['payments', 'Payments'], ['plans', 'Plans & prices']];

const side = (items, base, tab, translate) => html`<aside class="side">${items.map(([k, l]) =>
  html`<a class="${k === tab ? 'on' : ''}" href="#/${base}/${k}">${translate ? t(l) : l}</a>`)}</aside>`;
const appShell = (tab, items, base, translate) => html`<div class="wrap app">${side(items, base, tab, translate)}<section id="panel" class="panel"><p class="muted">…</p></section></div>`;

const emptyRow = (cols, text) => html`<tr><td colspan="${cols}" class="muted">${text}</td></tr>`;
const tag = (text, kind) => html`<span class="tag ${kind || ''}">${text}</span>`;
const stKind = s => ({ approved: 'ok', applied: 'ok', replied: 'ok', pending: 'warn', recommended: 'warn', rejected: 'bad', needs_human: 'bad' }[s] || '');

/* ---------- client dashboard panels ---------- */
async function pOverview() {
  const [me, us] = await Promise.all([api('/api/me'), api('/api/usage')]);
  state.user = me.user; state.sub = me.subscription;
  const s = me.subscription;
  return html`<h2>${t('t_overview')}</h2>
  <div class="grid3">
    <div class="card"><div class="muted">Plan</div><div class="big">${s ? s.plan : 'No active plan'}</div>
      <div class="muted">${s ? `${s.days_left} days left · ends ${fdate(s.expires_at)}` : 'Activate a plan to use the API.'}</div>
      ${s ? '' : html`<p><a class="btn small" href="#/app/billing">Activate a plan</a></p>`}</div>
    <div class="card"><div class="muted">AI requests used</div><div class="big">${s ? `${s.requests_used.toLocaleString()} / ${s.request_limit.toLocaleString()}` : '0'}</div></div>
    <div class="card"><div class="muted">API calls (30 days)</div><div class="big">${us.last30}</div></div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Quick start</h3><ol>
    <li>Describe your business in <a href="#/app/settings">Settings</a>.</li>
    <li>Add products and full details in <a href="#/app/products">Products</a>.</li>
    <li>Test the AI in <a href="#/app/chat">AI Chat</a>.</li>
    <li>Create an <a href="#/app/keys">API key</a> and call <code>/v1/chat</code> from your own app.</li></ol></div>`;
}

async function pProducts() {
  state.products = await api('/api/products');
  return html`<h2>${t('t_products')}</h2>
  <form class="card form" data-form="product-save">
    <input type="hidden" name="id">
    <div class="row2"><label>Name<input name="name" required maxlength="200"></label><label>SKU (optional)<input name="sku" maxlength="64"></label></div>
    <div class="row3"><label>Price<input name="price" type="number" step="0.01" min="0" value="0"></label>
      <label>Currency<input name="currency" value="USD" maxlength="8"></label><label>Stock<input name="stock" type="number" min="0" value="0"></label></div>
    <label>Short description<input name="description" maxlength="2000"></label>
    <label>Full details for the AI (features, sizes, delivery, warranty, FAQs)<textarea name="details" rows="5" maxlength="8000"></textarea></label>
    <label class="chk"><input type="checkbox" name="active" checked> Active (visible to the AI)</label>
    <div class="row"><button class="btn" type="submit">Save product</button><button class="btn ghost" type="reset">Clear</button></div>
  </form>
  <div class="card scroll"><table><thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>
    ${state.products.length ? state.products.map(p => html`<tr><td>${p.name}<div class="muted">${p.description}</div></td>
      <td>${p.price} ${p.currency}</td><td>${p.stock}</td><td>${tag(p.active ? 'Active' : 'Hidden', p.active ? 'ok' : '')}</td>
      <td><button class="btn small ghost" data-action="product-edit" data-id="${p.id}">Edit</button>
      <button class="btn small danger" data-action="product-delete" data-id="${p.id}">Delete</button></td></tr>`) : emptyRow(5, 'No products yet. Add your first one above.')}
  </tbody></table></div>`;
}

async function pOrders() {
  const orders = await api('/api/orders');
  const opts = cur => ['new', 'confirmed', 'shipped', 'cancelled'].map(s => html`<option value="${s}" ${s === cur ? 'selected' : ''}>${s}</option>`);
  return html`<h2>${t('t_orders')}</h2><div class="card scroll"><table>
    <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Total</th><th>Customer</th><th>Date</th><th>Status</th></tr></thead><tbody>
    ${orders.length ? orders.map(o => html`<tr><td>${o.id}</td><td>${o.product_name}</td><td>${o.quantity}</td><td>${o.total} ${o.currency}</td>
      <td>${o.customer_name}<div class="muted">${o.customer_email}</div></td><td>${fdate(o.created_at)}</td>
      <td><select data-order="${o.id}">${opts(o.status)}</select></td></tr>`) : emptyRow(7, 'No orders yet. Orders created through the API appear here.')}
    </tbody></table></div>`;
}

function pChat() {
  state.convId = null;
  return html`<h2>${t('t_chat')}</h2>
  <p class="muted">Test how your AI talks to customers. It answers from your Products and Settings; your customers get the same answers through the API, in their own language.</p>
  <div class="card chat"><div id="msgs" class="msgs"><div class="msg ai">Hello! Ask me about any product.</div></div>
    <form class="chatform" data-form="chat-send"><input name="message" required maxlength="4000" placeholder="Type a customer question…" autocomplete="off"><button class="btn" type="submit">Send</button></form></div>`;
}

async function pEmail() {
  const g = await api('/api/gmail');
  return html`<h2>${t('t_email')}</h2>
  <div class="card form"><h3>1. Connect Gmail</h3>
    <p class="muted">Use a Google <b>App Password</b> (Google Account → Security → 2-Step Verification → App passwords). Your normal password never works here. It is stored encrypted.</p>
    ${g.connected ? html`<p>${tag('Connected', 'ok')} ${g.address} <button class="btn small danger" data-action="gmail-disconnect">Disconnect</button></p>` : ''}
    <form data-form="gmail-save"><div class="row2"><label>Gmail address<input type="email" name="address" required value="${g.address || ''}"></label>
      <label>App Password<input type="password" name="app_password" required minlength="8" autocomplete="off"></label></div>
      <button class="btn" type="submit">${g.connected ? 'Update connection' : 'Connect Gmail'}</button></form></div>
  <form class="card form" data-form="email-send"><h3>2. Send an email</h3>
    <div class="row2"><label>To<input type="email" name="to" required></label><label>Subject<input name="subject" required maxlength="200"></label></div>
    <label>Message<textarea name="body" rows="4" required maxlength="20000"></textarea></label><button class="btn" type="submit">Send</button></form>
  <div class="card"><h3>3. AI replies to new emails</h3>
    <p class="muted">Reads up to 5 unread emails, writes a reply from your product info and sends it. Newsletters and no-reply senders are skipped. Needs an active plan.</p>
    <button class="btn" data-action="inbox-process">Reply to new emails now</button><div id="inbox-out" style="margin-top:12px"></div></div>`;
}

async function pAds() {
  const [camps, events] = await Promise.all([api('/api/ads/campaigns'), api('/api/ads/events')]);
  return html`<h2>${t('t_ads')}</h2>
  <p class="muted">Send your campaign numbers (by API or here). The autopilot finds problems and decides on a fix. Fixes that need your ad account are only <b>recommended</b> until an ad platform is connected.</p>
  <form class="card form" data-form="campaign-save"><h3>Add campaign</h3>
    <div class="row3"><label>Name<input name="name" required maxlength="160"></label><label>Platform<input name="platform" placeholder="Google, Meta, TikTok…" maxlength="40"></label>
      <label>Daily budget<input type="number" step="0.01" min="0" name="daily_budget" value="0"></label></div>
    <div class="row2"><label>Max daily budget (autopilot never goes above)<input type="number" step="0.01" min="0" name="max_daily_budget" value="0"></label>
      <label>Target cost per sale<input type="number" step="0.01" min="0" name="target_cpa" value="0"></label></div>
    <button class="btn" type="submit">Add campaign</button></form>
  <form class="card form" data-form="metrics-send"><h3>Check a campaign</h3>
    <div class="row2"><label>Campaign<select name="cid" required>${camps.map(c => html`<option value="${c.id}">${c.name}</option>`)}</select></label>
      <label>Status<select name="status"><option>active</option><option>disapproved</option><option>limited</option><option>paused</option></select></label></div>
    <div class="row3"><label>Spend<input type="number" step="0.01" min="0" name="spend" value="0"></label><label>Impressions<input type="number" min="0" name="impressions" value="0"></label>
      <label>Clicks<input type="number" min="0" name="clicks" value="0"></label><label>Sales<input type="number" min="0" name="conversions" value="0"></label>
      <label>Days running<input type="number" min="0" name="days_running" value="1"></label></div>
    <label>Rejection reason (if any)<input name="disapproval_reason" maxlength="500"></label>
    <button class="btn" type="submit" ${camps.length ? '' : 'disabled'}>Analyze</button><div id="ads-out" style="margin-top:12px"></div></form>
  <div class="card scroll"><h3>History</h3><table><thead><tr><th>When</th><th>Problem</th><th>Action</th><th>Result</th></tr></thead><tbody>
    ${events.length ? events.map(e => html`<tr><td>${fdate(e.at)}</td><td><b>${e.code}</b><div class="muted">${e.diagnosis}</div></td><td>${e.action}</td><td>${tag(e.status, stKind(e.status))}</td></tr>`) : emptyRow(4, 'Nothing yet.')}
  </tbody></table></div>`;
}

async function pKeys() {
  const keys = await api('/api/keys');
  const nk = state.newKey; state.newKey = null;
  return html`<h2>${t('t_keys')}</h2>
  ${nk ? html`<div class="card ok"><b>Copy your new key now. It is shown only once.</b><pre>${nk}</pre><button class="btn small" data-action="copy" data-text="${nk}">Copy key</button></div>` : ''}
  <form class="card form row" data-form="key-create"><label class="grow">Key name<input name="name" required maxlength="80" placeholder="e.g. Website, Mobile app"></label><button class="btn" type="submit">Create key</button></form>
  <div class="card scroll"><table><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody>
    ${keys.length ? keys.map(k => html`<tr><td>${k.name}</td><td><code>${k.prefix}…</code></td><td>${fdate(k.created_at)}</td><td>${fdate(k.last_used_at)}</td>
      <td>${k.revoked ? tag('Revoked', 'bad') : html`<button class="btn small danger" data-action="key-revoke" data-id="${k.id}">Revoke</button>`}</td></tr>`) : emptyRow(5, 'No keys yet.')}
  </tbody></table></div>`;
}

async function pBilling() {
  const [b, plans] = await Promise.all([api('/api/billing'), api('/api/plans')]);
  const s = b.subscription;
  return html`<h2>${t('t_billing')}</h2>
  <div class="card">${s ? html`<b>${s.plan}</b> · ${s.days_left} days left · ends ${fdate(s.expires_at)}` : html`<b>No active plan.</b> Your API keys are switched off until you activate one.`}</div>
  <form class="card form" data-form="checkout"><h3>Activate or renew</h3><p class="muted">${b.instructions}</p>
    <label>Plan<select name="plan_id">${plans.map(p => html`<option value="${p.id}">${p.name} — ${planLabel(p)} — ${usd(p.price_usd)}</option>`)}</select></label>
    <div class="row2"><label>How you paid<input name="method" required maxlength="40" placeholder="Wise, Payoneer, bank transfer…"></label>
      <label>Transaction ID / reference<input name="reference" required minlength="3" maxlength="120"></label></div>
    <button class="btn" type="submit">I have paid — submit</button></form>
  <div class="card scroll"><h3>Payments</h3><table><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead><tbody>
    ${b.payments.length ? b.payments.map(p => html`<tr><td>${fdate(p.created_at)}</td><td>${p.plan}</td><td>${usd(p.amount_usd)}</td><td>${p.reference}</td><td>${tag(p.status, stKind(p.status))}</td></tr>`) : emptyRow(5, 'No payments yet.')}
  </tbody></table></div>`;
}

function pSettings() {
  const u = state.user;
  return html`<h2>${t('t_settings')}</h2><form class="card form" data-form="settings-save">
    <div class="row2"><label>Your name<input name="name" value="${u.name}" maxlength="120"></label><label>Business name<input name="business_name" value="${u.business_name}" maxlength="160"></label></div>
    <label>Business information for the AI (what you sell, delivery, returns, opening hours, payment methods, tone of voice)
      <textarea name="business_info" rows="9" maxlength="8000">${u.business_info}</textarea></label>
    <button class="btn" type="submit">Save</button></form>`;
}

function pDocs() {
  const ex = (title, code) => html`<h3>${title}</h3><pre>${code}</pre>`;
  return html`<h2>${t('t_docs')}</h2>
  <div class="card"><p>Base URL: <code>${origin}/v1</code> · Full interactive reference: <a href="/docs" target="_blank" rel="noopener">${origin}/docs</a></p>
    <p>Send your key in every request: <code>Authorization: Bearer sk_live_…</code>. Use the API only from your <b>server</b> or backend; never put the key inside a public web page or app.</p>
    <p>When your plan ends, every call returns HTTP <code>402</code> until you renew — then the same key works again.</p></div>
  <div class="card">
    ${ex('Customer chat', `curl -X POST ${origin}/v1/chat \\\n  -H "Authorization: Bearer sk_live_YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"message":"Do you have this in blue?","customer_id":"user-42"}'`)}
    ${ex('Add or update a product', `curl -X POST ${origin}/v1/products \\\n  -H "Authorization: Bearer sk_live_YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"name":"Blue Sneaker","price":49.9,"currency":"USD","stock":20,"description":"Light running shoe","details":"Sizes 38-45. Delivery 3 days."}'`)}
    ${ex('Create an order', `curl -X POST ${origin}/v1/orders \\\n  -H "Authorization: Bearer sk_live_YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"product_id":1,"quantity":2,"customer_name":"Ali","customer_email":"ali@example.com"}'`)}
    ${ex('AI reply to an email you received', `curl -X POST ${origin}/v1/email/auto-reply \\\n  -H "Authorization: Bearer sk_live_YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"from_email":"buyer@example.com","subject":"Price?","body":"How much is the blue sneaker?","send":false}'`)}
    ${ex('Ads check', `curl -X POST ${origin}/v1/ads/campaigns/1/metrics \\\n  -H "Authorization: Bearer sk_live_YOUR_KEY" -H "Content-Type: application/json" \\\n  -d '{"spend":40,"impressions":5000,"clicks":12,"conversions":0,"status":"active","days_running":3}'`)}
  </div>`;
}

/* ---------- owner (admin) panels ---------- */
async function aStats() {
  const s = await api('/api/admin/stats');
  const c = (l, v) => html`<div class="card"><div class="muted">${l}</div><div class="big">${v}</div></div>`;
  return html`<h2>Overview</h2><div class="grid3">${c('Clients', s.clients)}${c('Active subscriptions', s.active_subscriptions)}
    ${c('Payments waiting', s.pending_payments)}${c('Revenue (approved)', usd(s.revenue_usd))}${c('API calls (30 days)', s.requests_30d)}</div>`;
}

async function aClients() {
  const [rows, plans] = await Promise.all([api('/api/admin/clients'), api('/api/admin/plans')]);
  return html`<h2>Clients</h2>
  <div class="card scroll"><table><thead><tr><th>Client</th><th>Plan</th><th>Ends</th><th>Status</th><th>Give plan</th></tr></thead><tbody>
    ${rows.map(u => html`<tr><td>${u.email}<div class="muted">${u.name} · ${u.business_name} ${u.role === 'admin' ? '(admin)' : ''}</div></td>
      <td>${u.plan || '—'}</td><td>${fdate(u.expires_at)}</td>
      <td>${u.role === 'admin' ? '' : html`<button class="btn small ${u.is_active ? 'danger' : ''}" data-action="client-toggle" data-id="${u.id}" data-active="${u.is_active ? '1' : '0'}">${u.is_active ? 'Disable' : 'Enable'}</button>`}</td>
      <td><form class="row" data-form="grant"><input type="hidden" name="uid" value="${u.id}">
        <select name="plan_id" style="width:auto">${plans.map(p => html`<option value="${p.id}">${p.name}</option>`)}</select>
        <input name="months" type="number" min="1" max="36" placeholder="months" style="width:90px"><button class="btn small" type="submit">Give</button></form></td></tr>`)}
  </tbody></table></div>`;
}

async function aPayments() {
  const rows = await api('/api/admin/payments');
  return html`<h2>Payments</h2><div class="card scroll"><table><thead><tr><th>Date</th><th>Client</th><th>Plan</th><th>Amount</th><th>Method / reference</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map(p => html`<tr><td>${fdate(p.created_at)}</td><td>${p.email}</td><td>${p.plan}</td><td>${usd(p.amount_usd)}</td><td>${p.method}<div class="muted">${p.reference}</div></td>
      <td>${tag(p.status, stKind(p.status))}</td><td>${p.status === 'pending' ? html`<button class="btn small" data-action="pay-approve" data-id="${p.id}">Approve</button>
      <button class="btn small danger" data-action="pay-reject" data-id="${p.id}">Reject</button>` : ''}</td></tr>`) : emptyRow(7, 'No payments yet.')}
  </tbody></table></div>
  <p class="muted">Approve only after you have really received the money in your own account.</p>`;
}

async function aPlans() {
  state.plansAdmin = await api('/api/admin/plans');
  return html`<h2>Plans & prices</h2>
  <form class="card form" data-form="plan-save"><input type="hidden" name="id">
    <div class="row3"><label>Name<input name="name" required maxlength="80"></label><label>Months (12 = 1 year)<input name="months" type="number" min="1" max="36" value="1" required></label>
      <label>Price (USD)<input name="price_usd" type="number" step="0.01" min="0" value="19" required></label><label>AI requests per month<input name="requests_per_month" type="number" min="0" value="3000"></label></div>
    <label>Description<input name="description" maxlength="300"></label>
    <label class="chk"><input type="checkbox" name="is_active" checked> Visible to clients</label>
    <div class="row"><button class="btn" type="submit">Save plan</button><button class="btn ghost" type="reset">Clear</button></div></form>
  <div class="card scroll"><table><thead><tr><th>Plan</th><th>Length</th><th>Price</th><th>Requests / month</th><th>Visible</th><th></th></tr></thead><tbody>
    ${state.plansAdmin.map(p => html`<tr><td>${p.name}</td><td>${planLabel(p)}</td><td>${usd(p.price_usd)}</td><td>${p.requests_per_month}</td><td>${p.is_active ? 'Yes' : 'No'}</td>
      <td><button class="btn small ghost" data-action="plan-edit" data-id="${p.id}">Edit</button></td></tr>`)}
  </tbody></table></div>`;
}

const PANELS = { overview: pOverview, products: pProducts, orders: pOrders, chat: pChat, email: pEmail, ads: pAds, keys: pKeys, billing: pBilling, settings: pSettings, docs: pDocs };
const APANELS = { stats: aStats, clients: aClients, payments: aPayments, plans: aPlans };

/* ---------- router ---------- */
let renderId = 0;
const route = () => { const [page, tab] = location.hash.replace(/^#\/?/, '').split('/'); return { page: page || 'home', tab }; };

async function render() {
  const id = ++renderId;
  const { page, tab } = route();
  document.documentElement.lang = state.lang;
  document.documentElement.dir = RTL_LANGS.includes(state.lang) ? 'rtl' : 'ltr';
  if (state.token && !state.user) {
    try { const me = await api('/api/me'); state.user = me.user; state.sub = me.subscription; } catch { /* api() signs out on 401 */ }
  }
  if (!state.plans.length) { try { state.plans = await api('/api/plans'); } catch { /* ignore */ } }
  if ((page === 'app' || page === 'admin') && !state.token) { location.hash = '#/login'; return; }
  if (page === 'admin' && state.user && state.user.role !== 'admin') { location.hash = '#/app/overview'; return; }
  if (id !== renderId) return;

  let view, loader = null;
  if (page === 'login' || page === 'register') view = authPage(page);
  else if (page === 'pricing') view = html`<div style="padding-top:20px">${pricingSection()}</div>`;
  else if (page === 'app') { const k = PANELS[tab] ? tab : 'overview'; view = appShell(k, TABS, 'app', true); loader = PANELS[k]; }
  else if (page === 'admin') { const k = APANELS[tab] ? tab : 'stats'; view = appShell(k, ATABS, 'admin', false); loader = APANELS[k]; }
  else view = homePage();
  $('#app').innerHTML = shell(view).s;
  window.scrollTo(0, 0);
  if (loader) {
    try {
      const out = await loader();
      if (id === renderId) $('#panel').innerHTML = out.s;
    } catch (e) {
      if (id === renderId) $('#panel').innerHTML = html`<div class="card err">${e.message}</div>`.s;
    }
  }
}

/* ---------- actions (buttons) ---------- */
const actions = {
  logout: () => logout(true),
  copy: el => navigator.clipboard.writeText(el.dataset.text).then(() => toast('Copied')),
  'key-revoke': async el => {
    if (!confirm('Revoke this key? Apps that use it will stop working.')) return;
    await api(`/api/keys/${el.dataset.id}`, { method: 'DELETE' }); render();
  },
  'product-edit': el => {
    const p = state.products.find(x => String(x.id) === el.dataset.id); const f = $('form[data-form="product-save"]');
    if (!p || !f) return;
    for (const k of ['id', 'name', 'sku', 'price', 'currency', 'stock', 'description', 'details']) f.elements[k].value = p[k] ?? '';
    f.elements.active.checked = p.active; f.scrollIntoView({ behavior: 'smooth' });
  },
  'product-delete': async el => {
    if (!confirm('Delete this product?')) return;
    await api(`/api/products/${el.dataset.id}`, { method: 'DELETE' }); render();
  },
  'gmail-disconnect': async () => { await api('/api/gmail', { method: 'DELETE' }); toast('Gmail disconnected'); render(); },
  'inbox-process': async el => {
    el.disabled = true; const out = $('#inbox-out'); out.textContent = 'Working…';
    try {
      const r = await api('/api/email/inbox/process', { method: 'POST', body: { limit: 5, send: true } });
      out.innerHTML = r.results.length ? html`<table><tbody>${r.results.map(x => html`<tr><td>${x.from}</td><td>${x.subject}</td><td>${tag(x.status, x.status === 'replied' ? 'ok' : '')}</td></tr>`)}</tbody></table>`.s : 'No new emails.';
    } finally { el.disabled = false; }
  },
  'client-toggle': async el => { await api(`/api/admin/clients/${el.dataset.id}`, { method: 'PATCH', body: { is_active: el.dataset.active !== '1' } }); render(); },
  'pay-approve': async el => { if (!confirm('Approve this payment and activate the plan?')) return; await api(`/api/admin/payments/${el.dataset.id}/approve`, { method: 'POST' }); toast('Plan activated'); render(); },
  'pay-reject': async el => { await api(`/api/admin/payments/${el.dataset.id}/reject`, { method: 'POST' }); render(); },
  'plan-edit': el => {
    const p = state.plansAdmin.find(x => String(x.id) === el.dataset.id); const f = $('form[data-form="plan-save"]');
    if (!p || !f) return;
    for (const k of ['id', 'name', 'months', 'price_usd', 'requests_per_month', 'description']) f.elements[k].value = p[k] ?? '';
    f.elements.is_active.checked = p.is_active; f.scrollIntoView({ behavior: 'smooth' });
  },
};

/* ---------- forms ---------- */
const num = (f, k) => parseFloat(f.get(k) || 0) || 0;
const forms = {
  login: async f => { setSession(await api('/api/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } })); location.hash = '#/app/overview'; return false; },
  register: async f => {
    setSession(await api('/api/auth/register', { method: 'POST', body: { email: f.get('email'), password: f.get('password'), name: f.get('name') || '', business_name: f.get('business_name') || '' } }));
    location.hash = '#/app/overview'; return false;
  },
  'product-save': async f => {
    const id = f.get('id');
    const body = { name: f.get('name'), sku: f.get('sku') || null, price: num(f, 'price'), currency: (f.get('currency') || 'USD').toUpperCase(), stock: parseInt(f.get('stock') || 0, 10) || 0, description: f.get('description') || '', details: f.get('details') || '', active: f.get('active') === 'on' };
    await api(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', body }); toast('Product saved');
  },
  'chat-send': async (f, form) => {
    const msgs = $('#msgs'); const text = f.get('message');
    const add = (cls, txt) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = txt; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; };
    add('me', text); form.reset();
    const wait = add('ai', '…');
    try {
      const r = await api('/api/chat', { method: 'POST', body: { message: text, conversation_id: state.convId } });
      state.convId = r.conversation_id; wait.textContent = r.reply;
      if (r.mode === 'demo' || r.mode === 'fallback') wait.title = 'Basic mode: connect an AI provider on the server for smarter answers.';
    } catch (e) { wait.remove(); throw e; }
    return false;
  },
  'gmail-save': async f => { await api('/api/gmail', { method: 'PUT', body: { address: f.get('address'), app_password: f.get('app_password') } }); toast('Gmail connected'); },
  'email-send': async (f, form) => { await api('/api/email/send', { method: 'POST', body: { to: f.get('to'), subject: f.get('subject'), body: f.get('body') } }); toast('Email sent'); form.reset(); return false; },
  'campaign-save': async f => { await api('/api/ads/campaigns', { method: 'POST', body: { name: f.get('name'), platform: f.get('platform') || '', daily_budget: num(f, 'daily_budget'), max_daily_budget: num(f, 'max_daily_budget'), target_cpa: num(f, 'target_cpa') } }); toast('Campaign added'); },
  'metrics-send': async f => {
    const body = { spend: num(f, 'spend'), impressions: num(f, 'impressions'), clicks: num(f, 'clicks'), conversions: num(f, 'conversions'), status: f.get('status'), disapproval_reason: f.get('disapproval_reason') || '', days_running: parseInt(f.get('days_running') || 0, 10) || 0 };
    const r = await api(`/api/ads/campaigns/${f.get('cid')}/metrics`, { method: 'POST', body });
    $('#ads-out').innerHTML = (r.healthy ? html`<div class="card ok">No problems found. The campaign looks healthy.</div>` : html`${r.problems.map(p => html`<div class="card">${tag(p.severity, p.severity === 'high' ? 'bad' : 'warn')} <b>${p.code}</b> ${tag(p.status, stKind(p.status))}
      <p>${p.diagnosis}</p><p class="muted">Action: ${p.action}${p.params && p.params.to ? ` (budget ${p.params.from} → ${p.params.to})` : ''}</p>${p.suggestion ? html`<pre>${p.suggestion}</pre>` : ''}</div>`)}`).s;
    return false;
  },
  'key-create': async f => { const r = await api('/api/keys', { method: 'POST', body: { name: f.get('name') } }); state.newKey = r.key; },
  checkout: async f => { const r = await api('/api/billing/checkout', { method: 'POST', body: { plan_id: parseInt(f.get('plan_id'), 10), method: f.get('method'), reference: f.get('reference') } }); toast(r.message); },
  'settings-save': async f => {
    const r = await api('/api/me', { method: 'PATCH', body: { name: f.get('name') || '', business_name: f.get('business_name') || '', business_info: f.get('business_info') || '' } });
    state.user = r.user; toast('Saved'); return false;
  },
  grant: async f => { await api(`/api/admin/clients/${f.get('uid')}/grant`, { method: 'POST', body: { plan_id: parseInt(f.get('plan_id'), 10), months: f.get('months') ? parseInt(f.get('months'), 10) : null } }); toast('Plan given'); },
  'plan-save': async f => {
    const id = f.get('id');
    const body = { name: f.get('name'), months: parseInt(f.get('months'), 10) || 1, price_usd: num(f, 'price_usd'), description: f.get('description') || '', requests_per_month: parseInt(f.get('requests_per_month') || 0, 10) || 0, is_active: f.get('is_active') === 'on' };
    await api(id ? `/api/admin/plans/${id}` : '/api/admin/plans', { method: id ? 'PUT' : 'POST', body }); state.plans = []; toast('Plan saved');
  },
};

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  try { await actions[el.dataset.action](el); } catch (err) { toast(err.message, true); }
});
document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]');
  if (!form || !forms[form.dataset.form]) return;
  e.preventDefault();
  const btn = form.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  try { if (await forms[form.dataset.form](new FormData(form), form) !== false) render(); }
  catch (err) { toast(err.message, true); }
  finally { if (btn) btn.disabled = false; }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'lang') { state.lang = e.target.value; localStorage.setItem('lang', state.lang); render(); return; }
  if (e.target.matches('select[data-order]')) {
    try { await api(`/api/orders/${e.target.dataset.order}`, { method: 'PATCH', body: { status: e.target.value } }); toast('Order updated'); }
    catch (err) { toast(err.message, true); render(); }
  }
});
window.addEventListener('hashchange', render);

(async () => {
  try { state.cfg = await api('/api/config'); document.title = `${state.cfg.app_name} — AI API for your business`; } catch { /* keep default */ }
  render();
})();
})();
