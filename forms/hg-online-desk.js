/* Online handoff state belongs to the selected case, alongside the registration papers. */
(function (root) {
  'use strict';
  const clean = v => String(v ?? '').trim();
  const tracks = {land:'土地增值稅', deed:'契稅', price:'買賣實價登錄', landAlert:'地籍異動即時通', taxAlert:'稅籍異動即時通'};
  const tasks = {tax:'地方稅申報', price:'買賣實價登錄', alerts:'異動即時通聯繫'};
  const statuses = ['已取得列印序號（待送件）','等待電子簽章','已簽章待核對送件','已隨登記案線上送出','已送出待收件','已收件','待補正','已補正待回覆','已辦結','已撤回','機關確認服務已啟用','機關確認服務已終止'];
  function init(w) {
    const o = w.v50Reg.online ||= {};
    for (const key of ['tax','price','alerts','prepared']) o[key] ||= {};
    o.history ||= [];
    const a = o.agency ||= {};
    a.mode ||= 'single';
    if (!Object.hasOwn(a,'primary')) a.primary = clean(w.ledgerRegistrationAgent || w.ledgerAgent);
    a.secondary ??= '';
    a.profiles ||= {};
    for (const side of ['primary','secondary']) a.profiles[side] ||= {};
    a.roles ||= {};
    for (const key of Object.keys(tasks)) a.roles[key] ??= a.mode === 'single' ? 'primary' : '';
    a.confirmations ||= {};
    return o;
  }
  function scopeStamp(w,a,k) {
    // Only invalidates prior manual confirmations; never used for authentication.
    const ids = side => (w[side] || []).filter(p => clean(p.name) || clean(p.ledgerId))
      .map(p => [clean(p.name),clean(p.ledgerId),clean(p.role)]).sort();
    const signature = JSON.stringify([k,ids('buyers'),ids('sellers'),a.mode,a.roles[k],a.primary,a.profiles.primary.id || '',
      ...(a.mode === 'dual' ? [a.secondary,a.profiles.secondary.id || ''] : [])]);
    let n = 2166136261;
    for (let i = 0; i < signature.length; i++) n = Math.imul(n ^ signature.charCodeAt(i),16777619);
    return signature.length + '-' + (n >>> 0).toString(16);
  }
  function validNames(a) {
    return !!clean(a.primary) && (a.mode !== 'dual' || (!!clean(a.secondary) && clean(a.primary) !== clean(a.secondary)));
  }
  function delegationNote(a) {
    if (a.mode !== 'dual' || !validNames(a)) return '';
    const main = a.registrationLead;
    const people = '本案權利人委任' + clean(a.primary) + '地政士，義務人委任' + clean(a.secondary) + '地政士';
    return people + (['primary','secondary'].includes(main) ? '，雙方協議由' + clean(a[main]) + '地政士主辦登記申請。' : '。');
  }
  function registration(w) {
    const a = w.v50Reg.online?.agency;
    if (a?.mode !== 'dual') return null;
    return {people:['primary','secondary'].map((key,i) => {
      const p = a.profiles[key];
      return {role:i ? '義務人之代理人' : '權利人之代理人',name:clean(a[key]),birthDate:p.birth || '',identityNo:clean(p.id),address:clean(p.address),phone:clean(p.phone)};
    }),note:delegationNote(a),phone:['primary','secondary'].includes(a.registrationLead) ? a.profiles[a.registrationLead].phone || '' : ''};
  }
  const component = {
    props:['work','operator','locked'], emits:['forms'], components:{TaxOnline:root.HGOnlineTax.component,PriceOnline:root.HGOnlinePrice.component,AlertsOnline:root.HGOnlineAlerts.component},
    setup(props) {
      const {ref, computed, watch} = root.Vue;
      const o = computed(() => props.work.v50Reg.online), a = computed(() => o.value.agency);
      const initial = new URLSearchParams(root.location.search).get('task');
      const step = ref(['price','alerts'].includes(initial) ? initial : 'tax'), track = ref(({price:'price',alerts:'landAlert'})[step.value] || 'land'), event = ref('已收件'), reference = ref(''), note = ref(''), subject = ref(''), msg = ref('');
      const alertTrack = computed(() => ['landAlert','taxAlert'].includes(track.value));
      const subjects = computed(() => root.HGOnlineAlerts.people(props.work).filter(p=>p.usable)
        .map(p=>({key:p.key,label:p.label+' '+clean(p.person.name)})));
      const channel = computed(()=>o.value.price.channel || '');
      const d1Status = new Set(['等待電子簽章','已簽章待核對送件','已隨登記案線上送出']);
      const allowedStatuses = computed(() => statuses.filter(s => (!s.includes('列印序號') || (track.value==='price' && channel.value==='A2'))
        && (!d1Status.has(s) || (track.value==='price' && channel.value==='D1')) && (!s.startsWith('機關確認服務') || alertTrack.value)));
      watch(allowedStatuses,options=>{if (!options.includes(event.value)) event.value='已收件';});
      function confirmed(k) {return validNames(a.value) && !!a.value.roles[k] && a.value.confirmations[k]?.stamp === scopeStamp(props.work,a.value,k);}
      watch(() => ['tax','price'].map(k=>scopeStamp(props.work,a.value,k)),() => {
        for (const k of ['tax','price']) if (a.value.confirmations[k] && !confirmed(k)) delete a.value.confirmations[k];
      },{flush:'sync'});
      const agency = computed(() => ({...a.value,verified:{tax:confirmed('tax'),price:confirmed('price')}}));
      function confirmScope(k, enabled) {
        if (!enabled) {delete a.value.confirmations[k];return;}
        a.value.confirmations[k] = {stamp:scopeStamp(props.work,a.value,k),by:props.operator,at:new Date().toISOString()};
      }
      function setMode(value) {
        a.value.mode = value;
        a.value.confirmations = {};
        for (const key of Object.keys(tasks)) a.value.roles[key] = value === 'single' ? 'primary' : '';
        if (value === 'single') {
          const name = clean(props.work.ledgerRegistrationAgent || props.work.ledgerAgent);
          if (clean(a.value.primary) !== name) a.value.profiles.primary = {};
          a.value.primary = name;
        }
      }
      function setName(key,value) {
        if (clean(a.value[key]) !== clean(value)) a.value.profiles[key] = {};
        a.value[key] = value;
        if (a.value.mode === 'single' && key === 'primary') props.work.ledgerRegistrationAgent = value;
      }
      watch(() => [props.work.ledgerRegistrationAgent,props.work.ledgerAgent],() => {
        const name = clean(props.work.ledgerRegistrationAgent || props.work.ledgerAgent);
        if (a.value.mode === 'single' && clean(a.value.primary) !== name) {
          a.value.profiles.primary={}; a.value.primary=name;
        }
      });
      function selectStep(s) {
        step.value=s; track.value=({tax:'land',price:'price',alerts:'landAlert'})[s];
      }
      watch(track,()=>{event.value='已收件';reference.value='';note.value='';subject.value=alertTrack.value && subjects.value.some(x=>x.key===o.value.alerts.selected) ? o.value.alerts.selected : '';msg.value='';});
      watch(() => o.value.alerts.selected, key => {if (alertTrack.value) subject.value=subjects.value.some(x=>x.key===key) ? key : '';});
      function prepared(which,payload) {
        const file = clean(typeof payload === 'string' ? payload : payload?.filename || payload?.name);
        o.value.prepared[which] = {file,at:new Date().toISOString(),by:props.operator};
      }
      const noticeRefs = computed(() => {
        if (track.value !== 'land' && track.value !== 'deed') return [];
        const tax = props.work.v50Reg.taxDraft || {}, k=track.value;
        return [...new Set([tax[k+'Receipt'], ...(tax[k+'OtherReceipts'] || [])].map(p=>clean(p?.number)).filter(Boolean))];
      });
      function record() {
        const ref = clean(reference.value), detail = clean(note.value), who = subjects.value.find(x=>x.key===subject.value);
        if (!ref || (alertTrack.value && !who)) {msg.value='請填官方畫面、回函或收執聯可核對的編號；異動即時通另選申請人。';return;}
        if (event.value === '待補正' && !detail) {msg.value='請填機關要求補正的事項。';return;}
        if (!allowedStatuses.value.includes(event.value)) {msg.value='請選擇本項作業的進度。';return;}
        const e = {track:track.value,channel:track.value==='price' ? channel.value : '',status:event.value,reference:ref,note:detail,subject:alertTrack.value ? who.label : '',subjectKey:alertTrack.value ? who.key : '',by:props.operator,at:new Date().toISOString()};
        const last = o.value.history.find(x => x.track === e.track && x.subjectKey === e.subjectKey);
        if (last && ['channel','status','reference','note'].every(k=>last[k]===e[k])) {msg.value='同一筆進度已記錄。';return;}
        if (alertTrack.value && event.value.startsWith('機關確認服務')) {
          const selected=root.HGOnlineAlerts.people(props.work).find(p=>p.key===who.key && p.usable);
          if (!selected) {msg.value='請重新核對申請人。';return;}
          selected.person[track.value] = event.value.endsWith('已啟用') ? '已申請' : '已終止';
        }
        o.value.history.unshift(e); reference.value='';note.value='';msg.value='進度已加入本案，按作業台「存檔」保留。';
      }
      return {o,a,tasks,tracks,allowedStatuses,step,track,noticeRefs,event,reference,note,subject,subjects,msg,agency,alertTrack,validNames,confirmed,confirmScope,setMode,setName,selectStep,prepared,record,
        profileFields:{office:'事務所',id:'統一編號',birth:'出生日期',address:'住所',phone:'電話',email:'電子郵件'},
        trackNames:{tax:'地方稅申報',price:'實價登錄',alerts:'異動即時通'},
        time:s=>new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})};
    },
    template:`<div class="online-desk">
      <div class="online-title"><div><h2>線上申報工作台</h2><p>先確認本案的土地、建物和當事人，再依各機關的方式送件。已取得的案號與補正事項可留給下一位承辦。</p></div><button type="button" class="btn" @click="$emit('forms')">查看或修改本案共用資料</button></div>
      <p v-if="locked" class="alert warn">{{ locked }}</p><fieldset :disabled="!!locked">
      <details data-testid="agency" class="online-panel"><summary>承辦與委任　{{a.mode === 'dual' ? '買賣雙方各自委任' : '單一地政士'}}　{{a.primary || '待指定'}}{{a.mode==='dual' && a.secondary ? '、'+a.secondary : ''}}</summary>
        <div class="grid"><label>委任方式<select aria-label="委任方式" :value="a.mode" @change="setMode($event.target.value)"><option value="single">單一地政士</option><option value="dual">雙地政士（買賣雙方各自委任）</option></select></label>
        <label v-if="a.mode==='dual'">登記送件分工<select aria-label="登記送件分工" v-model="a.registrationLead"><option value="">雙方分別辦理／尚未約定主辦</option><option value="primary">已約定買方地政士主辦</option><option value="secondary">已約定賣方地政士主辦</option></select></label></div>
        <div v-for="side in (a.mode==='dual'?['primary','secondary']:['primary'])" :key="side" class="party"><div class="grid">
        <label>{{a.mode==='single'?'本案地政士':side==='primary'?'買方地政士':'賣方地政士'}}<input :data-testid="'agent-'+side" :value="a[side]" @input="setName(side,$event.target.value)"></label>
        <label v-for="(name,k) in profileFields" :key="k">{{name}}<input :type="k==='birth' ? 'date' : k==='email' ? 'email' : 'text'" v-model="a.profiles[side][k]"></label></div></div>
        <p v-if="!validNames(a)" class="note">請填本案地政士；分別委任時，兩位地政士須能辨識。</p>
        <div v-for="(name,k) in tasks" :key="k" class="online-task"><label>{{name}}承辦<select :aria-label="name+'承辦'" v-model="a.roles[k]"><option value="">待分工</option><option value="primary">{{ a.primary || '第一位地政士' }}</option><option v-if="a.mode==='dual'" value="secondary">{{a.secondary || '第二位地政士'}}</option></select></label>
        <label v-if="k!=='alerts'" class="online-check"><input type="checkbox" :data-testid="'scope-'+k" :disabled="!validNames(a) || !a.roles[k]" :checked="confirmed(k)" @change="confirmScope(k,$event.target.checked)">已依本項委任文件核對申報人、範圍及代理人</label></div>
        <p class="note">雙地政士登記草稿會在申請人欄分列兩位代理人，簽章及主辦協議由當事人核對。各項線上申報另依該項委任辦理。 <a href="https://dsland.land.taichung.gov.tw/news/?id=4987&mode=data&parent_id=10024&type_id=10025" target="_blank" rel="noopener">地政機關雙地政士送件說明</a></p></details>
      <nav class="online-nav" aria-label="申報作業"><button v-for="(name,k) in trackNames" :key="k" class="btn" :class="{primary:step===k}" :aria-pressed="step===k" :data-testid="'work-'+k" @click="selectStep(k)">{{name}}</button></nav>
      <tax-online v-if="step==='tax'" :work="work" :agency="agency" :locked="!!locked" @prepared="prepared('tax',$event)"></tax-online>
      <price-online v-if="step==='price'" :work="work" :agency="agency" :locked="!!locked" @prepared="prepared('price',$event)"></price-online>
      <alerts-online v-if="step==='alerts'" :work="work" :agency="agency" :locked="!!locked" @prepared="prepared('alerts',$event)"></alerts-online>
      <p v-if="o.prepared[step]" class="note">最近準備檔案　{{o.prepared[step].file}}　{{time(o.prepared[step].at)}}。送件進度依下方機關憑據登記。</p>
      <section class="online-panel"><h3>機關回執與補正追蹤</h3><div class="grid">
      <label>作業項目<select v-model="track" data-testid="receipt-track"><option v-for="(name,k) in tracks" :key="k" :value="k">{{name}}</option></select></label>
      <label v-if="alertTrack">申請人<select v-model="subject" data-testid="receipt-subject"><option value="">請選擇</option><option v-for="p in subjects" :value="p.key">{{p.label}}</option></select></label>
      <label>機關進度<select v-model="event" data-testid="receipt-status"><option v-for="s in allowedStatuses">{{s}}</option></select></label>
      <label>機關案號／憑據識別<input v-model="reference" data-testid="receipt-ref" maxlength="160"><span v-if="noticeRefs.length">從本案稅務文件帶入　<button type="button" class="mini" v-for="n in noticeRefs" :key="n" @click="reference=n">{{n}}</button></span></label><label>補正事項或說明<input v-model="note" maxlength="500" data-testid="receipt-note"></label></div>
      <button type="button" class="btn" @click="record" data-testid="record-receipt">記錄進度</button><span role="status">{{msg}}</span>
      <p class="note">A2 的列印序號可記為待送件；D1 可依數位櫃臺進度記錄待簽章、已簽章及隨案送出。兩項異動服務可引用同一張收執聯，按各機關回覆分別記錄。選「機關確認服務已啟用」或「已終止」會同步更新該申請人的同項服務狀態。</p>
      <ol v-if="o.history.length" class="online-history"><li v-for="(e,i) in o.history" :key="i"><b>{{tracks[e.track]}} {{e.channel}} {{e.subject}} · {{e.status}}</b>　{{e.reference}}　{{e.note}}<br><small>{{e.by}}　{{time(e.at)}}</small></li></ol><p v-else>尚無機關回執。</p></section></fieldset></div>`
  };
  root.HGOnlineDesk = {init, scopeStamp, registration, validNames, component};
})(globalThis);

