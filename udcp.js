'use strict';

window.ISM_UDCP = {
  create({ root, request, dictionary, currencies, escape, navigate, annotationUrl, methodologyUrl, draftOwner, flushGT, notify, onStatusSaved }) {
    const esc = value => escape(value ?? '');
    const fields = [
      ['end','Period End Date','date'], ['fiscal','Fiscal Year End','date'],
      ['report','Report Type',['Current','Historical']], ['length','Period Length','number'],
      ['lengthType','Period Length Type',['Months','Weeks','Days']],
      ['type','Period Type',['Annual','Quarter','Semi-Annual','Weeks','Days']],
      ['number','Period Number',['0','1','2','3','4']],
      ['currency','Currency',currencies.map(currency => currency.id)]
    ];
    const attributes = [['aor','AOR'], ['magnitude','Magnitude'], ['frequency','Frequency'], ['valueType','Value Type'], ['unit','Unit']];
    const attributeKeys = {magnitude:'magnitude',frequency:'frequency_values',valueType:'value_types',unit:'unit'};
    const choices = value => [...new Set(String(value ?? '').split('|').map(item => item.trim()).filter(Boolean))];
    let active, data, revision, selected, dirty=false, busy=false, compact=false, qcOpen=false;

    function optionList(options, current) {
      return '<option value=""></option>'+options.map(option => `<option value="${esc(option)}"${option===current?' selected':''}>${esc(option)}</option>`).join('');
    }
    function editor(key, label, type, value) {
      const props=`data-field="${esc(key)}" aria-label="${esc(label)}"`;
      return Array.isArray(type)
        ? `<select ${props}>${optionList(type,String(value??''))}</select>`
        : `<input ${props} type="${type}" value="${esc(value)}"${type==='number'?' min="0" step="1"':''}>`;
    }
    const definition = row => dictionary.find(point => point.industry===active.document.industry_name && point.data_point_id===row.point);
    const rowLabel = row => row.depth
      ? row.aor ?? row.name ?? ''
      : row.aor || definition(row)?.data_point_name || row.point;
    const segmentParents = row => data.metrics.filter(parent => parent.point===row?.point && parent.depth<3);
    const periodLabel = p => [p.report,p.type,p.number!==''&&p.number!=null?`P${p.number}`:'',p.end].filter(Boolean).join(' · ');
    let saveTimer, saving=false, editVersion=0, saveState='idle', saveDetail='';
    const saveLabels={idle:'Ready',pending:'Unsaved',saving:'Saving…',saved:'Saved',error:'Save failed'};
    const missingPeriodFields=()=>data.periods.some(p=>!p.type||!['0','1','2','3','4'].includes(p.number)||((p.type==='Annual')!==(p.number==='0')));
    function status(state,detail=''){
      saveState=state;saveDetail=detail;
      const badge=root.querySelector('.udcp-save-badge');
      if(badge.dataset.state!==state){
        badge.dataset.state=state;
        badge.textContent=saveLabels[state];
      }
      badge.title=detail;
    }
    const collectionStatus = () => data.status || 'in progress';
    const statusLabel = { 'in progress':'In progress', completed:'Completed', junk:'Junk' };
    function refreshCollectionStatus(){
      root.querySelector('.udcp-collection-status').textContent=statusLabel[collectionStatus()];
      root.querySelector('[data-action="complete"]').disabled=collectionStatus()==='completed';
      root.querySelector('[data-action="junk"]').disabled=collectionStatus()==='junk';
    }
    const numberPattern = /^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d*)?|\.\d+)$/;

    function qualityWarnings() {
      const warnings = [];
      const currentEnds = new Set(data.periods.filter(p => p.report === 'Current' && p.end).map(p => p.end));
      for (const period of data.periods) {
        const add = (field, message) => warnings.push({ period, field, message });
        if (!period.end) add('end', 'Period end date is required.');
        if (!period.fiscal) add('fiscal', 'Fiscal year end is required.');
        if (period.end && period.fiscal && period.end > period.fiscal) {
          add('end', 'Period end cannot be later than fiscal year end.');
        }
        if (period.report === 'Current' && period.end && currentEnds.size > 1) {
          add('report', 'Current headers must share one period end date. Use Historical for earlier periods.');
        }
        if (!['Current','Historical'].includes(period.report)) add('report', 'Choose Current or Historical.');
        if (!/^\d+$/.test(String(period.length ?? '')) || Number(period.length)>365) {
          add('length', 'Enter a whole-number period length from 0 to 365.');
        }
        if (!period.lengthType) add('lengthType', 'Choose a period length type.');
        if (!period.type) add('type', 'Choose a period type.');
        if (!['0','1','2','3','4'].includes(period.number)) add('number', 'Choose a period number.');
        else if (period.type && (period.type === 'Annual') !== (period.number === '0')) {
          add('number', 'Use period number 0 for Annual and 1–4 for other period types.');
        }
      }
      for (const row of data.metrics) {
        for (const period of data.periods) {
          const raw = String(row.values[period.id] ?? '');
          const value = raw.trim();
          if (!value) {
            if (row.depth) warnings.push({ row, period, field:'value:'+period.id, message:'Enter a value for this segment.' });
            continue;
          }
          const add = message => warnings.push({ row, period, field:'value:'+period.id, message });
          if (/\s/.test(raw)) add('The value contains whitespace.');
          if (!numberPattern.test(value)) add('Enter a numeric value. Commas may be used as digit separators.');
          else if (Number(value.replaceAll(',','')) === 0) add('Verify the zero value against the source.');
          if (row.depth && (!row.unit || row.unit === '-')) add('Unit is missing for this segment value.');
          if (definition(row)?.unit_currency_factor_flag === 'Currency' && !period.currency &&
              !/^per[\s-]+unit$/i.test(row.unit ?? '')) {
            add('Currency is missing from the reporting period.');
          }
          if (!row.magnitude || row.magnitude === '-') add('Magnitude is missing for this value.');
          if (!row.valueType || row.valueType === '-') add('Value type is missing for this value.');
        }
      }
      return warnings;
    }

    function refreshQualityChecks() {
      const warnings = qualityWarnings();
      const count = root.querySelector('.udcp-qc-count');
      const label = 'Quality Checks ('+warnings.length+')';
      if (count.textContent !== label) count.textContent = label;
      const list = root.querySelector('#udcp-qc-list');
      list.innerHTML = warnings.length ? '<ul>'+warnings.map(({ row, period, field, message }) => {
        const label = row ? [definition(row)?.data_point_name, row.point, row.depth ? rowLabel(row) : '']
          .filter(Boolean).join(' · ') : 'Reporting period';
        const periodName = periodLabel(period) || 'Period '+(data.periods.indexOf(period)+1);
        return '<li><button type="button" data-action="qc-target" data-qc-row="'+esc(row?.id)+
          '" data-qc-period="'+esc(period.id)+'" data-qc-field="'+esc(field)+'"><strong>Warning</strong> '+
          esc(message)+'<small>'+esc(label)+' · '+esc(periodName)+'</small></button></li>';
      }).join('')+'</ul>' : '<p>No warnings</p>';
    }

    function focusWarning(button) {
      const { qcRow, qcPeriod, qcField } = button.dataset;
      const scope = qcRow
        ? '[data-row="'+CSS.escape(qcRow)+'"]'
        : 'td[data-period="'+CSS.escape(qcPeriod)+'"]';
      const field = root.querySelector(scope+' [data-field="'+CSS.escape(qcField)+'"]');
      if (!field) return;
      field.scrollIntoView({ block:'center', inline:'center' });
      field.focus({ preventScroll:true });
    }

    function refreshPeriodHint(){
      root.querySelector('.udcp-period-hint').hidden=!missingPeriodFields();
    }
    const draftKey = () => 'ism145.udcp.draft:'+JSON.stringify([draftOwner(),active.scope,active.document.doc_id]);
    function cacheDraft(){
      try{localStorage.setItem(draftKey(),JSON.stringify({revision,content:data}));}catch{}
    }
    function scheduleSave(){
      clearTimeout(saveTimer);
      saveTimer=setTimeout(saveLatest,800);
    }
    function changed(nextStatus='in progress'){
      data.status=nextStatus;
      refreshCollectionStatus();
      editVersion++;
      dirty=true;
      cacheDraft();
      status(saving?'saving':'pending');
      refreshPeriodHint();
      refreshQualityChecks();
      scheduleSave();
    }
    async function saveLatest(){
      clearTimeout(saveTimer);
      if(!dirty||saving||busy)return;
      if(missingPeriodFields()&&collectionStatus()!=='junk'){
        status('pending');
        return;
      }
      const version=editVersion;
      const content=structuredClone(data);
      saving=true;
      status('saving');
      try{
        const result=await request('save',{scope:active.scope,doc_id:active.document.doc_id,revision,content});
        if(!Number.isInteger(result.revision)||result.revision!==revision+1)throw Error('Save was not confirmed');
        revision=result.revision;
        onStatusSaved(active.document.doc_id,active.scope,content.status||'in progress',content.metrics.length);
        dirty=version!==editVersion;
        if(dirty){
          cacheDraft();
          status('pending');
        }else{
          try{localStorage.removeItem(draftKey());}catch{}
          status('saved','Latest changes saved · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}));
        }
      }catch(error){
        status('error',error.message);
      }finally{
        saving=false;
        if(dirty&&version!==editVersion)scheduleSave();
      }
      return !dirty;
    }

    function render() {
      const scrollers = [...root.querySelectorAll('.udcp-scroll')].map(el => [el.scrollLeft,el.scrollTop]);
      const doc=active.document;
      const metadata=[['Entity info',[['Entity ID',doc.company_id],['Industry',doc.industry_name],['Industry code',doc.industry_code],['Market',doc.market],['Tier',doc.market_tier]]],['Source',[['Document ID',doc.doc_id],['Form type',doc.form_type]]]];
      const pointOptions=dictionary.filter(point=>point.industry===doc.industry_name);
      const annotation=annotationUrl(doc);
      const methodology=methodologyUrl(doc.industry_name);
      const picked=data.metrics.find(row=>row.id===selected);
      root.innerHTML=`
        <header class="udcp-heading"><div><div class="udcp-context">${active.scope==='practice'?'Practice':'Assigned'} · ${esc(doc.doc_id)}</div><h1>${esc(doc.company_name || 'UDCP collection')}</h1><small class="udcp-collection-status"></small></div>
          <span class="udcp-save-badge" role="status" data-state="${saveState}" title="${esc(saveDetail)}">${saveLabels[saveState]}</span><div class="udcp-actions"><button data-action="back" class="btn ghost">← Overview</button>${annotation?`<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${esc(annotation)}">Open annotation ↗</a>`:''}<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${esc(methodology)}">Open methodology ↗</a><button class="btn" data-action="save">Save collection</button><button type="button" class="btn ghost" data-action="complete">Mark as completed</button><button type="button" class="btn ghost danger" data-action="junk">Junk</button></div></header>

        <details class="udcp-panel udcp-meta"><summary>Document metadata</summary><div class="udcp-meta-grid">${metadata.map(([title, entries])=>{
          const populated=entries.filter(([,value])=>value && value!=='-');
          return populated.length?`<section><h3>${title}</h3><dl>${populated.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`:'';
        }).join('')}</div></details>
        <section class="udcp-panel"><div class="udcp-bar"><h2>Reporting periods <small>${data.periods.length}</small></h2><button class="btn ghost" data-action="period">+ Add header</button></div>
        <p class="udcp-period-hint"${missingPeriodFields()?'':' hidden'}>Choose Period Type and Period Number for each header. Use 0 for Annual.</p>
        ${data.periods.length?`<div class="udcp-scroll"><table class="udcp-periods"><thead><tr><th scope="col">Header fields</th>${data.periods.map((p,i)=>`<th scope="col" data-period="${esc(p.id)}"><div class="udcp-period-heading"><span>${esc(periodLabel(p)||'Period '+(i+1))}</span><button type="button" class="link" data-action="duplicate" aria-label="Duplicate header ${i+1}">Duplicate</button><button type="button" class="link" data-action="delete-period" aria-label="Delete header ${i+1}">Delete</button></div></th>`).join('')}</tr></thead><tbody>${fields.map(([key,label,type])=>`<tr><th scope="row">${label}</th>${data.periods.map((p,i)=>`<td data-period="${esc(p.id)}">${editor(key,label+' for period '+(i+1),type,p[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="udcp-empty">Add a reporting period to create the first value column.</p>'}</section>
        <section class="udcp-panel"><div class="udcp-bar"><h2>Industry metrics <small>${data.metrics.length}</small></h2><div class="udcp-actions">
        <button class="btn ghost" data-action="compact">${compact?'Show attributes':'Hide attributes'}</button><button class="btn ghost" data-action="remove-row"${picked?'':' disabled'}>Remove row</button><button class="btn ghost" data-action="segment"${!segmentParents(picked).length?' disabled':''}>+ Add segment</button><button class="btn" data-action="metric"${pointOptions.length?'':' disabled'}>+ Add metric</button></div></div>
        ${data.metrics.length?`<div class="udcp-scroll"><table class="udcp-metrics"><thead><tr><th class="udcp-pin" scope="col">Master</th><th class="udcp-pin" scope="col">Data Point / MSID</th>${compact?'':attributes.map(([,label])=>`<th scope="col">${label}</th>`).join('')}${data.periods.map((p,i)=>`<th scope="col" data-value-period="${esc(p.id)}">${esc(periodLabel(p)||'Period '+(i+1))}</th>`).join('')}</tr></thead><tbody>${data.metrics.map(row=>{
          const point=definition(row);
          return `<tr data-row="${esc(row.id)}" class="${row.id===selected?'udcp-selected':''}"><td><input type="checkbox" aria-label="Master row" disabled${row.depth===0?' checked':''}></td><th scope="row"><button type="button" class="udcp-row-select" style="--depth:${Number(row.depth)||0}" data-action="select"><strong>${esc(point?.data_point_name||row.point)}</strong><small>${esc(row.depth?row.segmentType+' · '+row.point:row.point)}</small></button></th>${compact?'':attributes.map(([key,label])=>`<td>${key==='frequency'&&row.depth===0?'<span aria-label="Frequency does not apply to master rows">—</span>':editor(key,label+' for '+(rowLabel(row)||row.point),key==='aor'?'text':choices(point?.[attributeKeys[key]]),(key==='aor' && row.depth ? rowLabel(row) : row[key]))}</td>`).join('')}${data.periods.map((p,i)=>`<td>${editor('value:'+p.id,'Value for period '+(i+1),'text',row.values[p.id])}</td>`).join('')}</tr>`;
        }).join('')}</tbody></table></div>`:`<p class="udcp-empty">${pointOptions.length?'Add a metric from the industry dictionary.':'No dictionary entries are available for this industry.'}</p>`}
        </section>
        <footer class="udcp-qc">
          <div id="udcp-qc-list"${qcOpen?'':' hidden'}></div>
          <button type="button" class="udcp-qc-toggle" data-action="qc-toggle" aria-controls="udcp-qc-list" aria-expanded="${qcOpen}">
            <span class="udcp-qc-count" aria-live="polite"></span><span class="udcp-qc-chevron" aria-hidden="true"></span>
          </button>
        </footer><dialog class="udcp-dialog" data-editor></dialog>`;
      refreshQualityChecks();
      refreshCollectionStatus();
      root.querySelectorAll('.udcp-scroll').forEach((el,i)=>{if(scrollers[i])[el.scrollLeft,el.scrollTop]=scrollers[i];});
    }

    function showAdd(segment) {
      const dialog=root.querySelector('[data-editor]');
      const picked=data.metrics.find(row=>row.id===selected);
      const parents=segmentParents(picked);
      const defaultParent=parents.includes(picked)?picked:parents[0];
      const options=segment
        ? choices(definition(picked)?.segment_type||'Business|Business Unit|Geography|Product or Services|Department|Hospital|Healthcare Facility Type|Brands or Franchise|Customer Type|Contract Type|Sales or Distribution Channel|Property Type|Model|Other')
        : dictionary.filter(point=>point.industry===active.document.industry_name).sort((a,b)=>a.data_point_name.localeCompare(b.data_point_name));
      dialog.innerHTML=`<form><h2>${segment?'Add segment':'Add metric'}</h2>${segment
        ? `<label>Segment type<select name="type" required>${optionList(options,'')}</select></label><label>Parent name<select name="parent" required>${parents.map(parent=>`<option value="${esc(parent.id)}"${parent===defaultParent?' selected':''}>${esc(rowLabel(parent)||parent.point)} · ${parent.depth?'Layer '+(parent.depth+1):'Master'} · Row ${data.metrics.indexOf(parent)+1}</option>`).join('')}</select></label><label>AOR<input name="aor" required></label><label style="display:flex;align-items:center;gap:.5rem"><input type="checkbox" name="copy" style="width:auto"> Copy parent attributes</label>`
        : `<label>Data point<select name="point" required><option value=""></option>${options.map(point=>`<option value="${esc(point.data_point_id)}">${esc(point.data_point_name)} · ${esc(point.data_point_id)}</option>`).join('')}</select></label>`}
        <div class="udcp-actions"><button type="button" class="btn ghost" data-action="cancel">Cancel</button><button class="btn">Add</button></div></form>`;
      dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();
        const fields=new FormData(event.currentTarget);
        const parent=segment?parents.find(item=>item.id===fields.get('parent')):null;
        const aor=segment?fields.get('aor'):'';
        if(segment&&(!parent||!aor.trim())){event.currentTarget.elements.aor.focus();return;}
        const row={id:crypto.randomUUID(),parent:parent?.id??null,depth:parent?parent.depth+1:0,point:parent?parent.point:fields.get('point'),aor,segmentType:segment?fields.get('type'):'',values:{}};
        if(parent&&fields.has('copy')){
          for(const key of Object.keys(attributeKeys)){
            if(key!=='frequency'||parent.depth>0)row[key]=parent[key]??'';
          }
        }
        let at=segment?data.metrics.indexOf(parent)+1:data.metrics.length;
        while(segment&&at<data.metrics.length&&data.metrics[at].depth>parent.depth)at++;
        data.metrics.splice(at,0,row);
        selected=row.id;changed();render();
      };
      dialog.showModal();
    }

    root.addEventListener('input',event=>{
      const field=event.target.dataset.field;
      if(!field)return;
      const period=event.target.closest('[data-period]')?.dataset.period;
      const rowId=event.target.closest('[data-row]')?.dataset.row;
      const record=period?data.periods.find(p=>p.id===period):data.metrics.find(row=>row.id===rowId);
      const value=event.target.value;
      if(field.startsWith('value:'))record.values[field.slice(6)]=value;
      else if(field!=='frequency'||record.depth!==0)record[field]=value;
      else return;
      changed();
    });
    root.addEventListener('change',event=>{
      const id=event.target.closest('[data-period]')?.dataset.period;
      if(!id)return;
      const period=data.periods.find(item=>item.id===id),label=periodLabel(period)||'Period '+(data.periods.indexOf(period)+1);
      root.querySelector(`th[data-period="${id}"] span`).textContent=label;
      const valueHeader=root.querySelector(`th[data-value-period="${id}"]`);
      if(valueHeader)valueHeader.textContent=label;
    });
    root.addEventListener('click',async event=>{
      const button=event.target.closest('[data-action]');
      if(!button||busy)return;
      const action=button.dataset.action;
      if(action==='qc-toggle'){
        qcOpen=!qcOpen;
        button.setAttribute('aria-expanded',String(qcOpen));
        root.querySelector('#udcp-qc-list').hidden=!qcOpen;
        return;
      }
      if(action==='qc-target'){focusWarning(button);return;}
      if(action==='back'){navigate('dashboard');return;}
      if(action==='cancel'){root.querySelector('[data-editor]').close();return;}
      if(action==='select'){selected=button.closest('[data-row]').dataset.row;
        root.querySelectorAll('[data-row]').forEach(row=>row.classList.toggle('udcp-selected',row.dataset.row===selected));
        root.querySelector('[data-action="remove-row"]').disabled=false;
        root.querySelector('[data-action="segment"]').disabled=!segmentParents(data.metrics.find(row=>row.id===selected)).length;
        return;
      }
      if(action==='remove-row'){
        if(!data.metrics.some(row=>row.id===selected))return;
        const removed=new Set([selected]);
        for(let depth=0;depth<3;depth++){
          for(const row of data.metrics)if(removed.has(row.parent))removed.add(row.id);
        }
        const count=removed.size;
        if(!window.confirm(count===1?'Remove this row and its values?':`Remove this row and its child segments? ${count} rows and their values will be removed.`))return;
        data.metrics=data.metrics.filter(row=>!removed.has(row.id));
        selected=null;
        changed();render();return;
      }
      if(action==='metric'||action==='segment'){showAdd(action==='segment');return;}
      if(action==='compact'){compact=!compact;render();return;}
      if(action==='delete-period'){
        const id=button.closest('[data-period]').dataset.period;
        const hasValues=data.metrics.some(row=>String(row.values[id]??'').length>0);
        if(hasValues&&!window.confirm('Delete this header and its values?'))return;
        data.periods=data.periods.filter(period=>period.id!==id);
        for(const row of data.metrics)delete row.values[id];
        changed();render();return;
      }
      if(action==='period'||action==='duplicate'){
        const source=action==='duplicate'?data.periods.find(p=>p.id===button.closest('[data-period]').dataset.period):null;
        const period={report:'Current',lengthType:'Months',...source,id:crypto.randomUUID()};
        data.periods.splice(source?data.periods.indexOf(source)+1:data.periods.length,0,period);
        changed();render();return;
      }
      if(action==='complete'||action==='junk'){
        if(saving){notify('Wait for the current save to finish, then try again.');return;}
        if(action==='complete'&&missingPeriodFields()){
          notify('Choose a valid Period Type and Period Number before completing.');
          return;
        }
        if(action==='junk'&&!window.confirm('Mark this collection as junk? Its data will be kept.'))return;
        changed(action==='complete'?'completed':'junk');
        const saved=await saveLatest();
        notify(saved?'Collection marked '+collectionStatus()+'.':'Status pending. Check the save indicator and retry if needed.');
        return;
      }
      if(action==='save')await saveLatest();
    });

    return {
      canLeave:()=>!busy&&!saving&&(!dirty||window.confirm('Leave with changes pending? This browser will retain a recovery draft when local storage is available.')),
      clearDirty:()=>{clearTimeout(saveTimer);dirty=false;},
      hasUnsaved:()=>dirty||busy||saving,
      async open(doc_id, scope) {
        if(busy)return;
        const annotationTab=window.open('about:blank','_blank');
        if(annotationTab)annotationTab.opener=null;
        let annotationOpened=false;
        busy=true;
        try{
          if(!await flushGT())return;
          const result=await request('choose',{doc_id,scope,view:'udcp'});
          if(result.view!=='udcp')throw Error('Could not open UDCP for this document.');
          active={scope,document:result.document};data=result.content;revision=result.revision;
          selected=null;dirty=false;compact=false;qcOpen=false;saveState=revision?'saved':'idle';saveDetail='';
          let draft;
          try{draft=JSON.parse(localStorage.getItem(draftKey())||'null');}catch{}
          if(draft?.revision===revision&&draft.content&&window.confirm('Restore unsaved changes from this browser?')){
            data=draft.content;dirty=true;saveState='pending';saveDetail='Recovery draft restored';
          }else if(draft?.content&&draft.revision!==revision){
            saveDetail='Server version loaded. An older browser draft was not applied.';
          }
          render();navigate('udcp');
          const link=annotationUrl(active.document);
          if(link&&annotationTab&&!annotationTab.closed){
            annotationTab.location.replace(link);
            annotationOpened=true;
          }else if(link){root.querySelector('.udcp-heading').title='Use Open annotation if your browser blocked the new tab.';}
        }finally{
          if(annotationTab&&!annotationOpened)annotationTab.close();
          busy=false;
          if(dirty)scheduleSave();
        }
      }
    };
  }
};
