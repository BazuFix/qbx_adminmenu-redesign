'use strict';

const IS_GAME = typeof GetParentResourceName === 'function';
const RES = IS_GAME ? GetParentResourceName() : 'qbx_adminmenu';

const S = {
    mode: null,
    config: { sounds: true, fancyBackground: true, categories: [] },
    locales: {},
    lang: 'en',
    panel: null,
    me: { id: 0, name: '' },
    perms: {},
    state: {},
    page: 'dashboard',
    players: [],
    selected: null,
    playerTab: 'general',
    playerSearch: '',
    vehicles: null,
    vehCat: 'all',
    vehSearch: '',
    vehLimit: 120,
    weather: null,
    hour: 12,
    reports: [],
    reportFilter: 'all',
    reportSearch: '',
    activeReport: null,
    unread: new Set(),
    my: { reports: [], active: null, unread: new Set(), cat: null },
    modal: null,
    timers: {},
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripColors = (s) => String(s ?? '').replace(/\^\d/g, '');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function t(key, ...args) {
    let str = S.locales['ui.' + key] ?? key;
    for (const a of args) str = str.replace('%s', a);
    return str;
}

function hueOf(str) {
    let h = 0;
    for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
}

function initials(name) {
    const parts = String(name || '?').replace(/\|.*$/, '').trim().split(/\s+/);
    return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

function avatar(name, cls = '', online) {
    const status = online === undefined ? '' : `<span class="status ${online ? '' : 'off'}"></span>`;
    return `<div class="avatar ${cls}" style="--h:${hueOf(name)}">${esc(initials(name))}${status}</div>`;
}

const fmtClock = (ts) => new Date(ts * 1000).toLocaleTimeString(S.lang, { hour: '2-digit', minute: '2-digit' });

function ago(ts) {
    const d = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (d < 60) return t('just_now');
    if (d < 3600) return t('min_ago', Math.floor(d / 60));
    if (d < 86400) return t('hour_ago', Math.floor(d / 3600));
    return t('day_ago', Math.floor(d / 86400));
}

function uptime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function copyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
}

function stagger(root) {
    $$('.stagger', root).forEach((s) => [...s.children].forEach((c, i) => c.style.setProperty('--i', i)));
}

function countUp(root) {
    if (document.body.classList.contains('no-anim')) return $$('[data-count]', root).forEach((el) => (el.textContent = Number(el.dataset.count).toLocaleString('en-US')));
    $$('[data-count]', root).forEach((el) => {
        const to = Number(el.dataset.count) || 0;
        const start = performance.now();
        const dur = 1100;
        const step = (now) => {
            const p = Math.min(1, (now - start) / dur);
            const e = 1 - Math.pow(1 - p, 4);
            el.textContent = Math.round(to * e).toLocaleString('en-US');
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
}

function fillRings(root) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        $$('[data-offset]', root).forEach((c) => (c.style.strokeDashoffset = c.dataset.offset));
        $$('[data-width]', root).forEach((b) => (b.style.width = b.dataset.width));
    }));
}

function hexToRgb(hex) {
    hex = String(hex || '#8b5cf6').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
    }
    return [h, s * 100, l * 100];
}
function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const rgbHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

function setAccent(hex, gradient) {
    const root = document.documentElement.style;
    const rgb = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(rgb);
    const g = Array.isArray(gradient) && gradient.length >= 2
        ? gradient.map(hexToRgb)
        : [rgb, hslToRgb((h + 45) % 360, Math.max(s, 70), clamp(l, 50, 62)), hslToRgb((h + 300) % 360, Math.max(s, 70), clamp(l, 48, 58))];
    if (!g[2]) g[2] = g[0];

    root.setProperty('--accent', rgbHex(rgb));
    root.setProperty('--accent-rgb', rgb.join(','));
    root.setProperty('--accent-text', rgbHex(hslToRgb(h, s, Math.min(85, l + 18))));
    const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    root.setProperty('--on-accent', lum > 0.62 ? '#0b0c12' : '#fff');
    ['g1', 'g2', 'g3'].forEach((k, i) => {
        root.setProperty('--' + k, rgbHex(g[i]));
        root.setProperty(`--${k}-rgb`, g[i].join(','));
    });
    FX.colors = g.map((c) => c.join(','));
}

function setBrandLogo(url) {
    const box = $('#brand-logo');
    const icon = '<i class="fa-solid fa-shield-halved"></i>';
    if (!url) { box.classList.remove('has-img'); box.innerHTML = icon; return; }
    const img = new Image();
    img.alt = '';
    img.onload = () => { box.classList.add('has-img'); box.innerHTML = ''; box.appendChild(img); };
    img.onerror = () => { box.classList.remove('has-img'); box.innerHTML = icon; };
    img.src = url;
}

let actx;
function beep(freq = 600, dur = 0.06, type = 'sine', vol = 0.04) {
    if (!S.config.sounds) return;
    try {
        actx ||= new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(vol, actx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
        o.connect(g).connect(actx.destination);
        o.start();
        o.stop(actx.currentTime + dur);
    } catch (e) { /* audio not available */ }
}
const sfx = {
    hover: () => beep(1400, 0.025, 'sine', 0.01),
    click: () => beep(700, 0.07, 'triangle', 0.045),
    on: () => { beep(660, 0.08, 'sine', 0.05); setTimeout(() => beep(990, 0.1, 'sine', 0.05), 70); },
    off: () => { beep(520, 0.08, 'sine', 0.04); setTimeout(() => beep(330, 0.1, 'sine', 0.04), 70); },
    notify: () => [880, 1175, 1568].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'sine', 0.045), i * 90)),
    error: () => beep(180, 0.2, 'sawtooth', 0.03),
    send: () => { beep(900, 0.05, 'sine', 0.04); setTimeout(() => beep(1300, 0.06, 'sine', 0.03), 50); },
    open: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'sine', 0.03), i * 55)),
};

async function post(name, payload = {}) {
    if (!IS_GAME) return Mock.handle(name, payload);
    try {
        const res = await fetch(`https://${RES}/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(payload),
        });
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function act(name, payload) {
    const res = await post('action', { name, payload });
    if (res && typeof res === 'object' && !Array.isArray(res) && res.error) {
        toast('error', t('error'), res.error);
        return null;
    }
    return res;
}

function toast(type, title, text = '', icon, duration = 4500) {
    const icons = { success: 'fa-solid fa-check', error: 'fa-solid fa-triangle-exclamation', info: 'fa-solid fa-circle-info', report: 'fa-solid fa-comment-dots' };
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `
        <div class="t-ico"><i class="${icon || icons[type] || icons.info}"></i></div>
        <div style="min-width:0">
            <div class="t-title">${esc(title)}</div>
            ${text ? `<div class="t-text">${esc(text)}</div>` : ''}
        </div>
        <div class="t-bar" style="animation-duration:${duration}ms"></div>`;
    $('#toasts').prepend(el);
    if (type === 'error') sfx.error();
    const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    setTimeout(kill, duration);
    el.addEventListener('click', kill);
    while ($('#toasts').children.length > 5) $('#toasts').lastElementChild.remove();
}

const confettiCanvas = $('#confetti');
const cctx = confettiCanvas.getContext('2d');
let confettiParts = [];
let confettiRunning = false;
function confetti(x = innerWidth / 2, y = innerHeight / 2, count = 90) {
    if (document.body.classList.contains('no-anim')) return;
    confettiCanvas.width = innerWidth;
    confettiCanvas.height = innerHeight;
    const colors = [...FX.colors.map((c) => `rgb(${c})`), '#ffffff', '#fbbf24'];
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 4 + Math.random() * 9;
        confettiParts.push({
            x, y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 5,
            r: 3 + Math.random() * 5,
            c: colors[(Math.random() * colors.length) | 0],
            rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * 0.4,
            life: 1,
            shape: Math.random() > 0.5 ? 'rect' : 'circle',
        });
    }
    if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(confettiLoop); }
}
function confettiLoop() {
    cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiParts = confettiParts.filter((p) => p.life > 0);
    for (const p of confettiParts) {
        p.vy += 0.28;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.009;
        cctx.save();
        cctx.globalAlpha = Math.max(0, p.life);
        cctx.translate(p.x, p.y);
        cctx.rotate(p.rot);
        cctx.fillStyle = p.c;
        if (p.shape === 'rect') cctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        else { cctx.beginPath(); cctx.arc(0, 0, p.r / 1.4, 0, Math.PI * 2); cctx.fill(); }
        cctx.restore();
    }
    if (confettiParts.length) requestAnimationFrame(confettiLoop);
    else { confettiRunning = false; cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }
}
function confettiAt(el, count) {
    const r = el.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2, count);
}

const FX = {
    colors: ['139,92,246', '236,72,153', '6,182,212'],
    canvas: $('#fx-canvas'),
    running: false,
    pts: [],
    mouse: { x: -999, y: -999 },
    start() {
        if (this.running || !S.config.fancyBackground) return;
        this.running = true;
        const c = this.canvas;
        c.width = c.offsetWidth;
        c.height = c.offsetHeight;
        if (!this.pts.length) {
            for (let i = 0; i < 70; i++) {
                this.pts.push({
                    x: Math.random() * c.width,
                    y: Math.random() * c.height,
                    vx: (Math.random() - 0.5) * 0.35,
                    vy: (Math.random() - 0.5) * 0.35,
                    r: Math.random() * 1.8 + 0.6,
                    c: (Math.random() * 3) | 0,
                });
            }
        }
        requestAnimationFrame(() => this.loop());
    },
    stop() { this.running = false; },
    loop() {
        if (!this.running) return;
        const c = this.canvas;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        const pts = this.pts;
        for (const p of pts) {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > c.width) p.vx *= -1;
            if (p.y < 0 || p.y > c.height) p.vy *= -1;
            const dx = p.x - this.mouse.x, dy = p.y - this.mouse.y;
            const d = Math.hypot(dx, dy);
            if (d < 120) { p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.colors[p.c]},.85)`;
            ctx.shadowBlur = 8;
            ctx.shadowColor = `rgba(${this.colors[p.c]},1)`;
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const a = pts[i], b = pts[j];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (d < 110) {
                    ctx.strokeStyle = `rgba(${this.colors[a.c]},${(1 - d / 110) * 0.18})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(() => this.loop());
    },
};

function fieldHtml(f, i) {
    const common = `data-key="${esc(f.key)}" class="input" placeholder="${esc(f.placeholder ?? '')}" ${i === 0 ? 'data-first' : ''}`;
    let control;
    if (f.type === 'select') {
        control = `<select ${common}>${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value === f.value ? 'selected' : ''} style="background:#14162a">${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
        control = `<textarea ${common} maxlength="${f.max ?? 500}">${esc(f.value ?? '')}</textarea>`;
    } else {
        control = `<input ${common} type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(f.value ?? '')}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}>`;
    }
    return `<div class="field"><label>${esc(f.label)}</label>${control}</div>`;
}

function modal({ title, text, icon = 'fa-solid fa-pen-to-square', fields = [], confirm, cancel, danger = false }) {
    return new Promise((resolve) => {
        if (S.modal) S.modal.cancel();
        const root = $('#modal-root');
        const el = document.createElement('div');
        el.className = 'modal' + (danger ? ' danger' : '');
        el.innerHTML = `
            <div class="m-ico"><i class="${icon}"></i></div>
            <h3>${esc(title)}</h3>
            ${text ? `<p>${esc(text)}</p>` : ''}
            ${fields.length ? `<div class="fields">${fields.map(fieldHtml).join('')}</div>` : ''}
            <div class="foot">
                <button class="btn ghost" data-x="cancel">${esc(cancel || t('cancel'))}</button>
                <button class="btn ${danger ? 'danger' : 'primary'}" data-x="ok"><i class="fa-solid fa-check"></i>${esc(confirm || t('confirm'))}</button>
            </div>`;
        root.appendChild(el);
        requestAnimationFrame(() => root.classList.add('show'));
        setTimeout(() => $('[data-first]', el)?.focus(), 80);

        const done = (val) => {
            root.classList.remove('show');
            S.modal = null;
            setTimeout(() => el.remove(), 350);
            resolve(val);
        };

        const submit = () => {
            const out = {};
            let bad = false;
            fields.forEach((f) => {
                const input = $(`[data-key="${f.key}"]`, el);
                let v = input.value.trim();
                if (f.type === 'number') v = v === '' ? null : Number(v);
                if (f.required && (v === '' || v === null || Number.isNaN(v))) { bad = true; input.style.boxShadow = 'inset 0 0 0 1px var(--danger)'; }
                out[f.key] = v;
            });
            if (bad) {
                el.classList.remove('shake');
                void el.offsetWidth;
                el.classList.add('shake');
                sfx.error();
                return;
            }
            sfx.click();
            done(out);
        };

        $('[data-x=cancel]', el).onclick = () => done(null);
        $('[data-x=ok]', el).onclick = submit;
        $('.dim', root).onclick = () => done(null);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); }
        });
        S.modal = { cancel: () => done(null) };
    });
}

const confirmBox = (title, text, icon = 'fa-solid fa-triangle-exclamation', danger = true) =>
    modal({ title, text, icon, danger, confirm: t('yes') }).then((r) => r !== null);

document.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('.btn, .op, .chip, .card.hover, .nav-item, .cat-card, .send-btn, .tab');
    if (!target) return;
    const r = target.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const rip = document.createElement('span');
    rip.className = 'ripple';
    rip.style.width = rip.style.height = size + 'px';
    rip.style.left = e.clientX - r.left - size / 2 + 'px';
    rip.style.top = e.clientY - r.top - size / 2 + 'px';
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.style.overflow = 'hidden';
    target.appendChild(rip);
    setTimeout(() => rip.remove(), 700);
    sfx.click();
});

let lastHover = null;
document.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.card.hover');
    if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', e.clientX - r.left + 'px');
        card.style.setProperty('--my', e.clientY - r.top + 'px');
    }
    const h = e.target.closest('.nav-item, .op, .chip, .card.hover, .btn');
    if (h && h !== lastHover) sfx.hover();
    lastHover = h;

    if (FX.running) {
        const r = FX.canvas.getBoundingClientRect();
        FX.mouse.x = e.clientX - r.left;
        FX.mouse.y = e.clientY - r.top;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (S.modal) return S.modal.cancel();
    if (S.mode) closeUI(true);
});

function showShell(id) {
    const el = $(id);
    el.classList.remove('closing');
    el.classList.add('show');
    $('#backdrop').classList.add('show');
}

function closeUI(notify) {
    if (!S.mode) return;
    const el = S.mode === 'admin' ? $('#panel') : $('#player-window');
    el.classList.add('closing');
    $('#backdrop').classList.remove('show');
    setTimeout(() => el.classList.remove('show', 'closing'), 350);
    if (S.modal) S.modal.cancel();
    S.mode = null;
    FX.stop();
    clearInterval(S.timers.live);
    clearInterval(S.timers.vehicle);
    if (notify) post('close');
}

function openAdmin(data, state) {
    S.mode = 'admin';
    S.panel = data;
    S.me = data.me;
    S.perms = data.perms || {};
    S.state = state || {};
    $('#me-name').textContent = S.me.name;
    $('#me-avatar').outerHTML = avatar(S.me.name).replace('class="avatar ', 'id="me-avatar" class="avatar ');
    $('#me-sub').textContent = t('on_duty') + ' · #' + S.me.id;
    $('#top-players').textContent = `${data.server.players}/${data.server.maxPlayers}`;
    buildNav();
    showShell('#panel');
    sfx.open();
    setTimeout(() => FX.start(), 200);
    if (!PAGES[S.page] || !allowed(S.page)) S.page = 'dashboard';
    go(S.page, true);
    loadReports();
}

function openPlayerWindow(data) {
    S.mode = 'player';
    S.me = data.me;
    showShell('#player-window');
    sfx.open();
    renderPlayerWindow();
}

const PAGES = {
    dashboard: { icon: 'fa-solid fa-gauge-high', group: 'main', render: renderDashboard },
    self: { icon: 'fa-solid fa-user-astronaut', group: 'main', render: renderSelf },
    players: { icon: 'fa-solid fa-users', group: 'manage', render: renderPlayers },
    reports: { icon: 'fa-solid fa-headset', group: 'manage', render: renderReports, perm: 'reports' },
    bans: { icon: 'fa-solid fa-ban', group: 'manage', render: renderBans, perm: 'bans' },
    vehicles: { icon: 'fa-solid fa-car-side', group: 'manage', render: renderVehicles },
    server: { icon: 'fa-solid fa-server', group: 'world', render: renderServer },
    economy: { icon: 'fa-solid fa-sack-dollar', group: 'world', render: renderEconomy, perm: 'economy' },
    dev: { icon: 'fa-solid fa-code', group: 'world', render: renderDev, perm: 'dev' },
};

const allowed = (page) => !PAGES[page].perm || S.perms[PAGES[page].perm];

