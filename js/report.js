/* GéoCliché — export « Carte HTML » : un seul fichier avec carte, photos et rapport PDF imprimable */
(function (global) {
  'use strict';

  const LAYERS_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2324282C' stroke-width='2' stroke-linejoin='round'%3E%3Cpath d='M12 3 2 8l10 5 10-5-10-5z'/%3E%3Cpath d='m2 13 10 5 10-5'/%3E%3Cpath d='m2 17.5 10 5 10-5'/%3E%3C/svg%3E";

  const CSS = `
:root{--j:#FFC400;--e:#24282C;--b:#ECEEEB;--ink:#16181B;--mut:#5A6168;color-scheme:light}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--b);-webkit-text-size-adjust:100%}
.app{display:flex;flex-direction:column;min-height:100%}
.top{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px;background:var(--e);color:#fff;border-bottom:4px solid var(--j);position:sticky;top:0;z-index:1000}
.top h1{margin:0;font-size:18px;line-height:1.2}
.top p{margin:3px 0 0;font-size:13px;color:#C9CED3;max-width:70ch}
.acts{display:flex;gap:8px;flex-shrink:0}
.btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;font:600 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:var(--j);color:var(--ink);cursor:pointer}
.btn.ghost{background:transparent;color:inherit;box-shadow:inset 0 0 0 1.5px currentColor}
.btn:disabled{opacity:.45;cursor:default}
.btn:focus-visible,input:focus-visible+span,input[type=text]:focus-visible,.card:focus-visible{outline:3px solid #2D7FF9;outline-offset:2px}
.main{flex:1;display:flex;flex-direction:column}
#map{height:62vh;min-height:320px;background:#dfe2e0}
.list{padding:12px;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));align-content:start}
@media (min-width:960px){
  .main{flex-direction:row;height:calc(100vh - 66px)}
  #map{flex:1;height:auto}
  .list{width:400px;overflow:auto;grid-template-columns:1fr}
}
.card{background:#fff;border-radius:12px;overflow:hidden;cursor:pointer;display:grid;grid-template-columns:118px 1fr;min-height:112px;border:1px solid #D9DCDF}
.card img{width:118px;height:100%;object-fit:cover;background:#ccc;display:block}
.ci{padding:10px 12px;font-size:13px;min-width:0}
.ci p{margin:0 0 4px;overflow-wrap:anywhere}
.cn{display:flex;align-items:center;gap:8px;color:var(--mut)}
.badge{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 6px;border-radius:12px;background:var(--j);color:var(--ink);font-weight:800;font-size:12px;line-height:1}
.cx{font-variant-numeric:tabular-nums;font-weight:600}
.ca{color:var(--mut)}
.cc{font-style:italic}
.empty{color:var(--mut)}
.nm{background:none;border:0}
.nm span{display:grid;place-items:center;width:26px;height:26px;border-radius:13px;background:var(--j);color:var(--ink);font:800 12px/1 system-ui,-apple-system,Arial,sans-serif;border:2px solid var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.35);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pp{margin:0}
.pp img{display:block;width:100%;max-height:230px;object-fit:contain;background:#2B2F33;border-radius:6px}
.pp figcaption{margin-top:6px;font-size:12.5px;line-height:1.4}
.leaflet-control-layers-toggle{background-image:url("${LAYERS_ICON}")!important;background-size:22px 22px!important}
.dlg{position:fixed;inset:0;background:rgba(20,22,25,.55);display:grid;place-items:center;z-index:3000;padding:16px}
.dlg[hidden],.pv[hidden]{display:none}
.box{background:#fff;border-radius:16px;padding:20px;width:min(420px,100%)}
.box h2{margin:0 0 14px;font-size:18px}
.box label.f{display:block;font-size:14px;font-weight:600;margin-bottom:14px}
.box input[type=text]{display:block;width:100%;margin-top:6px;padding:10px 12px;border:1.5px solid #C5CAD0;border-radius:10px;font:inherit}
fieldset{border:0;padding:0;margin:0 0 14px;display:flex;gap:8px;flex-wrap:wrap}
legend{font-size:14px;font-weight:600;margin-bottom:6px;padding:0}
.seg{position:relative;cursor:pointer}
.seg input{position:absolute;opacity:0;pointer-events:none}
.seg span{display:block;padding:9px 14px;border-radius:10px;background:var(--b);font-weight:600;font-size:14px}
.seg input:checked+span{background:var(--e);color:#fff}
.hint{font-size:13px;color:var(--mut);margin:0 0 16px}
.row{display:flex;justify-content:flex-end;gap:8px}
.box .btn.ghost{color:var(--ink)}
.pv{position:fixed;inset:0;z-index:4000;background:#5B6066;overflow:auto;-webkit-overflow-scrolling:touch}
.pvbar{position:sticky;top:0;left:0;display:flex;gap:8px;align-items:center;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;background:var(--e);color:#fff;z-index:2}
.pvbar span{flex:1;font-size:14px}
#print{padding:16px;display:flex;flex-direction:column;align-items:center;gap:16px}
.page{background:#fff;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.35);flex:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ph{border-bottom:2mm solid var(--j);padding:0 0 3mm;margin-bottom:4mm}
.ph h1{margin:0;font-size:18pt;line-height:1.15}
.ph h2{margin:0;font-size:11pt}
.ph p{margin:1.5mm 0 0;font-size:9.5pt;color:var(--mut)}
.ph.small{border-bottom-width:1mm;padding-bottom:2mm;display:flex;justify-content:space-between;align-items:baseline;gap:4mm}
.ph.small p{margin:0;white-space:nowrap}
#pmap{flex:1;border:.3mm solid #9AA0A6;background:#e7e9e8}
.pf{display:flex;justify-content:space-between;gap:4mm;font-size:7.5pt;color:var(--mut);padding-top:2.5mm}
.grid{flex:1;display:grid;gap:4mm;min-height:0}
.pc{margin:0;display:flex;flex-direction:column;min-height:0;border:.3mm solid #D3D6D9;border-radius:2mm;overflow:hidden}
.pi{flex:1;min-height:0;background:#EFF0F1;display:flex}
.pi img{width:100%;height:100%;object-fit:contain;display:block}
.pc figcaption{padding:2mm 2.5mm;font-size:7.8pt;line-height:1.35}
.pc figcaption p{margin:0 0 .5mm;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.pn{display:flex;align-items:center;gap:2mm;font-weight:600}
.pn .badge{min-width:5.5mm;height:5.5mm;font-size:7.5pt;border-radius:3mm}
.pcm{font-style:italic}
@media print{
  html,body{height:auto;background:#fff}
  body.previewing>:not(#pv){display:none!important}
  .pv{position:static;overflow:visible;background:none}
  .pvbar{display:none}
  #print{padding:0;gap:0;display:block}
  .page{box-shadow:none;break-after:page;page-break-after:always;margin:0}
  .page:last-child{break-after:auto;page-break-after:auto}
}`;

  const BODY = `
<div class="app">
  <header class="top">
    <div><h1 id="tTitle"></h1><p id="tMeta"></p></div>
    <div class="acts"><button id="bPdf" class="btn" type="button">Exporter en PDF</button></div>
  </header>
  <main class="main"><div id="map" aria-label="Carte des photos"></div><section id="list" class="list" aria-label="Photos"></section></main>
</div>
<div id="dlg" class="dlg" hidden role="dialog" aria-modal="true" aria-labelledby="dlgT">
  <div class="box">
    <h2 id="dlgT">Exporter en PDF</h2>
    <label class="f">Titre du rapport<input id="pTitle" type="text"></label>
    <fieldset><legend>Format</legend>
      <label class="seg"><input type="radio" name="fmt" value="A4" checked><span>A4</span></label>
      <label class="seg"><input type="radio" name="fmt" value="A3"><span>A3</span></label>
    </fieldset>
    <fieldset><legend>Orientation</legend>
      <label class="seg"><input type="radio" name="ori" value="portrait" checked><span>Portrait</span></label>
      <label class="seg"><input type="radio" name="ori" value="paysage"><span>Paysage</span></label>
    </fieldset>
    <p class="hint">Page 1 : la carte avec les numéros des photos. Pages suivantes : 6 photos par page avec leurs coordonnées.</p>
    <div class="row"><button id="pCancel" class="btn ghost" type="button">Annuler</button><button id="pGo" class="btn" type="button">Préparer</button></div>
  </div>
</div>
<div id="pv" class="pv" hidden>
  <div class="pvbar"><span id="pvMsg"></span><button id="pvClose" class="btn ghost" type="button">Fermer</button><button id="pvPrint" class="btn" type="button" disabled>Imprimer ou enregistrer en PDF</button></div>
  <div id="print"></div>
</div>`;

  /* ------------------------------------------------------------------
     Code exécuté dans le fichier HTML exporté (sérialisé tel quel).
     N'utiliser ici que D, L et le DOM.
     ------------------------------------------------------------------ */
  function reportMain(D) {
    'use strict';
    var $ = function (s) { return document.querySelector(s); };
    var esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    var WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
    var BASES = [
      { name: 'Plan IGN', url: WMTS + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png', o: { maxNativeZoom: 19, maxZoom: 21, attribution: '© IGN' } },
      { name: 'Photo aérienne IGN', url: WMTS + '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg', o: { maxNativeZoom: 19, maxZoom: 21, attribution: '© IGN' } },
      { name: 'OSM France', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', o: { subdomains: 'abc', maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap France, © contributeurs OpenStreetMap' } },
      { name: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', o: { subdomains: 'abc', maxNativeZoom: 17, maxZoom: 21, attribution: '© OpenStreetMap, SRTM, © OpenTopoMap (CC-BY-SA)' } }
    ];
    var cur = 0;

    // Les images arrivent en base64 : on les convertit une fois en URL de blob (moins de mémoire)
    D.photos.forEach(function (p) {
      try {
        var i = p.img.indexOf(','), bin = atob(p.img.slice(i + 1)), u = new Uint8Array(bin.length);
        for (var k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
        p.src = URL.createObjectURL(new Blob([u], { type: 'image/jpeg' }));
      } catch (e) { p.src = p.img; }
      p.img = null;
    });

    function tile(i) { return L.tileLayer(BASES[i].url, BASES[i].o); }
    function icon(n) { return L.divIcon({ className: 'nm', html: '<span>' + n + '</span>', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] }); }
    function fit(m, pad) {
      var P = D.photos;
      if (!P.length) { m.setView([46.6, 2.4], 6); return; }
      if (P.length === 1) { m.setView([P[0].lat, P[0].lon], 18); return; }
      m.fitBounds(L.latLngBounds(P.map(function (p) { return [p.lat, p.lon]; })), { padding: [pad, pad], maxZoom: 19 });
    }
    function metrics(p) {
      return [p.z !== '' ? 'Z ' + p.z + ' m (GPS)' : '', p.acc !== '' ? 'précision ±' + p.acc + ' m' : '', p.cap !== '' ? 'cap ' + p.cap + '°' : '']
        .filter(Boolean).join(', ');
    }
    function metaText() {
      var n = D.photos.length, parts = [];
      if (D.chantier && D.chantier !== D.title) parts.push(D.chantier);
      parts.push(n + (n > 1 ? ' photos' : ' photo'));
      if (n) {
        var a = D.photos[0].date, b = D.photos[n - 1].date;
        parts.push(a === b ? 'prises le ' + a : 'prises du ' + a + ' au ' + b);
      }
      return parts.join(', ') + '. Coordonnées ' + D.crsName + '.';
    }

    $('#tTitle').textContent = D.title;
    $('#tMeta').textContent = metaText();
    document.title = D.title;

    // ---------- carte ----------
    var map = L.map('map', { zoomControl: true });
    var layers = {};
    BASES.forEach(function (b, i) { layers[b.name] = tile(i); });
    layers[BASES[0].name].addTo(map);
    L.control.layers(layers, null, { collapsed: true }).addTo(map);
    map.on('baselayerchange', function (e) { BASES.forEach(function (b, i) { if (b.name === e.name) cur = i; }); });
    L.control.scale({ imperial: false }).addTo(map);
    var marks = {};
    D.photos.forEach(function (p) {
      var html = '<figure class="pp"><img src="' + p.src + '" alt="Photo ' + p.n + '"><figcaption><span class="badge">' + p.n + '</span> ' +
        esc(p.date) + ' ' + esc(p.time) + '<br>' + esc(D.crs) + ' X ' + esc(p.xf) + ' Y ' + esc(p.yf) +
        (p.address ? '<br>' + esc(p.address) : '') + (p.comment ? '<br><i>' + esc(p.comment) + '</i>' : '') + '</figcaption></figure>';
      marks[p.n] = L.marker([p.lat, p.lon], { icon: icon(p.n), title: p.name }).addTo(map).bindPopup(html, { maxWidth: 320, minWidth: 240 });
    });
    fit(map, 40);

    // ---------- liste ----------
    var list = $('#list');
    list.innerHTML = D.photos.length ? D.photos.map(function (p) {
      return '<article class="card" tabindex="0" data-n="' + p.n + '"><img loading="lazy" src="' + p.src + '" alt="Photo ' + p.n + '">' +
        '<div class="ci"><p class="cn"><span class="badge">' + p.n + '</span><span>' + esc(p.date) + ' ' + esc(p.time) + '</span></p>' +
        '<p class="cx">' + esc(D.crs) + ' X ' + esc(p.xf) + ' Y ' + esc(p.yf) + '</p>' +
        (p.address ? '<p class="ca">' + esc(p.address) + '</p>' : '') +
        (p.comment ? '<p class="cc">' + esc(p.comment) + '</p>' : '') + '</div></article>';
    }).join('') : '<p class="empty">Aucune photo géolocalisée dans cet export.</p>';
    function openCard(el) {
      var m = marks[el.getAttribute('data-n')];
      if (!m) return;
      document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'start' });
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 18));
      m.openPopup();
    }
    list.addEventListener('click', function (e) { var c = e.target.closest('.card'); if (c) openCard(c); });
    list.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.classList.contains('card')) openCard(e.target); });

    // ---------- rapport PDF ----------
    var PAPER = { A4: [210, 297], A3: [297, 420] }, pmap = null;
    function val(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
    function card(p) {
      return '<figure class="pc"><div class="pi"><img src="' + p.src + '" alt=""></div><figcaption>' +
        '<p class="pn"><span class="badge">' + p.n + '</span>' + esc(p.date) + ' ' + esc(p.time) + '</p>' +
        '<p>' + esc(D.crs) + ' X ' + esc(p.xf) + ' Y ' + esc(p.yf) + '</p>' +
        (p.address ? '<p>' + esc(p.address) + '</p>' : '') +
        (metrics(p) ? '<p>' + esc(metrics(p)) + '</p>' : '') +
        (p.comment ? '<p class="pcm">' + esc(p.comment) + '</p>' : '') + '</figcaption></figure>';
    }
    function closePreview() {
      $('#pv').hidden = true;
      document.body.classList.remove('previewing');
      if (pmap) { pmap.remove(); pmap = null; }
      $('#print').innerHTML = '';
    }
    function prepare() {
      var fmt = val('fmt') || 'A4', land = val('ori') === 'paysage';
      var dims = PAPER[fmt].slice();
      if (land) dims.reverse();
      var M = 10, W = dims[0] - 2 * M, H = dims[1] - 2 * M - 1;
      $('#pageStyle').textContent = '@page{size:' + fmt + ' ' + (land ? 'landscape' : 'portrait') + ';margin:' + M + 'mm}' +
        '.page{width:' + W + 'mm;height:' + H + 'mm}' +
        '.grid{grid-template-columns:repeat(' + (land ? 3 : 2) + ',minmax(0,1fr));grid-template-rows:repeat(' + (land ? 2 : 3) + ',minmax(0,1fr))}';
      var title = $('#pTitle').value.trim() || D.title;
      var root = $('#print');
      closePreview();
      var per = 6, pages = Math.ceil(D.photos.length / per), total = pages + 1;
      var p1 = document.createElement('section');
      p1.className = 'page';
      p1.innerHTML = '<header class="ph"><h1>' + esc(title) + '</h1><p>' + esc(metaText()) + '</p></header><div id="pmap"></div>' +
        '<footer class="pf"><span>Positions issues du GPS du téléphone, précision indicative.</span><span>Édité le ' + esc(D.generated) + ', page 1 / ' + total + '</span></footer>';
      root.appendChild(p1);
      for (var i = 0; i < pages; i++) {
        var chunk = D.photos.slice(i * per, i * per + per), pg = document.createElement('section');
        pg.className = 'page';
        pg.innerHTML = '<header class="ph small"><h2>' + esc(title) + '</h2><p>Photos ' + chunk[0].n + ' à ' + chunk[chunk.length - 1].n + '</p></header>' +
          '<div class="grid">' + chunk.map(card).join('') + '</div>' +
          '<footer class="pf"><span>' + esc(D.crsName) + '</span><span>Page ' + (i + 2) + ' / ' + total + '</span></footer>';
        root.appendChild(pg);
      }
      $('#pv').hidden = false;
      document.body.classList.add('previewing');
      $('#pvPrint').disabled = true;
      $('#pvMsg').textContent = 'Chargement du fond de carte…';
      pmap = L.map('pmap', { zoomControl: false, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false, inertia: false, zoomSnap: 0.25 });
      var tl = tile(cur).addTo(pmap);
      L.control.scale({ imperial: false, maxWidth: 180 }).addTo(pmap);
      D.photos.forEach(function (p) { L.marker([p.lat, p.lon], { icon: icon(p.n), interactive: false, keyboard: false }).addTo(pmap); });
      fit(pmap, 30);
      var done = false;
      function ready() {
        if (done) return;
        done = true;
        $('#pvPrint').disabled = false;
        $('#pvMsg').textContent = 'Aperçu prêt : ' + total + (total > 1 ? ' pages.' : ' page.');
      }
      tl.on('load', function () { setTimeout(ready, 300); });
      setTimeout(ready, 12000);
    }
    $('#bPdf').onclick = function () { $('#pTitle').value = D.title; $('#dlg').hidden = false; $('#pTitle').focus(); };
    $('#pCancel').onclick = function () { $('#dlg').hidden = true; };
    $('#pGo').onclick = function () { $('#dlg').hidden = true; prepare(); };
    $('#pvClose').onclick = closePreview;
    $('#pvPrint').onclick = function () { window.print(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('#dlg').hidden = true; } });
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

  function build(D, libs) {
    return '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
      '<title>' + esc(D.title) + '</title>' +
      '<style>' + libs.css + '</style><style>' + CSS + '</style><style id="pageStyle"></style></head><body>' +
      BODY +
      '<script>' + libs.js.replace(/<\/script/gi, '<\\/script') + '</' + 'script>' +
      '<script>(' + reportMain.toString() + ')(' + safeJson(D) + ');</' + 'script></body></html>';
  }

  global.Report = { build, reportMain };
})(typeof window !== 'undefined' ? window : globalThis);
