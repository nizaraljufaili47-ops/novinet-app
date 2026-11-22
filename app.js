const NAV_VIEWS = ['view-home', 'view-how', 'view-vpn', 'view-roadmap'];

const SMOOTH = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth';

function showView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const nav = document.getElementById('navTabs');
  if (NAV_VIEWS.includes(id)) {
    nav.style.display = 'flex';
    document.querySelectorAll('.nav-tab').forEach(t => { const on = t.dataset.target === id; t.classList.toggle('active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  } else {
    nav.style.display = 'none';
  }
  if (id === 'view-vpn') { try { checkVpnStatus(); } catch(e){} }
  if (id === 'view-home') { try { refreshHomeVpnToggle(); } catch(e){} }
  window.scrollTo({ top: 0, behavior: 'instant' });
  try { document.getElementById('main').focus({ preventScroll: true }); } catch(e){}
}

// ===================== NOVINET VPN — REAL ACCESS REQUEST FLOW =====================
// Talks to the NoviNet VPN API running on the real WireGuard server (Muscat, Oman).
// Flow: visitor requests access -> stored as "pending" -> team approves from the
// admin panel -> server generates a real WireGuard client + QR -> visitor's browser
// picks it up automatically next time it checks this page.
const NOVINET_VPN_API = 'https://130.94.80.163.nip.io';

// ---- CONTACT INFO: edit site-config.js and the "تواصل معنا" box appears automatically ----
// (set them once in site-config.js — they also appear on the privacy page)
const CONTACT_WHATSAPP = (window.NOVINET_SITE && window.NOVINET_SITE.whatsapp) || '';
const CONTACT_EMAIL = (window.NOVINET_SITE && window.NOVINET_SITE.email) || '';

function hasContact(){ return !!(CONTACT_WHATSAPP || CONTACT_EMAIL); }
function renderContact(){
  const box = document.getElementById('contactBox');
  const linesEl = document.getElementById('contactLines');
  if (!box || !linesEl || !hasContact()) return;
  const nodes = [];
  if (CONTACT_WHATSAPP) {
    const a = document.createElement('a');
    a.href = 'https://wa.me/' + CONTACT_WHATSAPP.replace(/[^0-9]/g, '');
    a.style.color = 'var(--accent)';
    a.dir = 'ltr';
    a.textContent = CONTACT_WHATSAPP;
    nodes.push(document.createTextNode('واتساب: '), a);
  }
  if (CONTACT_EMAIL) {
    const sp = document.createElement('span');
    sp.dir = 'ltr';
    sp.style.color = 'var(--accent)';
    sp.textContent = CONTACT_EMAIL;
    if (nodes.length) nodes.push(document.createElement('br'));
    nodes.push(document.createTextNode('الإيميل: '), sp);
  }
  linesEl.replaceChildren(...nodes);
  box.style.display = 'block';
}

function getVpnRequestId(){
  try { return localStorage.getItem('novinet_vpn_request_id'); } catch(e){ return null; }
}
function setVpnRequestId(id){
  try { localStorage.setItem('novinet_vpn_request_id', id); } catch(e){ /* ignore */ }
}

// Reflects the subscription/connection status on the homepage "switch".
// Note: a webpage can't flip the device's real OS-level VPN on/off — the actual
// tunnel only turns on inside the WireGuard app. This switch shows subscription
// status and always routes to the NoviNet VPN page to actually act (subscribe /
// view the QR code / see instructions).
async function refreshHomeVpnToggle(){
  const track = document.getElementById('homeVpnSwitchTrack');
  const text = document.getElementById('homeVpnStatusText');
  if (!track || !text) return;
  const id = getVpnRequestId();
  if (!id) {
    track.classList.remove('on', 'pending');
    text.textContent = 'نسخة تجريبية — اضغط لتسجيل اهتمامك';
    return;
  }
  try {
    const res = await fetch(NOVINET_VPN_API + '/api/status/' + id);
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'approved') {
      track.classList.add('on'); track.classList.remove('pending');
      text.textContent = 'مفعّل — افتح تطبيق WireGuard على الجهاز للاتصال';
    } else if (data.status === 'pending') {
      track.classList.add('pending'); track.classList.remove('on');
      text.textContent = 'قيد المراجعة — بيتفعّل بعد تأكيد الاشتراك';
    } else if (data.status === 'rejected') {
      track.classList.remove('on', 'pending');
      text.textContent = 'ما قدرنا نفعّل هذا الطلب — اضغط للتفاصيل';
    } else if (data.status === 'expired') {
      track.classList.remove('on', 'pending');
      text.textContent = 'انتهى الاشتراك — اضغط للتفاصيل';
    }
  } catch (e) { /* silent — network hiccup, will retry next visit */ }
}

// Arabic-Indic digits (٩١٢٣…) are what many Omani phones type — convert before checking.
function toAsciiDigits(str){
  return String(str).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06F0));
}
const VPN_REQ_ERRORS = {
  invalid_name: 'اكتب الاسم (حرفين على الأقل).',
  invalid_email: 'اكتب إيميل صحيح.',
  invalid_phone: 'اكتب رقم جوال صحيح.',
  too_many_requests: 'وصلت محاولات كثيرة من هذي الشبكة. جرّب بعد ساعة.',
  already_requested: 'هذا الإيميل عنده طلب مسجّل سابقًا. إذا كان طلبك أنت، افتح الموقع من نفس الجهاز اللي أرسلت منه الطلب عشان تشوف حالته، أو تواصل معنا.'
};

async function requestVpnAccess(){
  const nameInput = document.getElementById('vpnReqName');
  const emailInput = document.getElementById('vpnReqEmail');
  const phoneInput = document.getElementById('vpnReqPhone');
  const consent = document.getElementById('vpnReqConsent');
  const submit = document.getElementById('vpnReqSubmit');
  const msg = document.getElementById('vpnReqMsg');
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput ? toAsciiDigits(phoneInput.value.trim()) : '';
  const fail = (input, text) => {
    [nameInput, emailInput, phoneInput].forEach(i => i && i.removeAttribute('aria-invalid'));
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    msg.style.display = 'block'; msg.style.color = 'var(--danger)'; msg.textContent = text;
  };
  msg.style.display = 'block';
  if (name.length < 2) return fail(nameInput, VPN_REQ_ERRORS.invalid_name);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(emailInput, VPN_REQ_ERRORS.invalid_email);
  const digits = phone.replace(/[^0-9]/g, '').length;
  if (digits < 7 || digits > 16) return fail(phoneInput, VPN_REQ_ERRORS.invalid_phone);
  if (consent && !consent.checked) return fail(consent, 'لازم توافق على استخدام بياناتك للتواصل بخصوص الطلب.');
  [nameInput, emailInput, phoneInput].forEach(i => i && i.removeAttribute('aria-invalid'));
  msg.style.color = 'var(--text-muted)';
  msg.textContent = 'جاري الإرسال...';
  if (submit) submit.disabled = true;
  try {
    const res = await fetchT(NOVINET_VPN_API + '/api/request', 15000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      msg.style.color = 'var(--danger)';
      msg.textContent = VPN_REQ_ERRORS[data.error] || 'تعذّر إرسال الطلب حاليًا. جرّب مرة ثانية بعد شوي.';
      if (data.error === 'already_requested' && getVpnRequestId()) checkVpnStatus();
      return;
    }
    setVpnRequestId(data.requestId);
    msg.style.color = 'var(--accent)';
    msg.textContent = '✓ تم إرسال طلبك! بنراجعه ونتواصل معك — ارجع لهذي الصفحة بعدين للتحقق من الحالة.';
    nameInput.value = ''; emailInput.value = ''; if (phoneInput) phoneInput.value = ''; if (consent) consent.checked = false;
    checkVpnStatus();
  } catch (e) {
    msg.style.color = 'var(--danger)';
    msg.textContent = (e && e.message === 'timeout')
      ? 'السيرفر تأخر بالرد. جرّب مرة ثانية بعد شوي.'
      : 'تعذّر الاتصال بالسيرفر. تأكد من الإنترنت وجرّب مرة ثانية.';
  } finally {
    if (submit) submit.disabled = false;
  }
}

