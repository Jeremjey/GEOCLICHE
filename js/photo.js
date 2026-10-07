/* GéoCliché — fabrication de la photo finale : bandeau de coordonnées, commentaire, EXIF, vignette */
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

  /** Dessine la photo + bandeau incrusté en bas + bande blanche de commentaire sous l'image. */
  function compose(src, lines, comment) {
    const W = src.width, H = src.height;
    const fs = Math.max(13, Math.round(Math.min(W, H) * 0.028));
    const lh = Math.round(fs * 1.34), pad = Math.round(fs * 0.75), bar = Math.max(3, Math.round(fs * 0.24));
    const textX = bar + pad, maxW = W - textX - pad;

    const cfs = Math.round(fs * 1.06), clh = Math.round(cfs * 1.32);
    let cLines = [];
    if (comment && comment.trim()) {
      const m = document.createElement('canvas').getContext('2d');
      m.font = `500 ${cfs}px ${FONT}`;
      cLines = wrap(m, comment.trim(), maxW).slice(0, 14);
    }
    const cH = cLines.length ? pad * 2 + cLines.length * clh : 0;

    const out = document.createElement('canvas');
    out.width = W; out.height = H + cH;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);

    const heights = lines.map((l) => Math.round(lh * (l.k || 1)));
    const bh = pad * 2 + heights.reduce((s, h) => s + h, 0);
    ctx.fillStyle = 'rgba(20, 22, 25, 0.64)';
    ctx.fillRect(0, H - bh, W, bh);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(0, H - bh, bar, bh);
    ctx.textBaseline = 'middle';
    let y = H - bh + pad;
    lines.forEach((l, i) => {
      const s = Math.round(fs * (l.k || 1));
      ctx.font = `${l.w || 500} ${s}px ${FONT}`;
      ctx.fillStyle = l.c || '#FFFFFF';
      ctx.fillText(fitText(ctx, l.t, maxW), textX, y + heights[i] / 2);
      y += heights[i];
    });

    if (cH) {
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, H, W, cH);
      ctx.fillStyle = YELLOW; ctx.fillRect(0, H, bar, cH);
      ctx.fillStyle = '#16181B';
      ctx.font = `500 ${cfs}px ${FONT}`;
      cLines.forEach((t, i) => ctx.fillText(t, textX, H + pad + i * clh + clh / 2));
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

  /** snap = { ts, pos, heading, address, chantier, operateur, crs } */
  async function build(src, snap, comment, quality) {
    const p = snap.pos, key = snap.crs, crs = G.CRS[key];
    const xy = p ? G.xy(p, key) : null;
    const h = G.ok(snap.heading) ? snap.heading : null;
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

    const out = compose(src, lines, comment);
    const name = fileName(snap.ts, xy);
    const desc = xy ? `${crs.label} X=${G.fixed(xy.x, 2)} Y=${G.fixed(xy.y, 2)}${snap.address ? ' - ' + snap.address : ''}` : 'Sans position GPS';
    const app1 = global.Exif.build({
      ts: snap.ts, offset: G.tzOffset(snap.ts),
      lat: p ? p.lat : null, lon: p ? p.lon : null, alt: p ? p.alt : null, acc: p ? p.acc : null, heading: h,
      width: out.width, height: out.height,
      description: desc,
      userComment: [comment, desc].filter(Boolean).join(' | '),
      xpComment: [comment, snap.address].filter(Boolean).join(' | '),
      xpSubject: snap.chantier, xpTitle: name, artist: snap.operateur, software: 'GeoCliche 1.0'
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
      address: snap.address || '', comment: (comment || '').trim(),
      chantier: snap.chantier || '', operateur: snap.operateur || '', crs: key,
      width: out.width, height: out.height, size: blob.size, blob, thumb
    };
    release(out);
    return rec;
  }

  /** Charge un Blob image et renvoie une version réduite (dataURL) — pour la carte HTML. */
  async function dataUrlFrom(blob, max, q) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Image illisible'));
        i.src = url;
      });
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/jpeg', q || 0.8);
      release(c);
      return d;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Recadrage carré centré (vignettes du projet QGIS). */
  async function squareFrom(blob, size) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Image illisible'));
        i.src = url;
      });
      const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
      const b = await toBlob(c, 'image/jpeg', 0.82);
      release(c);
      return b;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  global.Photo = { build, compose, dataUrlFrom, squareFrom, release, fileName, toBlob };
})(window);
