/* GéoCliché — écriture ZIP « stockée » (sans compression).
   Les photos sont déjà compressées : on les référence telles quelles dans le Blob final,
   ce qui évite de tout recopier en mémoire (important sur iPhone). */
(function (global) {
  'use strict';
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    T[n] = c >>> 0;
  }
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = T[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const te = new TextEncoder();
  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (d) => (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

  class ZipWriter {
    constructor() { this.parts = []; this.central = []; this.offset = 0; this.count = 0; this.names = new Set(); }

    /** data : texte, Uint8Array ou Blob */
    async add(name, data, date) {
      date = date ? new Date(date) : new Date();
      let n = name, k = 2;
      while (this.names.has(n)) n = name.replace(/(\.[^./]+)?$/, `_${k++}$1`);
      this.names.add(n);
      let u8 = null, blob = null;
      if (typeof data === 'string') u8 = te.encode(data);
      else if (data instanceof Uint8Array) u8 = data;
      else blob = data;
      const crc = crc32(u8 || new Uint8Array(await blob.arrayBuffer()));
      const size = u8 ? u8.length : blob.size;
      const nm = te.encode(n);

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime(date), true); lh.setUint16(12, dosDate(date), true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      this.parts.push(lh.buffer, nm, u8 || blob);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime(date), true); ch.setUint16(14, dosDate(date), true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, nm.length, true);
      ch.setUint32(42, this.offset, true);
      this.central.push(ch.buffer, nm);

      this.offset += 30 + nm.length + size;
      this.count++;
      return n;
    }

    blob(type) {
      const cd = this.central.reduce((s, p) => s + p.byteLength, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, this.count, true); end.setUint16(10, this.count, true);
      end.setUint32(12, cd, true); end.setUint32(16, this.offset, true);
      return new Blob(this.parts.concat(this.central, [end.buffer]), { type: type || 'application/zip' });
    }
  }

  global.ZipWriter = ZipWriter;
})(typeof window !== 'undefined' ? window : globalThis);
