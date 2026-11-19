/* 宏國地政士作業台：謄本電腦內辨識（D7，Claude 2026-11-18；D8 2026-11-19：照片標題、首行類別、「全部」權利範圍、附屬建物用途漏字容錯）
 * 1) 電子謄本 PDF：文字層照讀；所有權人姓名、統一編號、出生日期、住址這幾行在電子謄本是「圖片」，只把這幾行圖片拿去辨識，補成文字。
 * 2) 掃描 PDF（沒有文字層）、手機照片：整頁辨識（先自動轉正、校正歪斜），再排回一行一行。
 * 產出的文字交給 hg-transcript.js 的同一套謄本規則。辨識用 hg-ocr.js（PaddleOCR 開源模型），全部在這台電腦執行，不上傳、不付費。 */
(function () {
  'use strict';
  const ROW_SCALE = 4;            // 電子謄本：圖片行用 4 倍解析度辨識
  const PAGE_SIDE = 2400;         // 掃描頁／照片：長邊縮到 2400px 辨識
  const KEY_LINE = /所有權人|統一編號|出生日期|住址|權利範圍|共有部分|建號|地號|面積|門牌|管理者/;
  // 辨識模型常把繁體字認成簡體或異體（腾本、统一编號、登记），謄本規則只認正體標籤，所以先校正。
  // 只收在謄本上不會有歧義的字（不收「里、范、后、干、台」等兩邊都會用的字）。
  const T2 = '腾騰膳謄统統编編记記银銀约約债債额額别別状狀权權围圍积積号號务務证證书書时時间間区區县縣乡鄉镇鎮门門层層楼樓筑築设設继繼买買卖賣赠贈国國关關机機处處现現价價当當历歷项項种種类類页頁续續毕畢计計总總属屬涂塗销銷担擔违違迟遲偿償还還标標产產业業动動实實际際长長东東广廣爱愛华華兴興龙龍凤鳳罗羅刘劉陈陳张張黄黃吴吳郑鄭谢謝许許叶葉苏蘇庄莊钟鍾锺鍾赵趙杨楊邓鄧冯馮卢盧萧蕭财財伟偉宁寧荣榮凯凱欢歡亲親义義仪儀乔喬汉漢渊淵泽澤满滿涛濤红紅纪紀维維绍紹经經结結绿綠缘緣贵貴贤賢宝寶阳陽阴陰陆陸队隊险險随隨隐隱鸿鴻鹏鵬丽麗齐齊斋齋岁歲虽雖临臨为為乐樂乱亂亚亞亩畝亿億从從仓倉们們众眾优優传傳伤傷侣侶俭儉倾傾储儲儿兒兰蘭冈岡写寫军軍农農决決况況冻凍净淨凉涼减減击擊刚剛创創删刪剧劇劝勸办辦劳勞势勢勋勳协協单單卫衛却卻厂廠厅廳压壓厦廈参參双雙发發变變叙敘叹嘆吓嚇吕呂吗嗎启啟员員响響问問园園图圖圣聖场場坏壞块塊坚堅坛壇坝壩坟墳坠墜垄壟垒壘备備头頭夹夾夺奪奋奮奖獎妆妝妇婦妈媽娄婁孙孫学學宠寵审審宫宮宽寬宾賓对對寻尋导導寿壽将將尔爾尘塵尝嘗尽盡屿嶼岂豈岗崗岛島岭嶺币幣师師带帶帮幫库庫应應庙廟废廢开開异異弃棄弯彎弹彈强強归歸录錄彻徹径徑忆憶怀懷态態恋戀恳懇恶惡恼惱悬懸惊驚惧懼惨慘惯慣戏戲战戰户戶执執扩擴扫掃扬揚扰擾护護报報拟擬拥擁择擇挂掛挡擋挤擠挥揮损損换換据據掷擲揽攬搀攙摄攝摆擺摇搖敌敵数數断斷无無旧舊旷曠昼晝显顯晋晉晒曬晓曉暂暫术術杀殺杂雜极極构構枪槍柜櫃栏欄树樹样樣桥橋检檢横橫欧歐歼殲残殘毁毀气氣汇匯汤湯沟溝没沒沪滬泪淚洁潔浅淺测測济濟浓濃涌湧润潤涨漲渐漸渔漁湾灣湿濕滨濱灭滅灯燈灵靈灾災炉爐点點炼煉烂爛热熱焕煥爷爺牵牽犹猶狱獄献獻猎獵环環电電画畫畅暢疗療疮瘡盐鹽监監盖蓋盘盤着著矿礦码碼础礎硕碩确確祸禍离離称稱稳穩穷窮窃竊竞競笔筆签簽简簡粮糧紧緊纠糾级級纯純纳納纸紙线線练練组組细細织織终終绕繞绘繪给給络絡绝絕绩績综綜网網罚罰职職联聯肃肅肠腸肤膚肿腫胁脅胜勝胶膠脑腦脚腳舰艦艺藝节節芦蘆苍蒼茎莖荐薦药藥获獲营營蓝藍虑慮蚀蝕补補袭襲观觀规規视視览覽觉覺誉譽订訂认認讨討让讓训訓议議讯訊讲講论論访訪评評识識诉訴诊診词詞译譯试試诗詩诚誠话話询詢该該详詳语語误誤说說请請读讀课課谁誰调調谈談谋謀谨謹贝貝负負贡貢责責败敗货貨质質购購贯貫贴貼贷貸费費资資赏賞赔賠赖賴赶趕趋趨跃躍践踐轨軌转轉轮輪软軟轻輕载載较較辅輔辆輛辈輩边邊达達迁遷过過运運这這进進远遠连連选選递遞逻邏遗遺邮郵邻鄰酱醬释釋针針钉釘钱錢铁鐵铜銅铺鋪链鏈锁鎖锅鍋错錯键鍵闪閃闭閉闲閒闻聞阅閱阶階隶隸难難雾霧静靜韩韓顶頂顺順须須顾顧顿頓预預领領频頻题題颜顏风風飞飛饭飯饮飲馆館驱驅驶駛驻駐验驗骑騎鱼魚鲁魯鸟鳥鸡雞鸣鳴鸭鴨麦麥龄齡';
  const T2MAP = (() => { const m = new Map(); const a = [...T2]; for (let i = 0; i + 1 < a.length; i += 2) if (a[i] !== a[i + 1]) m.set(a[i], a[i + 1]); return m; })();
  function fixLine(s) {
    let t = [...String(s || '')].map(c => T2MAP.get(c) || c).join('');
    t = t.replace(/[腾騰膳謄]本/g, '謄本').replace(/住[\s，,、．.。]*址/g, '住址').replace(/統[\s]*一[\s]*編[\s]*號/g, '統一編號')
      .replace(/權利[范範]圍/g, '權利範圍').replace(/權利範(?=[＊*0-9全])/g, '權利範圍：')
      .replace(/權利範[^圍：:\s＊*0-9全]?[：:]?(?=\s*[＊*0-9全])/g, '權利範圍：')   // D8：「權利範█：全部」「權利範█全部」
      .replace(/(\d)\s*(?:平方?公尺?|方公尺)/g, '$1平方公尺')
      .replace(/附屬建物用?途/g, '附屬建物用途').replace(/附屬建物用(?!途)/g, '附屬建物用途');   // D8：「附屬建物途」
    // D8：「權利範圍：全部」後面一定是 1分之1；照片常漏掉「1」「之」或整段（「全部***分之1」「全部***1分***」）
    t = t.replace(/(權利範圍[：:]?\s*全部[＊*\s]*)[0-9１]*分?之?[0-9１]*(?=[＊*\s]|$)/g, (m, a) => a + '1分之1');
    // 行首標籤後面的冒號常被漏掉（「權利範圍全部…」），補回讓規則讀得到
    t = t.replace(/^(\s*)(所有權人|統一編號|出生日期|住址|權利範圍|登記日期|登記原因|原因發生日期|建物門牌|建物坐落地號|主要用途|主要建材|權狀字號|共有部分|權利種類|權利人|擔保債權總金額)(?![：:])/, '$1$2：')
      .replace(/(\s)(登記原因|出生日期|權利種類|字號|總面積|層次面積|面積)(?![：:])/g, '$1$2：')
      .replace(/面積(?=[＊*0-9])/g, '面積：');
    return t.replace(/[：:]\s*[：:]/g, '：');
  }
  const SECTIONS = ['標示部', '所有權部', '他項權利部'];
  // 最多差一個字（認錯、多一個或少一個字）
  const near1 = (a, b) => {
    const x = [...a], y = [...b];
    if (Math.abs(x.length - y.length) > 1) return false;
    let i = 0, j = 0, e = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) { i++; j++; continue; }
      if (++e > 1) return false;
      if (x.length > y.length) i++; else if (x.length < y.length) j++; else { i++; j++; }
    }
    return e + (x.length - i) + (y.length - j) <= 1;
  };
  // 整頁校正：「************** 土地所有權部 ***」的「土／建」常被星號吃掉，依這一筆是土地或建物補回
  function fixLines(lines) {
    let kind = '';
    // D8：首行「土地登記第一類謄本」常漏字（「地登記第類謄本」），規則要靠它判斷類別；第幾類看不出來時，有完整統一編號就是第一類
    const fullId = lines.some(s => /[A-Z][0-9]{9}/.test(String(s || '')));
    return lines.map(s => {
      let t = fixLine(s), bare = t.replace(/[\s＊*※米]/g, '');
      const hd = bare.match(/^([㐀-鿿]{0,2}?)登記第(.?)類謄本/);
      if (hd && !/^(土地|建物)登記第[一二]類謄本/.test(bare)) {
        const k0 = /[物建]/.test(hd[1]) ? '建物' : /[地土]/.test(hd[1]) ? '土地' : '';
        const cls = /[一二]/.test(hd[2]) ? hd[2] : fullId ? '一' : '二';
        if (k0) { t = k0 + '登記第' + cls + '類謄本' + t.slice(t.indexOf('謄本') + 2); bare = t.replace(/[\s＊*※米]/g, ''); }
      }
      const k = bare.match(/^(土地|建物)登記第/) || bare.match(/(地|建)號$/);
      if (k) kind = k[1] === '土地' || k[1] === '地' ? '土地' : '建物';
      // 「土」常被認成「上、士、工」，「建」偶爾漏掉；有「地／物」就以它為準，都沒有才看這一筆是土地或建物
      let sec = bare.match(/^([㐀-鿿]{0,2}?)(標示部|所有權部|他項權利部)$/);
      // D8：照片常把標題裡的一個字認錯（「建物標=部」「土地所有權郎」）；前後有一串星號的短行，差一個字也當成標題
      if (!sec && /[＊*※米]{3}/.test(t) && bare.length <= 8) {
        for (const S of SECTIONS) {
          for (let pre = 0; pre <= 2 && !sec; pre++) {
            const head = bare.slice(0, pre), tail = bare.slice(pre);
            if ((!head || /^[㐀-鿿]+$/.test(head)) && near1(tail, S)) sec = [bare, head, S];
          }
          if (sec) break;
        }
      }
      if (sec) { const k = /[物建]/.test(sec[1]) ? '建物' : /[地土]/.test(sec[1]) ? '土地' : kind; if (k) return k + sec[2]; }
      return t;
    });
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const white = c => { const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); return g; };

  function crop(src, r, maxH) {
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    const w = Math.min(src.width - x, Math.ceil(r.w)), h = Math.min(src.height - y, Math.ceil(r.h));
    if (w < 2 || h < 2) return '';
    const k = Math.min(1, (maxH || 40) / h, 900 / w), c = mk(w * k, h * k);
    white(c).drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/jpeg', 0.85); c.width = c.height = 0; return u;
  }
  function thumb(src, side) {
    const k = Math.min(1, (side || 1600) / Math.max(src.width, src.height)), c = mk(src.width * k, src.height * k);
    white(c).drawImage(src, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/jpeg', 0.75); c.width = c.height = 0; return u;
  }
  function rotate(src, deg) {
    const a = deg * Math.PI / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const c = mk(src.width * cos + src.height * sin, src.width * sin + src.height * cos), g = white(c);
    g.translate(c.width / 2, c.height / 2); g.rotate(a); g.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  // 歪斜角度（度）：取深色點，找讓「每一列的深色點數」最集中的角度（投影法）
  function skewAngle(src) {
    const k = Math.min(1, 1000 / Math.max(src.width, src.height)), c = mk(src.width * k, src.height * k), g = white(c);
    g.drawImage(src, 0, 0, c.width, c.height);
    const W = c.width, H = c.height, px = g.getImageData(0, 0, W, H).data; c.width = c.height = 0;
    let sum = 0; for (let i = 0; i < px.length; i += 16) sum += px[i] + px[i + 1] + px[i + 2];
    const mean = sum / (px.length / 16) / 3, th = Math.min(150, mean - 50);
    const xs = [], ys = [];
    // 每一列都取（只隔欄取樣）：若隔列取樣，0° 時點會集中在偶數列，分數被灌高，永遠判成不歪
    for (let y = 0; y < H; y++) for (let x = (y & 1); x < W; x += 2) { const i = (y * W + x) * 4; if ((px[i] + px[i + 1] + px[i + 2]) / 3 < th) { xs.push(x - W / 2); ys.push(y); } }
    if (xs.length < 200) return 0;
    const score = deg => {
      const a = deg * Math.PI / 180, s = Math.sin(a), co = Math.cos(a), bins = new Map();
      for (let i = 0; i < xs.length; i++) { const b = Math.round(ys[i] * co - xs[i] * s); bins.set(b, (bins.get(b) || 0) + 1); }
      let v = 0; for (const n of bins.values()) v += n * n; return v;
    };
    let best = 0, bv = -1;
    for (let d = -8; d <= 8.001; d += 0.5) { const v = score(d); if (v > bv) { bv = v; best = d; } }
    const c0 = best;
    for (let d = c0 - 0.45; d <= c0 + 0.451; d += 0.15) { const v = score(d); if (v > bv) { bv = v; best = d; } }
    return Math.abs(best) < 0.2 ? 0 : best;
  }

  // 辨識結果的方框排回一行一行（同一行：垂直中心相近；行內由左到右，有明顯空隙補空白）
  function groupLines(boxes) {
    const lines = [];
    boxes.slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2)).forEach(b => {
      const cy = b.y + b.h / 2;
      const L = lines.find(l => Math.abs(l.cy - cy) < Math.min(l.h, b.h) * 0.5 && !l.boxes.some(o => b.x < o.x + o.w - 2 && o.x < b.x + b.w - 2));
      if (L) { L.boxes.push(b); L.cy = (L.cy * (L.boxes.length - 1) + cy) / L.boxes.length; L.h = Math.max(L.h, b.h); }
      else lines.push({ cy, h: b.h, boxes: [b] });
    });
    return lines.sort((a, b) => a.cy - b.cy).map(l => {
      l.boxes.sort((a, b) => a.x - b.x);
      let text = '', end = null;
      l.boxes.forEach(b => { if (end !== null && b.x - end > l.h * 0.4) text += ' '; text += b.text; end = b.x + b.w; });
      const x0 = Math.min(...l.boxes.map(b => b.x)), y0 = Math.min(...l.boxes.map(b => b.y));
      const x1 = Math.max(...l.boxes.map(b => b.x + b.w)), y1 = Math.max(...l.boxes.map(b => b.y + b.h));
      return { text: fixLine(text), x: x0, y: y0, w: x1 - x0, h: y1 - y0, score: l.boxes.reduce((s, b) => s + b.score, 0) / l.boxes.length, boxes: l.boxes };
    });
  }
  const useful = b => b.text && /[㐀-鿿0-9A-Za-z]/.test(b.text) && (b.score >= 0.85 || (b.score >= 0.55 && b.text.length >= 3));

  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy / Math.min(a.w * a.h, b.w * b.h);
  };
  async function ocrBoxes(src, opt) {
    const O = window.HGOcr;
    // 偵測對縮放很敏感（同一行在某個尺寸會整行漏掉），整頁辨識時用兩種尺寸偵測，再把沒重疊的方框補進來
    let boxes = [];
    for (const side of opt.sides || [opt.maxSide || 2000]) {
      const got = await O.detect(src, { maxSide: side });
      if (!boxes.length) boxes = got;
      else got.forEach(b => { if (!boxes.some(a => overlap(a, b) > 0.3)) boxes.push(b); });
    }
    let done = 0;
    const out = await Promise.all(boxes.map(async b => {
      const r = await O.recognize(src, b);
      done++; if (opt.onBox) opt.onBox(done, boxes.length);
      return { x: b.x, y: b.y, w: b.w, h: b.h, text: fixLine(r.text.replace(/\s+/g, ' ').trim()), score: r.score };
    }));
    return out.filter(useful);
  }

  // 整頁辨識：校正歪斜 → 判斷是否轉 90°／180° → 排成行
  async function readCanvas(src, opt) {
    opt = opt || {};
    let cv = src, angle = skewAngle(src);
    if (angle) cv = rotate(src, -angle);
    const say = t => opt.onStatus && opt.onStatus(t);
    let boxes = await O_boxes(cv, opt);
    const area = bs => bs.reduce((s, b) => s + b.w * b.h, 0);
    const tall = boxes.filter(b => b.h > b.w * 1.3);
    if (boxes.length >= 3 && area(tall) > area(boxes) * 0.5) {
      say('頁面是橫的，轉正後重新辨識…');
      const tries = [];
      for (const d of [90, -90]) { const r = rotate(cv, d); tries.push({ cv: r, boxes: await O_boxes(r, opt) }); }
      tries.sort((a, b) => mean(b.boxes) - mean(a.boxes) || b.boxes.length - a.boxes.length);
      if (cv !== src) cv.width = cv.height = 0;
      cv = tries[0].cv; boxes = tries[0].boxes; tries[1].cv.width = tries[1].cv.height = 0;
    }
    if (boxes.length >= 3 && mean(boxes) < 0.6) {
      say('頁面可能上下顛倒，轉正後重新辨識…');
      const r = rotate(cv, 180), b2 = await O_boxes(r, opt);
      if (mean(b2) > mean(boxes) + 0.05) { if (cv !== src) cv.width = cv.height = 0; cv = r; boxes = b2; } else r.width = r.height = 0;
    }
    const lines = groupLines(boxes);
    return { canvas: cv, angle, lines, score: mean(boxes) };
  }
  const mean = bs => bs.length ? bs.reduce((s, b) => s + b.score, 0) / bs.length : 0;
  const O_boxes = (cv, opt) => ocrBoxes(cv, { sides: [PAGE_SIDE, 1800], onBox: opt.onBox });

  // 電子謄本：找出頁面上「一行高、很寬」的圖片（所有權人、統一編號、住址等），回傳頁面座標（左上為原點，單位 pt）
  async function imageRows(page, pdfjs) {
    const vp = page.getViewport({ scale: 1 }), ops = await page.getOperatorList(), O = pdfjs.OPS;
    let m = [1, 0, 0, 1, 0, 0]; const stack = [], out = [];
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const f = ops.fnArray[i], a = ops.argsArray[i];
      if (f === O.save) stack.push(m.slice());
      else if (f === O.restore) m = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (f === O.transform) m = mul(m, a);
      else if (f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintImageMaskXObject) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]);
        const xs = pts.map(q => q[0]), ys = pts.map(q => vp.height - q[1]);
        const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys)), x1 = Math.min(vp.width, Math.max(...xs)), y1 = Math.min(vp.height, Math.max(...ys));
        if (x1 - x > 80 && y1 - y >= 6 && y1 - y <= 26) out.push({ x, y, w: x1 - x, h: y1 - y });
      }
    }
    return { rows: out, width: vp.width, height: vp.height };
  }

  /**
   * 讀一份謄本檔（PDF 或照片）→ { text（頁與頁用 \f 分隔）, mode: 'text'|'ocr'|'mixed', pages, evidence:[{page,text,score,crop}], thumbs:{頁:圖}, ocrPages, score }
   * opt: { pdfjs, pdfOpts:{cMapUrl, standardFontDataUrl}, ensureOcr: async()=>{}, onStatus(t), onProgress(done,total), forceOcr, cancelled:()=>bool }
   */
  async function readFile(file, opt) {
    opt = opt || {};
    const say = t => opt.onStatus && opt.onStatus(t), stop = () => opt.cancelled && opt.cancelled();
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const res = { text: '', mode: 'text', pages: 0, evidence: [], thumbs: {}, ocrPages: 0, score: 0 };
    const scores = [];
    const addLines = (no, cv, lines) => {
      lines.forEach(l => { if (KEY_LINE.test(l.text.replace(/\s/g, ''))) res.evidence.push({ page: no, text: l.text, score: l.score, crop: crop(cv, { x: l.x - 6, y: l.y - 4, w: l.w + 12, h: l.h + 8 }, 44) }); });
      lines.forEach(l => scores.push(l.score));
    };
    if (!isPdf) {
      await opt.ensureOcr();
      say('辨識照片…');
      const img = await new Promise((resolve, reject) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); resolve(im); }; im.onerror = () => { URL.revokeObjectURL(u); reject(new Error('照片無法讀取（iPhone 的 HEIC 檔請先改存成 JPG）')); }; im.src = u; });
      const k = Math.min(1, PAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight)), cv = mk(img.naturalWidth * k, img.naturalHeight * k);
      white(cv).drawImage(img, 0, 0, cv.width, cv.height);
      const r = await readCanvas(cv, { onStatus: say, onBox: (d, t) => opt.onProgress && opt.onProgress(d, t) });
      addLines(1, r.canvas, r.lines); res.thumbs[1] = thumb(r.canvas);
      res.text = fixLines(r.lines.map(l => l.text)).join('\n'); res.mode = 'ocr'; res.pages = 1; res.ocrPages = 1; res.angle = r.angle;
      if (r.canvas !== cv) r.canvas.width = r.canvas.height = 0; cv.width = cv.height = 0;
      res.score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return res;
    }
    const pdfjs = opt.pdfjs, po = opt.pdfOpts || {};
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: po.cMapUrl, cMapPacked: true, standardFontDataUrl: po.standardFontDataUrl, isEvalSupported: false, enableXfa: false }).promise;
    try {
      if (doc.numPages > 40) throw new Error('PDF 超過 40 頁，請分開上傳。');
      res.pages = doc.numPages;
      const pages = []; let textPages = 0;
      for (let no = 1; no <= doc.numPages; no++) {
        if (stop()) throw new Error('已取消');
        const page = await doc.getPage(no), tc = await page.getTextContent();
        const chars = tc.items.reduce((s, it) => s + String(it.str || '').replace(/\s/g, '').length, 0);
        if (chars >= 30 && !opt.forceOcr) {
          textPages++;
          const items = tc.items.slice(), ir = await imageRows(page, pdfjs);
          if (ir.rows.length) {
            await opt.ensureOcr();
            say(`辨識第 ${no} 頁的姓名、統一編號、住址（電子謄本裡是圖片）…`);
            const vp = page.getViewport({ scale: ROW_SCALE }), cv = mk(vp.width, vp.height);
            await page.render({ canvasContext: white(cv), viewport: vp, intent: 'print' }).promise;
            for (const [i, r] of ir.rows.entries()) {
              const box = { x: r.x * ROW_SCALE, y: r.y * ROW_SCALE - 2, w: r.w * ROW_SCALE, h: r.h * ROW_SCALE + 4 };
              const rc = mk(box.w, box.h); white(rc).drawImage(cv, box.x, box.y, box.w, box.h, 0, 0, rc.width, rc.height);
              const bs = (await ocrBoxes(rc, { maxSide: Math.max(rc.width, rc.height) })).filter(b => b.h >= rc.height * 0.35);
              const baseline = ir.height - (r.y + r.h * 0.8);
              bs.forEach(b => {
                items.push({ str: b.text, transform: [1, 0, 0, 12, r.x + b.x / ROW_SCALE, baseline], width: b.w / ROW_SCALE });
                res.evidence.push({ page: no, text: b.text, score: b.score, crop: crop(rc, { x: b.x - 4, y: 0, w: b.w + 8, h: rc.height }, 40), image: true });
                scores.push(b.score);
              });
              rc.width = rc.height = 0;
              if (opt.onProgress) opt.onProgress(i + 1, ir.rows.length);
            }
            cv.width = cv.height = 0;
          }
          pages.push(window.HGTranscript.linesFromItems(items).join('\n'));
        } else {
          await opt.ensureOcr();
          say(`辨識第 ${no}／${doc.numPages} 頁（掃描檔，每頁約 10～40 秒）…`);
          const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: PAGE_SIDE / Math.max(v1.width, v1.height) }), cv = mk(vp.width, vp.height);
          await page.render({ canvasContext: white(cv), viewport: vp, intent: 'print' }).promise;
          const r = await readCanvas(cv, { onStatus: say, onBox: (d, t) => opt.onProgress && opt.onProgress(d, t) });
          addLines(no, r.canvas, r.lines); res.thumbs[no] = thumb(r.canvas); res.ocrPages++;
          pages.push(fixLines(r.lines.map(l => l.text)).join('\n'));
          if (r.canvas !== cv) r.canvas.width = r.canvas.height = 0; cv.width = cv.height = 0;
        }
      }
      res.text = pages.join('\f');
      res.mode = !res.ocrPages ? 'text' : textPages ? 'mixed' : 'ocr';
      res.score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return res;
    } finally { try { await doc.destroy(); } catch (e) {} }
  }

  window.HGTranscriptOcr = { version: 'D8-2026-11-19', readFile, readCanvas, groupLines, skewAngle, rotate, imageRows, fixLine, fixLines };
})();