function buildNav() {
    const nav = $('#nav');
    $$('.nav-item, .nav-label', nav).forEach((n) => n.remove());
    let group = null;
    let i = 0;
    for (const [id, p] of Object.entries(PAGES)) {
        if (!allowed(id)) continue;
        if (p.group !== group) {
            group = p.group;
            const label = document.createElement('div');
            label.className = 'nav-label';
            label.textContent = t('group_' + group);
            nav.appendChild(label);
        }
        const btn = document.createElement('button');
        btn.className = 'nav-item';
        btn.dataset.page = id;
        btn.style.setProperty('--i', i++);
        btn.innerHTML = `<i class="${p.icon}"></i><span>${esc(t('page_' + id))}</span>${id === 'reports' ? '<span class="badge zero" id="badge-reports">0</span>' : ''}`;
        btn.onclick = () => go(id);
        nav.appendChild(btn);
    }
    updateBadge();
}

function moveIndicator() {
    const btn = $(`.nav-item[data-page="${S.page}"]`);
    const ind = $('#nav-indicator');
    if (!btn) { ind.style.opacity = 0; return; }
    ind.style.opacity = 1;
    ind.style.transform = `translateY(${btn.offsetTop - 2}px)`;
    ind.style.top = '2px';
}

function go(page, force) {
    if (!force && page === S.page && $('#content .page')) return;
    S.page = page;
    clearInterval(S.timers.live);
    clearInterval(S.timers.vehicle);
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
    moveIndicator();

    const title = $('#page-title');
    title.classList.remove('swap');
    void title.offsetWidth;
    title.classList.add('swap');
    $('.ico i', title).className = PAGES[page].icon;
    $('.txt', title).textContent = t('page_' + page);
    $('p', title).textContent = t('page_' + page + '_desc');

    const content = $('#content');
    $$('.page', content).forEach((old) => {
        if (old.dataset.page === page) return old.remove();
        old.classList.add('leave');
        setTimeout(() => old.remove(), 300);
    });
    const el = document.createElement('div');
    el.className = 'page enter';
    el.dataset.page = page;
    content.appendChild(el);
    PAGES[page].render(el);
}

function rerender() {
    const el = $(`#content .page[data-page="${S.page}"]:not(.leave)`);
    if (!el) return;
    el.innerHTML = '';
    el.classList.remove('enter');
    PAGES[S.page].render(el);
}

function ringSvg(value, max, color) {
    const r = 26;
    const C = 2 * Math.PI * r;
    const off = C * (1 - clamp(max ? value / max : 0, 0, 1));
    return `<svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="${r}"/><circle class="fg" cx="32" cy="32" r="${r}" stroke="${color}" style="color:${color};stroke-dasharray:${C};stroke-dashoffset:${C}" data-offset="${off}"/></svg>`;
}

const TOGGLES = {
    noclip: { icon: 'fa-solid fa-feather', action: 'self:noclip', perm: 'noclip' },
    godmode: { icon: 'fa-solid fa-bolt', action: 'self:godmode' },
    invisible: { icon: 'fa-solid fa-ghost', action: 'self:invisible' },
    names: { icon: 'fa-solid fa-id-badge', action: 'self:names', perm: 'names', async: true },
    blips: { icon: 'fa-solid fa-map-location-dot', action: 'self:blips', perm: 'blips', async: true },
    vehGodmode: { icon: 'fa-solid fa-car-burst', action: 'self:vehGodmode' },
    infAmmo: { icon: 'fa-solid fa-infinity', action: 'self:infAmmo' },
};

function toggleCard(key) {
    const tg = TOGGLES[key];
    if (tg.perm && !S.perms[tg.perm]) return '';
    return `
        <div class="card hover quick-toggle ${S.state[key] ? 'on' : ''}" data-toggle="${key}">
            <div class="top"><div class="ico"><i class="${tg.icon}"></i></div><div class="switch"></div></div>
            <div><div class="t">${esc(t('tg_' + key))}</div><div class="d">${esc(t('tg_' + key + '_desc'))}</div></div>
        </div>`;
}

function bindToggles(root) {
    $$('[data-toggle]', root).forEach((el) => {
        el.onclick = async () => {
            const key = el.dataset.toggle;
            const tg = TOGGLES[key];
            const res = await act(tg.action);
            if (res === null) return;
            if (!tg.async && typeof res === 'boolean') {
                S.state[key] = res;
                syncToggles();
                res ? sfx.on() : sfx.off();
                if (res) confettiAt(el, 24);
            }
        };
    });
}

function syncToggles() {
    $$('[data-toggle]').forEach((el) => el.classList.toggle('on', !!S.state[el.dataset.toggle]));
    $$('[data-state]').forEach((el) => el.classList.toggle('on', !!S.state[el.dataset.state]));
}

function actionTile(id, icon, title, desc, cls = '') {
    return `
        <button class="card hover action-tile ${cls}" data-tile="${id}">
            <div class="ico"><i class="${icon}"></i></div>
            <div><div class="t">${esc(title)}</div><div class="d">${esc(desc)}</div></div>
            <i class="fa-solid fa-chevron-right arrow"></i>
        </button>`;
}

function catInfo(id) {
    if (id === 'dm') return { id: 'dm', label: t('cat_dm'), icon: 'fa-solid fa-envelope', color: '#f472b6' };
    return S.config.categories?.find((c) => c.id === id) || { id, label: id, icon: 'fa-solid fa-circle-question', color: '#94a3b8' };
}

function renderDashboard(el) {
    const srv = S.panel.server;
    const stats = S.reports.length ? reportStats() : { open: 0, claimed: 0, closed: 0, total: 0, ...(srv.reports || {}) };
    const hourNow = new Date().getHours();
    const greet = hourNow < 12 ? t('good_morning') : hourNow < 18 ? t('good_afternoon') : t('good_evening');
    const sparkles = Array.from({ length: 8 }, () => `<span class="sparkle" style="left:${Math.random() * 95}%;top:${Math.random() * 90}%;animation-delay:${Math.random() * 3}s"></span>`).join('');

    el.innerHTML = `
        <div class="hero">
            ${sparkles}
            <i class="fa-solid fa-shield-halved wave"></i>
            <h2>${esc(greet)}, <span>${esc(S.me.name)}</span> 👋</h2>
            <p>${esc(t('hero_text', stripColors(srv.name)))}</p>
            <div class="row" style="margin-top:18px">
                ${S.perms.reports ? `<button class="btn primary" data-go="reports"><i class="fa-solid fa-headset"></i>${esc(t('open_reports'))} · ${stats.open}</button>` : ''}
                <button class="btn ghost" data-go="players"><i class="fa-solid fa-users"></i>${esc(t('page_players'))}</button>
            </div>
        </div>

        <div class="grid g4 mt stagger">
            <div class="card hover stat">
                <div class="ring">${ringSvg(srv.players, srv.maxPlayers, 'var(--g1)')}<i class="fa-solid fa-users" style="color:var(--g1)"></i></div>
                <div><div class="value"><span data-count="${srv.players}">0</span><span style="font-size:15px;color:var(--text-3)">/${srv.maxPlayers}</span></div><div class="label">${esc(t('stat_players'))}</div></div>
            </div>
            <div class="card hover stat">
                <div class="ring">${ringSvg(stats.open, Math.max(stats.total, 1), '#fbbf24')}<i class="fa-solid fa-inbox" style="color:#fbbf24"></i></div>
                <div><div class="value" data-count="${stats.open}">0</div><div class="label">${esc(t('stat_open'))}</div></div>
            </div>
            <div class="card hover stat">
                <div class="ring">${ringSvg(stats.claimed, Math.max(stats.total, 1), '#60a5fa')}<i class="fa-solid fa-user-check" style="color:#60a5fa"></i></div>
                <div><div class="value" data-count="${stats.claimed}">0</div><div class="label">${esc(t('stat_claimed'))}</div></div>
            </div>
            <div class="card hover stat">
                <div class="ring">${ringSvg(1, 1, 'var(--g3)')}<i class="fa-solid fa-heart-pulse" style="color:var(--g3)"></i></div>
                <div><div class="value">${uptime(srv.uptime)}</div><div class="label">${esc(t('stat_uptime'))}</div></div>
            </div>
        </div>

        <div class="section-title"><i class="fa-solid fa-wand-magic-sparkles"></i>${esc(t('quick_toggles'))}</div>
        <div class="grid auto stagger">${['noclip', 'godmode', 'invisible', 'names', 'blips'].map(toggleCard).join('')}</div>

        <div class="grid g2 mt">
            <div class="card">
                <div class="section-title" style="margin-top:0"><i class="fa-solid fa-inbox"></i>${esc(t('recent_reports'))}</div>
                <div class="col" id="dash-reports">${recentReportsHtml()}</div>
            </div>
            <div class="card">
                <div class="section-title" style="margin-top:0"><i class="fa-solid fa-rocket"></i>${esc(t('quick_actions'))}</div>
                <div class="col stagger">
                    ${actionTile('revive', 'fa-solid fa-heart-circle-plus', t('act_revive'), t('act_revive_desc'), 'ok')}
                    ${actionTile('fix', 'fa-solid fa-screwdriver-wrench', t('veh_fix'), t('veh_fix_desc'), 'info')}
                    ${actionTile('spawn', 'fa-solid fa-car-on', t('veh_spawn'), t('veh_spawn_desc'), 'warn')}
                    ${actionTile('vec4', 'fa-solid fa-location-crosshairs', t('copy_vec4'), t('copy_desc'))}
                </div>
            </div>
        </div>`;

    stagger(el);
    countUp(el);
    fillRings(el);
    bindToggles(el);
    $$('[data-go]', el).forEach((b) => (b.onclick = () => go(b.dataset.go)));
    bindDashReports(el);
    $$('[data-tile]', el).forEach((b) => {
        b.onclick = async () => {
            const id = b.dataset.tile;
            if (id === 'revive') { if (await act('self:revive')) toast('success', t('act_revive'), t('done')); }
            if (id === 'fix') { if (await act('vehicles:fix')) confettiAt(b, 30); }
            if (id === 'spawn') go('vehicles');
            if (id === 'vec4') { const s = await act('dev:copy', { type: 'coords4' }); if (typeof s === 'string') { copyText(s); toast('success', t('copied'), s); } }
        };
    });
}

function recentReportsHtml() {
    const list = S.reports.filter((r) => r.status !== 'closed').slice(0, 4);
    if (!S.perms.reports) return `<div class="empty"><i class="fa-solid fa-lock"></i>${esc(t('no_perm'))}</div>`;
    if (!list.length) return `<div class="empty"><i class="fa-solid fa-mug-hot"></i>${esc(t('no_reports'))}</div>`;
    return list.map((r) => {
        const last = r.messages[r.messages.length - 1];
        return `<div class="list-row" data-report="${r.id}">
            ${avatar(r.senderChar || r.senderName, '', r.senderOnline)}
            <div style="flex:1;min-width:0">
                <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${r.id} · ${esc(r.subject)}</div>
                <div style="color:var(--text-3);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.senderChar)} · ${esc(last ? ago(last.time) : '')}</div>
            </div>
            <span class="pill ${r.status}"><span class="dot"></span>${esc(t('st_' + r.status))}</span>
        </div>`;
    }).join('');
}

function bindDashReports(root) {
    $$('[data-report]', root).forEach((row) => (row.onclick = () => { S.activeReport = Number(row.dataset.report); go('reports'); }));
}

const WEAPON_TYPES = [
    { id: 'pistol', icon: 'fa-solid fa-gun' },
    { id: 'smg', icon: 'fa-solid fa-person-rifle' },
    { id: 'shotgun', icon: 'fa-solid fa-burst' },
    { id: 'assault', icon: 'fa-solid fa-crosshairs' },
    { id: 'lmg', icon: 'fa-solid fa-fire' },
    { id: 'sniper', icon: 'fa-solid fa-bullseye' },
    { id: 'heavy', icon: 'fa-solid fa-bomb' },
];

function renderSelf(el) {
    el.innerHTML = `
        <div class="section-title" style="margin-top:4px"><i class="fa-solid fa-toggle-on"></i>${esc(t('toggles'))}</div>
        <div class="grid auto stagger">${Object.keys(TOGGLES).map(toggleCard).join('')}</div>

        <div class="section-title"><i class="fa-solid fa-hand-sparkles"></i>${esc(t('actions'))}</div>
        <div class="grid g3 stagger">
            ${actionTile('revive', 'fa-solid fa-heart-circle-plus', t('act_revive'), t('act_revive_desc'), 'ok')}
            ${actionTile('cuff', 'fa-solid fa-handcuffs', t('act_cuff'), t('act_cuff_desc'), 'warn')}
            ${S.perms.setModel ? actionTile('reset', 'fa-solid fa-person-rays', t('act_reset_ped'), t('act_reset_ped_desc'), 'info') : ''}
        </div>

        <div class="grid g2 mt">
            ${S.perms.setModel ? `
            <div class="card">
                <div class="section-title" style="margin-top:0"><i class="fa-solid fa-person-half-dress"></i>${esc(t('ped_model'))}</div>
                <div class="row">
                    <input class="input mono" id="ped-input" placeholder="a_m_m_soucent_04">
                    <button class="btn primary" id="ped-apply"><i class="fa-solid fa-wand-magic-sparkles"></i>${esc(t('apply'))}</button>
                </div>
                <div class="chips mt">
                    ${['a_m_y_hipster_01', 'a_f_y_beach_01', 's_m_y_cop_01', 'u_m_y_zombie_01', 'a_c_chimp', 'a_c_shepherd'].map((m) => `<button class="chip" data-ped="${m}">${m}</button>`).join('')}
                </div>
            </div>` : ''}
            ${S.perms.giveAllWeapons ? `
            <div class="card">
                <div class="section-title" style="margin-top:0"><i class="fa-solid fa-gun"></i>${esc(t('give_weapons'))}</div>
                <div class="chips stagger">${WEAPON_TYPES.map((w) => `<button class="chip" data-weapon="${w.id}"><i class="${w.icon}"></i>${esc(t('wp_' + w.id))}</button>`).join('')}</div>
            </div>` : ''}
        </div>`;

    stagger(el);
    bindToggles(el);
    $$('[data-tile]', el).forEach((b) => {
        b.onclick = async () => {
            const map = { revive: 'self:revive', cuff: 'self:cuff', reset: 'self:resetModel' };
            if (await act(map[b.dataset.tile])) { toast('success', t('done')); confettiAt(b, 20); }
        };
    });
    const applyPed = async (model) => {
        if (!model) return;
        if (await act('self:setModel', { model })) toast('success', t('ped_model'), model, 'fa-solid fa-person-rays');
    };
    if ($('#ped-apply', el)) {
        $('#ped-apply', el).onclick = () => applyPed($('#ped-input', el).value.trim());
        $('#ped-input', el).onkeydown = (e) => e.key === 'Enter' && applyPed(e.target.value.trim());
        $$('[data-ped]', el).forEach((c) => (c.onclick = () => { $('#ped-input', el).value = c.dataset.ped; applyPed(c.dataset.ped); }));
    }
    $$('[data-weapon]', el).forEach((c) => {
        c.onclick = async () => {
            if (await act('self:giveWeapons', { type: c.dataset.weapon })) {
                c.classList.add('active');
                setTimeout(() => c.classList.remove('active'), 900);
                confettiAt(c, 30);
                toast('success', t('give_weapons'), t('wp_' + c.dataset.weapon), 'fa-solid fa-gun');
            }
        };
    });
}

async function renderPlayers(el) {
    el.classList.add('fill');
    el.innerHTML = `
        <div class="split">
            <div class="pane">
                ${S.perms.offlinePlayers ? `
                <div class="mode-switch" id="p-mode">
                    <div class="ms-ind"></div>
                    <button data-mode="online" class="${S.playerMode !== 'offline' ? 'active' : ''}"><i class="fa-solid fa-signal"></i>${esc(t('mode_online'))}</button>
                    <button data-mode="offline" class="${S.playerMode === 'offline' ? 'active' : ''}"><i class="fa-solid fa-user-clock"></i>${esc(t('mode_offline'))}</button>
                </div>` : ''}
                <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="p-search" placeholder="${esc(t(S.playerMode === 'offline' ? 'search_offline' : 'search_players'))}" value="${esc(S.playerMode === 'offline' ? S.offlineSearch : S.playerSearch)}"></div>
                <div class="plist" id="plist"><div class="loader"><span></span><span></span><span></span></div></div>
            </div>
            <div class="pane"><div class="detail" id="pdetail"></div></div>
        </div>`;

    if ($('#p-mode', el)) {
        const sw = $('#p-mode', el);
        requestAnimationFrame(() => moveModeIndicator(sw));
        $$('[data-mode]', sw).forEach((b) => (b.onclick = () => {
            if (S.playerMode === b.dataset.mode) return;
            S.playerMode = b.dataset.mode;
            rerender();
        }));
    }

    if (S.playerMode === 'offline' && S.perms.offlinePlayers) {
        let timer;
        $('#p-search', el).oninput = (e) => {
            S.offlineSearch = e.target.value;
            clearTimeout(timer);
            timer = setTimeout(loadOffline, 350);
        };
        renderOfflineDetail();
        loadOffline();
        return;
    }

    S.playerMode = 'online';
    $('#p-search', el).oninput = (e) => { S.playerSearch = e.target.value; renderPlayerList(); };
    renderPlayerDetail();
    S.players = (await act('players:list')) || [];
    if (!Array.isArray(S.players)) S.players = [];
    renderPlayerList();
    if (S.selected) selectPlayer(S.selected.id, true);
}

