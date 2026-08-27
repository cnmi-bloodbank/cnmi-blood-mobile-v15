(() => {
  'use strict';
  const cfg = window.CNMI_SUPABASE_CONFIG || {};
  let client = null, realtime = null, realtimeTimer = null;
  const parse = x => { try { return typeof x === 'string' ? JSON.parse(x) : (x || {}); } catch { return {}; } };
  const ua = () => (typeof getUserAgentText === 'function' ? getUserAgentText() : navigator.userAgent || '');
  const authEmail = username => {
    const domain = String(cfg.authDomain || 'mahidol.ac.th').trim().toLowerCase();
    let u = String(username || '').trim().toLowerCase();
    if (!u) return '';
    if (u.includes('@')) {
      const [local, suppliedDomain] = u.split('@');
      if (!local || suppliedDomain !== domain) throw new Error(`ระบบนี้อนุญาตเฉพาะอีเมล @${domain}`);
      u = local;
    }
    if (!/^[a-z0-9._-]+$/.test(u)) throw new Error('ชื่อหน้าอีเมลใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง และขีดล่าง');
    return `${u}@${domain}`;
  };
  const thaiTime = v => v ? new Date(v).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}) : '';
  const cleanArea=(v,type)=>{let s=String(v||'').trim();if(type==='subdistrict')s=s.replace(/^(?:ตำบล|ต\.|แขวง)\s*/,'');if(type==='district')s=s.replace(/^(?:อำเภอ|อ\.|เขต)\s*/,'');if(type==='province')s=s.replace(/^(?:จังหวัด|จ\.)\s*/,'');return s.trim();};
  const joinAddressParts=(d={})=>{const sub=cleanArea(d.subdistrict,'subdistrict'),dis=cleanArea(d.district,'district'),pro=cleanArea(d.province,'province'),bkk=pro==='กรุงเทพมหานคร';return [d.address_line||d.addressLine||'',sub?`${bkk?'แขวง':'ต.'}${sub}`:'',dis?`${bkk?'เขต':'อ.'}${dis}`:'',pro?`${bkk?'':'จ.'}${pro}`:'',d.postal_code||d.postalCode||''].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();};
  function init() {
    if (client) return client;
    if (!cfg.url || !cfg.publishableKey || cfg.url.includes('YOUR-PROJECT') || cfg.publishableKey.includes('REPLACE_ME')) {
      throw new Error('ยังไม่ได้ตั้งค่า Supabase ใน assets/config.js');
    }
    if (!window.supabase?.createClient) throw new Error('โหลด Supabase library ไม่สำเร็จ');
    client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}
    });
    return client;
  }
  async function profile() {
    const sb=init();
    const {data:{user}}=await sb.auth.getUser();
    if(!user) return null;
    const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).single();
    if(error) throw error;
    return data;
  }
  const mapUser = p => p ? ({username:p.username,fullName:p.full_name,role:p.role,position:p.position,approvalLevel:p.approval_level,mustChangePassword:!!p.must_change_password,email:p.email}) : null;
  function startRealtime(){
    const sb=init(); if(realtime) return;
    realtime=sb.channel('cnmi-visits-live').on('postgres_changes',{event:'*',schema:'public',table:'visits'},()=>{
      clearTimeout(realtimeTimer); realtimeTimer=setTimeout(()=>{
        try{ if(typeof invalidateVisitCache==='function') invalidateVisitCache(); if(typeof loadTable==='function' && document.querySelector('.page-section.active')?.id?.match(/today|print-a4|screening|sticker|certificate|dashboard/)) loadTable(true); }catch(e){console.warn(e);}
      },250);
    }).subscribe();
  }
  async function visitsForDate(date){
    const sb=init();
    const {data,error}=await sb.from('visits').select('dn,bag_number,bag_lot,id_card,donor_type,weight,bp,pulse,temp,hb,blood_group,screening_status,reason,screened_at,c1,c2,e1,e2,location,source,lis_donor_id,lis_component,lis_donation_no,lis_blood_group,lis_match_method,mobile_donor_id,mobile_donation_no,donors!inner(prefix,fname,lname,birth,gender,address,address_line,subdistrict,district,province,postal_code,phone,occupation,legacy_identity,identity_type,passport_number,nationality,photo_data,photo_updated_at)').eq('visit_date',date).order('created_at',{ascending:false});
    if(error) throw error;
    return (data||[]).map(r=>{const d=r.donors||{},matched=!!String(r.lis_donor_id||'').trim(),kind=String(d.identity_type||'').trim()||(String(r.id_card||'').startsWith('LEGACY:')?'legacy':'thai'),isPassport=kind==='passport';return {dn:r.dn,identityKey:r.id_card,idCard:isPassport?'':(kind==='thai'?r.id_card:(d.legacy_identity||r.id_card)),dbIdCard:r.id_card,identityType:kind,passportNumber:isPassport?(d.passport_number||d.legacy_identity||''):'',nationality:isPassport?(d.nationality||''):'',prefix:d.prefix||'',fname:d.fname||'',lname:d.lname||'',name:`${d.prefix||''}${d.fname||''} ${d.lname||''}`.trim(),birth:d.birth||'-',gender:d.gender||'-',addressLine:d.address_line||'',subdistrict:cleanArea(d.subdistrict,'subdistrict'),district:cleanArea(d.district,'district'),province:cleanArea(d.province,'province'),postalCode:d.postal_code||'',address:joinAddressParts(d)||d.address||'-',phone:d.phone||'-',occupation:d.occupation||'',photoData:d.photo_data||'',photoUpdatedAt:d.photo_updated_at||'',bag:r.bag_number||'-',bagLot:r.bag_lot||'',status:r.screening_status||'รอคัดกรอง',reason:r.reason||'',type:r.donor_type||r.lis_component||'',group:r.blood_group||r.lis_blood_group||'',weight:r.weight||'',bp:r.bp||'',pulse:r.pulse||'',temp:r.temp||'',hb:r.hb||'',saveTime:thaiTime(r.screened_at),c1:r.c1||'',c2:r.c2||'',e1:r.e1||'',e2:r.e2||'',location:r.location||'',source:matched?'mobile+lis':(r.source||'mobile'),donorId:r.lis_donor_id||r.mobile_donor_id||'',donationNo:r.lis_donation_no||r.mobile_donation_no||'',mobileDonorId:r.mobile_donor_id||'',mobileDonationNo:r.mobile_donation_no||'',lisMatchMethod:r.lis_match_method||''};});
  }
  async function call(action, params={}){
    const sb=init(); const data=parse(params.data);
    try{
      if(action==='login'){
        const {data:auth,error}=await sb.auth.signInWithPassword({email:authEmail(data.username),password:data.password}); if(error) return {status:'error',message:'username หรือรหัสผ่านไม่ถูกต้อง'};
        const p=await profile(); if(!p?.active){await sb.auth.signOut();return {status:'error',message:'บัญชีนี้ถูกปิดการใช้งาน'};}
        try {
          const { error: touchLoginError } = await sb.rpc('touch_login',{p_user_agent:data.userAgent||ua()});
          if (touchLoginError) console.warn('touch_login failed', touchLoginError);
        } catch (touchLoginError) {
          console.warn('touch_login failed', touchLoginError);
        }
        startRealtime();
        return {status:'success',token:auth.session?.access_token||'',user:mapUser(p),mustChangePassword:!!p.must_change_password};
      }
      if(action==='getSessionUser'){
        const {data:{session}}=await sb.auth.getSession(); if(!session) return {status:'error',message:'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่'};
        const p=await profile(); if(!p?.active){await sb.auth.signOut();return {status:'error',message:'บัญชีนี้ถูกปิดการใช้งาน'};} startRealtime();
        return {status:'success',user:mapUser(p)};
      }
      if(action==='logout'){ try{await sb.rpc('write_audit',{p_action:'LOGOUT',p_target_type:'USER',p_target_id:(await profile())?.username||'',p_detail:'ออกจากระบบ',p_user_agent:data.userAgent||ua()});}catch{} await sb.auth.signOut(); return {status:'success'}; }
      if(action==='changePassword'){
        const p=await profile(); const {error:re}=await sb.auth.signInWithPassword({email:authEmail(p.username),password:data.currentPassword}); if(re) return {status:'error',message:'รหัสผ่านเดิมไม่ถูกต้อง'};
        const {error}=await sb.auth.updateUser({password:data.newPassword}); if(error) throw error; await sb.rpc('finish_password_change',{p_user_agent:data.userAgent||ua()}); return {status:'success',user:mapUser(await profile())};
      }
      if(action==='forgotPassword'||action==='resetPasswordWithOtp') return {status:'error',message:'กรุณาติดต่อ Admin เพื่อรีเซ็ตรหัสผ่านชั่วคราว'};
      if(action==='adminCreateUser'||action==='adminResetUserPassword'){
        const p=await profile();
        if(!p || !['admin','sup_manager'].includes(p.role)) return {status:'error',message:'เฉพาะ Admin เท่านั้น'};
        const fn=cfg.edgeFunctionName||'admin-users';
        const body=action==='adminCreateUser'
          ? {action:'create',username:data.username,fullName:data.fullName,position:data.position||'',temporaryPassword:data.temporaryPassword}
          : {action:'reset',username:data.username,temporaryPassword:data.temporaryPassword};
        const {data:r,error}=await sb.functions.invoke(fn,{body});
        if(error) throw error;
        if(!r || r.status!=='success') return {status:'error',message:r?.message||'ดำเนินการไม่สำเร็จ'};
        return r;
      }
      if(action==='saveDataToSheet'){
        const {data:r,error}=await sb.rpc('register_donor_visit_v15645',{p_identity_type:data.identityType||'thai',p_id_card:data.idCard||'',p_passport_number:data.passportNumber||'',p_nationality:data.nationality||'',p_prefix:data.prefix,p_fname:data.fname,p_lname:data.lname,p_birth:data.birthDate,p_gender:data.gender,p_address:data.address,p_address_line:data.addressLine||'',p_subdistrict:data.subdistrict||'',p_district:data.district||'',p_province:data.province||'',p_postal_code:data.postalCode||'',p_phone:data.phone||'',p_occupation:data.occupation||'',p_donor_id:data.donorId||'',p_last_donation_no:Number.isFinite(Number(data.lastDonationNo))?Number(data.lastDonationNo):0,p_user_agent:ua()}); if(error) throw error; return r;
      }
      if(action==='saveDonorPhoto'){
        const photoData=String(data.photoData||'');
        const {data:r,error}=await sb.rpc('set_donor_photo_identity_v15645',{p_identity_type:data.identityType||'thai',p_id_card:data.idCard||'',p_passport_number:data.passportNumber||'',p_photo_data:photoData,p_user_agent:ua()}); if(error) throw error; return r;
      }
      if(action==='getDonorPhoto'){
        const kind=String(data.identityType||'thai').toLowerCase();
        let q=sb.from('donors').select('photo_data,photo_updated_at,id_card,identity_type,passport_number');
        if(kind==='passport'){
          const pass=String(data.passportNumber||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
          if(!pass) return {status:'success',photoData:'',photoUpdatedAt:''};
          q=q.eq('passport_number',pass);
        }else{
          const cleanId=String(data.idCard||'').replace(/\D/g,'');
          if(!/^\d{13}$/.test(cleanId)) return {status:'success',photoData:'',photoUpdatedAt:''};
          q=q.eq('id_card',cleanId);
        }
        const {data:r,error}=await q.maybeSingle(); if(error) throw error;
        return {status:'success',photoData:r?.photo_data||'',photoUpdatedAt:r?.photo_updated_at||'',identityKey:r?.id_card||''};
      }
      if(action==='getRecentVisits'||action==='getRecentVisitsFast') return await visitsForDate(params.targetDate);
      if(action==='getDonorsByIds'){
        const ids=(data.ids||[]).slice(0,50); const {data:rows,error}=await sb.from('donors').select('*').in('id_card',ids); if(error) throw error;
        return {status:'success',donors:(rows||[]).map(d=>({identityKey:d.id_card,identityType:d.identity_type||((d.id_card||'').startsWith('LEGACY:')?'legacy':'thai'),idCard:(d.identity_type==='passport'?'':d.id_card),passportNumber:d.passport_number||'',nationality:d.nationality||'',prefix:d.prefix,fname:d.fname,lname:d.lname,birth:d.birth,gender:d.gender,addressLine:d.address_line||'',subdistrict:cleanArea(d.subdistrict,'subdistrict'),district:cleanArea(d.district,'district'),province:cleanArea(d.province,'province'),postalCode:d.postal_code||'',address:joinAddressParts(d)||d.address||'',phone:d.phone,occupation:d.occupation||'',photoData:d.photo_data||'',photoUpdatedAt:d.photo_updated_at||''}))};
      }
      if(action==='saveScreeningResult'){
        const sc=data && Object.keys(data).length?data:parse(params.data);
        const bagLot=sc.status==='ผ่าน'?String(sc.bagLot||'').trim():'';
        if(sc.status==='ผ่าน' && !bagLot) return {status:'error',message:'กรุณายิง Barcode Bag Lot ก่อนบันทึก'};
        const {data:lotResult,error:lotError}=await sb.rpc('set_visit_bag_lot',{p_dn:params.dn,p_bag_lot:bagLot,p_user_agent:ua()});
        if(lotError) throw lotError;
        if(lotResult?.status==='error') return lotResult;
        const {data:r,error}=await sb.rpc('save_screening_result',{p_dn:params.dn,p_type:sc.type||'',p_group:sc.group||'',p_weight:sc.weight||'',p_bp:sc.bp||'',p_pulse:sc.pulse||'',p_temp:sc.temp||'',p_hb:sc.hb||'',p_status:sc.status||'',p_reason:sc.reason||'',p_user_agent:ua()}); if(error) throw error;
        return {...(r||{}),bagLot};
      }
      if(action==='issueCertificateNumber'){
        const {data:r,error}=await sb.rpc('issue_certificate',{p_dn:data.dn,p_name:data.name,p_id_card:data.idCard||'',p_visit_date:data.visitDate,p_remark:data.remark||'',p_user_agent:ua()}); if(error) throw error; return r;
      }
      if(action==='logPrintAction'){
        const {error}=await sb.rpc('write_audit',{p_action:data.printType||'PRINT',p_target_type:'DN',p_target_id:data.dn||'',p_detail:`พิมพ์ ${data.printType||''}${data.bag?` / bag=${data.bag}`:''}${data.certNo?` / cert=${data.certNo}`:''}`,p_user_agent:data.userAgent||ua()}); if(error) throw error; return {status:'success'};
      }
      if(action==='listUsers'){
        const {data:rows,error}=await sb.from('profiles').select('*').order('username'); if(error) throw error;
        return {status:'success',users:(rows||[]).map(p=>({...mapUser(p),active:p.active,lastLogin:thaiTime(p.last_login_at),updatedAt:thaiTime(p.updated_at)}))};
      }
      if(action==='adminSetUserActive'){
        const {data:r,error}=await sb.rpc('admin_set_user_active',{p_username:data.username,p_active:!!data.active,p_user_agent:ua()}); if(error) throw error; return r;
      }
      if(action==='listAuditLogs'){
        let q=sb.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(Math.min(Number(data.limit)||100,500));
        if(data.username) q=q.ilike('username',`%${data.username}%`); if(data.action) q=q.ilike('action',`%${data.action}%`); if(data.date){q=q.gte('created_at',`${data.date}T00:00:00+07:00`).lt('created_at',`${data.date}T23:59:59.999+07:00`);}
        const {data:rows,error}=await q; if(error) throw error;
        return {status:'success',logs:(rows||[]).map(x=>({timestamp:thaiTime(x.created_at),username:x.username,fullName:x.full_name,role:x.role,action:x.action,targetType:x.target_type,targetId:x.target_id,detail:x.detail,userAgent:x.user_agent}))};
      }
      if(action==='ping') return {status:'success',backend:'supabase'};
      throw new Error(`ยังไม่รองรับ action: ${action}`);
    }catch(err){console.error('Supabase action failed',action,err); return {status:'error',message:err?.message||String(err)};}
  }
  async function getDonorHistory(id){const sb=init();const {data,error}=await sb.rpc('get_donor_history_v1563',{p_id_card:id});if(error)throw error;const profile=data||null;if(!profile)return null;try{const {data:d}=await sb.from('donors').select('occupation,photo_data,photo_updated_at').eq('id_card',String(id||'').replace(/\D/g,'')).maybeSingle();if(String(d?.occupation||'').trim())profile.occupation=d.occupation;profile.photoData=d?.photo_data||'';profile.photoUpdatedAt=d?.photo_updated_at||'';}catch{}return profile;}
  async function getDonorByPassport(passport){const sb=init();const pass=String(passport||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!pass)return null;const {data:d,error}=await sb.from('donors').select('*').eq('passport_number',pass).maybeSingle();if(error)throw error;if(!d)return null;const {data:v,error:ve}=await sb.from('visits').select('visit_date,dn,mobile_donor_id,mobile_donation_no,lis_donor_id,lis_donation_no,screening_status,bag_number,blood_group').eq('id_card',d.id_card).order('visit_date',{ascending:false}).limit(30);if(ve)throw ve;return {identityKey:d.id_card,identityType:'passport',idCard:'',passportNumber:d.passport_number||pass,nationality:d.nationality||'',prefix:d.prefix||'',fname:d.fname||'',lname:d.lname||'',birth:d.birth||'',gender:d.gender||'',addressLine:d.address_line||'',subdistrict:cleanArea(d.subdistrict,'subdistrict'),district:cleanArea(d.district,'district'),province:cleanArea(d.province,'province'),postalCode:d.postal_code||'',address:joinAddressParts(d)||d.address||'',phone:d.phone||'',occupation:d.occupation||'',photoData:d.photo_data||'',photoUpdatedAt:d.photo_updated_at||'',donorIds:[...new Set((v||[]).flatMap(x=>[x.lis_donor_id,x.mobile_donor_id]).filter(Boolean))],donorIdsAll:[...new Set((v||[]).flatMap(x=>[x.lis_donor_id,x.mobile_donor_id]).filter(Boolean))],donationHistory:[],mobileVisits:(v||[]).map(x=>({date:x.visit_date,ymd:x.visit_date,donorId:x.lis_donor_id||x.mobile_donor_id||'',donationNo:x.lis_donation_no||x.mobile_donation_no||'',dn:x.dn||'',status:x.screening_status||'',unitNo:x.bag_number||'',group:x.blood_group||''})),alerts:{notes:[],defers:[],seroNat:[]}};}
  function mergeUnique(listA,listB,keyFn){const m=new Map();[...(listA||[]),...(listB||[])].forEach(x=>{const k=keyFn(x||{});if(k)m.set(k,x);});return [...m.values()];}
  function mergeProfiles(oldP,newP){
    if(!oldP) return newP;
    const pick=(n,o)=>String(n??'').trim()?n:o;
    const out={...oldP,...newP};
    ['prefix','fname','lname','birth','gender','address','addressLine','subdistrict','district','province','postalCode','phone','email','occupation','bloodGroupHistory'].forEach(k=>out[k]=pick(newP?.[k],oldP?.[k]));
    out.donorIds=mergeUnique(oldP?.donorIds,newP?.donorIds,x=>String(x));
    out.donorIdsAll=mergeUnique(oldP?.donorIdsAll||oldP?.donorIds,newP?.donorIdsAll||newP?.donorIds,x=>String(x));
    out.donationHistory=mergeUnique(oldP?.donationHistory,newP?.donationHistory,x=>`${x.date||''}|${x.unitNo||''}|${x.component||''}`);
    out.alerts={
      notes:mergeUnique(oldP?.alerts?.notes,newP?.alerts?.notes,x=>`${x.date||''}|${x.note||''}|${x.status||''}`),
      defers:Array.isArray(newP?.alerts?.defers)?newP.alerts.defers:[],
      seroNat:(oldP?.alerts?.seroNat?.length||newP?.alerts?.seroNat?.length)?[{flag:true}]:[]
    };
    return out;
  }
  async function importSnapshot(profiles,summary,onProgress){
    const sb=init();
    const ids=profiles.map(p=>p.idCard).filter(Boolean);
    const oldMap=await getDonorHistories(ids);
    const merged=profiles.map(p=>mergeProfiles(oldMap[p.idCard],p));
    const {data:importId,error:startErr}=await sb.rpc('start_history_import',{p_summary:summary||{}}); if(startErr) throw startErr;
    const donorRows=merged.map(p=>({id_card:p.idCard,prefix:p.prefix||'',fname:p.fname||'',lname:p.lname||'',birth:p.birth||'',gender:p.gender||'',address:p.address||'',address_line:p.addressLine||'',subdistrict:p.subdistrict||'',district:p.district||'',province:p.province||'',postal_code:p.postalCode||'',phone:p.phone||'',email:p.email||'',occupation:p.occupation||'',blood_group_history:p.bloodGroupHistory||''}));
    const snapRows=merged.map(p=>({import_id:importId,id_card:p.idCard,profile:p,has_note:!!p.alerts?.notes?.length,has_defer:!!p.alerts?.defers?.length,has_sero_nat:!!p.alerts?.seroNat?.length}));
    const donorIdRows=[];merged.forEach(p=>(p.donorIds||[]).forEach(d=>donorIdRows.push({donor_id:String(d||'').trim(),id_card:p.idCard,updated_at:new Date().toISOString()})));
    const uniqueDonorIdRows=[...new Map(donorIdRows.filter(x=>x.donor_id&&x.id_card).map(x=>[x.donor_id,x])).values()];
    const batch=100;
    for(let i=0;i<donorRows.length;i+=batch){const {error}=await sb.from('donors').upsert(donorRows.slice(i,i+batch),{onConflict:'id_card'});if(error)throw error;onProgress?.('donors',Math.min(i+batch,donorRows.length),donorRows.length);}
    for(let i=0;i<uniqueDonorIdRows.length;i+=batch){const {error}=await sb.from('donor_id_map').upsert(uniqueDonorIdRows.slice(i,i+batch),{onConflict:'donor_id'});if(error)throw error;}
    for(let i=0;i<snapRows.length;i+=batch){const {error}=await sb.from('donor_history_snapshots').upsert(snapRows.slice(i,i+batch),{onConflict:'import_id,id_card'});if(error)throw error;onProgress?.('history',Math.min(i+batch,snapRows.length),snapRows.length);}
    const {data:finalSummary,error:endErr}=await sb.rpc('complete_history_import',{p_import_id:importId,p_summary:summary||{},p_user_agent:ua()}); if(endErr) throw endErr;
    let reconcile={};
    try{reconcile=await reconcileMobileVisits();}catch(e){console.warn('AI-LIS reconcile failed',e);}
    return {importId,summary:finalSummary?.summary||summary,reconcile};
  }
  async function getHistorySummary(){const sb=init();const {data,error}=await sb.from('history_imports').select('*').eq('active',true).eq('status','complete').order('completed_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data||null;}
  async function getDonorHistories(ids){const sb=init();const clean=[...new Set((ids||[]).map(x=>String(x||'').replace(/\D/g,'')).filter(x=>/^\d{13}$/.test(x)))];if(!clean.length)return {};const imp=await getHistorySummary();if(!imp)return {};const out={};for(let i=0;i<clean.length;i+=100){const {data,error}=await sb.from('donor_history_snapshots').select('id_card,profile').eq('import_id',imp.id).in('id_card',clean.slice(i,i+100));if(error)throw error;(data||[]).forEach(r=>out[r.id_card]=r.profile);}return out;}
  async function searchDonors(query,limit=20){const sb=init();const {data,error}=await sb.rpc('search_donor_history',{p_query:String(query||''),p_limit:Math.max(1,Math.min(Number(limit)||20,50))});if(error)throw error;return Array.isArray(data)?data:[];}
  async function searchDonorsAdvanced(filters={},limit=30){const sb=init();const f=filters||{};const pass=String(f.passport||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(pass){const p=await getDonorByPassport(pass);if(!p)return[];const matches=(key,val)=>!String(val||'').trim()||String(key||'').toLowerCase().includes(String(val||'').trim().toLowerCase());if(!matches(p.fname,f.fname)||!matches(p.lname,f.lname)||!matches(p.phone,f.phone)||!(p.donorIds||[]).some(x=>matches(x,f.donorId))&&String(f.donorId||'').trim())return[];return [{id_card:p.identityKey,profile:p}];}const {data,error}=await sb.rpc('search_donor_history_advanced_v1563',{p_id_card:String(f.idCard||''),p_donor_id:String(f.donorId||''),p_fname:String(f.fname||''),p_lname:String(f.lname||''),p_phone:String(f.phone||''),p_dn:String(f.dn||''),p_bag_number:String(f.bag||''),p_visit_date:f.visitDate||null,p_limit:Math.max(1,Math.min(Number(limit)||30,50))});if(error)throw error;return Array.isArray(data)?data:[];}
  async function getImportedDonationsForDate(date){const sb=init();const d=String(date||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return[];const {data,error}=await sb.rpc('get_imported_donations_for_date',{p_date:d});if(error)throw error;return (data||[]).map(r=>({dn:'',donorId:r.donor_id||'',idCard:r.id_card||'',prefix:r.prefix||'',fname:r.fname||'',lname:r.lname||'',name:`${r.prefix||''}${r.fname||''} ${r.lname||''}`.trim(),birth:r.birth||'-',gender:r.gender||'-',address:r.address||'-',phone:r.phone||'-',bag:r.bag_number||'-',status:'ข้อมูลจาก AI-LIS',reason:'',type:r.component||'',group:r.blood_group||'',weight:'',bp:'',pulse:'',temp:'',hb:'',saveTime:r.donation_date||'',donationNo:r.donation_no||'',source:'lis-import'}));}
  async function resolveDonorIds(ids){const sb=init();const clean=[...new Set((ids||[]).map(x=>String(x||'').trim()).filter(Boolean))];if(!clean.length)return {};const out={};for(let i=0;i<clean.length;i+=500){const {data,error}=await sb.rpc('resolve_donor_ids',{p_ids:clean.slice(i,i+500)});if(error)throw error;Object.assign(out,data||{});}return out;}
  async function setOutreachEvent({eventDate,unitName}){const sb=init();const {data,error}=await sb.rpc('set_outreach_event',{p_event_date:eventDate,p_unit_name:unitName,p_user_agent:ua()});if(error)throw error;return data||{};}
  async function getOutreachEvent(eventDate){const sb=init();const {data,error}=await sb.rpc('get_outreach_event',{p_event_date:eventDate});if(error)throw error;return data||{};}
  async function importLegacyVisits(rows,onProgress){const sb=init();const src=Array.isArray(rows)?rows:[];let total={inserted:0,merged:0,legacyIdentity:0,invalid:0,conflicts:0};const batch=50;for(let i=0;i<src.length;i+=batch){const {data,error}=await sb.rpc('admin_import_legacy_visits',{p_rows:src.slice(i,i+batch),p_user_agent:ua()});if(error)throw error;['inserted','merged','legacyIdentity','invalid','conflicts'].forEach(k=>total[k]+=Number(data?.[k]||0));onProgress?.(Math.min(i+batch,src.length),src.length,total);}return {status:'success',...total};}
  async function reconcileMobileVisits(){const sb=init();const {data,error}=await sb.rpc('reconcile_mobile_visits_from_active_history',{p_user_agent:ua()});if(error)throw error;return data||{};}
  async function releaseExpiredOutreachBags(){const sb=init();const {data,error}=await sb.rpc('release_expired_outreach_bags',{p_user_agent:ua()});if(error)throw error;return data||{};}
  async function createBagRange({unitName,outreachDate,startNumber,endNumber}){const sb=init();await releaseExpiredOutreachBags();const {data,error}=await sb.rpc('admin_create_bag_range_v15616',{p_unit_name:unitName,p_outreach_date:outreachDate,p_start_number:startNumber,p_end_number:endNumber,p_user_agent:ua()});if(error)throw error;return {status:data?.status||'success',unitName:data?.unitName||data?.unit_name||unitName,outreachDate:data?.outreachDate||data?.outreach_date||outreachDate,startNumber:data?.startNumber||data?.start_number||startNumber,endNumber:data?.endNumber||data?.end_number||endNumber,count:Number(data?.count||0),batchId:data?.batchId||data?.batch_id||''};}
  async function getBagBatchStatus(outreachDate){
    const sb=init(),date=String(outreachDate||'').trim();if(!date)return [];
    try{await releaseExpiredOutreachBags();}catch(e){console.warn('release expired outreach bags failed',e);}
    const {data:batches,error:be}=await sb.from('outreach_bag_batches').select('id,outreach_date,unit_name,start_number,end_number,item_count,active,created_at').eq('outreach_date',date).order('created_at',{ascending:false});if(be)throw be;
    if(!batches?.length)return [];
    const ids=batches.map(x=>x.id),bags=[];const page=500;
    for(let from=0;;from+=page){const {data,error}=await sb.from('bag_inventory').select('bag_number,status,dn_ref,used_at,batch_id').in('batch_id',ids).order('bag_number',{ascending:true}).range(from,from+page-1);if(error)throw error;bags.push(...(data||[]));if(!data||data.length<page)break;}
    return batches.map(b=>{const rows=bags.filter(x=>x.batch_id===b.id),used=rows.filter(x=>x.status==='Used'),available=rows.filter(x=>x.status==='Available'),disabled=rows.filter(x=>x.status==='Disabled'),returned=Math.max(0,Number(b.item_count||0)-rows.length);return {...b,bags:rows,used,available,disabled,returned};});
  }
  window.cnmiSupabaseApi={call,client:()=>init(),getDonorHistory,getDonorByPassport,getDonorHistories,importSnapshot,getHistorySummary,searchDonors,searchDonorsAdvanced,getImportedDonationsForDate,resolveDonorIds,setOutreachEvent,getOutreachEvent,importLegacyVisits,reconcileMobileVisits,releaseExpiredOutreachBags,createBagRange,getBagBatchStatus,startRealtime};
})();
