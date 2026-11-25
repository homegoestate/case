/* 臺南市地籍、稅籍異動即時通聯合申請書，115 年 8 月施行版。 */
(function (root) {
  'use strict';
  const formFile = 'alerts-tainan-11508.pdf';
  const formHash = '57da95436d62af527cc6bc0082b53ef1d33711a2e36643a052cb31df7211408b';
  const towns = [
    ['臺北市','新北市','基隆市','桃園市','新竹縣','新竹市'],
    ['臺中市','苗栗縣','彰化縣','南投縣','雲林縣'],
    ['臺南市','嘉義市','嘉義縣','高雄市','屏東縣'],
    ['宜蘭縣','花蓮縣','臺東縣'], ['金門縣','澎湖縣']
  ];
  const links = {
    form:'forms/tax/' + formFile, land:'https://dcland.moi.gov.tw/',
    tax:'https://netap.tax.nat.gov.tw/PEFLRX/Ept_Login',
    landGuide:'https://land.tainan.gov.tw/cp.aspx?n=42584',
    taxGuide:'https://www.tntb.gov.tw/showpage.php?lmenuid=7&smenuid=12&tmenuid=490'
  };
  const clean = value => String(value ?? '').trim();
  const idOf = value => clean(value).toUpperCase();
  function people(work) {
    const result = [];
    for (const [field, label] of [['sellers','賣方'],['buyers','買方']]) {
      for (const person of (Array.isArray(work?.[field]) ? work[field] : [])) {
        if (!person || !clean(person.name) || /代理|代表人|被授權|聯絡人|仲介|受託/.test(person.role || '')) continue;
        const key = JSON.stringify([field, clean(person.name), idOf(person.ledgerId)]);
        result.push({person, label, key, usable: !!idOf(person.ledgerId)});
      }
    }
    const counts = new Map();
    for (const row of result) counts.set(row.key, (counts.get(row.key) || 0) + 1);
    for (const row of result) row.usable = row.usable && counts.get(row.key) === 1;
    return result;
  }
  function fresh() {
    return {land:'', tax:'', capacity:'', scope:'', date:'', repName:'',repId:'',
      phone:'', phone2:'', email:'', email2:'', line:false, ownership:'', thirdParty:false,
      allTax:false, taxCities:[], registered:false, consentStamp:''};
  }
  function profile(work, key) {
    const who = people(work).find(row => row.usable && row.key === key);
    if (!who) return {};
    return {who, draft:work.v50Reg?.online?.alerts?.byOwner?.[key]};
  }
  function choose(work, key) {
    const {who} = profile(work, key);
    if (!who) return;
    const reg = work.v50Reg ||= {};
    const online = reg.online ||= {};
    const state = online.alerts ||= {};
    const owners = state.byOwner ||= {};
    if (!owners[key]) owners[key] = fresh();
    state.selected = key;
  }
  const validPhone = n => /^09\d{8}$/.test(clean(n).replace(/[ -]/g,''));
  const telephone = n => clean(n).replace(/[ -]/g,'');
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }
  const validMail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(e));
  const personId = s => /^[A-Z][A-Z0-9]\d{8}$/.test(idOf(s));
  const action = a => a === '新申請' || a === '資料變更';
  function consentVersion(key, d) {
    return JSON.stringify([key, d.land, d.tax, d.capacity, d.registered, d.scope, d.repName, d.repId,
      d.phone, d.email, d.land ? d.phone2 : '', d.land ? d.email2 : '', d.tax && d.line,
      d.ownership, d.ownership === 'other' && d.thirdParty, d.tax && d.allTax,
      d.tax && !d.allTax ? [...d.taxCities].sort() : []]);
  }
  function inspect(work, key) {
    const {who, draft:d} = profile(work, key);
    if (!who || !d) return ['請從買賣方選取姓名及統一編號可辨識的一位申請人。'];
    const errors = [];
    if ((!d.land && !d.tax) || (d.land && !action(d.land)) || (d.tax && !action(d.tax))) errors.push('請選擇地籍或稅籍服務與申請類別。終止服務請依原表辦理。');
    const org = /^\d{8}$/.test(idOf(who.person.ledgerId));
    if (!org && !personId(who.person.ledgerId)) errors.push('請回當事人欄核對身分證、居留證或法人統一編號。');
    if (!(org ? ['organization','authorized'] : ['self','statutory','authorized']).includes(d.capacity)) errors.push(org ? '請確認法人由代表人或被授權人提出。' : '請確認申辦身分。');
    if (d.capacity === 'authorized' && d.tax) errors.push('稅籍臨櫃限本人、法人代表或法定代理人。一般被授權人可另備地籍申請。');
    if (['statutory','authorized'].includes(d.capacity) && (!clean(d.repName) || !personId(d.repId))) errors.push('請填法定代理人或被授權人的姓名、身分證或居留證編號。');
    if (d.land && (!d.registered || !clean(d.scope))) errors.push('請核對登記名義人資格，並填入其名下不動產適用的登記機關或行政區。');
    if (d.tax && !d.allTax && (!Array.isArray(d.taxCities) || !d.taxCities.length || d.taxCities.some(c => !towns.flat().includes(c)))) errors.push('請選取稅籍服務縣市或全部申請。');
    if (d.date && !root.HGTaxPdf.dateParts(d.date)) errors.push('請核對申請日期。');
    if (d.tax && !clean(d.email)) errors.push('稅籍服務必填第一組電子信箱供驗證。');
    if (!clean(d.email) && !clean(d.phone)) errors.push('請至少填寫一種通知方式。');
    if ((clean(d.phone) && !validPhone(d.phone)) || (d.land && clean(d.phone2) && (!clean(d.phone) || !validPhone(d.phone2)))) errors.push('國內手機須為 09 開頭共十碼，第二組手機須併填第一組。');
    if ((clean(d.email) && !validMail(d.email)) || (d.land && clean(d.email2) && (!clean(d.email) || !validMail(d.email2)))) errors.push('請核對電子信箱格式，第二組信箱須併填第一組。');
    if (!['own','other'].includes(d.ownership)) errors.push('請確認通知資料是否全部由申請人持有。');
    if (d.ownership === 'other' && !d.thirdParty) errors.push('通知資料有第三人持有，請先向本人確認已取得受通知人同意並說明轉知責任。');
    return errors;
  }
  function handoff(work, key, service) {
    const {who, draft:d} = profile(work,key);
    if (!who || !d || !d[service] || !['land','tax'].includes(service)) return '';
    const land = service === 'land';
    const rows = [who.person.name + '｜' + idOf(who.person.ledgerId), (land ? '地籍' : '稅籍') + '異動即時通｜' + d[service],
      '適用範圍｜' + (land ? clean(d.scope) : d.allTax ? '全國開辦縣市（連江縣除外）' : d.taxCities.join('、'))];
    if (clean(d.phone)) rows.push('手機 1｜' + telephone(d.phone));
    if (clean(d.email)) rows.push('信箱 1｜' + clean(d.email));
    if (land && clean(d.phone2)) rows.push('手機 2｜' + telephone(d.phone2));
    if (land && clean(d.email2)) rows.push('信箱 2｜' + clean(d.email2));
    if (!land && d.line) rows.push('地方稅網路申報作業官方 LINE｜已綁定進階會員，選用推播');
    return rows.join('\n');
  }
  async function generate(work, key) {
    const errors = inspect(work,key);
    if (errors.length) throw new Error(errors.join('\n'));
    const {who, draft} = profile(work,key);
    // Snapshot before the first await so that a case switch cannot mix applicants.
    const d = JSON.parse(JSON.stringify(draft)), name = clean(who.person.name), id = idOf(who.person.ledgerId);
    const {pdf, page, cell, tick, markDraft} = await root.HGTaxPdf.open([[formFile, formHash]]);
    if (pdf.getPageCount() !== 2) throw new Error('官方聯合申請書頁數異常。');
    markDraft(page, 62, 24);
    if (d.date) {
      const [y,m,day] = root.HGTaxPdf.dateParts(d.date);
      cell(y,143,77,35,15,'年'); cell(m,192,77,23,15,'月'); cell(day,228,77,23,15,'日');
    }
    if (d.land) tick(d.land === '新申請' ? 246 : 300,99);
    if (d.tax) tick(d.tax === '新申請' ? 246 : 300,113);
    cell(name,217,125,66,32,'申請人姓名或名稱',11,2);
    cell(id,352,125,87,32,'申請人統一編號',11);
    if (['statutory','authorized'].includes(d.capacity)) {
      cell(d.repName,217,160,66,28,'代理人姓名',10,2);
      cell(idOf(d.repId),352,160,87,28,'代理人統一編號',11);
    }
    if (clean(d.phone)) {tick(144,196); cell(telephone(d.phone),308,193,64,12,'手機 1',10);}
    if (d.land && clean(d.phone2)) cell(telephone(d.phone2),155,213,59,12,'手機 2',10);
    if (clean(d.email)) {
      tick(144,232);
      try { cell(d.email,248,229,100,12,'信箱 1',10); }
      catch (e) {
        if (!e.message.includes('超過')) throw e;
        // The second phone wraps under its left label, leaving this area above email 1 clear.
        cell(d.email,248,214,100,27,'信箱 1',9,2);
      }
    }
    if (d.land && clean(d.email2)) {
      try { cell(d.email2,155,244,107,12,'信箱 2',10); }
      catch (e) {
        if (!e.message.includes('超過')) throw e;
        cell(d.email2,155,244,260,12,'信箱 2',10);
      }
    }
    if (d.tax && d.line) tick(144,275);
    tick(d.ownership === 'own' ? 389 : 425,304);
    if (d.land) cell(d.scope,145,334,362,19,'地籍適用範圍',11);
    if (d.tax && d.allTax) tick(144,376);
    if (d.tax && !d.allTax) towns.forEach((row,r) => row.forEach((city,c) => {
      if (d.taxCities.includes(city)) tick(220 + 48*c,388 + 12*r);
    }));
    if (d.consentStamp === consentVersion(key,d)) tick(144,470);
    pdf.setTitle('臺南市地籍、稅籍異動即時通服務申請書（核對草稿）');
    return pdf.save();
  }
  const component = {
    props:{work:Object, agency:Object}, emits:['prepared'],
    data() { return {links, towns, busy:false, message:'', transfer:''}; },
    computed:{
      rows() { return people(this.work); },
      key() { return this.work?.v50Reg?.online?.alerts?.selected || ''; },
      row() { return profile(this.work,this.key).who; },
      d() { return profile(this.work,this.key).draft; },
      organization() { return /^\d{8}$/.test(idOf(this.row?.person.ledgerId)); },
      errors() { return inspect(this.work,this.key); },
      consent() { return !!this.d && this.d.consentStamp === consentVersion(this.key,this.d); },
      caseScope() {
        const props = Array.isArray(this.work?.v50Props) ? this.work.v50Props : [];
        return [...new Set(props.filter(p => p && clean(p.city) && clean(p.district)).map(p => clean(p.city)+clean(p.district)))].join('、');
      },
      assigned() {
        const slot = this.agency?.roles?.alerts;
        if (!['primary','secondary'].includes(slot) || (slot === 'secondary' && this.agency.mode !== 'dual')) return null;
        return {name:clean(this.agency[slot]), id:clean(this.agency.profiles?.[slot]?.id)};
      },
      transferText() { return handoff(this.work,this.key,this.transfer); }
    },
    watch:{work() { this.message = ''; this.transfer = ''; }, key() { this.message = ''; this.transfer = ''; }},
    methods:{
      async blankForm() {
        try {
          const response = await fetch(links.form);
          if (!response.ok) throw new Error('官方空白表載入失敗。');
          const bytes = await response.arrayBuffer();
          const digest = new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes));
          if (Array.from(digest,b => b.toString(16).padStart(2,'0')).join('') !== formHash) throw new Error('官方空白表版本不符，請由地政局官網下載。');
          saveBlob(new Blob([bytes],{type:'application/pdf'}),'臺南市即時通聯合申請書-115年8月施行-空白.pdf');
        } catch (e) { this.message = e.message; }
      },
      select(key) { if (key) choose(this.work,key); else if (this.work?.v50Reg?.online?.alerts) this.work.v50Reg.online.alerts.selected = ''; },
      importContact() {
        const p = this.row.person;
        const phone = !this.d.phone && validPhone(p.phone) ? telephone(p.phone) : '';
        const email = !this.d.email && validMail(p.email) ? clean(p.email) : '';
        if (phone || email) {
          if (phone) this.d.phone = phone;
          if (email) this.d.email = email;
          this.clearOwnership();
        }
      },
      clearOwnership() { this.d.ownership = ''; this.d.thirdParty = false; this.d.consentStamp = ''; },
      importAgent() {
        if (this.d.capacity !== 'authorized' || !this.assigned) return;
        if (!this.d.repName && !this.d.repId) Object.assign(this.d,{repName:this.assigned.name, repId:this.assigned.id});
      },
      confirmConsent(event) { this.d.consentStamp = event.target.checked ? consentVersion(this.key,this.d) : ''; },
      async download() {
        if (this.busy || this.errors.length) return;
        const work = this.work, key = this.key, version = JSON.stringify(this.d);
        const filename = '即時通聯合申請書-' + clean(this.row.person.name).replace(/[\\/:*?"<>|]/g,'_') + '-核對草稿.pdf';
        this.busy = true; this.message = '';
        try {
          const bytes = await generate(work,key);
          if (work !== this.work || key !== this.key || version !== JSON.stringify(this.d) || !this.row || this.$?.isUnmounted) return;
          saveBlob(new Blob([bytes],{type:'application/pdf'}),filename);
          this.$emit('prepared',{service:'alerts',name:filename,filename});
          this.message = '已產生聯合申請書草稿，請逐欄核對並由應簽章人簽章。';
        } catch (e) { if (work === this.work && key === this.key) this.message = e.message; }
        finally { this.busy = false; }
      },
      async copyTransfer() {
        if (!this.transferText) return;
        const selected = this.$refs.transferBox;
        try {
          await navigator.clipboard.writeText(this.transferText);
          this.message = '已複製本項服務資料。請在官方網站登入後逐欄核對。';
        } catch { selected.focus(); selected.select(); this.message = '已選取本項資料，可使用系統複製功能。'; }
      }
    },
    template:`<section class="card" data-testid="online-alerts">
      <h3>地籍、稅籍異動即時通</h3>
      <p>臺南市任一地政事務所或財政稅務分局可臨櫃合辦。地籍服務通知登記案件收件及異動完成，稅籍服務通知土地增值稅、契稅申報收件。每位申請人各填一份。</p>
      <div class="grid"><label>本案申請人<select :value="key" @change="select($event.target.value)" data-testid="alerts-person">
        <option value="">請選擇一位申請人</option><option v-for="(r,i) in rows" :key="i" :value="r.key" :disabled="!r.usable">{{r.label}}｜{{r.person.name}}{{!r.usable ? '（請核對當事人的統一編號及重複列）' : ''}}</option>
      </select></label></div>
      <template v-if="d && row">
        <p class="muted">當事人欄現有紀錄　地籍 {{row.person.landAlert || '未確認'}} ／ 稅籍 {{row.person.taxAlert || '未確認'}}。本次申請依下列選擇填表。</p>
        <div class="grid">
          <label>地籍服務<select v-model="d.land" data-testid="alerts-land"><option value="">本次不辦</option><option>新申請</option><option>資料變更</option></select></label>
          <label>稅籍服務<select v-model="d.tax" data-testid="alerts-tax"><option value="">本次不辦</option><option>新申請</option><option>資料變更</option></select></label>
          <label>臨櫃申辦身分<select v-model="d.capacity" data-testid="alerts-capacity"><option value="">請確認</option><option v-if="!organization" value="self">本人</option><option v-if="!organization" value="statutory">法定代理人</option><option v-if="organization" value="organization">法人、公司或寺廟的代表人</option><option value="authorized">持授權證明的被授權人（地籍）</option></select></label>
          <label>申請日期（可留待簽署時填）<input type="date" v-model="d.date"></label>
        </div>
        <p v-if="organization" class="note">請備妥登記證明、代表人資格及身分證明。申請人欄列法人名稱與統編，代表人請依櫃檯指示簽章。</p>
        <template v-if="['statutory','authorized'].includes(d.capacity)">
          <div class="grid"><label>法定代理人／被授權人姓名<input v-model.trim="d.repName"></label><label>法定代理人／被授權人身分證或居留證編號<input v-model.trim="d.repId"></label></div>
          <p class="note">{{d.capacity === 'statutory' ? '另附法定代理證明及身分證明。' : '地籍臨櫃委任須有依法公證、認證或驗證的授權文件。可從本案分工帶入姓名與證號，再與授權文件核對。'}}</p>
          <button v-if="d.capacity === 'authorized' && assigned?.name" class="btn sm" type="button" :disabled="!!(d.repName || d.repId)" @click="importAgent">帶入本案分工的 {{assigned.name}}</button>
        </template>
        <template v-if="d.land">
          <p><label><input style="width:auto" type="checkbox" v-model="d.registered" data-testid="alerts-owner"> 已核對申請人是下列範圍的土地或建物登記所有權人</label></p>
          <div class="grid"><label>地籍服務適用的登記機關或行政區<input v-model.trim="d.scope" placeholder="如臺南市中西區、高雄市前金區" data-testid="alerts-scope"></label></div>
          <button type="button" v-if="caseScope" class="btn sm" :disabled="!!d.scope" @click="d.scope=caseScope">帶入本案標的行政區，再核對所有權</button>
        </template>
        <div v-if="d.tax" style="margin:10px 0"><b>稅籍通知範圍</b>
          <label><input type="checkbox" style="width:auto" v-model="d.allTax" data-testid="alerts-all"> 全部開辦縣市（連江縣除外）</label>
          <div v-if="!d.allTax"><div v-for="(cs,i) in towns" :key="i"><label v-for="c in cs" :key="c" style="display:inline-block;margin-right:8px"><input style="width:auto" type="checkbox" :value="c" v-model="d.taxCities">{{c}}</label></div></div>
        </div>
        <p><button type="button" class="btn sm" @click="importContact" data-testid="alerts-contact">帶入當事人有效的手機、Email 至空白欄</button></p>
        <div class="grid">
          <label>通知手機 1<input type="tel" v-model.trim="d.phone" @input="clearOwnership"></label>
          <label>通知信箱 1{{d.tax ? '（稅籍必填）' : ''}}<input type="email" v-model.trim="d.email" @input="clearOwnership" data-testid="alerts-email"></label>
          <label v-if="d.land">通知手機 2（僅地籍）<input type="tel" v-model.trim="d.phone2" @input="clearOwnership"></label>
          <label v-if="d.land">通知信箱 2（僅地籍）<input type="email" v-model.trim="d.email2" @input="clearOwnership"></label>
          <label>所填通知資料歸屬<select v-model="d.ownership" @change="d.thirdParty=false" data-testid="alerts-ownership"><option value="">請確認</option><option value="own">全部為申請人持有</option><option value="other">含其他人持有的手機或信箱</option></select></label>
        </div>
        <p v-if="d.ownership === 'other'"><label><input type="checkbox" style="width:auto" v-model="d.thirdParty"> 申請人已確認受通知人同意，並已說明服務內容及轉知責任</label></p>
        <p v-if="d.tax"><label><input type="checkbox" style="width:auto" v-model="d.line"> 申請人已綁定財政部地方稅網路申報作業 LINE 進階會員，選用推播</label></p>
        <p v-if="d.tax" class="note">稅籍僅採第一組手機及信箱。請於收到驗證信後 7 天內點選完成驗證。</p>
        <p><label><input type="checkbox" style="width:auto" :checked="consent" @change="confirmConsent" :disabled="!!errors.length" data-testid="alerts-consent"> 申請人已審閱並同意官方服務說明與免責聲明</label> <button type="button" class="btn sm" @click="blankForm">下載官方原表閱讀</button></p>
        <p class="muted">可先印草稿請本人核閱。未確認同意時，原表同意欄留白。簽章及機關核章由紙本辦理。</p>
        <ul v-if="errors.length" class="note" aria-live="polite"><li v-for="e in errors" :key="e">{{e}}</li></ul>
        <button class="btn primary" type="button" :disabled="busy || !!errors.length" @click="download" data-testid="alerts-download">{{busy ? '正在套印…' : '下載本人的聯合申請書 PDF'}}</button>
        <div v-if="d.land || d.tax" style="margin-top:10px"><b>線上填報資料</b><p>由申請人自行登入各服務。選取一項即可檢視、複製本人的對應資料。</p>
          <button v-if="d.land" class="btn sm" type="button" @click="transfer='land'">查看地籍填報資料</button>
          <button v-if="d.tax" class="btn sm" type="button" @click="transfer='tax'">查看稅籍填報資料</button>
          <template v-if="transferText"><textarea ref="transferBox" aria-label="本次單項服務填報資料" readonly :value="transferText" rows="6" style="width:100%;margin:6px 0"></textarea><button class="btn sm" type="button" @click="copyTransfer">複製本項資料</button></template>
        </div>
      </template>
      <p v-if="message" role="status">{{message}}</p>
      <details style="margin-top:10px"><summary>官方線上入口、臨櫃及併案條件</summary>
        <p><a :href="links.land" target="_blank" rel="noopener noreferrer">內政部數位櫃臺｜地籍異動即時通</a>　登記所有權人使用自然人憑證、已註冊健保卡或公司工商憑證，進入「地籍異動即時通」的「申請作業」。</p>
        <p><a :href="links.tax" target="_blank" rel="noopener noreferrer">地方稅網路申報作業｜稅籍異動即時通</a>　由本人以官方支援的身分驗證方式登入後申請。權屬以稅籍資料核對，未保存登記房屋可申辦稅籍服務。</p>
        <p>兩項同辦可持紙本至臺南市任一地政事務所或財稅分局。請備妥身分證明正本，稅籍另依身分備妥證明影本。跨縣市地籍可同表列明管轄地所或行政區。</p>
        <p>隨土地登記案併辦地籍服務，權利人或義務人可附申請書，範圍限本件標的之登記機關轄區。簽章與登記案相同得免再核對身分。另辦稅籍可選臨櫃或地方稅網路申報。</p>
        <p><a :href="links.landGuide" target="_blank" rel="noopener noreferrer">臺南市地政局申辦說明</a>　<a :href="links.taxGuide" target="_blank" rel="noopener noreferrer">臺南市財政稅務局申辦說明</a>　<button type="button" class="btn sm" @click="blankForm">下載 115 年 8 月施行官方空白表（含終止服務欄）</button></p>
      </details>
    </section>`
  };
  root.HGOnlineAlerts = Object.freeze({component, people, choose, inspect, generate, handoff, consentVersion, links});
})(typeof window === 'undefined' ? globalThis : window);
