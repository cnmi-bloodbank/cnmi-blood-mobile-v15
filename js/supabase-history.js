(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');
  const mem=new Map();
  const pick=(raw,names)=>{const n={};Object.keys(raw||{}).forEach(k=>n[norm(k)]=raw[k]);for(const name of names){const direct=raw?.[name];if(direct!==undefined&&direct!==null&&String(direct).trim()!=='')return direct;const v=n[norm(name)];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;}return '';};
  const donorIdText=v=>String(v??'').trim().replace(/\.0+$/,'');
  const idCardText=v=>{if(v===null||v===undefined||v==='')return '';if(typeof v==='number'&&Number.isFinite(v))return String(Math.trunc(v));const s=String(v).trim();if(/^\d+(?:\.0+)?$/.test(s))return s.replace(/\.0+$/,'');return s.replace(/\D/g,'');};
  const phoneText=v=>{if(v===null||v===undefined||v==='')return '';if(typeof v==='number'&&Number.isFinite(v)){const d=String(Math.trunc(v));return ((d.length===8||d.length===9)&&!d.startsWith('0'))?'0'+d:d;}return String(v).trim();};
  const genderCode=v=>{const g=String(v??'').trim().toLowerCase();if(g==='ชาย'||g==='male'||g==='m'||g==='1')return'M';if(g==='หญิง'||g==='female'||g==='f'||g==='2')return'F';return'';};
  function excelDate(value,includeTime=false){if(value===null||value===undefined||value==='')return '';if(typeof value==='number'&&Number.isFinite(value)){const whole=Math.floor(value),ms=Math.round((value-whole)*86400000),d=new Date(Date.UTC(1899,11,30)+whole*86400000+ms),dd=String(d.getUTCDate()).padStart(2,'0'),mm=String(d.getUTCMonth()+1).padStart(2,'0'),yy=d.getUTCFullYear()+543;if(!includeTime)return `${dd}-${mm}-${yy}`;return `${dd}/${mm}/${yy} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;}return String(value).trim();}
  function valueToYmd(v){
    if(v===null||v===undefined||v==='')return '';
    if(typeof v==='number'&&Number.isFinite(v)){const whole=Math.floor(v),d=new Date(Date.UTC(1899,11,30)+whole*86400000);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;}
    const s=String(v).trim();let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);if(m){let y=Number(m[3]);if(y>2400)y-=543;const mm=Number(m[2]),dd=Number(m[1]);if(y>=1900&&mm>=1&&mm<=12&&dd>=1&&dd<=31)return `${y}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;}
    m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m){let y=Number(m[1]);if(y>2400)y-=543;return `${y}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;}
    const t=Date.parse(s);if(Number.isFinite(t)){const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}return '';
  }
  const dateRank=v=>{const y=valueToYmd(v);return y?Number(y.replaceAll('-','')):0;};
  function thaiDateFromYmd(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${Number(m[3])}/${Number(m[2])}/${Number(m[1])+543}`:'';}
  const joinAddress=p=>[p.addressLine,p.subdistrict?`ต.${p.subdistrict}`:'',p.district?`อ.${p.district}`:'',p.province?`จ.${p.province}`:'',p.postalCode].filter(Boolean).join(' ');
  const dedupe=(rows,keyFn)=>{const s=new Set();return rows.filter(x=>{const k=keyFn(x);if(s.has(k))return false;s.add(k);return true;});};
  function matrixToObjects(matrix){const rows=Array.isArray(matrix)?matrix:[];const hi=rows.findIndex(r=>{const k=(r||[]).map(norm);return k.includes('donorid')&&(k.includes('idcard')||k.includes('note')||k.includes('deferreason')||k.includes('bagnumber'));});if(hi<0)throw new Error('หาแถวหัวตาราง Donor_ID ไม่พบ');const h=(rows[hi]||[]).map(v=>String(v??'').trim());return rows.slice(hi+1).filter(r=>(r||[]).some(v=>String(v??'').trim()!=='')).map(r=>Object.fromEntries(h.map((x,i)=>[x||`COL_${i+1}`,r?.[i]??''])));}
  function classify(rows){if(!rows.length)return '';const k=new Set(Object.keys(rows[0]||{}).map(norm));if(k.has('donorid')&&k.has('idcard'))return'donors';if(k.has('donorid')&&k.has('deferreason'))return'defers';if(k.has('donorid')&&k.has('note'))return'notes';if(k.has('donorid')&&k.has('bagnumber'))return'sero';return'';}
  function parseCsvMatrix(text){const rows=[];let row=[],cell='',q=false;const src=String(text||'').replace(/^\uFEFF/,'');for(let i=0;i<src.length;i++){const ch=src[i],next=src[i+1];if(ch==='"'&&q&&next==='"'){cell+='"';i++;}else if(ch==='"')q=!q;else if(ch===','&&!q){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell='';if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[];}else cell+=ch;}row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);return rows;}
  async function readReportFile(file){let matrix;if(/\.xlsx?$/i.test(file.name)){if(!window.XLSX)throw new Error('ตัวอ่าน Excel ยังไม่พร้อม');const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false}),ws=wb.Sheets[wb.SheetNames[0]];matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});}else matrix=parseCsvMatrix(await file.text());const rows=matrixToObjects(matrix),type=classify(rows);if(!type)throw new Error(`ไม่รู้จักรูปแบบรายงาน: ${file.name}`);return{type,rows,name:file.name};}
  function baseProfile(raw,idCard){const p={idCard,prefix:String(pick(raw,['Prefix','คำนำหน้า'])).trim(),fname:String(pick(raw,['Name','FirstName','ชื่อ'])).trim(),lname:String(pick(raw,['Lastname','LastName','นามสกุล'])).trim(),birth:excelDate(pick(raw,['DOB','BirthDate','วันเกิด'])),gender:genderCode(pick(raw,['Sex','Gender','เพศ'])),addressLine:String(pick(raw,['Address','ที่อยู่'])).trim(),subdistrict:String(pick(raw,['Tambol','Subdistrict','ตำบล'])).trim(),district:String(pick(raw,['Amper','District','อำเภอ'])).trim(),province:String(pick(raw,['Province','จังหวัด'])).trim(),postalCode:String(pick(raw,['Post','PostalCode','Zip','รหัสไปรษณีย์'])).trim(),phone:phoneText(pick(raw,['Tel','Phone','Telephone','โทรศัพท์'])),email:String(pick(raw,['email','Email','E-mail','อีเมล'])).trim(),occupation:String(pick(raw,['Occupation','อาชีพ'])).trim(),bloodGroupHistory:String(pick(raw,['BloodGroup','Blood Group','หมู่เลือด'])).trim(),donorIds:[],donorIdsAll:[],donationHistory:[],alerts:{notes:[],defers:[],seroNat:[]},_latestRank:0,updatedAt:new Date().toISOString()};p.address=joinAddress(p);return p;}
  async function buildProfiles(files){
    const parsed=await Promise.all(files.map(readReportFile)),g={};
    parsed.forEach(x=>{if(g[x.type])throw new Error(`พบรายงานชนิด ${x.type} ซ้ำ`);g[x.type]=x;});
    const missing=['donors','notes','defers','sero'].filter(k=>!g[k]);if(missing.length)throw new Error(`ไฟล์ยังไม่ครบ 4 ชุด: ขาด ${missing.join(', ')}`);
    const links=new Map(),profiles=new Map();let invalid=0,sourceFromDate='',sourceThroughDate='';
    for(const raw of g.donors.rows){
      const donorId=donorIdText(pick(raw,['Donor_ID','Donor_id','DonorID'])),id=idCardText(pick(raw,['IDCard','ID_Card','ID Card','เลขบัตรประชาชน']));
      if(!/^\d{13}$/.test(id)){invalid++;continue;}
      if(donorId){if(!links.has(donorId))links.set(donorId,new Set());links.get(donorId).add(id);}
      let p=profiles.get(id);if(!p){p=baseProfile(raw,id);profiles.set(id,p);}
      const rawDate=pick(raw,['DonateDate','DonationDate','วันที่บริจาค']),ymd=valueToYmd(rawDate),rank=dateRank(rawDate);
      if(ymd){if(!sourceFromDate||ymd<sourceFromDate)sourceFromDate=ymd;if(!sourceThroughDate||ymd>sourceThroughDate)sourceThroughDate=ymd;}
      if(rank>=(p._latestRank||0)){const latest=baseProfile(raw,id);latest.donorIds=p.donorIds;latest.donorIdsAll=p.donorIdsAll;latest.donationHistory=p.donationHistory;latest.alerts=p.alerts;latest._latestRank=rank;p=latest;profiles.set(id,p);}
      if(donorId&&!p.donorIds.includes(donorId))p.donorIds.push(donorId);
      if(donorId&&!p.donorIdsAll.includes(donorId))p.donorIdsAll.push(donorId);
      p.donationHistory.push({date:excelDate(rawDate,true),ymd:ymd||'',component:String(pick(raw,['BloodComponent','Component','ส่วนประกอบ'])).trim(),unitNo:String(pick(raw,['Unit No','UnitNo','Bagnumber','BagNumber'])).trim(),donorId:donorId,donationNo:String(pick(raw,['ครั้งที่บริจาค','Donation No','DonationNo'])).trim(),group:String(pick(raw,['BloodGroup','Blood Group','หมู่เลือด'])).trim(),_rank:rank});
    }

    // เก็บ Donor_ID ที่ mapping ชัดเจนเท่านั้น เพื่อไม่ผูกคนผิดเมื่อ LIS มี Donor_ID ซ้ำ/ชนกัน
    for(const p of profiles.values()){p.donorIdsAll=[...new Set((p.donorIdsAll||p.donorIds||[]).filter(Boolean))];p.donorIds=(p.donorIds||[]).filter(d=>links.get(d)?.size===1);}

    const noteRows=g.notes.rows.map(raw=>({raw,id:donorIdText(pick(raw,['Donor_ID','Donor_id','DonorID']))})).filter(x=>x.id);
    const deferRows=g.defers.rows.map(raw=>({raw,id:donorIdText(pick(raw,['Donor_ID','Donor_id','DonorID']))})).filter(x=>x.id);
    const seroRows=g.sero.rows.map(raw=>({raw,id:donorIdText(pick(raw,['Donor_id','Donor_ID','DonorID']))})).filter(x=>x.id);
    const alertIds=[...new Set([...noteRows,...deferRows,...seroRows].map(x=>x.id))];

    // ถ้ารายงานรอบใหม่เป็นช่วงวันสั้น ๆ ให้ใช้ Donor_ID mapping จากฐานเดิม เพื่อยังเชื่อม Note/Defer/Sero-NAT ของคนเก่าได้
    const needResolve=alertIds.filter(id=>!links.has(id)||links.get(id).size!==1);
    if(needResolve.length&&window.cnmiSupabaseApi?.resolveDonorIds){
      const resolved=await window.cnmiSupabaseApi.resolveDonorIds(needResolve);
      Object.entries(resolved||{}).forEach(([donorId,idCard])=>{if(/^\d{13}$/.test(String(idCard||''))){links.set(String(donorId),new Set([String(idCard)]));}});
      const oldCards=[...new Set(Object.values(resolved||{}).map(String).filter(x=>/^\d{13}$/.test(x)&&!profiles.has(x)))];
      if(oldCards.length){
        const oldMap=await window.cnmiSupabaseApi.getDonorHistories(oldCards);
        Object.entries(oldMap||{}).forEach(([id,p])=>{if(p){const clone=typeof structuredClone==='function'?structuredClone(p):JSON.parse(JSON.stringify(p));clone.alerts=clone.alerts||{};clone.alerts.defers=[];profiles.set(id,clone);}});
      }
    }

    // Active Defer เป็นสถานะปัจจุบันของรายงานรอบล่าสุด: คนที่ถูกแตะในรอบนี้เริ่มจาก defer ว่างแล้วค่อยเติมรายการปัจจุบัน
    for(const p of profiles.values()){p.alerts=p.alerts||{notes:[],defers:[],seroNat:[]};p.alerts.notes=p.alerts.notes||[];p.alerts.defers=[];p.alerts.seroNat=p.alerts.seroNat||[];}

    const unmatched=new Set(),attach=(donorId,kind,item)=>{const cards=links.get(donorId);if(!cards||cards.size!==1){unmatched.add(donorId);return;}const idCard=[...cards][0];let p=profiles.get(idCard);if(!p){unmatched.add(donorId);return;}p.alerts=p.alerts||{notes:[],defers:[],seroNat:[]};p.alerts[kind]=p.alerts[kind]||[];if(!p.donorIds)p.donorIds=[];if(!p.donorIds.includes(donorId))p.donorIds.push(donorId);p.alerts[kind].push(item);};
    for(const x of noteRows)attach(x.id,'notes',{date:excelDate(pick(x.raw,['Note Date','NoteDate']),true),note:String(pick(x.raw,['Note','Donor Note'])).trim(),status:String(pick(x.raw,['DonorStatus','Donor Status'])).trim()});
    for(const x of deferRows)attach(x.id,'defers',{date:excelDate(pick(x.raw,['Defer Date','DeferDate']),true),reason:String(pick(x.raw,['DeferReason','Defer Reason'])).trim(),until:excelDate(pick(x.raw,['วันสิ้นสุด Defer','Defer End','DeferEnd']))||String(pick(x.raw,['วันสิ้นสุด Defer','Defer End','DeferEnd'])).trim(),status:String(pick(x.raw,['DonorStatus','Donor Status'])).trim()});
    for(const x of seroRows)attach(x.id,'seroNat',{flag:true});

    let n=0,d=0,s=0;for(const p of profiles.values()){p.donationHistory=dedupe(p.donationHistory||[],x=>`${x.date}|${x.unitNo}|${x.component}`).sort((a,b)=>(b._rank||0)-(a._rank||0));p.donationHistory.forEach(x=>delete x._rank);p.alerts.notes=dedupe(p.alerts.notes||[],x=>`${x.date}|${x.note}|${x.status}`);p.alerts.defers=dedupe(p.alerts.defers||[],x=>`${x.date}|${x.reason}|${x.until}|${x.status}`);p.alerts.seroNat=(p.alerts.seroNat||[]).length?[{flag:true}]:[];delete p._latestRank;if(p.alerts.notes.length)n++;if(p.alerts.defers.length)d++;if(p.alerts.seroNat.length)s++;}
    return {profiles:[...profiles.values()],summary:{importedAt:new Date().toISOString(),donorProfiles:profiles.size,sourceDonorRows:g.donors.rows.length,donorWithNote:n,donorWithDefer:d,donorWithSeroNat:s,invalidIdCardRows:invalid,unmatchedAlertDonorIds:unmatched.size,sourceFromDate,sourceThroughDate,sourceFromDateThai:thaiDateFromYmd(sourceFromDate),sourceThroughDateThai:thaiDateFromYmd(sourceThroughDate)}};
  }
  function setText(id,text,cls){const n=$(id);if(!n)return;n.textContent=text;if(cls)n.className=cls;}
  function clearPanel(){const p=$('donor-history-panel');if(p){p.hidden=true;p.replaceChildren();}}
  const line=(text,cls='')=>{const d=document.createElement('div');d.className=cls;d.textContent=text;return d;};
  function listBox(title,items,formatter,cls,max=5){const box=document.createElement('div');box.className=`preload-alert ${cls}`;box.appendChild(line(title,'fw-bold'));const ul=document.createElement('ul');ul.className='mb-0 mt-1 ps-4';items.slice(0,max).forEach(x=>{const li=document.createElement('li');li.textContent=formatter(x);ul.appendChild(li);});if(items.length>max){const li=document.createElement('li');li.textContent=`ดูเพิ่มเติมได้ในประวัติทั้งหมด (${items.length.toLocaleString()} รายการ)`;li.className='text-muted';ul.appendChild(li);}box.appendChild(ul);return box;}
  function donationOrdinal(hist){const rows=Array.isArray(hist)?hist:[];const first=rows.find(x=>String(x?.donationNo||'').trim());if(!first)return '';return String(first.donationNo).trim().replace(/\.0+$/,'');}
  const bagKey=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const ymdFromItem=x=>String(x?.ymd||'').trim()||valueToYmd(x?.date||'');
  function combinedHistory(hist,mobile){
    const ai=(Array.isArray(hist)?hist:[]).map(x=>({...x,source:'AI-LIS'}));
    const used=new Set();
    const out=[];
    for(const m of (Array.isArray(mobile)?mobile:[])){
      const mb=bagKey(m.bag),my=ymdFromItem(m);
      let ix=-1;
      if(mb) ix=ai.findIndex((h,i)=>!used.has(i)&&bagKey(h.unitNo)===mb);
      if(ix<0&&my&&String(m.status||'').includes('ผ่าน')){
        const candidates=ai.map((h,i)=>({h,i})).filter(z=>!used.has(z.i)&&ymdFromItem(z.h)===my);
        if(candidates.length===1) ix=candidates[0].i;
      }
      if(ix>=0){
        used.add(ix);const h=ai[ix];
        out.push({...h,source:'Mobile + AI-LIS',dn:m.dn||'',location:m.location||'',status:m.status||'',bag:m.bag||h.unitNo||'',date:h.date||m.date||'',ymd:h.ymd||m.ymd||'',donorId:h.donorId||m.donorId||'',donationNo:h.donationNo||m.donationNo||''});
      }else out.push({date:m.date||m.ymd||'',ymd:m.ymd||valueToYmd(m.date),component:m.component||'',unitNo:m.bag||'',bag:m.bag||'',donationNo:m.donationNo||'',donorId:m.donorId||'',group:m.group||'',dn:m.dn||'',location:m.location||'',status:m.status||'',source:m.source==='mobile+lis'?'Mobile + AI-LIS':'Blood Mobile'});
    }
    ai.forEach((h,i)=>{if(!used.has(i))out.push(h);});
    return out.sort((a,b)=>String(ymdFromItem(b)).localeCompare(String(ymdFromItem(a)))||String(b.date||'').localeCompare(String(a.date||'')));
  }
  function historyTable(items){
    const box=document.createElement('div');box.className='preload-alert preload-history';
    const head=document.createElement('div');head.className='d-flex flex-wrap justify-content-between align-items-center gap-2';
    const title=document.createElement('div');title.className='fw-bold';title.textContent=`ประวัติย้อนหลังทั้งหมด (${items.length.toLocaleString()} รายการ)`;head.appendChild(title);
    const btn=document.createElement('button');btn.type='button';btn.className='btn btn-outline-primary btn-sm';btn.textContent=items.length>5?`ดูทั้งหมด ${items.length.toLocaleString()} รายการ`:'แสดงทั้งหมด';head.appendChild(btn);box.appendChild(head);
    const wrap=document.createElement('div');wrap.className='table-responsive mt-2';box.appendChild(wrap);
    const render=all=>{
      const rows=all?items:items.slice(0,5);
      const tbl=document.createElement('table');tbl.className='table table-sm table-bordered align-middle mb-0';
      tbl.innerHTML='<thead><tr><th style="white-space:nowrap">วันที่</th><th style="white-space:nowrap">ครั้งที่</th><th>รายการ</th><th style="white-space:nowrap">Unit / Bag</th><th>ออกหน่วย</th><th style="white-space:nowrap">แหล่งข้อมูล</th></tr></thead>';
      const tb=document.createElement('tbody');
      rows.forEach(x=>{
        const tr=document.createElement('tr');
        const unit=String(x.unitNo||x.bag||'').trim();
        const cant=/บริจาคไม่ได้|ไม่ได้บริจาค/i.test(unit);
        const cols=[x.date||'-',x.donationNo?String(x.donationNo).replace(/\.0+$/,''):'-',x.component||x.status||'-',cant?'บริจาคไม่ได้':(unit||'-'),[x.dn?`DN ${x.dn}`:'',x.location||''].filter(Boolean).join(' · ')||'-',x.source||'-'];
        cols.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i===3&&cant)td.className='text-danger fw-bold';tr.appendChild(td);});tb.appendChild(tr);
      });
      tbl.appendChild(tb);wrap.replaceChildren(tbl);
      btn.textContent=all?'ย่อประวัติ':'ดูทั้งหมด '+items.length.toLocaleString()+' รายการ';btn.dataset.expanded=all?'1':'0';
    };
    btn.addEventListener('click',()=>render(btn.dataset.expanded!=='1'));
    render(items.length<=5);
    if(items.length<=5)btn.hidden=true;
    return box;
  }
  function renderProfile(p){
    clearPanel();const panel=$('donor-history-panel');if(!panel||!p)return;panel.hidden=false;
    const hist=Array.isArray(p.donationHistory)?p.donationHistory:[],mobile=Array.isArray(p.mobileVisits)?p.mobileVisits:[],a=p.alerts||{},ordinal=donationOrdinal(hist);
    const ids=[...new Set([...(p.donorIdsAll||[]),...(p.donorIds||[]),...mobile.map(x=>x?.donorId||'')].filter(Boolean))];
    // คำเตือนต้องอยู่ก่อนประวัติ เพื่อไม่ให้ถูกกลบด้วยรายการย้อนหลัง
    if((a.defers||[]).length)panel.appendChild(listBox(`ติด Defer ปัจจุบัน (${a.defers.length}) — กรุณาตรวจสอบก่อนดำเนินการ`,a.defers,x=>`${x.reason||'ไม่ระบุเหตุผล'}${x.until?` · ถึง ${x.until}`:''}`,'preload-danger',4));
    if((a.seroNat||[]).length)panel.appendChild(listBox('Sero + NAT ผิดปกติ',a.seroNat,()=>`ให้ติดต่อห้องบริจาคโลหิตในเวลาทำการ เพื่อดูข้อมูลในระบบ LIS ของโรงพยาบาล`,'preload-danger',1));
    if((a.notes||[]).length)panel.appendChild(listBox(`Donor Note (${a.notes.length})`,a.notes,x=>`${x.note||'ไม่มีข้อความ'}${x.date?` · ${x.date}`:''}`,'preload-note',5));
    const summary=document.createElement('div');summary.className='preload-alert preload-history';
    const title=document.createElement('div');title.className='preload-history-title';title.textContent='พบประวัติผู้บริจาคเดิม';summary.appendChild(title);
    const grid=document.createElement('div');grid.className='row g-2 mt-1';
    const cards=[['ครั้งบริจาคสะสม',ordinal?`ครั้งที่ ${ordinal}`:'ไม่พบค่าในรายงาน'],['ประวัติ AI-LIS ที่นำเข้า',`${hist.length.toLocaleString()} รายการ`],['ประวัติ Blood Mobile',`${mobile.length.toLocaleString()} Visit`],['หมู่เลือดเดิม',p.bloodGroupHistory||'-']];
    cards.forEach(([k,v])=>{const c=document.createElement('div');c.className='col-6 col-lg-3';c.innerHTML=`<div class="border rounded p-2 h-100"><div class="small text-muted">${k}</div><div class="fw-bold">${v}</div></div>`;grid.appendChild(c);});summary.appendChild(grid);
    if(ids.length){const d=document.createElement('div');d.className='small mt-2';d.innerHTML=`<strong>Donor ID:</strong> ${ids.map(x=>escapeHtml(String(x))).join(', ')}`;summary.appendChild(d);}panel.appendChild(summary);
    const all=combinedHistory(hist,mobile);if(all.length)panel.appendChild(historyTable(all));
  }
  async function findDonor(id){const clean=String(id||'').replace(/\D/g,'');if(!/^\d{13}$/.test(clean))return null;if(mem.has(clean))return mem.get(clean);const p=await window.cnmiSupabaseApi.getDonorHistory(clean);if(p)mem.set(clean,p);return p;}
  async function findMany(ids){const clean=[...new Set((ids||[]).map(x=>String(x||'').replace(/\D/g,'')).filter(x=>/^\d{13}$/.test(x)))];const missing=clean.filter(x=>!mem.has(x));if(missing.length){const got=await window.cnmiSupabaseApi.getDonorHistories(missing);Object.entries(got||{}).forEach(([k,v])=>mem.set(k,v));}return Object.fromEntries(clean.filter(x=>mem.has(x)).map(x=>[x,mem.get(x)]));}
  async function upsertBasic(){return;}
  function currentLocalYmd(){const d=new Date(),off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,10);}
  function registrationSuggestion(p){
    const hist=Array.isArray(p?.donationHistory)?p.donationHistory:[],mobile=Array.isArray(p?.mobileVisits)?p.mobileVisits:[];
    const today=currentLocalYmd();
    const todayMobile=mobile.find(x=>ymdFromItem(x)===today&&(x.donorId||x.donationNo));
    const donorId=(todayMobile?.donorId||hist.find(x=>String(x?.donorId||'').trim())?.donorId||mobile.find(x=>String(x?.donorId||'').trim())?.donorId||p?.donorIds?.[0]||p?.donorIdsAll?.[0]||'');
    if(todayMobile?.donationNo)return {donorId:String(donorId||''),donationNo:String(todayMobile.donationNo).replace(/\.0+$/,'')};
    const nums=[...hist,...mobile].map(x=>Number(String(x?.donationNo||'').replace(/\.0+$/,''))).filter(n=>Number.isInteger(n)&&n>0);
    const next=nums.length?Math.max(...nums)+1:1;
    return {donorId:String(donorId||''),donationNo:String(next)};
  }
  async function lookupFromRegister({fill=true}={}){const id=String($('id_card')?.value||'').replace(/\D/g,'');if(!/^\d{13}$/.test(id)){clearPanel();setText('preload-register-status','กรอกเลขบัตร 13 หลักเพื่อค้นประวัติ','small text-muted mt-1');return null;}const p=await findDonor(id);if(!p){clearPanel();const donorEl=$('donor_id'),noEl=$('donation_no');if(donorEl&&donorEl.dataset.userEdited!=='1')donorEl.value='';if(noEl&&noEl.dataset.userEdited!=='1')noEl.value='1';setText('preload-register-status','ไม่พบประวัติในฐานกลาง','small fw-bold text-secondary mt-1');return null;}if(fill){const map={prefix:p.prefix,fname:p.fname,lname:p.lname,birth_date:p.birth,gender:genderCode(p.gender),address:p.address,phone:p.phone};Object.entries(map).forEach(([id0,v])=>{const n=$(id0);if(n&&!n.value&&v)n.value=v;});const sug=registrationSuggestion(p),donorEl=$('donor_id'),noEl=$('donation_no');if(donorEl&&donorEl.dataset.userEdited!=='1'&&sug.donorId){donorEl.value=sug.donorId;donorEl.dataset.userEdited='0';}if(noEl&&noEl.dataset.userEdited!=='1'){noEl.value=sug.donationNo||'1';noEl.dataset.userEdited='0';}}renderProfile(p);const alerts=(p.alerts?.notes?.length||0)+(p.alerts?.defers?.length||0)+(p.alerts?.seroNat?.length||0);setText('preload-register-status',alerts?`พบประวัติกลาง · มีรายการเตือน ${alerts} รายการ`:(fill?'พบประวัติกลางและเติมข้อมูลให้แล้ว':'พบประวัติกลาง'),alerts?'small fw-bold text-danger mt-1':'small fw-bold text-success mt-1');return p;}
  async function refreshSummary(){const s=await window.cnmiSupabaseApi.getHistorySummary();const box=$('preload-summary'),coverage=$('preload-coverage');if(!box)return s;if(!s){box.textContent='ยังไม่มีฐานประวัติ 4 Reports ใน Supabase';box.className='fw-bold text-danger';if(coverage)coverage.textContent='';return null;}const x=s.summary||{};box.textContent=`ฐานกลางอัปเดต ${s.completed_at?new Date(s.completed_at).toLocaleString('th-TH'):''} · ผู้บริจาค ${Number(x.donorProfiles||0).toLocaleString()} คน · Note ${Number(x.donorWithNote||0).toLocaleString()} · Defer ${Number(x.donorWithDefer||0).toLocaleString()} · Sero/NAT ${Number(x.donorWithSeroNat||0).toLocaleString()}`;box.className='fw-bold text-success';if(coverage){if(x.sourceThroughDate){const from=x.sourceFromDateThai||thaiDateFromYmd(x.sourceFromDate),to=x.sourceThroughDateThai||thaiDateFromYmd(x.sourceThroughDate);coverage.innerHTML=`<strong>ข้อมูลรายชื่อผู้บริจาครอบล่าสุด:</strong> ${from&&from!==to?escapeHtml(from)+' – ':''}${escapeHtml(to)} <span class="text-muted">(อ้างอิงวันที่บริจาคล่าสุดในไฟล์รายชื่อ)</span><br><strong>รอบถัดไป:</strong> แนะนำ Export รายงานทั้ง 4 ไฟล์โดยเริ่มซ้ำจากวันที่ <strong>${escapeHtml(to)}</strong> เพื่อกันข้อมูลตกหล่น ระบบจะรวมรายการเดิมให้โดยไม่เพิ่มซ้ำ`;coverage.className='alert alert-info py-2 px-3 mb-3';}else{coverage.textContent='ยังอ่านวันที่ล่าสุดจากไฟล์รายชื่อผู้บริจาคไม่ได้ กรุณาตรวจช่วงวันที่ใน AI-LIS ก่อน Export รอบถัดไป';coverage.className='alert alert-warning py-2 px-3 mb-3';}}return s;}
  window.cnmiPreload={findDonor,findMany,upsertBasic,getSummary:refreshSummary,hasData:async()=>!!(await window.cnmiSupabaseApi.getHistorySummary()),refreshSummary,lookupFromRegister,renderProfile,clearPanel};
  window.importOnlinePreload=async()=>{const files=[...($('preload-report-files')?.files||[])];if(files.length!==4)return alert('กรุณาเลือกไฟล์รายงาน 4 ไฟล์พร้อมกัน');const btn=$('preload-import-btn');try{if(btn){btn.disabled=true;btn.textContent='กำลังอ่าน Excel...';}setText('preload-import-status','กำลังอ่านและรวมรายงาน 4 ชุด...','small fw-bold text-primary mt-2');const built=await buildProfiles(files);setText('preload-import-status',`เตรียม ${built.profiles.length.toLocaleString()} คนแล้ว · กำลังส่งขึ้น Supabase...`,'small fw-bold text-primary mt-2');await window.cnmiSupabaseApi.importSnapshot(built.profiles,built.summary,(phase,done,total)=>setText('preload-import-status',`${phase==='donors'?'อัปเดตผู้บริจาค':'อัปโหลดประวัติ'} ${done.toLocaleString()}/${total.toLocaleString()}`,'small fw-bold text-primary mt-2'));mem.clear();const current=await refreshSummary();const s=current?.summary||built.summary;alert(`อัปเดตฐานกลางสำเร็จ (เพิ่ม/ปรับปรุงจากฐานเดิม)
ผู้บริจาคในฐานรวม ${Number(s.donorProfiles||0).toLocaleString()} คน
Donor Note ${Number(s.donorWithNote||0).toLocaleString()} คน
Active Defer ${Number(s.donorWithDefer||0).toLocaleString()} คน
Sero/NAT ${Number(s.donorWithSeroNat||0).toLocaleString()} คน
${built.summary.sourceThroughDateThai?`ข้อมูลรายชื่อผู้บริจาคถึง ${built.summary.sourceThroughDateThai}\n`:''}รอบนี้จับคู่คำเตือนไม่ได้ ${Number(built.summary.unmatchedAlertDonorIds||0).toLocaleString()} Donor_ID`);}catch(err){console.error(err);setText('preload-import-status',`นำเข้าไม่สำเร็จ: ${err.message||err}`,'small fw-bold text-danger mt-2');alert(`นำเข้าไม่สำเร็จ\n${err.message||err}`);}finally{if(btn){btn.disabled=false;btn.textContent='อัปเดตฐานกลาง 4 Reports';}}};
  window.clearOnlinePreload=()=>alert('v15 ไม่ล้างฐานกลางจากหน้าเว็บ เพื่อป้องกันการลบข้อมูลผิดพลาด\nให้นำเข้า 4 Reports ชุดใหม่แทน ชุดใหม่จะถูกตั้งเป็น Active อัตโนมัติ');
  function csvEscape(v){const t=String(v??'');return /[",\n\r]/.test(t)?`"${t.replaceAll('"','""')}"`:t;}function downloadCsv(text,filename){const blob=new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}function localYmd(){const d=new Date(),off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,10);}
  window.exportOnlineLisCsv=async()=>{try{const date=$('lis-export-date')?.value||$('table-date')?.value||localYmd(),rows=await getVisitDataFast(date,true);if(!Array.isArray(rows)||!rows.length)return alert('ไม่มีข้อมูลของวันที่เลือก');const profiles=await findMany(rows.map(r=>r.idCard));const cols=[['DN',r=>r.dn],['ID_Card',r=>r.idCard],['Prefix',r=>(profiles[r.idCard]?.prefix||r.prefix||'')],['FirstName',r=>(profiles[r.idCard]?.fname||r.fname||'')],['LastName',r=>(profiles[r.idCard]?.lname||r.lname||'')],['Birthdate',r=>(profiles[r.idCard]?.birth||r.birth||'')],['Gender',r=>genderCode(profiles[r.idCard]?.gender||r.gender||'')],['Address',r=>(profiles[r.idCard]?.addressLine||profiles[r.idCard]?.address||r.address||'')],['Subdistrict',r=>(profiles[r.idCard]?.subdistrict||'')],['District',r=>(profiles[r.idCard]?.district||'')],['Province',r=>(profiles[r.idCard]?.province||'')],['Postal_Code',r=>(profiles[r.idCard]?.postalCode||'')],['Occupation',r=>(profiles[r.idCard]?.occupation||'')],['Phone',r=>(profiles[r.idCard]?.phone||r.phone||'')],['Email',r=>(profiles[r.idCard]?.email||'')],['Weight',r=>r.weight],['BP',r=>r.bp],['Pulse',r=>r.pulse],['Temperature',r=>r.temp],['Hb',r=>r.hb],['Blood_Group',r=>r.group],['Bag_Number',r=>r.bag==='-'?'':r.bag],['Donor_Type',r=>r.type],['Screening_Status',r=>r.status],['Reason',r=>r.reason],['Save_Time',r=>r.saveTime],['C1',r=>r.c1],['C2',r=>r.c2],['E1',r=>r.e1],['E2',r=>r.e2],['Donor_ID',r=>r.donorId||''],['Donation_No',r=>r.donationNo||'']];downloadCsv(cols.map(c=>csvEscape(c[0])).join(',')+'\r\n'+rows.map(r=>cols.map(c=>csvEscape(c[1](r)??'')).join(',')).join('\r\n'),`CNMI-LIS-${date}.csv`);}catch(err){console.error(err);alert(`ส่งออก LIS CSV ไม่สำเร็จ\n${err.message||err}`);}};
  let debounce=null;document.addEventListener('DOMContentLoaded',()=>{$('id_card')?.addEventListener('input',()=>{clearTimeout(debounce);clearPanel();const donorEl=$('donor_id'),noEl=$('donation_no');if(donorEl&&donorEl.dataset.userEdited!=='1')donorEl.value='';if(noEl&&noEl.dataset.userEdited!=='1')noEl.value='1';debounce=setTimeout(()=>lookupFromRegister({fill:true}).catch(console.warn),120);});$('id_card')?.addEventListener('blur',()=>lookupFromRegister({fill:true}).catch(console.warn));setTimeout(()=>refreshSummary().catch(()=>{}),500);});
})();
