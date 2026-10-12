'use strict';
(() => {
 const config=window.ISM_SUPABASE_CONFIG||{},base=String(config.url||'').replace(/\/$/,''),key=config.publishableKey;
 const storageKey='ism145_supabase_session';
 let session;try{session=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{session=null}
 const configured=()=>/^https:\/\/[^/]+\.supabase\.co$/.test(base)&&key&&!key.startsWith('YOUR-');
 const save=value=>{session=value;value?localStorage.setItem(storageKey,JSON.stringify(value)):localStorage.removeItem(storageKey)};
 async function auth(endpoint,body){if(!configured())throw Error('Supabase is not configured. Set the project URL and publishable key.');const response=await fetch(base+'/auth/v1/'+endpoint,{method:'POST',headers:{'content-type':'application/json',apikey:key},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.msg||data.error_description||data.message||'Sign-in failed');save({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});return data}
 async function token(){if(!session?.access_token)throw Error('Sign in first.');if((session.expires_at||0)<Date.now()/1000+60){if(!session.refresh_token){save(null);throw Error('Session expired. Sign in again.')}await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token})}return session.access_token}
 async function api(path,options={}){
  if(!configured())throw Error('Supabase is not configured. Set the project URL and publishable key.');
  const payload=options.body?JSON.parse(options.body):{};
  const action=path==='bootstrap'?'bootstrap':path==='request-access'?'request-access':path==='admin/requests'?'admin-requests':path==='admin/approve'?'admin-approve':path.startsWith('records/')?(options.method==='PUT'?'save-record':'get-record'):null;
  if(!action)throw Error('Unknown API action.');
  if(path.startsWith('records/'))payload.lookup_id=decodeURIComponent(path.slice(8));
  const response=await fetch(base+'/rest/v1/rpc/collection_api',{method:'POST',headers:{'content-type':'application/json',apikey:key,authorization:'Bearer '+await token()},body:JSON.stringify({p_action:action,p_payload:payload})});
  const data=await response.json();if(!response.ok){const error=Error(data.message||data.error||'Database request failed');error.status=data.code==='40001'?409:response.status;throw error}return data;
 }
 async function signOut(){if(session?.access_token&&configured())try{await fetch(base+'/auth/v1/logout',{method:'POST',headers:{apikey:key,authorization:'Bearer '+session.access_token}})}catch{}save(null)}
 window.ISM_SUPABASE={api,signIn:(email,password)=>auth('token?grant_type=password',{email,password}),signOut,signedIn:()=>!!session?.access_token};
})();