function isIOSDevice(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isAndroidDevice(){ return /Android/i.test(navigator.userAgent); }
function safeQr(qr){ return /^data:image\/(png|svg\+xml|jpeg);base64,[A-Za-z0-9+/=]+$/.test(qr || '') ? qr : ''; }

function stopVpnPoll(){
  if (window.__novinetVpnPoll) { clearInterval(window.__novinetVpnPoll); window.__novinetVpnPoll = null; }
}

// Shown once the subscription is approved: a short guided path instead of a raw QR.
function renderVpnApproved(box, data, id){
  const ios = isIOSDevice(), mobile = ios || isAndroidDevice();
  const storeUrl = ios
    ? 'https://apps.apple.com/app/wireguard/id1441195209'
    : 'https://play.google.com/store/apps/details?id=com.wireguard.android';
  const directHref = NOVINET_VPN_API + '/api/download-config/' + encodeURIComponent(id);
  const qr = safeQr(data.qr);
  const qrImg = qr ? '<img src="' + qr + '" alt="WireGuard QR">' : '';
  const extra =
    '<div class="vpn-actions">' +
    '<button class="btn btn-ghost" data-action="downloadVpnConfig">تحميل ملف الاتصال <span dir="ltr" style="unicode-bidi:isolate">(.conf)</span></button>' +
    '<button class="btn btn-ghost" data-action="showVpnConfigFallback">نسخ الإعداد كنص</button>' +
    '</div>' +
    '<a class="vpn-link" href="' + directHref + '" target="_blank" rel="noopener">رابط تحميل مباشر (يفتح في المتصفح)</a>' +
    '<div id="vpnConfigFallback" style="display:none; margin-top:12px; text-align:right;"></div>';

  if (mobile) {
    box.innerHTML =
      '<div class="vpn-ready glass">' +
      '<div class="vpn-ok">✓ تم تفعيل اشتراكك</div>' +
      '<ol class="vpn-steps">' +
      '<li>نزّل تطبيق <b>WireGuard</b> (مجاني) من <a href="' + storeUrl + '" target="_blank" rel="noopener">المتجر</a> إذا ما عندك.</li>' +
      '<li>اضغط الزر تحت واختر <b>WireGuard</b> من القائمة.</li>' +
      '<li>اسمح بإضافة إعدادات الـVPN، ثم فعّل المفتاح للاتصال.</li>' +
      '</ol>' +
      '<div class="vpn-actions" style="margin-top:0;"><button class="btn" data-action="shareVpnConfig">أضف NoviNet إلى WireGuard</button></div>' +
      '<details class="vpn-more"><summary>خيارات ثانية / جهاز آخر</summary>' + extra +
      (qrImg ? '<p style="font-size:12px; color:var(--text-muted); margin-top:14px; text-align:center;">من جهاز ثاني؟ امسح الـQR من تطبيق WireGuard (جهاز واحد لكل اشتراك).</p>' + qrImg : '') +
      '</details>' +
      '</div>';
  } else {
    box.innerHTML =
      '<div class="vpn-ready glass">' +
      '<div class="vpn-ok">✓ تم تفعيل اشتراكك</div>' +
      '<p style="font-size:13px; color:var(--text-muted); text-align:center; line-height:1.8;">افتح تطبيق <b>WireGuard</b> على جوالك واختر «Scan from QR code» ثم امسح الرمز:</p>' +
      qrImg +
      '<details class="vpn-more"><summary>على هذا الجهاز؟ حمّل الملف</summary>' + extra + '</details>' +
      '</div>';
  }
}

async function checkVpnStatus(){
  const id = getVpnRequestId();
  const resultBox = document.getElementById('vpnReqResult');
  if (!id || !resultBox) return;
  try {
    const res = await fetch(NOVINET_VPN_API + '/api/status/' + id);
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === 'approved' && data.config && !/^\s*(Pre|Post)(Up|Down)\s*=|^\s*SaveConfig\s*=|^\s*Table\s*=/mi.test(String(data.config))) {
      // (a config with PostUp/PreUp/... would run commands as root in wg-quick on a computer: never offer one)
      stopVpnPoll();
      window.__novinetVpnConfig = data.config;
      resultBox.style.display = 'block';
      renderVpnApproved(resultBox, data, id);
    } else if (data.status === 'pending') {
      resultBox.style.display = 'block';
      resultBox.innerHTML = '<div class="vpn-wait"><p class="landing-sub" style="margin:0 auto;">⏳ طلبك قيد المراجعة — هذي الصفحة تتحدّث لحالها، وبيظهر لك التفعيل هنا أول ما نوافق.</p></div>';
      if (!window.__novinetVpnPoll) {
        let ticks = 0;
        window.__novinetVpnPoll = setInterval(() => {
          if (++ticks > 100) { stopVpnPoll(); return; }
          checkVpnStatus();
        }, 8000);
      }
    } else if (data.status === 'rejected') {
      stopVpnPoll();
      resultBox.style.display = 'block';
      resultBox.innerHTML = '<p class="landing-sub">ما قدرنا نفعّل هذا الطلب حاليًا. ' + (hasContact() ? 'تواصل معنا من الأرقام تحت للتفاصيل.' : 'تقدر ترسل طلب جديد بالأعلى.') + '</p>';
    } else if (data.status === 'expired') {
      stopVpnPoll();
      resultBox.style.display = 'block';
      resultBox.innerHTML = '<p class="landing-sub">انتهت مدة اشتراكك (30 يوم). ' + (hasContact() ? 'تواصل معنا من الأرقام تحت للتجديد.' : 'تواصل معنا للتجديد.') + '</p>';
    }
  } catch (e) { /* silent — network hiccup, will retry */ }
}

function makeVpnConfigFile(){
  return new File([window.__novinetVpnConfig || ''], 'novinet-vpn.conf', { type: 'text/plain' });
}

// Best option on a phone: the system share sheet (WireGuard / Save to Files).
async function shareVpnConfig(){
  if (!window.__novinetVpnConfig) return;
  try {
    const file = makeVpnConfigFile();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'NoviNet VPN' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user closed the sheet
  }
  downloadVpnConfig();
}