S.playerMode = 'online';
S.offlineSearch = '';
S.offline = [];
S.offlineSel = null;

function moveModeIndicator(sw) {
    const a = $('button.active', sw);
    const ind = $('.ms-ind', sw);
    if (!a || !ind) return;
    ind.style.left = a.offsetLeft + 'px';
    ind.style.width = a.offsetWidth + 'px';
}

async function loadOffline() {
    const list = $('#plist');
    if (!list) return;
    list.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';
    const res = await act('offline:list', { search: S.offlineSearch });
    if (S.page !== 'players' || S.playerMode !== 'offline') return;
    S.offline = Array.isArray(res) ? res : [];
    renderOfflineList();
}

function renderOfflineList() {
    const list = $('#plist');
    if (!list) return;
    if (!S.offline.length) { list.innerHTML = `<div class="empty"><i class="fa-solid fa-user-slash"></i>${esc(t('no_offline'))}</div>`; return; }
    list.innerHTML = S.offline.map((p, i) => `
        <div class="player-row offline ${S.offlineSel?.citizenid === p.citizenid ? 'active' : ''}" data-cid="${esc(p.citizenid)}" style="--i:${Math.min(i, 20)}">
            ${avatar(p.name, '', false)}
            <div class="info"><div class="n">${esc(p.name)}</div><div class="s">${esc(p.playerName || '')} · ${esc(p.citizenid)}</div></div>
            <div class="last-seen"><i class="fa-regular fa-clock"></i>${p.lastSeen ? esc(ago(p.lastSeen)) : '-'}</div>
        </div>`).join('');
    $$('[data-cid]', list).forEach((row) => (row.onclick = () => selectOffline(row.dataset.cid)));
}

async function selectOffline(citizenid) {
    const data = await act('offline:get', { citizenid });
    if (!data || typeof data !== 'object') { S.offlineSel = null; loadOffline(); renderOfflineDetail(); return; }
    S.offlineSel = data;
    $$('.player-row').forEach((r) => r.classList.toggle('active', r.dataset.cid === citizenid));
    renderOfflineDetail();
}

