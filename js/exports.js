/* GéoCliché — exports : CSV, ZIP, QGIS, KMZ, DXF, points TXT, carte HTML */
(function (global) {
  'use strict';
  const G = global.Geo;

  const MIME = {
    csv: 'text/csv;charset=utf-8', zip: 'application/zip', kmz: 'application/vnd.google-earth.kmz',
    dxf: 'application/dxf', txt: 'text/plain;charset=utf-8', html: 'text/html;charset=utf-8'
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  const r = (v, d) => (G.ok(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

  /** Copie triée chronologiquement, numérotée 1..n, noms de fichiers garantis uniques. */
  function prepare(list) {
    const used = new Set();
    return list.slice().sort((a, b) => a.ts - b.ts).map((p, i) => {
      let name = p.name, k = 2;
      while (used.has(name)) name = p.name.replace(/\.jpg$/i, `_${k++}.jpg`);
      used.add(name);
      return Object.assign({}, p, { n: i + 1, name });
    });
  }
  const located = (P) => P.filter((p) => G.ok(p.lat) && G.ok(p.lon));
  const baseName = (ctx) => ['GeoCliche', slug(ctx.chantier), G.stamp(Date.now()).slice(0, 8)].filter(Boolean).join('_');
  const tick = (ctx, i, n, label) => { if (ctx.progress) ctx.progress(i, n, label); };
  const pause = () => new Promise((res) => setTimeout(res, 0));

  // ---------------------------------------------------------------- CSV
  function csv(P) {
    const H = ['N°', 'Fichier', 'Date', 'Heure', 'Chantier', 'X_L93', 'Y_L93', 'X_CC49', 'Y_CC49', 'Z_GPS_m',
      'Precision_m', 'Cap_deg', 'Latitude', 'Longitude', 'Adresse', 'Commentaire', 'Operateur', 'Lien_carte'];
    const q = (v) => { const s = String(v == null ? '' : v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [H.join(';')];
    P.forEach((p) => {
      const has = G.ok(p.lat);
      rows.push([p.n, p.name, G.dateFR(p.ts), G.timeFR(p.ts), p.chantier,
        G.dec(p.x93, 2), G.dec(p.y93, 2), G.dec(p.x49, 2), G.dec(p.y49, 2), G.dec(p.alt, 1), G.dec(p.acc, 1),
        G.ok(p.heading) ? Math.round(p.heading) : '', G.dec(p.lat, 7), G.dec(p.lon, 7), p.address, p.comment, p.operateur,
        has ? `https://www.google.com/maps?q=${p.lat.toFixed(7)},${p.lon.toFixed(7)}` : ''].map(q).join(';'));
    });
    return '\uFEFF' + rows.join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------- GeoJSON
  function geojson(P, key, dir) {
    const c = G.CRS[key];
    return JSON.stringify({
      type: 'FeatureCollection', name: 'photos',
      crs: { type: 'name', properties: { name: `urn:ogc:def:crs:EPSG::${c.epsg}` } },
      features: P.map((p) => {
        const { x, y } = G.xy(p, key);
        return {
          type: 'Feature',
          properties: {
            num: p.n, fichier: p.name, photo: (dir || 'photos/') + p.name, vignette: 'vignettes/' + p.name, date: G.isoLocal(p.ts),
            chantier: p.chantier || '', x: r(x, 3), y: r(y, 3), z: r(p.alt, 2), precision: r(p.acc, 1),
            cap: G.ok(p.heading) ? Math.round(p.heading) : null, lat: r(p.lat, 8), lon: r(p.lon, 8),
            adresse: p.address || '', commentaire: p.comment || '', operateur: p.operateur || ''
          },
          geometry: { type: 'Point', coordinates: [r(x, 3), r(y, 3)] }
        };
      })
    });
  }

  // ---------------------------------------------------------------- KML
  function kml(P, ctx, dir) {
    const key = ctx.crs, c = G.CRS[key];
    const marks = P.map((p) => {
      const { x, y } = G.xy(p, key);
      const info = [
        `${G.dateFR(p.ts)} ${G.timeFR(p.ts)}`,
        `${c.label} X ${G.fixed(x, 2)} Y ${G.fixed(y, 2)}`,
        [G.ok(p.alt) ? `Z GPS ${G.fixed(p.alt, 1)} m` : '', G.ok(p.acc) ? `précision ±${G.fixed(p.acc, 1)} m` : '',
          G.ok(p.heading) ? `cap ${Math.round(p.heading)}°` : ''].filter(Boolean).join(', '),
        p.address || ''
      ].filter(Boolean).map(esc).join('<br/>');
      const desc = `<img src="${dir}${esc(p.name)}" width="480"/><br/><b>${esc(p.name)}</b><br/>${info}` +
        (p.comment ? `<br/><i>${esc(p.comment)}</i>` : '');
      const data = { fichier: p.name, chantier: p.chantier, x: G.fixed(x, 2), y: G.fixed(y, 2), z: G.fixed(p.alt, 2), adresse: p.address, commentaire: p.comment };
      const ext = Object.keys(data).map((k) => `<Data name="${k}"><value>${esc(data[k])}</value></Data>`).join('');
      return `  <Placemark><name>${p.n}</name><description><![CDATA[${desc.replace(/]]>/g, ']]&gt;')}]]></description>` +
        `<TimeStamp><when>${new Date(p.ts).toISOString()}</when></TimeStamp><styleUrl>#photo</styleUrl>` +
        `<ExtendedData>${ext}</ExtendedData><Point><coordinates>${p.lon.toFixed(8)},${p.lat.toFixed(8)},0</coordinates></Point></Placemark>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${esc(ctx.title)}</name>
  <Style id="photo"><IconStyle><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/camera.png</href></Icon></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>
${marks.join('\n')}
</Document>
</kml>
`;
  }

  // ---------------------------------------------------------------- DXF (R12, ANSI 1252)
  const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A,
    0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F, 0x00A0: 0x20, 0x202F: 0x20 };
  function cp1252(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      out[i] = CP1252[c] || (c < 0x80 || (c >= 0xA0 && c <= 0xFF) ? c : 0x3F);
    }
    return out;
  }

  function dxf(P, key) {
    const L = [];
    const g = (code, val) => { L.push(String(code).padStart(3, ' ')); L.push(String(val)); };
    const f = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
    const clean = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').slice(0, 250);
    const TH = 0.8;
    const pts = P.map((p) => Object.assign({ p, z: G.ok(p.alt) ? p.alt : 0 }, G.xy(p, key)));
    const xs = pts.map((o) => o.x), ys = pts.map((o) => o.y);
    const ext = pts.length ? [Math.min(...xs) - 10, Math.min(...ys) - 10, Math.max(...xs) + 10, Math.max(...ys) + 10] : [0, 0, 100, 100];
    const ATT = [
      ['NUM', 'Numero', 0, (p) => p.n],
      ['FICHIER', 'Fichier', 1, (p) => p.name],
      ['DATE', 'Date', 1, (p) => `${G.dateFR(p.ts)} ${G.timeFR(p.ts)}`],
      ['Z', 'Altitude GPS', 1, (p) => G.fixed(p.alt, 2)],
      ['PRECISION', 'Precision (m)', 1, (p) => G.fixed(p.acc, 1)],
      ['CAP', 'Cap (deg)', 1, (p) => (G.ok(p.heading) ? Math.round(p.heading) : '')],
      ['ADRESSE', 'Adresse', 1, (p) => p.address],
      ['COMMENTAIRE', 'Commentaire', 1, (p) => p.comment]
    ];
    const attPos = (i) => (i === 0 ? [0.6, 0.25] : [0.6, -0.4 - i * TH * 1.4]);

    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
    g(9, '$INSBASE'); g(10, '0.0'); g(20, '0.0'); g(30, '0.0');
    g(9, '$EXTMIN'); g(10, f(ext[0])); g(20, f(ext[1])); g(30, '0.0');
    g(9, '$EXTMAX'); g(10, f(ext[2])); g(20, f(ext[3])); g(30, '0.0');
    g(9, '$PDMODE'); g(70, 34);
    g(9, '$PDSIZE'); g(40, '0.5');
    g(0, 'ENDSEC');

    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, '0.0');
    g(0, 'ENDTAB');
    const layers = [['0', 7], ['PHOTOS', 1], ['PHOTOS_PT', 1], ['PHOTOS_CAP', 3], ['PHOTOS_NOM', 8]];
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
    layers.forEach(([n, c]) => { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, c); g(6, 'CONTINUOUS'); });
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, '0.0'); g(41, '1.0'); g(50, '0.0'); g(71, 0); g(42, '1.0'); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    g(0, 'SECTION'); g(2, 'BLOCKS');
    g(0, 'BLOCK'); g(8, '0'); g(2, 'PHOTO'); g(70, 2); g(10, '0.0'); g(20, '0.0'); g(30, '0.0'); g(3, 'PHOTO');
    g(0, 'CIRCLE'); g(8, '0'); g(10, '0.0'); g(20, '0.0'); g(30, '0.0'); g(40, '0.4');
    g(0, 'LINE'); g(8, '0'); g(10, '-0.6'); g(20, '0.0'); g(30, '0.0'); g(11, '0.6'); g(21, '0.0'); g(31, '0.0');
    g(0, 'LINE'); g(8, '0'); g(10, '0.0'); g(20, '-0.6'); g(30, '0.0'); g(11, '0.0'); g(21, '0.6'); g(31, '0.0');
    ATT.forEach(([tag, prompt, flag], i) => {
      const [dx, dy] = attPos(i);
      g(0, 'ATTDEF'); g(8, '0'); g(10, f(dx)); g(20, f(dy)); g(30, '0.0'); g(40, f(TH));
      g(1, ''); g(3, prompt); g(2, tag); g(70, flag);
    });
    g(0, 'ENDBLK'); g(8, '0');
    g(0, 'ENDSEC');

    g(0, 'SECTION'); g(2, 'ENTITIES');
    pts.forEach(({ p, x, y, z }) => {
      g(0, 'POINT'); g(8, 'PHOTOS_PT'); g(10, f(x)); g(20, f(y)); g(30, f(z));
      g(0, 'INSERT'); g(8, 'PHOTOS'); g(66, 1); g(2, 'PHOTO'); g(10, f(x)); g(20, f(y)); g(30, f(z));
      ATT.forEach(([tag, , flag, val], i) => {
        const [dx, dy] = attPos(i);
        g(0, 'ATTRIB'); g(8, 'PHOTOS'); g(10, f(x + dx)); g(20, f(y + dy)); g(30, f(z)); g(40, f(TH));
        g(1, clean(val(p))); g(2, tag); g(70, flag);
      });
      g(0, 'SEQEND'); g(8, 'PHOTOS');
      if (G.ok(p.heading)) {
        const a = p.heading * Math.PI / 180, len = 3;
        g(0, 'LINE'); g(8, 'PHOTOS_CAP'); g(10, f(x)); g(20, f(y)); g(30, f(z));
        g(11, f(x + len * Math.sin(a))); g(21, f(y + len * Math.cos(a))); g(31, f(z));
      }
      g(0, 'TEXT'); g(8, 'PHOTOS_NOM'); g(10, f(x + 0.6)); g(20, f(y - 0.75)); g(30, f(z)); g(40, f(TH * 0.5)); g(1, clean(p.name));
    });
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return cp1252(L.join('\r\n') + '\r\n');
  }

  // ---------------------------------------------------------------- Points TXT (Covadis, Mensura…)
  function txt(P, key) {
    return P.map((p) => {
      const { x, y } = G.xy(p, key);
      return [p.n, G.fixed(x, 3), G.fixed(y, 3), G.fixed(G.ok(p.alt) ? p.alt : 0, 3), 'PHOTO', p.name].join(' ');
    }).join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------- Projet QGIS
  function qgs(P, ctx) {
    return global.QgisProject.build(P, ctx);
  }

  // ---------------------------------------------------------------- fichiers
  async function addPhotos(z, P, ctx, dir, label) {
    for (let i = 0; i < P.length; i++) {
      tick(ctx, i, P.length, label || 'Ajout des photos');
      await z.add(dir + P[i].name, P[i].blob, P[i].ts);
    }
    tick(ctx, P.length, P.length, label || 'Ajout des photos');
  }

  /** Vignettes carrées pour l'affichage des photos dans QGIS (taille fixe, sans déborder du cadre). */
  async function addVignettes(z, P, ctx) {
    for (let i = 0; i < P.length; i++) {
      tick(ctx, i, P.length, 'Vignettes QGIS');
      const v = await global.Photo.squareFrom(P[i].thumb || P[i].blob, 270);
      await z.add('vignettes/' + P[i].name, v, P[i].ts);
    }
  }

  const kinds = {
    async csv(list, ctx) {
      return { blob: new Blob([csv(prepare(list))], { type: MIME.csv }), name: baseName(ctx) + '.csv' };
    },
    async zipPhotos(list, ctx) {
      const P = prepare(list), z = new global.ZipWriter();
      await z.add('photos.csv', csv(P));
      await addPhotos(z, P, ctx, 'photos/');
      return { blob: z.blob(), name: baseName(ctx) + '_photos.zip' };
    },
    async qgis(list, ctx) {
      const P = prepare(list), Lc = located(P), z = new global.ZipWriter();
      await z.add(baseName(ctx) + '.qgs', qgs(Lc, ctx));
      await z.add('photos.geojson', geojson(Lc, ctx.crs, 'photos/'));
      await z.add('photos.csv', csv(P));
      await addVignettes(z, Lc, ctx);
      await addPhotos(z, P, ctx, 'photos/');
      return { blob: z.blob(), name: baseName(ctx) + '_QGIS.zip', skipped: P.length - Lc.length };
    },
    async kmz(list, ctx) {
      const P = located(prepare(list)), z = new global.ZipWriter();
      await z.add('doc.kml', kml(P, ctx, 'files/'));
      await addPhotos(z, P, ctx, 'files/');
      return { blob: z.blob(MIME.kmz), name: baseName(ctx) + '.kmz', skipped: list.length - P.length };
    },
    async dxf(list, ctx) {
      const P = located(prepare(list));
      return { blob: new Blob([dxf(P, ctx.crs)], { type: MIME.dxf }), name: `${baseName(ctx)}_${ctx.crs}.dxf`, skipped: list.length - P.length };
    },
    async txt(list, ctx) {
      const P = located(prepare(list));
      return { blob: new Blob([txt(P, ctx.crs)], { type: MIME.txt }), name: `${baseName(ctx)}_points_${ctx.crs}.txt`, skipped: list.length - P.length };
    },
    async html(list, ctx) {
      const P = located(prepare(list));
      const [js, css] = await Promise.all([
        fetch('lib/leaflet.js').then((x) => x.text()),
        fetch('lib/leaflet.css').then((x) => x.text())
      ]);
      const c = G.CRS[ctx.crs], photos = [];
      for (let i = 0; i < P.length; i++) {
        tick(ctx, i, P.length, 'Préparation des images');
        const p = P[i], { x, y } = G.xy(p, ctx.crs);
        photos.push({
          n: p.n, name: p.name, date: G.dateFR(p.ts), time: G.timeFR(p.ts).slice(0, 5),
          xf: G.fmt(x, 2), yf: G.fmt(y, 2), z: G.ok(p.alt) ? G.fmt(p.alt, 1) : '',
          acc: G.ok(p.acc) ? G.fmt(p.acc, 1) : '', cap: G.ok(p.heading) ? Math.round(p.heading) : '',
          lat: p.lat, lon: p.lon, address: p.address || '', comment: p.comment || '', chantier: p.chantier || '',
          img: await global.Photo.dataUrlFrom(p.blob, 1600, 0.8)
        });
        await pause();
      }
      const html = global.Report.build({
        title: ctx.title, chantier: ctx.chantier || '', crs: c.label, crsName: c.name,
        generated: `${G.dateFR(Date.now())} ${G.timeFR(Date.now()).slice(0, 5)}`, photos
      }, { js, css });
      return { blob: new Blob([html], { type: MIME.html }), name: baseName(ctx) + '_carte.html', skipped: list.length - P.length };
    },
    async all(list, ctx) {
      const P = prepare(list), Lc = located(P), z = new global.ZipWriter();
      await z.add('photos.csv', csv(P));
      await z.add('photos.geojson', geojson(Lc, ctx.crs, 'photos/'));
      await z.add(baseName(ctx) + '.qgs', qgs(Lc, ctx));
      await z.add(`photos_${ctx.crs}.dxf`, dxf(Lc, ctx.crs));
      await z.add(`points_${ctx.crs}.txt`, txt(Lc, ctx.crs));
      await z.add('photos.kml', kml(Lc, ctx, 'photos/'));
      await addVignettes(z, Lc, ctx);
      await addPhotos(z, P, ctx, 'photos/');
      return { blob: z.blob(), name: baseName(ctx) + '_complet.zip', skipped: P.length - Lc.length };
    }
  };

  global.Exports = { kinds, csv, geojson, kml, dxf, txt, prepare, located, esc, slug, MIME };
})(typeof window !== 'undefined' ? window : globalThis);
