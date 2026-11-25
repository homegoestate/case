/* 土地登記申請書備註引用，候選與核對狀態只留在當前編輯畫面。 */
(function (root) {
  'use strict';
  const law = (article, label) => ({
    label: '土地登記規則第' + article + '條' + (label || ''),
    url: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=D0060003&flno=' + article
  });
  const coOwner = { label: '土地法第三十四條之一執行要點第9、13點（113年1月1日生效）',
    url: 'https://gazette.nat.gov.tw/EG_FileManager/eguploadpub/eg029157/ch02/type2/gov10/num2/Eg.htm' };
  const rules = [
    { id: 'no-lease', group: '優先購買權', title: '出賣的基地或耕地確無出租', signer: '出賣人簽註',
      when: '出售基地或耕地時，由出賣人核對租約與現場使用情形，確認該筆土地確實未出租。涉及地上權、典權等關係時，另查相關權利。',
      text: '本案土地確無出租，如有不實，出賣人願負法律責任。',
      sources: [{ label: '土地法第104條', url: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=D0060001&flno=104' },
        { label: '土地法第107條', url: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=D0060001&flno=107' },
        { label: '新北市地政局簽註切結事項彙整表', url: 'https://www-ws.land.ntpc.gov.tw/Download.ashx?icon=..pdf&n=5paw5YyX5biC5pS%2F5bqc5Zyw5pS%2F5bGA5omA5bGs5ZCE5Zyw5pS%2F5LqL5YuZ5omA55Sz6KuL55m76KiY5qGI5Lu257C96Ki75YiH57WQ5LqL6aCF5b2Z5pW06KGoLnBkZg%3D%3D&u=LzAwMS9VcGxvYWQvMS9yZWxmaWxlLzkzNTAvNzMxOTM5LzFlYzAyNDIzLTlkNjUtNGRkYy04NjhhLThjNDZlMDAyMjRkMC5wZGY%3D' }] },
    { id: 'minor', group: '代理與當事人', title: '父母處分未成年子女的土地權利', signer: '父母依法代理並簽名',
      when: '父母為未成年子女利益處分其土地權利時使用。監護人代理購置或處分，需另核法院許可文件。',
      text: '確為未成年子女利益而處分，如有不實願負法律責任。',
      sources: [law(39, '第1、2項'), { label: '臺南地政事務所填寫說明', url: 'https://tnland.tainan.gov.tw/News_Content.aspx?n=30743&s=7925068' }] },
    { id: 'corporation', group: '代理與當事人', title: '法人為登記義務人', signer: '義務人法人蓋章',
      when: '先核對法人及代表人資格、印鑑與處分程序。財團法人或祭祀公業法人另須主管機關核准或同意備查證明。',
      text: '確依有關法令規定完成處分程序，如有不實，願負法律責任。',
      sources: [law(42), { label: '楠梓地政事務所補正說明', url: 'https://ntlao.kcg.gov.tw/CP/3712/' }] },
    { id: 'co-owner', group: '共有土地處分', title: '部分共有人處分共有土地全部', signer: '辦理處分的義務人簽註',
      when: '依土地法第34條之1第1至3項辦理時使用。核對同意比例、通知或公告、對價受領或提存文件，並列明全體共有人及其繼承人。另涉同條第4項優先購買權者，依執行要點第13點第11款另具切結書。',
      keywords: '34之1 34-1 34條之1 多數決', text: '依土地法第三十四條之一第一項至第三項規定辦理，如有不實，義務人願負法律責任。',
      sources: [law(95, '第1項'), coOwner] },
    { id: 'priority', group: '優先購買權', title: '農地重劃優先購買權人明示放棄', signer: '出賣人簽註',
      when: '僅供農地重劃條例第5條第2款或第3款的優先購買權人已明示放棄、選擇在申請書記明時使用。涉及基地承租人、耕地承租人或土地法第34條之1者須另核該類文件。',
      text: '優先購買權人確已放棄其優先購買權，如有不實，出賣人願負法律責任。',
      sources: [law(97, '第1、2項')] },
    { id: 'title-deed', group: '書狀與申辦方式', title: '申請免繕發權利書狀', signer: '申請人明示申請',
      when: '限建物所有權第一次登記、共有物分割的標示變更登記完畢，或公有土地權利登記。先確認權利人確有此意願。',
      text: '申請免繕發權利書狀。', sources: [law(65, '第2項')] },
    { id: 'online-declaration', group: '書狀與申辦方式', title: '土地登記線上聲明序號', input: '線上聲明序號',
      when: '已辦理土地登記線上聲明，且選擇在申請書記明序號時，從本案聲明資料抄錄。亦可檢附驗證後的聲明登錄表。',
      prefix: '線上聲明序號：', sources: [{ label: '申請土地登記應附文件法令補充規定第5點（112年6月2日修正）',
        url: 'https://gazette.nat.gov.tw/EG_FileManager/eguploadpub/eg029102/ch02/type2/gov10/num2/Eg.htm' }] }
  ];
  const clean = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  function caseReferences(form) {
    const result = [];
    const group = '本案資料';
    const add = (id, title, text, sourceLabel) => result.push({ id, title, group, text, sourceLabel,
      when: '請對照本案原件後引用。後續欄位異動時，已寫入的備註仍保留原文。' });
    for (const [index, p] of (Array.isArray(form?.v50Props) ? form.v50Props : []).entries()) {
      if (!p || !['土地', '建物'].includes(p.kind) || ![p.city, p.district, p.section, p.number].every(v => clean(v))) continue;
      const noType = p.kind === '土地' ? '地號' : '建號';
      const rawNumber = clean(p.number);
      const location = [p.city, p.district, p.section, p.subSection].map(clean).join('') + rawNumber + (rawNumber.endsWith(noType) ? '' : noType);
      const share = clean(p.transferShare);
      const common = p.common ? '（共有部分）' : '';
      add('property-' + index, location + common, location + common + (share ? '，移轉權利範圍 ' + share : '') + '。',
        '本案標的明細第 ' + (index + 1) + ' 筆');
    }
    const reg = form?.v50Reg || {};
    const events = Array.isArray(reg.online?.history) ? reg.online.history : [];
    const priceSerials = new Set();
    for (const e of events) {
      if (e.track !== 'price') continue;
      if (e.status === '已撤回') break;
      const serial = clean(e.reference);
      if (e.status !== '已取得列印序號（待送件）' || !serial || priceSerials.has(serial)) continue;
      priceSerials.add(serial);
      add('price-serial-' + priceSerials.size, '實價登錄申報書序號　' + serial,
        '買賣實價登錄申報書序號：' + serial + '。', '本案線上申報／列印序號（承辦登錄）');
    }
    if (clean(reg.causeDate)) add('cause-date', '原因發生日期', '原因發生日期：' + clean(reg.causeDate) + '。', '本案登記資料／原因發生日期');
    for (const [key, extras, label] of [['landReceipt', 'landOtherReceipts', '土地增值稅'], ['deedReceipt', 'deedOtherReceipts', '契稅']]) {
      const rest = reg.taxDraft?.[extras];
      const receipts = [reg.taxDraft?.[key], ...(Array.isArray(rest) ? rest : [])];
      receipts.forEach((receipt, i) => {
        const number = clean(receipt?.number);
        if (!number) return;
        const title = label + '文件字號';
        const ordinal = '第 ' + (i + 1) + ' 張';
        add(i ? key + '-' + (i + 1) : key, title + '（' + ordinal + '）' + number,
          title + '：' + number + '。', '本案' + label + '／' + ordinal + '稅務文件字號');
      });
    }
    return result;
  }
  const normalize = value => clean(value).normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
  function findOptions(options, group, query) {
    const terms = clean(query).split(/\s+/u).map(normalize);
    return options.filter(item => {
      if (group && group !== item.group) return false;
      const searchable = normalize([item.title, item.group, item.when, item.text, item.keywords, item.sourceLabel, ...(item.sources || []).map(s => s.label)].join(' '));
      return terms.every(term => searchable.includes(term));
    });
  }
  function appendNote(existing, proposed) {
    const before = String(existing ?? '');
    const candidate = clean(proposed);
    const canonical = value => normalize(value).replace(/[。.]$/u, '');
    // 舊案有把多句寫在同一列的情形，依完整句子核對，避免短字號誤中長字號。
    const expected = canonical(candidate);
    const sameText = text => canonical(text) === expected;
    if (!candidate || before.split(/[\r\n]/u).some(sameText) || before.split(/[\r\n。；;]/u).some(sameText)) return before;
    return before + (before && !/[\r\n]$/.test(before) ? '\n' : '') + candidate;
  }
  const component = {
    props: { modelValue: String, form: Object, locked: Boolean }, emits: ['update:modelValue'],
    data() { return { group: '', query: '', picked: '', entry: '', checked: false, message: '' }; },
    watch: { form() { this.clearSelection(); } },
    computed: {
      allOptions() { return rules.concat(caseReferences(this.form)); },
      groups() { return [...new Set(rules.map(item => item.group)), '本案資料']; },
      options() { return findOptions(this.allOptions, this.group, this.query); },
      item() { return this.options.find(option => option.id === this.picked); },
      preview() { return this.item?.text || (this.item?.input && clean(this.entry) ? this.item.prefix + clean(this.entry) : ''); },
      duplicate() { return !!this.preview && appendNote(this.modelValue, this.preview) === (this.modelValue ?? ''); },
      canAppend() { return this.preview && !this.duplicate && !this.locked && (!this.item.signer || this.checked); }
    },
    methods: {
      clearSelection() { this.picked = ''; this.onPick(); },
      onPick() { this.entry = ''; this.checked = false; this.message = ''; },
      append() {
        if (!this.canAppend) return;
        this.$emit('update:modelValue', appendNote(this.modelValue, this.preview));
        this.checked = false;
        this.message = '已加入申請書備註，可在上方修改。';
      }
    },
    template: `<details class="reg-notes" data-testid="desk-reg-notes">
      <summary>引用申請書備註</summary>
      <div class="grid">
        <label>分類<select v-model="group" @change="clearSelection" data-testid="reg-notes-group"><option value="">全部</option><option v-for="g in groups" :key="g">{{ g }}</option></select></label>
        <label>搜尋<input type="search" v-model="query" @input="clearSelection" placeholder="例如：法人、34之1、文件字號" data-testid="reg-notes-search"></label>
        <label>引用項目<select v-model="picked" @change="onPick" data-testid="reg-notes-item"><option value="">請選擇</option><option v-for="o in options" :key="o.id" :value="o.id">{{ o.title }}</option></select></label>
      </div>
      <p v-if="!options.length" class="muted">{{ group === '本案資料' && !query ? '尚無可引用的標的、原因日期或稅務文件字號。' : '目前沒有符合的項目。' }}</p>
      <template v-if="item">
        <p>{{ item.when }}</p>
        <p v-if="item.sources" class="muted"><a v-for="s in item.sources" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.label }}</a> <span>核對日期 2026-11-20</span></p>
        <p v-else class="muted">來源為{{ item.sourceLabel }}</p>
        <label v-if="item.input">{{ item.input }}<input type="text" v-model="entry" data-testid="reg-notes-entry"></label>
        <div v-if="preview" class="reg-notes-preview"><b>將加入的文字</b><div data-testid="reg-notes-preview">{{ preview }}</div></div>
        <label v-if="item.signer" class="reg-notes-check"><input type="checkbox" v-model="checked" data-testid="reg-notes-check">已核對本案適用條件。簽註方式為{{ item.signer }}。</label>
        <button type="button" class="btn sm" @click="append" :disabled="!canAppend" data-testid="reg-notes-append">加入申請書備註</button>
        <span aria-live="polite" class="muted" data-testid="reg-notes-message">{{ message || (duplicate ? '相同文字已在備註內。' : '') }}</span>
      </template>
    </details>`
  };
  const api = { rules, caseReferences, findOptions, appendNote, component };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HGRegNotes = api;
})(typeof window === 'undefined' ? globalThis : window);
