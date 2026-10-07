/* GéoCliché — écriture EXIF (date, GPS, cap, précision, commentaire) dans un JPEG */
(function (global) {
  'use strict';

  const u16 = (v) => [(v >> 8) & 255, v & 255];
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const p2 = (n) => String(n).padStart(2, '0');

  function asciiBytes(s) {
    s = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
    const a = new Uint8Array(s.length + 1);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function utf16(s, little, terminate) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (little) out.push(c & 255, c >> 8); else out.push(c >> 8, c & 255);
    }
    if (terminate) out.push(0, 0);
    return out;
  }

  const E = {
    ascii: (tag, s) => { const b = asciiBytes(s); return { tag, type: 2, count: b.length, bytes: b }; },
    short: (tag, v) => ({ tag, type: 3, count: 1, bytes: Uint8Array.from(u16(v)) }),
    long: (tag, v) => ({ tag, type: 4, count: 1, bytes: Uint8Array.from(u32(v)) }),
    byte: (tag, arr) => ({ tag, type: 1, count: arr.length, bytes: Uint8Array.from(arr) }),
    undef: (tag, arr) => ({ tag, type: 7, count: arr.length, bytes: Uint8Array.from(arr) }),
    rational: (tag, pairs) => {
      const out = [];
      pairs.forEach(([n, d]) => out.push(...u32(n), ...u32(d)));
      return { tag, type: 5, count: pairs.length, bytes: Uint8Array.from(out) };
    }
  };

  const rat = (v, den) => [Math.round(Math.abs(v) * den), den];
  function dms(deg) {
    const a = Math.abs(deg), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf);
    return [[d, 1], [m, 1], [Math.round((mf - m) * 60 * 10000), 10000]];
  }

  function ifdSize(entries) {
    let n = 2 + entries.length * 12 + 4;
    entries.forEach((e) => { if (e.bytes.length > 4) n += e.bytes.length + (e.bytes.length % 2); });
    return n;
  }
  function encodeIFD(entries, offset) {
    const size = ifdSize(entries), buf = new Uint8Array(size), dv = new DataView(buf.buffer);
    const head = 2 + entries.length * 12 + 4;
    let data = head;
    dv.setUint16(0, entries.length);
    entries.forEach((e, i) => {
      const p = 2 + i * 12;
      dv.setUint16(p, e.tag); dv.setUint16(p + 2, e.type); dv.setUint32(p + 4, e.count);
      if (e.bytes.length <= 4) buf.set(e.bytes, p + 8);
      else {
        dv.setUint32(p + 8, offset + data);
        buf.set(e.bytes, data);
        data += e.bytes.length + (e.bytes.length % 2);
      }
    });
    dv.setUint32(2 + entries.length * 12, 0);
    return buf;
  }
  function concat(parts) {
    const n = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }
  const clip = (s, n) => String(s || '').slice(0, n);

  /** Construit un segment APP1 EXIF complet. m = { ts, offset, lat, lon, alt, acc, heading, width, height, description, userComment, xpComment, xpSubject, xpTitle, artist, software } */
  function build(m) {
    const d = new Date(m.ts);
    const local = `${d.getFullYear()}:${p2(d.getMonth() + 1)}:${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    const ok = (v) => v !== null && v !== undefined && isFinite(v);

    const ifd0 = [E.short(0x0112, 1), E.ascii(0x0131, m.software || 'GeoCliche'), E.ascii(0x0132, local)];
    if (m.description) ifd0.push(E.ascii(0x010E, clip(m.description, 1000)));
    if (m.artist) ifd0.push(E.ascii(0x013B, clip(m.artist, 200)));
    if (m.xpTitle) ifd0.push(E.byte(0x9C9B, utf16(clip(m.xpTitle, 200), true, true)));
    if (m.xpComment) ifd0.push(E.byte(0x9C9C, utf16(clip(m.xpComment, 1500), true, true)));
    if (m.xpSubject) ifd0.push(E.byte(0x9C9F, utf16(clip(m.xpSubject, 200), true, true)));

    const exif = [
      E.undef(0x9000, [0x30, 0x32, 0x33, 0x32]),
      E.ascii(0x9003, local), E.ascii(0x9004, local),
      E.short(0xA001, 1)
    ];
    if (m.offset) { exif.push(E.ascii(0x9010, m.offset)); exif.push(E.ascii(0x9011, m.offset)); }
    if (m.width) exif.push(E.long(0xA002, m.width));
    if (m.height) exif.push(E.long(0xA003, m.height));
    if (m.userComment) exif.push(E.undef(0x9286, [0x55, 0x4E, 0x49, 0x43, 0x4F, 0x44, 0x45, 0x00].concat(utf16(clip(m.userComment, 1500), false, false))));

    let gps = null;
    if (ok(m.lat) && ok(m.lon)) {
      gps = [
        E.byte(0x0000, [2, 3, 0, 0]),
        E.ascii(0x0001, m.lat >= 0 ? 'N' : 'S'), E.rational(0x0002, dms(m.lat)),
        E.ascii(0x0003, m.lon >= 0 ? 'E' : 'W'), E.rational(0x0004, dms(m.lon)),
        E.rational(0x0007, [[d.getUTCHours(), 1], [d.getUTCMinutes(), 1], [d.getUTCSeconds(), 1]]),
        E.ascii(0x0012, 'WGS-84'),
        E.ascii(0x001D, `${d.getUTCFullYear()}:${p2(d.getUTCMonth() + 1)}:${p2(d.getUTCDate())}`)
      ];
      if (ok(m.alt)) { gps.push(E.byte(0x0005, [m.alt < 0 ? 1 : 0])); gps.push(E.rational(0x0006, [rat(m.alt, 100)])); }
      if (ok(m.heading)) { gps.push(E.ascii(0x0010, 'M')); gps.push(E.rational(0x0011, [rat(m.heading, 100)])); }
      if (ok(m.acc)) gps.push(E.rational(0x001F, [rat(m.acc, 100)]));
    }

    const pExif = E.long(0x8769, 0); ifd0.push(pExif);
    let pGps = null;
    if (gps) { pGps = E.long(0x8825, 0); ifd0.push(pGps); }
    [ifd0, exif, gps].forEach((a) => a && a.sort((x, y) => x.tag - y.tag));

    const offExif = 8 + ifdSize(ifd0), offGps = offExif + ifdSize(exif);
    pExif.bytes = Uint8Array.from(u32(offExif));
    if (pGps) pGps.bytes = Uint8Array.from(u32(offGps));

    const parts = [Uint8Array.from([0x4D, 0x4D, 0x00, 0x2A, 0, 0, 0, 8]), encodeIFD(ifd0, 8), encodeIFD(exif, offExif)];
    if (gps) parts.push(encodeIFD(gps, offGps));
    const tiff = concat(parts);
    const len = 2 + 6 + tiff.length;
    if (len > 65535) throw new Error('Bloc EXIF trop volumineux');
    return concat([Uint8Array.from([0xFF, 0xE1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0]), tiff]);
  }

  /** Insère le segment APP1 juste après SOI, en retirant JFIF (APP0) et un éventuel EXIF existant. */
  function insert(jpg, app1) {
    if (jpg[0] !== 0xFF || jpg[1] !== 0xD8) return jpg;
    let i = 2;
    const keep = [];
    while (i + 4 <= jpg.length && jpg[i] === 0xFF) {
      const mk = jpg[i + 1];
      if (mk < 0xE0 || mk > 0xEF) break;
      const L = (jpg[i + 2] << 8) | jpg[i + 3];
      if (mk !== 0xE0 && mk !== 0xE1) keep.push(jpg.subarray(i, i + 2 + L));
      i += 2 + L;
    }
    return concat([jpg.subarray(0, 2), app1].concat(keep, [jpg.subarray(i)]));
  }

  global.Exif = { build, insert };
})(typeof window !== 'undefined' ? window : globalThis);
