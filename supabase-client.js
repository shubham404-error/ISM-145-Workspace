'use strict';
(() => {
 const config=window.ISM_SUPABASE_CONFIG||{},base=String(config.url||'').replace(/\/$/,''),key=config.publishableKey;
 const storageKey='ism145_supabase_session';
 let session;try{session=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{session=null}
 const codeKey='ism145_code_session';let codeSession;try{codeSession=JSON.parse(localStorage.getItem(codeKey)||'null')}catch{codeSession=null}
 const configured=()=>/^https:\/\/[^/]+\.supabase\.co$/.test(base)&&key&&!key.startsWith('YOUR-');
 const save=value=>{session=value;value?localStorage.setItem(storageKey,JSON.stringify(value)):localStorage.removeItem(storageKey)};
 const saveCode=value=>{codeSession=value;value?localStorage.setItem(codeKey,JSON.stringify(value)):localStorage.removeItem(codeKey)};
 const callback=new URLSearchParams(window.location?.hash?.slice(1)||'');
 if(callback.has('access_token')&&callback.has('refresh_token')){
  save({access_token:callback.get('access_token'),refresh_token:callback.get('refresh_token'),
   expires_in:Number(callback.get('expires_in'))||3600,
   expires_at:Math.floor(Date.now()/1000)+(Number(callback.get('expires_in'))||3600)});
  window.history?.replaceState(null,'',window.location.pathname+window.location.search);
 }
 async function auth(endpoint,body){if(!configured())throw Error('Supabase is not configured. Set the project URL and publishable key.');const response=await fetch(base+'/auth/v1/'+endpoint,{method:'POST',headers:{'content-type':'application/json',apikey:key},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.msg||data.error_description||data.message||'Sign-in failed');save({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});return data}
 async function token(){if(!session?.access_token)throw Error('Sign in first.');if((session.expires_at||0)<Date.now()/1000+60){if(!session.refresh_token){save(null);throw Error('Session expired. Sign in again.')}await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token})}return session.access_token}
 async function codeRequest(action,payload={}){if(!configured())throw Error('Supabase is not configured.');const response=await fetch(base+'/rest/v1/rpc/code_api',{method:'POST',headers:{'content-type':'application/json',apikey:key},body:JSON.stringify({p_action:action,p_payload:{...payload,...(codeSession?{session_token:codeSession.token}:{})}})});const data=await response.json();if(!response.ok||data.error){const e=Error(data.error||data.message||'Code request failed');e.status=data.conflict?409:response.status;throw e}return data}
 async function api(path,options={}){
  if(!configured())throw Error('Supabase is not configured. Set the project URL and publishable key.');
  const payload=options.body?JSON.parse(options.body):{};
  const action=path==='bootstrap'?'bootstrap':path==='request-access'?'request-access':path==='admin/requests'?'admin-requests':path==='admin/approve'?'admin-approve':path.startsWith('records/')?(options.method==='PUT'?'save-record':'get-record'):null;
  const workspace=path==='auto-request'?'auto-request':path==='admin/documents'?'admin-documents':path==='admin/import'?'admin-import':path==='admin/assign'?'admin-assign':path==='admin/time-report'?'admin-time-report':path.startsWith('timer/')?'timer-'+path.slice(6):null;
  if(!action&&!workspace)throw Error('Unknown API action.');
  if(path.startsWith('records/'))payload.lookup_id=decodeURIComponent(path.slice(8));
  if(codeSession){if(workspace&&workspace.startsWith('admin-'))throw Error('Administrator access required');return codeRequest(workspace||action,payload)}
  const response=await fetch(base+'/rest/v1/rpc/'+(workspace?'workspace_api':'collection_api'),{method:'POST',headers:{'content-type':'application/json',apikey:key,authorization:'Bearer '+await token()},body:JSON.stringify({p_action:workspace||action,p_payload:payload})});
  const data=await response.json();if(!response.ok){const error=Error(data.message||data.error||'Database request failed');error.status=data.code==='40001'?409:response.status;throw error}return data;
 }
 async function signOut(){if(codeSession){try{await codeRequest('logout')}catch{}saveCode(null)}if(session?.access_token&&configured())try{await fetch(base+'/auth/v1/logout',{method:'POST',headers:{apikey:key,authorization:'Bearer '+session.access_token}})}catch{}save(null)}
 async function registrationNames(){if(!configured())throw Error('Supabase is not configured.');const response=await fetch(base+'/rest/v1/rpc/registration_names',{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw Error(data.message||'Could not load analyst names');return data}
 async function codeLogin(name,code){const data=await codeRequest('login',{analyst_name:name,analyst_code:code});save(null);saveCode({token:data.token,expires_at:data.expires_at});return data}
 async function adminSignIn(email,password){saveCode(null);return auth('token?grant_type=password',{email,password})}
 window.ISM_SUPABASE={api,registrationNames,codeLogin,signIn:adminSignIn,signOut,signedIn:()=>!!codeSession||!!session?.access_token,mode:()=>codeSession?'analyst':session?.access_token?'admin':'none'};
})();
