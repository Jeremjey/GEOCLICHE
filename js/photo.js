/* GéoCliché — photo finale : bandeau de coordonnées incrusté, bande zone / métrés / commentaire, EXIF, vignette */
(function (global) {
  'use strict';
  const G = global.Geo;
  const FONT = 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const YELLOW = '#FFC400';

  const toBlob = (c, type, q) => new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Encodage JPEG impossible'))), type, q));

  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
  }
  function wrap(ctx, text, maxW) {
    const out = [];
    String(text).split(/\r?\n/).forEach((para) => {
      let line = '';
      para.split(/\s+/).filter(Boolean).forEach((w) => {
        const t = line ? line + ' ' + w : w;
        if (!line || ctx.measureText(t).width <= maxW) line = t;
        else { out.push(line); line = w; }
      });
      out.push(line);
    });
    return out.map((l) => fitText(ctx, l, maxW));
  }
  function release(c) { if (c) { c.width = 0; c.height = 0; } }

  /** Mise en page : photo, puis bandeau de coordonnées sous l'image (rien n'est masqué), puis bande blanche (zone, métrés, commentaire). */
  function layout(W, H, lines, band) {
    const fs = Math.max(13, Math.round(Math.min(W, H) * 0.028));
    const lh = Math.round(fs * 1.34), pad = Math.round(fs * 0.75), bar = Math.max(3, Math.round(fs * 0.24));
    const textX = bar + pad, maxW = W - textX - pad;
    const cfs = Math.round(fs * 1.06), clh = Math.round(cfs * 1.34), sw = Math.round(cfs * 0.78);
    const heights = lines.map((l) => Math.round(lh * (l.k || 1)));
    const bh = pad * 2 + heights.reduce((a, h) => a + h, 0);
    const m = document.createElement('canvas').getContext('2d');
    const items = [];
    if (band.zone) items.push({ t: 'Zone : ' + band.zone, w: 700 });
    (band.metres || []).forEach((x) => items.push({ t: `${x.name} : ${G.qty(x.qty)} ${x.unit}`, w: 700, c: x.color }));
    if (band.comment) {
      m.font = `500 ${cfs}px ${FONT}`;
      wrap(m, band.comment, maxW).slice(0, 12).forEach((t) => items.push({ t, w: 500 }));
    }
    const cH = items.length ? pad * 2 + items.length * clh : 0;
    return { W, H, fs, pad, bar, textX, maxW, cfs, clh, sw, heights, bh, items, cH, total: H + bh + cH };
  }
  function compose(src, lines, band) {
    let L = layout(src.width, src.height, lines, band);
    const LIMIT = 15.5e6;                       // marge sous la limite des canvas d'iOS
    if (L.W * L.total > LIMIT) {
      const k = Math.sqrt(LIMIT / (L.W * L.total));
      L = layout(Math.round(src.width * k), Math.round(src.height * k), lines, band);
    }
    const out = document.createElement('canvas');
    out.width = L.W; out.height = L.total;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, L.W, L.H);

    ctx.fillStyle = '#1E2226';
    ctx.fillRect(0, L.H, L.W, L.bh);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(0, L.H, L.bar, L.bh);
    ctx.textBaseline = 'middle';
    let y = L.H + L.pad;
    lines.forEach((l, i) => {
      const s = Math.round(L.fs * (l.k || 1));
      ctx.font = `${l.w || 500} ${s}px ${FONT}`;
      ctx.fillStyle = l.c || '#FFFFFF';
      ctx.fillText(fitText(ctx, l.t, L.maxW), L.textX, y + L.heights[i] / 2);
      y += L.heights[i];
    });

    if (L.cH) {
      const top = L.H + L.bh;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, top, L.W, L.cH);
      ctx.fillStyle = YELLOW; ctx.fillRect(0, top, L.bar, L.cH);
      L.items.forEach((it, i) => {
        const yy = top + L.pad + i * L.clh + L.clh / 2;
        let x = L.textX;
        if (it.c) {
          ctx.fillStyle = it.c;
          ctx.fillRect(x, yy - L.sw / 2, L.sw, L.sw);
          x += L.sw + Math.round(L.cfs * 0.45);
        }
        ctx.font = `${it.w} ${L.cfs}px ${FONT}`;
        ctx.fillStyle = '#16181B';
        ctx.fillText(fitText(ctx, it.t, L.W - x - L.pad), x, yy);
      });
    }
    return out;
  }

  async function thumbFrom(canvas, max, q) {
    const k = Math.min(1, max / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * k)); c.height = Math.max(1, Math.round(canvas.height * k));
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(canvas, 0, 0, c.width, c.height);
    const b = await toBlob(c, 'image/jpeg', q || 0.78);
    release(c);
    return b;
  }

  const uid = () => (global.crypto && crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  function fileName(ts, xy) {
    return xy ? `${G.stamp(ts)}_X${Math.round(xy.x)}_Y${Math.round(xy.y)}.jpg` : `${G.stamp(ts)}_sans_GPS.jpg`;
  }

  /** snap = { ts, pos, heading, address, chantier, operateur, crs } ; extra = { comment, zone, metres } */
  async function build(src, snap, extra, quality) {
    extra = extra || {};
    const p = snap.pos, key = snap.crs, crs = G.CRS[key];
    const xy = p ? G.xy(p, key) : null;
    const h = G.ok(snap.heading) ? snap.heading : null;
    const comment = String(extra.comment || '').trim(), metres = extra.metres || [];
    const zone = String(extra.zone || '').trim() || snap.address || '';
    const accTxt = p && G.ok(p.acc) ? (p.acc < 10 ? G.fmt(p.acc, 1) : String(Math.round(p.acc))) : null;

    const lines = [];
    lines.push({ t: `${G.dateFR(snap.ts)}  ${G.timeFR(snap.ts)}${snap.chantier ? '      ' + snap.chantier : ''}`, w: 700, k: 1.06 });
    lines.push(xy ? { t: `${crs.label}     X ${G.fmt(xy.x, 2)}     Y ${G.fmt(xy.y, 2)}`, w: 700 }
      : { t: 'Position GPS indisponible', w: 700, c: '#FF9C94' });
    const sub = [];
    if (p && G.ok(p.alt)) sub.push(`Z ${G.fmt(p.alt, 1)} m (GPS)`);
    if (accTxt) sub.push(`Précision ±${accTxt} m`);
    if (h !== null) sub.push(`Cap ${Math.round(h)}° ${G.cardinal(h)}`);
    if (sub.length) lines.push({ t: sub.join('      ') });
    if (snap.address) lines.push({ t: snap.address });
    if (snap.operateur) lines.push({ t: `Opérateur : ${snap.operateur}`, k: 0.92, c: 'rgba(255,255,255,0.85)' });

    const out = compose(src, lines, { zone: zone && zone !== snap.address ? zone : '', metres, comment });
    const name = fileName(snap.ts, xy);
    const mtxt = metres.map((x) => `${x.name} ${G.qty(x.qty)} ${x.unit}`).join('; ');
    const desc = xy ? `${crs.label} X=${G.fixed(xy.x, 2)} Y=${G.fixed(xy.y, 2)}${zone ? ' - ' + zone : ''}` : 'Sans position GPS';
    const app1 = global.Exif.build({
      ts: snap.ts, offset: G.tzOffset(snap.ts),
      lat: p ? p.lat : null, lon: p ? p.lon : null, alt: p ? p.alt : null, acc: p ? p.acc : null, heading: h,
      width: out.width, height: out.height,
      description: desc,
      userComment: [mtxt, comment, desc].filter(Boolean).join(' | '),
      xpComment: [zone, mtxt, comment].filter(Boolean).join(' | '),
      xpSubject: snap.chantier, xpTitle: name, artist: snap.operateur, software: 'GeoCliche 1.1'
    });
    const jpg = await toBlob(out, 'image/jpeg', quality || 0.9);
    const bytes = global.Exif.insert(new Uint8Array(await jpg.arrayBuffer()), app1);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const thumb = await thumbFrom(out, 360, 0.76);
    const rec = {
      id: uid(), name, ts: snap.ts,
      lat: p ? p.lat : null, lon: p ? p.lon : null,
      alt: p && G.ok(p.alt) ? p.alt : null, acc: p && G.ok(p.acc) ? p.acc : null,
      altAcc: p && G.ok(p.altAcc) ? p.altAcc : null, heading: h,
      x93: p ? p.x93 : null, y93: p ? p.y93 : null, x49: p ? p.x49 : null, y49: p ? p.y49 : null,
      address: snap.address || '', zone, comment, metres,
      chantier: snap.chantier || '', operateur: snap.operateur || '', crs: key,
      width: out.width, height: out.height, size: blob.size, blob, thumb
    };
    release(out);
    return rec;
  }

  function loadImage(blob) {
    const url = URL.createObjectURL(blob);
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res({ img: i, url });
      i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
      i.src = url;
    });
  }
  /** Version réduite en dataURL (carte HTML). */
  async function dataUrlFrom(blob, max, q) {
    const { img, url } = await loadImage(blob);
    try {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/jpeg', q || 0.8);
      release(c);
      return d;
    } finally { URL.revokeObjectURL(url); }
  }
  /** Recadrage carré centré (vignettes du projet QGIS). */
  async function squareFrom(blob, size) {
    const { img, url } = await loadImage(blob);
    try {
      const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
      const b = await toBlob(c, 'image/jpeg', 0.82);
      release(c);
      return b;
    } finally { URL.revokeObjectURL(url); }
  }

  global.Photo = { build, compose, dataUrlFrom, squareFrom, release, fileName, toBlob };
})(window);
