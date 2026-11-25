(function () {
  'use strict';
  const forms = [
    { id: 'land-tax', tax: true, name: '土地增值稅（土地現值）申報書' },
    { id: 'deed-tax', tax: true, name: '契稅申報書' }
  ];
  const receiptTypes = [{ key: 'landReceipt', rest: 'landOtherReceipts', name: '土地增值稅' }, { key: 'deedReceipt', rest: 'deedOtherReceipts', name: '契稅' }];
  const clean = value => String(value ?? '').trim();
  function transferAreaReference(parcel) {
    const input = clean(parcel?.area).normalize('NFKC');
    const area = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(input) ? input.replaceAll(',', '') : input;
    const rawShare = clean(parcel?.transferShare).normalize('NFKC');
    if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(area) || /\d\s+\d/.test(rawShare)) return null;
    const share = rawShare.replace(/\s+/g,'');
    const [whole, decimals=''] = area.split('.');
    const fraction = /^(\d{1,12})\/(\d{1,12})$/.exec(share), reversed = /^(\d{1,12})分之(\d{1,12})$/.exec(share);
    const ratio = ['全部','全筆'].includes(share) ? [1n,1n] : fraction ? [BigInt(fraction[1]),BigInt(fraction[2])] : reversed ? [BigInt(reversed[2]),BigInt(reversed[1])] : [];
    const [n,d] = ratio;
    if (!n || !d || n > d) return null;
    let numerator = BigInt(whole + decimals) * n, denominator = 10n ** BigInt(decimals.length) * d;
    if (!numerator) return null;
    let divisor = numerator, next = denominator;
    while (next) [divisor, next] = [next, divisor % next];
    numerator /= divisor;
    denominator /= divisor;

    // 約分後分母只含 2、5 才有有限小數，其餘直接保留精確分數。
    let other = denominator;
    for (const factor of [2n, 5n]) while (other % factor === 0n) other /= factor;
    let result = numerator + '/' + denominator;
    if (other === 1n) {
      result = String(numerator / denominator);
      let remainder = numerator % denominator;
      if (remainder) result += '.';
      while (remainder) {
        remainder *= 10n;
        result += String(remainder / denominator);
        remainder %= denominator;
      }
    }
    let offer = '';
    if (100n % denominator === 0n) {
      const hundredths = numerator * 100n / denominator;
      offer = String(hundredths / 100n) + '.' + String(hundredths % 100n).padStart(2,'0');
    }
    return { formula: '移轉面積精確算式　' + area + ' ㎡ × ' + n + '/' + d + ' = ' + result + ' ㎡', offer };
  }
  function readNotice(raw) {
    const lines = String(raw || '').normalize('NFKC').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const first = lines.slice(0, 4).join(' ');
    const found = receiptTypes.filter(r => first.includes(r.name));
    if (found.length !== 1) return { error: '請包含文件抬頭及稅目，一次貼上一張土增稅或契稅文件。' };
    const fields = {};
    let conflict = false;
    function extract(key, rx, convert = s => s) {
      const unique = [...new Set(lines.map(s => s.match(rx)?.[1]).filter(Boolean).map(convert).filter(Boolean))];
      if (unique.length === 1) fields[key] = unique[0];
      else if (unique.length > 1) conflict = true;
    }
    extract('number', /^(?:文件字號|發文字號|繳款書字號|證明書字號|稅單字號)\s*[:：]\s*(.{1,80})$/);
    extract('amount', /^(?:應納稅額|實繳稅額|核定稅額)\s*[:：]\s*(?:新臺幣\s*|NT\$\s*)?((?:\d{1,3}(?:,\d{3})+|\d+))\s*元?$/, s => s.replace(/,/g,''));
    extract('date', /^(?:文件日期|發文日期|開單日期)\s*[:：]\s*((?:民國\s*)?\d{2,4}[-年/]\d{1,2}[-月/]\d{1,2}日?)$/, s => {
      const [y,m,d] = s.match(/\d+/g).map(Number),year=y<1000?y+1911:y;
      const date = new Date(Date.UTC(year,m-1,d));
      return year>=1912 && date.getUTCFullYear()===year && date.getUTCMonth()===m-1 && date.getUTCDate()===d
        ? [year,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-') : '';
    });
    const kind = ['不課徵證明','免稅證明','繳納證明','繳款書'].filter(word=>lines.slice(0,2).some(l=>l.includes(word)));
    if (kind.length===1 && (kind[0]!=='不課徵證明' || found[0].key==='landReceipt')) fields.status=kind[0];
    if (conflict || kind.length>1) return {error:'同一張貼文出現多個字號、金額、日期或文件種類，請分張貼上，或直接照原件登錄。'};
    return fields.number || fields.amount || fields.date ? { type:found[0], fields } : {error:'未讀到明確標示的字號、稅額或日期，請依原件填入下方欄位。'};
  }
  function init(work) {
    const reg = work.v50Reg;
    const draft = reg.taxDraft ||= {};
    for (const { key, rest } of receiptTypes) {
      draft[key] ||= {};
      draft[rest] ||= [];
    }
    draft.land ||= {};
  }
  const label = p => [p.district, p.section, p.subSection, p.number && (p.number + (p.kind === '土地' ? ' 地號' : ' 建號')), p.address].filter(Boolean).join(' ');
  const propertyFields = ['kind','city','district','section','subSection','number'];
  const comparable = value => clean(value).normalize('NFKC').replace(/^台/, '臺');
  function sameProperty(a,b) {
    return !!a && !!b && !!clean(a.section) && !!clean(a.number) &&
      propertyFields.every(k => comparable(a[k]) === comparable(b[k]));
  }
  function taxParties(work) {
    const parties = [];
    for (const [key,side] of [['sellers','原所有權人'],['buyers','新所有權人']]) {
      for (const p of (Array.isArray(work[key]) ? work[key] : [])) {
        if (p && p.role !== '代理人' && [p.name,p.ledgerId,p.v50Share].some(v=>clean(v))) {
          parties.push({side, name:clean(p.name), share:clean(p.v50Share)});
        }
      }
    }
    return parties;
  }
  function taxSources(work, p) {
    const refs = [], offers = [], previousValues = [];
    if (!p || !work.v50Props?.includes(p) || p.common || !['土地','建物'].includes(p.kind)) return {refs,offers};
    const land = p.kind === '土地', draft = p[land ? 'landDraft' : 'deedDraft'] || {};
    function offer(key,caption,value,action) {
      if (clean(value)) offers.push({key,caption,value:clean(value),action,current:clean(draft[key])});
    }
    if (land) {
      const calculated = transferAreaReference(p);
      if (calculated) {
        refs.push(calculated.formula);
        offer('transferArea','土地面積 × 本筆移轉持分（㎡）',calculated.offer,'帶入移轉面積');
      }
      if (work.v50Props.filter(row=>row?.kind==='土地').length>1) {
        const shared=work.v50Reg?.taxDraft?.land || {};
        offer('branch','舊案共用受理分局',shared.branch,'已核對本筆分局，帶入');
        if (['買賣','贈與','配偶贈與'].includes(shared.reason)) offer('reason','舊案共用移轉原因',shared.reason,'已核對本筆移轉原因，帶入');
      }
    } else offer('houseAddress','本戶建物門牌',p.address,'已核對房屋稅單門牌，帶入地址');
    const source = p.transcriptTax;
    if (!source) return {refs,offers};
    if (!sameProperty(source.sourceProperty,p) || work.v50Props.filter(row=>sameProperty(row,p)).length !== 1) {
      refs.push('謄本坐落與本筆標的無法唯一對應，請重新核對地建號。');
      return {refs,offers};
    }
    if (land) {
      for (const [key,title] of [['announcedLandValue','公告土地現值'],['declaredLandPrice','申報地價']]) {
        const v = source[key];
        if (v && clean(v.unitValue)) refs.push(title + '　' + (clean(v.period) || '期別待核') + '　' + clean(v.unitValue) + ' 元／㎡');
      }
      const previous = Array.isArray(source.previousTransfers) ? source.previousTransfers.filter(Boolean) : [];
      for (const v of previous) {
        refs.push(['前次移轉現值／原規定地價',v.ownerSequence && '所有權登記次序 ' + v.ownerSequence,
          v.date || v.period,clean(v.unitValue) && v.unitValue+' 元／㎡',v.share && '權利範圍 '+v.share].filter(Boolean).join('　'));
      }
      const entry = previous[0], owners = source.ownerSequences, sellers = taxParties(work).filter(p=>p.side==='原所有權人');
      const uniquePrevious = previous.length === 1 && !source.previousTransfersIncomplete && Array.isArray(owners)
        && owners.length === 1 && !!entry.ownerSequence && owners[0] === entry.ownerSequence && sellers.length === 1 && !!sellers[0].name;
      if (uniquePrevious) {
        if (/^\d{1,12}(?:\.\d{1,6})?$/.test(clean(entry.unitValue))) {
          offer('previousUnitValue','本筆前次移轉現值／原規定地價（元／㎡）',entry.unitValue,'已核對這次取得適用，帶入單價');
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean(entry.date)) && window.HGTaxPdf?.dateParts(entry.date)) {
          offer('previousDate','謄本所載完整日期',entry.date,'已核對與前次原因發生日相同，帶入日期');
        }
      } else if (previous.length || source.previousTransfersIncomplete) {
        refs.push('請依原件逐次核對所有權人、取得年月、現值及持分。');
        for (const v of previous) if (/^\d+(?:\.\d+)?$/.test(clean(v.unitValue))) {
          previousValues.push({label:[v.ownerSequence && '登記次序 '+v.ownerSequence, v.period || v.date, v.share].filter(Boolean).join('／'),value:clean(v.unitValue)});
        }
      }
    } else if (/^\d{11}$/.test(clean(source.houseTaxNo))) {
      offer('taxNo','本戶謄本所載房屋稅籍編號',source.houseTaxNo,'已核對本戶，帶入稅籍編號');
    }
    return {refs,offers,previousValues};
  }
  function applyTaxSource(work, p, key) {
    const item = taxSources(work,p).offers.find(row=>row.key===key);
    if (!item || item.current) return false;
    const draftKey = p.kind === '土地' ? 'landDraft' : 'deedDraft';
    (p[draftKey] ||= {})[key] = item.value;
    return true;
  }
  const sourcePanel = {
    props:['work','property'],
    setup(props) {
      const sources = Vue.computed(()=>taxSources(props.work,props.property));
      const copied = Vue.ref('');
      async function copyReference(item, button) {
        try {
          await navigator.clipboard.writeText(item.value);
          copied.value = '已複製 ' + item.value;
        } catch {
          const input = button.previousElementSibling;
          input.focus(); input.select(); copied.value = '已選取單價，可按 Ctrl+C 或使用複製。';
        }
      }
      Vue.watch(()=>props.property,()=>{copied.value='';});
      return {sources,copied,copyReference,apply:key=>applyTaxSource(props.work,props.property,key)};
    },
    template: `<section v-if="sources.refs.length || sources.offers.length" class="note" :data-testid="property.kind==='土地'?'d12-land-sources':'d12-deed-sources'">
      <b>本筆可核對的資料</b>
      <div v-for="(line,i) in sources.refs" :key="i">{{line}}</div>
      <div v-for="(item,i) in sources.previousValues" :key="'prior-'+i" class="d9-actions">
        <label :for="'trial-prior-'+i">{{item.label}} 的參考單價</label>
        <input :id="'trial-prior-'+i" readonly :value="item.value" style="max-width:9em">
        <button type="button" class="mini" :data-testid="'d12-copy-prior-'+i" @click="copyReference(item,$event.currentTarget)">複製單價</button>
      </div>
      <small v-if="copied" role="status">{{copied}}</small>
      <div v-for="item in sources.offers" :key="item.key" class="d9-actions">
        <span>{{item.caption}}　{{item.value}}</span>
        <small v-if="item.current">{{item.current===item.value ? '草稿已填相同值' : '草稿已填 '+item.current+'，保留原值'}}</small>
        <button v-else type="button" class="mini" :data-testid="'d12-fill-'+item.key" @click="apply(item.key)">{{item.action}}</button>
      </div>
    </section>`
  };
  function useTax(work) {
    const { computed, shallowRef, ref, watch } = Vue;
    const chosen = shallowRef(null), confirmed = ref('');
    const chosenLand = shallowRef(null), landConfirmation = ref('');
    const parcels = computed(() => (work.value?.v50Props || []).filter(p => p.kind === '土地'));
    const parcel = computed(() => parcels.value.length === 1 ? parcels.value[0] : parcels.value.includes(chosenLand.value) ? chosenLand.value : null);
    const landSignature = computed(() => JSON.stringify([parcel.value && label(parcel.value), parcel.value?.transferShare, parcels.value.map(label), work.value?.sellers, work.value?.buyers]));
    const landReviewed = computed(() => !!landConfirmation.value && landConfirmation.value === landSignature.value);
    function chooseLand(p) { chosenLand.value = p || null; landConfirmation.value = ''; }
    function markLand(yes) { landConfirmation.value = yes ? landSignature.value : ''; }
    const buildings = computed(() => (work.value?.v50Props || []).filter(p => p.kind === '建物' && !p.common));
    const selected = computed(() => buildings.value.length === 1 ? buildings.value[0] : buildings.value.includes(chosen.value) ? chosen.value : null);
    const engine = id => id === 'land-tax' ? window.HGLandTax : window.HGDeedTax;
    function choose(p) { chosen.value = p || null; confirmed.value = ''; }
    watch(work, () => {choose(null); chooseLand(null);}, { flush: 'sync' });
    function matches(common, unit) {
      return !!clean(unit.section) && !!clean(unit.number) && clean(common.commonOf) === clean(unit.number)
        && ['city','district','section','subSection'].every(k => clean(common[k]) === clean(unit[k]));
    }
    const commonParts = computed(() => (work.value?.v50Props || []).filter(p => p.kind === '建物' && p.common));
    const ambiguous = computed(() => commonParts.value.some(p => buildings.value.filter(b => matches(p,b)).length !== 1));
    const matched = computed(() => !selected.value ? [] : commonParts.value.filter(p => matches(p, selected.value)));
    const signature = computed(() => JSON.stringify([selected.value && label(selected.value), selected.value?.transferShare, buildings.value.map(label), matched.value.map(p=>[label(p),p.transferShare]), work.value?.buyers, work.value?.sellers]));
    function mark(value) { confirmed.value = value ? signature.value : ''; }
    const reviewed = computed(() => !!confirmed.value && confirmed.value === signature.value);
    function record(id) {
      const w = work.value;
      if (id === 'land-tax') {
        const draft = w.v50Reg.taxDraft, local = parcel.value?.landDraft || {};
        const legacy = parcels.value.length === 1 ? draft.land : {};
        const branch = local.branch ?? legacy.branch ?? '', reason = local.reason ?? legacy.reason ?? '';
        return { ...w, v50Props: parcel.value ? [parcel.value] : [], v50Reg: { ...w.v50Reg, taxDraft: {...draft, land: {...draft.land, branch, reason}} } };
      }
      const p = selected.value;
      return { ...w, v50Props: p ? [p, ...matched.value] : [], v50Reg: { ...w.v50Reg, taxDraft: { ...w.v50Reg.taxDraft, deed: p?.deedDraft || {} } } };
    }
    function review(id) {
      if (!window.HGTaxPdf) return { warnings: [], blocking: ['稅表套印程式尚未載入，請重新開啟作業台。'] };
      if (id === 'deed-tax' && ambiguous.value) return { warnings: [], blocking: ['共有部分未能逐一對應主建物，請核對所屬主建號與段小段。'] };
      if (id === 'land-tax' && parcels.value.length > 1) {
        if (!parcel.value) return { warnings: [], blocking: ['請先選擇本次申報的地號。'] };
        if (!landReviewed.value) return { warnings: [], blocking: ['請核對本筆土地的當事人及移轉持分。'] };
      }
      if (id === 'deed-tax' && buildings.value.length > 1) {
        if (!selected.value) return { warnings: [], blocking: ['請先選擇本次申報的主建物。'] };
        if (!reviewed.value) return { warnings: [], blocking: ['請核對本戶適用的當事人及共有部分。各戶權利人不同時須分案辦理。'] };
      }
      const e = engine(id);
      return e ? e.inspect(record(id)) : { warnings: [], blocking: ['稅表程式載入失敗，請重新開啟作業台。'] };
    }
    return Vue.reactive({ parcels, parcel, chooseLand, markLand, landReviewed, buildings, selected, matched, ambiguous, reviewed, choose, mark, record, review, engine });
  }
  const inputs = {
    props: ['work', 'tax', 'files', 'caseId'], emits: ['load-files', 'open-files'],
    components: { TaxSourcePanel:sourcePanel },
    setup(props) {
      const pasted=Vue.ref(''),notice=Vue.ref(null),importMessage=Vue.ref('');
      const fieldNames={number:'文件字號', date:'文件日期', amount:'原件所載稅額', status:'文件種類'};
      function inspectNotice() { notice.value=readNotice(pasted.value); importMessage.value=''; }
      function addNotice() {
        if (!notice.value?.fields) return;
        const {type,fields}=notice.value, draft=props.work.v50Reg.taxDraft;
        const existing=receipts(type);
        if (fields.number && existing.some(item=>item.number===fields.number)) { importMessage.value='此稅目已有相同字號，請核對既有登錄。'; return; }
        if (Object.values(draft[type.key]).some(Boolean)) draft[type.rest].push({...fields});
        else Object.assign(draft[type.key],fields);
        pasted.value=''; notice.value=null; importMessage.value='已帶入本案，請按上方存檔。';
      }
      const originals = Vue.computed(() => props.files.caseId === props.caseId ? props.files.rows.filter(f => f.kind === 'tax' && !f.void) : []);
      function put(obj, key, value) { (obj.deedDraft ||= {})[key] = value; }
      function setParcel(key, value) { (props.tax.parcel.landDraft ||= {})[key] = value; }
      const parties = Vue.computed(()=>taxParties(props.work));
      const receipts = type => [props.work.v50Reg.taxDraft[type.key], ...props.work.v50Reg.taxDraft[type.rest]];
      function removeReceipt(type, i) {
        const extra = props.work.v50Reg.taxDraft[type.rest];
        if (i > 0 && (!Object.values(extra[i-1]).some(Boolean) || confirm('要移除這筆稅務文件登錄嗎？附件仍會保存在本案文件分頁。'))) extra.splice(i-1, 1);
      }
      return { originals, receiptTypes, receipts, removeReceipt, label, put, setParcel, parties, pasted, notice, inspectNotice, addNotice, fieldNames, importMessage };
    },
    template: `
      <div>
        <div class="note" data-testid="d12-tax-case"><b>兩份稅表共用的案件資料</b>
          <div>公契立約日期　{{work.v50Reg.contractDate || '待填'}}</div>
          <div v-for="(p,i) in parties" :key="i">{{p.side}}　{{p.name || '姓名待填'}}　持分 {{p.share || '待填'}}</div>
          <div v-if="!parties.length">當事人與各人持分待填。</div>
          <small>多筆標的請逐筆核對當事人及其移轉持分。土地與房屋契價請按各筆契約填寫。</small>
        </div>
        <fieldset class="d9-work"><legend>土地增值稅（土地現值）</legend>
          <p v-if="!tax.parcels.length" class="muted">請先在「標的明細」新增土地，或從謄本帶入。</p>
          <label v-if="tax.parcels.length>1">選擇本次申報地號<select data-testid="d12-pick-land" :value="tax.parcels.indexOf(tax.parcel)" @change="tax.chooseLand(tax.parcels[Number($event.target.value)])"><option value="-1">請選擇土地</option><option v-for="(p,i) in tax.parcels" :value="i">{{label(p) || '土地 '+(i+1)}}</option></select></label>
          <div v-if="tax.parcel" class="d9-parcel">
            <b>{{label(tax.parcel) || '本案土地'}}</b>　<span class="muted">{{tax.parcel.area || '—'}} ㎡ · 移轉 {{tax.parcel.transferShare || '待填'}}</span>
            <tax-source-panel :work="work" :property="tax.parcel"></tax-source-panel>
            <div class="grid">
              <label>本筆土地契約所載金額（元）<input inputmode="decimal" data-testid="d9-land-price" :value="tax.parcel.landDraft?.contractAmount" @input="setParcel('contractAmount',$event.target.value)"></label>
              <label>本次移轉面積（㎡）<input aria-label="本次移轉面積（㎡）" inputmode="decimal" data-testid="d12-transfer-area" :value="tax.parcel.landDraft?.transferArea" @input="setParcel('transferArea',$event.target.value)"></label>
              <label>前次移轉原因發生日期<input type="date" :value="tax.parcel.landDraft?.previousDate" @input="setParcel('previousDate',$event.target.value)"></label>
              <label>原規定地價／前次移轉現值（元／㎡）<input inputmode="decimal" :value="tax.parcel.landDraft?.previousUnitValue" @input="setParcel('previousUnitValue',$event.target.value)"></label>
              <label>申報移轉現值方式<select :value="tax.parcel.landDraft?.declaredMode || ''" @change="setParcel('declaredMode',$event.target.value)"><option value="">待確認</option><option>公告土地現值</option><option>每平方公尺</option></select></label>
              <label>申報移轉現值單價（元／㎡）<input inputmode="decimal" :value="tax.parcel.landDraft?.declaredUnitValue" @input="setParcel('declaredUnitValue',$event.target.value)" placeholder="按每平方公尺申報時填寫"></label>
            </div>
            <label v-if="tax.parcels.length>1"><input type="checkbox" :checked="tax.landReviewed" @change="tax.markLand($event.target.checked)"> 我已核對本筆土地適用本案列示的當事人與移轉持分</label>
          </div>
          <div v-if="tax.parcel" class="grid">
            <label>受理分局（名稱）<input :value="tax.parcel.landDraft?.branch ?? (tax.parcels.length===1 ? work.v50Reg.taxDraft.land.branch : '')" @input="setParcel('branch',$event.target.value.trim())" placeholder="依本筆土地所在地核對"></label>
            <label>本次移轉原因<select :value="tax.parcel.landDraft?.reason ?? (tax.parcels.length===1 ? work.v50Reg.taxDraft.land.reason : '') ?? ''" @change="setParcel('reason',$event.target.value)"><option value="">依已填買賣原因，其他待確認</option><option>買賣</option><option>贈與</option><option>配偶贈與</option></select></label>
          </div>
          <p v-if="tax.parcels.length>1 && (work.v50Reg.taxDraft.land.branch || work.v50Reg.taxDraft.land.reason)" class="muted">舊案共用資料　{{work.v50Reg.taxDraft.land.branch}}　{{work.v50Reg.taxDraft.land.reason}}。請按地號核對、填入適用值。</p>
          <a href="https://www.tntb.gov.tw/download_list2.php?lmenuid=7&amp;qcategory=6&amp;qtype=1&amp;smenuid=22&amp;tmenuid=56" target="_blank" rel="noopener noreferrer">臺南財稅局原表及填寫說明</a>
        </fieldset>
        <fieldset class="d9-work"><legend>契稅（按房屋申報）</legend>
          <p v-if="!tax.buildings.length" class="muted">請先在「標的明細」新增主建物，或從謄本帶入。</p>
          <label v-if="tax.buildings.length>1">選擇本次申報主建物
            <select data-testid="d12-pick-building" :value="tax.buildings.indexOf(tax.selected)" @change="tax.choose(tax.buildings[Number($event.target.value)])"><option value="-1">請選擇房屋</option><option v-for="(p,i) in tax.buildings" :value="i">{{label(p) || '建物 '+(i+1)}}</option></select>
          </label>
          <template v-if="tax.selected"><p><b>{{ label(tax.selected) || '本案主建物' }}</b></p>
            <tax-source-panel :work="work" :property="tax.selected"></tax-source-panel>
            <div class="grid">
              <label>房屋稅籍編號<input inputmode="numeric" data-testid="d9-tax-no" :value="tax.selected.deedDraft?.taxNo" @input="put(tax.selected,'taxNo',$event.target.value)"></label>
              <label>房屋稅單所載地址<input :value="tax.selected.deedDraft?.houseAddress" :placeholder="tax.selected.address || '請核對房屋稅單'" @input="put(tax.selected,'houseAddress',$event.target.value)"></label>
              <label>房屋契約移轉價格（元）<input data-testid="d9-deed-price" inputmode="decimal" :value="tax.selected.deedDraft?.transferPrice" @input="put(tax.selected,'transferPrice',$event.target.value)" placeholder="依本戶契約填寫"></label>
              <label>申報日期<input type="date" :value="tax.selected.deedDraft?.filingDate" @input="put(tax.selected,'filingDate',$event.target.value)"></label>
              <label>申報契別<select :value="tax.selected.deedDraft?.caseType || ''" @change="put(tax.selected,'caseType',$event.target.value)"><option value="">待承辦核對</option><option>買賣</option><option>二親等間買賣</option><option>贈與</option><option>配偶贈與</option></select></label>
            </div>
            <template v-if="tax.buildings.length>1"><p>本戶共有部分：{{tax.matched.map(label).join('、') || '無已配對明細'}}</p><label><input type="checkbox" :checked="tax.reviewed" @change="tax.mark($event.target.checked)"> 我已核對本戶適用本案列示的買賣雙方與共有部分</label></template>
          </template>
          <a href="https://www.tntb.gov.tw/download_list2.php?lmenuid=7&amp;qcategory=8&amp;qtype=1&amp;smenuid=22&amp;tmenuid=58" target="_blank" rel="noopener noreferrer">臺南財稅局契稅書表及附聯</a>
        </fieldset>
        <details class="d9-work" @toggle="$event.target.open && !files.loading && $emit('load-files')"><summary>已收到的稅單／證明</summary>
          <p>收到稅務局文件後，按原件登錄字號、金額，並選取同案附件。</p>
          <details><summary>從稅單文字帶入</summary>
            <label>貼上電子稅單的抬頭及有欄名的資料<textarea rows="3" v-model="pasted" @input="notice=null; importMessage=''" placeholder="例如：契稅繳款書、文件字號、應納稅額。每個欄位一行，欄名與數值用冒號隔開。"></textarea></label>
            <button type="button" class="btn sm" @click="inspectNotice" :disabled="!pasted.trim()">檢視可帶入欄位</button>
            <p v-if="notice?.error">{{notice.error}}</p>
            <div v-if="notice?.fields"><b>{{notice.type.name}}</b><div v-for="(v,k) in notice.fields">{{fieldNames[k]}}：{{v}}</div><button class="btn sm" type="button" @click="addNotice">已對照原件，加入這張文件</button></div>
            <p role="status" v-if="importMessage">{{importMessage}}</p>
          </details>
          <div class="d9-actions"><button class="btn sm" type="button" @click="$emit('open-files')">到文件分頁上傳稅單</button><button class="btn sm" type="button" @click="$emit('load-files')">重讀本案附件</button></div>
          <p v-if="files.error" role="alert">{{files.error}}</p>
          <div v-for="r in receiptTypes" :key="r.key"><h4 class="d9-subhead">{{r.name}}</h4><div v-for="(entry,i) in receipts(r)" :key="i">
            <div v-if="i>0" class="d9-actions"><b>{{r.name}}文件 {{i+1}}</b><button type="button" class="btn sm" @click="removeReceipt(r,i)">移除登錄</button></div>
            <div class="grid">
              <label>文件種類<select v-model="entry.status"><option value="">請選擇</option><option>繳款書</option><option>繳納證明</option><option>免稅證明</option><option v-if="r.key==='landReceipt'">不課徵證明</option></select></label>
              <label>文件字號<input v-model.trim="entry.number"></label>
              <label>文件日期<input type="date" v-model="entry.date"></label>
              <label>原件所載稅額（元）<input inputmode="numeric" v-model.trim="entry.amount"></label>
              <label>本案稅單附件<select v-model="entry.fileId"><option value="">請選取</option><option v-if="entry.fileId && !originals.some(f=>f.file_id===entry.fileId)" :value="entry.fileId">原連結待核對</option><option v-for="f in originals" :value="f.file_id">{{f.name}}</option></select></label>
            </div>
          </div><button type="button" class="btn sm" @click="work.v50Reg.taxDraft[r.rest].push({})">＋新增一張{{r.name}}文件</button>
          </div>
        </details>
      </div>`
  };
  window.HGDeskTax = { forms, init, inputs, useTax, readNotice, taxSources, applyTaxSource };
})();
