(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');
  const legacyIdentity=v=>{if(v===null||v===undefined||v==='')return'';if(typeof v==='number'&&Number.isFinite(v))return String(Math.trunc(v));return String(v).trim().replace(/\.0+$/,'').replace(/\s+/g,'');};
  const text=v=>v===null||v===undefined?'':String(v).trim();
  const legacyDateText=v=>{if(v===null||v===undefined||v==='')return'';if(v instanceof Date&&!isNaN(v)){return `${String(v.getUTCDate()).padStart(2,'0')}-${String(v.getUTCMonth()+1).padStart(2,'0')}-${v.getUTCFullYear()}`;}return text(v);};
  const iso=v=>{
    if(!v)return '';
    if(v instanceof Date&&!isNaN(v))return v.toISOString();
    if(typeof v==='number'&&Number.isFinite(v)){const d=new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000+Math.round((v-Math.floor(v))*86400000));return d.toISOString();}
    const d=new Date(v);return isNaN(d)?'':d.toISOString();
  };
  const ymd=v=>{const z=iso(v);return z?z.slice(0,10):'';};
  const gender=v=>{const g=text(v).toLowerCase();if(['ชาย','male','m'].includes(g))return'M';if(['หญิง','female','f'].includes(g))return'F';return text(v);};
  function rows(ws){return XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});}
  function mapByNormalized(row){const out={};Object.entries(row||{}).forEach(([k,v])=>out[norm(k)]=v);return out;}
  function pick(row,names){const m=mapByNormalized(row);for(const n of names){const v=m[norm(n)];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;}return '';}
  async function parseLegacyWorkbook(file){
    if(!window.XLSX)throw new Error('ตัวอ่าน Excel ยังไม่พร้อม');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const donorWs=wb.Sheets['Donors'],visitWs=wb.Sheets['Visits'];
    if(!donorWs||!visitWs)throw new Error('ไฟล์นี้ต้องมีชีต Donors และ Visits');
    const donors=new Map();
    for(const r of rows(donorWs)){
      const id=legacyIdentity(pick(r,['ID_Card','IDCard','ID Card']));if(!id)continue;
      donors.set(id,{prefix:text(pick(r,['Prefix'])),fname:text(pick(r,['First Name','FirstName','Name'])),lname:text(pick(r,['Last Name','LastName','Lastname'])),birth:legacyDateText(pick(r,['Birthdate','DOB'])),gender:gender(pick(r,['Sex','Gender'])),address:text(pick(r,['Address'])),phone:text(pick(r,['phone','Phone','Tel']))});
    }
    const out=[],events=new Map();
    for(const r of rows(visitWs)){
      const id=legacyIdentity(pick(r,['ID_Card','IDCard','ID Card'])),dn=text(pick(r,['DN'])),visit=pick(r,['Visit','Date & Time']),date=ymd(visit),loc=text(pick(r,['Location']));
      if(!dn||!date)continue;
      const d=donors.get(id)||{};
      if(loc)events.set(date,loc);
      out.push({visitAt:iso(visit),visitDate:date,location:loc,dn,bag:text(pick(r,['Bag_Number','Bag Number','BagNumber'])),idCard:id,donorType:text(pick(r,['New/Recent','Donor Type'])),weight:text(pick(r,['Weight'])),bp:text(pick(r,['BP'])),pulse:text(pick(r,['Pulse'])),temp:text(pick(r,['Temp'])),hb:text(pick(r,['Hb'])),group:text(pick(r,['Blood Group','BloodGroup'])),status:text(pick(r,['Screening Status']))||'รอคัดกรอง',reason:text(pick(r,['Screening Not Pass Reason','Reason'])),screenedAt:iso(pick(r,['Save Time','SaveTime'])),c1:text(pick(r,['C1'])),c2:text(pick(r,['C2'])),e1:text(pick(r,['E1'])),e2:text(pick(r,['E2'])),...d});
    }
    return {rows:out,events:[...events.entries()].map(([date,location])=>({date,location}))};
  }
  function setStatus(msg,cls='text-muted'){const e=$('legacy-import-status');if(e){e.className='small mt-2 '+cls;e.textContent=msg;}}
  window.cnmiLegacyParser={parseLegacyWorkbook};
  window.importLegacyWorkbook=async()=>{
    const file=$('legacy-workbook-file')?.files?.[0];if(!file)return alert('กรุณาเลือกไฟล์ Blood Donation App.xlsx เดิมก่อน');
    const btn=$('legacy-import-btn');
    try{
      if(btn){btn.disabled=true;btn.textContent='กำลังอ่านไฟล์...';}
      setStatus('กำลังอ่าน Donors + Visits ใน Browser...','text-primary fw-bold');
      const parsed=await parseLegacyWorkbook(file);
      if(!parsed.rows.length)throw new Error('ไม่พบ Visits ที่พร้อมนำเข้า');
      const eventText=parsed.events.map(x=>`${x.date} · ${x.location}`).join(' | ');
      if(!confirm(`พบ ${parsed.rows.length} Visits จาก ${parsed.events.length} สถานที่/วันที่\n${eventText}\n\nนำเข้า Supabase ต่อหรือไม่?`))return;
      if(btn)btn.textContent='กำลังส่งขึ้น Supabase...';
      const result=await window.cnmiSupabaseApi.importLegacyVisits(parsed.rows,(done,total,r)=>setStatus(`นำเข้า ${done}/${total} · เพิ่ม ${r.inserted} · รวมของเดิม ${r.merged} · รหัส Legacy ${r.legacyIdentity} · ขัดแย้ง ${r.conflicts}`,'text-primary fw-bold'));
      if(typeof invalidateVisitCache==='function')invalidateVisitCache();
      setStatus(`สำเร็จ · เพิ่ม ${result.inserted} · รวมของเดิม ${result.merged} · รหัส Legacy ${result.legacyIdentity} · ไม่สมบูรณ์ ${result.invalid} · ขัดแย้ง ${result.conflicts}`,'text-success fw-bold');
      alert(`Import Legacy สำเร็จ\nเพิ่มใหม่ ${result.inserted}\nรวมกับข้อมูลเดิม ${result.merged}\nเก็บรหัสเดิมที่ไม่ใช่เลขบัตร 13 หลัก ${result.legacyIdentity}\nข้อมูลไม่สมบูรณ์ ${result.invalid}\nรายการขัดแย้ง ${result.conflicts}\n\nสามารถกด Import ไฟล์เดิมซ้ำได้ ระบบจะไม่สร้าง Visit ซ้ำ`);
      try{await window.cnmiSupabaseApi.reconcileMobileVisits();}catch(e){console.warn('reconcile after legacy import',e);}
    }catch(err){console.error(err);setStatus('Import ไม่สำเร็จ: '+(err.message||err),'text-danger fw-bold');alert('Import Legacy ไม่สำเร็จ\n'+(err.message||err));}
    finally{if(btn){btn.disabled=false;btn.textContent='นำเข้างานออกหน่วยเดิม';}}
  };
})();