// Plain file download (desktop, Android, iOS Safari 13+); copy box as last resort.
function downloadVpnConfig(){
  const cfg = window.__novinetVpnConfig;
  if (!cfg) return;
  try {
    const blob = new Blob([cfg], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'novinet-vpn.conf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    showVpnConfigFallback();
  }
}

function showVpnConfigFallback(){
  const box = document.getElementById('vpnConfigFallback');
  if (!box) return;
  const cfg = window.__novinetVpnConfig || '';
  box.style.display = 'block';
  box.innerHTML =
    '<p style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">التحميل التلقائي مو متاح هنا — انسخ المحتوى وخزّنه بملف باسم <b dir="ltr">novinet-vpn.conf</b>:</p>' +
    '<textarea id="vpnConfigText" readonly style="width:100%; min-height:150px; font-family:monospace; font-size:12px; direction:ltr; text-align:left; background:rgba(0,0,0,0.25); color:inherit; border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:8px; box-sizing:border-box;"></textarea>' +
    '<button class="btn btn-ghost" style="margin-top:8px;" data-action="copyVpnConfig">نسخ المحتوى</button>' +
    '<span id="vpnCopyMsg" style="font-size:12px; color:var(--accent); margin-right:8px; display:none;">✓ انتسخ</span>';
  document.getElementById('vpnConfigText').value = cfg;
}

async function copyVpnConfig(){
  const cfg = window.__novinetVpnConfig || '';
  const msg = document.getElementById('vpnCopyMsg');
  try {
    await navigator.clipboard.writeText(cfg);
  } catch (e) {
    const ta = document.getElementById('vpnConfigText');
    if (ta) { ta.focus(); ta.select(); }
  }
  if (msg) { msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2000); }
}

function toggleAccordion(headEl){
  const item = headEl.parentElement;
  const wasOpen = item.classList.contains('open');
  item.parentElement.querySelectorAll('.acc-item').forEach(i => i.classList.remove('open'));
  if (!wasOpen) item.classList.add('open');
  item.parentElement.querySelectorAll('.acc-head').forEach(h => h.setAttribute('aria-expanded', h.parentElement.classList.contains('open') ? 'true' : 'false'));
}

// ===================== REAL NETWORK MEASUREMENT =====================
// Uses Cloudflare's public speed-test endpoint (speed.cloudflare.com), which
// intentionally sends CORS + Timing-Allow-Origin headers for exactly this purpose.
// Every number below is a genuine browser measurement — nothing here is random.

const CF_BASE = 'https://speed.cloudflare.com/__down';
const GEO_URL = 'https://get.geojs.io/v1/ip/geo.json';

// Every measurement request gets a hard time limit, so one stalled connection
// can never freeze the scan forever (it fails with a clear message instead).
async function fetchT(url, ms, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function measureLatencyAndJitter(samples = 8, onSample) {
  const times = [];
  let failures = 0;
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    try {
      await fetchT(`${CF_BASE}?bytes=1000&_=${Date.now()}_${i}`, 4000, { cache: 'no-store' });
    } catch (e) {
      failures++;
      if (failures >= 2) break; // connection is stalling: stop and judge what we have
      continue;
    }
    const dt = performance.now() - t0;
    times.push(dt);
    if (onSample) onSample(dt, i, samples);
  }
  if (times.length < 4) throw new Error('الاتصال بسيرفر القياس بطيء أو متقطع');
  // discard the first sample: it includes one-time connection setup and
  // consistently overstates latency — a known bias in this kind of measurement
  const usable = times.slice(1);
  const sorted = [...usable].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let diffSum = 0;
  for (let i = 1; i < usable.length; i++) diffSum += Math.abs(usable[i] - usable[i - 1]);
  const jitter = usable.length > 1 ? diffSum / (usable.length - 1) : 0;
  const mean = usable.reduce((s, v) => s + v, 0) / usable.length;
  const variance = usable.reduce((s, v) => s + (v - mean) ** 2, 0) / usable.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation
  let confidence;
  if (cv < 0.15) confidence = 'high';
  else if (cv < 0.35) confidence = 'mid';
  else confidence = 'low';
  return { latency: median, jitter, samples: usable, confidence, cv };
}

// Must run FIRST in each phase: once a connection to the host is open, the
// browser reuses it and no DNS lookup happens. Returns null when the browser
// served the name from cache (no real lookup to measure) — we say so honestly
// instead of showing a fake "0 ms".
async function measureDns() {
  performance.clearResourceTimings();
  const url = `${CF_BASE}?bytes=1000&_=${Date.now()}_dns`;
  await fetchT(url, 8000, { cache: 'no-store' });
  await new Promise((r) => setTimeout(r, 60));
  const entries = performance.getEntriesByType('resource').filter(e => e.name.includes('speed.cloudflare.com'));
  if (!entries.length) return null;
  const e = entries[entries.length - 1];
  const dns = e.domainLookupEnd - e.domainLookupStart;
  return dns > 0.5 ? dns : null;
}

async function measureDownloadSpeed(bytesPerStream = 3_000_000, streams = 2) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    await Promise.all(Array.from({ length: streams }, (_, i) =>
      fetch(`${CF_BASE}?bytes=${bytesPerStream}&_=${Date.now()}_s${i}`, { cache: 'no-store', signal: ctrl.signal }).then(r => r.blob())
    ));
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('سرعة التحميل بطيئة جدًا لإكمال القياس');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const seconds = (performance.now() - t0) / 1000;
  const totalBytes = bytesPerStream * streams;
  return (totalBytes * 8 / 1_000_000) / seconds; // Mbps across parallel streams
}

// approximate packet loss via short-timeout HTTP requests (not true ICMP ping,
// but a real, honestly-labeled signal of dropped/failed requests on the path)
async function measurePacketLoss(attempts = 12) {
  let lost = 0;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 900);
    try {
      await fetch(`${CF_BASE}?bytes=200&_=${Date.now()}_pl${i}`, { cache: 'no-store', signal: controller.signal });
    } catch (e) {
      lost++;
    } finally {
      clearTimeout(timer);
    }
  }
  return Math.round((lost / attempts) * 100);
}

// real IP / approximate location via a free, CORS-enabled geolocation API
async function getLocation() {
  try {
    const r = await fetchT(`${GEO_URL}?_=${Date.now()}`, 5000, { cache: 'no-store' });
    const d = await r.json();
    return { ip: d.ip || '—', country: d.country || '—', city: d.city || '' };
  } catch (e) {
    return null;
  }
}

// real browser-reported connection info, when the browser exposes it
// (Chrome/Edge/Android support it; Safari/Firefox don't — handled gracefully)
function getConnectionInfo() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return null;
  return { type: c.effectiveType || null, downlink: c.downlink, rtt: c.rtt };
}

let measurements = { before: null, after: null };

// ---- live chart during scan (plots real latency samples as they arrive) ----
function resetChart() {
  document.getElementById('chartLine').setAttribute('points', '');
  document.getElementById('chartFillPoly').setAttribute('points', '');
  document.getElementById('chartDot').style.display = 'none';
  document.getElementById('chartMin').textContent = '— ms';
  document.getElementById('chartMax').textContent = '— ms';
}

