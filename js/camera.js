/* GéoCliché — caméra : flux arrière, choix d'objectif, zoom, capture d'image */
(function (global) {
  'use strict';
  const MAX_AREA = 12.3e6; // limite prudente des canvas iOS

  const Camera = {
    video: null, stream: null, track: null, deviceId: null, active: false,
    hw: null, zoom: 1, digital: 1, lenses: [],

    init(video) { this.video = video; },
    supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },

    async start(deviceId) {
      this.stop();
      const base = { width: { ideal: 4032 }, height: { ideal: 3024 }, aspectRatio: { ideal: 4 / 3 } };
      const want = deviceId ? Object.assign({ deviceId: { exact: deviceId } }, base)
        : Object.assign({ facingMode: { ideal: 'environment' } }, base);
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
      } catch (e) {
        if (e && (e.name === 'OverconstrainedError' || e.name === 'NotReadableError' || e.name === 'AbortError')) {
          s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }, audio: false });
        } else throw e;
      }
      this.stream = s;
      this.track = s.getVideoTracks()[0];
      const st = this.track.getSettings ? this.track.getSettings() : {};
      this.deviceId = st.deviceId || deviceId || null;
      let caps = {};
      try { caps = this.track.getCapabilities ? this.track.getCapabilities() : {}; } catch (e) { caps = {}; }
      this.hw = caps && caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null;
      this.zoom = this.hw ? (st.zoom || this.hw.min) : 1;
      this.digital = 1;
      const v = this.video;
      v.setAttribute('playsinline', ''); v.muted = true; v.srcObject = s;
      await v.play().catch(() => {});
      await new Promise((r) => {
        if (v.videoWidth) return r();
        v.addEventListener('loadedmetadata', r, { once: true });
        setTimeout(r, 3000);
      });
      this.applyDigital();
      this.active = true;
      return { width: v.videoWidth, height: v.videoHeight };
    },

    stop() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null; this.track = null; this.active = false;
      if (this.video) this.video.srcObject = null;
    },

    /** Objectifs arrière identifiables par leur nom (iPhone : ultra grand-angle, grand-angle, téléobjectif). */
    async listLenses() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.label);
      const found = {};
      devs.forEach((d) => {
        const l = d.label.toLowerCase();
        if (/front|avant|facetime|selfie|frontal/.test(l)) return;
        let tag = 'x1', order = 1;
        if (/ultra/.test(l)) { tag = 'x05'; order = 0; }
        else if (/t[ée]l[ée]|tele/.test(l)) { tag = 'tele'; order = 2; }
        else if (/triple|dual|double/.test(l)) { tag = 'multi'; order = 9; }
        if (!found[tag]) found[tag] = { id: d.deviceId, label: d.label, tag, order };
      });
      let out = Object.values(found);
      if (found.x1) out = out.filter((o) => o.tag !== 'multi');
      out.sort((a, b) => a.order - b.order);
      const names = { x05: '0,5×', x1: '1×', tele: 'Télé', multi: 'Auto' };
      out.forEach((o) => { o.name = names[o.tag]; });
      this.lenses = out.length > 1 ? out : [];
      return this.lenses;
    },

    get effZoom() { return this.hw ? this.zoom : this.digital; },

    async setZoom(z) {
      if (this.hw) {
        z = Math.min(this.hw.max, Math.max(this.hw.min, z));
        try { await this.track.applyConstraints({ advanced: [{ zoom: z }] }); this.zoom = z; return z; }
        catch (e) { this.hw = null; }
      }
      this.digital = Math.min(6, Math.max(1, z));
      this.applyDigital();
      return this.digital;
    },

    applyDigital() {
      if (this.video) this.video.style.transform = this.digital > 1.001 ? `scale(${this.digital})` : '';
    },

    /** Capture l'image affichée (avec le recadrage du zoom numérique) dans un canvas. */
    grab() {
      const v = this.video, vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) throw new Error('La caméra n’est pas prête');
      const z = this.hw ? 1 : this.digital;
      let cw = Math.round(vw / z), ch = Math.round(vh / z);
      const k = Math.min(1, Math.sqrt(MAX_AREA / (cw * ch)));
      const c = document.createElement('canvas');
      c.width = Math.round(cw * k); c.height = Math.round(ch * k);
      c.getContext('2d').drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
      return c;
    },

    /** Repli : photo prise avec l'appareil photo natif via <input type=file>. */
    async fromFile(file) {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => rej(new Error('Image illisible'));
          i.src = url;
        });
        const w = img.naturalWidth, h = img.naturalHeight;
        const k = Math.min(1, Math.sqrt(MAX_AREA / (w * h)));
        const c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  };

  global.Camera = Camera;
})(window);
