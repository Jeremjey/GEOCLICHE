/* GéoCliché — géodésie : projections Lambert 93 / CC49, formats, adresse, cap */
(function (global) {
  'use strict';

  const CRS = {
    L93: {
      key: 'L93', epsg: 2154, code: 'EPSG:2154', label: 'Lambert 93', name: 'RGF93 v1 / Lambert-93',
      def: '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
    },
    CC49: {
      key: 'CC49', epsg: 3949, code: 'EPSG:3949', label: 'CC49', name: 'RGF93 v1 / CC49',
      def: '+proj=lcc +lat_0=49 +lon_0=3 +lat_1=48.25 +lat_2=49.75 +x_0=1700000 +y_0=8200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
    }
  };
  if (global.proj4) {
    global.proj4.defs(CRS.L93.code, CRS.L93.def);
    global.proj4.defs(CRS.CC49.code, CRS.CC49.def);
  }

  function project(lon, lat, key) {
    const p = global.proj4('EPSG:4326', CRS[key].code, [lon, lat]);
    return { x: p[0], y: p[1] };
  }
  function both(lon, lat) {
    const a = project(lon, lat, 'L93'), b = project(lon, lat, 'CC49');
    return { x93: a.x, y93: a.y, x49: b.x, y49: b.y };
  }
  function xy(rec, key) {
    return key === 'CC49' ? { x: rec.x49, y: rec.y49 } : { x: rec.x93, y: rec.y93 };
  }
  const other = (key) => (key === 'CC49' ? 'L93' : 'CC49');

  // ---------- formats ----------
  const nfCache = {};
  const ok = (v) => v !== null && v !== undefined && isFinite(v);
  function fmt(v, d = 2) {
    if (!ok(v)) return '—';
    if (!nfCache[d]) nfCache[d] = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
    return nfCache[d].format(v).replace(/\u202f/g, '\u00a0');
  }
  const fixed = (v, d) => (ok(v) ? Number(v).toFixed(d) : '');
  const dec = (v, d) => fixed(v, d).replace('.', ',');
  const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const cardinal = (h) => CARD[Math.round((((h % 360) + 360) % 360) / 45) % 8];
  const pad2 = (n) => String(n).padStart(2, '0');

  function stamp(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  }
  const dateFR = (ts) => { const d = new Date(ts); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const timeFR = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  function tzOffset(ts) {
    const o = -new Date(ts).getTimezoneOffset(), a = Math.abs(o);
    return (o >= 0 ? '+' : '-') + pad2(Math.floor(a / 60)) + ':' + pad2(a % 60);
  }
  function isoLocal(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${tzOffset(ts)}`;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371008.8, r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // ---------- adresse (Géoplateforme IGN, puis BAN, puis Nominatim) ----------
  async function reverse(lat, lon, timeoutMs = 4000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs);
    const opt = ctrl ? { signal: ctrl.signal } : {};
    const la = lat.toFixed(6), lo = lon.toFixed(6);
    const sources = [
      `https://data.geopf.fr/geocodage/reverse?lon=${lo}&lat=${la}&index=address&limit=1`,
      `https://api-adresse.data.gouv.fr/reverse/?lon=${lo}&lat=${la}&limit=1`
    ];
    try {
      for (const url of sources) {
        try {
          const r = await fetch(url, opt);
          if (!r.ok) continue;
          const j = await r.json();
          const f = j && j.features && j.features[0];
          if (f && f.properties && f.properties.label) return f.properties.label;
        } catch (e) {
          if (ctrl && ctrl.signal.aborted) return '';
        }
      }
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=fr&lat=${la}&lon=${lo}`, opt);
        if (r.ok) {
          const j = await r.json();
          const a = (j && j.address) || {};
          const street = [a.house_number, a.road || a.pedestrian || a.path].filter(Boolean).join(' ');
          const city = [a.postcode, a.city || a.town || a.village || a.municipality].filter(Boolean).join(' ');
          const label = [street, city].filter(Boolean).join(' ');
          return label || (j && j.display_name) || '';
        }
      } catch (e) { /* hors ligne */ }
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- cap (direction visée par l'objectif arrière) ----------
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function cameraHeading(alpha, beta, gamma) {
    const a = alpha * D2R, b = beta * D2R, g = gamma * D2R;
    const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
    // Axe -Z de l'appareil (objectif arrière) exprimé dans le repère Est/Nord/Haut
    const E = -(cA * sG + sA * sB * cG), N = -(sA * sG - cA * sB * cG);
    if (Math.hypot(E, N) > 0.35) return (Math.atan2(E, N) * R2D + 360) % 360;
    // Téléphone presque à plat : on prend la direction du haut de l'appareil
    return (Math.atan2(-sA * cB, cA * cB) * R2D + 360) % 360;
  }

  const Compass = {
    heading: null,
    needsPermission: typeof global.DeviceOrientationEvent !== 'undefined' &&
      typeof global.DeviceOrientationEvent.requestPermission === 'function',
    started: false,
    _s: 0, _c: 0, _n: 0, _cb: null, _last: 0,
    async request() {
      if (!this.needsPermission) return true;
      try { return (await global.DeviceOrientationEvent.requestPermission()) === 'granted'; }
      catch (e) { return false; }
    },
    start(cb) {
      if (this.started) return;
      this.started = true; this._cb = cb;
      const onAbs = (e) => { if (e.alpha != null) this._push(cameraHeading(e.alpha, e.beta || 0, e.gamma || 0)); };
      const onRel = (e) => {
        if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) this._push(e.webkitCompassHeading);
        else if (e.absolute && e.alpha != null) onAbs(e);
      };
      if ('ondeviceorientationabsolute' in global) global.addEventListener('deviceorientationabsolute', onAbs);
      else global.addEventListener('deviceorientation', onRel);
    },
    _push(h) {
      const r = h * D2R, k = this._n < 3 ? 1 : 0.2;
      this._s += k * (Math.sin(r) - this._s);
      this._c += k * (Math.cos(r) - this._c);
      this._n++;
      this.heading = (Math.atan2(this._s, this._c) * R2D + 360) % 360;
      const now = Date.now();
      if (this._cb && now - this._last > 150) { this._last = now; this._cb(this.heading); }
    }
  };

  global.Geo = {
    CRS, project, both, xy, other, fmt, fixed, dec, cardinal, pad2, stamp, dateFR, timeFR,
    tzOffset, isoLocal, haversine, reverse, cameraHeading, Compass, ok
  };
})(typeof window !== 'undefined' ? window : globalThis);