function drawChart(samples) {
  const w = 600, h = 110, pad = 10;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = Math.max(1, max - min);
  const stepX = samples.length > 1 ? (w - pad * 2) / (samples.length - 1) : 0;
  const pts = samples.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const line = pts.map(p => p.join(',')).join(' ');
  const fill = `${pad},${h} ` + line + ` ${pts[pts.length - 1][0]},${h}`;
  document.getElementById('chartLine').setAttribute('points', line);
  document.getElementById('chartFillPoly').setAttribute('points', fill);
  const dot = document.getElementById('chartDot');
  dot.style.display = 'block';
  dot.setAttribute('cx', pts[pts.length - 1][0]);
  dot.setAttribute('cy', pts[pts.length - 1][1]);
  document.getElementById('chartMin').textContent = min.toFixed(0) + ' ms';
  document.getElementById('chartMax').textContent = max.toFixed(0) + ' ms';
}

async function runMeasurement(phase) {
  showView('view-scan');
  resetChart();
  document.getElementById('scanLabel').textContent =
    phase === 'before' ? 'جاري القياس الحقيقي (قبل الـVPN)...' : 'جاري القياس الحقيقي (بعد الـVPN)...';

  document.getElementById('scanErrorActions').style.display = 'none';
  document.getElementById('scanRetryBtn').onclick = () => runMeasurement(phase);
  const items = document.querySelectorAll('#checklist .check-item');
  items.forEach(i => { i.classList.remove('done', 'active'); i.querySelector('.val').textContent = ''; });
  const setActive = (key) => document.querySelector(`.check-item[data-key="${key}"]`).classList.add('active');

  try {
    setActive('dns');
    const dns = await measureDns();
    markDone('dns', dns !== null ? dns.toFixed(0) + ' ms' : 'من الذاكرة المؤقتة (غير قابل للقياس)');

    const runningSamples = [];
    setActive('latency'); setActive('jitter');
    const { latency, jitter, confidence, cv } = await measureLatencyAndJitter(8, (dt) => {
      runningSamples.push(dt);
      drawChart(runningSamples);
    });
    markDone('latency', latency.toFixed(0) + ' ms');
    markDone('jitter', jitter.toFixed(0) + ' ms');

    setActive('speed');
    const speed = await measureDownloadSpeed();
    markDone('speed', speed.toFixed(1) + ' Mbps');

    setActive('loss');
    const loss = await measurePacketLoss();
    markDone('loss', loss + '%');

    setActive('loc');
    const location = await getLocation();
    markDone('loc', location ? (location.city ? `${location.city}, ${location.country}` : location.country) : 'تعذر الجلب');

    measurements[phase] = { latency, jitter, dns, speed, loss, location, conn: getConnectionInfo(), confidence, cv };

    await new Promise(r => setTimeout(r, 400));

    if (phase === 'before') {
      showView('view-vpn-prompt');
    } else {
      buildResults();
    }
  } catch (err) {
    {
      const lbl = document.getElementById('scanLabel');
      const reason = document.createElement('span');
      reason.style.color = 'var(--danger)';
      reason.textContent = err.message === 'timeout' ? 'انتهت مهلة الاتصال بسيرفر القياس' : String(err.message || err);
      const hint = document.createElement('span');
      hint.style.fontSize = '12px';
      hint.textContent = phase === 'after'
        ? 'لو كنت توّك مفعّل الـVPN، انتظر ثواني لين يستقر الاتصال واضغط إعادة المحاولة.'
        : 'تأكد من اتصالك بالإنترنت. لو الخطأ "Failed to fetch"، غالبًا المتصفح أو الصفحة تمنع الاتصال بسيرفر القياس — افتح نسخة الموقع المنشورة على الإنترنت.';
      lbl.replaceChildren('⚠ تعذّر إكمال القياس: ', reason, document.createElement('br'), hint);
    }
    document.getElementById('scanErrorActions').style.display = 'flex';
    console.error(err);
  }
}

function markDone(key, text) {
  const item = document.querySelector(`.check-item[data-key="${key}"]`);
  item.classList.remove('active');
  item.classList.add('done');
  item.querySelector('.val').textContent = text;
}

// percent change that never divides by zero / returns NaN
function pctChange(before, after) {
  if (!isFinite(before) || !isFinite(after)) return 0;
  if (before <= 0) return after > 0 ? 100 : 0;
  return ((after - before) / before) * 100;
}

function computeScore(b, a) {
  let score = 100;
  const speedChangePct = pctChange(b.speed, a.speed);
  const latencyChangePct = pctChange(b.latency, a.latency);
  const lossIncrease = Math.max(0, (a.loss || 0) - (b.loss || 0));

  if (speedChangePct < 0) score -= Math.min(40, Math.abs(speedChangePct) * 0.5);
  if (latencyChangePct > 0) score -= Math.min(30, latencyChangePct * 0.25);
  score -= Math.min(20, lossIncrease * 1.2 + (a.loss || 0) * 0.3);
  if (a.confidence === 'low') score -= 6;
  else if (a.confidence === 'mid') score -= 2;

  score = Math.max(5, Math.min(100, Math.round(score)));

  let grade, color;
  if (score >= 90) { grade = 'A'; color = 'var(--accent)'; }
  else if (score >= 78) { grade = 'B+'; color = 'var(--accent)'; }
  else if (score >= 65) { grade = 'B'; color = 'var(--accent)'; }
  else if (score >= 50) { grade = 'C'; color = 'var(--warn)'; }
  else if (score >= 35) { grade = 'D'; color = 'var(--warn)'; }
  else { grade = 'F'; color = 'var(--danger)'; }

  return { score, grade, color };
}

