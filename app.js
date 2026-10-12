'use strict';
const $=id=>document.getElementById(id),M=window.ISM,D=window.ISM_DICTIONARY,C=window.ISM_CURRENCIES,E=M.esc,PREFIX='ism145_v2_';
const currencies=C.map(c=>c.id),currencyNames=Object.fromEntries(C.map(c=>[c.id,c.name]));
let docs=[],analysts=[],knownNames=[],code='',records={},current='',toastTimer,saveTimer,saveBusy=false,pending=false,saveBlocked=false;
async function api(path,options={}){return window.ISM_SUPABASE.api(path,options)}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const profile=()=>analysts.find(a=>a.analyst_code===code),assigned=()=>true;
function rec(){return records[current]}
function sourceDoc(){return docs.find(d=>d.doc_id===current&&assigned(d))}
function doc(){return rec()?.document||sourceDoc()}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.remove('hide');toastTimer=setTimeout(()=>$('toast').classList.add('hide'),4500)}
function page(id){['dashboard','collection','setup'].forEach(p=>$(p).classList.toggle('hide',p!==id));document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===id));if(id==='dashboard')renderDash();if(id==='setup')renderSetup()}
function save(edit=false){if(!rec()||saveBlocked)return false;if(edit){rec().status='in progress';rec().updated=new Date().toISOString();rec().audited='';rec().completed=''}pending=true;$('saveStatus').textContent='Saving…';renderState();clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,1500);return true}
async function flushSave(){clearTimeout(saveTimer);if(saveBusy||!pending||saveBlocked)return;saveBusy=true;pending=false;const id=current,r=rec();const snapshot={context:structuredClone(r.context),rows:structuredClone(r.rows),status:r.status,revision:r.revision||0};try{const result=await api('records/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(snapshot)});r.revision=result.revision;r.updated=result.updated;$('saveStatus').textContent='Saved to shared database';const d=docs.find(x=>x.doc_id===id);if(d){d.collection_status=r.status;d.row_count=r.rows.length}renderDash()}catch(error){saveBlocked=error.status===409;pending=true;$('saveStatus').textContent=saveBlocked?'Conflict: reload document':'Save failed: retry';toast(error.message)}finally{saveBusy=false;if(pending&&!saveBlocked)saveTimer=setTimeout(flushSave,700)}}
function field(label,id,value='',type='text',ro=false){return `<label class="form-field">${E(label)}<input class="field ${ro?'readonly':''}" id="${id}" value="${E(value)}" type="${type}" ${ro?'readonly':''}></label>`}
function renderContext(){
 const d=doc()||{},c=rec()?.context||{};
 const keys=['company_id','industry_name','industry_code','form_type','Production Status','report_type','market'];
 $('contextFields').innerHTML=keys.map((key,i)=>field(key,'prefill_'+i,d[key]??'','text',true)).join('')+field('market_tier','marketTier',c.market_tier??d.market_tier??'');
 $('periodFields').innerHTML=field('Date reviewed','dateReviewed',c.date_reviewed||today(),'date')+field('Analyst','analystName',profile()?.analyst_name||'','text',true);
 const link=d.source_url&&/^https?:\/\//i.test(d.source_url)?`<a href="${E(d.source_url)}" target="_blank" rel="noopener noreferrer">Open source presentation ↗</a>`:'';
 $('sourceLink').innerHTML=(d['Ground Truth Status']?`<p class="micro">Ground Truth Status: <strong>${E(d['Ground Truth Status'])}</strong></p>`:'')+link;
 document.querySelectorAll('#contextFields input:not([readonly]), #periodFields input:not([readonly])').forEach(el=>{el.disabled=!rec();el.addEventListener('input',()=>{captureContext();save(true)})});
}
function captureContext(){if(rec())rec().context={...rec().context,market_tier:$('marketTier').value,date_reviewed:$('dateReviewed').value}}

function renderDash(){const all=docs.filter(assigned);const status=d=>records[d.doc_id]?.status||d.collection_status||'in progress';$('countAll').textContent=all.length;$('countProgress').textContent=all.filter(d=>status(d)==='in progress').length;$('countCompleted').textContent=all.filter(d=>status(d)==='completed').length;$('countAudited').textContent=all.filter(d=>status(d)==='audited').length;$('countQuery').textContent=all.filter(d=>status(d)==='query raised').length;$('welcome').textContent=profile()?profile().analyst_name+'’s documents':'Your document queue';const query=$('search').value.toLowerCase(),filter=$('filter').value;let list=all.filter(d=>(d.doc_id+' '+d.company_id+' '+d.industry_name).toLowerCase().includes(query)&&(filter==='all'||filter===status(d)));$('docRows').innerHTML=list.length?list.map(d=>`<tr><td><strong>${E(d.doc_id)}</strong></td><td>${E(d.company_id)}</td><td>${E(d.industry_name)}</td><td>${E(d['Ground Truth Status']||'—')}</td><td>${records[d.doc_id]?.rows.length??d.row_count??0}</td><td><span class="pill ${status(d)==='in progress'?'progress':status(d).replace(' ','-')}">${E(status(d))}</span></td><td><button class="link" data-open="${E(d.doc_id)}">Open →</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">No assigned documents match this view.</td></tr>'}
function renderState(){
 const s=rec();$('currentStatus').textContent=s?.status||'No document';$('currentStatus').className='pill '+(s?.status==='in progress'?'progress':(s?.status||'').replace(' ','-'));
 $('outputHint').textContent=s?`${s.rows.length} collection row${s.rows.length===1?'':'s'} · ${M.headers.length} columns`:'Look up a document to begin.';
 $('trail').textContent=s?.updated?'Last saved '+new Date(s.updated).toLocaleString()+(s.completed?' · Completed '+new Date(s.completed).toLocaleString():'')+(s.audited?' · Audited '+new Date(s.audited).toLocaleString():''):'No saved changes yet.';
 $('audit').disabled=s?.status!=='completed';$('addRow').disabled=!s;['review','saveDraft','complete'].forEach(id=>$(id).disabled=!s);$('qcErrors').textContent='';
}

const rowHeaders=['fiscal_year_end_date','period_end_date','period_length','ms_id','datapoint_name','Master (true/false)','Raw segment name','Normalized segment name','Raw parent name','Normalized parent name','segment_type','datapoint_value','datapoint_unit','datapoint_magnitude','datapoint_value_type','datapoint_frequency','datapoint_currency'];
function cellInput(key,value,i,type='text',hint=''){return `<input class="grid-input" data-key="${key}" value="${E(value)}" type="${type}" aria-label="${E(key.replaceAll('_',' '))} row ${i+1}" ${hint?`placeholder="${E(hint)}"`:''}>`}
function cellSelect(key,value,allowed,i,disabled=false){return `<select class="grid-input" data-key="${key}" aria-label="${E(key.replaceAll('_',' '))} row ${i+1}" ${disabled?'disabled':''}><option value="">—</option>${allowed.map(v=>`<option value="${E(v)}" ${v===value?'selected':''}>${E(v)}</option>`).join('')}</select>`}
function rowErrors(row){return M.validate(doc(),rec()?.context||{},[row],D,currencies)}
function rowMatches(row,query){return [row.ms_id,row.datapoint_name,row.raw_segment,row.normalized_segment,row.raw_parent,row.normalized_parent,row.datapoint_value].join(' ').toLowerCase().includes(query)}
function renderEntries(){
 const r=rec();if(!r){$('entries').innerHTML='<div class="empty">Choose a document, then add a row.</div>';$('gridCount').textContent='0 rows';return}
 const old=$('gridScroll'),x=old?.scrollLeft||0,y=old?.scrollTop||0,query=$('rowSearch').value.trim().toLowerCase(),issuesOnly=$('rowFilter').value==='issues';
 const points=D.filter(d=>d.industry===doc().industry_name).sort((a,b)=>a.data_point_name.localeCompare(b.data_point_name));
 const visible=r.rows.map((row,i)=>({row,i,issues:rowErrors(row)})).filter(({row,issues})=>(!query||rowMatches(row,query))&&(!issuesOnly||issues.length));
 const body=visible.map(({row:v,i,issues})=>{
  const def=M.findDef(D,doc().industry_name,v.ms_id),currency=(def?.unit_currency_factor_flag||'').trim()==='Currency';
  const pointNamed=`<div class="grid-pair"><select class="grid-input" data-key="definition" aria-label="Data point row ${i+1}"><option value="">Choose data point</option>${points.map(p=>`<option value="${E(p.data_point_id)}" ${p.data_point_id===v.ms_id?'selected':''}>${E(p.data_point_name)}</option>`).join('')}</select><button type="button" class="info-button" data-info="${i}" aria-label="Definition for row ${i+1}" aria-expanded="false" ${def?'':'disabled'}>i</button><div class="definition-popover hide" id="definition-${i}" role="note"><strong>${E(v.datapoint_name||'Data point')}</strong><p>${E(def?.data_point_definition||'No definition supplied.')}</p></div></div>`;
  const flag=issues.length?`<span class="row-flag" title="${E(issues.join(' • '))}">${issues.length}</span>`:'';
  const currencyInput=`<div class="grid-pair"><input class="grid-input" data-key="datapoint_currency" list="currencyIdOptions" value="${E(v.datapoint_currency)}" aria-label="Currency ID row ${i+1}" ${currency?'':'disabled'}><button type="button" class="info-button" data-currency-info="${i}" aria-label="Currency name for row ${i+1}" aria-expanded="false" ${v.datapoint_currency?'':'disabled'}>i</button><div class="definition-popover hide" id="currencyName-${i}" role="note">${E(v.datapoint_currency?`${v.datapoint_currency} — ${currencyNames[v.datapoint_currency]||'Unknown ID'}`:'Choose a currency ID.')}</div></div>`;
  return `<tr data-row="${i}" class="${issues.length?'needs-review':''}"><td class="row-num"><strong>${i+1}</strong>${flag}</td>`+
   `<td>${cellInput('fiscal_year_end_date',v.fiscal_year_end_date,i,'date')}</td><td>${cellInput('period_end_date',v.period_end_date,i,'date')}</td>`+
   `<td><div class="period-cell">${cellInput('period_length',v.period_length,i,'text','0')}${cellSelect('period_type',v.period_type,['months','weeks','days'],i)}</div></td>`+
   `<td><input class="grid-input readonly" value="${E(v.ms_id)}" aria-label="ms_id row ${i+1}" readonly></td><td class="point-cell">${pointNamed}</td>`+
   `<td>${cellSelect('master',v.master,['true','false'],i)}</td>`+
   `<td>${cellInput('raw_segment',v.raw_segment,i)}</td><td>${cellInput('normalized_segment',v.normalized_segment,i)}</td>`+
   `<td>${cellInput('raw_parent',v.raw_parent,i)}</td><td>${cellInput('normalized_parent',v.normalized_parent,i)}</td>`+
   `<td>${cellSelect('segment_type',v.segment_type,M.segmentTypes,i)}</td><td>${cellInput('datapoint_value',v.datapoint_value,i)}</td>`+
   `<td>${cellSelect('datapoint_unit',v.datapoint_unit,M.choices(def?.unit),i,!M.choices(def?.unit).length)}</td>`+
   `<td>${cellSelect('datapoint_magnitude',v.datapoint_magnitude,M.choices(def?.magnitude),i,!M.choices(def?.magnitude).length)}</td>`+
   `<td>${cellSelect('datapoint_value_type',v.datapoint_value_type,M.choices(def?.value_types),i,!M.choices(def?.value_types).length)}</td>`+
   `<td>${cellSelect('datapoint_frequency',v.datapoint_frequency,M.choices(def?.frequency_values),i,!M.choices(def?.frequency_values).length)}</td>`+
   `<td>${currencyInput}</td><td class="row-actions"><button class="link" data-duplicate="${i}" title="Duplicate row ${i+1}">Duplicate</button>${i?`<button class="link" data-copy-period="${i}" title="Copy dates and period from row ${i}">Copy period</button>`:''}<button class="link danger-link" data-remove="${i}" title="Remove row ${i+1}">Remove</button></td></tr>`;
 }).join('');
 $('entries').innerHTML=`<div class="grid-scroll" id="gridScroll" role="region" aria-label="Collection rows" tabindex="0"><table class="collection-table"><thead><tr><th class="row-num">#</th>${rowHeaders.map((h,j)=>`<th class="${j===4?'point-col':''}">${E(h)}${j===2?'<small>type in cell</small>':''}</th>`).join('')}<th class="row-actions">Actions</th></tr></thead><tbody>${body||'<tr><td colspan="19" class="empty">No rows match this view. Clear the search or add a row.</td></tr>'}</tbody></table></div><datalist id="currencyIdOptions">${C.map(c=>`<option value="${E(c.id)}" label="${E(c.name)}"></option>`).join('')}</datalist>`;
 $('gridCount').textContent=`${visible.length} of ${r.rows.length} rows`;
 $('gridScroll').scrollLeft=x;$('gridScroll').scrollTop=y;
}
function dateQc(i){const r=rec()?.rows[i],tr=$('entries').querySelector(`[data-row="${i}"]`);if(!r||!tr)return;const issues=rowErrors(r),flag=tr.querySelector('.row-flag');tr.classList.toggle('needs-review',!!issues.length);if(flag){if(issues.length){flag.textContent=issues.length;flag.title=issues.join(' • ')}else flag.remove()}else if(issues.length){const badge=document.createElement('span');badge.className='row-flag';badge.textContent=issues.length;badge.title=issues.join(' • ');tr.querySelector('.row-num').append(badge)}}

async function lookup(id){
 id=(id||$('docId').value).trim();if(!id)return toast('Choose a document from the queue or enter a document/company ID.');
 if(pending||saveBusy)await flushSave();if(pending||saveBusy)return toast('Save the current document before switching.');
 try{const result=await api('records/'+encodeURIComponent(id));if(result.matches){toast('Several documents use this company ID. Choose the document ID from the queue.');page('dashboard');$('search').value=id;renderDash();return}
 const d=result.document;current=d.doc_id;$('docId').value=current;
 records[current]=result.record||{document:d,context:{market_tier:d.market_tier||'',date_reviewed:today()},rows:[],status:'in progress',revision:0,updated:''};
 records[current].document=d;saveBlocked=false;
 $('sourceHint').textContent='Document fields and market tier come from Document sample. Market tier can be edited for this collection. Production Status and report type were not supplied and remain blank.';
 renderContext();renderEntries();renderState();page('collection');
 }catch(error){toast(error.message)}
}

function errors(){if(!rec())return ['Look up a document first.'];captureContext();const errs=M.validate(doc(),rec().context,rec().rows,D,currencies);if(!profile()?.analyst_name)errs.push('Analyst name is missing from the login directory.');if(!rec().context.date_reviewed)errs.push('Collect Date reviewed.');return errs}
function check(){let list=errors();$('qcErrors').innerHTML=list.length?'<b>Resolve before copying or completing</b><ul>'+list.map(v=>'<li>'+E(v)+'</li>').join('')+'</ul>':'';if(list.length)toast(list[0]);return !list.length}
function matrix(){return rec().rows.map(r=>M.cells(doc(),rec().context,r,profile().analyst_name))}
function showReview(){
 if(!rec())return;captureContext();const rows=rec().rows,issues=errors(),values=matrix();
 $('reviewSummary').textContent=`${rows.length} reported value${rows.length===1?'':'s'} · ${new Set(rows.map(r=>r.ms_id).filter(Boolean)).size} data point${new Set(rows.map(r=>r.ms_id).filter(Boolean)).size===1?'':'s'} · ${issues.length} issue${issues.length===1?'':'s'}`;
 const summary=['#','Period end','Data point','Master','Segment','Parent','Segment type','Value','Unit','Frequency'];
 $('reviewTable').innerHTML='<table><thead><tr>'+summary.map(x=>'<th>'+E(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map((r,i)=>'<tr>'+[i+1,r.period_end_date,r.datapoint_name,r.master,r.normalized_segment||r.raw_segment,r.normalized_parent||r.raw_parent,r.segment_type,r.datapoint_value,r.datapoint_unit,r.datapoint_frequency].map(v=>'<td>'+E(v||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 $('previewTable').innerHTML='<table><thead><tr>'+M.headers.map((h,i)=>'<th>'+E((i+1)+'. '+h)+'</th>').join('')+'</tr></thead><tbody>'+values.map(row=>'<tr>'+row.map(v=>'<td>'+E(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 $('reviewErrors').innerHTML=issues.length?'<b>Resolve before copying</b><ul>'+issues.map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'All required fields pass the current checks. Review the segment relationships against the source document.';
 $('copy').disabled=!!issues.length;$('manualCopy').value=issues.length?'':M.tsv(values);$('previewModal').classList.remove('hide');
}
async function copy(){if(!rec()||errors().length){showReview();return}const values=matrix(),text=M.tsv(values);try{if(window.ClipboardItem&&navigator.clipboard?.write){await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([M.html(values)],{type:'text/html'})})])}else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text)}else throw Error('Clipboard API unavailable');toast(`Copied ${values.length} reviewed row(s), 28 columns each.`)}catch{$('manualCopy').focus();$('manualCopy').select();try{if(document.execCommand('copy'))toast('Copied rows using browser fallback.');else toast('Select and copy the displayed text manually.')}catch{toast('Select and copy the displayed text manually.')}}}

function renderSetup(){$('nameList').textContent=knownNames.length?knownNames.join(' · '):(profile()?.analyst_name||'');$('docsCount').textContent=`${docs.length} assigned documents in Document sample.`;$('analystsCount').textContent=profile()?`Signed in as ${profile().analyst_name} · code ${code}.`: 'Access awaiting administrator approval.';$('currencyCount').textContent=`${C.length} currency IDs and names loaded from the supplied list.`}
async function adminRequests(){try{const data=await api('admin/requests');$('requestRows').innerHTML=data.requests.length?'<table><thead><tr><th>Email</th><th>Requested analyst</th><th>Action</th></tr></thead><tbody>'+data.requests.map(r=>`<tr><td>${E(r.email||r.user_id)}</td><td>${E(r.analyst_name)}</td><td><button class="btn ghost" data-approve="${E(r.user_id)}" data-name="${E(r.analyst_name)}">Approve</button></td></tr>`).join('')+'</tbody></table>':'<p class="micro">No pending requests.</p>'}catch(error){toast(error.message)}}
function renderLogin(request){$('loginHint').textContent=request?`Access requested for ${request.analyst_name}. Waiting for administrator approval.`:'Your signed-in account will be reviewed before its analyst code is activated.';if(request)$('newName').value=request.analyst_name}
async function bootstrap(){try{if(!window.ISM_SUPABASE.signedIn()){code='';analysts=[];docs=[];$('signInFields').classList.remove('hide');$('requestFields').classList.add('hide');$('loginModal').classList.remove('hide');return}const data=await api('bootstrap');knownNames=data.names||[];$('adminPanel').classList.toggle('hide',!data.is_admin);if(data.user){code=data.user.analyst_code;analysts=[data.user];docs=data.documents||[];$('switchUser').textContent=data.user.analyst_name+' · '+code;$('loginModal').classList.add('hide')}else{code='';analysts=[];docs=[];$('signInFields').classList.add('hide');$('requestFields').classList.remove('hide');$('loginModal').classList.toggle('hide',!!data.is_admin);if(data.is_admin)page('setup')}
 $('newName').innerHTML='<option value="">Choose your name</option>'+knownNames.map(n=>'<option value="'+E(n)+'">'+E(n)+'</option>').join('');renderLogin(data.request);renderContext();renderEntries();renderState();renderSetup();renderDash();if(data.is_admin)adminRequests()}catch(error){$('loginHint').textContent=error.message;toast(error.message);if(!window.ISM_SUPABASE.signedIn())$('signInFields').classList.remove('hide')}}
async function login(){const name=$('newName').value;if(!knownNames.includes(name)){toast('Choose your name from the current batch.');return}try{await api('request-access',{method:'POST',body:JSON.stringify({analyst_name:name})});await bootstrap()}catch(error){toast(error.message)}}
$('entries').addEventListener('input',event=>{
 const el=event.target,key=el.dataset.key;if(!key||el.tagName==='SELECT')return;
 const wrapper=el.closest('[data-row]'),i=Number(wrapper.dataset.row),r=rec().rows[i];
 if(key==='period_length')el.value=el.value.replace(/[^0-9]/g,'');r[key]=el.value;
 r.overrides=r.overrides||{};if(key==='normalized_segment'||key==='normalized_parent')r.overrides[key]=true;
 for(const[raw,norm]of [['raw_segment','normalized_segment'],['raw_parent','normalized_parent']])if(key===raw&&!r.overrides[norm]){r[norm]=M.normalize(r[raw]);wrapper.querySelector(`[data-key="${norm}"]`).value=r[norm]}
 if(key==='datapoint_currency'){const button=wrapper.querySelector('[data-currency-info]'),note=$('currencyName-'+i);button.disabled=!el.value;button.setAttribute('aria-expanded','false');note.classList.add('hide');note.textContent=el.value?`${el.value} — ${currencyNames[el.value]||'Unknown ID'}`:'Choose a currency ID.'}
 dateQc(i);save(true);
});
$('entries').addEventListener('change',event=>{
 const el=event.target,key=el.dataset.key;if(!key||el.tagName!=='SELECT')return;
 const i=Number(el.closest('[data-row]').dataset.row),r=rec().rows[i];
 if(key==='definition'){const def=M.findDef(D,doc().industry_name,el.value),replacement=M.entry(def,r);for(const k of ['master','raw_segment','normalized_segment','raw_parent','normalized_parent','segment_type','datapoint_value','overrides'])replacement[k]=r[k];rec().rows[i]=replacement;renderEntries();$('entries').querySelector(`[data-row="${i}"] [data-key="definition"]`)?.focus({preventScroll:true})}
 else{r[key]=el.value;dateQc(i)}
 save(true);
});
$('entries').addEventListener('keydown',event=>{const el=event.target,key=el.dataset?.key;if(event.key!=='Enter'||!key||el.tagName!=='INPUT'||el.type==='date')return;event.preventDefault();const row=Number(el.closest('[data-row]').dataset.row)+(event.shiftKey?-1:1);$('entries').querySelector(`[data-row="${row}"] [data-key="${key}"]`)?.focus()});
$('entries').addEventListener('focusout',event=>{if($('rowFilter').value!=='issues')return;const tr=event.target.closest('[data-row]');if(!tr)return;setTimeout(()=>{if(document.activeElement?.closest('[data-row]')===tr)return;if(!rowErrors(rec().rows[Number(tr.dataset.row)]).length)renderEntries()},0)});
$('entries').addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.info!==undefined){const pop=$('definition-'+b.dataset.info),opening=pop.classList.contains('hide');document.querySelectorAll('.definition-popover').forEach(x=>x.classList.add('hide'));document.querySelectorAll('.info-button').forEach(x=>x.setAttribute('aria-expanded','false'));pop.classList.toggle('hide',!opening);b.setAttribute('aria-expanded',String(opening));return}
 if(b.dataset.currencyInfo!==undefined){const pop=$('currencyName-'+b.dataset.currencyInfo),opening=pop.classList.contains('hide');document.querySelectorAll('.definition-popover').forEach(x=>x.classList.add('hide'));document.querySelectorAll('.info-button').forEach(x=>x.setAttribute('aria-expanded','false'));pop.classList.toggle('hide',!opening);b.setAttribute('aria-expanded',String(opening));return}
 if(b.dataset.duplicate!==undefined){const i=Number(b.dataset.duplicate);rec().rows.splice(i+1,0,M.duplicateRow(rec().rows[i]));$('rowSearch').value='';$('rowFilter').value='all';save(true);renderEntries();const duplicate=$('entries').querySelector(`[data-row="${i+1}"]`);duplicate?.scrollIntoView({behavior:'smooth',block:'center'});duplicate?.querySelector('[data-key="datapoint_value"]')?.focus({preventScroll:true});toast(`Row ${i+1} duplicated below. Its dates and all collection fields can be edited independently.`);return}
 if(b.dataset.copyPeriod!==undefined){const i=Number(b.dataset.copyPeriod),previous=rec().rows[i-1],row=rec().rows[i];for(const key of ['fiscal_year_end_date','period_end_date','period_length','period_type'])row[key]=previous[key]||'';save(true);renderEntries();toast('Dates and period settings copied from the prior row.');return}
 if(b.dataset.remove!==undefined){if(!confirm('Remove this collection row?'))return;rec().rows.splice(Number(b.dataset.remove),1)}
 else return;
 save(true);renderEntries();
});
$('addRow').onclick=()=>{if(!rec()){toast('Look up a document first.');return}rec().rows.push(M.entry(null,rec().rows.at(-1)));$('rowSearch').value='';$('rowFilter').value='all';save(true);renderEntries();const row=$('entries').querySelector(`[data-row="${rec().rows.length-1}"]`);row?.scrollIntoView({behavior:'smooth',block:'center'});row?.querySelector('[data-key="definition"]')?.focus({preventScroll:true})};

$('docRows').onclick=e=>{let b=e.target.closest('[data-open]');if(b)lookup(b.dataset.open)};document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));$('search').oninput=renderDash;$('filter').onchange=renderDash;$('rowSearch').oninput=renderEntries;$('rowFilter').onchange=renderEntries;$('openDocument').onclick=()=>{page('collection');$('docId').focus()};$('back').onclick=()=>page('dashboard');$('lookup').onclick=()=>lookup();$('docId').onkeydown=e=>{if(e.key==='Enter')lookup()};$('copy').onclick=copy;$('review').onclick=showReview;$('closePreview').onclick=()=>$('previewModal').classList.add('hide');$('selectText').onclick=()=>{$('manualCopy').focus();$('manualCopy').select()};$('saveDraft').onclick=()=>{captureContext();if(save(false))flushSave()};$('complete').onclick=()=>{if(!check())return;rec().status='completed';save(false);flushSave()};$('audit').onclick=()=>{if(rec()?.status!=='completed'||!check())return;rec().status='audited';save(false);flushSave()};$('query').onclick=()=>{if(!rec())return;captureContext();rec().status='query raised';save(false);flushSave()};$('switchUser').onclick=()=>toast('Analyst profile is linked to your signed-in account.');$('login').onclick=login;$('checkAccess').onclick=bootstrap;$('signIn').onclick=async()=>{try{await window.ISM_SUPABASE.signIn($('authEmail').value,$('authPassword').value);$('authPassword').value='';await bootstrap()}catch(error){toast(error.message)}};$('signOut').onclick=$('topSignOut').onclick=async()=>{if(pending||saveBusy)return toast('Wait for the current save before signing out.');await window.ISM_SUPABASE.signOut();location.reload()};$('refreshRequests').onclick=adminRequests;$('requestRows').onclick=async e=>{const b=e.target.closest('[data-approve]');if(!b)return;try{await api('admin/approve',{method:'POST',body:JSON.stringify({user_id:b.dataset.approve,analyst_name:b.dataset.name})});toast('Analyst access approved.');adminRequests()}catch(error){toast(error.message)}};
$('schema').innerHTML=M.headers.map(h=>'<li>'+E(h)+'</li>').join('');$('dictSummary').textContent=D.length+' mappings across '+new Set(D.map(d=>d.industry)).size+' industries.';bootstrap();
window.addEventListener('beforeunload',event=>{if(pending||saveBusy){event.preventDefault();event.returnValue=''}});