function renderOfflineDetail() {
    const box = $('#pdetail');
    if (!box) return;
    const p = S.offlineSel;
    if (!p) {
        box.innerHTML = `<div class="empty" style="height:100%"><i class="fa-solid fa-user-clock"></i><div style="font-size:16px;font-weight:700;color:var(--text-2)">${esc(t('select_offline'))}</div>${esc(t('select_offline_desc'))}</div>`;
        return;
    }
    const P = S.perms;
    const canMoney = !!P.changePlayerData;
    const kv = (icon, label, value, edit, mono) => `
        <div class="card ${edit ? 'hover click' : ''}" ${edit ? `data-omoney="${edit}"` : ''}>
            <div class="k"><i class="${icon}"></i>${esc(label)}</div>
            <div class="v ${mono ? 'mono' : ''}">${esc(value)}</div>
            ${edit ? '<i class="fa-solid fa-pen edit"></i>' : ''}
        </div>`;
    const ops = [
        P.ban && ['ban', 'fa-solid fa-gavel', t('op_ban'), 'danger'],
        P.characterKill && ['ck', 'fa-solid fa-skull-crossbones', t('op_ck'), 'danger'],
        ['copycid', 'fa-solid fa-fingerprint', t('copy_cid'), 'info'],
        ['copylic', 'fa-solid fa-id-card', t('copy_license'), 'info'],
    ].filter(Boolean);

    box.innerHTML = `
        <div class="card" style="background:linear-gradient(120deg, rgba(148,163,184,.14), rgba(var(--g1-rgb),.06))">
            <div class="detail-head">
                ${avatar(p.name, 'lg', false)}
                <div style="flex:1;min-width:0">
                    <h2>${esc(p.name)}</h2>
                    <div class="sub">
                        <span class="pill"><span class="dot" style="background:var(--text-3)"></span>${esc(t('offline'))}</span>
                        <span class="pill"><i class="fa-solid fa-user"></i>${esc(p.playerName || '-')}</span>
                        <span class="pill"><i class="fa-solid fa-fingerprint"></i>${esc(p.citizenid)}</span>
                        ${p.lastSeen ? `<span class="pill"><i class="fa-regular fa-clock"></i>${esc(t('last_seen', ago(p.lastSeen)))}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>

        <div class="offline-note mt"><i class="fa-solid fa-circle-info"></i>${esc(t('offline_note'))}</div>

        <div class="kv mt stagger">
            ${kv('fa-solid fa-money-bill-wave', t('cash'), money(p.cash), canMoney && 'cash')}
            ${kv('fa-solid fa-building-columns', t('bank'), money(p.bank), canMoney && 'bank')}
            ${kv('fa-solid fa-briefcase', t('job'), p.job)}
            ${kv('fa-solid fa-people-group', t('gang'), p.gang)}
        </div>

        <div class="section-title"><i class="fa-solid fa-bolt"></i>${esc(t('offline_actions'))}</div>
        <div class="btn-grid">${ops.map(([id, icon, label, cls], i) => `<button class="op ${cls}" data-oop="${id}" style="--i:${i}"><i class="${icon}"></i>${esc(label)}</button>`).join('')}</div>

        <div class="section-title"><i class="fa-solid fa-fingerprint"></i>${esc(t('identifiers'))}</div>
        <div class="ids stagger">
            ${[['Citizen', p.citizenid], ['License', p.license], [t('phone'), p.phone || '-']].map(([k, v]) => `
                <div class="id-row"><span class="lbl">${esc(k)}</span><span class="val">${esc(v)}</span><button class="btn ghost sm" data-copy="${esc(String(v).replace(/^license2?:/, ''))}"><i class="fa-regular fa-copy"></i></button></div>`).join('')}
        </div>`;

    stagger(box);
    $$('[data-copy]', box).forEach((b) => (b.onclick = () => { copyText(b.dataset.copy); toast('success', t('copied'), b.dataset.copy); }));
    $$('[data-omoney]', box).forEach((c) => (c.onclick = () => offlineMoney(c.dataset.omoney)));
    $$('[data-oop]', box).forEach((b) => (b.onclick = () => offlineOp(b.dataset.oop, b)));
}

async function offlineMoney(type) {
    const p = S.offlineSel;
    const r = await modal({ title: t('edit_x', t(type)), text: p.name, icon: 'fa-solid fa-pen-to-square', confirm: t('save'), fields: [{ key: 'a', label: t(type), type: 'number', min: 0, value: p[type], required: true }] });
    if (!r || !(await act('offline:money', { citizenid: p.citizenid, type, amount: r.a }))) return;
    toast('success', t('saved'), `${p.name} · ${t(type)} ${money(r.a)}`);
    selectOffline(p.citizenid);
}

async function offlineOp(op, btn) {
    const p = S.offlineSel;
    if (!p) return;
    if (op === 'copycid' || op === 'copylic') {
        const v = op === 'copycid' ? p.citizenid : String(p.license).replace(/^license2?:/, '');
        copyText(v);
        toast('success', t('copied'), v);
        return;
    }
    if (op === 'ck') {
        if (await characterKill(p.citizenid)) { S.offlineSel = null; renderOfflineDetail(); loadOffline(); }
        return;
    }
    if (op === 'ban') {
        const r = await modal({
            title: t('op_ban'), text: t('offline_ban_desc', p.name), icon: 'fa-solid fa-gavel', danger: true,
            fields: [
                { key: 'reason', label: t('reason'), placeholder: 'VDM', required: true },
                { key: 'kind', label: t('ban_type'), type: 'select', value: 'temp', options: [{ value: 'temp', label: t('ban_temporary') }, { value: 'perm', label: t('ban_permanent') }] },
                { key: 'h', label: t('hours'), type: 'number', min: 0, placeholder: '0' },
                { key: 'd', label: t('days'), type: 'number', min: 0, placeholder: '0' },
                { key: 'm', label: t('months'), type: 'number', min: 0, placeholder: '0' },
            ],
        });
        if (!r) return;
        const permanent = r.kind === 'perm';
        if (!permanent && !r.h && !r.d && !r.m) { toast('error', t('error'), t('err_ban_time')); return; }
        if (await act('offline:ban', { citizenid: p.citizenid, reason: r.reason, permanent, hours: r.h || 0, days: r.d || 0, months: r.m || 0 })) {
            confettiAt(btn, 40);
            toast('success', t('op_ban'), p.name, 'fa-solid fa-gavel');
        }
    }
}

function pingClass(p) { return p < 80 ? 'good' : p < 160 ? 'mid' : 'bad'; }

function renderPlayerList() {
    const list = $('#plist');
    if (!list) return;
    const q = S.playerSearch.toLowerCase();
    const items = S.players.filter((p) => !q || `${p.id} ${p.name} ${p.cid}`.toLowerCase().includes(q));
    if (!items.length) { list.innerHTML = `<div class="empty"><i class="fa-solid fa-user-slash"></i>${esc(t('no_players'))}</div>`; return; }
    list.innerHTML = items.map((p, i) => `
        <div class="player-row ${S.selected?.id === p.id ? 'active' : ''}" data-pid="${p.id}" style="--i:${Math.min(i, 20)}">
            ${avatar(p.charName || p.name)}
            <div class="info"><div class="n">${esc(p.charName || p.name)}</div><div class="s">${esc(p.playerName || '')} · ${esc(p.cid)}</div></div>
            <div style="text-align:right">
                <div class="idtag">#${p.id}</div>
                <div class="ping ${pingClass(p.ping)}" style="justify-content:flex-end;margin-top:5px"><i class="fa-solid fa-signal"></i>${p.ping ?? '?'}</div>
            </div>
        </div>`).join('');
    $$('[data-pid]', list).forEach((row) => (row.onclick = () => selectPlayer(Number(row.dataset.pid))));
}

async function selectPlayer(id, silent) {
    const data = await act('players:get', { id });
    if (!data || typeof data !== 'object') {
        if (!silent) toast('error', t('error'), t('err_player_gone'));
        S.selected = null;
        renderPlayerDetail();
        return;
    }
    S.selected = data;
    $$('.player-row').forEach((r) => r.classList.toggle('active', Number(r.dataset.pid) === id));
    renderPlayerDetail();
}

const refreshSelected = () => setTimeout(() => S.selected && S.page === 'players' && selectPlayer(S.selected.id, true), 500);

function renderPlayerDetail() {
    const box = $('#pdetail');
    if (!box) return;
    const p = S.selected;
    if (!p) {
        box.innerHTML = `<div class="empty" style="height:100%"><i class="fa-solid fa-hand-pointer"></i><div style="font-size:16px;font-weight:700;color:var(--text-2)">${esc(t('select_player'))}</div>${esc(t('select_player_desc'))}</div>`;
        return;
    }
    const health = clamp(((p.health ?? 200) - 100), 0, 100);
    const canEdit = !!S.perms.changePlayerData;
    const bar = (key, icon, label, val, color, edit) => `
        <div class="card bar-card ${edit && canEdit ? 'hover' : ''}" ${edit && canEdit ? `data-edit="${edit}"` : ''} style="--c:${color};cursor:${edit && canEdit ? 'pointer' : 'default'}">
            <div class="top"><span>${esc(label)}</span><i class="${icon}"></i></div>
            <div class="num">${Math.round(val ?? 0)}<span style="font-size:13px;color:var(--text-3)">%</span></div>
            <div class="bar"><div data-width="${clamp(val ?? 0, 0, 100)}%"></div></div>
        </div>`;
    const kv = (icon, label, value, edit, mono) => `
        <div class="card ${edit && canEdit ? 'hover click' : ''}" ${edit && canEdit ? `data-edit="${edit}"` : ''}>
            <div class="k"><i class="${icon}"></i>${esc(label)}</div>
            <div class="v ${mono ? 'mono' : ''}">${esc(value)}</div>
            ${edit && canEdit ? '<i class="fa-solid fa-pen edit"></i>' : ''}
        </div>`;

    box.innerHTML = `
        <div class="card" style="background:linear-gradient(120deg, rgba(var(--g1-rgb),.18), rgba(var(--g2-rgb),.08))">
            <div class="detail-head">
                ${avatar(p.charName || p.name, 'lg', true)}
                <div style="flex:1;min-width:0">
                    <h2 class="row" style="gap:10px">${esc(p.charName || p.name)} ${canEdit ? `<button class="icon-btn" data-edit="name" style="width:30px;height:30px"><i class="fa-solid fa-pen" style="font-size:11px"></i></button>` : ''}</h2>
                    <div class="sub">
                        <span class="idtag">#${p.id}</span>
                        <span class="pill"><i class="fa-solid fa-user"></i>${esc(p.playerName)}</span>
                        <span class="pill"><i class="fa-solid fa-fingerprint"></i>${esc(p.cid)}</span>
                        <span class="pill"><i class="fa-solid fa-cube"></i>${esc(t('bucket'))} ${p.bucket ?? 0}</span>
                        ${p.frozen ? `<span class="pill claimed"><i class="fa-solid fa-snowflake"></i>${esc(t('frozen'))}</span>` : ''}
                        <span class="ping ${pingClass(p.ping)}"><i class="fa-solid fa-signal"></i>${p.ping}ms</span>
                    </div>
                </div>
                ${S.perms.startDm ? `<button class="btn primary" id="p-dm"><i class="fa-solid fa-paper-plane"></i>${esc(t('send_dm'))}</button>` : ''}
            </div>
        </div>

        <div class="bars mt stagger">
            ${bar('health', 'fa-solid fa-heart', t('health'), health, '#f43f5e')}
            ${bar('armor', 'fa-solid fa-shield', t('armor'), p.armor, '#60a5fa', 'armor')}
            ${bar('food', 'fa-solid fa-burger', t('food'), p.food, '#fbbf24', 'food')}
            ${bar('water', 'fa-solid fa-droplet', t('water'), p.water, '#22d3ee', 'thirst')}
            ${bar('stress', 'fa-solid fa-brain', t('stress'), p.stress, '#c084fc', 'stress')}
        </div>

        <div class="kv mt stagger">
            ${kv('fa-solid fa-money-bill-wave', t('cash'), money(p.cash), 'cash')}
            ${kv('fa-solid fa-building-columns', t('bank'), money(p.bank), 'bank')}
            ${kv('fa-solid fa-briefcase', t('job'), p.job, 'job')}
            ${kv('fa-solid fa-people-group', t('gang'), p.gang, 'gang')}
            ${kv('fa-solid fa-phone', t('phone'), p.phone || '-', 'phone', true)}
            ${kv('fa-solid fa-walkie-talkie', t('radio'), p.radio || 0, 'radio')}
            ${kv('fa-solid fa-hammer', t('crafting_rep'), p.craftingrep ?? 0, 'crafting')}
            ${kv('fa-solid fa-cannabis', t('dealer_rep'), p.dealerrep ?? 0, 'dealer')}
        </div>

        <div class="section-title"><i class="fa-solid fa-bolt"></i>${esc(t('actions'))}</div>
        <div class="tabs" id="ptabs">
            <div class="tab-ind"></div>
            <button class="tab" data-tab="general"><i class="fa-solid fa-wrench"></i>${esc(t('tab_general'))}</button>
            <button class="tab" data-tab="admin"><i class="fa-solid fa-gavel"></i>${esc(t('tab_admin'))}</button>
            <button class="tab" data-tab="extra"><i class="fa-solid fa-gamepad"></i>${esc(t('tab_extra'))}</button>
        </div>
        <div class="btn-grid mt" id="pops"></div>

        <div class="section-title"><i class="fa-solid fa-fingerprint"></i>${esc(t('identifiers'))}</div>
        <div class="ids stagger">
            ${[['Citizen', p.cid], ['License', p.license], ['Discord', p.discord], ['Steam', p.steam]].map(([k, v]) => `
                <div class="id-row"><span class="lbl">${k}</span><span class="val">${esc(v)}</span><button class="btn ghost sm" data-copy="${esc(String(v).replace(/^(license|discord|steam):/, ''))}"><i class="fa-regular fa-copy"></i></button></div>`).join('')}
        </div>`;

    stagger(box);
    fillRings(box);
    $$('[data-copy]', box).forEach((b) => (b.onclick = () => { copyText(b.dataset.copy); toast('success', t('copied'), b.dataset.copy); }));
    $$('[data-edit]', box).forEach((b) => (b.onclick = () => editPlayerField(b.dataset.edit)));
    $$('.tab', box).forEach((b) => (b.onclick = () => { S.playerTab = b.dataset.tab; renderPlayerOps(); }));
    if ($('#p-dm', box)) $('#p-dm', box).onclick = startDm;
    renderPlayerOps();
}

function moveTabIndicator(tabs) {
    const active = $('.tab.active', tabs);
    const ind = $('.tab-ind', tabs);
    if (!active || !ind) return;
    ind.style.left = active.offsetLeft + 'px';
    ind.style.width = active.offsetWidth + 'px';
}

function renderPlayerOps() {
    const tabs = $('#ptabs');
    const box = $('#pops');
    if (!tabs || !box) return;
    $$('.tab', tabs).forEach((b) => b.classList.toggle('active', b.dataset.tab === S.playerTab));
    requestAnimationFrame(() => moveTabIndicator(tabs));

    const P = S.perms;
    const ops = {
        general: [
            P.general && ['kill', 'fa-solid fa-skull', t('op_kill'), 'danger'],
            P.general && ['revive', 'fa-solid fa-heart-circle-plus', t('op_revive'), 'ok'],
            P.general && ['freeze', 'fa-solid fa-snowflake', S.selected?.frozen ? t('op_unfreeze') : t('op_freeze'), 'info'],
            P.general && ['goto', 'fa-solid fa-person-walking-arrow-right', t('op_goto')],
            P.general && ['bring', 'fa-solid fa-person-walking-arrow-loop-left', t('op_bring')],
            P.general && ['sitveh', 'fa-solid fa-chair', t('op_sitveh')],
            P.general && ['bucket', 'fa-solid fa-cube', t('op_bucket'), 'warn'],
            ['spectate', 'fa-solid fa-eye', t('op_spectate'), 'info'],
        ],
        admin: [
            P.kick && ['kick', 'fa-solid fa-door-open', t('op_kick'), 'warn'],
            P.ban && ['ban', 'fa-solid fa-gavel', t('op_ban'), 'danger'],
            P.changePerms && ['perm', 'fa-solid fa-user-shield', t('op_perm'), 'info'],
            P.characterKill && ['ck', 'fa-solid fa-skull-crossbones', t('op_ck'), 'danger'],
        ],
        extra: [
            ['inventory', 'fa-solid fa-box-open', t('op_inventory')],
            P.clothing && ['clothing', 'fa-solid fa-shirt', t('op_clothing'), 'info'],
            P.givePed && ['giveped', 'fa-solid fa-person-rays', t('op_giveped'), 'warn'],
            ['giveitem', 'fa-solid fa-gift', t('op_giveitem'), 'ok'],
            ['mute', 'fa-solid fa-microphone-slash', t('op_mute'), 'warn'],
        ],
    }[S.playerTab].filter(Boolean);

    box.innerHTML = ops.length
        ? ops.map(([id, icon, label, cls], i) => `<button class="op ${cls || ''}" data-op="${id}" style="--i:${i}"><i class="${icon}"></i>${esc(label)}</button>`).join('')
        : `<div class="empty" style="grid-column:1/-1"><i class="fa-solid fa-lock"></i>${esc(t('no_perm'))}</div>`;
    $$('[data-op]', box).forEach((b) => (b.onclick = () => playerOp(b.dataset.op, b)));
}

async function playerOp(op, btn) {
    const p = S.selected;
    if (!p) return;
    const id = p.id;
    const general = { kill: 1, revive: 2, freeze: 3, goto: 4, bring: 5, sitveh: 6 };
    const name = p.charName || p.name;

    if (general[op]) {
        if (op === 'kill' && !(await confirmBox(t('op_kill'), t('confirm_kill', name), 'fa-solid fa-skull'))) return;
        if (await act('players:general', { id, option: general[op] })) {
            toast('success', t('op_' + op), name);
            if (op === 'revive') confettiAt(btn, 30);
            refreshSelected();
        }
        return;
    }

    switch (op) {
        case 'bucket': {
            const r = await modal({ title: t('op_bucket'), icon: 'fa-solid fa-cube', fields: [{ key: 'b', label: t('bucket'), type: 'number', value: p.bucket ?? 0, min: 0, required: true }] });
            if (r && (await act('players:general', { id, option: 7, input: r.b }))) { toast('success', t('op_bucket'), `${name} → ${r.b}`); refreshSelected(); }
            break;
        }
        case 'spectate':
            act('players:spectate', { id });
            break;
        case 'kick': {
            const r = await modal({ title: t('op_kick'), text: name, icon: 'fa-solid fa-door-open', danger: true, fields: [{ key: 'reason', label: t('reason'), placeholder: 'RDM', required: true }] });
            if (r && (await act('players:administration', { id, option: 1, input: r.reason }))) { toast('success', t('op_kick'), name); S.selected = null; setTimeout(() => go('players', true), 600); }
            break;
        }
        case 'ban': {
            const r = await modal({
                title: t('op_ban'), text: name, icon: 'fa-solid fa-gavel', danger: true,
                fields: [
                    { key: 'reason', label: t('reason'), placeholder: 'VDM', required: true },
                    { key: 'kind', label: t('ban_type'), type: 'select', value: 'temp', options: [{ value: 'temp', label: t('ban_temporary') }, { value: 'perm', label: t('ban_permanent') }] },
                    { key: 'h', label: t('hours'), type: 'number', min: 0, placeholder: '0' },
                    { key: 'd', label: t('days'), type: 'number', min: 0, placeholder: '0' },
                    { key: 'm', label: t('months'), type: 'number', min: 0, placeholder: '0' },
                ],
            });
            if (!r) break;
            const perm = r.kind === 'perm';
            if (!perm && !r.h && !r.d && !r.m) { toast('error', t('error'), t('err_ban_time')); break; }
            if (await act('players:administration', { id, option: 2, input: [r.reason, r.h || 0, r.d || 0, r.m || 0, perm] })) {
                toast('success', t('op_ban'), name, 'fa-solid fa-gavel');
                S.selected = null;
                setTimeout(() => go('players', true), 600);
            }
            break;
        }
        case 'perm': {
            const r = await modal({
                title: t('op_perm'), text: name, icon: 'fa-solid fa-user-shield',
                fields: [{ key: 'perm', label: t('permission'), type: 'select', value: 'mod', options: [
                    { value: 'remove', label: t('perm_remove') }, { value: 'mod', label: 'Mod' }, { value: 'admin', label: 'Admin' }, { value: 'god', label: 'God' },
                ] }],
            });
            if (r && (await act('players:administration', { id, option: 3, input: r.perm }))) toast('success', t('op_perm'), `${name} → ${r.perm}`);
            break;
        }
        case 'giveped': {
            const r = await pedPicker(name);
            if (r && (await act('peds:give', { id, model: r.model, persistent: r.persistent }))) {
                confettiAt(btn, 50);
                toast('success', t('op_giveped'), `${name} → ${r.model}${r.persistent ? ' · ' + t('ped_persistent_short') : ''}`, 'fa-solid fa-person-rays');
            }
            break;
        }
        case 'ck':
            if (await characterKill(id)) { S.selected = null; setTimeout(() => go('players', true), 1500); }
            break;
        case 'inventory':
            act('players:inventory', { id });
            break;
        case 'clothing':
            if (await act('players:clothing', { id })) toast('success', t('op_clothing'), name);
            break;
        case 'giveitem': {
            const r = await modal({
                title: t('op_giveitem'), text: name, icon: 'fa-solid fa-gift',
                fields: [
                    { key: 'item', label: t('item'), placeholder: 'phone', required: true },
                    { key: 'amount', label: t('amount'), type: 'number', value: 1, min: 1, required: true },
                ],
            });
            if (r && (await act('players:giveItem', { id, item: r.item, amount: r.amount }))) { toast('success', t('op_giveitem'), `${r.amount}x ${r.item}`); confettiAt(btn, 30); }
            break;
        }
        case 'mute':
            if (await act('players:mute', { id })) toast('success', t('op_mute'), name);
            break;
    }
}

async function editPlayerField(field) {
    const p = S.selected;
    if (!p) return;
    const num = (key, label, value, min, max) => ({ key, label, type: 'number', value, min, max, required: true });
    const defs = {
        name: [{ key: 'a', label: t('firstname'), value: (p.charName || '').split(' ')[0] }, { key: 'b', label: t('lastname'), value: (p.charName || '').split(' ').slice(1).join(' ') }],
        food: [num('a', t('food') + ' %', Math.round(p.food ?? 0), 0, 100)],
        thirst: [num('a', t('water') + ' %', Math.round(p.water ?? 0), 0, 100)],
        stress: [num('a', t('stress') + ' %', Math.round(p.stress ?? 0), 0, 100)],
        armor: [num('a', t('armor') + ' %', Math.round(p.armor ?? 0), 0, 100)],
        cash: [num('a', t('cash'), p.cash ?? 0, 0)],
        bank: [num('a', t('bank'), p.bank ?? 0, 0)],
        phone: [{ key: 'a', label: t('phone'), value: p.phone ?? '', required: true }],
        crafting: [num('a', t('crafting_rep'), p.craftingrep ?? 0, 0)],
        dealer: [num('a', t('dealer_rep'), p.dealerrep ?? 0, 0)],
        radio: [num('a', t('radio'), p.radio ?? 0, 0, 1000)],
        job: [{ key: 'a', label: t('name'), value: p.jobName ?? '', placeholder: 'police', required: true }, num('b', t('grade'), 0, 0)],
        gang: [{ key: 'a', label: t('name'), placeholder: 'ballas', required: true }, num('b', t('grade'), 0, 0)],
    };
    const label = { name: t('name'), food: t('food'), thirst: t('water'), stress: t('stress'), armor: t('armor'), cash: t('cash'), bank: t('bank'), phone: t('phone'), crafting: t('crafting_rep'), dealer: t('dealer_rep'), radio: t('radio'), job: t('job'), gang: t('gang') }[field];
    const r = await modal({ title: t('edit_x', label), text: p.charName, icon: 'fa-solid fa-pen-to-square', fields: defs[field], confirm: t('save') });
    if (!r) return;
    const input = r.b !== undefined ? [r.a, r.b] : [r.a];
    if (await act('players:data', { id: p.id, field, input })) refreshSelected();
}

const PED_GROUPS = [
    { id: 'all', icon: 'fa-solid fa-border-all', test: () => true },
    { id: 'animal', icon: 'fa-solid fa-paw', test: (m) => m.startsWith('a_c_') },
    { id: 'civil', icon: 'fa-solid fa-person', test: (m) => /^a_[mf]_/.test(m) },
    { id: 'service', icon: 'fa-solid fa-user-tie', test: (m) => m.startsWith('s_') },
    { id: 'gang', icon: 'fa-solid fa-people-robbery', test: (m) => m.startsWith('g_') },
    { id: 'special', icon: 'fa-solid fa-star', test: (m) => /^(u_|ig_|cs_|csb_|hc_|mp_)/.test(m) },
];

async function pedPicker(targetName) {
    if (!S.pedData) {
        const res = await act('peds:list');
        if (!res || typeof res !== 'object') return null;
        S.pedData = { peds: Array.isArray(res.peds) ? res.peds : [], persistent: res.persistent !== false };
    }
    const peds = S.pedData.peds;

    return new Promise((resolve) => {
        if (S.modal) S.modal.cancel();
        const root = $('#modal-root');
        const el = document.createElement('div');
        el.className = 'modal ped-modal';
        let group = 'all';
        let persistent = S.pedData.persistent;

        el.innerHTML = `
            <div class="m-ico"><i class="fa-solid fa-person-rays"></i></div>
            <h3>${esc(t('op_giveped'))}</h3>
            <p>${esc(t('ped_desc', targetName))}</p>
            <div class="fields">
                <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input class="input mono" id="ped-q" placeholder="${esc(t('ped_search'))}" autocomplete="off"></div>
                <div class="chips ped-groups">${PED_GROUPS.map((g) => `<button class="chip ${g.id === 'all' ? 'active' : ''}" data-pg="${g.id}"><i class="${g.icon}"></i>${esc(t('pg_' + g.id))}</button>`).join('')}</div>
                <div class="ped-list" id="ped-list"></div>
                <div class="ped-foot">
                    <div class="ped-selected"><span>${esc(t('ped_selected'))}</span><b class="mono" id="ped-sel">-</b></div>
                    <button class="ped-persist ${persistent ? 'on' : ''}" id="ped-persist"><span class="switch"></span>${esc(t('ped_persistent'))}</button>
                </div>
            </div>
            <div class="foot">
                <button class="btn ghost" data-x="cancel">${esc(t('cancel'))}</button>
                <button class="btn primary" data-x="ok"><i class="fa-solid fa-check"></i>${esc(t('ped_give_btn'))}</button>
            </div>`;
        root.appendChild(el);
        requestAnimationFrame(() => root.classList.add('show'));

        const q = $('#ped-q', el);
        const list = $('#ped-list', el);
        const sel = $('#ped-sel', el);
        const current = () => q.value.trim().toLowerCase().replace(/\s+/g, '');

        const renderList = () => {
            const needle = current();
            const test = PED_GROUPS.find((g) => g.id === group).test;
            const items = peds.filter((m) => test(m) && (!needle || m.includes(needle)));
            const shown = items.slice(0, 250);
            sel.textContent = needle || '-';
            if (!peds.length) { list.innerHTML = `<div class="empty" style="padding:24px"><i class="fa-solid fa-keyboard"></i>${esc(t('ped_no_list'))}</div>`; return; }
            if (!items.length) { list.innerHTML = `<div class="empty" style="padding:24px"><i class="fa-solid fa-keyboard"></i>${esc(t('ped_custom_hint'))}</div>`; return; }
            list.innerHTML = shown.map((m, i) => `<button class="ped-item ${m === needle ? 'active' : ''}" data-ped="${esc(m)}" style="--i:${Math.min(i, 24)}"><i class="${(PED_GROUPS.slice(1).find((g) => g.test(m)) || PED_GROUPS[0]).icon}"></i>${esc(m)}</button>`).join('') +
                (items.length > shown.length ? `<div class="ped-more">${esc(t('ped_more', items.length - shown.length))}</div>` : '');
            $$('[data-ped]', list).forEach((b) => (b.onclick = () => { q.value = b.dataset.ped; renderList(); }));
        };

        const done = (val) => {
            root.classList.remove('show');
            S.modal = null;
            setTimeout(() => el.remove(), 350);
            resolve(val);
        };
        const submit = () => {
            const model = current();
            if (!/^[a-z0-9_]+$/.test(model)) {
                el.classList.remove('shake');
                void el.offsetWidth;
                el.classList.add('shake');
                sfx.error();
                return;
            }
            done({ model, persistent });
        };

        q.oninput = renderList;
        q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
        $$('[data-pg]', el).forEach((b) => (b.onclick = () => {
            group = b.dataset.pg;
            $$('[data-pg]', el).forEach((x) => x.classList.toggle('active', x === b));
            renderList();
        }));
        $('#ped-persist', el).onclick = (e) => {
            persistent = !persistent;
            e.currentTarget.classList.toggle('on', persistent);
            persistent ? sfx.on() : sfx.off();
        };
        $('[data-x=cancel]', el).onclick = () => done(null);
        $('[data-x=ok]', el).onclick = submit;
        $('.dim', root).onclick = () => done(null);
        S.modal = { cancel: () => done(null) };

        renderList();
        setTimeout(() => q.focus(), 80);
    });
}

async function characterKill(target) {
    const info = await act('players:ckLookup', { target });
    if (!info || typeof info !== 'object') return false;

    const r = await modal({
        title: t('op_ck'),
        text: t('ck_confirm', info.name, info.citizenid) + (info.online ? ' ' + t('ck_online_note') : ''),
        icon: 'fa-solid fa-skull-crossbones',
        danger: true,
        confirm: t('op_ck'),
        fields: [{ key: 'word', label: t('ck_type_word'), placeholder: 'CK', required: true }],
    });
    if (!r) return false;
    if (String(r.word).trim().toUpperCase() !== 'CK') { toast('error', t('error'), t('ck_word_wrong')); return false; }

    const name = await act('players:ckExecute', { citizenid: info.citizenid });
    if (!name) return false;
    sfx.off();
    toast('success', t('ck_done'), `${info.name} · ${info.citizenid}`, 'fa-solid fa-skull-crossbones', 6000);
    return true;
}

async function startDm() {
    const p = S.selected;
    if (!p) return;
    const r = await modal({
        title: t('send_dm'), text: t('dm_desc', p.charName || p.name), icon: 'fa-solid fa-paper-plane',
        fields: [{ key: 'text', label: t('message'), type: 'textarea', required: true, placeholder: t('dm_placeholder') }],
        confirm: t('send'),
    });
    if (!r) return;
    const report = await act('reports:dm', { id: p.id, text: r.text });
    if (report && typeof report === 'object') {
        upsertReport(report);
        S.activeReport = report.id;
        sfx.send();
        confetti(innerWidth / 2, innerHeight / 2, 60);
        go('reports');
    }
}

async function renderVehicles(el) {
    el.innerHTML = `
        <div class="grid g2">
            <div class="card" id="veh-current"></div>
            <div class="card">
                <div class="section-title" style="margin-top:0"><i class="fa-solid fa-toolbox"></i>${esc(t('veh_tools'))}</div>
                <div class="btn-grid" style="grid-template-columns:repeat(3,1fr)">
                    <button class="op ok" data-v="fix"><i class="fa-solid fa-screwdriver-wrench"></i>${esc(t('veh_fix'))}</button>
                    ${S.perms.saveVehicle ? `<button class="op" data-v="buy"><i class="fa-solid fa-key"></i>${esc(t('veh_buy'))}</button>` : ''}
                    <button class="op danger" data-v="delete"><i class="fa-solid fa-trash"></i>${esc(t('veh_delete'))}</button>
                    <button class="op info" data-v="tune"><i class="fa-solid fa-gauge-high"></i>${esc(t('veh_tune'))}</button>
                    <button class="op warn" data-v="plate"><i class="fa-solid fa-rectangle-list"></i>${esc(t('veh_plate'))}</button>
                </div>
            </div>
        </div>

        <div class="section-title"><i class="fa-solid fa-car-on"></i>${esc(t('veh_spawn'))}</div>
        <div class="row">
            <div class="search" style="flex:1"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="veh-search" placeholder="${esc(t('search_vehicles'))}" value="${esc(S.vehSearch)}"></div>
            <button class="btn ghost" id="veh-model"><i class="fa-solid fa-keyboard"></i>${esc(t('veh_by_model'))}</button>
        </div>
        <div class="hs-wrap mt">
            <button class="hs-btn left"><i class="fa-solid fa-chevron-left"></i></button>
            <div class="cat-scroll" id="veh-cats"></div>
            <button class="hs-btn right"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <div class="veh-grid" id="veh-grid"><div class="loader"><span></span><span></span><span></span></div></div>`;

    $$('[data-v]', el).forEach((b) => (b.onclick = () => vehicleTool(b.dataset.v, b)));
    $('#veh-search', el).oninput = (e) => { S.vehSearch = e.target.value; S.vehLimit = 120; renderVehicleGrid(); };
    $('#veh-model', el).onclick = async () => {
        const r = await modal({ title: t('veh_by_model'), icon: 'fa-solid fa-car', fields: [{ key: 'm', label: t('model'), placeholder: 'adder', required: true }], confirm: t('spawn') });
        if (r) spawnVehicle(r.m, $('#veh-model'));
    };

    updateCurrentVehicle();
    S.timers.vehicle = setInterval(updateCurrentVehicle, 1500);

    if (!S.vehicles) {
        const list = await act('vehicles:list');
        S.vehicles = Array.isArray(list) ? list : [];
    }
    renderVehicleCats();
    renderVehicleGrid();
}

async function updateCurrentVehicle() {
    const box = $('#veh-current');
    if (!box) return clearInterval(S.timers.vehicle);
    const v = await act('vehicles:current');
    const key = v ? `${v.name}|${v.plate}|${v.engine}|${v.body}|${v.fuel}` : 'none';
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    if (!v) {
        box.innerHTML = `<div class="veh-current"><div class="big" style="filter:grayscale(1);opacity:.5"><i class="fa-solid fa-person-walking"></i></div><div><div style="font-weight:800;font-size:18px">${esc(t('veh_none'))}</div><div style="color:var(--text-3);margin-top:4px">${esc(t('veh_none_desc'))}</div></div></div>`;
        return;
    }
    const mini = (label, val, color) => `<div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-3);font-weight:600"><span>${label}</span><span>${val}%</span></div><div class="bar" style="margin-top:6px;--c:${color}"><div style="width:${clamp(val, 0, 100)}%"></div></div></div>`;
    box.innerHTML = `
        <div class="veh-current">
            <div class="big"><i class="fa-solid fa-car-side"></i></div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:800;font-size:20px">${esc(v.name)}</div>
                <div class="row" style="margin-top:6px"><span class="pill mono">${esc(v.plate)}</span></div>
            </div>
        </div>
        <div class="row" style="margin-top:18px;gap:14px">${mini(t('engine'), v.engine, '#34d399')}${mini(t('body'), v.body, '#60a5fa')}${mini(t('fuel'), v.fuel, '#fbbf24')}</div>`;
}