function animateNumber(el, to, decimals, suffix, duration = 700) {
  const from = 0;
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = from + (to - from) * eased;
    el.textContent = val.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function buildResults() {
  const b = measurements.before;
  const a = measurements.after;

  const { score, grade, color } = computeScore(b, a);
  const circumference = 377;
  const offset = circumference - (score / 100) * circumference;
  const ringFill = document.getElementById('scoreRingFill');
  ringFill.style.stroke = color;
  requestAnimationFrame(() => { ringFill.style.strokeDashoffset = offset; });
  document.getElementById('scoreGrade').textContent = grade;
  document.getElementById('scoreGrade').style.color = color;
  document.getElementById('scoreNum').textContent = score + ' / 100';
  document.getElementById('scoreLabel').textContent =
    score >= 78 ? 'اتصالك مع الـVPN بحالة ممتازة' :
    score >= 50 ? 'اتصالك مع الـVPN بحالة مقبولة، فيه مجال للتحسين' :
    'اتصالك مع الـVPN فيه مشاكل واضحة تحتاج إصلاح';

  animateNumber(document.getElementById('beforeSpeed'), b.speed, 1, ' Mbps');
  animateNumber(document.getElementById('afterSpeed'), a.speed, 1, ' Mbps');
  animateNumber(document.getElementById('beforePing'), b.latency, 0, ' ms');
  animateNumber(document.getElementById('afterPing'), a.latency, 0, ' ms');
  document.getElementById('beforeDns').textContent = b.dns != null ? b.dns.toFixed(0) + ' ms' : 'مخزّن مؤقتًا';
  document.getElementById('afterDns').textContent = a.dns != null ? a.dns.toFixed(0) + ' ms' : 'مخزّن مؤقتًا';
  document.getElementById('lossVal').textContent = a.loss + '%';
  document.getElementById('lossBeforeVal').textContent = b.loss + '%';

  // colors follow the real comparison instead of "before=green, after=red"
  const setCls = (id, cls) => { const el = document.getElementById(id); el.classList.remove('good', 'bad'); if (cls) el.classList.add(cls); };
  const cmp = (beforeV, afterV, higherIsBetter) => {
    if (beforeV == null || afterV == null) return [null, null];
    if (Math.abs(afterV - beforeV) / Math.max(Math.abs(beforeV), 1) < 0.05) return ['good', 'good'];
    const afterBetter = higherIsBetter ? afterV > beforeV : afterV < beforeV;
    return afterBetter ? ['bad', 'good'] : ['good', 'bad'];
  };
  [['Speed', b.speed, a.speed, true], ['Ping', b.latency, a.latency, false], ['Dns', b.dns, a.dns, false]].forEach(([k, bv, av, hib]) => {
    const [cb, ca] = cmp(bv, av, hib);
    setCls('before' + k, cb); setCls('after' + k, ca);
  });

  // location comparison card
  const locCard = document.getElementById('locCard');
  // null = unknown (lookup failed) — never treat a failed lookup as "unchanged"
  const locationChanged = (b.location && a.location) ? (b.location.ip !== a.location.ip || b.location.country !== a.location.country) : null;
  measurements.locationChanged = locationChanged;
  if (b.location && a.location) {
    locCard.style.display = 'flex';
    document.getElementById('locBefore').textContent = b.location.city ? `${b.location.city}, ${b.location.country}` : b.location.country;
    document.getElementById('locAfter').textContent = a.location.city ? `${a.location.city}, ${a.location.country}` : a.location.country;
    const badge = document.getElementById('locBadge');
    if (locationChanged) {
      badge.textContent = 'تغيّر ✓'; badge.className = 'loc-badge ok';
    } else {
      badge.textContent = 'لم يتغيّر ⚠'; badge.className = 'loc-badge warn';
    }
  } else {
    locCard.style.display = 'none';
  }

  renderOmanCard(b, a);

  const speedChangePct = pctChange(b.speed, a.speed);
  const speedDropPct = Math.max(0, -speedChangePct);
  const speedImprovePct = Math.max(0, speedChangePct);
  const latencyChangePct = pctChange(b.latency, a.latency);
  const dnsKnown = b.dns != null && a.dns != null;
  const dnsIncrease = dnsKnown ? a.dns - b.dns : 0;
  const lossIncrease = (a.loss || 0) - (b.loss || 0);

  document.getElementById('dropPct').textContent =
    (speedChangePct >= 0 ? '+' : '-') + Math.abs(speedChangePct).toFixed(0) + '%';

  const confLabels = { high: 'دقة قياس عالية', mid: 'دقة قياس متوسطة', low: 'دقة قياس منخفضة — شبكة غير مستقرة وقت القياس' };
  const confBadge = document.getElementById('confidenceBadge');
  confBadge.textContent = confLabels[a.confidence] || '';
  confBadge.className = 'confidence-badge ' + (a.confidence === 'high' ? 'high' : a.confidence === 'mid' ? 'mid' : 'low');

  let title, body, fixKey;
  if (a.loss > 15 && lossIncrease >= 10) {
    title = 'فقدان بيانات ملحوظ بعد تفعيل الـVPN';
    body = `نسبة الحزم المفقودة ارتفعت من ${b.loss}% إلى ${a.loss}% بعد الـVPN، وهذا يفسر أي تقطيع أو بطء ملحوظ أثناء الاتصال — جرّب تبديل سيرفر الـVPN.`;
    fixKey = 'loss';
  } else if (a.loss > 15) {
    title = 'فقدان بيانات من شبكتك نفسها';
    body = `نسبة الحزم المفقودة عالية (${b.loss}% قبل و${a.loss}% بعد)، يعني المشكلة غالبًا من شبكتك أو الـWi-Fi نفسه وليست من الـVPN.`;
    fixKey = 'loss';
  } else if (speedImprovePct > 15 || latencyChangePct < -20) {
    title = 'الـVPN حسّن أداء شبكتك';
    body = 'الأرقام بعد تفعيل الـVPN أفضل من قبله — مؤشر إن مسار الشبكة العادي عندك فيه ازدحام أو تقييد من مزوّد الخدمة، والـVPN يتجاوزه بمسار أفضل.';
    fixKey = 'improve';
  } else if (dnsKnown && dnsIncrease > 15 && a.dns > 20) {
    title = 'تعارض محتمل في إعدادات DNS';
    body = 'زمن الـDNS lookup زاد بشكل واضح بعد تفعيل الـVPN، وهذا مؤشر على إن السيرفر يستخدم DNS بطيء أو بعيد.';
    fixKey = 'dns';
  } else if (latencyChangePct > 80) {
    title = 'سيرفر الـVPN بعيد جغرافيًا عنك';
    body = 'زمن الاستجابة (Ping) زاد بنسبة كبيرة جدًا، وهذا نمط متوقع لما السيرفر يكون بمنطقة بعيدة عن موقعك الفعلي.';
    fixKey = 'distance';
  } else if (speedDropPct > 40) {
    title = 'انخفاض متوقع بسبب التشفير والازدحام';
    body = 'الانخفاض بالسرعة يقع بالمدى الطبيعي لتشفير الـVPN، لكنه ملحوظ — قد يتحسن بتبديل بروتوكول الاتصال أو السيرفر.';
    fixKey = 'encryption';
  } else {
    title = 'الأداء ضمن النطاق الطبيعي';
    body = 'الفروقات اللي قِسناها بسيطة نسبيًا، الـVPN ما يبيّن تأثيرًا كبيرًا غير طبيعي على شبكتك حاليًا.';
    fixKey = 'normal';
  }
  document.getElementById('diagTitle').textContent = title;
  document.getElementById('diagBody').textContent = body;

  const speedVerb = speedChangePct >= 0 ? 'تحسّنت' : 'انخفضت';
  const pingVerb = latencyChangePct <= 0 ? 'انخفض' : 'ارتفع';
  const ruleBasedText =
    `بمقارنة القياسين: السرعة ${speedVerb} من ${b.speed.toFixed(1)} إلى ${a.speed.toFixed(1)} Mbps (${Math.abs(speedChangePct).toFixed(0)}%)، ` +
    `وPing ${pingVerb} من ${b.latency.toFixed(0)} إلى ${a.latency.toFixed(0)} ms. ${body}`;

  document.getElementById('aiWho').innerHTML = '<div class="dot"></div>SMART ANALYSIS';
  document.getElementById('aiBox').classList.remove('live');
  document.getElementById('aiText').textContent = ruleBasedText;
  document.getElementById('aiNote').textContent = '';

  // visual comparison bars (real values, scaled relative to the larger of the two)
  const maxSpeed = Math.max(b.speed, a.speed, 1);
  const maxPing = Math.max(b.latency, a.latency, 1);
  document.getElementById('barSpeedBefore').style.width = (b.speed / maxSpeed * 100).toFixed(1) + '%';
  document.getElementById('barSpeedAfter').style.width = (a.speed / maxSpeed * 100).toFixed(1) + '%';
  document.getElementById('barSpeedBeforeVal').textContent = b.speed.toFixed(1) + ' Mbps';
  document.getElementById('barSpeedAfterVal').textContent = a.speed.toFixed(1) + ' Mbps';
  document.getElementById('barPingBefore').style.width = (b.latency / maxPing * 100).toFixed(1) + '%';
  document.getElementById('barPingAfter').style.width = (a.latency / maxPing * 100).toFixed(1) + '%';
  document.getElementById('barPingBeforeVal').textContent = b.latency.toFixed(0) + ' ms';
  document.getElementById('barPingAfterVal').textContent = a.latency.toFixed(0) + ' ms';

  // real browser-reported connection type, shown only if the browser exposes it
  const connNote = document.getElementById('connNote');
  if (a.conn && a.conn.type) {
    connNote.style.display = 'block';
    connNote.textContent = `نوع الاتصال المُبلَّغ من المتصفح: ${a.conn.type.toUpperCase()}` +
      (a.conn.downlink ? ` — سرعة تقديرية ${a.conn.downlink} Mbps` : '');
  } else {
    connNote.style.display = 'none';
  }

  document.getElementById('fixPanel').classList.remove('show');
  document.getElementById('fixSteps').innerHTML = fixTips[fixKey].map(s => `<li>${s}</li>`).join('');
  currentFixKey = fixKey;

  saveHistory({ time: new Date().toLocaleTimeString('ar', {hour:'2-digit', minute:'2-digit'}), before: b, after: a, title });
  renderHistory();

  showView('view-results');
}

const fixTips = {
  improve: [
    'فعّل الـVPN بشكل دائم إذا لوحظ إنه يحسّن أداء الشبكة بثبات.',
    'كرّر القياس بأوقات مختلفة من اليوم للتأكد إن التحسن مو مؤقت.'
  ],
  loss: [
    'بدّل سيرفر الـVPN لموقع أقرب جغرافيًا.',
    'جرّب بروتوكول اتصال مختلف (WireGuard بدل OpenVPN) إذا يتيحه التطبيق.',
    'تأكد إن الجهاز متصل بشبكة Wi-Fi مستقرة وقت الاستخدام.'
  ],
  dns: [
    'غيّر إعدادات DNS يدويًا داخل تطبيق الـVPN (مثل 1.1.1.1 أو 8.8.8.8).',
    'أعد تشغيل تطبيق الـVPN بعد تغيير الـDNS.'
  ],
  distance: [
    'اختر سيرفر VPN أقرب جغرافيًا للموقع الفعلي بدل الاختيار التلقائي.',
    'جرّب أكثر من سيرفر بنفس الدولة وقارن الأداء بينها.'
  ],
  encryption: [
    'جرّب بروتوكول أخف مثل WireGuard بدل البروتوكولات الأقدم.',
    'أغلق التطبيقات الثانية اللي تستهلك الشبكة أثناء الاستخدام.'
  ],
  normal: [
    'لا يوجد إجراء عاجل — الأداء الحالي طبيعي.',
    'راقب الأداء بشكل دوري من هذي الصفحة للتأكد من الاستقرار.'
  ]
};
let currentFixKey = 'normal';

function toggleFixPanel() {
  document.getElementById('fixPanel').classList.toggle('show');
}

async function downloadReport() {
  const b = measurements.before, a = measurements.after;
  if (!b || !a) return;
  const lines = [
    'تقرير تشخيص الشبكة — NoviNet',
    'التاريخ: ' + new Date().toLocaleString('ar-OM'),
    '',
    'قبل الـVPN:',
    `  السرعة: ${b.speed.toFixed(1)} Mbps`,
    `  Ping: ${b.latency.toFixed(0)} ms`,
    `  Jitter: ${b.jitter.toFixed(0)} ms`,
    `  DNS lookup: ${b.dns != null ? b.dns.toFixed(0) + ' ms' : 'مخزّن مؤقتًا'}`,
    `  فقدان الحزم (تقديري): ${b.loss}%`,
    '',
    'بعد الـVPN:',
    `  السرعة: ${a.speed.toFixed(1)} Mbps`,
    `  Ping: ${a.latency.toFixed(0)} ms`,
    `  Jitter: ${a.jitter.toFixed(0)} ms`,
    `  DNS lookup: ${a.dns != null ? a.dns.toFixed(0) + ' ms' : 'مخزّن مؤقتًا'}`,
    `  فقدان الحزم (تقديري): ${a.loss}%`,
    '',
    'التشخيص: ' + document.getElementById('diagTitle').textContent,
    document.getElementById('diagBody').textContent,
    '',
    'خطوات مقترحة:',
    ...fixTips[currentFixKey].map((s, i) => `  ${i + 1}. ${s}`),
    ...(document.getElementById('omanCard').style.display !== 'none' ? [
      '',
      'توافق النطاق العُماني: ' + document.getElementById('omanBadge').textContent,
      document.getElementById('omanBody').textContent,
      'البديل المقترح: ' + document.getElementById('omanAltText').textContent
    ] : [])
  ];
  const text = lines.join('\n');
  try {
    const downloads = (window.claude && typeof claude.use === 'function') ? await claude.use('downloads') : null;
    if (downloads) {
      try { await downloads.save({ filename: 'novinet-report.txt', data: text }); return; }
      catch (saveErr) { /* declined / unavailable — fall back below */ }
    }
  } catch (e) { /* capability not supported here */ }
  // outside claude.ai (normal website): regular file download
  if (!(window.claude && typeof claude.use === 'function')) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'novinet-report.txt';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return;
    } catch (e) { /* fall through to copy box */ }
  }
  showReportFallback(text);
}

