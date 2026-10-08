/* GéoCliché — interface : dossiers, viseur, prise de vue, annotation et métrés, photos, récap, carte, réglages, exports */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const G = window.Geo, Camera = window.Camera, DB = window.DB, Photo = window.Photo, Exports = window.Exports;
  const esc = Exports.esc;
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const TYPE = { photo: 'Photo seule', annotation: 'Annotation', metres: 'Métrés' };
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

  // ------------------------------------------------------------------ réglages
  const KEY = 'geocliche.settings';
  const S = Object.assign({ crs: 'L93', operateur: '', quality: 0.85, lens: null, dossierId: null }, readSettings());
  function readSettings() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } }

  // ------------------------------------------------------------------ état
  const live = { pos: null, err: null, addr: { label: '', lat: null, lon: null, t: 0 }, addrBusy: false, watch: null };
  let screen = 'dossier', mapReturn = 'gallery', recapReturn = 'cam', detailReturn = 'gallery';
  let recapDossier = null, recapTab = 'f';
  let photos = [], dossiers = [];
  const thumbUrls = new Map();
  let filter = '__all', selecting = false;
  const sel = new Set();

  const WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  const BASES = [
    { name: 'Plan IGN', url: WMTS + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png', o: { maxNativeZoom: 19, maxZoom: 21, attribution: '© IGN' } },
    { name: 'Photo aérienne IGN', url: WMTS + '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg', o: { maxNativeZoom: 19, maxZoom: 21, attribution: '© IGN' } },
    { name: 'OSM France', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', o: { subdomains: 'abc', maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap France, © contributeurs OSM' } },
    { name: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', o: { subdomains: 'abc', maxNativeZoom: 17, maxZoom: 21, attribution: '© OpenStreetMap, SRTM, © OpenTopoMap' } }
  ];

  // ------------------------------------------------------------------ messages et fenêtres
  let toastT = 0, modalClose = null;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), ms || 2400);
  }
  /** Fenêtre générique. o = { title, html, ok, cancel (texte ou false), danger, onOpen(body), validate(body) → valeur ou false } */
  function form(o) {
    return new Promise((res) => {
      $('#modalTitle').textContent = o.title;
      const body = $('#modalBody'), box = $('#modalActions');
      body.innerHTML = o.html || '';
      box.innerHTML = '';
      const close = (v) => { $('#modal').hidden = true; modalClose = null; body.onkeydown = null; body.innerHTML = ''; res(v); };
      const mk = (label, cls, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn;
        box.appendChild(b);
        return b;
      };
      if (o.cancel !== false) mk(o.cancel || 'Annuler', 'ghost-dark', () => close(null));
      const okBtn = mk(o.ok || 'Valider', o.danger ? 'danger' : '', () => {
        const v = o.validate ? o.validate(body) : true;
        if (v === false || v == null) return;
        close(v);
      });
      modalClose = () => close(null);
      body.onkeydown = (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); okBtn.click(); } };
      $('#modal').hidden = false;
      if (o.onOpen) o.onOpen(body);
      const first = Array.from(body.querySelectorAll('input, textarea')).find((i) => i.offsetParent !== null);
      setTimeout(() => (first || okBtn).focus(), 60);
    });
  }
  const confirmBox = (title, text, ok, danger) => form({ title, html: `<p>${esc(text)}</p>`, ok, danger }).then((v) => !!v);
  function prompt(title, value, opts) {
    opts = opts || {};
    return form({
      title, ok: opts.ok || 'Valider',
      html: `<input class="prompt-in" type="text" autocomplete="off" value="${esc(value || '')}" placeholder="${esc(opts.placeholder || '')}">`,
      validate: (b) => b.querySelector('input').value
    });
  }
  function locHelp() {
    return form({
      title: 'Autoriser la position', ok: 'Compris', cancel: false,
      html: '<p>Sur iPhone, Safari doit avoir accès à la position exacte :</p><ol>' +
        '<li>Réglages, Confidentialité et sécurité, Service de localisation : activé.</li>' +
        '<li>Dans la même page, Sites web Safari : « Lorsque l’app est active ».</li>' +
        '<li>Activez « Position exacte ».</li></ol>' +
        '<p>Revenez ensuite dans l’appli et rechargez-la. Si elle est installée sur l’écran d’accueil, fermez-la puis rouvrez-la.</p>'
    });
  }
  window.UI = { form, prompt, confirm: confirmBox, toast, esc };

  function fmtSize(b) {
    if (!b) return '0 Ko';
    if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' Ko';
    if (b < 1073741824) return (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' Mo';
    return (b / 1073741824).toFixed(1).replace('.', ',') + ' Go';
  }
  function thumbUrl(p) {
    if (!p.thumb) return '';
    if (!thumbUrls.has(p.id)) thumbUrls.set(p.id, URL.createObjectURL(p.thumb));
    return thumbUrls.get(p.id);
  }
  function lite(p) { const o = Object.assign({}, p); delete o.blob; return o; }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60000);
  }
  async function shareFile(blob, name) {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); }
      catch (e) { if (e.name !== 'AbortError') { toast('Partage impossible ici, le fichier est enregistré à la place.'); download(blob, name); } }
    } else download(blob, name);
  }
  function setSeg(s, v) { $$(s + ' button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(v)))); }

  // ------------------------------------------------------------------ dossiers
  const cur = () => dossiers.find((d) => d.id === S.dossierId) || null;
  const dossierOf = (id) => dossiers.find((d) => d.id === id) || null;
  function newDossier(chantier, operateur) {
    const t = Date.now();
    return { id: uid(), chantier, operateur, created: t, updated: t, fournitures: [] };
  }
  async function saveDossier(d) { d.updated = Date.now(); await DB.putDossier(d); }
  function stats(d) {
    const P = photos.filter((p) => p.dossierId === d.id);
    return {
      n: P.length,
      m: P.reduce((s, p) => s + (p.metres ? p.metres.length : 0), 0),
      last: P.reduce((a, p) => Math.max(a, p.ts), d.updated || d.created || 0)
    };
  }
  const byActivity = () => dossiers.slice().sort((a, b) => stats(b).last - stats(a).last);
  function renderDossierScreen() {
    const d = cur();
    $('#dosResumeBox').hidden = !d;
    $('#dosCreate').classList.toggle('ghost-dark', !!d);
    if (d) {
      const s = stats(d);
      $('#dosResName').textContent = d.chantier;
      $('#dosResMeta').textContent = [d.operateur, plural(s.n, 'photo'), s.m ? plural(s.m, 'métré') : '',
        'dernière activité le ' + G.dateFR(s.last)].filter(Boolean).join(', ');
    }
    $('#dosChantier').value = '';
    $('#dosOperateur').value = (d && d.operateur) || S.operateur || '';
    $('#dosErr').hidden = true;
    const others = byActivity().filter((x) => !d || x.id !== d.id);
    $('#dosOthersT').hidden = !others.length;
    $('#dosOthers').hidden = !others.length;
    $('#dosOthers').innerHTML = others.map((x) => {
      const s = stats(x);
      return `<button type="button" class="row-btn dos-row" data-id="${x.id}"><span><b>${esc(x.chantier)}</b>` +
        `<small>${esc([x.operateur, plural(s.n, 'photo'), G.dateFR(s.last)].filter(Boolean).join(', '))}</small></span>` +
        '<svg class="ic"><use href="#i-chev"/></svg></button>';
    }).join('');
  }
  function renderDossierChip() { const d = cur(); $('#hDossierName').textContent = d ? d.chantier : 'Choisir un dossier'; }
  function askCompass() { if (G.Compass.needsPermission && !G.Compass.started) G.Compass.request().then((ok) => { if (ok) startCompass(); }); }
  function useDossier(d) {
    S.dossierId = d.id;
    if (d.operateur) S.operateur = d.operateur;
    save();
    filter = d.id; selecting = false; sel.clear();
    renderDossierChip();
    updateCounts();
    go('cam');
  }
  async function createDossier() {
    const ch = $('#dosChantier').value.trim(), op = $('#dosOperateur').value.trim();
    if (!ch) {
      const e = $('#dosErr');
      e.textContent = 'Indiquez le nom du chantier.'; e.hidden = false;
      $('#dosChantier').focus();
      return;
    }
    const d = newDossier(ch, op);
    dossiers.push(d);
    await saveDossier(d);
    useDossier(d);
  }

  // ------------------------------------------------------------------ navigation
  function go(name) {
    if (name === screen) return;
    const prev = screen;
    $$('.screen').forEach((s) => s.classList.toggle('on', s.id === 'scr-' + name));
    screen = name;
    if (name !== 'detail') releaseDetail();
    if (name === 'annot') $('#toast').classList.remove('on');
    if (name === 'cam') {
      if (!cur()) { go('dossier'); return; }
      startCamera(); Mini.refresh(); renderHud();
    } else if (prev === 'cam') stopCameraSoon();
    if (name === 'dossier') renderDossierScreen();
    if (name === 'gallery') renderGallery();
    if (name === 'settings') renderSettings();
    if (name === 'recap') renderRecap();
    if (name === 'map') BigMap.open();
  }
  function openMap(from, focusId) { mapReturn = from; BigMap.focusId = focusId || null; go('map'); }
  function openRecap(from) {
    recapReturn = from;
    recapDossier = from === 'gallery' && filter !== '__all' ? filter : S.dossierId;
    go('recap');
  }

  // ------------------------------------------------------------------ GPS et adresse
  function startGeo() {
    if (!('geolocation' in navigator)) { live.err = { code: 0 }; renderHud(); return; }
    if (live.watch != null) navigator.geolocation.clearWatch(live.watch);
    live.watch = navigator.geolocation.watchPosition(onPos, (e) => { live.err = e; renderHud(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function onPos(p) {
    const c = p.coords;
    live.pos = Object.assign({
      lat: c.latitude, lon: c.longitude, alt: G.ok(c.altitude) ? c.altitude : null, acc: c.accuracy,
      altAcc: G.ok(c.altitudeAccuracy) ? c.altitudeAccuracy : null, t: Date.now()
    }, G.both(c.longitude, c.latitude));
    live.err = null;
    renderHud();
    maybeAddress();
    Mini.update();
    if (screen === 'map') BigMap.drawMe();
  }
  async function maybeAddress(force) {
    const p = live.pos;
    if (!p || live.addrBusy || (!navigator.onLine && !force)) return;
    const a = live.addr, now = Date.now();
    const moved = a.lat == null ? Infinity : G.haversine(a.lat, a.lon, p.lat, p.lon);
    if (!force && (now - a.t < 6000 || (moved < 25 && now - a.t < 180000))) return;
    live.addrBusy = true;
    try {
      const label = await G.reverse(p.lat, p.lon, 5000);
      if (label) live.addr = { label, lat: p.lat, lon: p.lon, t: Date.now() };
      else { live.addr.t = Date.now(); if (moved > 150) live.addr.label = ''; }
    } finally {
      live.addrBusy = false;
      renderHud();
    }
  }
  function addrFor(p) {
    const a = live.addr;
    return a.label && a.lat != null && p && G.haversine(a.lat, a.lon, p.lat, p.lon) < 40 ? a.label : '';
  }
  function renderHud() {
    const p = live.pos, main = S.crs, oth = G.other(main), acc = $('#hAcc');
    $('#hCrs').textContent = G.CRS[main].label;
    if (p) {
      const a = G.xy(p, main), b = G.xy(p, oth);
      $('#hX').textContent = G.fmt(a.x, 2);
      $('#hY').textContent = G.fmt(a.y, 2);
      $('#hOther').textContent = `${G.CRS[oth].label}   X ${G.fmt(b.x, 2)}   Y ${G.fmt(b.y, 2)}`;
      $('#hZ').textContent = p.alt == null ? '—' : G.fmt(p.alt, 1) + ' m';
      acc.textContent = '±' + (p.acc < 10 ? G.fmt(p.acc, 1) : String(Math.round(p.acc))) + ' m';
      acc.dataset.q = p.acc <= 5 ? 'ok' : p.acc <= 15 ? 'mid' : 'bad';
    } else {
      $('#hX').textContent = '—'; $('#hY').textContent = '—'; $('#hZ').textContent = '—';
      $('#hOther').textContent = '';
      acc.textContent = '± — m'; acc.dataset.q = 'none';
    }
    $('#hAddr').textContent = addrFor(p) || (!p ? 'En attente du GPS…' : navigator.onLine ? 'Recherche de l’adresse…' : 'Adresse indisponible hors connexion');
    const b = $('#gpsBanner');
    b.dataset.k = '';
    if (live.err && live.err.code === 1) {
      b.hidden = false; b.classList.remove('soft'); b.dataset.k = 'denied';
      b.textContent = 'Position refusée. Touchez ici pour voir comment l’autoriser.';
    } else if (live.err && live.err.code === 0) {
      b.hidden = false; b.classList.remove('soft');
      b.textContent = 'Ce navigateur ne fournit pas la position GPS.';
    } else if (live.err && (!p || Date.now() - p.t > 60000)) {
      b.hidden = false; b.classList.add('soft');
      b.textContent = 'Signal GPS faible. Placez-vous à découvert, loin des façades.';
    } else b.hidden = true;
    placeBanner();
  }
  function placeBanner() {
    const h = $('.hud').getBoundingClientRect();
    if (h.height) $('#gpsBanner').style.top = Math.round(h.bottom + 8) + 'px';
  }

  // ------------------------------------------------------------------ cap
  function renderCap(h) {
    const btn = $('#hCapBtn');
    if (G.Compass.needsPermission && !G.Compass.started) { btn.classList.add('need'); $('#hCap').textContent = 'activer'; return; }
    btn.classList.remove('need');
    $('#hCap').textContent = h == null ? '—' : `${Math.round(h)}° ${G.cardinal(h)}`;
  }
  function startCompass() { G.Compass.start((h) => renderCap(h)); renderCap(G.Compass.heading); }

  // ------------------------------------------------------------------ caméra
  let camStarting = null, camStopTimer = 0, wake = null;
  function startCamera() {
    clearTimeout(camStopTimer);
    if (Camera.active) { layoutCam(); keepAwake(true); return Promise.resolve(); }
    if (!camStarting) camStarting = doStart().finally(() => { camStarting = null; });
    return camStarting;
  }
  async function doStart() {
    if (!window.isSecureContext) return camFail({ name: 'Insecure' });
    if (!Camera.supported()) return camFail({ name: 'NotSupported' });
    try {
      await Camera.start(S.lens || undefined);
    } catch (e) {
      if (!S.lens) return camFail(e);
      S.lens = null; save();
      try { await Camera.start(); } catch (e2) { return camFail(e2); }
    }
    if (screen !== 'cam') { Camera.stop(); return; }
    $('#camErr').hidden = true;
    layoutCam();
    renderZoom();
    keepAwake(true);
    try { await Camera.listLenses(); } catch (e) { /* noms d'objectifs indisponibles */ }
    renderZoom();
  }
  function stopCameraSoon() {
    clearTimeout(camStopTimer);
    camStopTimer = setTimeout(() => { if (screen !== 'cam') { Camera.stop(); keepAwake(false); } }, 600);
  }
  function camFail(e) {
    const n = e && e.name;
    const msg = n === 'Insecure' ? 'La caméra n’est accessible que si l’appli est ouverte en https.'
      : n === 'NotAllowedError' || n === 'SecurityError' ? 'L’accès à la caméra est refusé. Sur iPhone : Réglages, Safari, Caméra, « Autoriser ». Vous pouvez aussi prendre la photo avec l’appareil photo du téléphone.'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'Aucune caméra arrière n’a été trouvée sur cet appareil.'
          : n === 'NotSupported' ? 'Ce navigateur ne donne pas accès à la caméra depuis une page web. Utilisez Safari sur iPhone, ou l’appareil photo du téléphone.'
            : `La caméra ne répond pas (${n || 'erreur inconnue'}). Fermez les autres applis qui l’utilisent puis réessayez.`;
    $('#camErrMsg').textContent = msg;
    $('#camErr').hidden = false;
  }
  async function keepAwake(on) {
    try {
      if (on && !wake && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      } else if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { wake = null; }
  }
  function layoutCam() {
    const vf = $('#vf'), v = $('#video'), W = window.innerWidth;
    const ar = (v.videoWidth || 3) / (v.videoHeight || 4);
    const top0 = $('.hud').getBoundingClientRect().bottom + 6;
    const bot0 = $('.cam-bar').getBoundingClientRect().top - 4;
    let w = W, h = W / ar, top;
    if (h <= bot0 - top0) top = top0 + (bot0 - top0 - h) / 2;
    else if (h <= bot0) top = (bot0 - h) / 2;
    else { h = bot0; w = h * ar; top = 0; }
    vf.style.width = w + 'px'; vf.style.height = h + 'px';
    vf.style.left = (W - w) / 2 + 'px'; vf.style.top = top + 'px';
    placeBanner();
  }
  function renderZoom() {
    const row = $('#zoomRow'), lenses = Camera.lenses, z = Camera.effZoom, base = Camera.hw ? Camera.hw.min : 1;
    const zTxt = String(Math.round(z * 10) / 10).replace('.', ',') + '×';
    row.innerHTML = '';
    const add = (label, on, aria, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = on ? 'on' : ''; b.textContent = label; b.setAttribute('aria-label', aria); b.onclick = fn;
      row.appendChild(b);
    };
    if (lenses.length) {
      lenses.forEach((l) => {
        const on = l.id === Camera.deviceId;
        add(on && Math.abs(z - base) > 0.05 ? zTxt : l.name, on, l.label, () => switchLens(l.id));
      });
      row.hidden = false;
    } else if (Math.abs(z - base) > 0.05) {
      add(zTxt, true, 'Revenir au zoom initial', () => queueZoom(base));
      row.hidden = false;
    } else row.hidden = true;
  }
  async function switchLens(id) {
    if (id === Camera.deviceId) { queueZoom(Camera.hw ? Camera.hw.min : 1); return; }
    S.lens = id; save();
    Camera.stop();
    await startCamera();
  }
  let zWant = null, zBusy = false;
  function queueZoom(z) { zWant = z; if (!zBusy) runZoom(); }
  async function runZoom() {
    zBusy = true;
    while (zWant != null) {
      const z = zWant; zWant = null;
      await Camera.setZoom(z);
      renderZoom();
      await new Promise((r) => requestAnimationFrame(r));
    }
    zBusy = false;
  }
  function bindPinch() {
    const vf = $('#vf');
    let pinch = null, lastTap = 0;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    vf.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) { pinch = { d: dist(e.touches), z: Camera.effZoom }; e.preventDefault(); }
    }, { passive: false });
    vf.addEventListener('touchmove', (e) => {
      if (pinch && e.touches.length === 2) { e.preventDefault(); queueZoom(pinch.z * dist(e.touches) / pinch.d); }
    }, { passive: false });
    vf.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 300) { queueZoom(Camera.hw ? Camera.hw.min : 1); lastTap = 0; } else lastTap = now;
      }
    });
    vf.addEventListener('wheel', (e) => { e.preventDefault(); queueZoom(Camera.effZoom * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
  }

  // ------------------------------------------------------------------ prise de vue
  let shooting = false, choiceResolve = null;
  function snapshot() {
    const p = live.pos ? Object.assign({}, live.pos) : null, d = cur();
    return {
      ts: Date.now(), pos: p, heading: G.ok(G.Compass.heading) ? G.Compass.heading : null, address: addrFor(p),
      chantier: d ? d.chantier : '', operateur: d ? (d.operateur || '') : '', crs: S.crs
    };
  }
  function flashFx() {
    const f = $('#flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
    if (navigator.vibrate) navigator.vibrate(15);
  }
  /** Fenêtre « Photo seule / Annotation / Métrés » avec l'aperçu. Résout le mode, ou null pour reprendre. */
  function chooseMode(canvas) {
    const pv = $('#choiceCanvas'), k = Math.min(1, 900 / Math.max(canvas.width, canvas.height));
    pv.width = Math.round(canvas.width * k);
    pv.height = Math.round(canvas.height * k);
    pv.getContext('2d').drawImage(canvas, 0, 0, pv.width, pv.height);
    $('#choice').hidden = false;
    return new Promise((res) => { choiceResolve = res; });
  }
  function closeChoice(v) {
    $('#choice').hidden = true;
    const c = $('#choiceCanvas');
    c.width = c.height = 0;
    const r = choiceResolve;
    choiceResolve = null;
    if (r) r(v);
  }
  async function ensureAddress(snap) {
    if (!snap.pos || snap.address || !navigator.onLine) return;
    const label = await G.reverse(snap.pos.lat, snap.pos.lon, 2500);
    if (label) {
      snap.address = label;
      live.addr = { label, lat: snap.pos.lat, lon: snap.pos.lon, t: Date.now() };
    }
  }
  async function capture(getCanvas) {
    const snap = snapshot();
    const canvas = await getCanvas();
    const addrP = ensureAddress(snap).catch(() => {});
    const mode = await chooseMode(canvas);
    if (!mode) { Photo.release(canvas); return; }
    await processCapture(canvas, snap, mode, addrP);
  }
  async function shoot() {
    if (shooting) return;
    if (!cur()) { go('dossier'); return; }
    if (!Camera.active) {
      if (camStarting) { toast('La caméra démarre…'); return; }
      $('#fileCam').click();
      return;
    }
    shooting = true;
    $('#btnShutter').classList.add('busy');
    flashFx();
    try {
      await capture(() => Camera.grab());
    } catch (e) {
      console.error(e);
      toast('La photo n’a pas été enregistrée : ' + ((e && e.message) || e), 5000);
    } finally {
      shooting = false;
      $('#btnShutter').classList.remove('busy');
    }
  }
  function uniqueName(name) {
    const used = new Set(photos.map((p) => p.name));
    let n = name, k = 2;
    while (used.has(n)) n = name.replace(/\.jpg$/i, `_${k++}.jpg`);
    return n;
  }
  async function processCapture(canvas, snap, mode, addrP) {
    const d = cur();
    if (addrP) await addrP;
    let extra = { comment: '', zone: snap.address || '', metres: [] };
    if (mode !== 'photo') {
      go('annot');
      const r = await window.Editor.open(canvas, { mode, zone: extra.zone, fournitures: d.fournitures });
      go('cam');
      if (!r) { Photo.release(canvas); toast('Photo abandonnée'); return; }
      extra = { comment: r.comment, zone: r.zone, metres: r.metres };
      if (r.newFournitures.length) d.fournitures.push(...r.newFournitures);
    }
    const rec = await Photo.build(canvas, snap, extra, S.quality);
    Photo.release(canvas);
    rec.dossierId = d.id;
    rec.mode = mode;
    rec.name = uniqueName(rec.name);
    await DB.put(rec);
    await saveDossier(d);
    photos.push(lite(rec));
    updateCounts();
    const p = snap.pos, n = (rec.metres || []).length;
    const what = mode === 'metres' ? `Photo et ${plural(n, 'métré')} enregistrés` : 'Photo enregistrée';
    if (!p) toast(what + ', sans position GPS', 3500);
    else if (Date.now() - p.t > 120000) toast(`${what}. Attention : position GPS vieille de ${Math.round((Date.now() - p.t) / 60000)} min`, 4500);
    else if (p.acc > 30) toast(`${what}, précision GPS faible (±${Math.round(p.acc)} m)`, 3500);
    else toast(what);
  }
  function updateCounts() {
    const P = photos.filter((p) => p.dossierId === S.dossierId);
    const n = P.length, c = $('#galCount'), img = $('#lastThumb');
    c.hidden = !n;
    c.textContent = n > 99 ? '99+' : String(n);
    const last = P.reduce((a, p) => (!a || p.ts > a.ts ? p : a), null);
    if (last && last.thumb) img.src = thumbUrl(last); else img.removeAttribute('src');
  }

  // ------------------------------------------------------------------ mini-carte du viseur
  const meIcon = () => L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  const Mini = {
    map: null, me: null,
    init() {
      if (!window.L) return;
      this.map = L.map('minimap', {
        zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false
      }).setView([46.6, 2.4], 5);
      L.tileLayer(BASES[0].url, { maxNativeZoom: 19, maxZoom: 19 }).addTo(this.map);
      this.me = L.marker([46.6, 2.4], { icon: meIcon(), interactive: false, keyboard: false });
    },
    update() {
      if (!this.map || !live.pos || screen !== 'cam') return;
      const ll = [live.pos.lat, live.pos.lon];
      this.me.setLatLng(ll);
      if (!this.map.hasLayer(this.me)) this.me.addTo(this.map);
      this.map.setView(ll, 17, { animate: false });
    },
    refresh() { if (this.map) setTimeout(() => { this.map.invalidateSize(); this.update(); }, 60); }
  };

  // ------------------------------------------------------------------ carte des photos
  const BigMap = {
    map: null, base: 0, group: null, me: null, acc: null, focusId: null, marks: new Map(),
    init() {
      this.map = L.map('bigmap', { zoomControl: false });
      const layers = {};
      BASES.forEach((b) => { layers[b.name] = L.tileLayer(b.url, b.o); });
      layers[BASES[0].name].addTo(this.map);
      L.control.layers(layers, null, { position: 'bottomleft' }).addTo(this.map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(this.map);
      this.map.on('baselayerchange', (e) => { this.base = Math.max(0, BASES.findIndex((b) => b.name === e.name)); });
      this.map.on('popupopen', (e) => {
        const b = e.popup.getElement().querySelector('[data-open]');
        if (b) b.onclick = () => openDetail(b.dataset.open, galleryOrder(), 'map');
      });
      this.group = L.layerGroup().addTo(this.map);
      this.map.setView([46.6, 2.4], 6);
    },
    open() {
      if (!this.map) this.init();
      setTimeout(() => { this.map.invalidateSize(); this.draw(); }, 40);
    },
    list() { return visible().filter((p) => G.ok(p.lat)); },
    draw() {
      this.group.clearLayers();
      this.marks.clear();
      const nums = numbering(), list = this.list();
      list.forEach((p) => {
        const n = nums.get(p.id), src = thumbUrl(p);
        const icon = L.divIcon({ className: '', html: `<div class="pm"><img src="${src}" alt=""><b>${n}</b></div>`, iconSize: [48, 48], iconAnchor: [24, 57], popupAnchor: [0, -54] });
        const m = L.marker([p.lat, p.lon], { icon, title: p.name }).addTo(this.group);
        const mt = (p.metres || []).map((x) => `${esc(x.name)} : ${G.qty(x.qty)} ${esc(x.unit)}`).join('<br>');
        m.bindPopup(`<div class="pop"><img src="${src}" alt=""><p><b>${n}</b> ${G.dateFR(p.ts)} ${G.timeFR(p.ts).slice(0, 5)}</p>` +
          (p.zone || p.address ? `<p>${esc(p.zone || p.address)}</p>` : '') + (mt ? `<p><b>${mt}</b></p>` : '') +
          `<button type="button" class="btn small" data-open="${p.id}">Ouvrir la fiche</button></div>`, { minWidth: 220, maxWidth: 240 });
        this.marks.set(p.id, m);
      });
      this.drawMe();
      if (this.focusId) {
        const p = list.find((q) => q.id === this.focusId), m = this.marks.get(this.focusId);
        this.focusId = null;
        if (p && m) { this.map.setView([p.lat, p.lon], 18); m.openPopup(); return; }
      }
      this.fit();
    },
    fit() {
      const list = this.list();
      if (!list.length) { if (live.pos) this.map.setView([live.pos.lat, live.pos.lon], 17); return; }
      if (list.length === 1) this.map.setView([list[0].lat, list[0].lon], 18);
      else this.map.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lon])), { padding: [60, 60], maxZoom: 19 });
    },
    drawMe() {
      if (!this.map || !live.pos) return;
      const ll = [live.pos.lat, live.pos.lon];
      if (!this.me) {
        this.acc = L.circle(ll, { radius: live.pos.acc, color: '#2D7FF9', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(this.map);
        this.me = L.marker(ll, { icon: meIcon(), interactive: false, keyboard: false }).addTo(this.map);
      } else { this.me.setLatLng(ll); this.acc.setLatLng(ll).setRadius(live.pos.acc); }
    },
    locate() {
      if (!live.pos) { toast('Position GPS pas encore disponible'); return; }
      this.drawMe();
      this.map.setView([live.pos.lat, live.pos.lon], Math.max(this.map.getZoom(), 17));
    }
  };

  /** Image JPEG de la carte affichée : fond (si le serveur l'autorise), numéros, échelle, cartouche. */
  async function mapImage() {
    const m = BigMap.map;
    if (!m) return;
    const b = BASES[BigMap.base] || BASES[0];
    const size = m.getSize(), z0 = Math.round(m.getZoom());
    const zt = Math.min(z0 + 1, b.o.maxNativeZoom), s = Math.pow(2, zt - z0), f = 2 / s;
    const W = size.x * 2, H = size.y * 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#E4E6E4'; x.fillRect(0, 0, W, H);
    const nw = m.project(m.containerPointToLatLng([0, 0]), zt);
    const tx0 = Math.floor(nw.x / 256), ty0 = Math.floor(nw.y / 256);
    const tx1 = Math.floor((nw.x + size.x * s) / 256), ty1 = Math.floor((nw.y + size.y * s) / 256);
    toast('Préparation de l’image…', 10000);
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const url = b.url.replace('{s}', 'abc'[Math.abs(tx + ty) % 3]).replace('{z}', zt).replace('{x}', tx).replace('{y}', ty);
        jobs.push(new Promise((res) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => { x.drawImage(i, (tx * 256 - nw.x) * f, (ty * 256 - nw.y) * f, 256 * f, 256 * f); res(true); };
          i.onerror = () => res(false);
          setTimeout(() => res(false), 15000);
          i.src = url;
        }));
      }
    }
    const tiles = (await Promise.all(jobs)).filter(Boolean).length;
    const nums = numbering();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    BigMap.list().forEach((p) => {
      const pt = m.project([p.lat, p.lon], zt).subtract(nw).multiplyBy(f);
      if (pt.x < -30 || pt.y < -30 || pt.x > W + 30 || pt.y > H + 30) return;
      x.beginPath(); x.arc(pt.x, pt.y, 25, 0, Math.PI * 2);
      x.fillStyle = '#FFC400'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#16181B'; x.stroke();
      x.fillStyle = '#16181B'; x.font = '800 24px system-ui, -apple-system, Arial, sans-serif';
      x.fillText(String(nums.get(p.id)), pt.x, pt.y + 1);
    });
    const d = filter !== '__all' ? dossierOf(filter) : cur();
    const title = d ? d.chantier : 'Photos de chantier';
    x.textAlign = 'left';
    x.font = '700 30px system-ui, -apple-system, Arial, sans-serif';
    const tw = Math.min(W - 48, x.measureText(title).width + 48);
    x.fillStyle = 'rgba(255,255,255,0.94)'; x.fillRect(16, 16, tw, 92);
    x.fillStyle = '#FFC400'; x.fillRect(16, 16, 10, 92);
    x.fillStyle = '#16181B'; x.fillText(title, 40, 50, tw - 36);
    x.font = '500 22px system-ui, -apple-system, Arial, sans-serif';
    x.fillText(`${G.dateFR(Date.now())}, fond ${b.name}`, 40, 86, tw - 36);
    const lat = m.getCenter().lat;
    const mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, m.getZoom())) / 2;
    let len = 1;
    [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].forEach((v) => { if (v / mpp <= 260) len = v; });
    const px = len / mpp;
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(16, H - 70, px + 40, 54);
    x.fillStyle = '#16181B'; x.fillRect(36, H - 34, px, 6);
    x.fillRect(36, H - 44, 4, 16); x.fillRect(36 + px - 4, H - 44, 4, 16);
    x.font = '600 20px system-ui, -apple-system, Arial, sans-serif';
    x.fillText(len >= 1000 ? `${len / 1000} km` : `${len} m`, 36, H - 54);
    x.textAlign = 'right'; x.font = '500 16px system-ui, -apple-system, Arial, sans-serif';
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(W - 360, H - 30, 360, 30);
    x.fillStyle = '#333'; x.fillText(b.o.attribution, W - 10, H - 15);
    const blob = await Photo.toBlob(c, 'image/jpeg', 0.9);
    Photo.release(c);
    $('#toast').classList.remove('on');
    sheetMode = 'direct';
    $('#sheetTitle').textContent = 'Image de la carte';
    $('#sheetScope').textContent = `${plural(BigMap.list().length, 'photo')} numérotée${BigMap.list().length > 1 ? 's' : ''}`;
    showReady({
      blob, name: `Carte_${Exports.slug(title) || 'photos'}_${G.stamp(Date.now()).slice(0, 8)}.jpg`,
      note: tiles ? '' : 'Le fond de carte n’a pas pu être récupéré (hors connexion ?). L’image contient seulement les numéros et l’échelle.'
    });
    $('#sheet').hidden = false;
  }

  // ------------------------------------------------------------------ photos
  function visible() { return photos.filter((p) => filter === '__all' || p.dossierId === filter); }
  function galleryOrder() { return visible().slice().sort((a, b) => b.ts - a.ts); }
  function numbering() {
    const m = new Map();
    visible().slice().sort((a, b) => a.ts - b.ts).forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }
  const mtext = (p) => (p.metres || []).map((m) => `${m.name} ${G.qty(m.qty)} ${m.unit}`).join(', ');
  function renderGallery() {
    if (filter !== '__all' && !dossierOf(filter)) filter = S.dossierId || '__all';
    const f = $('#galFilter');
    f.innerHTML = `<option value="__all">Tous les dossiers (${photos.length})</option>` +
      byActivity().map((d) => `<option value="${d.id}">${esc(d.chantier)} (${stats(d).n})</option>`).join('');
    f.value = filter;
    const list = galleryOrder(), nums = numbering(), grid = $('#galGrid');
    $('#galTitle').textContent = list.length ? `Photos (${list.length})` : 'Photos';
    $('#galEmpty').hidden = list.length > 0;
    grid.classList.toggle('selecting', selecting);
    grid.innerHTML = list.map((p) => {
      const mt = mtext(p);
      return `<button type="button" class="card${sel.has(p.id) ? ' sel' : ''}" data-id="${p.id}">` +
        `<img class="ph" loading="lazy" src="${thumbUrl(p)}" alt="">` +
        `<span class="num">${nums.get(p.id)}</span><span class="chk"><svg class="ic"><use href="#i-check"/></svg></span>` +
        `<span class="meta"><span class="d">${G.dateFR(p.ts)} ${G.timeFR(p.ts).slice(0, 5)}</span>` +
        `<span class="a">${esc(p.zone || p.address || '')}</span>` + (mt ? `<span class="mt">${esc(mt)}</span>` : '') +
        `${G.ok(p.lat) ? '' : '<span class="tag">Sans GPS</span>'}</span></button>`;
    }).join('');
    renderSelBar();
  }
  function renderSelBar() {
    $('#selBar').hidden = !selecting;
    $('#selCount').textContent = plural(sel.size, 'photo');
    const b = $('#galSelect');
    b.setAttribute('aria-pressed', String(selecting));
    $('span', b).textContent = selecting ? 'Terminer' : 'Sélectionner';
  }
  async function removePhoto(id) {
    await DB.del(id);
    photos = photos.filter((p) => p.id !== id);
    sel.delete(id);
    if (thumbUrls.has(id)) { URL.revokeObjectURL(thumbUrls.get(id)); thumbUrls.delete(id); }
  }
  async function setZone(ids, zone) {
    for (const id of ids) {
      const full = await DB.get(id);
      if (!full) continue;
      full.zone = zone;
      await DB.put(full);
      const c = photos.find((x) => x.id === id);
      if (c) c.zone = zone;
    }
  }

  // fiche
  let detList = [], detIdx = 0, detUrl = null, detBlob = null;
  function openDetail(id, list, from) {
    detList = list && list.some((p) => p.id === id) ? list : galleryOrder();
    detIdx = Math.max(0, detList.findIndex((p) => p.id === id));
    detailReturn = from || 'gallery';
    go('detail');
    renderDetail();
  }
  function releaseDetail() {
    if (detUrl) { URL.revokeObjectURL(detUrl); detUrl = null; }
    detBlob = null;
  }
  async function renderDetail() {
    const p = detList[detIdx];
    if (!p) { go(detailReturn); return; }
    releaseDetail();
    $('#detTitle').textContent = `${detIdx + 1} sur ${detList.length}`;
    $('#detImg').src = thumbUrl(p);
    const main = S.crs, oth = G.other(main), has = G.ok(p.lat);
    const rows = [
      ['Fichier', esc(p.name)],
      ['Date', `${G.dateFR(p.ts)} à ${G.timeFR(p.ts)}`],
      ['Type', TYPE[p.mode] || 'Photo seule'],
      ['Zone', `${esc(p.zone || p.address || '—')} <button type="button" class="link" data-act="zone">Modifier</button>`]
    ];
    if (p.metres && p.metres.length) {
      rows.push(['Métrés', p.metres.map((m) => `<span class="mline"><i style="--c:${m.color || '#888'}"></i>${esc(m.name)} : ${G.qty(m.qty)} ${esc(m.unit)}</span>`).join('')]);
    }
    if (has) {
      const a = G.xy(p, main), b = G.xy(p, oth);
      rows.push([G.CRS[main].label, `X ${G.fmt(a.x, 2)}<br>Y ${G.fmt(a.y, 2)}`]);
      rows.push([G.CRS[oth].label, `X ${G.fmt(b.x, 2)}<br>Y ${G.fmt(b.y, 2)}`]);
      rows.push(['WGS 84', `${G.fixed(p.lat, 7)}, ${G.fixed(p.lon, 7)}`]);
      rows.push(['Altitude GPS', p.alt == null ? 'Non fournie' : `${G.fmt(p.alt, 1)} m${p.altAcc ? ` <small>±${G.fmt(p.altAcc, 1)} m, non rattachée au NGF</small>` : '<small>Non rattachée au NGF</small>'}`]);
      rows.push(['Précision', p.acc == null ? '—' : `±${G.fmt(p.acc, 1)} m`]);
    } else rows.push(['Position', 'Non disponible au moment de la photo']);
    rows.push(['Cap', G.ok(p.heading) ? `${Math.round(p.heading)}° ${G.cardinal(p.heading)}` : '—']);
    if (p.address && p.address !== p.zone) rows.push(['Adresse', esc(p.address)]);
    const d = dossierOf(p.dossierId);
    if (d) rows.push(['Dossier', esc(d.chantier)]);
    if (p.operateur) rows.push(['Opérateur', esc(p.operateur)]);
    if (p.comment) rows.push(['Commentaire', esc(p.comment)]);
    rows.push(['Image', `${p.width} × ${p.height} px, ${fmtSize(p.size || 0)}`]);
    $('#detFacts').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const gm = $('#detGmaps');
    gm.hidden = !has;
    if (has) gm.href = `https://www.google.com/maps?q=${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
    $('#detOnMap').hidden = !has;
    const full = await DB.get(p.id);
    if (full && full.blob && detList[detIdx] === p && screen === 'detail') {
      detBlob = full.blob;
      detUrl = URL.createObjectURL(full.blob);
      $('#detImg').src = detUrl;
    }
  }
  function detailStep(dd) {
    const i = detIdx + dd;
    if (i < 0 || i >= detList.length) return;
    detIdx = i;
    renderDetail();
  }

  // ------------------------------------------------------------------ récapitulatif des métrés
  const dossierPhotos = (id) => photos.filter((p) => p.dossierId === id);
  function renderRecap() {
    if (!dossierOf(recapDossier)) recapDossier = S.dossierId || (dossiers[0] && dossiers[0].id) || null;
    $('#recapDossier').innerHTML = byActivity().map((d) => `<option value="${d.id}">${esc(d.chantier)}</option>`).join('');
    $('#recapDossier').value = recapDossier || '';
    setSeg('#recapTab', recapTab);
    const sum = Exports.metresSummary(Exports.prepare(dossierPhotos(recapDossier)));
    const body = $('#recapBody');
    $('#recapBar').hidden = !sum.rows.length;
    if (!sum.rows.length) {
      body.innerHTML = '<div class="empty"><p><strong>Aucun métré dans ce dossier.</strong></p>' +
        '<p>Prenez une photo et choisissez « Métrés » : la fourniture et sa quantité s’ajoutent ici.</p></div>';
      return;
    }
    if (recapTab === 'f') {
      body.innerHTML = '<div class="rc-list">' + sum.byFourniture.map((f) =>
        `<details class="rc-card" style="--c:${f.color}"><summary><span class="rc-name">${esc(f.name)}</span>` +
        `<b class="rc-total">${G.qty(f.total)} ${esc(f.unit)}</b><small>${plural(f.n, 'relevé')}</small></summary>` +
        '<div class="rc-rows">' + f.entries.map((e) =>
          `<button type="button" class="rc-row" data-id="${e.id}"><span>${esc(e.zone)}</span><span>photo ${e.n}</span><b>${G.qty(e.qty)} ${esc(f.unit)}</b></button>`).join('') +
        '</div></details>').join('') + '</div>';
    } else {
      body.innerHTML = '<div class="rc-list">' + sum.byZone.map((z) =>
        `<section class="rz-card"><header><h3>${esc(z.zone)}</h3><button type="button" class="link" data-rename="${encodeURIComponent(z.zone)}">Renommer</button></header>` +
        z.items.map((it) => `<div class="rz-row"><i style="--c:${it.color}"></i><span>${esc(it.name)}</span><b>${G.qty(it.total)} ${esc(it.unit)}</b></div>`).join('') +
        `<p class="rz-photos">${z.photos.length > 1 ? 'Photos' : 'Photo'} ` +
        z.photos.map((x) => `<button type="button" class="link" data-id="${x.id}">${x.n}</button>`).join(', ') + '</p></section>').join('') + '</div>';
    }
  }
  async function renameZone(oldZ) {
    const v = await prompt('Renommer la zone', oldZ, { placeholder: 'Nom de la zone' });
    if (v == null || !v.trim() || v.trim() === oldZ) return;
    const ids = dossierPhotos(recapDossier).filter((p) => (String(p.zone || p.address || '').trim() || 'Sans zone') === oldZ).map((p) => p.id);
    await setZone(ids, v.trim());
    renderRecap();
    toast(`Zone renommée sur ${plural(ids.length, 'photo')}`);
  }

  // ------------------------------------------------------------------ exports
  let busyExport = false, ready = null, expCrs = S.crs, sheetMode = 'list', sheetList = [];
  function exportList() { return selecting && sel.size ? photos.filter((p) => sel.has(p.id)) : visible(); }
  function showSheetPart(part) {
    $('#expList').hidden = part !== 'list';
    $('#sheetCrs').hidden = part !== 'list';
    $('#expBusy').hidden = part !== 'busy';
    $('#expReady').hidden = part !== 'ready';
    $('#readyBack').hidden = sheetMode !== 'list';
  }
  function openSheet() {
    sheetList = exportList();
    if (!sheetList.length) { toast('Aucune photo à exporter'); return; }
    sheetMode = 'list';
    expCrs = S.crs;
    setSeg('#sheetCrs', expCrs);
    $('#sheetTitle').textContent = `Exporter ${plural(sheetList.length, 'photo')}`;
    const d = filter !== '__all' ? dossierOf(filter) : null;
    $('#sheetScope').textContent = selecting && sel.size ? 'Photos sélectionnées' : (d ? d.chantier : 'Tous les dossiers');
    showSheetPart('list');
    $('#sheet').hidden = false;
  }
  function exportDirect(kind, list, title) {
    if (!list.length) { toast('Aucune photo dans ce dossier'); return; }
    sheetMode = 'direct';
    expCrs = S.crs;
    $('#sheetTitle').textContent = title;
    const d = dossierOf(list[0].dossierId);
    $('#sheetScope').textContent = d ? d.chantier : '';
    $('#sheet').hidden = false;
    runExport(kind, list);
  }
  function closeSheet() { if (busyExport) return; $('#sheet').hidden = true; ready = null; }
  function progress(i, n, label) {
    $('#expBar').style.width = Math.round(100 * Math.min(1, n ? i / n : 0)) + '%';
    $('#expMsg').textContent = n > 1 ? `${label} : ${Math.min(i + 1, n)} sur ${n}` : label;
  }
  function ctxFor(list) {
    const ids = new Set(list.map((p) => p.dossierId));
    const d = ids.size === 1 ? dossierOf(Array.from(ids)[0]) : null;
    return { crs: expCrs, chantier: d ? d.chantier : '', operateur: d ? (d.operateur || '') : '', title: d ? d.chantier : 'Photos de chantier', progress };
  }
  async function runExport(kind, list) {
    if (busyExport) return;
    const ids = new Set(list.map((p) => p.id));
    busyExport = true;
    showSheetPart('busy');
    progress(0, 1, 'Lecture des photos');
    try {
      const all = (await DB.all()).filter((p) => ids.has(p.id));
      const res = await Exports.kinds[kind](all, ctxFor(all));
      const notes = [];
      if (res.skipped) {
        const s = res.skipped > 1;
        notes.push(['qgis', 'all'].includes(kind)
          ? `${res.skipped} photo${s ? 's' : ''} sans position GPS : dans le dossier photos, mais pas sur la carte.`
          : `${res.skipped} photo${s ? 's' : ''} sans position GPS ${s ? 'ne sont pas incluses' : 'n’est pas incluse'} dans ce fichier.`);
      }
      if (kind === 'xlsx' && res.empty) notes.push('Aucun métré dans ces photos : le classeur ne contient que les en-têtes.');
      if (kind === 'html') notes.push('Ouvrez ce fichier dans un navigateur, puis « Exporter en PDF » pour obtenir le rapport.');
      res.note = notes.join(' ');
      showReady(res);
    } catch (e) {
      console.error(e);
      toast('Export impossible : ' + ((e && e.message) || e), 5000);
      if (sheetMode === 'list') showSheetPart('list'); else closeSheetForce();
    } finally {
      busyExport = false;
    }
  }
  function closeSheetForce() { $('#sheet').hidden = true; ready = null; }
  function showReady(res) {
    ready = res;
    $('#readyName').textContent = res.name;
    $('#readySize').textContent = fmtSize(res.blob.size);
    const note = $('#readyNote');
    note.hidden = !res.note;
    note.textContent = res.note || '';
    showSheetPart('ready');
  }

  // ------------------------------------------------------------------ réglages
  function renderSettings() {
    setSeg('#setCrs', S.crs);
    setSeg('#setQuality', S.quality >= 0.9 ? '0.93' : '0.85');
    const d = cur();
    $('#setDossier').textContent = d ? [d.chantier, d.operateur].filter(Boolean).join(', ') : 'Aucun dossier ouvert';
    storageInfo();
  }
  async function storageInfo() {
    const n = photos.length, bytes = photos.reduce((s, p) => s + (p.size || 0), 0);
    let txt = `${plural(n, 'photo')} sur ce téléphone, ${fmtSize(bytes)}`;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        if (e.quota) txt += `. Place encore disponible : ${fmtSize(Math.max(0, e.quota - e.usage))}`;
      }
    } catch (e) { /* estimation indisponible */ }
    $('#setStorage').textContent = txt + '.';
  }
  async function editDossier() {
    const d = cur();
    if (!d) { go('dossier'); return; }
    const r = await form({
      title: 'Modifier le dossier', ok: 'Enregistrer',
      html: `<label class="field">Nom du chantier<input name="ch" type="text" autocomplete="off" value="${esc(d.chantier)}"></label>` +
        `<label class="field">Opérateur<input name="op" type="text" autocomplete="name" value="${esc(d.operateur || '')}"></label><p class="err" hidden></p>`,
      validate: (b) => {
        const ch = b.querySelector('[name=ch]').value.trim();
        if (!ch) { const e = b.querySelector('.err'); e.textContent = 'Indiquez le nom du chantier.'; e.hidden = false; return false; }
        return { ch, op: b.querySelector('[name=op]').value.trim() };
      }
    });
    if (!r) return;
    d.chantier = r.ch; d.operateur = r.op;
    if (r.op) { S.operateur = r.op; save(); }
    await saveDossier(d);
    renderSettings(); renderDossierChip();
    toast('Dossier modifié. Les photos déjà prises gardent l’ancien bandeau.', 3500);
  }

  // ------------------------------------------------------------------ événements
  function bind() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-go]');
      if (el) go(el.dataset.go);
    });
    // dossiers
    $('#dosCreate').onclick = () => { askCompass(); createDossier().catch((e) => toast('Création impossible : ' + e.message, 4000)); };
    $('#dosResumeBtn').onclick = () => { askCompass(); const d = cur(); if (d) useDossier(d); };
    $('#dosOthers').addEventListener('click', (e) => {
      const b = e.target.closest('.dos-row');
      if (!b) return;
      askCompass();
      const d = dossierOf(b.dataset.id);
      if (d) useDossier(d);
    });
    ['#dosChantier', '#dosOperateur'].forEach((s) => $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#dosCreate').click(); }));
    // viseur
    $('#hDossier').onclick = () => go('dossier');
    $('#btnSettings').onclick = () => go('settings');
    $('#btnGallery').onclick = () => { filter = S.dossierId || filter; go('gallery'); };
    $('#btnShutter').onclick = shoot;
    $('#btnRecap').onclick = () => openRecap('cam');
    $('#hCapBtn').onclick = async () => {
      if (G.Compass.needsPermission && !G.Compass.started) {
        if (await G.Compass.request()) startCompass();
        else toast('Boussole refusée : le cap ne sera pas enregistré.', 3500);
      }
    };
    $('#gpsBanner').onclick = () => { if ($('#gpsBanner').dataset.k === 'denied') locHelp(); };
    $('#camRetry').onclick = () => { Camera.stop(); startCamera(); };
    $('#camNative').onclick = () => $('#fileCam').click();
    $('#fileCam').onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file || shooting || !cur()) return;
      shooting = true;
      try { await capture(() => Camera.fromFile(file)); }
      catch (err) { toast('Image illisible : ' + err.message, 4000); }
      finally { shooting = false; }
    };
    $('#choice').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) closeChoice(b.dataset.mode);
    });
    $('#choiceRetake').onclick = () => closeChoice(null);
    $('#minimap').addEventListener('click', () => openMap('cam'));
    $('#minimap').addEventListener('keydown', (e) => { if (e.key === 'Enter') openMap('cam'); });
    // photos
    $('#galMap').onclick = () => openMap('gallery');
    $('#galRecap').onclick = () => openRecap('gallery');
    $('#galExport').onclick = openSheet;
    $('#galFilter').onchange = (e) => { filter = e.target.value; sel.clear(); renderGallery(); };
    $('#galSelect').onclick = () => { selecting = !selecting; if (!selecting) sel.clear(); renderGallery(); };
    $('#galGrid').addEventListener('click', (e) => {
      const c = e.target.closest('.card');
      if (!c) return;
      const id = c.dataset.id;
      if (selecting) {
        if (sel.has(id)) sel.delete(id); else sel.add(id);
        c.classList.toggle('sel', sel.has(id));
        renderSelBar();
      } else openDetail(id, galleryOrder(), 'gallery');
    });
    $('#selAll').onclick = () => {
      const v = visible();
      if (sel.size === v.length) sel.clear(); else v.forEach((p) => sel.add(p.id));
      renderGallery();
    };
    $('#selDelete').onclick = async () => {
      if (!sel.size) return;
      const n = sel.size;
      if (!(await confirmBox('Supprimer les photos', `${plural(n, 'photo')} ${n > 1 ? 'seront effacées' : 'sera effacée'} de ce téléphone, avec leurs métrés. Exportez-les avant si besoin.`, 'Supprimer', true))) return;
      for (const id of Array.from(sel)) await removePhoto(id);
      renderGallery(); updateCounts(); toast('Photos supprimées');
    };
    $('#selExport').onclick = openSheet;
    // fiche
    $('#detBack').onclick = () => go(detailReturn);
    $('#detShare').onclick = () => { const p = detList[detIdx]; if (p && detBlob) shareFile(detBlob, p.name); };
    $('#detDelete').onclick = async () => {
      const p = detList[detIdx];
      if (!p || !(await confirmBox('Supprimer la photo', `${p.name} sera effacée de ce téléphone, avec ses métrés.`, 'Supprimer', true))) return;
      await removePhoto(p.id);
      detList.splice(detIdx, 1);
      updateCounts();
      toast('Photo supprimée');
      if (!detList.length) { go(detailReturn); return; }
      detIdx = Math.min(detIdx, detList.length - 1);
      renderDetail();
    };
    $('#detFacts').addEventListener('click', async (e) => {
      if (!e.target.closest('[data-act="zone"]')) return;
      const p = detList[detIdx];
      if (!p) return;
      const v = await prompt('Zone de la photo', p.zone || p.address || '', { placeholder: 'Adresse ou nom de zone' });
      if (v == null) return;
      await setZone([p.id], v.trim());
      renderDetail();
      toast('Zone modifiée');
    });
    $('#detOnMap').onclick = () => { const p = detList[detIdx]; if (p) openMap('detail', p.id); };
    let sx = null;
    $('#detImgBox').addEventListener('touchstart', (e) => { sx = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    $('#detImgBox').addEventListener('touchend', (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 60) detailStep(dx < 0 ? 1 : -1);
    });
    // carte
    $('#mapBack').onclick = () => go(mapReturn);
    $('#mapMe').onclick = () => BigMap.locate();
    $('#mapFit').onclick = () => BigMap.fit();
    $('#mapShot').onclick = () => mapImage().catch((e) => toast('Image impossible : ' + e.message, 4000));
    // récap
    $('#recapBack').onclick = () => go(recapReturn);
    $('#recapDossier').onchange = (e) => { recapDossier = e.target.value; renderRecap(); };
    $('#recapTab').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; recapTab = b.dataset.v; renderRecap(); };
    $('#recapBody').addEventListener('click', (e) => {
      const r = e.target.closest('[data-rename]');
      if (r) { renameZone(decodeURIComponent(r.dataset.rename)); return; }
      const b = e.target.closest('[data-id]');
      if (b) openDetail(b.dataset.id, dossierPhotos(recapDossier).sort((x, y) => y.ts - x.ts), 'recap');
    });
    $('#recapXlsx').onclick = () => exportDirect('xlsx', dossierPhotos(recapDossier), 'Métrés Excel');
    $('#recapPdf').onclick = () => exportDirect('html', dossierPhotos(recapDossier), 'Rapport avec carte et métrés');
    // réglages
    $('#setCrs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.crs = b.dataset.v; save(); setSeg('#setCrs', S.crs); renderHud(); };
    $('#setQuality').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.quality = parseFloat(b.dataset.v); save(); setSeg('#setQuality', b.dataset.v); };
    $('#setDosEdit').onclick = editDossier;
    $('#setDosChange').onclick = () => go('dossier');
    $('#setHelp').onclick = locHelp;
    $('#setWipe').onclick = async () => {
      if (!photos.length) { toast('Aucune photo à supprimer'); return; }
      if (!(await confirmBox('Supprimer toutes les photos', `Les ${photos.length} photos de tous les dossiers seront effacées de ce téléphone. Exportez-les avant si besoin.`, 'Tout supprimer', true))) return;
      await DB.clear();
      thumbUrls.forEach((u) => URL.revokeObjectURL(u));
      thumbUrls.clear();
      photos = []; sel.clear();
      updateCounts(); storageInfo();
      toast('Photos supprimées');
    };
    // feuille d'export
    $('#sheetClose').onclick = closeSheet;
    $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
    $('#sheetCrs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; expCrs = b.dataset.v; setSeg('#sheetCrs', expCrs); };
    $('#expList').addEventListener('click', (e) => { const b = e.target.closest('.exp'); if (b) runExport(b.dataset.k, sheetList); });
    $('#readyShare').onclick = () => { if (ready) shareFile(ready.blob, ready.name); };
    $('#readySave').onclick = () => { if (ready) download(ready.blob, ready.name); };
    $('#readyBack').onclick = () => showSheetPart('list');

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modalClose) modalClose();
        else if (!$('#choice').hidden) closeChoice(null);
        else if (!$('#sheet').hidden) closeSheet();
        return;
      }
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
      if (!typing && !modalClose && screen === 'cam' && $('#choice').hidden && (e.key === ' ' || e.key === 'Enter') && e.target === document.body) { e.preventDefault(); shoot(); }
      if (!typing && screen === 'detail' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) detailStep(e.key === 'ArrowRight' ? 1 : -1);
    });
    window.addEventListener('resize', () => { if (screen === 'cam') { layoutCam(); Mini.refresh(); } });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { Camera.stop(); keepAwake(false); }
      else if (screen === 'cam') startCamera();
    });
    window.addEventListener('online', () => { maybeAddress(true); renderHud(); });
    window.addEventListener('offline', renderHud);
  }

  // ------------------------------------------------------------------ données et démarrage
  async function loadData() {
    dossiers = await DB.allDossiers();
    const full = await DB.all();
    const orphans = full.filter((p) => !p.dossierId);
    if (orphans.length) {
      // photos de la version 1.0 : un dossier par nom de chantier
      for (const p of orphans) {
        const name = p.chantier || 'Photos sans dossier';
        let d = dossiers.find((x) => x.migrated && x.chantier === name);
        if (!d) { d = newDossier(name, p.operateur || ''); d.created = p.ts; d.migrated = true; dossiers.push(d); }
        p.dossierId = d.id;
        p.mode = p.mode || (p.comment ? 'annotation' : 'photo');
        p.zone = p.zone || p.address || '';
        p.metres = p.metres || [];
        await DB.put(p);
      }
      for (const d of dossiers.filter((x) => x.migrated)) await DB.putDossier(d);
    }
    photos = full.map(lite);
    if (S.dossierId && !cur()) S.dossierId = null;
    if (!S.dossierId && dossiers.length) S.dossierId = byActivity()[0].id;
    filter = S.dossierId || '__all';
    save();
  }
  async function init() {
    Camera.init($('#video'));
    window.Editor.init();
    Mini.init();
    bind();
    bindPinch();
    renderHud();
    renderCap(null);
    if (!G.Compass.needsPermission) startCompass();
    startGeo();
    try { await loadData(); }
    catch (e) { console.error(e); toast('Stockage local indisponible : les photos ne pourront pas être enregistrées.', 6000); }
    renderDossierChip();
    updateCounts();
    renderDossierScreen();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // accès en lecture pour le diagnostic
  window.__geocliche = { state: () => ({ screen, photos, dossiers, ready, live, settings: S }) };
  init();
})();