function renderVehicleCats() {
    const box = $('#veh-cats');
    if (!box) return;
    const counts = {};
    S.vehicles.forEach((v) => (counts[v.category] = (counts[v.category] || 0) + 1));
    const cats = ['all', ...Object.keys(counts).sort()];
    box.innerHTML = cats.map((c) => `<button class="chip ${S.vehCat === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c === 'all' ? t('all') : c.charAt(0).toUpperCase() + c.slice(1))}<span class="count">${c === 'all' ? S.vehicles.length : counts[c]}</span></button>`).join('');
    $$('[data-cat]', box).forEach((b) => (b.onclick = () => {
        S.vehCat = b.dataset.cat;
        S.vehLimit = 120;
        $$('[data-cat]', box).forEach((x) => x.classList.toggle('active', x === b));
        b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        renderVehicleGrid();
    }));
    hscroll(box);
}

function hscroll(rail) {
    const wrap = rail.closest('.hs-wrap');
    if (!wrap || rail._hs) return;
    rail._hs = true;

    const update = () => {
        wrap.classList.toggle('can-left', rail.scrollLeft > 4);
        wrap.classList.toggle('can-right', rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4);
    };
    const by = (dx) => rail.scrollBy({ left: dx, behavior: 'smooth' });

    rail.addEventListener('scroll', update, { passive: true });
    rail.addEventListener('wheel', (e) => {
        if (rail.scrollWidth <= rail.clientWidth) return;
        e.preventDefault();
        rail.scrollLeft += (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * 1.2;
    }, { passive: false });

    let startX = 0, startLeft = 0, down = false, moved = false;
    rail.addEventListener('pointerdown', (e) => { down = true; moved = false; startX = e.clientX; startLeft = rail.scrollLeft; });
    window.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (!moved && Math.abs(dx) > 6) { moved = true; rail.classList.add('dragging'); }
        if (moved) rail.scrollLeft = startLeft - dx;
    });
    window.addEventListener('pointerup', () => {
        if (!down) return;
        down = false;
        setTimeout(() => rail.classList.remove('dragging'), 0);
    });

    $('.hs-btn.left', wrap).onclick = () => by(-rail.clientWidth * 0.7);
    $('.hs-btn.right', wrap).onclick = () => by(rail.clientWidth * 0.7);
    requestAnimationFrame(update);
    new ResizeObserver(update).observe(rail);
}

function renderVehicleGrid() {
    const grid = $('#veh-grid');
    if (!grid || !S.vehicles) return;
    const q = S.vehSearch.toLowerCase();
    const items = S.vehicles.filter((v) => (S.vehCat === 'all' || v.category === S.vehCat) && (!q || `${v.name} ${v.model} ${v.brand}`.toLowerCase().includes(q)));
    if (!items.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fa-solid fa-car-burst"></i>${esc(t('no_vehicles'))}</div>`; return; }
    const shown = items.slice(0, S.vehLimit);
    grid.innerHTML = shown.map((v, i) => `
        <div class="card hover veh-card" data-model="${esc(v.model)}" style="--i:${Math.min(i, 40)}">
            <i class="fa-solid fa-car-side ghost-ico"></i>
            <div class="n">${esc(v.name)}</div>
            <div class="b">${esc(v.brand || v.category)}</div>
            <div class="foot"><span class="m">${esc(v.model)}</span><span class="go"><i class="fa-solid fa-bolt"></i></span></div>
        </div>`).join('') +
        (items.length > shown.length ? `<button class="btn ghost" id="veh-more" style="grid-column:1/-1">${esc(t('show_more', items.length - shown.length))}</button>` : '');
    $$('[data-model]', grid).forEach((c) => (c.onclick = () => spawnVehicle(c.dataset.model, c)));
    if ($('#veh-more', grid)) $('#veh-more', grid).onclick = () => { S.vehLimit += 120; renderVehicleGrid(); };
}

async function spawnVehicle(model, el) {
    toast('info', t('spawning'), model, 'fa-solid fa-car-on', 2000);
    if (await act('vehicles:spawn', { model })) {
        if (el) confettiAt(el, 70);
        toast('success', t('spawned'), model, 'fa-solid fa-flag-checkered');
        updateCurrentVehicle();
    }
}

async function vehicleTool(id, btn) {
    if (id === 'plate') {
        const r = await modal({ title: t('veh_plate'), icon: 'fa-solid fa-rectangle-list', fields: [{ key: 'p', label: t('plate_max'), maxlength: 8, required: true, placeholder: 'QBOX' }] });
        if (r && (await act('vehicles:plate', { plate: r.p.toUpperCase() }))) { toast('success', t('veh_plate'), r.p.toUpperCase()); confettiAt(btn, 30); }
        return;
    }
    if (id === 'delete' && !(await confirmBox(t('veh_delete'), t('confirm_dv'), 'fa-solid fa-trash'))) return;
    if (await act('vehicles:' + id)) {
        if (id === 'fix') { confettiAt(btn, 40); toast('success', t('veh_fix')); }
        if (id === 'delete') toast('success', t('veh_delete'));
        updateCurrentVehicle();
    }
}

const WEATHERS = [
    ['Extrasunny', 'fa-solid fa-sun', '#fbbf24'], ['Clear', 'fa-solid fa-cloud-sun', '#fde047'], ['Neutral', 'fa-solid fa-cloud', '#cbd5e1'],
    ['Smog', 'fa-solid fa-smog', '#a8a29e'], ['Foggy', 'fa-solid fa-water', '#94a3b8'], ['Overcast', 'fa-solid fa-cloud', '#64748b'],
    ['Clouds', 'fa-solid fa-cloud', '#93c5fd'], ['Clearing', 'fa-solid fa-cloud-sun-rain', '#7dd3fc'], ['Rain', 'fa-solid fa-cloud-rain', '#38bdf8'],
    ['Thunder', 'fa-solid fa-cloud-bolt', '#a78bfa'], ['Snow', 'fa-solid fa-snowflake', '#e0f2fe'], ['Blizzard', 'fa-solid fa-wind', '#bae6fd'],
    ['Snowlight', 'fa-regular fa-snowflake', '#f0f9ff'], ['Xmas', 'fa-solid fa-tree', '#4ade80'], ['Halloween', 'fa-solid fa-ghost', '#fb923c'],
];

function renderServer(el) {
    el.innerHTML = `
        <div class="section-title" style="margin-top:4px"><i class="fa-solid fa-cloud-sun"></i>${esc(t('weather'))}</div>
        <div class="weather-grid stagger">
            ${WEATHERS.map(([id, icon, c]) => `<div class="card hover weather ${S.weather === id ? 'active' : ''}" data-weather="${id}" style="--c:${c}"><i class="${icon}"></i>${esc(t('w_' + id.toLowerCase()))}</div>`).join('')}
        </div>

        <div class="grid g2 mt">
            <div class="card">
                <div class="section-title" style="margin-top:0"><i class="fa-solid fa-clock"></i>${esc(t('time'))}</div>
                <div class="row" style="gap:26px">
                    <div class="dial"><div class="hand" id="dial-hand"></div><div class="center"><div><i id="dial-ico" class="fa-solid fa-sun"></i><b id="dial-time">12:00</b></div></div></div>
                    <div class="col" style="flex:1">
                        <input type="range" id="time-range" min="0" max="23" step="1" value="${S.hour}">
                        <div class="chips">${[0, 6, 9, 12, 15, 18, 21].map((h) => `<button class="chip" data-hour="${h}">${String(h).padStart(2, '0')}:00</button>`).join('')}</div>
                        <button class="btn primary" id="time-apply"><i class="fa-solid fa-check"></i>${esc(t('apply'))}</button>
                    </div>
                </div>
            </div>
            <div class="col" style="gap:16px">
                ${S.perms.radioList ? `
                <div class="card">
                    <div class="section-title" style="margin-top:0"><i class="fa-solid fa-walkie-talkie"></i>${esc(t('radio_list'))}</div>
                    <div class="row"><input class="input" id="radio-input" type="number" placeholder="${esc(t('frequency'))}"><button class="btn primary" id="radio-go"><i class="fa-solid fa-magnifying-glass"></i></button></div>
                    <div class="col mt" id="radio-out"></div>
                </div>` : ''}
                <div class="card">
                    <div class="section-title" style="margin-top:0"><i class="fa-solid fa-box-open"></i>${esc(t('stash'))}</div>
                    <div class="row"><input class="input" id="stash-input" placeholder="${esc(t('stash_name'))}"><button class="btn primary" id="stash-go"><i class="fa-solid fa-door-open"></i>${esc(t('open'))}</button></div>
                </div>
            </div>
        </div>`;

    stagger(el);
    $$('[data-weather]', el).forEach((c) => (c.onclick = async () => {
        if (await act('server:weather', { weather: c.dataset.weather })) {
            S.weather = c.dataset.weather;
            $$('[data-weather]', el).forEach((x) => x.classList.toggle('active', x === c));
            confettiAt(c, 30);
            toast('success', t('weather'), t('w_' + S.weather.toLowerCase()), WEATHERS.find((w) => w[0] === S.weather)[1]);
        }
    }));

    const range = $('#time-range', el);
    const setDial = (h) => {
        S.hour = h;
        range.value = h;
        range.style.setProperty('--p', (h / 23) * 100 + '%');
        $('#dial-hand', el).style.transform = `rotate(${(h / 24) * 360}deg)`;
        $('#dial-time', el).textContent = String(h).padStart(2, '0') + ':00';
        $('#dial-ico', el).className = h >= 6 && h < 19 ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    };
    setDial(S.hour);
    range.oninput = () => setDial(Number(range.value));
    $$('[data-hour]', el).forEach((c) => (c.onclick = () => setDial(Number(c.dataset.hour))));
    $('#time-apply', el).onclick = async (e) => {
        if (await act('server:time', { hour: S.hour, minute: 0 })) { confettiAt(e.currentTarget, 30); toast('success', t('time'), String(S.hour).padStart(2, '0') + ':00', 'fa-solid fa-clock'); }
    };

    if ($('#radio-go', el)) {
        const run = async () => {
            const f = $('#radio-input', el).value;
            if (!f) return;
            const out = $('#radio-out', el);
            out.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';
            const list = await act('server:radio', { frequency: f });
            const arr = Array.isArray(list) ? list : [];
            out.innerHTML = arr.length
                ? arr.map((p, i) => `<div class="list-row" style="animation:popIn .5s var(--spring) backwards;animation-delay:${i * 40}ms">${avatar(p.name)}<div style="flex:1;font-weight:600">${esc(p.name)}</div><span class="idtag">#${p.id}</span></div>`).join('')
                : `<div class="empty" style="padding:20px"><i class="fa-solid fa-tower-broadcast"></i>${esc(t('radio_empty', f))}</div>`;
        };
        $('#radio-go', el).onclick = run;
        $('#radio-input', el).onkeydown = (e) => e.key === 'Enter' && run();
    }
    const stash = () => { const n = $('#stash-input', el).value.trim(); if (n) act('server:stash', { name: n }); };
    $('#stash-go', el).onclick = stash;
    $('#stash-input', el).onkeydown = (e) => e.key === 'Enter' && stash();
}

S.banFilter = 'active';
S.banSearch = '';

function banRemaining(b, now) {
    if (b.permanent) return { text: t('ban_permanent'), cls: 'perm' };
    const left = (b.expire || 0) - now;
    if (left <= 0) return { text: t('ban_expired'), cls: 'expired' };
    const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60);
    return { text: d > 0 ? t('ban_left_dh', d, h) : h > 0 ? t('ban_left_hm', h, m) : t('ban_left_m', Math.max(1, m)), cls: 'temp' };
}

async function renderBans(el) {
    el.classList.add('fill');
    el.innerHTML = `
        <div class="row">
            <div class="chips" id="ban-filters"></div>
            <span class="spacer"></span>
            <div class="search" style="width:340px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="ban-search" placeholder="${esc(t('search_bans'))}" value="${esc(S.banSearch)}"></div>
            <button class="icon-btn" id="ban-reload" style="width:42px;height:42px"><i class="fa-solid fa-rotate"></i></button>
        </div>
        <div class="ban-list mt" id="ban-list"><div class="loader"><span></span><span></span><span></span></div></div>`;
    $('#ban-search', el).oninput = (e) => { S.banSearch = e.target.value; renderBanList(); };
    $('#ban-reload', el).onclick = () => go('bans', true);

    const res = await act('bans:list');
    if (S.page !== 'bans' || !el.isConnected) return;
    S.bans = res && Array.isArray(res.bans) ? res.bans : [];
    S.bansNow = res?.now || Math.floor(Date.now() / 1000);
    renderBanList();
}

