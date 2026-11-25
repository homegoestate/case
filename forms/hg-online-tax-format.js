/* CSV keys and strict Big5/ZIP routines reused from HomeGo Operations tax-filing-adapter.mjs and filing-archive.mjs.
 * Observed single archive, no personal data or official acceptance. Checked the published manual on 2026-11-20. */
(function (root) {
'use strict';
const AVM_KEYS = `HSN ORG TOWN CASE_TP TRAN_REAS TRAN_AREA LUMP_LND_AREA FLG_DATE NTC_SURDOCU_DATE TRD_DATE CITY_TP LND_MARK LOC_NM TRAN_RATE_NMRT TRAN_RATE_DNT TRAN_PRC LND2 ANNO_PR_VAL_PRC ANNO_PR_VAL LND_PRVLG_MK CHK11 CHK12 CHK13 CHK14 SLF_NTF CHK2 LEGAL8 CHK241 F CHKS CHK21 CHK22 CHK23 CHK24 CHK26 CHK31 CHK32 CHK41 CHK51 CHK61 PRES PRE_1 O_HOLDERS OIDN_BAN_1 OIDN_NM_1 OBORN_DATE_1 O_HOLDER_TRAN_NMRT_1 O_HOLDER_TRAN_DNT_1 O_PUB_HAVE_1 O_HOLDER_TEL_1 O_HOLDER_HADDR_1 O_HOLDER_HZIP_1 O_EMAIL_ADDR_1 O_FAX_1 O_HOLDER_CADDR_1 O_HOLDER_CZIP_1 N_HOLDERS NIDN_BAN_1 NIDN_NM_1 NBORN_DATE_1 N_HOLDER_TRAN_NMRT_1 N_HOLDER_TRAN_DNT_1 N_PUB_HAVE_1 N_HOLDER_TEL_1 N_HOLDER_HADDR_1 N_HOLDER_HZIP_1 N_EMAIL_ADDR_1 N_FAX_1 N_HOLDER_CADDR_1 N_HOLDER_CZIP_1 LND_PAY_DOCU_ADDR_1 AGT_IDN AGENT_NM AGENT_ADD AGENT_TEL`.split(' ');
const CHT_KEYS = `HSN REF_UNIT_CD CONTRCT_TP HOU_LOSN HOU_LOC CONTRCT_DATE TRAN_PRC LEVY_MODE ABATE_CLAUSE_CD HOU_CNSTRT_NO MAIN_BUILD_NO SEC_CHI_NM SSC_CHI_NM HOU_PAY_DOCU_ADDR PUB_FAC_SHR_NMRT_1 PUB_FAC_SHR_DNT_1 PUB_FAC_CNSTRT_NO_1 PUB_FAC_AREA_1 PUB_FACs HOU_FLOOR_NO_1 HOU_AREA_1 STRUC_CD_1 SUB_FLOOR_NO_1 SUB_AREA_1 SUB_USE_CD_1 HOU_FLOOR_NO_2 HOU_AREA_2 STRUC_CD_2 SUB_FLOOR_NO_2 SUB_AREA_2 SUB_USE_CD_2 T459S HOU_ATT_YN_MK HOU_FLOORs UN_STR_MK F O_HOLDERS O_HOLDER_IDN_BAN_1 O_HOLDER_NM_1 OBORN_DATE_1 O_HOLDER_TRAN_NMRT_1 O_HOLDER_TRAN_DNT_1 O_PUB_HAVE_1 O_HOLDER_TEL_1 O_HOLDER_HADDR_1 O_HOLDER_CADDR_1 O_EMAIL_ADDR_1 O_FAX_1 O_HOLDER_ID_CD_1 O_HOLDER_OWNER_TP_1 N_HOLDERS SUB_HOU_IDN_BAN_1 OTH_PRVLG_MK_1 SUB_HOU_IDN_BAN_2 OTH_PRVLG_MK_2 N_HOLDER_IDN_BAN_1 N_HOLDER_NM_1 NBORN_DATE_1 N_HOLDER_TRAN_NMRT_1 N_HOLDER_TRAN_DNT_1 N_PUB_HAVE_1 N_HOLDER_TEL_1 N_HOLDER_HADDR_1 N_HOLDER_CADDR_1 N_EMAIL_ADDR_1 N_FAX_1 N_HOLDER_ID_CD_1 N_HOLDER_OWNER_TP_1 AGENT_IDN_BAN AGENT_NM AGENT_ADD AGENT_TEL_NO`.split(' ');

class TaxFilingError extends Error {
  constructor(message,code='TAX_FILING_INVALID',details=[]) { super(message); this.name='TaxFilingError'; this.code=code; this.details=details; }
}
const err = (message,code,details) => { throw new TaxFilingError(message,code,details); };

let big5Map;
/** Browser/Node shared strict encoder. Never replaces an unsupported character. */
function encodeBig5Strict(value) {
  if (typeof value!=='string') err('Big5 編碼內容必須是文字。','TAX_ENCODING_INPUT');
  if (!big5Map) {
    const map=new Map(),decoder=new TextDecoder('big5',{fatal:true});
    for(let i=0;i<128;i++)map.set(String.fromCharCode(i),[i]);
    // Use the runtime's WHATWG Big5 decoder as the mapping authority. Duplicate
    // Unicode mappings are deterministic; original files retain original bytes.
    for(let lead=0x81;lead<=0xfe;lead++)for(let trail=0x40;trail<=0xfe;trail++) {
      if(trail>0x7e&&trail<0xa1)continue;
      try {const s=decoder.decode(Uint8Array.of(lead,trail));if(s&&!s.includes('\ufffd')&&!map.has(s))map.set(s,[lead,trail]);} catch { /* Invalid byte pair. */ }
    }
    big5Map=map;
  }
  const points=Array.from(value),result=[];
  for(let i=0;i<points.length;i++) {
    const pair=points[i]+(points[i+1]||'');
    if(i+1<points.length&&big5Map.has(pair)){result.push(...big5Map.get(pair));i++;continue;}
    const encoded=big5Map.get(points[i]);
    if(!encoded)err(`內容第 ${i+1} 個字無法以 Big5 完整表示，請人工處理。`,'TAX_BIG5_UNSUPPORTED',[{characterIndex:i+1,codePoint:`U+${points[i].codePointAt(0).toString(16).toUpperCase()}`}]);
    result.push(...encoded);
  }
  return Uint8Array.from(result);
}

/** Strict CSV parser used only by HEADER; detail .csv files are KEY=VALUE. */
function parseHeader(text, expected = 11) {
  const rows=[];let row=[],value='',quoted=false,closed=false,atStart=true;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
    if(c==='"'){if(!atStart)err('標頭引號位置不正確。','TAX_HEADER_CSV');quoted=true;atStart=false;continue;}
    if(c===','||c==='\r'||c==='\n'){
      row.push(value);value='';closed=false;atStart=true;
      if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[];}continue;
    }
    if(closed)err('標頭引號結束後有非分隔字元。','TAX_HEADER_CSV');
    value+=c;atStart=false;
  }
  if(quoted)err('標頭引號未結束。','TAX_HEADER_CSV');
  if(value!==''||row.length||closed) {row.push(value);rows.push(row);}
  if(rows.length!==1 || (expected !== null && rows[0].length!==expected))err('標頭需為一列 11 欄；此檔與已觀察樣本不同。','TAX_HEADER_SHAPE');
  return rows[0];
}

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