function showReportFallback(text) {
  const box = document.getElementById('reportFallback');
  box.style.display = 'block';
  document.getElementById('reportText').value = text;
}

async function copyReport() {
  const ta = document.getElementById('reportText');
  const msg = document.getElementById('reportCopyMsg');
  try { await navigator.clipboard.writeText(ta.value); }
  catch (e) { ta.focus(); ta.select(); }
  msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2000);
}

// ---- scan history (client-side, localStorage) ----
function saveHistory(entry) {
  try {
    const hist = JSON.parse(localStorage.getItem('novinet_history') || '[]');
    hist.unshift(entry);
    localStorage.setItem('novinet_history', JSON.stringify(hist.slice(0, 15)));
  } catch (e) { /* ignore storage errors */ }
}

function renderHistory() {
  const wrap = document.getElementById('historyList');
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem('novinet_history') || '[]'); } catch (e) {}
  if (!hist.length) {
    wrap.innerHTML = '<div class="history-empty">ما فيه فحوصات محفوظة بعد</div>';
    return;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  hist = hist.filter(h => h && h.before && h.after && isFinite(h.before.speed) && isFinite(h.after.speed));
  if (!hist.length) { wrap.innerHTML = '<div class="history-empty">ما فيه فحوصات محفوظة بعد</div>'; return; }
  wrap.innerHTML = '<div class="history-list">' + hist.map(h =>
    `<div class="history-item">
      <span class="h-time">${esc(h.time)}</span>
      <span class="h-metrics">${Number(h.before.speed).toFixed(0)}→${Number(h.after.speed).toFixed(0)} Mbps</span>
      <span class="h-diag">${esc(h.title)}</span>
    </div>`
  ).join('') + '</div>';
}

