/* 買賣實價登錄 A2。地政司 112/02/18 格式說明及縣市行政區對照，2026/11/20 核對。
 * https://www.land.moi.gov.tw/chhtml/content/10?mcid=4716
 * 範例 SHA-256 5ee6884844efcfb715685d925b36be753b38da365d9db7ae8e3fc8f8edce490c
 * 格式說明、代碼表 .7z SHA-256 ee97df9369c2cbf0987f18b120d752055559d49d5b0677926fcefbf43fefe394
 * 不帶入官方範例案件內容。買賣申報書的案號由政府端產生。 */
(function (root) {
  'use strict';
  // Exact office display names from MOI QueryUnit, 2026/11/20.
  const officeNames = { VA:'台東地政事務所', WA:'金門縣地政局', ZA:'連江縣地政局' };
  const regions = [
    'G 宜蘭縣 01/宜蘭市/GB/宜蘭 02/頭城鎮/GB/宜蘭 03/礁溪鄉/GB/宜蘭 04/壯圍鄉/GB/宜蘭 05/員山鄉/GB/宜蘭 06/羅東鎮/GA/羅東 07/五結鄉/GA/羅東 08/冬山鄉/GA/羅東 09/蘇澳鎮/GA/羅東 10/三星鄉/GA/羅東 11/大同鄉/GA/羅東 12/南澳鄉/GA/羅東',
    'U 花蓮縣 01/花蓮市/UA/花蓮 02/光復鄉/UB/鳳林 03/玉里鎮/UC/玉里 04/新城鄉/UA/花蓮 05/吉安鄉/UA/花蓮 06/壽豐鄉/UA/花蓮 07/鳳林鎮/UB/鳳林 08/豐濱鄉/UB/鳳林 09/瑞穗鄉/UC/玉里 10/富里鄉/UC/玉里 11/秀林鄉/UA/花蓮 12/萬榮鄉/UB/鳳林 13/卓溪鄉/UC/玉里',
    'W 金門縣 01/金湖鎮/WA/金門 02/金沙鎮/WA/金門 03/金城鎮/WA/金門 04/金寧鄉/WA/金門 05/烈嶼鄉/WA/金門 06/烏坵鄉/WA/金門',
    'M 南投縣 01/南投市/MA/南投 02/埔里鎮/MC/埔里 03/草屯鎮/MB/草屯 04/竹山鎮/MD/竹山 05/集集鎮/ME/水里 06/名間鄉/MA/南投 07/鹿谷鄉/MD/竹山 08/中寮鄉/MA/南投 09/魚池鄉/MC/埔里 10/國姓鄉/MC/埔里 11/水里鄉/ME/水里 12/信義鄉/ME/水里 13/仁愛鄉/MC/埔里',
    'T 屏東縣 01/屏東市/TA/屏東 02/潮州鎮/TC/潮州 03/東港鎮/TD/東港 04/恆春鎮/TE/恆春 05/萬丹鄉/TA/屏東 06/長治鄉/TA/屏東 07/麟洛鄉/TA/屏東 08/九如鄉/TA/屏東 09/里港鄉/TB/里港 10/鹽埔鄉/TB/里港 11/高樹鄉/TB/里港 12/萬巒鄉/TC/潮州 13/內埔鄉/TC/潮州 14/竹田鄉/TC/潮州 15/新埤鄉/TC/潮州 16/枋寮鄉/TF/枋寮 17/新園鄉/TD/東港 18/崁頂鄉/TD/東港 19/林邊鄉/TD/東港 20/南州鄉/TD/東港 21/佳冬鄉/TF/枋寮 22/琉球鄉/TD/東港 23/車城鄉/TE/恆春 24/滿州鄉/TE/恆春 25/枋山鄉/TF/枋寮 26/三地門鄉/TB/里港 27/霧臺鄉/TB/里港 28/瑪家鄉/TC/潮州 29/泰武鄉/TC/潮州 30/來義鄉/TC/潮州 31/春日鄉/TF/枋寮 32/獅子鄉/TF/枋寮 33/牡丹鄉/TE/恆春',
    'K 苗栗縣 01/苗栗市/KB/苗栗 02/苑裡鎮/KC/通霄 03/通霄鎮/KC/通霄 04/公館鄉/KB/苗栗 05/銅鑼鄉/KE/銅鑼 06/三義鄉/KE/銅鑼 07/西湖鄉/KE/銅鑼 08/頭屋鄉/KB/苗栗 09/竹南鎮/KD/竹南 10/頭份市/KF/頭份 11/造橋鄉/KD/竹南 12/後龍鎮/KD/竹南 13/三灣鄉/KF/頭份 14/南庄鄉/KF/頭份 15/大湖鄉/KA/大湖 16/卓蘭鎮/KA/大湖 17/獅潭鄉/KA/大湖 18/泰安鄉/KA/大湖',
    'H 桃園市 01/桃園區/HA/桃園 02/大溪區/HC/大溪 03/中壢區/HB/中壢 04/楊梅區/HD/楊梅 05/蘆竹區/HE/蘆竹 06/大園區/HE/蘆竹 07/龜山區/HH/龜山 08/八德區/HF/八德 09/龍潭區/HC/大溪 10/平鎮區/HG/平鎮 11/新屋區/HD/楊梅 12/觀音區/HB/中壢 13/復興區/HC/大溪',
    'E 高雄市 01/鹽埕區/EA/鹽埕 02/鼓山區/EA/鹽埕 03/左營區/EE/楠梓 04/楠梓區/EE/楠梓 05/三民區/ED/三民 06/新興區/EB/新興 07/前金區/EA/鹽埕 08/苓雅區/EB/新興 09/前鎮區/EC/前鎮 10/旗津區/EA/鹽埕 11/小港區/EC/前鎮 12/鳳山區/EG/鳳山 13/林園區/EL/大寮 14/大寮區/EL/大寮 15/大樹區/EG/鳳山 16/大社區/EI/仁武 17/仁武區/EI/仁武 18/鳥松區/EI/仁武 19/岡山區/EF/岡山 20/橋頭區/EF/岡山 21/燕巢區/EF/岡山 22/田寮區/EJ/路竹 23/阿蓮區/EJ/路竹 24/路竹區/EJ/路竹 25/湖內區/EJ/路竹 26/茄萣區/EJ/路竹 27/永安區/EF/岡山 28/彌陀區/EF/岡山 29/梓官區/EF/岡山 30/旗山區/EH/旗山 31/美濃區/EK/美濃 32/六龜區/EK/美濃 33/甲仙區/EH/旗山 34/杉林區/EH/旗山 35/內門區/EH/旗山 36/茂林區/EK/美濃 37/桃源區/EK/美濃 38/那瑪夏區/EH/旗山',
    'C 基隆市 01/中正區/CD/基隆市 02/七堵區/CD/基隆市 03/暖暖區/CD/基隆市 04/仁愛區/CD/基隆市 05/中山區/CD/基隆市 06/安樂區/CD/基隆市 07/信義區/CD/基隆市',
    'Z 連江縣 01/南竿鄉/ZA/連江 02/北竿鄉/ZA/連江 03/莒光鄉/ZA/連江 04/東引鄉/ZA/連江',
    'P 雲林縣 01/斗六市/PA/斗六 02/斗南鎮/PB/斗南 03/虎尾鎮/PD/虎尾 04/西螺鎮/PC/西螺 05/土庫鎮/PD/虎尾 06/北港鎮/PE/北港 07/古坑鄉/PA/斗六 08/大埤鄉/PB/斗南 09/莿桐鄉/PA/斗六 10/林內鄉/PA/斗六 11/二崙鄉/PC/西螺 12/崙背鄉/PC/西螺 13/麥寮鄉/PF/台西 14/東勢鄉/PF/台西 15/褒忠鄉/PD/虎尾 16/台西鄉/PF/台西 17/元長鄉/PE/北港 18/四湖鄉/PE/北港 19/口湖鄉/PE/北港 20/水林鄉/PE/北港',
    'F 新北市 01/新莊區/FB/新莊 02/林口區/FB/新莊 03/五股區/FB/新莊 04/蘆洲區/FG/三重 05/三重區/FG/三重 06/泰山區/FB/新莊 07/新店區/FC/新店 08/石碇區/FC/新店 09/深坑區/FC/新店 10/坪林區/FC/新店 11/烏來區/FC/新店 14/板橋區/FA/板橋 15/三峽區/FI/樹林 16/鶯歌區/FI/樹林 17/樹林區/FI/樹林 18/中和區/FH/中和 19/土城區/FA/板橋 21/瑞芳區/FF/瑞芳 22/平溪區/FF/瑞芳 23/雙溪區/FF/瑞芳 24/貢寮區/FF/瑞芳 25/金山區/FD/汐止 26/萬里區/FD/汐止 27/淡水區/FE/淡水 28/汐止區/FD/汐止 30/三芝區/FE/淡水 31/石門區/FE/淡水 32/八里區/FE/淡水 33/永和區/FH/中和',
    'O 新竹市 01/新竹市/OA/新竹市',
    'J 新竹縣 02/竹東鎮/JC/竹東 03/關西鎮/JB/竹北 04/新埔鎮/JB/竹北 05/竹北市/JB/竹北 06/湖口鄉/JD/新湖 08/橫山鄉/JC/竹東 09/新豐鄉/JD/新湖 10/芎林鄉/JC/竹東 11/寶山鄉/JC/竹東 12/北埔鄉/JC/竹東 13/峨眉鄉/JC/竹東 14/尖石鄉/JC/竹東 15/五峰鄉/JC/竹東',
    'I 嘉義市 01/嘉義市/IA/嘉義市',
    'Q 嘉義縣 02/朴子市/QB/朴子 03/布袋鎮/QB/朴子 04/大林鎮/QC/大林 05/民雄鄉/QC/大林 06/溪口鄉/QC/大林 07/新港鄉/QC/大林 08/六腳鄉/QB/朴子 09/東石鄉/QB/朴子 10/義竹鄉/QB/朴子 11/鹿草鄉/QD/水上 12/太保市/QD/水上 13/水上鄉/QD/水上 14/中埔鄉/QD/水上 15/竹崎鄉/QE/竹崎 16/梅山鄉/QE/竹崎 17/番路鄉/QE/竹崎 18/大埔鄉/QD/水上 20/阿里山鄉/QE/竹崎',
    'N 彰化縣 01/彰化市/NA/彰化 02/鹿港鎮/NC/鹿港 03/和美鎮/NB/和美 04/北斗鎮/NF/北斗 05/員林市/ND/員林 06/溪湖鎮/NH/溪湖 07/田中鎮/NE/田中 08/二林鎮/NG/二林 09/線西鄉/NB/和美 10/伸港鄉/NB/和美 11/福興鄉/NC/鹿港 12/秀水鄉/NA/彰化 13/花壇鄉/NA/彰化 14/芬園鄉/NA/彰化 15/大村鄉/ND/員林 16/埔鹽鄉/NH/溪湖 17/埔心鄉/NH/溪湖 18/永靖鄉/ND/員林 19/社頭鄉/NE/田中 20/二水鄉/NE/田中 21/田尾鄉/NF/北斗 22/埤頭鄉/NF/北斗 23/芳苑鄉/NG/二林 24/大城鄉/NG/二林 25/竹塘鄉/NG/二林 26/溪州鄉/NF/北斗',
    'B 臺中市 01/中區/BA/中山 02/東區/BA/中山 03/南區/BA/中山 04/西區/BA/中山 05/北區/BB/中正 06/西屯區/BC/中興 07/南屯區/BC/中興 08/北屯區/BB/中正 09/豐原區/BD/豐原 10/東勢區/BG/東勢 11/大甲區/BE/大甲 12/清水區/BF/清水 13/沙鹿區/BF/清水 14/梧棲區/BF/清水 15/后里區/BD/豐原 16/神岡區/BD/豐原 17/潭子區/BH/雅潭 18/大雅區/BH/雅潭 19/新社區/BG/東勢 20/石岡區/BG/東勢 21/外埔區/BE/大甲 22/大安區/BE/大甲 23/烏日區/BI/大里 24/大肚區/BK/龍井 25/龍井區/BK/龍井 26/霧峰區/BI/大里 27/太平區/BJ/太平 28/大里區/BI/大里 29/和平區/BG/東勢',
    'A 臺北市 01/松山區/AD/松山 02/大安區/AF/大安 03/中正區/AA/古亭 03/中正區/AB/建成 05/萬華區/AB/建成 09/大同區/AB/建成 10/中山區/AC/中山 11/文山區/AA/古亭 13/南港區/AD/松山 14/內湖區/AC/中山 15/士林區/AE/士林 16/北投區/AE/士林 17/信義區/AD/松山',
    'V 臺東縣 01/台東市/VA/臺東 02/成功鎮/VB/成功 03/關山鎮/VC/關山 04/卑南鄉/VA/臺東 05/大武鄉/VD/太麻里 06/太麻里鄉/VD/太麻里 07/東河鄉/VB/成功 08/長濱鄉/VB/成功 09/鹿野鄉/VC/關山 10/池上鄉/VC/關山 11/綠島鄉/VA/臺東 12/延平鄉/VC/關山 13/海端鄉/VC/關山 14/達仁鄉/VD/太麻里 15/金峰鄉/VD/太麻里 16/蘭嶼鄉/VA/臺東',
    'D 臺南市 01/東區/DC/東南 02/南區/DC/東南 04/北區/DA/臺南 06/安南區/DB/安南 07/安平區/DA/臺南 08/中西區/DA/臺南 09/新營區/DD/鹽水 10/鹽水區/DD/鹽水 11/柳營區/DD/鹽水 12/白河區/DE/白河 13/後壁區/DE/白河 14/東山區/DE/白河 15/麻豆區/DF/麻豆 16/下營區/DF/麻豆 17/六甲區/DF/麻豆 18/官田區/DF/麻豆 19/大內區/DF/麻豆 20/佳里區/DG/佳里 21/西港區/DG/佳里 22/七股區/DG/佳里 23/將軍區/DG/佳里 24/北門區/DG/佳里 25/學甲區/DG/佳里 26/新化區/DH/新化 27/善化區/DH/新化 28/新市區/DH/新化 29/安定區/DH/新化 30/山上區/DH/新化 31/左鎮區/DH/新化 32/仁德區/DI/歸仁 33/歸仁區/DI/歸仁 34/關廟區/DI/歸仁 35/龍崎區/DI/歸仁 36/玉井區/DJ/玉井 37/楠西區/DJ/玉井 38/南化區/DJ/玉井 39/永康區/DK/永康',
    'X 澎湖縣 01/馬公市/XA/澎湖 02/湖西鄉/XA/澎湖 03/白沙鄉/XA/澎湖 04/西嶼鄉/XA/澎湖 05/望安鄉/XA/澎湖 06/七美鄉/XA/澎湖',
  ].flatMap(line => {
    const [cityCode, city, ...entries] = line.split(' ');
    return entries.map(entry => {
      const [townCode, town, officeCode, shortOffice] = entry.split('/');
      return { city, cityCode, town, townCode, officeCode, office: officeNames[officeCode] || shortOffice + '地政事務所' };
    });
  });
  const clean = value => String(value ?? '').trim();
  const place = value => clean(value).replace(/^台/, '臺');
  const unique = values => [...new Set(values)];
  const choice = (label, value) => ({ label, value });
  const choices = (pairs) => pairs.map(([value, label]) => choice(label,value));
  const yesNo = choices([['1','有'], ['0','無']]);
  const parkingTypes = ['坡道平面','升降平面','坡道機械','升降機械','塔式車位','一樓平面','其他'];
  const floors = { '2':'二樓含以上','1':'一樓','B1':'地下一樓','B2':'地下二樓','B3':'地下三樓','B4':'地下四樓','B5':'地下五樓含以下','0':'無固定樓層' };
  const specialGroups = [
    ['交易總價包含非屬不動產之費用', ['裝潢費','傢俱設備費','土地增值稅或其他稅費','仲介費','地政士服務費','其他種類費用']],
    ['關係人間交易',['親友、員工、共有人或其他特殊關係','建商與地主間交易']],
    ['建築物現況',['陽台外推','頂樓加蓋','夾層','其他增建','未登記建物']],
    ['土地上有',['未登記建物','農作物','機電設備','農業設施']],
    ['特殊交易情況、條件',['急買急賣','民情風俗因素','瑕疵物件','含租約','毛胚屋','具重建或重劃都更等效益','畸零地或有合併使用效益','借名登記返還','受債權債務關係影響或債務抵償','雙方合意（法院判決）解除契約','土地價格含未來興建房屋成本']],
    ['特殊標的',['塔位／墓園','地上權房屋','市場攤位','含公共設施保留地']],
    ['與政府有關',['政府機關標讓售','地清或未辦繼承標售','水利地承銷','協議價購']]
  ].map(([title, names], group) => ({ title, items: names.map((label,i) => ({ label, code: String(group+1).padStart(2,'0') + String(i+1).padStart(2,'0') })) }));
  const keys = s => Object.fromEntries(s.split(' ').map(k => [k, '']));
  const baseContent = () => {
    const c = keys('case_type case_no p1ma_caseSeq case_x45 case_x45c case_x46 case_x46c case_unit case_unitc p1ma_date caseflag3 caseflag5 notify_type0 notify_type1 agents_name agents_sign agents_idNo agents_tel agents_mail agents_x45 agents_x45c agents_x46 agents_x46c agents_addr agent_entrust1 agent_month agent_entrust2 p1ma_build1 p1ma_build2 p1ma_build3 p1ma_build4 p1ma_manage p1ma_build11 p1ma_totprice p1ma_parkflag p1ma_cntpark p1ma_parkflag2 p1ma_parkprice');
    for (const {items} of specialGroups) for (const {code} of items) {
      c['p1sp_code'+code] = '';
      if (code.startsWith('01')) c['p1sp_price'+code] = '';
    }
    return Object.assign(c, keys('p1sp_desc0106 p1sp_code0801 p1sp_code0901 p1sp_code0901no p1ma_note'));
  };
  function yuan(value) {
    const s = clean(value);
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/.test(s)) return '';
    const [whole, frac=''] = s.replace(/,/g,'').split('.');
    return (whole + frac.padEnd(4,'0')).replace(/^0+(?=\d)/,'');
  }
  function rocDate(value) {
    if (!/^\d{4}-\d\d-\d\d$/.test(value)) return '';
    const date = new Date(value + 'T00:00:00Z'), year = Number(value.slice(0,4)) - 1911;
    return year > 0 && year <= 999 && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value
      ? String(year).padStart(3,'0')+value.slice(5,7)+value.slice(8) : '';
  }
  function splitAddress(value) {
    const raw = place(value);
    const match = regions.find(r => raw.startsWith(r.city+r.town));
    if (match) return { x45:match.cityCode,x45c:match.city,x46:match.townCode,x46c:match.town,addr:raw.slice(match.city.length+match.town.length).trim() };
    const cityOnly = regions.find(r => r.town === r.city && raw.startsWith(r.city));
    if (cityOnly) return { x45:cityOnly.cityCode,x45c:cityOnly.city,x46:cityOnly.townCode,x46c:cityOnly.town,addr:raw.slice(cityOnly.city.length).trim() };
    return { x45:'',x45c:'',x46:'',x46c:'',addr:'' };
  }
  const integer = s => /^\d+$/.test(s);
  const positive = s => integer(s) && /[1-9]/.test(s);
  const sourceDraft = work => work?.v50Reg?.online?.price || {};
  function projection(work, agency) {
    const d = sourceDraft(work), src = d.values || {}, groups=[], issues=[], c=baseContent();
    const get = (key, fallback='') => src[key] === undefined ? clean(fallback) : clean(src[key]);
    const addGroup = title => { const group={title,fields:[]}; groups.push(group); return group; };
    const field = (group, key, label, opts={}) => {
      const value = get(key, opts.fallback);
      group.fields.push({key,label,value,...opts});
      return value;
    };
    const check = (valid, message) => { if (!valid) issues.push(message); };
    const a = addGroup('交易與受理機關');
    const isSale = work?.v50Reg?.type ? work.v50Reg.type === '買賣' : /買賣/.test(clean(work?.ledgerService));
    check(isSale,'請先在登記表單確認案件類別為買賣。');
    const props = (work.v50Props || []).filter(p => p && (p.city || p.district || p.number));
    const locales = unique(props.filter(p=>p.city&&p.district).map(p=>place(p.city)+'|'+clean(p.district)));
    const [fromCity,fromTown] = locales.length === 1 ? locales[0].split('|') : ['',''];
    const scope = field(a,'scope','申報範圍',{options:choices([['one','一張申報書，交易總價合併申報'],['split','有個別價格、分件或須填基地持分對照']])});
    check(scope==='one',scope==='split'?'涉及分張申報或個別地建號、基地持分，請下載核對清單，在官網依契約分張填寫。':'請核對本案申報範圍。');
    check(locales.length<=1,'標的跨行政區。請下載核對清單，在官網確認分件及併案價款。');
    const city=field(a,'city','標的縣市',{fallback:fromCity,options:unique(regions.map(r=>r.city)).map(n=>choice(n,n))});
    const towns=regions.filter(r=>r.city===city);
    const townDefault=towns.length===1 && towns[0].town===city ? city : fromCity===city ? fromTown : '';
    const town=field(a,'town','標的行政區',{fallback:townDefault,options:unique(towns.map(r=>r.town)).map(n=>choice(n,n))});
    const area=towns.find(r=>r.town===town);
    check(area,'請選擇標的坐落縣市與行政區。');
    const offices=towns.filter(r=>r.town===town);
    const full=place(work.ledgerAuthority);
    const matched=offices.find(r=>full === r.city+place(r.office) || full === place(r.office));
    const officeCode=field(a,'office','受理地所',{fallback:matched?.officeCode || (!full && unique(offices.map(r=>r.officeCode)).length===1?offices[0].officeCode:''),options:offices.map(r=>choice(r.office,r.officeCode))});
    const office=offices.find(r=>r.officeCode===officeCode);
    check(office, '請核對標的轄區並選擇受理地所。');
    c.case_type='A'; c.p1ma_caseSeq='01';
    c.case_x45=area?.cityCode||''; c.case_x45c=area?.city||''; c.case_x46=area?.townCode||''; c.case_x46c=area?.town||'';
    c.case_unit=office?.officeCode||''; c.case_unitc=office?.office||'';
    c.p1ma_date=rocDate(field(a,'date','實際買賣契約簽訂日',{type:'date',fallback:work.contractDate}));
    check(c.p1ma_date,'請填有效的實際買賣契約簽訂日。');
    const rawTotal=field(a,'total','實際成交總價（含車位，元）',{fallback:yuan(work.totalPrice),inputmode:'numeric'});
    c.p1ma_totprice=/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(rawTotal)?rawTotal.replace(/,/g,''):'';
    check(positive(c.p1ma_totprice),'請核對私契成交總價，填入大於零的整數元。');
    const kind=field(a,'kind','交易標的類型',{options:choices([['building','含建物'],['land','僅有土地'],['parking','僅有車位']]),fallback:props.some(p=>p.kind==='建物'&&!p.common)?'building':''});
    check(['building','land','parking'].includes(kind),'請核對交易標的類型。');
    c.caseflag3=kind==='land'?'3':''; c.caseflag5=kind==='parking'?'5':''; c.p1sp_code0801=kind==='parking'?'Y':'';
    function addressFields(row, prefix, value) {
      const split=splitAddress(value);
      for(const [key,val] of Object.entries(split)) row[prefix+'_'+key]=val;
      return Boolean(split.x45 && split.addr);
    }
    const buildPeople = (collection,prefix,title) => {
      const parties=(work[collection]||[]).filter(p=>p && p.role!=='代理人' && [p.name,p.ledgerId,p.phone,p.taxMailAddress,p.email].some(x=>clean(x)));
      const group=addGroup(title+'資料');
      check(parties.length,title+'資料缺少當事人，請在本案當事人區新增。');
      let contact=false; const hits=new Map();
      const rows=parties.map((p,i)=>{
        // Link supplements to identity, including duplicate occurrences, never to a row index alone.
        const identity=JSON.stringify([clean(p.name),clean(p.ledgerId)]);
        const occurrence=(hits.get(identity)||0)+1; hits.set(identity,occurrence);
        const id=prefix+'|'+identity+'|'+occurrence+'|', label=title+(i+1)+' ';
        const row={}, set=(k,v)=>row[prefix+'_'+k]=v;
        set('seq',String(i+1));set('sign','');
        const name=field(group,id+'name',label+'姓名／名稱',{fallback:p.name});
        const ident=field(group,id+'id',label+'統一編號',{fallback:p.ledgerId});
        const phone=field(group,id+'tel',label+'聯絡電話',{fallback:p.phone});
        const mail=field(group,id+'mail',label+'電子信箱',{fallback:p.email});
        const addr=field(group,id+'addr',label+'通訊地址（含縣市、行政區）',{fallback:p.taxMailAddress});
        set('name',name);set('id',ident);set('tel',phone);set('mail',mail);
        check(name && ident && !/[*＊●○□?？]/.test(ident),label+'請核對姓名／名稱及完整統一編號。');
        const validAddr=addressFields(row,prefix,addr);
        if(addr)check(validAddr,label+'通訊地址請含可辨識的縣市、行政區及街路門牌。');
        if(mail)check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail),label+'請檢查電子信箱。');
        if(validAddr && phone)contact=true;
        return row;
      });
      if(rows.length)check(contact,title+'請至少填妥一位當事人的聯絡電話與通訊地址。');
      return rows;
    };
    const buyer=buildPeople('buyers','buy','買方'),seller=buildPeople('sellers','sell','賣方');
    const ag=addGroup('申報人與委任');
    const slot=agency?.roles?.price;
    const verified=['primary','secondary'].includes(slot) && agency?.verified?.price === true && clean(agency?.[slot]);
    const who=field(ag,'who','此次申報身分',{fallback:verified?'20':'',options:choices([['13','買賣雙方自行共同申報'],['20','委任一位代理人共同申報']])});
    check(['13','20'].includes(who),'請核對由當事人自行申報或委任代理人。');
    if (who==='20') {
      check(verified,'申報代理人須先於分工區指定實價承辦人，並核對雙方實際委任範圍。');
      const profile=verified ? agency.profiles?.[slot]||{} : {};
      const key='agent|'+JSON.stringify([slot,clean(agency?.[slot])])+'|';
      c.agents_name=verified?clean(agency[slot]):'';
      c.agents_idNo=field(ag,key+'id','受任人統一編號',{fallback:profile.id});
      c.agents_tel=field(ag,key+'tel','受任人聯絡電話',{fallback:profile.phone});
      c.agents_mail=field(ag,key+'mail','受任人電子信箱',{fallback:profile.email});
      if(c.agents_mail)check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.agents_mail),'請檢查受任人電子信箱。');
      const ad=field(ag,key+'addr','受任人通訊地址（含縣市、行政區）',{fallback:profile.address});
      const okAddr=addressFields(c,'agents',ad);
      check(c.agents_idNo && !/[*＊●○□?？]/.test(c.agents_idNo) && c.agents_tel && okAddr,'請核對受任人完整統一編號、電話及通訊地址。');
      const doc=field(ag,key+'entrust','委任方式',{options:choices([['1','以申報書委任'],['2','另附委託書']])});
      check(['1','2'].includes(doc),'請依實際委任文件選擇委任方式。');
      if(doc==='1'){ c.agent_entrust1='1';c.agent_month=field(ag,key+'months','委任更正申報期間（月）',{inputmode:'numeric'});check(integer(c.agent_month),'請依委任內容填寫更正申報月數。'); }
      if(doc==='2') c.agent_entrust2='1';
    }
    const b=addGroup('建物與車位');
    if(kind==='building'){
      const layout=field(b,'layout','現況格局',{options:choices([['rooms','有隔間'],['open','無隔間']])});
      check(['rooms','open'].includes(layout),'請確認現況有無隔間。');
      if(layout==='open') c.p1ma_build4='Y';
      if(layout==='rooms') for(const [i,label] of ['房','廳','衛'].entries()){
        const value=field(b,'room'+i,label+'數',{inputmode:'numeric'});
        check(integer(value),'請核對'+label+'數，無時填 0。');c['p1ma_build'+(i+1)]=value;
      }
      for(const [name,label] of [['p1ma_manage','管理組織'],['p1ma_build11','電梯']]){
        c[name]=field(b,name,label,{options:yesNo});check(['1','0'].includes(c[name]),'請核對有無'+label+'。');
      }
    }
    c.p1ma_parkflag=kind==='parking'?'01':field(b,'park','有無車位交易',{options:choices([['01','有車位'],['2','無車位']])});
    check(['01','2'].includes(c.p1ma_parkflag),'請依契約核對有無車位交易。');
    const case_park=[];
    if(c.p1ma_parkflag==='01'){
      c.p1ma_parkflag2=field(b,'parkPricing','車位價款是否單獨計價',{options:choices([['0','單獨計價'],['1','已包含於成交總價，未單獨計價']])});
      check(['0','1'].includes(c.p1ma_parkflag2),'請核對車位計價方式。');
      if(c.p1ma_parkflag2==='0'){
        c.p1ma_parkprice=field(b,'parkTotal','車位交易總價（元）',{inputmode:'numeric'});
        check(positive(c.p1ma_parkprice),'請填單獨計價的車位交易總價。');
        if(positive(c.p1ma_parkprice)&&positive(c.p1ma_totprice))check(BigInt(c.p1ma_parkprice)<=BigInt(c.p1ma_totprice),'車位交易總價超過成交總價。');
      }
      const count=field(b,'parkCount','車位個數',{inputmode:'numeric'});
      const n=Number(count);check(positive(count)&&n<=100,'請填車位個數（本機一次支援 1 至 100 個）。');
      if(positive(count)&&n<=100){
        c.p1ma_cntpark=String(n);
        for(let i=1;i<=n;i++){
          const k='park'+i+'-',label='車位 '+i+' ';
          const type=field(b,k+'type',label+'類別',{options:parkingTypes.map((s,i)=>choice(s,String(i+1)))});
          const floor=field(b,k+'floor',label+'樓層',{options:Object.entries(floors).map(([v,t])=>choice(t,v))});
          check(parkingTypes[Number(type)-1]&&floors[floor],label+'請選擇類別、樓層。');
          const other=type==='7'?field(b,k+'other',label+'其他類別說明'):'';
          if(type==='7')check(other,label+'請補其他類別說明。');
          const price=c.p1ma_parkflag2==='0'?field(b,k+'price',label+'價格（無法拆算可留白）',{inputmode:'numeric'}):'';
          const area=field(b,k+'area',label+'面積（㎡，無法拆算可留白）',{inputmode:'decimal'});
          if(price)check(integer(price),label+'價格須為整數元。');
          if(area)check(/^\d+(?:\.\d+)?$/.test(area),label+'面積請填平方公尺。');
          case_park.push({car_seq:String(i),car_type:type,car_typec:parkingTypes[Number(type)-1]||'',car_typeText:other,car_price:price,car_area:area,car_floor:floor,car_floorc:floors[floor]||''});
        }
        if(c.p1ma_parkflag2==='0' && integer(c.p1ma_parkprice) && case_park.every(p=>!p.car_price||integer(p.car_price))){
          const sum=case_park.reduce((sum,p)=>sum+BigInt(p.car_price||'0'),0n);
          check(case_park.every(p=>p.car_price)?sum===BigInt(c.p1ma_parkprice):sum<=BigInt(c.p1ma_parkprice),'車位個別價款加總與車位總價不符。');
        }
      }
    }
    const sp=addGroup('特殊交易與備註'), codes=d.special||{};
    for(const {items} of specialGroups)for(const {code,label} of items)if(codes[code]===true){
      c['p1sp_code'+code]='Y';
      if(code.startsWith('01')){
        const v=field(sp,'fee'+code,label+'金額（含於總價且無法拆算可留白）',{inputmode:'numeric'});
        if(v)check(integer(v),label+'金額請填整數元。');c['p1sp_price'+code]=v;
      }
      if(code==='0106'){c.p1sp_desc0106=field(sp,'feeOther','其他費用種類');check(c.p1sp_desc0106,'請填其他費用種類。');}
    }
    const presale=field(sp,'presale','原預售屋申報書序號（適用才填）');
    if(presale){c.p1sp_code0901='Y';c.p1sp_code0901no=presale;}
    c.p1ma_note=field(sp,'note','其他實際交易情形（最多 200 字）');
    check(Array.from(c.p1ma_note).length<=200,'其他實際交易說明超過 200 字。');
    const master={case_type:'A',case_no:'',case_kind:who,case_x45:c.case_x45,case_unit:c.case_unit,caseflag:'',apply_caid:'',notify_type:'',tab_cnt:1};
    return {document:{case_master:master,case_detail:{tab1:{case_content:c,buyer,seller,case_park}}},groups,issues,scope,props,agentName:c.agents_name,specialGroups};
  }

  // Existing HomeGo filing-archive ZIP32 writer, bundled for a single offline HTML.
  // ZIP32 containers for government filing drafts. Nothing is extracted to disk.
  const LIMITS = Object.freeze({ archiveBytes: 10 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, entries: 32 });
  const encoder = new TextEncoder();
  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    let c = value; for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  function filingCrc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function asBytes(value) { if (value instanceof Uint8Array) return value; if (value instanceof ArrayBuffer) return new Uint8Array(value); throw Error('檔案內容必須是二進位資料。'); }
  function validName(name) {
    if (typeof name!=='string' || !name || name.length > 240 || /[\\:<>"|?*\u0000-\u001f\u007f]/.test(name) || name.startsWith('/') || name.split('/').some((p,i,a) => p === '.' || p === '..' || (!p && i !== a.length - 1) || /[. ]$/.test(p) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))) throw Error('ZIP 含不安全或不支援的檔名。');
    return name;
  }
  function pathKey(name) { return name.normalize('NFC').toLowerCase(); }
  function checkPathCollisions(names) {
    const files=new Set([...names].filter(name=>!name.endsWith('/')));
    for(const name of names) {
      if(name.endsWith('/')&&files.has(name.slice(0,-1)))throw Error('ZIP 的檔案與資料夾路徑衝突。');
      const parts=name.split('/');
      for(let i=1;i<parts.length;i++)if(files.has(parts.slice(0,i).join('/')))throw Error('ZIP 的檔案與資料夾路徑衝突。');
    }
  }
  function writeFilingArchive(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length>LIMITS.entries) throw Error('ZIP 檔案數量不正確。');
    const names=new Set(); let total=0, localSize=0, centralSize=0;
    const rows=entries.map(entry=>{
      if(!entry||typeof entry!=='object')throw Error('ZIP 檔案項目格式不正確。');
      const name=validName(entry.name), data=asBytes(entry.bytes ?? entry.data), nameBytes=encoder.encode(name);
      if (name.endsWith('/') || names.has(pathKey(name))) throw Error('ZIP 不能輸出目錄或重複檔名。'); names.add(pathKey(name));
      total+=data.length; localSize+=30+nameBytes.length+data.length; centralSize+=46+nameBytes.length;
      if (total>LIMITS.totalBytes || localSize+centralSize+22>LIMITS.archiveBytes) throw Error('輸出 ZIP 超過 10 MiB 限制。');
      return {nameBytes,data,crc:filingCrc32(data)};
    });
    checkPathCollisions(names);
    if (total>LIMITS.totalBytes || localSize+centralSize+22>LIMITS.archiveBytes) throw Error('輸出 ZIP 超過 10 MiB 限制。');
    const out=new Uint8Array(localSize+centralSize+22), v=new DataView(out.buffer); let p=0, c=localSize;
    for (const r of rows) {
      v.setUint32(p,0x04034b50,true); v.setUint16(p+4,20,true); v.setUint16(p+6,0x800,true); v.setUint16(p+12,33,true); v.setUint32(p+14,r.crc,true); v.setUint32(p+18,r.data.length,true); v.setUint32(p+22,r.data.length,true); v.setUint16(p+26,r.nameBytes.length,true); out.set(r.nameBytes,p+30); out.set(r.data,p+30+r.nameBytes.length);
      v.setUint32(c,0x02014b50,true); v.setUint16(c+4,20,true); v.setUint16(c+6,20,true); v.setUint16(c+8,0x800,true); v.setUint16(c+14,33,true); v.setUint32(c+16,r.crc,true); v.setUint32(c+20,r.data.length,true); v.setUint32(c+24,r.data.length,true); v.setUint16(c+28,r.nameBytes.length,true); v.setUint32(c+42,p,true); out.set(r.nameBytes,c+46);
      p+=30+r.nameBytes.length+r.data.length; c+=46+r.nameBytes.length;
    }
    v.setUint32(c,0x06054b50,true); v.setUint16(c+8,rows.length,true); v.setUint16(c+10,rows.length,true); v.setUint32(c+12,centralSize,true); v.setUint32(c+16,localSize,true); return out;
  }
  const d1Manual='https://landoffice.chcg.gov.tw/files/'+encodeURIComponent('數位櫃臺-網路申辦案件操作手冊_127_1141002.pdf');
  const fieldText=f=>f.options ? (f.options.find(o=>o.value===f.value)?.label || '')
    : f.key==='total' && /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(f.value) ? f.value.replace(/,/g,'') : f.value;
  function digitalHandoff(work,agency,result=projection(work,agency)) {
    const [basics,buyers,sellers,,building,special]=result.groups;
    const readonly=(key,label,value)=>({key,label,value:clean(value),readOnly:true});
    const values=sourceDraft(work);
    const sale=work.v50Reg?.type ? work.v50Reg.type==='買賣' : /買賣/.test(clean(work.ledgerService));
    const b=basics.fields, byKeys=(fields,list)=>list.map(key=>fields.find(f=>f.key===key)).filter(Boolean);
    const group=(title,fields)=>({title,fields});
    const selectedAgent=['primary','secondary'].includes(agency?.roles?.price)?clean(agency[agency.roles.price]):'';
    const who=agency?.verified?.price && selectedAgent ? selectedAgent : '';
    const mandateKey=who && agency?.confirmations?.price?.stamp
      ? JSON.stringify([agency.confirmations.price.stamp,agency.confirmations.price.at || '',agency.registrationLead||'',who]) : '';
    const mandate=!!mandateKey && values.d1Mandate===mandateKey;
    const warn=[];
    if(!sale)warn.push('登記原因尚未確認為買賣。');
    if(!who)warn.push('請在分工區指定實價承辦人，核對買賣雙方的實價委任。');
    if(!mandate)warn.push('請核對同一地政士受買賣雙方委任辦理買賣移轉登記及實價申報。');
    const type=b.find(f=>f.key==='kind')?.value;
    const basicFields=byKeys(b,['city','town','date','kind','scope']);
    basicFields.push(readonly('rocDate','民國交易日期（供核對）',result.document.case_detail.tab1.case_content.p1ma_date));
    const displayed=(parties,label)=>parties.fields.filter(f=>f.key.endsWith('|name')).map((f,i)=>readonly(f.key,label+(i+1)+'（官網名單中選取並新增）',f.value));
    const buyerFields=displayed(buyers,'權利人'),sellerFields=displayed(sellers,'義務人');
    if(!buyerFields.length||!sellerFields.length)warn.push('請先在登記申請填妥全體權利人與義務人。');
    const buildingFields=building.fields.filter(f=>f.key.startsWith('room')||['layout','p1ma_manage','p1ma_build11'].includes(f.key));
    if(!buildingFields.length)buildingFields.push(readonly('buildingSummary','建物現況',type==='land'?'僅有土地交易':type==='parking'?'僅有車位交易':'請先核對交易標的類型'));
    const park=building.fields.filter(f=>f.key.startsWith('park'));
    if(type==='parking')park.unshift(readonly('onlyPark','車位交易','僅有車位交易'));
    const c=result.document.case_detail.tab1.case_content;
    const specialItems=[];
    for(const g of specialGroups)for(const item of g.items)if(values.special?.[item.code]===true)specialItems.push(g.title+'／'+item.label);
    const remarks=[readonly('specialChosen','已勾選的特殊交易',specialItems.join('、')),...special.fields];
    if(type==='parking')remarks.unshift(readonly('onlyParkingNote','備註⑧','僅車位交易'));
    if(result.scope==='split' || unique(result.props.filter(p=>p.city&&p.district).map(p=>place(p.city)+'|'+clean(p.district))).length>1){
      warn.push('本案涉及分張或跨區。逐張核對標的、價款、地建號、基地及持分後，再在官網新增。');
      remarks.push(readonly('splitNote','個別價款、地建號及基地持分',values.splitNote));
      result.props.forEach((p,i)=>remarks.push(readonly('property'+i,'本案標的 '+(i+1),[p.kind,p.city,p.district,p.section,p.subSection,p.number,p.transferShare,p.address].filter(Boolean).join(' '))));
    }
    const editTotal=byKeys(b,['total']);
    const groups=[
      group('申報案件基本資訊',[...basicFields,...buyerFields,...sellerFields]),
      group('建物資訊',buildingFields),
      group('交易總價',editTotal),
      group('車位資訊',park),
      group('備註欄',remarks)
    ];
    if(!c.case_x45||!c.case_x46||!c.p1ma_date)warn.push('標的行政區或實際契約日期尚待補齊。');
    if(!positive(c.p1ma_totprice))warn.push('實際成交總價尚待核對。');
    return {groups,mandate,mandateKey,who,warn};
  }
  function digitalFile(work,agency) {
    if(sourceDraft(work).channel!=='D1')throw Error('請先選擇 D1 數位櫃臺。');
    const d=digitalHandoff(work,agency);
    const lines=['D1 數位櫃臺｜五區逐欄交接清單','供承辦逐欄輸入與核對。','案件　'+clean(work.propertyName),
      '實價承辦　'+(d.who||'待核對'),'買賣移轉及實價委任　'+(d.mandate?'承辦已核對':'待核對')];
    for(const g of d.groups){lines.push('',g.title);for(const f of g.fields)lines.push(f.label+'　'+(fieldText(f)||'（空白／請核對適用性）'));}
    if(d.warn.length)lines.push('','待確認',...d.warn);
    lines.push('','數位櫃臺作業','（1）登記案件選所有權移轉－買賣，再於其他申請資訊選憑證申報 D1。',
      '（2）可匯入地政線上申辦系統所產製的買賣申報 ZIP，或逐欄填妥後新增標的。',
      '（3）預覽全體權利人、義務人與申報書，依官網通知完成電子簽章。',
      '（4）起案人於官網查詢簽章及送件進度，送件後將收件資訊記回本案。','https://dcland.moi.gov.tw/');
    return {name:'D1-數位櫃臺五區逐欄交接.txt',bytes:new TextEncoder().encode('\uFEFF'+lines.join('\r\n')),mime:'text/plain;charset=utf-8'};
  }

  function artifact(work,agency,format) {
    if(sourceDraft(work).channel!=='A2')throw Error('請先選擇 A2 線上登錄、紙本送件。');
    const result=projection(work,agency);
    if(result.issues.length) throw new Error(result.issues.join('\n'));
    if(!['json','zip'].includes(format)) throw new Error('請選擇 JSON 或 ZIP。');
    const bytes=new TextEncoder().encode(JSON.stringify(result.document,null,2));
    const base='RPS0401_'+result.document.case_detail.tab1.case_content.p1ma_date;
    return format==='zip' ? { name:base+'.zip', bytes:writeFilingArchive([{name:base+'.json',bytes}]), mime:'application/zip' }
      : { name:base+'.json', bytes,mime:'application/json;charset=utf-8' };
  }
  function handoff(work,agency) {
    if(sourceDraft(work).channel!=='A2')throw Error('請先選擇 A2 線上登錄、紙本送件。');
    const r=projection(work,agency),d=sourceDraft(work), lines=[
      '買賣實價登錄｜逐欄核對清單','人工登打及分張核對用','',
      '案件名稱　'+clean(work.propertyName), '標的明細'
    ];
    for(const p of r.props) lines.push([p.kind,p.city,p.district,p.section,p.subSection,p.number,p.transferShare&&'移轉持分 '+p.transferShare,p.address].filter(Boolean).join(' '));
    for(const group of r.groups){
      lines.push('',group.title);
      for(const f of group.fields){
        const shown=f.options?.find(o=>o.value===f.value)?.label || f.value;
        lines.push(f.label+'　'+(shown||'（空白）'));
      }
    }
    if(r.agentName)lines.push('受任人姓名　'+r.agentName);
    for(const group of specialGroups)for(const item of group.items)if(d.special?.[item.code]===true)lines.push(group.title+'　'+item.label);
    lines.push('','分張與基地持分說明',clean(d.splitNote)||'（空白）','', '待處理',...r.issues,'','請在官方畫面核對，按適用方式取得申報書序號、列印簽章並送件。');
    return {name:'實價登錄逐欄核對清單.txt',bytes:new TextEncoder().encode('\uFEFF'+lines.join('\r\n')),mime:'text/plain;charset=utf-8'};
  }
  function download(file) {
    const url=URL.createObjectURL(new Blob([file.bytes],{type:file.mime}));
    const link=document.createElement('a');link.href=url;link.download=file.name;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  const component={
    props:{work:{type:Object,required:true},agency:Object,locked:Boolean},emits:['prepared'],
    data(){return {approved:'',message:'',showMissing:false,group:'交易與受理機關',d1Group:'申報案件基本資訊',d1Manual,copyFallback:''};},
    computed:{
      result(){return projection(this.work,this.agency);},
      draft(){return sourceDraft(this.work);},
      channel(){return ['D1','A2'].includes(this.draft.channel)?this.draft.channel:'';},
      digital(){return digitalHandoff(this.work,this.agency,this.result);},
      d1Current(){return this.digital.groups.find(g=>g.title===this.d1Group)||this.digital.groups[0];},
      current(){return this.result.groups.find(g=>g.title===this.group)||this.result.groups[0];},
      fingerprint(){return JSON.stringify([this.result.document,this.result.groups.map(g=>g.fields.map(f=>f.value)),this.result.props,this.result.issues,this.agency?.verified?.price,this.draft.splitNote]);},
      ready(){return this.channel==='A2' && !this.locked && !this.result.issues.length && this.approved===this.fingerprint;}
    },
    watch:{
      work(){this.resetReview();this.group='交易與受理機關';this.d1Group='申報案件基本資訊';this.copyFallback='';this.showMissing=false;},
      fingerprint(){this.resetReview();}
    },
    methods:{
      resetReview(){this.approved='';this.message='';},
      selectChannel(channel){this.write(null,'channel',channel);this.copyFallback='';this.showMissing=false;},
      showField:fieldText,
      async copyField(f){
        if(this.locked||this.channel!=='D1')return;
        const value=fieldText(f);
        if(!value)return;
        this.copyFallback='';
        try{
          if(!navigator.clipboard?.writeText)throw Error();
          await navigator.clipboard.writeText(value);
          this.message='已複製'+f.label+'。';
        }catch{
          this.copyFallback=value;
          await this.$nextTick();
          const node=this.$refs.clipboardFallback;
          if(node){node.focus();node.select();}
          this.message='請用 Ctrl+C 或裝置的複製功能取得已選取的文字。';
        }
      },
      digitalDownload(){
        if(this.locked||this.channel!=='D1')return;
        download(digitalFile(this.work,this.agency));this.$emit('prepared','D1 數位櫃臺五區逐欄清單（TXT）');
        this.message='已下載五區文字清單，可對照數位櫃臺輸入。';
      },
      write(part,key,value){
        if(this.locked)return;
        this.work.v50Reg??={};
        const online=this.work.v50Reg.online??={};
        const d=online.price||(online.price={});
        if(part){d[part]??={};d[part][key]=value;}else d[key]=value;
        this.resetReview();
      },
      restore(key){if(!this.locked && this.draft.values){delete this.draft.values[key];this.resetReview();}},
      check(){this.showMissing=true;this.message=this.result.issues.length?'請處理下列項目。':'欄位檢查完成，請核對後勾選下載。';},
      prepare(format){
        if(!this.ready)return;
        try{
          download(artifact(this.work,this.agency,format));
          this.$emit('prepared',format==='zip'?'買賣實價登錄備存 ZIP':'買賣實價登錄 JSON');
          this.message=format==='zip'?'已下載備存 ZIP，解壓後可取得同一份申報 JSON。':'已準備 JSON。請至申報網選「買賣成交資訊申報」→「線上登錄，紙本送件」→「成交申報」，匯入後核對各頁。';
        }catch(error){this.message=error.message;}
      },
      manual(){if(!this.locked){download(handoff(this.work,this.agency));this.message='已下載逐欄核對清單，請依各張申報書內容至官網填寫。';}}
    },
    template:`<section class="online-price" data-testid="online-price">
      <label>實價申報管道 <select data-testid="price-channel" :value="channel" :disabled="locked" @change="selectChannel($event.target.value)">
        <option value="">請選擇管道</option><option value="D1">D1 數位櫃臺，電子簽章隨案送出</option><option value="A2">A2 申報網登錄，列印簽章後送件</option>
      </select></label>
      <p v-if="!channel" class="note">全線上買賣移轉選 D1，需受買賣雙方委託辦理移轉及實價申報。A2 可線上登錄後列印送件。A1 另依機關開放情形及全體當事人身分驗證辦理。</p>
      <template v-if="channel==='D1'">
        <fieldset :disabled="locked" data-testid="price-d1">
          <p><b>1. 核對雙方委任</b>　{{ digital.who ? '實價承辦　'+digital.who : '請先在地政士分工區確認實價承辦及申報委任。' }}</p>
          <label><input type="checkbox" data-testid="price-d1-mandate" :disabled="!digital.mandateKey" :checked="digital.mandate" @change="write(null,'d1Mandate',$event.target.checked?digital.mandateKey:'')"> 已核對同一地政士受買賣雙方委任，同時辦理買賣移轉登記及實價申報</label>
          <p><b>2. 開啟買賣登記案件</b>　在數位櫃臺選「登記案件 → 所有權移轉－買賣」，於「其他申請資訊」選「憑證申報（D1）」。</p>
          <p><a href="https://dcland.moi.gov.tw/" target="_blank" rel="noopener noreferrer">進入地政數位櫃臺</a> · <a :href="d1Manual" target="_blank" rel="noopener noreferrer">操作手冊第 74–79 頁</a></p>
          <p>手上已有地政線上申辦系統產製的「不動產買賣資訊申報」ZIP，可在數位櫃臺「申報案件基本資訊」點「資料匯入」，匯入後核對新增的標的。本作業台的 A2 備存 ZIP 尚未驗證可供 D1 匯入。逐欄登打時，填完五區再點「新增標的」。</p>
          <label>數位櫃臺頁面 <select v-model="d1Group" data-testid="price-d1-group"><option v-for="g in digital.groups" :value="g.title" :key="g.title">{{ g.title }}</option></select></label>
          <p class="note" v-if="d1Group==='申報案件基本資訊'">權利人與義務人從登記案件名單選取，再點「新增」。申報範圍供本案判斷是否須分張。</p>
          <p class="note" v-if="d1Group==='交易總價'">本案成交總價已由背表的萬元換算為元。若應分張，須按各張標的的實際交易價款申報。</p>
          <details v-if="d1Group==='備註欄'"><summary>勾選特殊交易情形</summary><details v-for="g in result.specialGroups" :key="g.title"><summary>{{g.title}}</summary><label v-for="item in g.items" :key="item.code" style="display:block"><input type="checkbox" :checked="draft.special?.[item.code]===true" @change="write('special',item.code,$event.target.checked)"> {{item.label}}</label></details></details>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px">
            <div v-for="f in d1Current.fields" :key="f.key" style="display:grid;gap:3px"><label :for="'d1field-'+f.key">{{f.label}}</label>
              <select v-if="f.options" :id="'d1field-'+f.key" :value="f.value" @change="write('values',f.key,$event.target.value)"><option value="">請選擇</option><option v-for="o in f.options" :key="o.value" :value="o.value">{{o.label}}</option></select>
              <input v-else :id="'d1field-'+f.key" :type="f.type||'text'" :value="f.value" :readonly="f.readOnly" :inputmode="f.inputmode" @input="!f.readOnly && write('values',f.key,$event.target.value)">
              <button class="mini" type="button" :data-d1-copy="f.key" :disabled="!showField(f)" @click="copyField(f)">複製{{f.label}}</button>
            </div>
          </div>
          <label v-if="d1Group==='備註欄' && result.scope==='split'">分件標的與個別價款補充<textarea :value="draft.splitNote||''" rows="3" @input="write(null,'splitNote',$event.target.value)"></textarea></label>
          <p v-if="d1Group==='備註欄'" class="note">適用備註⑩、⑪、⑫時，在官網依序新增地號、建號、基地號及權利範圍。</p>
          <div v-if="copyFallback"><label>選取後複製<textarea readonly ref="clipboardFallback" :value="copyFallback"></textarea></label></div>
          <p><button type="button" class="mini" data-testid="price-d1-txt" @click="digitalDownload">下載 D1 五區逐欄清單（TXT）</button></p>
          <p v-if="digital.warn.length" class="note">{{digital.warn.join(' ')}}</p>
          <p><b>3. 預覽及電子簽章</b>　核對數位櫃臺產製的買賣實價申報書，由買賣雙方及應簽章人依案件流程簽章。</p>
          <p><b>4. 隨登記案送件</b>　起案人在數位櫃臺查詢簽章進度，完成後送件。取得機關回條，再回本案下方登記收件或補正資訊。</p>
        </fieldset>
      </template>
      <template v-if="channel==='A2'">
      <p>買賣雙方共同申報。A2 在申報網匯入、取得序號後，列印簽章並隨登記案件送件。</p>
      <fieldset :disabled="locked" style="border:0;padding:0;min-width:0">
        <label>選擇要核對的資料 <select v-model="group" data-testid="price-group"><option v-for="g in result.groups" :key="g.title">{{ g.title }}</option></select></label>
        <div v-if="current.title==='交易與受理機關'" class="note">成交總價由背表的萬元換為元，以實際買賣契約為準。公契列載的價款與日期另行保存。</div>
        <div v-if="current.title==='申報人與委任' && result.agentName" class="note">已核對委任的受任人　{{ result.agentName }}</div>
        <template v-if="current.title==='特殊交易與備註'"><details v-for="g in result.specialGroups" :key="g.title"><summary>{{ g.title }}</summary>
          <label v-for="item in g.items" :key="item.code" style="display:block"><input type="checkbox" :checked="draft.special?.[item.code]===true" @change="write('special',item.code,$event.target.checked)"> {{ item.label }}</label>
        </details></template>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px"><label v-for="f in current.fields" :key="f.key" style="display:grid;gap:4px">{{ f.label }}
          <select v-if="f.options" :aria-label="f.label" :value="f.value" :data-price-key="f.key" @change="write('values',f.key,$event.target.value)">
            <option value="">請選擇</option><option v-for="opt in f.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select>
          <input v-else :type="f.type||'text'" :aria-label="f.label" :data-price-key="f.key" :value="f.value" :inputmode="f.inputmode" @input="write('values',f.key,$event.target.value)">
          <button v-if="f.fallback!==undefined && draft.values?.[f.key]!==undefined && String(f.fallback??'')!==f.value" type="button" class="mini" @click="restore(f.key)">帶回本案資料</button>
        </label></div>
        <label v-if="result.scope==='split'">個別價款、地建號及基地持分（供分張核對）<textarea :value="draft.splitNote||''" rows="3" @input="write(null,'splitNote',$event.target.value)"></textarea></label>
        <p><button type="button" class="mini" data-testid="price-check" @click="check">檢查實價欄位</button> <button type="button" class="mini" @click="manual">下載逐欄核對清單</button></p>
        <ul v-if="showMissing && result.issues.length" role="alert" data-testid="price-missing"><li v-for="item in result.issues" :key="item">{{ item }}</li></ul>
        <label><input type="checkbox" data-testid="price-reviewed" :disabled="!!result.issues.length" :checked="approved===fingerprint" @change="approved=$event.target.checked?fingerprint:''"> 我已核對實際價款、全體當事人、申報身分、車位與特殊交易。</label>
        <p><button type="button" :disabled="!ready" data-testid="price-json" @click="prepare('json')">下載買賣申報 JSON</button> <button type="button" :disabled="!ready" data-testid="price-zip" @click="prepare('zip')">下載備存 ZIP</button></p>
      </fieldset>
      <p class="note">本機依 V1120218 格式產生單張 A2 申報資料。請將 JSON 帶到申報網，匯入後核對受理機關、標的與金額。申報書序號及紙本收件結果由機關提供。</p>
      <p><a href="https://vlir.land.moi.gov.tw/" target="_blank" rel="noopener noreferrer">進入內政部申報網</a> · <a href="https://www.land.moi.gov.tw/chhtml/content/10?mcid=4716" target="_blank" rel="noopener noreferrer">地政司檔案格式</a> · <a href="https://land.tainan.gov.tw/cp.aspx?Create=1&amp;n=32427" target="_blank" rel="noopener noreferrer">臺南市申報方式</a></p>
      </template>
      <p role="status">{{ message }}</p>
    </section>`
  };
  const api={component,projection,artifact,handoff,digitalHandoff,digitalFile,yuan,rocDate,splitAddress};
  root.HGOnlinePrice=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

