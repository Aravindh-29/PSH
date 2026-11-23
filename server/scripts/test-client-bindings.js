// Exercise the real report button handlers and XLSX writer without browser sessions.
// Hooks/API/download are test boundaries; worksheet creation and serialization are real.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),clientRequire=createRequire(path.join(root,'client/package.json'));
const esbuild=clientRequire('esbuild'),ExcelJS=clientRequire('exceljs');
const parser=clientRequire('@babel/parser'),traverse=clientRequire('@babel/traverse').default;
let checks=0;const pass=label=>{checks++;console.log('PASS: '+label)};
const fields=[{field_key:'environment',label:'Environment',field_type:'dropdown',options:[{value:'prod',label:'Production'}]},{field_key:'reference',label:'Reference',field_type:'text'}];
function fixture(avg=1.5){return {summary:{total:2,open:1,inProgress:0,pending:0,resolved:1,closed:0,critical:0,high:2,avgResolutionHours:avg,totalUsers:1,activeUsers:1},monthly:[{label:'Jan 2026',Created:2,Resolved:1,Closed:0}],weekly:[{label:'Jan 05',Created:2,Resolved:1}],byStatus:[{name:'OPEN',value:1},{name:'RESOLVED',value:1}],byPriority:[{name:'HIGH',value:2}],employees:[{fullName:'David Manager',email:'david@example.test',role:'Manager',isActive:true,total:2,open:1,inProgress:0,resolved:1,closed:0,critical:0,avgResolutionHours:avg}],allTickets:[1,2].map(i=>({ticket_number:'BIND00000'+i,short_description:i===1?'=SUM(1,1)':'Second ticket',customer_name:'Binding Customer',module_name:'Module',category_name:'Incident',status:i===1?'OPEN':'RESOLVED',priority:'HIGH',impact:'HIGH',urgency:'MEDIUM',assignment_group:'HR',sub_department_name:i===1?'Payroll':null,classification:'Software',ticket_owner_name:'David',created_by_name:'Admin',created_at:'2026-01-05T12:00:00Z',updated_at:'2026-01-06T12:00:00Z',custom_data:{environment:'prod',reference:'00123'}}))};}
async function exportReport(globalReport,avg=1.5,fail=false){
 let state=0,blob,download,errors=[],calls=[],setterValues=[];
 const data=fixture(avg),dateRange={start:new Date(2026,0,1),end:new Date(2026,0,31)};
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'fragment',useEffect:()=>{},useRef:()=>({current:null}),useCallback:fn=>fn,useState:initial=>{
  const index=state++;let value=typeof initial==='function'?initial():initial;
  if(index===(globalReport?0:1))value={...data,summary:{...data.summary,total:999}};
  if(index===(globalReport?1:2))value=false;
  if(index===(globalReport?5:7))value=fields;
  if(index===(globalReport?6:8))value=dateRange;
  return[value,v=>setterValues.push(v)];
 }};
 const interop=x=>({__esModule:true,default:x,...x});
 const api={get:async(url,options)=>{calls.push({url,options});if(fail)throw Error('Simulated export network failure');return{data}}};
 const context={console,Blob,URL:{createObjectURL:b=>{blob=b;return'blob:test'},revokeObjectURL(){}},document:{createElement:()=>({click(){download=this.download}}),body:{appendChild(){},removeChild(){}}},setTimeout,clearTimeout};
 function load(file){const code=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.jsx')?'jsx':'js',format:'cjs'}).code;const module={exports:{}};
  const req=id=>{
   if(id==='react')return interop(React);
   if(id==='lucide-react'||id==='recharts')return new Proxy({},{get:(_,k)=>k==='__esModule'?true:()=>null});
   if(id.endsWith('useAccess'))return interop(()=>({can:()=>true}));
   if(id.endsWith('AuthContext'))return{useAuth:()=>({user:{id:'fixture',fullName:'David',permissions:{'reports.view':'own'}}})};
   if(id.endsWith('api/axios'))return interop(api);
   if(id==='react-hot-toast')return interop({error:message=>errors.push(message)});
   if(id.endsWith('xlsxShim'))return load(path.join(root,'client/src/utils/xlsxShim.js'));
   if(id.endsWith('GlobalReports'))return interop(()=>null);
   if(id.endsWith('.css'))return{};
   return clientRequire(id);
  };
  vm.runInThisContext('(function(require,module,exports,document,URL,Blob){'+code+'\n})',{filename:file})(req,module,module.exports,context.document,context.URL,context.Blob);return module.exports;
 }
 const file=path.join(root,'client/src/pages/Reports',globalReport?'GlobalReports.jsx':'Reports.jsx');
 const tree=load(file).default();
 function find(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const child of node){const found=find(child);if(found)return found}}else{if(node.type==='button'&&node.props.className==='rpt-export-btn')return node;return find(node.props?.children)}}
 const button=find(tree);assert(button&&!button.props.disabled,'export is wired to enabled handler');await button.props.onClick();
 assert.equal(calls[0].url,globalReport?'/reports/global':'/reports');assert.equal(calls[0].options.params.export,true);assert.equal(calls[0].options.params.startDate,'2026-01-01');assert.equal(calls[0].options.params.endDate,'2026-01-31');
 if(fail){assert(!blob);assert.equal(errors.length,1);assert.equal(setterValues.at(-1),false);return}
 assert.deepEqual(errors,[]);assert(download.endsWith('.xlsx'));assert(blob,'real XLSX download generated');
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await blob.arrayBuffer());
 assert.equal(wb.worksheets.length,globalReport?8:7);
 const tickets=wb.getWorksheet('All Tickets');assert(tickets);assert.equal(tickets.rowCount,4);assert.equal(tickets.getCell('A3').value,'BIND000001');assert.equal(tickets.getCell('B2').value,'Department / Sub Department');assert.equal(tickets.getCell('B3').value,'HR / Payroll');assert.equal(tickets.getCell('B4').value,'HR');
 assert.equal(tickets.getCell('I2').value,'Department');assert.equal(tickets.getCell('J2').value,'Sub Department');assert.equal(tickets.getCell('I3').value,'HR');assert.equal(tickets.getCell('J3').value,'Payroll');assert.equal(tickets.getCell('J4').value,'—');
 assert.equal(tickets.getCell('P3').value,'Production');assert.equal(tickets.getCell('Q3').value,'00123');
 const summary=wb.worksheets[0];let total,average;summary.eachRow(row=>{if(row.getCell(1).value==='Total Tickets')total=row.getCell(2).value;if(row.getCell(1).value==='Avg Resolution')average=row.getCell(2).value});
 assert.equal(total,2,'fresh API totals, not stale screen data');assert.equal(average,avg===null?'N/A':'1h 30m');assert(tickets.getCell('A1').font.bold);
}
async function attachmentUploads(){
 const calls=[],progress=[];let active=0,maxActive=0;
 const api={post:async(url,body,options)=>{active++;maxActive=Math.max(maxActive,active);const file=body.get('files');calls.push({url,name:file.name});options.onUploadProgress({loaded:file.size,total:file.size});try{if(file.name==='bad.txt')throw Error('Simulated failed file');return{data:{success:true,attachments:[{id:file.name,file_name:file.name}],errors:[]}}}finally{active--}}};
 const file=path.join(root,'client/src/utils/ticketAttachments.js'),module={exports:{}};
 const code=esbuild.transformSync(fs.readFileSync(file,'utf8'),{format:'cjs'}).code;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(()=>({__esModule:true,default:api}),module,module.exports);
 const {selectAttachments,uploadTicketFiles,MAX_ATTACHMENT_SIZE}=module.exports;
 const selected=selectAttachments([{name:'too-big',size:MAX_ATTACHMENT_SIZE+1},...Array.from({length:11},(_,i)=>({name:'f'+i,size:1}))]);assert.equal(selected.files.length,10);assert.equal(selected.errors.length,2);
 const files=['good.txt','bad.txt','next.txt'].map(name=>new File(['contents'],name,{type:'text/plain'}));
 const result=await uploadTicketFiles('ticket-fixture',files,(index,update)=>progress.push({index,...update}));
 assert.equal(calls.length,3);assert.equal(maxActive,1);assert(calls.every(c=>c.url==='/tickets/ticket-fixture/attachments'));assert.equal(result.attachments.length,2);assert.equal(result.errors.length,1);assert(progress.some(p=>p.index===1&&p.status==='error'));assert(!progress.some(p=>p.index===1&&p.status==='done'));assert(progress.some(p=>p.index===2&&p.status==='done'));
 pass('Attachment selection enforces size/count limits and serial uploads report individual failures without losing later files');
}
async function exportQA(){
 let index=0,blob;const errors=[];
 const data={summary:{total:1,active:1,paused:0,completed:0,breached:0,met:0,complianceRate:0,avgElapsedMin:30},byDefinition:[],trend:[],instances:[{id:'fixture',ticket_number:'QA000001',short_description:'QA fixture',sla_name:'Acknowledgement',start_status:'NEW',stage:'active',priority:'HIGH',assigned_to_name:'David',ticket_status:'OPEN',started_at:'2026-01-01T12:00:00Z',target_at:'2026-01-01T13:00:00Z',duration_minutes:60,total_pause_minutes:0}]};
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'fragment',useEffect(){},useCallback:fn=>fn,useRef:()=>({current:null}),useState:initial=>[index++===0?data:initial===true?false:initial,()=>{}]};
 const wrap=x=>({__esModule:true,default:x,...x});
 const req=id=>{if(id==='react')return wrap(React);if(['recharts','lucide-react'].includes(id))return new Proxy({},{get:(_,k)=>k==='__esModule'?true:()=>null});if(id==='react-router-dom')return{useNavigate:()=>()=>{}};if(id.endsWith('useAccess'))return wrap(()=>({can:()=>true}));if(id==='react-hot-toast')return wrap({error:msg=>errors.push(msg),success(){}});if(id.endsWith('.css'))return{};return clientRequire(id)};
 const file=path.join(root,'client/src/pages/QAAnalysis/QAAnalysis.jsx');
 const code=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:'jsx',format:'cjs',supported:{'dynamic-import':false}}).code,module={exports:{}};
 const document={createElement:()=>({click(){}})},URL={createObjectURL:b=>{blob=b;return'blob:qa'},revokeObjectURL(){}};
 vm.runInThisContext('(function(require,module,exports,document,URL,Blob,fetch){'+code+'\n})',{filename:file})(req,module,module.exports,document,URL,Blob,async()=>({ok:true}));
 function find(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){for(const x of n){const r=find(x);if(r)return r}}else if(n.type==='button'&&n.props.className==='qa-export-btn')return n;else return find(n.props?.children)}
 const button=find(module.exports.default());assert(button&&!button.props.disabled);await button.props.onClick();assert.deepEqual(errors,[]);assert(blob);const wb=new ExcelJS.Workbook();await wb.xlsx.load(await blob.arrayBuffer());assert.equal(wb.worksheets.length,4);assert(wb.worksheets.some(ws=>ws.getSheetValues().some(row=>row?.includes('QA000001'))));pass('QA export generates four readable Excel sheets with actual SLA instance values');
}
async function main(){
 await attachmentUploads();
 await exportQA();
 for(const globalReport of [false,true]){await exportReport(globalReport);pass((globalReport?'Global':'Personal')+' export uses correct endpoint/date filters and reopens with all sheets, fresh totals, ticket rows, labels, text values and formatting');await exportReport(globalReport,null);pass((globalReport?'Global':'Personal')+' export preserves N/A instead of numeric zero');await exportReport(globalReport,1.5,true);pass((globalReport?'Global':'Personal')+' export handles network failure and restores button state');}
 const globals=new Set('undefined NaN Infinity console window document navigator localStorage sessionStorage fetch URL URLSearchParams Blob File FormData FileReader Image XMLSerializer TextEncoder TextDecoder AbortController Headers Response Request Map Set WeakMap WeakSet Object Array String Number Boolean Math Date JSON RegExp Error TypeError Promise Symbol BigInt Intl Buffer Uint8Array ArrayBuffer parseInt parseFloat isNaN isFinite setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame atob btoa confirm alert location performance crypto CustomEvent ResizeObserver'.split(' '));let modules=0;
 function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())scan(file);else if(/\.(jsx|js)$/.test(file)){const ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx']});traverse(ast,{ReferencedIdentifier(p){assert(globals.has(p.node.name)||p.scope.hasBinding(p.node.name)||p.node.name==='arguments',file+': unresolved '+p.node.name)}});modules++}}}
 scan(path.join(root,'client/src'));pass(modules+' client modules parse with no unresolved identifiers');console.log(checks+' client binding checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