function clearHistory() {
  try { localStorage.removeItem('novinet_history'); } catch (e) {}
  renderHistory();
}

function resetAll(){
  measurements = { before: null, after: null };
  document.getElementById('scoreRingFill').style.strokeDashoffset = 377;
  document.querySelectorAll('#checklist .check-item').forEach(item => {
    item.classList.remove('done', 'active');
    item.querySelector('.val').textContent = '';
  });
  document.getElementById('statusCard').classList.remove('show');
  document.getElementById('fixPanel').classList.remove('show');
  document.getElementById('omanCard').style.display = 'none';
  document.getElementById('reportFallback').style.display = 'none';
  document.getElementById('scanErrorActions').style.display = 'none';
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  showView('view-home');
}

// ---- Oman-domain compatibility: uses the SAME real geolocation data already
// captured for the before/after location card — no extra request, no new claim.
// NoviNet cannot provide an alternate IP itself (that is the VPN app's job),
// so the "alternative" here is an honest, actionable recommendation: which
// kind of server/setting keeps Oman-registered services reachable.
function isOman(countryStr) {
  if (!countryStr) return false;
  const s = countryStr.toString().toLowerCase();
  return s.includes('oman') || s.includes('عمان') || s.includes('عُمان');
}

function renderOmanCard(b, a) {
  const card = document.getElementById('omanCard');
  if (!b.location || !a.location) { card.style.display = 'none'; return; }

  const beforeOman = isOman(b.location.country);
  const afterOman = isOman(a.location.country);
  const badge = document.getElementById('omanBadge');
  const body = document.getElementById('omanBody');
  const altText = document.getElementById('omanAltText');

  card.style.display = 'block';

  if (!beforeOman) {
    badge.textContent = 'غير محدد'; badge.className = 'oman-badge warn';
    body.textContent = `موقعك قبل الـVPN طلع خارج عُمان حسب القياس (${b.location.country})، فما نقدر نبني تقييم دقيق لتوافق الخدمات والبنوك العُمانية من هذا الفحص.`;
    altText.textContent = 'لو تُستخدم خدمات عُمانية أثناء السفر، اختر سيرفر VPN داخل عُمان نفسها لو التطبيق يوفر ذلك — هذا يرجّع الموقع الظاهري لعُمان.';
  } else if (!afterOman) {
    badge.textContent = 'قد تُحجب ✗'; badge.className = 'oman-badge bad';
    body.textContent = `موقعك الظاهري بعد الـVPN طلع خارج عُمان (${a.location.country})، وأغلب البنوك والخدمات الحكومية العُمانية تربط الوصول بموقع داخل السلطنة — فقد تُطلب منك تحقق إضافي أو يُرفض الدخول تمامًا.`;
    altText.textContent = 'اختر سيرفر VPN داخل عُمان (إذا متوفر بالتطبيق)، أو فعّل خاصية "تقسيم النفق" (Split Tunneling) إذا موجودة — تخلي تطبيقات البنوك والخدمات الحكومية تمر مباشرة بالموقع الحقيقي، والباقي يمر عبر الـVPN.';
  } else {
    badge.textContent = 'متوافق ✓'; badge.className = 'oman-badge ok';
    body.textContent = 'موقعك الظاهري بعد الـVPN لسا داخل عُمان، فالخدمات المحلية (البنوك، الجهات الحكومية) غالبًا تشتغل بشكل طبيعي.';
    altText.textContent = 'الوضع الحالي جيد. لو مطلوب خصوصية أعلى بدون المخاطرة بتوافق الخدمات العُمانية، جرّب خاصية "تقسيم النفق" لو متوفرة بدل تمرير كل الترافيك عبر نفس السيرفر.';
  }
}

// ---- app compatibility: evaluated from THIS check's real measurements ----
// (not a live probe into each app — we don't have access to that from a browser —
// but a transparent, rule-based comparison of each app's typical network needs
// against the actual numbers this scan just measured after the VPN was enabled)
const STATUS_COLORS = { good: '#6EA8FF', warn: '#F5B95B', bad: '#FB7A85' };

function evaluateAppCompat(key, a, locationChanged) {
  switch (key) {
    case 'banking':
      if (locationChanged === null) return { status: 'warn', title: 'ما قدرنا نتأكد من الموقع', desc: 'تعذّر جلب موقعك الظاهري بأحد القياسين، فما نقدر نحكم إذا البنك بيعتبر الدخول مشبوه. جرّب فحص جديد.' };
      if (locationChanged) return { status: 'bad', title: 'قد يرفض الدخول أو يطلب تحقق إضافي', desc: 'موقعك الظاهري تغيّر فعليًا بعد تفعيل الـVPN — تطبيقات البنوك تراقب هذا وقد تعتبره نشاطًا مشتبهًا.' };
      if (a.loss > 5) return { status: 'warn', title: 'احتمال انقطاع الجلسة', desc: `فقدان الحزم بعد الـVPN ${a.loss}% — مستوى قد يقطع عمليات حساسة كالتحويلات.` };
      return { status: 'good', title: 'يعمل بشكل طبيعي', desc: 'موقعك الظاهري لم يتغيّر وفقدان الحزم ضمن الطبيعي.' };
    case 'whatsapp':
      if (a.loss > 5 || a.jitter > 50) return { status: 'bad', title: 'مكالمات متقطعة متوقعة', desc: `فقدان حزم ${a.loss}% وJitter ${a.jitter.toFixed(0)}ms — مستوى يسبب تقطيع واضح بمكالمات الصوت/الفيديو.` };
      if (a.loss > 2 || a.jitter > 25) return { status: 'warn', title: 'جودة مكالمات متوسطة', desc: 'الرسائل تعمل تمام، لكن المكالمات ممكن تتقطع بالشبكات المزدحمة.' };
      return { status: 'good', title: 'يعمل بشكل طبيعي', desc: 'ثبات الاتصال وفقدان الحزم ضمن النطاق المثالي للمكالمات والرسائل.' };
    case 'netflix':
      if (a.speed < 5) return { status: 'bad', title: 'تقطيع متوقع، جودة منخفضة', desc: `السرعة الحالية ${a.speed.toFixed(1)} Mbps أقل من الحد الأدنى لبث مستقر (5 Mbps).` };
      if (a.speed < 15) return { status: 'warn', title: 'جودة SD/HD فقط', desc: `${a.speed.toFixed(1)} Mbps تكفي للبث العادي، بس مو كافية لـ4K بثبات.` };
      return { status: 'good', title: 'يعمل بشكل طبيعي', desc: `${a.speed.toFixed(1)} Mbps كافية للبث بجودة عالية بدون تقطيع.` };
    case 'instagram':
      if (a.speed < 2) return { status: 'warn', title: 'تحميل بطيء للفيديوهات', desc: `${a.speed.toFixed(1)} Mbps منخفضة — الصور تفتح، لكن الفيديوهات والـReels ممكن تتأخر.` };
      return { status: 'good', title: 'يعمل بشكل طبيعي', desc: 'السرعة الحالية كافية لتصفح طبيعي بدون تأخير ملحوظ.' };
    case 'gaming':
      if (a.latency > 150 || a.jitter > 50) return { status: 'bad', title: 'تأخير واضح باللعب (Lag)', desc: `Ping ${a.latency.toFixed(0)}ms وJitter ${a.jitter.toFixed(0)}ms — مستوى يسبب تأخير محسوس بالألعاب التنافسية.` };
      if (a.latency > 80 || a.jitter > 25) return { status: 'warn', title: 'أداء مقبول، لا مثالي', desc: 'مناسب لألعاب غير تنافسية — تبديل سيرفر VPN أقرب قد يقلل الـPing.' };
      return { status: 'good', title: 'يعمل بشكل طبيعي', desc: `Ping ${a.latency.toFixed(0)}ms ضمن النطاق الجيد للألعاب الأونلاين.` };
    case 'oman': {
      const beforeLoc = measurements.before && measurements.before.location;
      if (!beforeLoc || !isOman(beforeLoc.country)) {
        return { status: 'warn', title: 'ما قدرنا نتأكد', desc: 'موقعك الأصلي قبل الـVPN ما طلع داخل عُمان حسب القياس، فما نقدر نبني تقييمًا دقيقًا لتوافق الخدمات العُمانية.' };
      }
      if (!measurements.after || !measurements.after.location) {
        return { status: 'warn', title: 'ما قدرنا نتأكد', desc: 'تعذّر جلب موقعك الظاهري بعد الـVPN، فما نقدر نحكم على توافق الخدمات العُمانية. جرّب فحص جديد.' };
      }
      if (!isOman(a.location && a.location.country)) {
        return { status: 'bad', title: 'قد تُحجب أو تطلب تحقق إضافي', desc: `موقعك الظاهري بعد الـVPN طلع خارج عُمان — والبنوك والخدمات الحكومية العُمانية غالبًا تربط الوصول بموقع داخل السلطنة.` };
      }
      return { status: 'good', title: 'يعمل بشكل طبيعي', desc: 'موقعك الظاهري لسا داخل عُمان، فالخدمات والبنوك المحلية غالبًا تشتغل عادي.' };
    }
    default:
      return { status: 'good', title: '—', desc: '—' };
  }
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.setAttribute('role', 'button'); chip.setAttribute('tabindex', '0');
  chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); } });
  chip.addEventListener('click', () => {
    const a = measurements.after;
    if (!a) {
      document.getElementById('statusTitle').textContent = 'سوّ فحص كامل أول';
      document.getElementById('statusDesc').textContent = 'هذا التقييم يحتاج نتائج قياس حقيقية — ارجع للرئيسية وسوّ فحص قبل/بعد الـVPN.';
      document.getElementById('statusBadge').style.background = STATUS_COLORS.warn;
      document.getElementById('statusCard').classList.add('show');
      return;
    }
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const result = evaluateAppCompat(chip.dataset.key, a, measurements.locationChanged);
    const color = STATUS_COLORS[result.status];
    document.getElementById('statusBadge').style.background = color;
    document.getElementById('statusBadge').style.boxShadow = '0 0 8px ' + color;
    document.getElementById('statusTitle').textContent = chip.textContent + ' — ' + result.title;
    document.getElementById('statusDesc').textContent = result.desc;
    document.getElementById('statusCard').classList.add('show');
  });
});

