/* hg-ocr.js — 電腦內文字辨識（PaddleOCR 開源模型＋ONNX Runtime Web）
 * 全部在使用者的瀏覽器執行，影像不送到任何辨識服務。
 * 模型組（forms/ocr/）：
 *   fast     PP-OCRv5 mobile：det-mobile.onnx（找字的位置）、rec-mobile.onnx（認字）、dict.json（字典）
 *   accurate 高精度（D17 起）：det-mobile.onnx 找字＋rec-v6s.onnx（PP-OCRv6 small）認字、dict-v6.json；
 *            v6 信心低於 0.95 的文字段再用 rec-mobile.onnx 認一次，取信心較高者。
 *            2026-11-26 以 11/22 去識別謄本 8 頁比較：字元錯誤率 乾淨 2.44%→1.29%、掃描 3.44%→1.34%、拍照 4.49%→2.58%，欄位數三種影像都不少於快速模式。
 * init({ base, model:'fast'|'accurate' }) 或 init({ base, det, rec, dict, detParams }) 指定檔名；換模型組時自動重新載入。
 * 授權：PaddleOCR 模型 Apache-2.0；ONNX Runtime MIT。
 * 認字用多個背景工作程序同時處理（每個核心一個），找字在主程式。
 */
(function () {
  'use strict';
  const ORT_VER = '1.22.0';
  const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ORT_VER + '/dist/';
  const V5_DET = { thresh: 0.3, boxThresh: 0.6, unclip: 1.5 };
  const PRESETS = {
    fast: { det: 'det-mobile.onnx', rec: 'rec-mobile.onnx', dict: 'dict.json', detParams: V5_DET, label: 'PP-OCRv5 mobile' },
    accurate: { det: 'det-mobile.onnx', rec: 'rec-v6s.onnx', dict: 'dict-v6.json', detParams: V5_DET, label: 'PP-OCRv6 small＋v5 mobile 互補',
      alt: { rec: 'rec-mobile.onnx', dict: 'dict.json', min: 0.95 } }
  };
  let state = null, initP = null, initKey = '', detQueue = Promise.resolve();

  const loadScript = src => new Promise((res, rej) => {
    if (window.ort) return res();
    const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => rej(new Error('辨識程式載入失敗，請確認網路後重試。'));
    document.head.appendChild(s);
  });

  async function fetchBuf(url, label, onProgress) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('辨識模型下載失敗（' + r.status + '）：' + label);
    const total = +r.headers.get('Content-Length') || 0;
    if (!r.body || !onProgress) return new Uint8Array(await r.arrayBuffer());
    const reader = r.body.getReader(); const parts = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      parts.push(value); got += value.length; onProgress(label, got, Math.max(total, got));
    }
    const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  function mkCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return { c, ctx: c.getContext('2d', { willReadFrequently: true }) };
  }

  // ---- 認字工作程序（Web Worker），每個各自載入一份模型 ----
  const WORKER_SRC = `
    importScripts(${JSON.stringify(ORT_BASE + 'ort.wasm.min.js')});
    ort.env.wasm.wasmPaths = ${JSON.stringify(ORT_BASE)}; ort.env.wasm.numThreads = 1; ort.env.logLevel = 'error';
    let sess = null;
    onmessage = async e => {
      const m = e.data;
      try {
        if (m.type === 'init') { sess = await ort.InferenceSession.create(m.model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 }); postMessage({ id: m.id, ok: true }); }
        else { const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', m.data, m.dims) }); const t = out[sess.outputNames[0]]; postMessage({ id: m.id, ok: true, data: t.data, dims: t.dims }, [t.data.buffer]); }
      } catch (err) { postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }); }
    };`;
  function makePool(n, model) {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const workers = [], waiting = [];
    let seq = 0;
    const call = (wk, msg, transfer) => new Promise((res, rej) => {
      const id = ++seq; wk.pending.set(id, { res, rej });
      wk.w.postMessage({ ...msg, id }, transfer || []);
    });
    const spawn = () => {
      const wk = { w: new Worker(url), pending: new Map(), busy: false };
      wk.w.onmessage = e => { const p = wk.pending.get(e.data.id); if (!p) return; wk.pending.delete(e.data.id); e.data.ok ? p.res(e.data) : p.rej(new Error(e.data.error)); };
      wk.w.onerror = e => { for (const p of wk.pending.values()) p.rej(new Error(e.message || '辨識工作程序錯誤')); wk.pending.clear(); };
      return wk;
    };
    return {
      async start() {
        for (let i = 0; i < n; i++) workers.push(spawn());
        await Promise.all(workers.map(wk => call(wk, { type: 'init', model: model.slice() })));
        URL.revokeObjectURL(url);
      },
      async run(data, dims) {
        let wk = workers.find(x => !x.busy);
        if (!wk) { await new Promise(r => waiting.push(r)); wk = workers.find(x => !x.busy); }
        wk.busy = true;
        try { return await call(wk, { type: 'run', data, dims }, [data.buffer]); }
        finally { wk.busy = false; const next = waiting.shift(); if (next) next(); }
      },
      size: n,
      stop() { workers.forEach(wk => wk.w.terminate()); }
    };
  }

  // 依 opt 決定模型檔：model 預設組，或 det／rec／dict 直接給檔名（舊寫法 rec:'server' 仍可用）
  function specOf(opt) {
    const p = PRESETS[opt.model] || PRESETS.fast;
    const rec = opt.rec === 'server' ? 'rec-server.onnx' : (opt.rec || p.rec);
    const alt = opt.alt !== undefined ? opt.alt : (opt.det || opt.rec || opt.dict ? null : p.alt || null);
    return { model: PRESETS[opt.model] ? opt.model : (opt.det || opt.rec || opt.dict ? 'custom' : 'fast'),
      det: opt.det || p.det, rec, dict: opt.dict || p.dict, alt, detParams: { ...V5_DET, ...(p.detParams || {}), ...(opt.detParams || {}) }, label: opt.label || p.label || '' };
  }
  // 換模型組前先停掉背景工作程序、釋放模型
  function reset() {
    const s = state;
    state = null; initP = null; initKey = '';
    if (!s) return;
    for (const m of [s.main, s.alt]) { try { if (m && m.pool) m.pool.stop(); } catch (e) {} }
    for (const x of [s.det, s.main && s.main.rec, s.alt && s.alt.rec]) { try { if (x && x.release) x.release(); } catch (e) {} }
  }

  async function init(opt) {
    // detect／recognize 內部呼叫 init() 不帶參數：沿用目前已載入的模型組
    const explicit = !!opt && ['model', 'det', 'rec', 'dict'].some(k => opt[k]);
    opt = opt || {};
    if (!explicit) { if (state) return state; if (initP) return initP; }
    const spec = specOf(opt), base = opt.base || 'forms/ocr/';
    const key = [base, spec.det, spec.rec, spec.dict, spec.alt ? spec.alt.rec + '+' + spec.alt.dict : ''].join('|');
    if (state && state.key === key) return state;
    if (initP && initKey === key) return initP;
    if (initP) { try { await initP; } catch (e) {} if (state && state.key === key) return state; }
    reset();
    initKey = key;
    const job = initP = (async () => {
      await loadScript(ORT_BASE + 'ort.wasm.min.js');
      const ort = window.ort; if (!ort) throw new Error('辨識程式載入失敗。');
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error';   // 模型轉檔留下的無用參數警告不顯示
      const recName = spec.rec;
      const dictOf = name => fetch(base + name).then(r => { if (!r.ok) throw new Error('辨識字典下載失敗（' + r.status + '）'); return r.json(); });
      const [detB, recB, dict, altB, altDict] = await Promise.all([
        fetchBuf(base + spec.det, 'det', opt.onProgress),
        fetchBuf(base + recName, 'rec', opt.onProgress),
        dictOf(spec.dict),
        spec.alt ? fetchBuf(base + spec.alt.rec, 'alt', opt.onProgress) : null,
        spec.alt ? dictOf(spec.alt.dict) : null
      ]);
      const so = { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 };
      const det = await ort.InferenceSession.create(detB, so);
      // 背景工作程序：核心數 − 1，最多 4 個；失敗就退回主程式單線處理
      const nW = opt.workers != null ? opt.workers : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
      const makeRec = async (buf, words, n) => {
        let pool = null, rec = null;
        if (n > 0 && typeof Worker !== 'undefined') {
          try { pool = makePool(n, buf); await pool.start(); } catch (e) { if (pool) pool.stop(); pool = null; }
        }
        if (!pool) rec = await ort.InferenceSession.create(buf, so);
        let recQueue = Promise.resolve();
        const runRec = pool ? (data, dims) => pool.run(data, dims) : (data, dims) => {
          const p = recQueue.then(async () => { const out = await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', data, dims) }); const t = out[rec.outputNames[0]]; return { data: t.data, dims: t.dims }; });
          recQueue = p.catch(() => {}); return p;
        };
        const index = new Map(); words.forEach((ch, i) => { if (!index.has(ch)) index.set(ch, i + 1); });
        return { pool, rec, runRec, dict: words, index };
      };
      const main = await makeRec(recB, dict, nW);
      // 互補模型：主模型信心不足的方框再認一次，取信心較高者（工作程序數減半）
      const alt = spec.alt ? await makeRec(altB, altDict, Math.max(1, Math.ceil(nW / 2))) : null;
      const s = { ort, det, rec: main.rec, pool: main.pool, runRec: main.runRec, dict, index: main.index, main, alt, altMin: (spec.alt && spec.alt.min) || 0.95, altMargin: (spec.alt && spec.alt.margin) || 0,
        recName, key, model: spec.model, label: spec.label, detParams: spec.detParams, workers: main.pool ? main.pool.size : 0 };
      if (initP !== job) { try { if (main.pool) main.pool.stop(); if (alt && alt.pool) alt.pool.stop(); } catch (e) {} throw new Error('辨識模型已切換，請重試。'); }
      state = s;
      return state;
    })();
    try { return await job; } catch (e) { if (initP === job) { initP = null; initKey = ''; } throw e; }
  }

  /* 找出影像中的文字行。回傳原圖座標的方框 [{x,y,w,h,score}] */
  async function detect(src, opt) {
    opt = opt || {};
    const { ort, det, detParams } = await init();
    const job = async () => {
      const sw = src.width, sh = src.height;
      const maxSide = opt.maxSide || 1600, minSide = opt.minSide || 0;
      let r = Math.min(1, maxSide / Math.max(sw, sh));
      if (minSide && Math.max(sw, sh) * r < minSide) r = minSide / Math.max(sw, sh);
      const W = Math.max(32, Math.round(sw * r / 32) * 32), H = Math.max(32, Math.round(sh * r / 32) * 32);
      const { c, ctx } = mkCanvas(W, H);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(src, 0, 0, W, H);
      const px = ctx.getImageData(0, 0, W, H).data, n = W * H, data = new Float32Array(3 * n);
      c.width = c.height = 0;
      const m0 = 0.485, m1 = 0.456, m2 = 0.406, s0 = 0.229, s1 = 0.224, s2 = 0.225;
      for (let i = 0; i < n; i++) { // BGR
        data[i] = (px[i * 4 + 2] / 255 - m0) / s0;
        data[n + i] = (px[i * 4 + 1] / 255 - m1) / s1;
        data[2 * n + i] = (px[i * 4] / 255 - m2) / s2;
      }
      const out = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, H, W]) });
      const map = out[det.outputNames[0]].data;
      const dp = detParams || V5_DET;
      const thresh = opt.thresh != null ? opt.thresh : dp.thresh, boxThresh = opt.boxThresh != null ? opt.boxThresh : dp.boxThresh, unclip = opt.unclip || dp.unclip;
      const seen = new Uint8Array(n), stack = new Int32Array(n), boxes = [];
      const fx = sw / W, fy = sh / H;
      for (let i = 0; i < n; i++) {
        if (seen[i] || map[i] <= thresh) continue;
        let sp = 0; stack[sp++] = i; seen[i] = 1; let x0 = W, y0 = H, x1 = -1, y1 = -1, csum = 0, ccnt = 0;
        while (sp) {
          const k = stack[--sp], x = k % W, y = (k - x) / W; csum += map[k]; ccnt++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x > 0 && !seen[k - 1] && map[k - 1] > thresh) { seen[k - 1] = 1; stack[sp++] = k - 1; }
          if (x < W - 1 && !seen[k + 1] && map[k + 1] > thresh) { seen[k + 1] = 1; stack[sp++] = k + 1; }
          if (y > 0 && !seen[k - W] && map[k - W] > thresh) { seen[k - W] = 1; stack[sp++] = k - W; }
          if (y < H - 1 && !seen[k + W] && map[k + W] > thresh) { seen[k + W] = 1; stack[sp++] = k + W; }
        }
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        if (Math.min(bw, bh) < 3) continue;
        // 可信度＝文字區塊本身的平均機率（手寫字歪斜、碰到鄰行時，外框會變大，用外框平均會被誤刪）
        const score = csum / ccnt; if (score < boxThresh || ccnt < 12) continue;
        const d = bw * bh * unclip / (2 * (bw + bh));
        const X0 = Math.max(0, (x0 - d) * fx), Y0 = Math.max(0, (y0 - d) * fy);
        const X1 = Math.min(sw, (x1 + 1 + d) * fx), Y1 = Math.min(sh, (y1 + 1 + d) * fy);
        boxes.push({ x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0, score });
      }
      boxes.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.5 ? a.x - b.x : a.y - b.y));
      return boxes;
    };
    const p = detQueue.then(job, job); detQueue = p.catch(() => {}); return p;
  }

  /* 認出一個方框裡的字。
   * opt.allow：只允許這些字（例如金額欄只認數字）；opt.maxChars：只認方框左邊約這麼多字（先找標題用）
   * 回傳 {text, score, chars:[{c,p,x}], probs, box}；chars.x 是每個字在原圖的大約橫向位置 */
  async function recognize(src, box, opt) {
    opt = opt || {};
    const s = await init();
    const r1 = await recognizeWith(s.main || s, src, box, opt);
    // 互補模型：只限一般認字（不含限定字元），主模型信心低於門檻才再認一次
    if (!s.alt || opt.allow || r1.score >= s.altMin) return r1;
    const r2 = await recognizeWith(s.alt, src, box, opt);
    return r2.score > r1.score + s.altMargin && r2.text ? { ...r2, alt: true } : r1;
  }
  async function recognizeWith(m, src, box, opt) {
    const { runRec, dict, index } = m;
    const bx = Math.max(0, Math.floor(box.x)), by = Math.max(0, Math.floor(box.y));
    let bw = Math.max(1, Math.min(src.width - bx, Math.ceil(box.w)));
    const bh = Math.max(1, Math.min(src.height - by, Math.ceil(box.h)));
    if (opt.maxChars) bw = Math.max(1, Math.min(bw, Math.ceil(bh * opt.maxChars)));
    const H = 48, rw = Math.min(3200, Math.max(8, Math.ceil(H * bw / bh))), W = Math.max(320, rw);
    const { c, ctx } = mkCanvas(rw, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rw, H);
    ctx.drawImage(src, bx, by, bw, bh, 0, 0, rw, H);
    const px = ctx.getImageData(0, 0, rw, H).data, n = W * H, data = new Float32Array(3 * n);
    c.width = c.height = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < rw; x++) {
      const p = (y * rw + x) * 4, i = y * W + x;
      data[i] = px[p + 2] / 127.5 - 1; data[n + i] = px[p + 1] / 127.5 - 1; data[2 * n + i] = px[p] / 127.5 - 1;
    }
    const t = await runRec(data, [1, 3, H, W]);
    const T = t.dims[1], C = t.dims[2], p = t.data;
    const Tuse = Math.min(T, Math.ceil(T * rw / W) + 1), stepPx = (W / T) * (bw / rw);
    // opt.allow：只允許的字；opt.alias：{允許的字: '異體或簡體字'}，異體字的機率算給允許的字（例如「贰」算「貳」）
    let allowSet = null, aliasOf = null;
    if (opt.allow) {
      allowSet = [0]; aliasOf = new Map();
      for (const ch of opt.allow) {
        const k = index.get(ch); if (!k || allowSet.includes(k)) continue;
        allowSet.push(k);
        const al = (opt.alias && opt.alias[ch]) || '';
        const ks = [...al].map(a => index.get(a)).filter(Boolean); if (ks.length) aliasOf.set(k, ks);
      }
    }
    const charOf = k => (k - 1 < dict.length ? dict[k - 1] : ' ');
    let text = '', last = -1, sum = 0, cnt = 0; const chars = [];
    for (let s = 0; s < Tuse; s++) {
      const o = s * C; let mi = 0, mv = -1;
      if (allowSet) { for (const k of allowSet) { let v = p[o + k]; const al = aliasOf.get(k); if (al) for (const a of al) v += p[o + a]; if (v > mv) { mv = v; mi = k; } } }
      else { for (let k = 0; k < C; k++) { const v = p[o + k]; if (v > mv) { mv = v; mi = k; } } }
      if (mi !== 0 && mi !== last) { const ch = charOf(mi); text += ch; chars.push({ c: ch, p: mv, x: bx + (s + 0.5) * stepPx }); sum += mv; cnt++; }
      last = mi;
    }
    return { text: text.trim(), score: cnt ? sum / cnt : 0, chars, probs: { data: p, T: Tuse, C, index }, box: { x: bx, y: by, w: bw, h: bh } };
  }

  /* 已知候選字串（例如背表上的姓名）時，算每個候選字串的可能性，挑最像的。回傳 [{text, logp, perChar}] 由高到低 */
  function scoreCandidates(r, candidates) {
    if (!state || !r || !r.probs) return [];
    const { data, T, C } = r.probs, index = r.probs.index || state.index;
    const out = [];
    for (const cand of candidates) {
      const s = String(cand || '').replace(/\s+/g, ''); if (!s) continue;
      const labels = []; let ok = true;
      for (const ch of s) { const k = index.get(ch); if (!k) { ok = false; break; } labels.push(k); }
      if (!ok || labels.length > T) { out.push({ text: s, logp: -Infinity, perChar: -Infinity }); continue; }
      const L = labels.length, S = 2 * L + 1, ext = new Int32Array(S);
      for (let i = 0; i < S; i++) ext[i] = i % 2 ? labels[(i - 1) / 2] : 0;
      const NEG = -1e30, lp = (t, k) => Math.log(Math.max(data[t * C + k], 1e-12));
      const lse = (x, y) => (x === NEG ? y : y === NEG ? x : Math.max(x, y) + Math.log1p(Math.exp(-Math.abs(x - y))));
      let a = new Float64Array(S).fill(NEG);
      a[0] = lp(0, 0); if (S > 1) a[1] = lp(0, ext[1]);
      for (let t = 1; t < T; t++) {
        const b = new Float64Array(S).fill(NEG);
        for (let i = 0; i < S; i++) {
          let v = a[i]; if (i > 0) v = lse(v, a[i - 1]);
          if (i > 1 && ext[i] !== 0 && ext[i] !== ext[i - 2]) v = lse(v, a[i - 2]);
          b[i] = v === NEG ? NEG : v + lp(t, ext[i]);
        }
        a = b;
      }
      const logp = lse(a[S - 1], S > 1 ? a[S - 2] : NEG);
      out.push({ text: s, logp, perChar: logp / L });
    }
    return out.sort((x, y) => y.logp - x.logp);
  }

  window.HGOcr = { init, reset, detect, recognize, scoreCandidates, PRESETS, get ready() { return !!state; }, get model() { return state ? state.model : ''; }, get label() { return state ? state.label : ''; }, get workers() { return state ? state.workers : 0; }, ORT_VER };
})();
