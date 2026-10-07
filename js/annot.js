/* GéoCliché — annotation au stylo avant enregistrement */
(function (global) {
  'use strict';
  const COLORS = [
    ['#FF3B30', 'Rouge'], ['#FF9500', 'Orange'], ['#FFCC00', 'Jaune'], ['#34C759', 'Vert'],
    ['#00C7BE', 'Turquoise'], ['#007AFF', 'Bleu'], ['#5856D6', 'Indigo'], ['#AF52DE', 'Violet'],
    ['#FF2D55', 'Rose'], ['#A2845E', 'Marron'], ['#FFFFFF', 'Blanc'], ['#000000', 'Noir']
  ];
  const WIDTHS = [0.004, 0.008, 0.015];

  let cv, ctx, stage, preview, src, view, strokes, cur, color, wi, resolver;
  const $ = (s) => document.querySelector(s);

  function init() {
    cv = $('#annCanvas'); ctx = cv.getContext('2d'); stage = $('#annStage');
    color = COLORS[0][0]; wi = 1;
    const pal = $('#annColors');
    COLORS.forEach(([c, n], i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === 0 ? ' on' : '');
      b.style.setProperty('--c', c);
      b.setAttribute('aria-label', n);
      b.onclick = () => { color = c; pal.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === b)); };
      pal.appendChild(b);
    });
    document.querySelectorAll('#annWidths button').forEach((b) => {
      b.onclick = () => { wi = +b.dataset.w; document.querySelectorAll('#annWidths button').forEach((x) => x.classList.toggle('on', x === b)); };
    });
    $('#annUndo').onclick = () => { strokes.pop(); redraw(); };
    $('#annClear').onclick = () => { strokes = []; redraw(); };
    $('#annCancel').onclick = () => finish(null);
    $('#annSave').onclick = () => {
      const c = src.getContext('2d');
      strokes.forEach((s) => drawStroke(c, s, 1));
      finish({ canvas: src, comment: $('#annComment').value });
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    global.addEventListener('resize', () => { if (src) layout(); });
  }

  function edit(source) {
    src = source; strokes = []; cur = null;
    $('#annComment').value = '';
    const k = Math.min(1, 1600 / Math.max(src.width, src.height));
    preview = document.createElement('canvas');
    preview.width = Math.round(src.width * k); preview.height = Math.round(src.height * k);
    preview.getContext('2d').drawImage(src, 0, 0, preview.width, preview.height);
    requestAnimationFrame(layout);
    return new Promise((res) => { resolver = res; });
  }

  function finish(v) {
    const r = resolver; resolver = null;
    if (preview) { preview.width = preview.height = 0; preview = null; }
    src = null; strokes = []; cur = null;
    cv.width = cv.height = 0;
    $('#annComment').blur();
    if (r) r(v);
  }

  function layout() {
    if (!src) return;
    const r = stage.getBoundingClientRect();
    const ar = src.width / src.height;
    let w = r.width, h = w / ar;
    if (h > r.height) { h = r.height; w = h * ar; }
    const dpr = Math.min(global.devicePixelRatio || 1, 3);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    view = { k: cv.width / src.width, css: w / src.width };
    redraw();
  }

  function redraw() {
    if (!src || !view) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(preview, 0, 0, cv.width, cv.height);
    strokes.forEach((s) => drawStroke(ctx, s, view.k));
  }

  function drawStroke(c, s, k) {
    c.save();
    c.scale(k, k);
    c.strokeStyle = s.color; c.lineWidth = s.width; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    s.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    if (s.pts.length === 1) c.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
    c.stroke();
    c.restore();
  }

  function pt(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / view.css, (e.clientY - r.top) / view.css];
  }
  function down(e) {
    if (!src) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    cur = { color, width: WIDTHS[wi] * Math.max(src.width, src.height), pts: [pt(e)] };
    strokes.push(cur);
    drawStroke(ctx, cur, view.k);
  }
  function move(e) {
    if (!cur) return;
    e.preventDefault();
    const p = pt(e), last = cur.pts[cur.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5 / view.css) return;
    cur.pts.push(p);
    drawStroke(ctx, { color: cur.color, width: cur.width, pts: [last, p] }, view.k);
  }
  function up() { cur = null; }

  global.Annotator = { init, edit };
})(window);