function renderBanList() {
    const box = $('#ban-list');
    if (!box || !S.bans) return;
    const counts = { active: 0, expired: 0, all: S.bans.length };
    S.bans.forEach((b) => (b.active ? counts.active++ : counts.expired++));
    $('#ban-filters').innerHTML = ['active', 'expired', 'all'].map((f) => `<button class="chip ${S.banFilter === f ? 'active' : ''}" data-bf="${f}">${esc(t('ban_f_' + f))}<span class="count">${counts[f]}</span></button>`).join('');
    $$('[data-bf]').forEach((b) => (b.onclick = () => { S.banFilter = b.dataset.bf; renderBanList(); }));

    const q = S.banSearch.toLowerCase();
    const items = S.bans.filter((b) => (S.banFilter === 'all' || (S.banFilter === 'active') === !!b.active) && (!q || `${b.id} ${b.name} ${b.license} ${b.discord} ${b.reason} ${b.bannedby}`.toLowerCase().includes(q)));
    if (!items.length) { box.innerHTML = `<div class="empty"><i class="fa-solid fa-dove"></i>${esc(t('no_bans'))}</div>`; return; }

    box.innerHTML = items.map((b, i) => {
        const rem = banRemaining(b, S.bansNow);
        return `
            <div class="ban-row ${b.active ? '' : 'expired'}" style="--i:${Math.min(i, 20)}">
                ${avatar(b.name || '?')}
                <div class="info">
                    <div class="n">${esc(b.name || t('unknown'))} <span class="idtag">#${b.id}</span></div>
                    <div class="reason"><i class="fa-solid fa-quote-left"></i> ${esc(b.reason || '-')}</div>
                    <div class="meta">
                        <span><i class="fa-solid fa-user-shield"></i> ${esc(b.bannedby || '-')}</span>
                        <span class="mono" data-copy="${esc(String(b.license || '').replace(/^license2?:/, ''))}" title="${esc(t('click_copy'))}"><i class="fa-solid fa-fingerprint"></i> ${esc(b.license || '-')}</span>
                        ${b.discord ? `<span class="mono"><i class="fa-brands fa-discord"></i> ${esc(String(b.discord).replace('discord:', ''))}</span>` : ''}
                    </div>
                </div>
                <span class="ban-left ${rem.cls}"><i class="fa-solid ${rem.cls === 'perm' ? 'fa-infinity' : rem.cls === 'expired' ? 'fa-hourglass-end' : 'fa-hourglass-half'}"></i>${esc(rem.text)}</span>
                <button class="btn ok sm" data-unban="${b.id}"><i class="fa-solid fa-unlock"></i>${esc(b.active ? t('unban') : t('remove_record'))}</button>
            </div>`;
    }).join('');

    $$('[data-copy]', box).forEach((s) => (s.onclick = () => { copyText(s.dataset.copy); toast('success', t('copied'), s.dataset.copy); }));
    $$('[data-unban]', box).forEach((btn) => (btn.onclick = async () => {
        const b = S.bans.find((x) => x.id === Number(btn.dataset.unban));
        if (!b || !(await confirmBox(t('unban'), t('confirm_unban', b.name || '?', b.id), 'fa-solid fa-unlock', false))) return;
        if (!(await act('bans:unban', { id: b.id }))) return;
        confettiAt(btn, 80);
        toast('success', t('unbanned'), b.name || '', 'fa-solid fa-unlock');
        const row = btn.closest('.ban-row');
        row.classList.add('removing');
        setTimeout(() => { S.bans = S.bans.filter((x) => x.id !== b.id); renderBanList(); }, 450);
    }));
}

const MONEY_STYLE = {
    cash: { icon: 'fa-solid fa-money-bill-wave', color: '#34d399' },
    bank: { icon: 'fa-solid fa-building-columns', color: '#60a5fa' },
    crypto: { icon: 'fa-brands fa-bitcoin', color: '#fbbf24' },
};
const moneyStyle = (type) => MONEY_STYLE[type] || { icon: 'fa-solid fa-coins', color: '#c084fc' };
const moneyLabel = (type) => (S.locales['ui.' + type] ? t(type) : type.charAt(0).toUpperCase() + type.slice(1));

