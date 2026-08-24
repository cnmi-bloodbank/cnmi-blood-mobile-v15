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
    const {data,error}=await sb.from('visits').select('dn,bag_number,id_card,donor_type,weight,bp,pulse,temp,hb,blood_group,screening_status,reason,screened_at,c1,c2,e1,e2,donors!inner(prefix,fname,lname,birth,gender,address,phone)').eq('visit_date',date).order('created_at',{ascending:false});
    if(error) throw error;
    return (data||[]).map(r=>{const d=r.donors||{};return {dn:r.dn,idCard:r.id_card,prefix:d.prefix||'',fname:d.fname||'',lname:d.lname||'',name:`${d.prefix||''}${d.fname||''} ${d.lname||''}`.trim(),birth:d.birth||'-',gender:d.gender||'-',address:d.address||'-',phone:d.phone||'-',bag:r.bag_number||'-',status:r.screening_status||'รอคัดกรอง',reason:r.reason||'',type:r.donor_type||'',group:r.blood_group||'',weight:r.weight||'',bp:r.bp||'',pulse:r.pulse||'',temp:r.temp||'',hb:r.hb||'',saveTime:thaiTime(r.screened_at),c1:r.c1||'',c2:r.c2||'',e1:r.e1||'',e2:r.e2||''};});
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
        const {data:r,error}=await sb.rpc('register_donor_visit',{p_id_card:data.idCard,p_prefix:data.prefix,p_fname:data.fname,p_lname:data.lname,p_birth:data.birthDate,p_gender:data.gender,p_address:data.address,p_phone:data.phone||'',p_user_agent:ua()}); if(error) throw error; return r;
      }
      if(action==='getRecentVisits'||action==='getRecentVisitsFast') return await visitsForDate(params.targetDate);
      if(action==='getDonorsByIds'){
        const ids=(data.ids||[]).slice(0,50); const {data:rows,error}=await sb.from('donors').select('*').in('id_card',ids); if(error) throw error;
        return {status:'success',donors:(rows||[]).map(d=>({idCard:d.id_card,prefix:d.prefix,fname:d.fname,lname:d.lname,birth:d.birth,gender:d.gender,address:d.address,phone:d.phone}))};
      }
      if(action==='saveScreeningResult'){
        const sc=data && Object.keys(data).length?data:parse(params.data); const {data:r,error}=await sb.rpc('save_screening_result',{p_dn:params.dn,p_type:sc.type||'',p_group:sc.group||'',p_weight:sc.weight||'',p_bp:sc.bp||'',p_pulse:sc.pulse||'',p_temp:sc.temp||'',p_hb:sc.hb||'',p_status:sc.status||'',p_reason:sc.reason||'',p_user_agent:ua()}); if(error) throw error; return r;
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
  async function getDonorHistory(id){const sb=init();const {data,error}=await sb.rpc('get_donor_history',{p_id_card:id});if(error)throw error;return data||null;}
  function mergeUnique(listA,listB,keyFn){const m=new Map();[...(listA||[]),...(listB||[])].forEach(x=>{const k=keyFn(x||{});if(k)m.set(k,x);});return [...m.values()];}
  function mergeProfiles(oldP,newP){
    if(!oldP) return newP;
    const pick=(n,o)=>String(n??'').trim()?n:o;
    const out={...oldP,...newP};
    ['prefix','fname','lname','birth','gender','address','addressLine','subdistrict','district','province','postalCode','phone','email','occupation','bloodGroupHistory'].forEach(k=>out[k]=pick(newP?.[k],oldP?.[k]));
    out.donorIds=mergeUnique(oldP?.donorIds,newP?.donorIds,x=>String(x));
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
    const batch=100;
    for(let i=0;i<donorRows.length;i+=batch){const {error}=await sb.from('donors').upsert(donorRows.slice(i,i+batch),{onConflict:'id_card'});if(error)throw error;onProgress?.('donors',Math.min(i+batch,donorRows.length),donorRows.length);}
    for(let i=0;i<snapRows.length;i+=batch){const {error}=await sb.from('donor_history_snapshots').upsert(snapRows.slice(i,i+batch),{onConflict:'import_id,id_card'});if(error)throw error;onProgress?.('history',Math.min(i+batch,snapRows.length),snapRows.length);}
    const {data:finalSummary,error:endErr}=await sb.rpc('complete_history_import',{p_import_id:importId,p_summary:summary||{},p_user_agent:ua()}); if(endErr) throw endErr;
    return {importId,summary:finalSummary?.summary||summary};
  }
  async function getHistorySummary(){const sb=init();const {data,error}=await sb.from('history_imports').select('*').eq('active',true).eq('status','complete').order('completed_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data||null;}
  async function getDonorHistories(ids){const sb=init();const clean=[...new Set((ids||[]).map(x=>String(x||'').replace(/\D/g,'')).filter(x=>/^\d{13}$/.test(x)))];if(!clean.length)return {};const imp=await getHistorySummary();if(!imp)return {};const out={};for(let i=0;i<clean.length;i+=100){const {data,error}=await sb.from('donor_history_snapshots').select('id_card,profile').eq('import_id',imp.id).in('id_card',clean.slice(i,i+100));if(error)throw error;(data||[]).forEach(r=>out[r.id_card]=r.profile);}return out;}
  async function searchDonors(query,limit=20){const sb=init();const {data,error}=await sb.rpc('search_donor_history',{p_query:String(query||''),p_limit:Math.max(1,Math.min(Number(limit)||20,50))});if(error)throw error;return Array.isArray(data)?data:[];}
  async function createBagRange({unitName,outreachDate,startNumber,endNumber}){const sb=init();const {data,error}=await sb.rpc('admin_create_bag_range',{p_unit_name:unitName,p_outreach_date:outreachDate,p_start_number:startNumber,p_end_number:endNumber,p_user_agent:ua()});if(error)throw error;return {status:data?.status||'success',unitName:data?.unitName||data?.unit_name||unitName,outreachDate:data?.outreachDate||data?.outreach_date||outreachDate,startNumber:data?.startNumber||data?.start_number||startNumber,endNumber:data?.endNumber||data?.end_number||endNumber,count:Number(data?.count||0)};}
  window.cnmiSupabaseApi={call,client:()=>init(),getDonorHistory,getDonorHistories,importSnapshot,getHistorySummary,searchDonors,createBagRange,startRealtime};
})();