function checkExtra(view,start,length) {
  const end=start+length;let pos=start;
  while(pos<end) {
    if(pos+4>end)throw Error('ZIP 額外欄位不完整。');
    const id=view.getUint16(pos,true),size=view.getUint16(pos+2,true);
    if(id===1)throw Error('不支援 ZIP64 額外欄位。');
    if(pos+4+size>end)throw Error('ZIP 額外欄位長度不符。');
    pos+=4+size;
  }
}
function nameFrom(bytes, flags) {
  if (!(flags & 0x800) && bytes.some(b => b > 127)) throw Error('ZIP 檔名編碼不明；請改用 UTF-8 檔名。');
  try { return validName(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw Error('ZIP 檔名無法安全辨識。'); }
}
async function inflateBounded(bytes, expected) {
  if (typeof DecompressionStream !== 'function') throw Error('瀏覽器不支援 ZIP 解壓縮，請更新 Chrome 或 Edge。');
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = []; let size = 0;
  try { for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > expected) { await reader.cancel(); throw Error('ZIP 解壓縮長度超過標示，已停止讀取。'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  if (size !== expected) throw Error('ZIP 檔案長度不符。');
  const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
}
async function readFilingArchive(input) {
  const bytes = asBytes(input), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || bytes.length > LIMITS.archiveBytes) throw Error('請選擇 10 MiB 以內的 ZIP 申報檔。');
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (view.getUint32(p,true) === 0x06054b50 && p + 22 + view.getUint16(p+20,true) === bytes.length) { end = p; break; }
  }
  if (end < 0) throw Error('ZIP 目錄不完整。');
  const count = view.getUint16(end+10,true), centralSize = view.getUint32(end+12,true), centralStart = view.getUint32(end+16,true);
  if (view.getUint16(end+4,true) || view.getUint16(end+6,true) || view.getUint16(end+8,true) !== count || !count || count > LIMITS.entries || centralStart + centralSize !== end) throw Error('不支援分片、ZIP64 或過多檔案的 ZIP。');
  let offset = centralStart, total = 0; const records = [], names = new Set(), ranges = [];
  for (let i=0; i<count; i++) {
    if (offset + 46 > end || view.getUint32(offset,true) !== 0x02014b50) throw Error('ZIP 中央目錄損壞。');
    const needed=view.getUint16(offset+6,true), flags=view.getUint16(offset+8,true), method=view.getUint16(offset+10,true), crc=view.getUint32(offset+16,true), compressed=view.getUint32(offset+20,true), length=view.getUint32(offset+24,true), nl=view.getUint16(offset+28,true), el=view.getUint16(offset+30,true), cl=view.getUint16(offset+32,true), local=view.getUint32(offset+42,true);
    if (offset+46+nl+el+cl>end || needed>20 || flags & ~0x80e || ![0,8].includes(method) || (method===0&&(flags&6)) || view.getUint16(offset+34,true) || compressed===0xffffffff || length===0xffffffff || local===0xffffffff) throw Error('不支援加密、ZIP64 或特殊壓縮格式的 ZIP。');
    const attributes=view.getUint32(offset+38,true),unixType=(attributes>>>16)&0xf000;
    if (unixType===0xa000) throw Error('ZIP 不可包含符號連結。');
    if (![0,0x4000,0x8000].includes(unixType)) throw Error('ZIP 不可包含特殊裝置檔案。');
    checkExtra(view,offset+46+nl,el);
    const rawName=bytes.subarray(offset+46,offset+46+nl), name=nameFrom(rawName,flags);
    if (names.has(pathKey(name))) throw Error('ZIP 含重複檔名。'); names.add(pathKey(name));
    if (((attributes&0x10)||unixType===0x4000)&&!name.endsWith('/'))throw Error('ZIP 資料夾標記與名稱不符。');
    if(unixType===0x8000&&name.endsWith('/'))throw Error('ZIP 一般檔案標記與名稱不符。');
    total += length; if (total>LIMITS.totalBytes || (name.endsWith('/') && length)) throw Error('ZIP 解壓縮總量超過限制或目錄資料不正確。');
    if (local+30>centralStart || view.getUint32(local,true)!==0x04034b50 || view.getUint16(local+4,true)!==needed || view.getUint16(local+6,true)!==flags || view.getUint16(local+8,true)!==method) throw Error('ZIP 本地檔頭與目錄不符。');
    const lnl=view.getUint16(local+26,true), lel=view.getUint16(local+28,true), start=local+30+lnl+lel, stop=start+compressed;
    if (stop>centralStart || lnl!==nl || rawName.some((b,j)=>bytes[local+30+j]!==b)) throw Error('ZIP 檔案範圍或名稱不符。');
    checkExtra(view,local+30+lnl,lel);
    const localCrc=view.getUint32(local+14,true),localCompressed=view.getUint32(local+18,true),localLength=view.getUint32(local+22,true);
    if (!(flags&8) && (localCrc!==crc || localCompressed!==compressed || localLength!==length)) throw Error('ZIP 檔頭校驗資料不符。');
    let extent=stop;
    if(flags&8) {
      if((localCrc&&localCrc!==crc)||(localCompressed&&localCompressed!==compressed)||(localLength&&localLength!==length))throw Error('ZIP 檔頭校驗資料不符。');
      const matches=pos=>pos+12<=centralStart&&view.getUint32(pos,true)===crc&&view.getUint32(pos+4,true)===compressed&&view.getUint32(pos+8,true)===length;
      if(stop+16<=centralStart&&view.getUint32(stop,true)===0x08074b50&&matches(stop+4))extent=stop+16;
      else if(matches(stop))extent=stop+12;
      else throw Error('ZIP 資料描述區缺漏或校驗資料不符。');
    }
    if (ranges.some(([a,b])=>local<b && extent>a)) throw Error('ZIP 含重疊檔案範圍。'); ranges.push([local,extent]);
    records.push({name,method,crc,length,start,stop}); offset += 46+nl+el+cl;
  }
  if (offset!==end) throw Error('ZIP 目錄長度不符。');
  checkPathCollisions(names);
  const entries=[];
  for (const row of records) {
    const raw=bytes.subarray(row.start,row.stop), data=row.method===0 ? raw.slice() : await inflateBounded(raw,row.length);
    if (data.length!==row.length || filingCrc32(data)!==row.crc) throw Error('ZIP 檔案校驗失敗；請重新取得原始匯出檔。');
    if (!row.name.endsWith('/')) entries.push({name:row.name,bytes:data});
  }
  if (!entries.length) throw Error('ZIP 沒有可讀取的申報檔案。');
  return entries;
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

const detailLayouts = Object.freeze({AVM001:Object.freeze(AVM_KEYS), CHT001:Object.freeze(CHT_KEYS)});
function inspectText(bytes) {
  if (bytes.length > 256 * 1024 || bytes.includes(0)) throw Error();
  if (bytes.every(b => b < 128)) return {encoding:'純 ASCII（可同時以 Big5、UTF-8 讀取）',body:new TextDecoder().decode(bytes)};
  function tryDecoder(name) { try { return new TextDecoder(name,{fatal:true}).decode(bytes); } catch { return null; } }
  const utf8 = tryDecoder('utf-8'), big5 = tryDecoder('big5');
  if (utf8 !== null && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return {encoding:'UTF-8 含 BOM',body:utf8};
  if (utf8 !== null && big5 !== null) return {encoding:'Big5、UTF-8 皆可解碼，無法唯一辨識',body:utf8};
  if (utf8 !== null) return {encoding:'UTF-8',body:utf8};
  if (big5 !== null) return {encoding:'Big5',body:big5};
  throw Error();
}
function inspectRecord(id, bytes) {
  const row = {id,encoding:'待辨識',newline:'待辨識',shape:'無法讀取文字格式',count:null,expected:id === 'HEADER' ? 11 : detailLayouts[id].length,missing:[],extraCount:0,duplicates:0};
  try {
    const {encoding,body} = inspectText(bytes);
    row.encoding = encoding;
    const ends = new Set(body.match(/\r\n|\n|\r/g) || []);
    row.newline = ends.size > 1 ? '混用換行' : ends.has('\r\n') ? 'CRLF' : ends.has('\n') ? 'LF' : ends.has('\r') ? 'CR' : '無換行';
    if (id === 'HEADER') {
      row.count = parseHeader(body,null).length;
      row.shape = row.count === 11 ? '一列 11 欄' : '標頭欄數不同';
      return row;
    }
    const lines = body.split(/\r\n|\r|\n/);
    if (lines.at(-1) === '') lines.pop();
    if (lines.length > 2048) throw Error();
    const keys = [];
    for (const line of lines) {
      const at = line.indexOf('=');
      if (at < 1 || at > 80 || !/^[A-Za-z][A-Za-z0-9_]*$/.test(line.slice(0,at))) throw Error();
      keys.push(line.slice(0,at));
    }
    const known = detailLayouts[id], seen = new Set(keys);
    row.count = keys.length;
    row.missing = known.filter(k => !seen.has(k)); // Only names from our own allowlist can leave this function.
    row.extraCount = [...seen].filter(k => !known.includes(k)).length;
    row.duplicates = keys.length - seen.size;
    row.shape = row.missing.length || row.extraCount || row.duplicates ? '欄位集合不同' : keys.every((k,i) => known[i] === k) ? '欄位及順序一致' : '順序不同';
  } catch { row.shape = id === 'HEADER' ? '無法比對單列 CSV 標頭' : '無法比對鍵值欄位'; }
  return row;
}
// Expose structural metadata only. No imported path, identifier, field value,
// unexpected field name or original bytes appear in the return object.
async function compareArchive(input, currentIds) {
  let entries;
  try { entries = await readFilingArchive(input); }
  catch { throw Error('未能讀取 ZIP，請核對容量（10 MiB 以內）、壓縮方式及檔案完整性。'); }
  const expected = ['HEADER', ...Object.keys(detailLayouts).filter(id => currentIds?.includes(id))];
  const rows = [], groupIds = new Set(), seen = new Set();
  let otherFiles = 0, stampFiles = 0, pathDifferences = 0, extraVariants = 0, repeated = 0;
  for (const entry of entries) {
    const parts = entry.name.split('/'), base = parts.at(-1);
    const found = /^(HEADER|AVM\d{2,3}|CHT\d{2,3}|SMI\d{2})_([A-Za-z0-9_-]{1,80})\.csv$/i.exec(base);
    if (!found) { otherFiles++; continue; }
    const id = found[1].toUpperCase(), packageId = found[2];
    groupIds.add(packageId);
    if (parts.length !== 2 || parts[0] !== packageId || base !== id + '_' + packageId + '.csv') pathDifferences++;
    if (id.startsWith('SMI')) { stampFiles++; continue; }
    if (id !== 'HEADER' && !Object.hasOwn(detailLayouts,id)) { extraVariants++; continue; }
    if (seen.has(id)) repeated++;
    seen.add(id);
    const row = inspectRecord(id,entry.bytes);
    row.inCurrent = expected.includes(id);
    rows.push(row);
  }
  return {rows,missingFiles:expected.filter(id => !seen.has(id)),groupCount:groupIds.size,pathDifferences,repeated,otherFiles,stampFiles,extraVariants};
}
root.HGOnlineTaxFormat = Object.freeze({keys:detailLayouts, encodeBig5Strict, parseHeader, writeFilingArchive, compareArchive});
})(typeof window === "object" ? window : globalThis);
