'use strict';

window.ISM_UDCP = {
  create({ root, chooser, request, dictionary, currencies, escape, navigate, openGT, annotationUrl, flushGT }) {
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
    let active, data, revision, selected, dirty=false, busy=false, compact=false;

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
    const periodLabel = p => [p.report,p.type,p.number!==''&&p.number!=null?`P${p.number}`:'',p.end].filter(Boolean).join(' · ');
    const status = message => { root.querySelector('[role="status"]').textContent=message; };

    function render() {
      const scrollers = [...root.querySelectorAll('.udcp-scroll')].map(el => [el.scrollLeft,el.scrollTop]);
      const doc=active.document;
      const metadata=[['Entity info',[['Entity ID',doc.company_id],['Industry',doc.industry_name],['Industry code',doc.industry_code],['Market',doc.market],['Tier',doc.market_tier]]],['Source',[['Document ID',doc.doc_id],['Form type',doc.form_type]]]];
      const pointOptions=dictionary.filter(point=>point.industry===doc.industry_name);
      const annotation=annotationUrl(doc);
      const picked=data.metrics.find(row=>row.id===selected);
      root.innerHTML=`
        <header class="udcp-heading"><div><div class="udcp-context">${active.scope==='practice'?'Practice':'Assigned'} · ${esc(doc.doc_id)}</div><h1>UDCP collection</h1></div>
          <div class="udcp-actions"><button data-action="back" class="btn ghost">← Overview</button>${annotation?`<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${esc(annotation)}">Open annotation ↗</a>`:''}<button class="btn" data-action="save"${busy?' disabled':''}>Save collection</button></div></header>
        <p class="udcp-state" role="status">${dirty?'Unsaved changes':revision?'Saved to workspace':'Ready to collect'}</p>
        <details class="udcp-panel udcp-meta"><summary>Document metadata</summary><div class="udcp-meta-grid">${metadata.map(([title, entries])=>{
          const populated=entries.filter(([,value])=>value && value!=='-');
          return populated.length?`<section><h3>${title}</h3><dl>${populated.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`:'';
        }).join('')}</div></details>
        <section class="udcp-panel"><div class="udcp-bar"><h2>Reporting periods <small>${data.periods.length}</small></h2><button class="btn ghost" data-action="period">+ Add header</button></div>
        ${data.periods.length?`<div class="udcp-scroll"><table class="udcp-periods"><thead><tr><th scope="col">Header fields</th>${data.periods.map((p,i)=>`<th scope="col" data-period="${esc(p.id)}"><div class="udcp-period-heading"><span>${esc(periodLabel(p)||'Period '+(i+1))}</span><button type="button" class="link" data-action="duplicate" aria-label="Duplicate header ${i+1}">Duplicate</button></div></th>`).join('')}</tr></thead><tbody>${fields.map(([key,label,type])=>`<tr><th scope="row">${label}</th>${data.periods.map((p,i)=>`<td data-period="${esc(p.id)}">${editor(key,label+' for period '+(i+1),type,p[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="udcp-empty">Add a reporting period to create the first value column.</p>'}</section>
        <section class="udcp-panel"><div class="udcp-bar"><h2>Industry metrics <small>${data.metrics.length}</small></h2><div class="udcp-actions">
        <button class="btn ghost" data-action="compact">${compact?'Show attributes':'Hide attributes'}</button><button class="btn ghost" data-action="segment"${!picked||picked.depth>=3?' disabled':''}>+ Add segment</button><button class="btn" data-action="metric"${pointOptions.length?'':' disabled'}>+ Add metric</button></div></div>
        ${data.metrics.length?`<div class="udcp-scroll"><table class="udcp-metrics"><thead><tr><th class="udcp-pin" scope="col">Master</th><th class="udcp-pin" scope="col">Data Point / MSID</th>${compact?'':attributes.map(([,label])=>`<th scope="col">${label}</th>`).join('')}${data.periods.map((p,i)=>`<th scope="col" data-value-period="${esc(p.id)}">${esc(periodLabel(p)||'Period '+(i+1))}</th>`).join('')}</tr></thead><tbody>${data.metrics.map(row=>{
          const point=definition(row);
          return `<tr data-row="${esc(row.id)}" class="${row.id===selected?'udcp-selected':''}"><td><input type="checkbox" aria-label="Master row" disabled${row.depth===0?' checked':''}></td><th scope="row"><button type="button" class="udcp-row-select" style="--depth:${Number(row.depth)||0}" data-action="select"><strong>${esc(row.depth?row.name:point?.data_point_name||row.point)}</strong><small>${esc(row.depth?row.segmentType+' · '+row.point:row.point)}</small></button></th>${compact?'':attributes.map(([key,label])=>`<td>${editor(key,label+' for '+(row.name||row.point),key==='aor'?'text':choices(point?.[attributeKeys[key]]),row[key])}</td>`).join('')}${data.periods.map((p,i)=>`<td>${editor('value:'+p.id,'Value for period '+(i+1),'text',row.values[p.id])}</td>`).join('')}</tr>`;
        }).join('')}</tbody></table></div>`:`<p class="udcp-empty">${pointOptions.length?'Add a metric from the industry dictionary.':'No dictionary entries are available for this industry.'}</p>`}
        </section><dialog class="udcp-dialog" data-editor></dialog>`;
      root.querySelectorAll('.udcp-scroll').forEach((el,i)=>{if(scrollers[i])[el.scrollLeft,el.scrollTop]=scrollers[i];});
    }

    function showAdd(segment) {
      const dialog=root.querySelector('[data-editor]');
      const parent=data.metrics.find(row=>row.id===selected);
      const options=segment
        ? choices(definition(parent)?.segment_type||'Business|Business Unit|Geography|Product or Services|Department|Hospital|Healthcare Facility Type|Brands or Franchise|Customer Type|Contract Type|Sales or Distribution Channel|Property Type|Model|Other')
        : dictionary.filter(point=>point.industry===active.document.industry_name).sort((a,b)=>a.data_point_name.localeCompare(b.data_point_name));
      dialog.innerHTML=`<form><h2>${segment?'Add segment':'Add metric'}</h2>${segment
        ? `<label>Segment type<select name="type" required>${optionList(options,'')}</select></label><label>Segment name<input name="name" required></label>`
        : `<label>Data point<select name="point" required><option value=""></option>${options.map(point=>`<option value="${esc(point.data_point_id)}">${esc(point.data_point_name)} · ${esc(point.data_point_id)}</option>`).join('')}</select></label>`}
        <div class="udcp-actions"><button type="button" class="btn ghost" data-action="cancel">Cancel</button><button class="btn">Add</button></div></form>`;
      dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();
        const fields=new FormData(event.currentTarget);
        const row={id:crypto.randomUUID(),parent:segment?parent.id:null,depth:segment?parent.depth+1:0,point:segment?parent.point:fields.get('point'),name:segment?fields.get('name').trim():'',segmentType:segment?fields.get('type'):'',values:{}};
        if(segment&&!row.name){event.currentTarget.elements.name.focus();return;}
        let at=segment?data.metrics.indexOf(parent)+1:data.metrics.length;
        while(segment&&at<data.metrics.length&&data.metrics[at].depth>parent.depth)at++;
        data.metrics.splice(at,0,row);
        selected=row.id;dirty=true;render();
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
      else record[field]=value;
      dirty=true;status('Unsaved changes');
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
      if(action==='back'){navigate('dashboard');return;}
      if(action==='cancel'){root.querySelector('[data-editor]').close();return;}
      if(action==='select'){selected=button.closest('[data-row]').dataset.row;
        root.querySelectorAll('[data-row]').forEach(row=>row.classList.toggle('udcp-selected',row.dataset.row===selected));
        root.querySelector('[data-action="segment"]').disabled=data.metrics.find(row=>row.id===selected).depth>=3;
        return;
      }
      if(action==='metric'||action==='segment'){showAdd(action==='segment');return;}
      if(action==='compact'){compact=!compact;render();return;}
      if(action==='period'||action==='duplicate'){
        const source=action==='duplicate'?data.periods.find(p=>p.id===button.closest('[data-period]').dataset.period):null;
        const period={report:'Current',lengthType:'Months',...source,id:crypto.randomUUID()};
        data.periods.splice(source?data.periods.indexOf(source)+1:data.periods.length,0,period);
        dirty=true;render();return;
      }
      if(action==='save'){
        if(data.periods.some(p=>!p.type||!['0','1','2','3','4'].includes(p.number)||((p.type==='Annual')!==(p.number==='0')))){
          status('Choose Period Type and Period Number on every header. Use 0 for Annual.');return;
        }
        busy=true;button.disabled=true;root.inert=true;status('Saving…');
        try{
          const result=await request('save',{scope:active.scope,doc_id:active.document.doc_id,revision,content:data});
          revision=result.revision;dirty=false;status('Saved to workspace');
        }catch(error){status(error.message);}
        finally{busy=false;button.disabled=false;root.inert=false;}
      }
    });

    async function launch(result, scope) {
      if(result.view==='gt'){await openGT(result.document.doc_id,scope);return;}
      active={scope,document:result.document};data=result.content;revision=result.revision;
      selected=null;dirty=false;compact=false;render();navigate('udcp');
    }
    return {
      canLeave:()=>!busy&&(!dirty||window.confirm('Leave without saving your UDCP changes?')),
      clearDirty:()=>{dirty=false;},
      hasUnsaved:()=>dirty||busy,
      async open(doc_id, scope) {
        if(busy||chooser.open)return;
        let result;
        const payload={doc_id,scope};
        busy=true;
        try{if(!await flushGT())return;result=await request('open',payload);}
        finally{busy=false;}
        if(result.view){await launch(result,scope);return;}
        chooser.innerHTML=`<h2>Choose a collection view</h2><p>Choose once for this document. The view is locked after confirmation.</p><div class="udcp-choice-list"><button type="button" class="udcp-choice" data-view="udcp"><strong>UDCP (new)</strong><span>Reporting periods and nested segment rows</span></button><button type="button" class="udcp-choice" data-view="gt"><strong>GT View (old)</strong><span>Existing collection grid</span></button></div><p role="status"></p><button type="button" class="btn ghost" data-close>Cancel</button>`;
        chooser.querySelector('[data-close]').onclick=()=>chooser.close();
        chooser.querySelectorAll('[data-view]').forEach(button=>button.onclick=async()=>{
          if(busy)return;
          busy=true;
          chooser.querySelectorAll('button').forEach(item=>item.disabled=true);
          try{const chosen=await request('choose',{...payload,view:button.dataset.view});chooser.close();await launch(chosen,scope);}
          catch(error){chooser.querySelector('[role="status"]').textContent=error.message;}
          finally{busy=false;chooser.querySelectorAll('button').forEach(item=>item.disabled=false);}
        });
        chooser.showModal();
      }
    };
  }
};