// idle waveform animation
function animateWave(id, amp){
  const path = document.getElementById(id);
  if (!path) return;
  let t = 0;
  function frame(){
    t += 0.04;
    let d = 'M0,45 ';
    for(let x=0; x<=600; x+=12){
      const y = 45 + Math.sin(x*0.03 + t) * amp * (0.4 + 0.6*Math.sin(x*0.01+t*0.5));
      d += `L${x},${y} `;
    }
    path.setAttribute('d', d);
    requestAnimationFrame(frame);
  }
  frame();
}
animateWave('waveVpn', 6);

if (location.protocol === 'file:') {
  document.getElementById('fileWarning').style.display = 'block';
}

function tick(){
  const now = new Date();
  document.getElementById('clock').textContent = now.toTimeString().slice(0,8);
}
tick();
setInterval(tick, 1000);

renderHistory();
renderContact();
try { refreshHomeVpnToggle(); } catch(e){}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBanner').style.display = 'flex';
});

function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(() => {
    document.getElementById('installBanner').style.display = 'none';
    deferredInstallPrompt = null;
  });
}

// iPhone/iPad Safari never fires beforeinstallprompt: explain the manual way.
(function(){
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!isIos || standalone) return;
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  banner.innerHTML = '<span>📲 لتثبيت NoviNet على آيفون: اضغط زر المشاركة <b>⎋</b> ثم «إضافة إلى الشاشة الرئيسية»</span>' +
    '<button class="link-btn" data-action="hideInstallBanner">إغلاق</button>';
  banner.style.display = 'flex';
})();

window.addEventListener('appinstalled', () => {
  document.getElementById('installBanner').style.display = 'none';
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sw.js not deployed yet — fails silently */ });
  });
}

// Re-check the subscription when the app comes back to the foreground
// (e.g. after returning from the WireGuard / App Store).
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !getVpnRequestId()) return;
  try { refreshHomeVpnToggle(); } catch (e) {}
  const v = document.getElementById('view-vpn');
  if (v && v.classList.contains('active')) { try { checkVpnStatus(); } catch (e) {} }
});

// ---------------------------------------------------------------------------
// Event wiring (no inline handlers anywhere, so the CSP can forbid inline script).
// Elements declare what they do with data-action (+ optional data-arg); only the
// names in this table can run.
// ---------------------------------------------------------------------------
const ACTIONS = Object.assign(Object.create(null), {
  showView:            (el) => showView(el.dataset.arg),
  runMeasurement:      (el) => runMeasurement(el.dataset.arg),
  toggleAccordion:     (el) => toggleAccordion(el),
  installApp:          () => installApp(),
  clearHistory:        () => clearHistory(),
  resetAll:            () => resetAll(),
  toggleFixPanel:      () => toggleFixPanel(),
  downloadReport:      () => downloadReport(),
  copyReport:          () => copyReport(),
  downloadVpnConfig:   () => downloadVpnConfig(),
  showVpnConfigFallback: () => showVpnConfigFallback(),
  shareVpnConfig:      () => shareVpnConfig(),
  copyVpnConfig:       () => copyVpnConfig(),
  hideInstallBanner:   () => { const b = document.getElementById('installBanner'); if (b) b.style.display = 'none'; },
  scrollToTool:        () => { const t = document.getElementById('tool'); if (t) t.scrollIntoView({ behavior: SMOOTH() }); },
  goTool:              () => { showView('view-home'); setTimeout(() => { const t = document.getElementById('tool'); if (t) t.scrollIntoView({ behavior: SMOOTH() }); }, 50); }
});

function runAction(el) {
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el);
}

document.addEventListener('click', (e) => {
  const el = e.target instanceof Element ? e.target.closest('[data-action]') : null;
  if (el) runAction(el);
});

// role="button" elements that are not real <button>s must answer Enter and Space.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target instanceof Element ? e.target.closest('[role="button"][data-action]') : null;
  if (!el || e.target !== el) return;
  e.preventDefault();
  runAction(el);
});

const vpnReqForm = document.getElementById('vpnRequestForm');
if (vpnReqForm) vpnReqForm.addEventListener('submit', (e) => { e.preventDefault(); requestVpnAccess(); });