async function renderEconomy(el, force) {
    el.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';
    const data = await act('economy:get', { force: !!force });
    if (S.page !== 'economy' || !el.isConnected) return;
    if (!data || typeof data !== 'object') {
        el.innerHTML = `<div class="empty"><i class="fa-solid fa-sack-xmark"></i>${esc(t('eco_error'))}</div>`;
        return;
    }

    const tot = data.totals;
    const types = data.moneyTypes || ['cash', 'bank'];
    const top = data.top || [];
    const leader = top[0]?.total || 1;

    const podiumOrder = [1, 0, 2].filter((i) => top[i]);
    const medals = ['#fbbf24', '#cbd5e1', '#f59e0b'];
    const podium = podiumOrder.map((i) => {
        const p = top[i];
        return `
            <div class="podium-col rank-${i + 1}" style="--m:${medals[i]};--i:${i}" ${p.online ? `data-eco-player="${p.id}"` : ''}>
                ${i === 0 ? '<i class="fa-solid fa-crown crown"></i>' : ''}
                ${avatar(p.name, 'lg', p.online)}
                <div class="p-name">${esc(p.name)}</div>
                <div class="p-money">${money(p.total)}</div>
                <div class="podium-block"><span>${i + 1}</span></div>
            </div>`;
    }).join('');

    const rest = top.slice(3).map((p, idx) => {
        const rank = idx + 4;
        return `
            <div class="eco-row ${p.online ? 'click' : ''}" ${p.online ? `data-eco-player="${p.id}"` : ''} style="--i:${idx}">
                <div class="rank">#${rank}</div>
                ${avatar(p.name, '', p.online)}
                <div class="info">
                    <div class="n">${esc(p.name)}</div>
                    <div class="s mono">${esc(p.citizenid)}${p.online ? ` · <span style="color:var(--ok)">${esc(t('online'))} #${p.id}</span>` : ''}</div>
                </div>
                <div class="split-mini">${types.map((ty) => `<span style="color:${moneyStyle(ty).color}"><i class="${moneyStyle(ty).icon}"></i> ${money(p[ty])}</span>`).join('')}</div>
                <div class="amount">
                    <b>${money(p.total)}</b>
                    <div class="bar"><div data-width="${(p.total / leader) * 100}%" style="--c:var(--accent)"></div></div>
                </div>
            </div>`;
    }).join('');

    el.innerHTML = `
        <div class="hero eco-hero">
            <i class="fa-solid fa-sack-dollar wave"></i>
            <div class="row" style="align-items:flex-start">
                <div style="flex:1">
                    <div class="eco-label">${esc(t('eco_total'))}</div>
                    <div class="eco-total">$<span data-count="${tot.total}">0</span></div>
                    <p>${esc(t('eco_hero', tot.characters.toLocaleString('en-US'), money(tot.average)))}</p>
                </div>
                <button class="btn ghost" id="eco-refresh"><i class="fa-solid fa-rotate"></i>${esc(t('eco_refresh'))}</button>
            </div>
            <div class="eco-split mt">
                ${types.map((ty) => `<div style="--c:${moneyStyle(ty).color}" data-width="${tot.total ? (tot[ty] / tot.total) * 100 : 0}%"></div>`).join('')}
            </div>
            <div class="row" style="margin-top:10px;gap:18px;flex-wrap:wrap">
                ${types.map((ty) => `<span class="eco-legend" style="--c:${moneyStyle(ty).color}">${esc(moneyLabel(ty))} · ${tot.total ? Math.round((tot[ty] / tot.total) * 100) : 0}%</span>`).join('')}
                <span class="spacer"></span>
                <span style="color:rgba(255,255,255,.6);font-size:12px"><i class="fa-regular fa-clock"></i> ${esc(t('eco_updated'))} <span data-ago="${data.updatedAt}">${esc(ago(data.updatedAt))}</span></span>
            </div>
        </div>

        <div class="grid g4 mt stagger">
            ${types.map((ty) => `
                <div class="card hover stat">
                    <div class="ring">${ringSvg(tot[ty], tot.total, moneyStyle(ty).color)}<i class="${moneyStyle(ty).icon}" style="color:${moneyStyle(ty).color}"></i></div>
                    <div style="min-width:0"><div class="value" style="font-size:22px">$<span data-count="${tot[ty]}">0</span></div><div class="label">${esc(t('eco_total_x', moneyLabel(ty)))}</div></div>
                </div>`).join('')}
            <div class="card hover stat">
                <div class="ring">${ringSvg(1, 1, 'var(--g2)')}<i class="fa-solid fa-scale-balanced" style="color:var(--g2)"></i></div>
                <div><div class="value" style="font-size:22px">$<span data-count="${tot.average}">0</span></div><div class="label">${esc(t('eco_average'))}</div></div>
            </div>
            <div class="card hover stat">
                <div class="ring">${ringSvg(tot.onlineCount, Math.max(tot.characters, 1), 'var(--g3)')}<i class="fa-solid fa-id-card" style="color:var(--g3)"></i></div>
                <div><div class="value" style="font-size:22px" data-count="${tot.characters}">0</div><div class="label">${esc(t('eco_characters'))}</div></div>
            </div>
        </div>

        <div class="section-title"><i class="fa-solid fa-trophy"></i>${esc(t('eco_top', top.length))}</div>
        ${top.length ? `
            <div class="podium">${podium}</div>
            <div class="col mt" style="gap:8px">${rest}</div>` : `<div class="empty"><i class="fa-solid fa-piggy-bank"></i>${esc(t('eco_empty'))}</div>`}`;

    stagger(el);
    countUp(el);
    fillRings(el);
    $('#eco-refresh', el).onclick = () => renderEconomy(el, true);
    $$('[data-eco-player]', el).forEach((row) => (row.onclick = () => {
        S.selected = { id: Number(row.dataset.ecoPlayer) };
        go('players');
    }));
    setTimeout(() => $('.podium-col.rank-1', el) && confettiAt($('.podium-col.rank-1', el), 60), 900);
}

function renderDev(el) {
    const copies = [
        ['coords2', 'vec2', 'fa-solid fa-location-dot'],
        ['coords3', 'vec3', 'fa-solid fa-location-crosshairs'],
        ['coords4', 'vec4', 'fa-solid fa-street-view'],
        ['heading', 'heading', 'fa-solid fa-compass'],
    ];
    el.innerHTML = `
        <div class="card" style="background:linear-gradient(120deg, rgba(var(--g3-rgb),.14), rgba(var(--g1-rgb),.08))">
            <div class="row"><div class="section-title" style="margin:0;flex:1"><i class="fa-solid fa-satellite"></i>${esc(t('live_position'))}</div><span class="pill closed"><span class="dot" style="animation:blink 1s infinite"></span>LIVE</span></div>
            <div class="coord-grid mt">
                ${[['X', '#f87171'], ['Y', '#4ade80'], ['Z', '#60a5fa'], ['H', '#fbbf24']].map(([a, c]) => `<div class="card coord" style="--c:${c}"><div class="axis">${a}</div><div class="num" id="live-${a.toLowerCase()}">0.00</div></div>`).join('')}
            </div>
            <div class="row mt" style="color:var(--text-2);gap:16px;flex-wrap:wrap">
                <span><i class="fa-solid fa-road" style="color:var(--accent-text)"></i> <span id="live-street">-</span></span>
                <span><i class="fa-solid fa-map" style="color:var(--accent-text)"></i> <span id="live-zone">-</span></span>
                <span><i class="fa-solid fa-building" style="color:var(--accent-text)"></i> ${esc(t('interior'))}: <span id="live-int" class="mono">0</span></span>
            </div>
        </div>

        <div class="section-title"><i class="fa-regular fa-copy"></i>${esc(t('copy'))}</div>
        <div class="copy-grid stagger">
            ${copies.map(([id, label, icon]) => `<button class="card hover copy-card action-tile" data-copy-type="${id}" style="display:block"><div class="row"><div class="ico"><i class="${icon}"></i></div><div><div class="t">${label}</div><div class="d">${esc(t('click_copy'))}</div></div></div><div class="preview" id="pv-${id}">-</div></button>`).join('')}
        </div>

        <div class="section-title"><i class="fa-solid fa-bug"></i>${esc(t('overlays'))}</div>
        <div class="grid g2 stagger">
            <div class="card hover quick-toggle ${S.state.coords ? 'on' : ''}" data-state="coords" data-dev="dev:coords">
                <div class="top"><div class="ico"><i class="fa-solid fa-compass-drafting"></i></div><div class="switch"></div></div>
                <div><div class="t">${esc(t('dev_coords'))}</div><div class="d">${esc(t('dev_coords_desc'))}</div></div>
            </div>
            <div class="card hover quick-toggle ${S.state.vehInfo ? 'on' : ''}" data-state="vehInfo" data-dev="dev:vehInfo">
                <div class="top"><div class="ico"><i class="fa-solid fa-car-side"></i></div><div class="switch"></div></div>
                <div><div class="t">${esc(t('dev_vehinfo'))}</div><div class="d">${esc(t('dev_vehinfo_desc'))}</div></div>
            </div>
        </div>
        <div class="card mt hidden" id="live-veh"></div>`;

    stagger(el);
    $$('[data-copy-type]', el).forEach((b) => (b.onclick = async () => {
        const s = await act('dev:copy', { type: b.dataset.copyType });
        if (typeof s !== 'string') return;
        copyText(s);
        b.classList.add('copied');
        setTimeout(() => b.classList.remove('copied'), 1000);
        confettiAt(b, 25);
    }));
    $$('[data-dev]', el).forEach((c) => (c.onclick = async () => {
        const res = await act(c.dataset.dev);
        if (typeof res !== 'boolean') return;
        S.state[c.dataset.state] = res;
        syncToggles();
        res ? sfx.on() : sfx.off();
    }));

    const tick = async () => {
        if (S.page !== 'dev' || S.mode !== 'admin') return;
        const d = await act('dev:live');
        if (!d || typeof d !== 'object') return;
        const set = (id, v) => { const n = $('#' + id); if (n) n.textContent = v; };
        set('live-x', d.x.toFixed(2)); set('live-y', d.y.toFixed(2)); set('live-z', d.z.toFixed(2)); set('live-h', d.h.toFixed(2));
        set('live-street', d.street || '-'); set('live-zone', d.zone || '-'); set('live-int', d.interior);
        set('pv-coords2', `vec2(${d.x}, ${d.y})`);
        set('pv-coords3', `vec3(${d.x}, ${d.y}, ${(d.z - 1).toFixed(2)})`);
        set('pv-coords4', `vec4(${d.x}, ${d.y}, ${(d.z - 1).toFixed(2)}, ${d.h})`);
        set('pv-heading', d.h);
        const vb = $('#live-veh');
        if (vb) {
            vb.classList.toggle('hidden', !d.vehicle);
            if (d.vehicle) {
                const v = d.vehicle;
                vb.innerHTML = `<div class="kv">${[['fa-solid fa-car', t('vehicle'), v.name], ['fa-solid fa-hashtag', 'Hash', v.hash], ['fa-solid fa-rectangle-list', t('veh_plate'), v.plate], ['fa-solid fa-gauge', t('speed'), v.speed + ' km/h'], ['fa-solid fa-oil-can', t('engine'), v.engine], ['fa-solid fa-car-burst', t('body'), v.body], ['fa-solid fa-layer-group', t('class'), v.class]].map(([i, k, val]) => `<div class="card" style="padding:12px 14px"><div class="k"><i class="${i}"></i>${esc(k)}</div><div class="v mono">${esc(val)}</div></div>`).join('')}</div>`;
            }
        }
    };
    tick();
    S.timers.live = setInterval(tick, 300);
}

function reportStats() {
    const s = { open: 0, claimed: 0, closed: 0, total: 0 };
    S.reports.forEach((r) => { s[r.status] = (s[r.status] || 0) + 1; s.total++; });
    return s;
}

function updateBadge() {
    const b = $('#badge-reports');
    if (!b) return;
    const n = S.reports.filter((r) => r.status === 'open').length + [...S.unread].filter((id) => S.reports.find((r) => r.id === id && r.status !== 'open')).length;
    b.textContent = n;
    b.classList.toggle('zero', n === 0);
}

async function loadReports() {
    if (!S.perms.reports) return;
    const list = await act('reports:list');
    S.reports = Array.isArray(list) ? list : [];
    updateBadge();
    if (S.page === 'reports') { renderReportList(); renderStaffChat(); }
    if (S.page === 'dashboard') { const box = $('#dash-reports'); if (box) { box.innerHTML = recentReportsHtml(); bindDashReports(box); } }
}

function upsertReport(report, list = S.reports) {
    const i = list.findIndex((r) => r.id === report.id);
    if (i >= 0) list[i] = report; else list.unshift(report);
    list.sort((a, b) => b.updatedAt - a.updatedAt);
}

function renderReports(el) {
    el.classList.add('fill');
    el.innerHTML = `
        <div class="reports-layout">
            <div class="pane" style="display:flex;flex-direction:column;min-height:0">
                <div class="chips" id="r-filters"></div>
                <div class="search mt" style="margin-top:12px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="r-search" placeholder="${esc(t('search_reports'))}" value="${esc(S.reportSearch)}"></div>
                <div class="rlist" id="rlist"></div>
            </div>
            <div class="pane" id="rchat" style="min-height:0"></div>
        </div>`;
    $('#r-search', el).oninput = (e) => { S.reportSearch = e.target.value; renderReportList(); };
    renderReportList();
    renderStaffChat();
    loadReports();
}

function reportRowHtml(r, i, active, unread) {
    const cat = catInfo(r.category);
    const last = r.messages[r.messages.length - 1];
    const lastText = last ? (last.from === 'system' ? sysText(last.text) : `${last.name}: ${last.text}`) : '';
    return `
        <div class="report-row ${active ? 'active' : ''} ${unread ? 'unread' : ''}" data-rid="${r.id}" style="--i:${Math.min(i, 15)}">
            <div class="top">
                <div class="cat-ico" style="--c:${cat.color};color:${cat.color}"><i class="${cat.icon}"></i></div>
                <div class="subj">${esc(r.subject)}</div>
            </div>
            <div class="last">${esc(lastText)}</div>
            <div class="meta">
                <span class="pill ${r.status}"><span class="dot"></span>${esc(t('st_' + r.status))}</span>
                <span>#${r.id}</span><span>·</span><span>${esc(r.senderChar || r.senderName)}</span>
                <span class="spacer"></span><span data-ago="${r.updatedAt}">${esc(ago(r.updatedAt))}</span>
            </div>
        </div>`;
}

function renderReportList() {
    const box = $('#rlist');
    if (!box) return;
    const st = reportStats();
    const filters = $('#r-filters');
    filters.innerHTML = ['all', 'open', 'claimed', 'closed'].map((f) => `<button class="chip ${S.reportFilter === f ? 'active' : ''}" data-f="${f}">${esc(t(f === 'all' ? 'all' : 'st_' + f))}<span class="count">${f === 'all' ? st.total : st[f] || 0}</span></button>`).join('');
    $$('[data-f]', filters).forEach((b) => (b.onclick = () => { S.reportFilter = b.dataset.f; renderReportList(); }));

    const q = S.reportSearch.toLowerCase();
    const items = S.reports.filter((r) => (S.reportFilter === 'all' || r.status === S.reportFilter) && (!q || `${r.id} ${r.subject} ${r.senderName} ${r.senderChar}`.toLowerCase().includes(q)));
    box.innerHTML = items.length
        ? items.map((r, i) => reportRowHtml(r, i, r.id === S.activeReport, S.unread.has(r.id))).join('')
        : `<div class="empty"><i class="fa-solid fa-inbox"></i>${esc(t('no_reports'))}</div>`;
    $$('[data-rid]', box).forEach((row) => (row.onclick = () => {
        S.activeReport = Number(row.dataset.rid);
        S.unread.delete(S.activeReport);
        updateBadge();
        $$('.report-row', box).forEach((x) => x.classList.toggle('active', x === row));
        row.classList.remove('unread');
        renderStaffChat();
    }));
}

function renderStaffChat() {
    const box = $('#rchat');
    if (!box) return;
    const report = S.reports.find((r) => r.id === S.activeReport);
    if (!report) {
        box._chat = null;
        box.innerHTML = `<div class="chat"><div class="empty" style="flex:1"><i class="fa-solid fa-comments"></i><div style="font-size:16px;font-weight:700;color:var(--text-2)">${esc(t('select_report'))}</div>${esc(t('select_report_desc'))}</div></div>`;
        return;
    }
    S.unread.delete(report.id);
    updateBadge();
    updateChat(box, report, 'staff');
}

function sysText(text) {
    const [k, arg] = String(text).split(/:(.*)/s);
    const map = { claimed: 'sys_claimed', unclaimed: 'sys_unclaimed', closed: 'sys_closed', reopened: 'sys_reopened', closed_by_player: 'sys_closed_player', staff_left: 'sys_staff_left' };
    return map[k] ? t(map[k], arg || '') : text;
}

function isMine(m, side) {
    return side === 'staff' ? m.from === 'staff' && m.authorId === S.me.id : m.from === 'player';
}

function messageEl(m, side) {
    const el = document.createElement('div');
    if (m.from === 'system') {
        el.className = 'sys-msg';
        el.innerHTML = `<i class="fa-solid fa-circle-info"></i>${esc(sysText(m.text))} · ${fmtClock(m.time)}`;
        return el;
    }
    const mine = isMine(m, side);
    el.className = 'msg' + (mine ? ' mine' : '');
    el.innerHTML = `
        ${avatar(m.name)}
        <div class="msg-wrap">
            <div class="who">${mine ? '' : esc(m.name)}${m.from === 'staff' ? `<span class="role">${esc(t('staff'))}</span>` : ''}<span class="time">${fmtClock(m.time)}</span></div>
            <div class="bubble">${esc(m.text)}</div>
        </div>`;
    return el;
}

function chatHeadHtml(r, side) {
    const cat = catInfo(r.category);
    const closed = r.status === 'closed';
    const staffBtns = side === 'staff' ? `
        ${r.status === 'open' ? `<button class="btn primary sm" data-ra="claim"><i class="fa-solid fa-hand"></i>${esc(t('claim'))}</button>` : ''}
        ${r.status === 'claimed' ? `<button class="btn ghost sm" data-ra="unclaim"><i class="fa-solid fa-hand-point-left"></i>${esc(t('unclaim'))}</button>` : ''}
        ${!closed && r.senderOnline ? `<button class="btn ghost sm" data-ra="goto" title="${esc(t('op_goto'))}"><i class="fa-solid fa-person-walking-arrow-right"></i></button><button class="btn ghost sm" data-ra="bring" title="${esc(t('op_bring'))}"><i class="fa-solid fa-person-walking-arrow-loop-left"></i></button>` : ''}
        ${closed ? `<button class="btn ghost sm" data-ra="reopen"><i class="fa-solid fa-rotate-left"></i>${esc(t('reopen'))}</button>` : `<button class="btn ok sm" data-ra="close"><i class="fa-solid fa-check-double"></i>${esc(t('resolve'))}</button>`}
        <button class="btn danger sm" data-ra="delete"><i class="fa-solid fa-trash"></i></button>` :
        (!closed ? `<button class="btn ok sm" data-ra="close"><i class="fa-solid fa-check-double"></i>${esc(t('mark_solved'))}</button>` : '');

    const who = side === 'staff'
        ? `<span><i class="fa-solid fa-user"></i> ${esc(r.senderChar)} (${esc(r.senderName)}) · #${r.senderId}</span>`
        : `<span>#${r.id}</span>`;
    return `
        <div class="cat-ico" style="width:42px;height:42px;border-radius:13px;font-size:16px;color:${cat.color}"><i class="${cat.icon}"></i></div>
        <div class="info">
            <div class="t">${esc(r.subject)}</div>
            <div class="s">
                <span class="pill ${r.status}"><span class="dot"></span>${esc(t('st_' + r.status))}</span>
                ${who}
                ${side === 'staff' ? `<span style="color:${r.senderOnline ? 'var(--ok)' : 'var(--text-3)'}">● ${esc(r.senderOnline ? t('online') : t('offline'))}</span>` : ''}
                ${r.claimedBy ? `<span><i class="fa-solid fa-user-shield"></i> ${esc(r.claimedBy.name)}</span>` : ''}
                ${r.rating ? `<span class="stars static">${[1, 2, 3, 4, 5].map((n) => `<i class="fa-solid fa-star star ${n <= r.rating ? 'on' : ''}"></i>`).join('')}</span>` : ''}
            </div>
        </div>
        <div class="chat-actions">${staffBtns}</div>`;
}

function chatFootHtml(r, side) {
    if (r.status !== 'closed') {
        return `<div class="composer">
            <textarea class="input" id="composer-input" placeholder="${esc(t('type_message'))}" maxlength="500"></textarea>
            <button class="send-btn" id="composer-send"><i class="fa-solid fa-paper-plane"></i></button>
        </div>`;
    }
    if (side === 'player' && !r.rating) {
        return `<div class="closed-bar"><i class="fa-solid fa-circle-check"></i><span style="flex:1">${esc(t('closed_rate'))}</span><div class="stars" id="rate">${[1, 2, 3, 4, 5].map((n) => `<i class="fa-solid fa-star star" data-star="${n}"></i>`).join('')}</div></div>`;
    }
    return `<div class="closed-bar"><i class="fa-solid fa-lock"></i><span style="flex:1">${esc(t('closed_info'))}</span>${r.rating ? `<span class="stars static">${[1, 2, 3, 4, 5].map((n) => `<i class="fa-solid fa-star star ${n <= r.rating ? 'on' : ''}"></i>`).join('')}</span>` : ''}</div>`;
}

function mountChat(box, report, side) {
    box.innerHTML = `
        <div class="chat">
            <div class="chat-head"></div>
            <div class="messages"></div>
            <div class="typing"><div class="dots"><span></span><span></span><span></span></div><span class="tname"></span></div>
            <div class="chat-foot"></div>
        </div>`;
    box._chat = { id: report.id, side, rendered: new Set(), foot: null };
}

function updateChat(box, report, side) {
    if (!box._chat || box._chat.id !== report.id || box._chat.side !== side) mountChat(box, report, side);
    const c = box._chat;
    const head = $('.chat-head', box);
    head.innerHTML = chatHeadHtml(report, side);
    $$('[data-ra]', head).forEach((b) => (b.onclick = () => reportAction(report, b.dataset.ra, side, b)));

    const list = $('.messages', box);
    const first = c.rendered.size === 0;
    const fresh = report.messages.filter((m) => !c.rendered.has(m.id));
    fresh.forEach((m, i) => {
        c.rendered.add(m.id);
        const el = messageEl(m, side);
        if (first) {
            const fromEnd = fresh.length - i;
            if (fromEnd > 8) el.style.animation = 'none';
            else el.style.animationDelay = (8 - fromEnd) * 50 + 'ms';
        }
        list.appendChild(el);
    });
    if (fresh.length) requestAnimationFrame(() => list.scrollTo({ top: list.scrollHeight, behavior: first ? 'auto' : 'smooth' }));

    const footKey = report.status + ':' + (report.rating || 0);
    if (c.foot !== footKey) {
        c.foot = footKey;
        $('.chat-foot', box).innerHTML = chatFootHtml(report, side);
        bindComposer(box, report, side);
    }
}

function bindComposer(box, report, side) {
    const input = $('#composer-input', box);
    const send = $('#composer-send', box);
    if (input && send) {
        const doSend = async () => {
            const text = input.value.trim();
            if (!text) return;
            send.classList.remove('fly');
            void send.offsetWidth;
            send.classList.add('fly');
            sfx.send();
            input.value = '';
            input.style.height = '';
            const ok = await act(side === 'staff' ? 'reports:send' : 'my:send', { id: report.id, text });
            if (!ok) input.value = text;
        };
        send.onclick = doSend;
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
        };
        input.oninput = () => {
            input.style.height = 'auto';
            input.style.height = Math.min(120, input.scrollHeight) + 'px';
            post('action', { name: 'typing', payload: { id: report.id } });
        };
    }
    const rate = $('#rate', box);
    if (rate) {
        const stars = $$('[data-star]', rate);
        stars.forEach((s) => {
            s.onmouseenter = () => stars.forEach((x) => x.classList.toggle('on', Number(x.dataset.star) <= Number(s.dataset.star)));
            s.onclick = async () => {
                if (await act('my:rate', { id: report.id, stars: Number(s.dataset.star) })) {
                    confettiAt(s, 90);
                    toast('success', t('thanks'), t('thanks_rate'), 'fa-solid fa-star');
                }
            };
        });
        rate.onmouseleave = () => stars.forEach((x) => x.classList.remove('on'));
    }
}

async function reportAction(report, action, side, btn) {
    if (action === 'delete' && !(await confirmBox(t('delete_report'), t('confirm_delete_report', report.id), 'fa-solid fa-trash'))) return;
    if (action === 'close' && side === 'player' && !(await confirmBox(t('mark_solved'), t('confirm_solved'), 'fa-solid fa-check-double', false))) return;
    const ok = await act(side === 'staff' ? 'reports:action' : 'my:close', { id: report.id, action });
    if (!ok) return;
    if (action === 'close') { confettiAt(btn, 120); sfx.on(); }
    if (action === 'claim') confettiAt(btn, 40);
    if (action === 'goto' || action === 'bring') toast('success', t('op_' + action), report.senderChar);
}

function onReportSync(report, meta = {}, asStaff) {
    if (asStaff) {
        upsertReport(report);
        const viewing = S.mode === 'admin' && S.page === 'reports' && S.activeReport === report.id;
        const fromPlayer = meta.kind === 'new' || (meta.kind === 'message' && !meta.fromStaff);
        if (fromPlayer && !viewing) S.unread.add(report.id);
        if (S.mode === 'admin' && S.page === 'reports') {
            renderReportList();
            if (S.activeReport === report.id) updateChat($('#rchat'), report, 'staff');
            const row = $(`.report-row[data-rid="${report.id}"]`);
            if (row && !viewing) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
        }
        if (S.mode === 'admin' && S.page === 'dashboard') { const box = $('#dash-reports'); if (box) { box.innerHTML = recentReportsHtml(); bindDashReports(box); } }
        updateBadge();
        if (meta.kind === 'new' && meta.by !== S.me.name && report.type !== 'dm') {
            sfx.notify();
            toast('report', t('toast_new_report', report.id), `${report.senderChar}: ${report.subject}`, 'fa-solid fa-bell', 7000);
        } else if (meta.kind === 'message' && !meta.fromStaff && !viewing) {
            sfx.notify();
            const last = report.messages[report.messages.length - 1];
            toast('report', t('toast_new_msg', report.id), `${last?.name}: ${last?.text}`, 'fa-solid fa-comment-dots', 6000);
        }
        return;
    }

    upsertReport(report, S.my.reports);
    const viewing = S.mode === 'player' && S.my.active === report.id;
    const fromStaff = meta.fromStaff;
    if (fromStaff && !viewing) S.my.unread.add(report.id);
    if (S.mode === 'player') {
        renderMyList();
        if (viewing) updateChat($('#pw-main'), report, 'player');
    }
    if (fromStaff && !viewing) {
        sfx.notify();
        const last = report.messages[report.messages.length - 1];
        if (meta.kind === 'new') toast('report', t('toast_dm', meta.by), last?.text || '', 'fa-solid fa-envelope', 9000);
        else if (meta.kind === 'message') toast('report', t('toast_reply', report.id), `${last?.name}: ${last?.text}\n${S.mode ? '' : t('toast_open_hint')}`, 'fa-solid fa-comment-dots', 8000);
        else if (meta.kind === 'status' && report.status === 'closed') toast('success', t('toast_closed', report.id), t('toast_closed_desc'), 'fa-solid fa-circle-check', 7000);
    }
}

function onReportRemoved(id) {
    S.reports = S.reports.filter((r) => r.id !== id);
    S.my.reports = S.my.reports.filter((r) => r.id !== id);
    S.unread.delete(id);
    updateBadge();
    if (S.mode === 'admin' && S.page === 'reports') {
        if (S.activeReport === id) S.activeReport = null;
        renderReportList();
        renderStaffChat();
    }
    if (S.mode === 'player') {
        if (S.my.active === id) S.my.active = null;
        renderPlayerWindow();
    }
}

const typingTimers = {};
function onTyping(id, name) {
    const box = S.mode === 'admin' ? $('#rchat') : $('#pw-main');
    if (!box || !box._chat || box._chat.id !== id) return;
    const tp = $('.typing', box);
    if (!tp) return;
    $('.tname', tp).textContent = t('is_typing', name);
    tp.classList.add('show');
    clearTimeout(typingTimers[id]);
    typingTimers[id] = setTimeout(() => tp.classList.remove('show'), 3000);
}

async function renderPlayerWindow() {
    $('#pw-title').textContent = t('support');
    $('#pw-sub').textContent = t('support_desc');
    const body = $('#pw-body');
    body.innerHTML = `
        <div class="pane">
            <button class="btn primary block" id="pw-new"><i class="fa-solid fa-plus"></i>${esc(t('new_report'))}</button>
            <div class="rlist" id="pw-list"><div class="loader"><span></span><span></span><span></span></div></div>
        </div>
        <div class="pane" id="pw-main" style="min-height:0"></div>`;
    $('#pw-new').onclick = () => { S.my.active = null; renderMyList(); renderNewReport(); };
    const list = await act('my:list');
    S.my.reports = Array.isArray(list) ? list : [];
    if (S.my.active && !S.my.reports.find((r) => r.id === S.my.active)) S.my.active = null;
    if (!S.my.active) {
        const firstOpen = S.my.reports.find((r) => r.status !== 'closed');
        if (firstOpen) S.my.active = firstOpen.id;
    }
    renderMyList();
    if (S.my.active) openMyReport(S.my.active); else renderNewReport();
}

function renderMyList() {
    const box = $('#pw-list');
    if (!box) return;
    box.innerHTML = S.my.reports.length
        ? S.my.reports.map((r, i) => reportRowHtml(r, i, r.id === S.my.active, S.my.unread.has(r.id))).join('')
        : `<div class="empty"><i class="fa-solid fa-face-smile-beam"></i>${esc(t('my_no_reports'))}</div>`;
    $$('[data-rid]', box).forEach((row) => (row.onclick = () => openMyReport(Number(row.dataset.rid))));
}

function openMyReport(id) {
    const r = S.my.reports.find((x) => x.id === id);
    if (!r) return renderNewReport();
    S.my.active = id;
    S.my.unread.delete(id);
    renderMyList();
    const main = $('#pw-main');
    main._chat = null;
    updateChat(main, r, 'player');
}

function renderNewReport() {
    const main = $('#pw-main');
    main._chat = null;
    const cats = S.config.categories || [];
    if (!S.my.cat && cats[0]) S.my.cat = cats[0].id;
    main.innerHTML = `
        <div class="chat" style="padding:20px">
            <div class="new-form">
                <div>
                    <div class="section-title" style="margin-top:0"><i class="fa-solid fa-layer-group"></i>${esc(t('category'))}</div>
                    <div class="cat-grid stagger">
                        ${cats.map((c) => `<button class="cat-card ${S.my.cat === c.id ? 'active' : ''}" data-cat="${esc(c.id)}" style="--c:${esc(c.color)}"><i class="${esc(c.icon)}"></i>${esc(c.label)}</button>`).join('')}
                    </div>
                </div>
                <div class="field"><label>${esc(t('subject'))}</label><input class="input" id="nr-subject" maxlength="60" placeholder="${esc(t('subject_placeholder'))}"></div>
                <div class="field"><label>${esc(t('message'))}</label><textarea class="input" id="nr-message" maxlength="500" style="min-height:110px" placeholder="${esc(t('message_placeholder'))}"></textarea><div class="counter" id="nr-count">0 / 500</div></div>
            </div>
            <button class="btn primary block" id="nr-send" style="height:46px;flex:none;margin-top:14px"><i class="fa-solid fa-paper-plane"></i>${esc(t('send_report'))}</button>
        </div>`;
    stagger(main);
    $$('[data-cat]', main).forEach((b) => (b.onclick = () => {
        S.my.cat = b.dataset.cat;
        $$('[data-cat]', main).forEach((x) => x.classList.toggle('active', x === b));
    }));
    const msg = $('#nr-message');
    msg.oninput = () => ($('#nr-count').textContent = `${msg.value.length} / 500`);
    $('#nr-send').onclick = async (e) => {
        const btn = e.currentTarget;
        const message = msg.value.trim();
        if (!message) {
            msg.style.boxShadow = 'inset 0 0 0 1px var(--danger)';
            sfx.error();
            return;
        }
        btn.disabled = true;
        const report = await act('my:create', { category: S.my.cat, subject: $('#nr-subject').value.trim(), message });
        btn.disabled = false;
        if (!report || typeof report !== 'object') return;
        confettiAt(btn, 140);
        sfx.notify();
        upsertReport(report, S.my.reports);
        openMyReport(report.id);
    };
}

window.addEventListener('message', ({ data }) => {
    if (!data || !data.action) return;
    switch (data.action) {
        case 'setup':
            S.config = { ...S.config, ...data.config };
            S.locales = data.locales || {};
            S.lang = data.lang || 'en';
            document.documentElement.lang = S.lang;
            setAccent(S.config.accent, S.config.gradient);
            $('#brand-name').textContent = S.config.brandName || 'QBOX';
            $('#brand-sub').textContent = S.config.brandSubtitle || '';
            setBrandLogo(S.config.brandLogo);
            document.body.classList.toggle('no-fx', !S.config.fancyBackground);
            break;
        case 'open':
            if (data.mode === 'admin') openAdmin(data.data, data.state);
            else openPlayerWindow(data.data);
            break;
        case 'close':
            closeUI(false);
            break;
        case 'state':
            S.state = data.state || {};
            syncToggles();
            break;
        case 'reportSync':
            onReportSync(data.report, data.meta, data.asStaff);
            break;
        case 'reportRemoved':
            onReportRemoved(data.id);
            break;
        case 'reportTyping':
            onTyping(data.id, data.name);
            break;
    }
});

$('#btn-close').onclick = () => closeUI(true);
$('#pw-close').onclick = () => closeUI(true);
$('#btn-refresh').onclick = async (e) => {
    const ico = $('i', e.currentTarget);
    ico.style.transition = 'transform .8s var(--spring)';
    ico.style.transform = `rotate(${(Number(ico.dataset.r) || 0) + 360}deg)`;
    ico.dataset.r = (Number(ico.dataset.r) || 0) + 360;
    const data = await post('refresh');
    if (data && typeof data === 'object') {
        S.panel = data;
        S.perms = data.perms || S.perms;
        $('#top-players').textContent = `${data.server.players}/${data.server.maxPlayers}`;
    }
    S.vehicles = null;
    await loadReports();
    rerender();
};

setInterval(() => {
    $('#top-clock').textContent = new Date().toLocaleTimeString(S.lang, { hour: '2-digit', minute: '2-digit' });
    $$('[data-ago]').forEach((s) => (s.textContent = ago(Number(s.dataset.ago))));
}, 1000);
window.addEventListener('resize', () => { moveIndicator(); if (FX.running) { FX.stop(); setTimeout(() => FX.start(), 50); } });

const Mock = {
    state: {},
    reports: [],
    async handle(name, payload) {
        await sleep(120);
        if (name !== 'action') return true;
        const { name: a, payload: p = {} } = payload;
        const now = Math.floor(Date.now() / 1000);
        const toggles = { 'self:noclip': 'noclip', 'self:godmode': 'godmode', 'self:invisible': 'invisible', 'self:vehGodmode': 'vehGodmode', 'self:infAmmo': 'infAmmo', 'dev:coords': 'coords', 'dev:vehInfo': 'vehInfo' };
        if (toggles[a]) return (this.state[toggles[a]] = !this.state[toggles[a]]);
        if (a === 'self:names' || a === 'self:blips') {
            const k = a.split(':')[1];
            this.state[k] = !this.state[k];
            setTimeout(() => window.postMessage({ action: 'state', state: { ...S.state, [k]: this.state[k] } }), 200);
            return true;
        }
        if (a === 'players:list') return Array.from({ length: 14 }, (_, i) => this.player(i + 1));
        if (a === 'players:get') return this.player(p.id);
        if (a === 'vehicles:list') return ['adder', 'zentorno', 't20', 'sultan', 'elegy', 'banshee', 'comet2', 'kuruma', 'bati', 'sanchez', 'police', 'ambulance', 'mesa', 'bison', 'buzzard', 'frogger'].map((m, i) => ({ model: m, name: m.charAt(0).toUpperCase() + m.slice(1), brand: ['Truffade', 'Pegassi', 'Progen', 'Karin', 'Annis'][i % 5], category: ['super', 'sports', 'motorcycles', 'emergency', 'helicopters'][i % 5], price: 100000 }));
        if (a === 'vehicles:current') return { name: 'Adder', plate: 'QBOX 123', engine: 92, body: 81, fuel: 64 };
        if (a === 'dev:live') return { x: 215.76 + Math.random(), y: -810.12, z: 30.73, h: 157.4, street: 'Vespucci Blvd', zone: 'Pillbox Hill', interior: 0, vehicle: null };
        if (a === 'dev:copy') return 'vec4(215.76, -810.12, 29.73, 157.4)';
        if (a === 'offline:list' || a === 'offline:get') {
            const all = [['Tony Montana', 'TNY10293', 3600], ['Lena Fox', 'LNF55821', 86400 * 2], ['Omar Haddad', 'OMH90012', 86400 * 9], ['Sara Lee', 'SRL33310', 300]].map(([name, cid, ago]) => ({ citizenid: cid, license: 'license:' + cid.toLowerCase() + 'ff00', playerName: name.split(' ')[0].toLowerCase(), name, phone: '5550199', cash: 1200, bank: 85000, job: 'Mechanic | 1', gang: 'No Gang', lastSeen: now - ago }));
            if (a === 'offline:get') return all.find((x) => x.citizenid === p.citizenid);
            const q = (p.search || '').toLowerCase();
            return all.filter((x) => !q || (x.name + x.citizenid).toLowerCase().includes(q));
        }
        if (a === 'offline:money' || a === 'offline:ban') return true;
        if (a === 'peds:list') return { peds: ['a_c_chimp', 'a_c_husky', 'a_c_mtlion', 'a_f_y_beach_01', 'a_f_y_business_01', 'a_m_y_business_01', 'a_m_y_hipster_01', 'g_m_y_ballaeast_01', 'g_m_y_famca_01', 'ig_lamardavis', 'mp_m_freemode_01', 's_m_y_cop_01', 's_m_m_paramedic_01', 's_m_y_fireman_01', 'u_m_y_zombie_01', 'u_m_m_jesus_01'], persistent: true };
        if (a === 'peds:give') return true;
        if (a === 'bans:list') {
            this.bansData ||= [
                { id: 7, name: 'xX_Rammer_Xx', license: 'license:9f8e7d6c5b4a', discord: 'discord:1122334455', reason: 'VDM + RDM at Legion', expire: now + 3 * 86400 + 5 * 3600, bannedby: 'BazuFix', active: true },
                { id: 6, name: 'cheater123', license: 'license:aa11bb22cc33', reason: 'Mod menu', expire: 2147483647, permanent: true, bannedby: 'OtherAdmin', active: true },
                { id: 3, name: 'Old Guy', license: 'license:ffeeddccbbaa', reason: 'Fail RP', expire: now - 86400, bannedby: 'BazuFix', active: false },
            ];
            return { bans: this.bansData, now };
        }
        if (a === 'bans:unban') { this.bansData = this.bansData.filter((b) => b.id !== p.id); return 'ok'; }
        if (a === 'players:ckLookup') return { citizenid: String(p.target).toUpperCase(), name: 'Mia Wong', online: true, id: 4 };
        if (a === 'players:ckExecute') return 'Mia Wong';
        if (a === 'economy:get') {
            const names = ['Tony Montana', 'Mia Wong', 'Carlos Ruiz', 'John Doe', 'Jane Smith', 'Ali Kaya', 'Emma Stone', 'Luca Rossi', 'Noah Berg', 'Zeynep Ak'];
            const top = names.map((n, i) => { const bank = Math.round(4800000 / (i + 1.3)), cash = Math.round(bank * 0.08); return { citizenid: 'ABC' + (100 + i), name: n, online: i % 3 === 1, id: i % 3 === 1 ? i + 1 : null, cash, bank, total: cash + bank }; });
            return { totals: { total: 18450000, cash: 1620000, bank: 16830000, characters: 342, average: 53947, onlineCount: 14 }, top, moneyTypes: ['cash', 'bank'], updatedAt: Math.floor(Date.now() / 1000) - 12 };
        }
        if (a === 'server:radio') return [{ id: 3, name: 'John Doe | (johnny)' }];
        if (a === 'reports:list' || a === 'my:list') return this.reports;
        if (a === 'my:create') {
            const r = { id: this.reports.length + 1, type: 'report', category: p.category, subject: p.subject || p.message.slice(0, 40), status: 'open', senderId: 1, senderName: 'preview', senderChar: 'Preview User', senderOnline: true, createdAt: now, updatedAt: now, messages: [{ id: Date.now(), from: 'player', name: 'Preview User', authorId: 1, text: p.message, time: now }] };
            this.reports.unshift(r);
            return r;
        }
        if (a === 'reports:send' || a === 'my:send') {
            const r = this.reports.find((x) => x.id === p.id);
            const staff = a === 'reports:send';
            r.messages.push({ id: Date.now(), from: staff ? 'staff' : 'player', name: staff ? S.me.name : r.senderChar, authorId: 1, text: p.text, time: now });
            r.updatedAt = now;
            setTimeout(() => window.postMessage({ action: 'reportSync', report: JSON.parse(JSON.stringify(r)), meta: { kind: 'message', fromStaff: staff }, asStaff: S.mode === 'admin' }), 100);
            return true;
        }
        if (a === 'reports:action' || a === 'my:close') {
            const r = this.reports.find((x) => x.id === p.id);
            if (!r) return true;
            const action = a === 'my:close' ? 'close' : p.action;
            if (action === 'delete') { this.reports = this.reports.filter((x) => x !== r); setTimeout(() => window.postMessage({ action: 'reportRemoved', id: r.id }), 50); return true; }
            if (action === 'claim') { r.status = 'claimed'; r.claimedBy = { id: 1, name: S.me.name }; r.messages.push({ id: Date.now(), from: 'system', text: 'claimed:' + S.me.name, time: now }); }
            if (action === 'unclaim') { r.status = 'open'; r.claimedBy = null; r.messages.push({ id: Date.now(), from: 'system', text: 'unclaimed', time: now }); }
            if (action === 'close') { r.status = 'closed'; r.messages.push({ id: Date.now(), from: 'system', text: 'closed:' + S.me.name, time: now }); }
            if (action === 'reopen') { r.status = r.claimedBy ? 'claimed' : 'open'; r.messages.push({ id: Date.now(), from: 'system', text: 'reopened:' + S.me.name, time: now }); }
            setTimeout(() => window.postMessage({ action: 'reportSync', report: JSON.parse(JSON.stringify(r)), meta: { kind: 'status' }, asStaff: S.mode === 'admin' }), 50);
            return true;
        }
        if (a === 'my:rate') { const r = this.reports.find((x) => x.id === p.id); r.rating = p.stars; setTimeout(() => window.postMessage({ action: 'reportSync', report: JSON.parse(JSON.stringify(r)), meta: { kind: 'rating' }, asStaff: false }), 50); return true; }
        return true;
    },
    player(id) {
        const names = ['John Doe', 'Jane Smith', 'Carlos Ruiz', 'Mia Wong', 'Ali Kaya', 'Emma Stone', 'Luca Rossi', 'Noah Berg', 'Zeynep Ak', 'Ivan Petrov', 'Sara Lee', 'Tom Hardy', 'Lena Fox', 'Omar Haddad'];
        const n = names[(id - 1) % names.length];
        return { id, cid: 'ABC' + (1000 + id), name: `${n} | (user${id})`, charName: n, playerName: 'user' + id, food: 40 + id * 3, water: 70, stress: id * 4, armor: 50, phone: '555-01' + id, craftingrep: 10, dealerrep: 3, cash: 1500 * id, bank: 25000 * id, job: 'Police | 2', jobName: 'police', gang: 'None', radio: 0, ping: 30 + id * 12, bucket: 0, frozen: false, health: 180, license: 'license:abcdef' + id, discord: 'discord:12345' + id, steam: 'Not Linked' };
    },
    async boot() {
        document.body.classList.add('preview');
        if (new URLSearchParams(location.search).get('static')) document.body.classList.add('no-anim');
        let locales = {};
        try {
            const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) typeof v === 'object' ? flat(v, p + k + '.', out) : (out[p + k] = v); return out; };
            locales = flat(await (await fetch('../locales/en.json')).json());
        } catch (e) { /* opened from file:// */ }
        const now = Math.floor(Date.now() / 1000);
        this.reports = [
            { id: 2, type: 'report', category: 'player', subject: 'Someone keeps ramming my car', status: 'open', senderId: 4, senderName: 'mia', senderChar: 'Mia Wong', senderOnline: true, createdAt: now - 300, updatedAt: now - 120, messages: [{ id: 1, from: 'player', name: 'Mia Wong', authorId: 4, text: 'ID 7 has been ramming me at Legion Square for 5 minutes.', time: now - 300 }, { id: 2, from: 'player', name: 'Mia Wong', authorId: 4, text: 'Please help 🙏', time: now - 120 }] },
            { id: 1, type: 'report', category: 'stuck', subject: 'Stuck under the map', status: 'claimed', senderId: 2, senderName: 'jane', senderChar: 'Jane Smith', senderOnline: true, claimedBy: { id: 99, name: 'OtherAdmin' }, createdAt: now - 900, updatedAt: now - 600, messages: [{ id: 3, from: 'player', name: 'Jane Smith', authorId: 2, text: 'I fell through the map near the airport', time: now - 900 }, { id: 4, from: 'system', text: 'claimed:OtherAdmin', time: now - 700 }, { id: 5, from: 'staff', name: 'OtherAdmin', authorId: 99, text: 'On my way!', time: now - 600 }] },
        ];
        window.postMessage({
            action: 'setup',
            locales,
            lang: 'en',
            config: {
                accent: '#8b5cf6', brandName: 'QBOX', brandSubtitle: 'Admin Panel', sounds: true, fancyBackground: true,
                categories: [
                    { id: 'general', label: 'General', icon: 'fa-solid fa-circle-question', color: '#60a5fa' },
                    { id: 'player', label: 'Player Report', icon: 'fa-solid fa-user-shield', color: '#f87171' },
                    { id: 'bug', label: 'Bug', icon: 'fa-solid fa-bug', color: '#fbbf24' },
                    { id: 'stuck', label: 'Stuck / Help', icon: 'fa-solid fa-life-ring', color: '#34d399' },
                    { id: 'other', label: 'Other', icon: 'fa-solid fa-ellipsis', color: '#c084fc' },
                ],
            },
        });
        const params = new URLSearchParams(location.search);
        const mode = params.get('mode') || 'admin';
        if (params.get('page')) S.page = params.get('page');
        if (params.get('select')) S.selected = { id: Number(params.get('select')) };
        if (params.get('report')) S.activeReport = Number(params.get('report'));
        if (params.get('picker')) setTimeout(() => pedPicker('Mia Wong'), 1500);
        if (params.get('pmode')) S.playerMode = params.get('pmode');
        if (params.get('cid')) setTimeout(() => selectOffline(params.get('cid')), 1200);
        setTimeout(() => window.postMessage({
            action: 'open', mode,
            data: { me: { id: 1, name: 'Preview' }, perms: Object.fromEntries(['reports', 'noclip', 'names', 'blips', 'saveVehicle', 'setModel', 'dev', 'general', 'kick', 'ban', 'changePerms', 'changePlayerData', 'giveAllWeapons', 'radioList', 'clothing', 'startDm', 'economy', 'characterKill', 'bans', 'offlinePlayers', 'givePed'].map((k) => [k, true])), server: { name: 'Qbox Preview', players: 14, maxPlayers: 64, uptime: 18500, reports: {} } },
            state: {},
        }), 300);
    },
};

if (IS_GAME) post('ready');
else Mock.boot();
