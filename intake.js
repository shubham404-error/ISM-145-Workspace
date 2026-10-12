(function(root){
'use strict';
function csv(text){return root.ISM.csv(text)}
async function xlsx(file){
 if(file.size>5_000_000)throw Error('Workbook exceeds 5 MB. Split it into smaller batches.');
 if(typeof DecompressionStream==='undefined'||typeof DOMParser==='undefined')throw Error('This browser cannot read XLSX. Export the sheet as CSV and upload that file.');
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
 const u16=i=>view.getUint16(i,true),u32=i=>view.getUint32(i,true),decoder=new TextDecoder();
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(i)===0x06054b50){end=i;break}
 if(end<0)throw Error('Invalid XLSX file.');
 let pos=u32(end+16),entries=new Map();
 for(let n=0;n<u16(end+10);n++){
  if(u32(pos)!==0x02014b50)throw Error('Invalid workbook directory.');
  const len=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32),name=decoder.decode(bytes.slice(pos+46,pos+46+len));
  entries.set(name,{method:u16(pos+10),size:u32(pos+20),unpacked:u32(pos+24),offset:u32(pos+42)});pos+=46+len+extra+comment;
 }
 async function read(name){const e=entries.get(name);if(!e)throw Error('Workbook is missing '+name);if(e.unpacked>8_000_000)throw Error('Workbook component is too large.');const p=e.offset;if(u32(p)!==0x04034b50)throw Error('Invalid workbook entry.');const data=bytes.slice(p+30+u16(p+26)+u16(p+28),p+30+u16(p+26)+u16(p+28)+e.size);if(e.method===0)return decoder.decode(data);if(e.method!==8)throw Error('Unsupported workbook compression.');const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));const out=await new Response(stream).arrayBuffer();if(out.byteLength>8_000_000)throw Error('Workbook component is too large.');return decoder.decode(out)}
 const xml=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid workbook XML.');return doc};
 const book=xml(await read('xl/workbook.xml')),first=book.getElementsByTagName('sheet')[0];if(!first)throw Error('Workbook has no sheet.');
 const relations=xml(await read('xl/_rels/workbook.xml.rels'));
 const rel=[...relations.getElementsByTagName('Relationship')].find(x=>x.getAttribute('Id')===first.getAttribute('r:id'));if(!rel)throw Error('Workbook sheet link is missing.');
 const target=rel.getAttribute('Target').replace(/^\//,'');const path=target.startsWith('xl/')?target:'xl/'+target.replace(/^\.\//,'');
 const strings=entries.has('xl/sharedStrings.xml')?[...xml(await read('xl/sharedStrings.xml')).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
 const sheet=xml(await read(path));const rows=[...sheet.getElementsByTagName('sheetData')[0]?.getElementsByTagName('row')||[]].map(row=>{
  const values=[];for(const cell of row.getElementsByTagName('c')){let col=0;for(const letter of (cell.getAttribute('r')||'').replace(/\d/g,''))col=col*26+letter.charCodeAt(0)-64;
   const t=cell.getAttribute('t'),v=cell.getElementsByTagName('v')[0]?.textContent||'';
   values[col-1]=t==='s'?strings[Number(v)]||'':t==='inlineStr'?[...cell.getElementsByTagName('t')].map(n=>n.textContent).join(''):v;
  }return values});
 const headers=(rows.shift()||[]).map(x=>String(x||'').trim());if(!headers.length)throw Error('The first row needs column headers.');
 return rows.filter(r=>r.some(v=>String(v||'').trim())).map(row=>Object.fromEntries(headers.map((h,i)=>[h,String(row[i]??'').trim()])));
}
function prepare(rows,names,industries){
 const aliases={'researcher':'researcher','ground truth status':'ground_truth_status','production status':'production_status','source_url':'source_url','presentation link':'source_url'};
 const required=['company_id','doc_id','industry_name','industry_code','form_type','market'];
 const ids=new Set();return rows.map((raw,i)=>{
  const fields=Object.fromEntries(Object.entries(raw).map(([key,value])=>[aliases[key.trim().toLowerCase()]||key.trim().toLowerCase().replace(/\s+/g,'_'),String(value??'').trim()]));
  for(const key of required)if(!fields[key])throw Error(`Spreadsheet row ${i+2}: ${key} is required.`);
  if(ids.has(fields.doc_id))throw Error(`Duplicate document ID ${fields.doc_id} in this file.`);ids.add(fields.doc_id);
  if(!industries.includes(fields.industry_name))throw Error(`Spreadsheet row ${i+2}: ${fields.industry_name} has no data dictionary mapping.`);
  return {...fields,assigned_analyst:'',market_tier:fields.market_tier||'',researcher:fields.researcher||'',ground_truth_status:fields.ground_truth_status||''};
 });
}
const API={csv,xlsx,prepare};if(typeof module!=='undefined')module.exports=API;else root.ISM_INTAKE=API;
})(typeof window==='undefined'?globalThis:window);
