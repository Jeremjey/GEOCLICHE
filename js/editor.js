/* GéoCliché — éditeur photo : annotation (main levée, formes, texte, cotes) et métrés par fourniture */
(function (global) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#FFFFFF', '#000000'];
  const FCOLORS = ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1', '#F4511E', '#3949AB', '#7CB342', '#D81B60', '#6D4C41', '#C0CA33'];
  const WIDTHS = [0.004, 0.008, 0.014];
  const TEXTS = [0.024, 0.032, 0.044];
  const UNITS = ['ml', 'm²', 'm³', 'U', 't'];
  const TOOLS = [
    ['pen', 'Main levée', 'i-pen'], ['line', 'Trait', 'i-line'], ['arrow', 'Flèche', 'i-arrow'], ['rect', 'Rectangle', 'i-rect'],
    ['ellipse', 'Cercle', 'i-circle'], ['poly', 'Zone', 'i-poly'], ['text', 'Texte', 'i-text'], ['dim', 'Cote', 'i-dim']
  ];
  const FONT = 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const st = {
    src: null, preview: null, view: null, shapes: [], cur: null, poly: null, tool: 'pen', color: COLORS[0], wi: 1,
    mode: 'annotation', lines: [], pending: [], fournitures: [], resolve: null, raf: 0, tap: null
  };
  let cv, ctx, stage;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(String(v || '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };
  const qf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
  const fq = (v) => qf.format(v).replace(/\u202f/g, '\u00a0');
  const icon = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
  const uid = () => (global.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const UI = () => global.UI;
  const big = () => Math.max(st.src.width, st.src.height);
  function light(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62;
  }

  // ------------------------------------------------------------------ mise en place
  function init() {
    cv = $('#edCanvas'); ctx = cv.getContext('2d'); stage = $('#edStage');
    const tools = $('#edTools');
    tools.innerHTML = TOOLS.map(([id, label, ic]) =>
      `<button type="button" class="tbtn${id === st.tool ? ' on' : ''}" data-tool="${id}">${icon(ic)}<span>${label}</span></button>`).join('') +
      `<span class="tsep"></span><button type="button" class="tbtn" id="edUndo">${icon('i-undo')}<span>Annuler</span></button>` +
      `<button type="button" class="tbtn" id="edClear">${icon('i-eraser')}<span>Effacer</span></button>`;
    tools.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      finishPoly();
      st.tool = b.dataset.tool;
      tools.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#edUndo').onclick = undo;
    $('#edClear').onclick = () => { st.shapes = []; st.poly = null; polyBtn(); redraw(); };

    const pal = $('#edColors');
    pal.innerHTML = '<button type="button" class="wbtn" id="edWidth" aria-label="Épaisseur du trait"><i></i></button>' +
      COLORS.map((c, i) => `<button type="button" class="swatch${i === 0 ? ' on' : ''}" data-c="${c}" style="--c:${c}" aria-label="Couleur ${i + 1}"></button>`).join('');
    pal.addEventListener('click', (e) => {
      const s = e.target.closest('.swatch');
      if (s) { setColor(s.dataset.c); return; }
      if (e.target.closest('#edWidth')) { st.wi = (st.wi + 1) % WIDTHS.length; renderWidth(); }
    });
    renderWidth();

    $('#edPolyDone').onclick = finishPoly;
    $('#edCancel').onclick = cancel;
    $('#edSave').onclick = save;
    $('#edAddMetre').onclick = addMetre;
    $('#edMetres').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      st.lines.splice(+b.dataset.del, 1);
      renderLines();
    });
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { st.cur = null; st.tap = null; redraw(); });
    global.addEventListener('resize', () => { if (st.src) layout(); });
  }

  function setColor(c) {
    st.color = c;
    document.querySelectorAll('#edColors .swatch').forEach((s) => s.classList.toggle('on', s.dataset.c === c));
  }
  function renderWidth() { $('#edWidth i').style.setProperty('--s', [5, 9, 15][st.wi] + 'px'); }

  /** Ouvre l'éditeur. opts = { mode: 'annotation' | 'metres', zone, fournitures } */
  function open(src, opts) {
    st.src = src; st.shapes = []; st.cur = null; st.poly = null; st.lines = []; st.pending = []; st.tap = null;
    st.mode = opts.mode;
    st.fournitures = (opts.fournitures || []).slice();
    $('#edTitle').textContent = opts.mode === 'metres' ? 'Métrés' : 'Annotation';
    $('#edMetresBox').hidden = opts.mode !== 'metres';
    $('#edZone').value = opts.zone || '';
    $('#edComment').value = '';
    renderLines();
    polyBtn();
    const k = Math.min(1, 1600 / Math.max(src.width, src.height));
    st.preview = document.createElement('canvas');
    st.preview.width = Math.round(src.width * k);
    st.preview.height = Math.round(src.height * k);
    st.preview.getContext('2d').drawImage(src, 0, 0, st.preview.width, st.preview.height);
    requestAnimationFrame(() => { layout(); if (st.mode === 'metres') addMetre(); });
    return new Promise((res) => { st.resolve = res; });
  }

  function finish(v) {
    const r = st.resolve;
    st.resolve = null;
    if (st.preview) { st.preview.width = st.preview.height = 0; st.preview = null; }
    st.src = null; st.shapes = []; st.cur = null; st.poly = null; st.view = null;
    cv.width = cv.height = 0;
    $('#edPolyDone').hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (r) r(v);
  }
  async function cancel() {
    if ((st.shapes.length || st.lines.length) &&
      !(await UI().confirm('Abandonner la photo', 'Les dessins et les métrés saisis seront perdus.', 'Abandonner', true))) return;
    finish(null);
  }
  async function save() {
    finishPoly();
    if (st.mode === 'metres' && !st.lines.length &&
      !(await UI().confirm('Aucun métré saisi', 'Cette photo n’a pas encore de métré. L’enregistrer quand même ?', 'Enregistrer'))) return;
    const c = st.src.getContext('2d');
    st.shapes.forEach((s) => draw(c, s, 1));
    finish({
      canvas: st.src,
      comment: $('#edComment').value.trim(),
      zone: $('#edZone').value.trim(),
      metres: st.lines.slice(),
      newFournitures: st.pending.filter((f) => st.lines.some((l) => l.fid === f.id))
    });
  }

  // ------------------------------------------------------------------ affichage
  function layout() {
    if (!st.src) return;
    const r = stage.getBoundingClientRect(), ar = st.src.width / st.src.height;
    let w = r.width, h = w / ar;
    if (h > r.height) { h = r.height; w = h * ar; }
    const dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    st.view = { k: cv.width / st.src.width, css: w / st.src.width };
    paint();
  }
  function redraw() {
    if (st.raf) return;
    st.raf = requestAnimationFrame(() => { st.raf = 0; paint(); });
  }
  function paint() {
    if (!st.src || !st.view) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(st.preview, 0, 0, cv.width, cv.height);
    st.shapes.forEach((s) => draw(ctx, s, st.view.k));
    if (st.cur) draw(ctx, st.cur, st.view.k);
    if (st.poly) draw(ctx, st.poly, st.view.k, true);
  }

  // ------------------------------------------------------------------ dessin des formes (coordonnées de l'image)
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function label(c, text, x, y, ang, size, color) {
    c.save();
    c.translate(x, y); c.rotate(ang);
    c.font = `700 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width, p = size * 0.38, h = size * 1.4;
    c.fillStyle = color;
    rr(c, -w / 2 - p, -h / 2, w + 2 * p, h, size * 0.25);
    c.fill();
    c.lineWidth = Math.max(1, size * 0.06);
    c.strokeStyle = light(color) ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.85)';
    c.stroke();
    c.fillStyle = light(color) ? '#16181B' : '#FFFFFF';
    c.fillText(text, 0, size * 0.05);
    c.restore();
  }
  function seg(c, a, b) { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  function arrow(c, s) {
    const [ax, ay] = s.a, [bx, by] = s.b, ang = Math.atan2(by - ay, bx - ax), L = Math.max(s.w * 4.5, 14);
    seg(c, s.a, [bx - Math.cos(ang) * L * 0.7, by - Math.sin(ang) * L * 0.7]);
    c.beginPath();
    c.moveTo(bx, by);
    c.lineTo(bx - L * Math.cos(ang - 0.42), by - L * Math.sin(ang - 0.42));
    c.lineTo(bx - L * Math.cos(ang + 0.42), by - L * Math.sin(ang + 0.42));
    c.closePath();
    c.fill();
  }
  function poly(c, s, open) {
    if (!s.pts.length) return;
    c.beginPath();
    s.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    if (!open) { c.closePath(); c.save(); c.globalAlpha = 0.28; c.fill(); c.restore(); }
    c.stroke();
    if (open) s.pts.forEach((p, i) => { c.beginPath(); c.arc(p[0], p[1], s.w * (i ? 1.1 : 1.9), 0, Math.PI * 2); c.fill(); });
  }
  function dim(c, s) {
    const [ax, ay] = s.a, [bx, by] = s.b, ang = Math.atan2(by - ay, bx - ax), t = Math.max(s.w * 3, 10);
    const nx = -Math.sin(ang) * t, ny = Math.cos(ang) * t;
    c.beginPath();
    c.moveTo(ax, ay); c.lineTo(bx, by);
    c.moveTo(ax - nx, ay - ny); c.lineTo(ax + nx, ay + ny);
    c.moveTo(bx - nx, by - ny); c.lineTo(bx + nx, by + ny);
    c.stroke();
    if (s.label) {
      let a = ang;
      if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
      label(c, s.label, (ax + bx) / 2, (ay + by) / 2, a, s.size, s.color);
    }
  }
  function draw(c, s, k, open) {
    c.save();
    c.scale(k, k);
    c.strokeStyle = s.color; c.fillStyle = s.color; c.lineWidth = s.w || 1; c.lineCap = 'round'; c.lineJoin = 'round';
    if (s.t === 'pen') {
      c.beginPath();
      s.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      if (s.pts.length === 1) c.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
      c.stroke();
    } else if (s.t === 'line') seg(c, s.a, s.b);
    else if (s.t === 'arrow') arrow(c, s);
    else if (s.t === 'rect') c.strokeRect(Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.abs(s.b[0] - s.a[0]), Math.abs(s.b[1] - s.a[1]));
    else if (s.t === 'ellipse') {
      c.beginPath();
      c.ellipse((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, Math.max(0.1, Math.abs(s.b[0] - s.a[0]) / 2), Math.max(0.1, Math.abs(s.b[1] - s.a[1]) / 2), 0, 0, Math.PI * 2);
      c.stroke();
    } else if (s.t === 'poly') poly(c, s, open);
    else if (s.t === 'text') label(c, s.text, s.at[0], s.at[1], 0, s.size, s.color);
    else if (s.t === 'dim') dim(c, s);
    c.restore();
  }

  // ------------------------------------------------------------------ saisie au doigt
  const W = () => WIDTHS[st.wi] * big();
  const TS = () => Math.round(TEXTS[st.wi] * big());
  function pt(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / st.view.css, (e.clientY - r.top) / st.view.css];
  }
  function polyBtn() { $('#edPolyDone').hidden = !(st.poly && st.poly.pts.length >= 3); }
  function finishPoly() {
    if (!st.poly) return;
    if (st.poly.pts.length >= 3) st.shapes.push(st.poly);
    st.poly = null;
    polyBtn();
    redraw();
  }
  function undo() {
    if (st.poly) {
      st.poly.pts.pop();
      if (st.poly.pts.length < 1) st.poly = null;
      polyBtn();
    } else st.shapes.pop();
    redraw();
  }
  function down(e) {
    if (!st.src || !st.view) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ }
    const p = pt(e);
    if (st.tool === 'pen') st.cur = { t: 'pen', color: st.color, w: W(), pts: [p] };
    else if (st.tool === 'poly') {
      if (!st.poly) st.poly = { t: 'poly', color: st.color, w: W(), pts: [p] };
      else {
        const f = st.poly.pts[0];
        if (st.poly.pts.length >= 3 && Math.hypot(p[0] - f[0], p[1] - f[1]) * st.view.css < 28) { finishPoly(); return; }
        st.poly.pts.push(p);
      }
      polyBtn();
    } else if (st.tool === 'text') st.tap = p;
    else st.cur = { t: st.tool, color: st.color, w: W(), a: p, b: p.slice() };
    redraw();
  }
  function move(e) {
    if (!st.cur) return;
    e.preventDefault();
    const p = pt(e);
    if (st.cur.t === 'pen') {
      const l = st.cur.pts[st.cur.pts.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) * st.view.css < 1.5) return;
      st.cur.pts.push(p);
    } else st.cur.b = p;
    redraw();
  }
  async function up() {
    if (st.tap) {
      const at = st.tap;
      st.tap = null;
      const t = await UI().prompt('Texte sur la photo', '', { placeholder: 'Ex. Regard à reprendre' });
      if (t && t.trim() && st.src) { st.shapes.push({ t: 'text', color: st.color, at, text: t.trim(), size: TS() }); redraw(); }
      return;
    }
    const s = st.cur;
    st.cur = null;
    if (!s) return;
    if (s.t !== 'pen' && Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) * st.view.css < 6) { redraw(); return; }
    st.shapes.push(s);
    redraw();
    if (s.t === 'dim') {
      const last = st.lines[st.lines.length - 1];
      const v = await UI().prompt('Valeur de la cote', last ? `${fq(last.qty)} ${last.unit}` : '', { placeholder: 'Ex. 12,5 ml' });
      if (!st.src) return;
      if (v == null) st.shapes.splice(st.shapes.indexOf(s), 1);
      else { s.label = v.trim(); s.size = TS(); }
      redraw();
    }
  }

  // ------------------------------------------------------------------ métrés
  const allF = () => st.fournitures.concat(st.pending);
  function renderLines() {
    $('#edMetres').innerHTML = st.lines.length ? st.lines.map((l, i) =>
      `<div class="ml"><i style="--c:${l.color}"></i><span>${esc(l.name)}</span><b>${fq(l.qty)} ${esc(l.unit)}</b>` +
      `<button type="button" class="ml-del" data-del="${i}" aria-label="Retirer ce métré">${icon('i-close')}</button></div>`).join('')
      : '<p class="ml-empty">Aucun métré sur cette photo pour l’instant.</p>';
  }
  async function addMetre() {
    const F = allF();
    const lastId = st.lines.length ? st.lines[st.lines.length - 1].fid : (F.length ? F[F.length - 1].id : null);
    const html =
      '<p class="lbl">Fourniture</p><div class="fchips">' +
      F.map((f) => `<button type="button" class="fchip" data-id="${f.id}" style="--c:${f.color}"><i></i>${esc(f.name)} <small>${esc(f.unit)}</small></button>`).join('') +
      '<button type="button" class="fchip add" data-id="__new">+ Nouvelle fourniture</button></div>' +
      '<div class="fnew" hidden><label class="field">Nom de la fourniture<input name="fname" type="text" autocomplete="off" placeholder="Ex. Bordure T2"></label>' +
      '<p class="lbl">Unité</p><div class="seg units">' + UNITS.map((u) => `<button type="button" role="radio" data-v="${u}">${u}</button>`).join('') + '</div></div>' +
      '<label class="field">Quantité<input name="fqty" type="text" inputmode="decimal" autocomplete="off" placeholder="0"></label>' +
      '<p class="err" hidden></p>';
    const r = await UI().form({
      title: 'Ajouter un métré', ok: 'Ajouter', html,
      onOpen(body) {
        const chips = body.querySelectorAll('.fchip'), fnew = body.querySelector('.fnew');
        const pick = (id) => {
          chips.forEach((c) => c.classList.toggle('on', c.dataset.id === id));
          fnew.hidden = id !== '__new';
          const target = body.querySelector(id === '__new' ? '[name=fname]' : '[name=fqty]');
          setTimeout(() => target.focus(), 80);
        };
        chips.forEach((c) => { c.onclick = () => pick(c.dataset.id); });
        const units = body.querySelectorAll('.units button');
        units.forEach((u) => { u.onclick = () => units.forEach((x) => x.setAttribute('aria-checked', String(x === u))); });
        units[0].setAttribute('aria-checked', 'true');
        pick(lastId && F.some((f) => f.id === lastId) ? lastId : '__new');
      },
      validate(body) {
        const err = body.querySelector('.err');
        const fail = (m) => { err.textContent = m; err.hidden = false; return false; };
        const on = body.querySelector('.fchip.on');
        if (!on) return fail('Choisissez une fourniture.');
        const res = { qty: num(body.querySelector('[name=fqty]').value) };
        if (on.dataset.id === '__new') {
          res.name = body.querySelector('[name=fname]').value.trim();
          if (!res.name) return fail('Indiquez le nom de la fourniture.');
          const u = body.querySelector('.units [aria-checked="true"]');
          res.unit = u ? u.dataset.v : 'ml';
        } else res.fid = on.dataset.id;
        if (!(res.qty > 0)) return fail('Indiquez une quantité supérieure à zéro.');
        return res;
      }
    });
    if (!r || !st.src) return;
    let f = r.fid ? F.find((x) => x.id === r.fid) : null;
    if (!f) {
      f = F.find((x) => x.name.toLowerCase() === r.name.toLowerCase() && x.unit === r.unit);
      if (!f) {
        f = { id: uid(), name: r.name, unit: r.unit, color: FCOLORS[F.length % FCOLORS.length] };
        st.pending.push(f);
      }
    }
    st.lines.push({ fid: f.id, name: f.name, unit: f.unit, color: f.color, qty: r.qty });
    renderLines();
    setColor(f.color);
  }

  global.Editor = { init, open };
})(window);
