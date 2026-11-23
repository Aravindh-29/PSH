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
async function routingPicker(){
 let index=0,first=true,form={assignmentGroupId:'hr',subgroupId:'payroll',assignedTo:'someone'},effect;
 const states=[],calls=[],groups=[{id:'hr',name:'HR',label:'HR',is_active:true,can_select:true},{id:'payroll',name:'Payroll',parent_id:'hr',is_active:true,can_select:true},{id:'finance',name:'Finance',label:'Finance',is_active:true,can_select:false},{id:'accounts',name:'Accounts',parent_id:'finance',country_name:'France',is_active:true,can_select:false}];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useId:()=> 'routing',useState:initial=>{const n=index++;if(!(n in states))states[n]=initial;return[states[n],v=>{states[n]=typeof v==='function'?v(states[n]):v}]},useEffect:fn=>{if(first)effect=fn}};
 const module={exports:{}},file=path.join(root,'client/src/components/TicketOrganization.jsx');
 const code=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:'jsx',format:'cjs'}).code;
 const wrap=x=>({__esModule:true,default:x,...x});
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id==='react'?wrap(React):wrap({get:async url=>{calls.push(url);return{data:{groups}}}}),module,module.exports);
 function render(){index=0;const tree=module.exports.default({form,setForm:fn=>{form=fn(form)},allowOtherDepartments:true});first=false;return tree}
 function find(node,label){if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const c of node){const found=find(c,label);if(found)return found}}else if(node.type==='select'&&node.props['aria-label']===label)return node;else return find(node.props?.children,label)}
 let tree=render();effect();await new Promise(resolve=>setTimeout(resolve,0));tree=render();assert.equal(calls[0],'/departments/routing');assert(!find(tree,'Other Department'));
 find(tree,'Department').props.onChange({target:{value:'other'}});tree=render();assert(find(tree,'Other Department'));assert.equal(form.assignedTo,'');assert.equal(form.subgroupId,'');
 find(tree,'Other Department').props.onChange({target:{value:'finance'}});tree=render();assert.equal(form.assignmentGroupId,'finance');assert.equal(form.assignmentGroup,'Finance');assert.equal(form.routingOutside,true);
 find(tree,'Sub Department').props.onChange({target:{value:'accounts'}});assert.equal(form.subgroupId,'accounts');assert.equal(form.assignedTo,'');
 tree=render();find(tree,'Department').props.onChange({target:{value:'hr'}});tree=render();assert(!find(tree,'Other Department'));assert.equal(form.assignmentGroupId,'hr');assert.equal(form.subgroupId,'');
 pass('Other Departments picker opens the extra field, selects destination children, clears old assignment and returns to ordinary departments');
}
async function findingsEditor(){
 let index=0,first=true,effect;const states=[],calls=[],stored=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const n=index++;if(!(n in states))states[n]=initial;return[states[n],v=>{states[n]=typeof v==='function'?v(states[n]):v}]},useEffect:fn=>{if(first)effect=fn}};
 const api={get:async()=>({data:{findings:stored}}),post:async(url,body)=>{calls.push({url,body});stored.push({id:'finding',content:body.content,updated_at:'2026-11-23T08:00:00Z',author_name:'Admin'})}};
 const wrap=x=>({__esModule:true,default:x,...x}),module={exports:{}},file=path.join(root,'client/src/components/DepartmentFindings.jsx');
 const req=id=>id==='react'?wrap(React):id==='lucide-react'?new Proxy({},{get:()=>()=>null}):id==='react-hot-toast'?wrap({success(){}}):id.endsWith('api/axios')?wrap(api):wrap(()=>null);
 const code=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:'jsx',format:'cjs'}).code;vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,module,module.exports);
 function render(canEdit=true){index=0;const tree=module.exports.default({department:{id:'hr',name:'HR'},canEdit});first=false;return tree}
 function find(node,predicate){if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const c of node){const found=find(c,predicate);if(found)return found}}else if(predicate(node))return node;else return find(node.props?.children,predicate)}
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):'';
 let tree=render();effect();await new Promise(resolve=>setTimeout(resolve,0));tree=render();
 const add=find(tree,n=>n.type==='button'&&text(n).includes('Add Findings'));assert(add.props.className.includes('org-blue'));add.props.onClick();tree=render();
 const value='Customer: Dell\nEmail: test@dell.example\nReference: <script>plain text</script>';find(tree,n=>n.type==='textarea').props.onChange({target:{value}});tree=render();
 await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=render();assert.equal(calls[0].url,'/departments/hr/findings');assert.equal(calls[0].body.content,value);assert(find(tree,n=>n.props?.className==='org-finding-content'&&n.props.children[0]===value));
 assert(!find(render(false),n=>n.type==='button'&&(text(n).includes('Add Findings')||text(n)==='Edit'||text(n)==='Delete')));
 pass('Findings tab editor saves arbitrary multiline text through the department API, renders plain text and hides mutation controls without management access');
}
async function sharedNotificationBadges(){
 let stateIndex=0,refIndex=0;const states=[],refs=[],pending=[],posts=[];
 const React={createContext:()=>({Provider:'provider'}),createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const n=stateIndex++;if(!(n in states))states[n]=initial;return[states[n],v=>{states[n]=typeof v==='function'?v(states[n]):v}]},useRef:initial=>{const n=refIndex++;if(!(n in refs))refs[n]={current:initial};return refs[n]},useEffect(){},useCallback:fn=>fn,useContext(){}};
 const api={get:()=>new Promise(resolve=>pending.push(resolve)),post:async(url,body)=>{posts.push({url,body})},patch:async()=>{}};
 const wrap=x=>({__esModule:true,default:x,...x}),file=path.join(root,'client/src/context/NotificationContext.jsx'),module={exports:{}};
 const req=id=>id==='react'?wrap(React):id.endsWith('api/axios')?wrap(api):{useAuth:()=>({user:{id:'reader'}})};
 const code=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:'jsx',format:'cjs'}).code;vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,module,module.exports);
 function render(){stateIndex=0;refIndex=0;return module.exports.NotificationProvider({children:null}).props.value;}
 let context=render();const stale=context.refetch();const opening=context.markTicketOpened('ticket-1','4');await Promise.resolve();assert.equal(pending.length,2);
 pending[1]({data:{notifications:[],unread:0,ticketUnread:0,otherUnread:0}});await opening;
 pending[0]({data:{notifications:[{ticket_id:'ticket-1'}],unread:1,ticketUnread:1,otherUnread:0}});await stale;
 context=render();assert.equal(context.unread,0);assert.equal(context.queryUnopened,0);assert.equal(context.notifications.length,0);assert.deepEqual(posts,[{url:'/tickets/ticket-1/opened',body:{revision:'4'}}]);
 const refresh=context.refetch();pending[2]({data:{notifications:[{ticket_id:'ticket-2'}],unread:2,ticketUnread:2,otherUnread:0}});await refresh;context=render();assert.equal(context.unread,2);assert.equal(context.queryUnopened,2);
 pass('Bell and My Query update from one snapshot; opening clears both and a stale poll cannot restore an already-cleared alert');
}
async function compactTicketActivity(){
 const file=path.join(root,'client/src/utils/ticketActivity.js'),module={exports:{}};
 const code=esbuild.transformSync(fs.readFileSync(file,'utf8'),{format:'cjs'}).code;vm.runInThisContext('(function(module,exports){'+code+'\n})',{filename:file})(module,module.exports);
 const rows=[{id:'1',activity_group:'save-1',created_at:'2026-11-23T09:00:00Z',user_name:'Siva',action:'COMMENT_ADDED',field_name:'work_note',new_value:'Working on it'},
 {id:'2',activity_group:'email-1',created_at:'2026-11-23T09:01:00Z',user_name:'System',action:'EMAIL_RECEIVED',field_name:'email_message',new_value:'MSG-2'},
 {id:'3',activity_group:'email-1',created_at:'2026-11-23T09:01:00Z',user_name:'System',action:'ATTACHMENT_ADDED',field_name:'attachment',new_value:'logs.txt'},
 {id:'4',activity_group:'email-1',created_at:'2026-11-23T09:01:00Z',user_name:'System',action:'REOPENED',field_name:'status',old_value:'CLOSED',new_value:'IN_PROGRESS'}];
 const before=JSON.stringify(rows),groups=module.exports.groupTicketActivity(rows);assert.equal(groups.length,2);assert.equal(groups[0].title,'Email received · Ticket reopened');assert.equal(groups[0].entries.length,3);assert(groups[0].summary.includes('Closed → In Progress'));assert(groups[0].summary.includes('1 attachment added'));assert.equal(groups[1].summary,'Working on it');assert.equal(JSON.stringify(rows),before);
 const precise=module.exports.groupTicketActivity([{...rows[0],activity_group:'earlier',activity_order:'2026-11-23 09:00:00.000001'},{...rows[0],id:'5',activity_group:'later',activity_order:'2026-11-23 09:00:00.000002'}]);assert.equal(precise.length,2);assert.equal(precise[0].id,'later');
 pass('Compact Activity History groups one email/save, preserves every detail, keeps separate actions separate and sorts newest first with microsecond precision');
}
async function mailboxEditor(){
 const statusModule={exports:{}};vm.runInThisContext('(function(module,exports){'+esbuild.transformSync(fs.readFileSync(path.join(root,'client/src/utils/aiStatus.js'),'utf8'),{format:'cjs'}).code+'\n})')(statusModule,statusModule.exports);
 const gemini={provider:'gemini',name:'Google Gemini',keySet:true,status:'connected'},status=statusModule.exports.aiStatus;
 const temporary=status({enabled:true,connected:true,activeProvider:'gemini',providers:[{...gemini,degraded:true,last_error_kind:'transient',retry_after:new Date(Date.now()+30000).toISOString()}]});assert.equal(temporary.label,'Connected · Provider temporarily unavailable');assert.equal(temporary.ready,false);assert.equal(temporary.configured,true);
 assert.equal(status({enabled:false,providers:[gemini]}).label,'Connected · Not activated');assert.equal(status({enabled:true,connected:true,activeProvider:'gemini',providers:[gemini]}).ready,true);assert.equal(status({enabled:true,connected:false,activeProvider:'gemini',providers:[{...gemini,status:'error'}]}).ready,false);assert.equal(status({enabled:false,providers:[gemini,{...gemini,provider:'openai'}]}).activateProvider,null);
 const fixture={enabled:true,hasToken:true,allowedMailboxes:[],endpoint:'/api/mcp',gmail:{connections:[]},mailboxes:[{id:'existing',address:'saved@example.test',defaults:{moduleText:'Storage'},allowed_department_ids:[],sender_domains:[],problems:[],ready:true}],context:{groups:[],requiredFields:[],ticketTypes:[],categories:[],subcategories:[]}};
 const states=[],refs=[],effectDeps=[];let stateIndex=0,refIndex=0,effectIndex=0,effects=[],focus=0,scroll=0;
 const react={createElement:(type,props,...children)=>{if(props?.ref)props.ref.current={scrollIntoView(){scroll++;},focus(){focus++;}};return{type,props:{...props,children}};},useState:initial=>{const index=stateIndex++;if(!(index in states))states[index]=index===0?fixture:typeof initial==='function'?initial():initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef:initial=>{const index=refIndex++;return refs[index]||(refs[index]={current:initial});},useCallback:fn=>fn,useEffect:(fn,deps)=>{const index=effectIndex++;if(!effectDeps[index]||deps.some((value,i)=>value!==effectDeps[index][i])){effects.push(fn);effectDeps[index]=deps;}}};
 const file=path.join(root,'client/src/pages/Admin/MCPConfig.jsx'),code=esbuild.transformSync(fs.readFileSync(file,'utf8'),{loader:'jsx',format:'cjs'}).code,module={exports:{}};
 const interop=value=>({__esModule:true,default:value,...value});
 const requests=[];
 const req=id=>id==='react'?interop(react):id.endsWith('utils/aiStatus')?statusModule.exports:(id.endsWith('GmailConfig')||id.endsWith('EmailAIConfig')||id.endsWith('SavedSecret'))?interop(()=>null):id==='react-hot-toast'?interop({success(){},error(){}}):id.endsWith('api/axios')?interop({get:async()=>({data:fixture}),post:async(url,body)=>{requests.push({url,body});fixture.ai={...fixture.ai,enabled:true,connected:true,activeProvider:body.provider};return {data:{message:'Enabled'}};}}):id.endsWith('.css')?{}:clientRequire(id);
 vm.runInThisContext('(function(require,module,exports,window){'+code+'\n})',{filename:file})(req,module,module.exports,{location:{origin:'http://localhost:5173',search:''},setInterval:()=>0,clearInterval(){}});
 const render=()=>{stateIndex=0;refIndex=0;effectIndex=0;effects=[];const tree=module.exports.default();for(const effect of effects)effect();return tree;};
 const find=(node,predicate)=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}return null;}if(predicate(node))return node;return find(node.props?.children,predicate);};
 const editor=tree=>find(tree,node=>node.type==='form'&&node.props.id==='mcp-mailbox-editor');
 const add=tree=>find(tree,node=>node.type==='button'&&node.props['aria-controls']==='mcp-mailbox-editor');
 let tree=render();await Promise.resolve();assert(!editor(tree));add(tree).props.onClick();tree=render();assert(editor(tree));assert(focus>0&&scroll>0,'opening reveals, scrolls and focuses the editor');assert.equal(find(editor(tree),node=>node.type==='input'&&node.props.type==='email').props.value,'');
 assert(!find(editor(tree),node=>node.type==='h3'&&node.props.children.includes('Optional ticket defaults')));assert(find(editor(tree),node=>node.type==='details'&&!node.props.open));assert(!find(editor(tree),node=>node.type==='input'&&node.props.required&&node.props.type!=='email'));
 find(tree,node=>node.type==='button'&&node.props.className?.startsWith('mcp-mailbox ')).props.onClick();tree=render();assert.equal(find(editor(tree),node=>node.type==='input'&&node.props.type==='email').props.value,'saved@example.test');
 add(tree).props.onClick();tree=render();const address=find(editor(tree),node=>node.type==='input'&&node.props.type==='email');assert.equal(address.props.value,'');assert.equal(address.props.readOnly,false);
 const before=focus;add(tree).props.onClick();tree=render();assert(focus>before,'clicking Add again still focuses the blank editor');
 find(editor(tree),node=>node.type==='button'&&node.props.children.includes('Cancel')).props.onClick();tree=render();assert(!editor(tree));
 const tab=id=>find(tree,node=>node.props?.id==='mcp-tab-'+id);
 assert.equal(tab('gmail').props.disabled,true);assert.equal(tab('ai').props.disabled,true);
 fixture.connected=true;tree=render();assert.equal(tab('gmail').props.disabled,false);assert.equal(tab('ai').props.disabled,true);
 tab('gmail').props.onClick();tree=render();assert(!editor(tree));assert(!add(tree));assert(find(tree,node=>node.props?.id==='mcp-step-gmail'));
 fixture.gmail.connections=[{mailbox_id:'existing',status:'connected',is_active:true,is_paused:false}];fixture.ai={enabled:true,connected:true,activeProvider:'gemini',providers:[gemini]};tree=render();assert.equal(tab('ai').props.disabled,false);tab('ai').props.onClick();tree=render();assert(find(tree,node=>node.props?.id==='mcp-step-ai'));assert(!find(tree,node=>node.props?.id==='mcp-step-gmail'));
 fixture.connected=false;tree=render();assert(find(tree,node=>node.props?.id==='mcp-step-server'));assert.equal(tab('ai').props.disabled,true);
 pass('Setup cards unlock after saved prerequisites, display one configuration at a time, preserve saved status and relock after a prerequisite disconnects');
 pass('Add mailbox opens a visible focused editor, edit loads the selected mailbox, Add resets it and Cancel closes it');
}
async function savedCredentials(){
 const states=[],calls=[],copied=[];let index=0,props={label:'API key',saved:true,kind:'ai',provider:'gemini',value:'',onChange:value=>{props.value=value;}};
 const react={createElement:(type,attributes,...children)=>({type,props:{...attributes,children}}),useState:initial=>{const n=index++;if(!(n in states))states[n]=typeof initial==='function'?initial():initial;return[states[n],value=>{states[n]=typeof value==='function'?value(states[n]):value;}];},useEffect(){}};
 const interop=value=>({__esModule:true,default:value,...value});
 const stubSecret=()=>null;
 const req=id=>id==='react'?interop(react):id.endsWith('SavedSecret')?interop(stubSecret):id==='react-hot-toast'?interop({success(){},error(){}}):id.endsWith('api/axios')?interop({post:async(url,body)=>{calls.push({url,body});return {data:{secret:'test-only-key'}};}}):clientRequire(id);
 function load(relative){const m={exports:{}};vm.runInThisContext('(function(require,module,exports,navigator){'+esbuild.transformSync(fs.readFileSync(path.join(root,relative),'utf8'),{loader:'jsx',format:'cjs'}).code+'\n})')(req,m,m.exports,{clipboard:{writeText:async value=>copied.push(value)}});return m.exports.default;}
 const component=load('client/src/components/SavedSecret.jsx');
 const find=(node,predicate)=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const hit=find(child,predicate);if(hit)return hit;}return null;}return predicate(node)?node:find(node.props?.children,predicate);};
 const render=()=>{index=0;return component(props);};let tree=render();
 assert.equal(calls.length,0);const masked=find(tree,n=>n.type==='input');assert.equal(masked.props.type,'password');assert.equal(masked.props.readOnly,true);assert(masked.props.value.includes('••'));assert(!JSON.stringify(tree).includes('test-only-key'));
 await find(tree,n=>n.type==='button'&&n.props.children.includes('Copy')).props.onClick();assert.equal(calls[0].url,'/config/admin/mcp/credentials/copy');assert.deepEqual(calls[0].body,{kind:'ai',provider:'gemini'});assert.deepEqual(copied,['test-only-key']);
 find(tree,n=>n.type==='button'&&n.props.children.includes('Replace')).props.onClick();tree=render();assert.equal(find(tree,n=>n.type==='input').props.value,'');assert.equal(find(tree,n=>n.type==='input').props.readOnly,false);
 find(tree,n=>n.type==='button'&&n.props.children.includes('Keep saved key')).props.onClick();tree=render();assert.equal(find(tree,n=>n.type==='input').props.readOnly,true);assert(props.value==='');
 states.length=0;index=0;const ai=load('client/src/pages/Admin/EmailAIConfig.jsx');tree=ai({initial:{enabled:true,activeProvider:'claude',connected:true,providers:[{provider:'gemini',name:'Google Gemini',model:'saved-gemini',keySet:true,status:'connected'},{provider:'claude',name:'Anthropic Claude',model:'saved-claude',keySet:true,status:'connected'}]},onChange(){}});
 assert(find(tree,n=>n.type==='input'&&n.props.value==='saved-claude'));assert(find(tree,n=>n.type==='select'&&n.props.value==='claude'));assert(find(tree,n=>n.type===stubSecret&&n.props.saved&&n.props.provider==='claude'));assert(find(tree,n=>n.props?.className==='mcp-connection-summary'));
 pass('Saved credentials stay masked, copy only on demand, preserve unchanged keys and support replacement; AI opens the saved active provider/model with its connection summary');
}
async function aiLogBindings(){
 const states=[],refs=[],callbacks=[],effectState=[],calls=[],posts=[];let si=0,ri=0,ci=0,ei=0,effects=[],fail=false;
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const n=si++;if(!(n in states))states[n]=typeof initial==='function'?initial():initial;return[states[n],value=>states[n]=typeof value==='function'?value(states[n]):value];},useRef:initial=>refs[ri]||(refs[ri++]={current:initial}),useCallback:(fn,deps)=>{const n=ci++;if(!callbacks[n]||deps.some((d,i)=>d!==callbacks[n].deps[i]))callbacks[n]={fn,deps};return callbacks[n].fn;},useEffect:(fn,deps)=>{const n=ei++;if(!effectState[n]||deps.some((d,i)=>d!==effectState[n].deps[i]))effects.push(()=>{effectState[n]?.cleanup?.();effectState[n]={deps,cleanup:fn()};});}};
 const interop=value=>({__esModule:true,default:value,...value});
 const api={get:async(url)=>{const params=Object.fromEntries(new URLSearchParams(url.split('?')[1]));calls.push({url,params});if(fail)throw Error('Offline');return {data:{logs:[{id:'process-id',provider:'gemini',model:'test-model',purpose:'email_analysis',outcome:'failed',error_code:'HTTP_429',error_message:'Rate limited',failure_kind:'transient',mailbox:'test@example.test',message_id:'gmail-id',thread_id:'thread-id',created_at:'2026-11-24T01:00:00Z',started_at:'2026-11-24T00:59:59Z',duration_ms:1000,attempts:[{number:1,httpStatus:429,durationMs:2}],result_summary:{}}],summary:{total:2,success:1,failed:1},pagination:{pages:2},activeDays:['2026-11-24']}};}};
 const req=id=>id==='react'?interop(react):id==='react-router-dom'?{Link:'a'}:id==='react-hot-toast'?interop({success(){},error(){}}):id.endsWith('api/axios')?interop(api):clientRequire(id),m={exports:{}};
 vm.runInThisContext('(function(require,module,exports,setInterval,clearInterval,window){'+esbuild.transformSync(fs.readFileSync(path.join(root,'client/src/pages/Audit/AILogsPanel.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code+'\n})')(req,m,m.exports,(fn,ms)=>{assert.equal(ms,15000);return 1;},()=>{},{addEventListener(){},removeEventListener(){}});
 const month=new Date(2026,10,24),onMeta=meta=>{assert.equal(meta.summary.failed,1);};
 const render=()=>{si=ri=ci=ei=0;effects=[];const tree=m.exports.default({selectedDate:'2026-11-24',viewMonth:month,onMeta});for(const effect of effects)effect();return tree;};
 const find=(node,test)=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}return null;}return test(node)?node:find(node.props?.children,test);};
 let tree=render();await new Promise(resolve=>setImmediate(resolve));tree=render();assert(calls[0].url.startsWith('/audit/ai?'));assert.equal(calls[0].params.tz,Intl.DateTimeFormat().resolvedOptions().timeZone);
 find(tree,n=>n.type==='button'&&n.props.children.includes('View details')).props.onClick();tree=render();assert(find(tree,n=>n.props?.role==='dialog'));assert(find(tree,n=>n.props?.['aria-label']==='Close AI log details'));find(tree,n=>n.props?.['aria-label']==='Close AI log details').props.onClick();tree=render();assert(!find(tree,n=>n.props?.role==='dialog'));
 find(tree,n=>n.type==='button'&&n.props.children.includes('Next')).props.onClick();render();await new Promise(resolve=>setImmediate(resolve));tree=render();assert.equal(calls.at(-1).params.page,'2');
 find(tree,n=>n.props?.['aria-label']==='AI outcome').props.onChange({target:{value:'failed'}});render();await new Promise(resolve=>setImmediate(resolve));tree=render();assert.equal(calls.at(-1).params.status,'failed');assert.equal(calls.at(-1).params.page,'1');
 fail=true;find(tree,n=>n.props?.className==='ai-log-refresh').props.onClick();render();await new Promise(resolve=>setImmediate(resolve));tree=render();assert(find(tree,n=>n.props?.role==='alert'));for(const effect of effectState)effect?.cleanup?.();
 pass('AI Logs binds live API counts, timezone/date filters, paging, failure details and red-close popup controls, and exposes load failures');
}
async function queueMonitoring(){
 const states=[],refs=[],callbacks=[],effectState=[],calls=[],posts=[];let si=0,ri=0,ci=0,ei=0,effects=[],fail=false;
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const n=si++;if(!(n in states))states[n]=typeof initial==='function'?initial():initial;return[states[n],value=>states[n]=typeof value==='function'?value(states[n]):value];},useRef:initial=>refs[ri]||(refs[ri++]={current:initial}),useCallback:(fn,deps)=>{const n=ci++;if(!callbacks[n]||deps.some((d,i)=>d!==callbacks[n].deps[i]))callbacks[n]={fn,deps};return callbacks[n].fn;},useEffect:(fn,deps)=>{const n=ei++;if(!effectState[n]||deps.some((d,i)=>d!==effectState[n].deps[i]))effects.push(()=>{effectState[n]?.cleanup?.();effectState[n]={deps,cleanup:fn()};});}};
 const interop=value=>({__esModule:true,default:value,...value});
 const api={get:async(url,{params})=>{calls.push({url,params});if(fail)throw Error('Offline');return {data:{limits:{workers:3,mailboxes:2,batchSize:50},totals:{pending:53,processing:3,delayed:2,needs_review:1,failed:1,processed_last_hour:100,oldest_pending_at:new Date(Date.now()-600000).toISOString()},mailboxes:[{mailbox_id:'queue-box',address:'queue@example.test'}],items:[{mailbox_id:'queue-box',message_id:'message-'+params.page,status:params.status,address:'queue@example.test',attempts:1,created_at:new Date().toISOString()}],total:params.status==='pending'?53:1,page:params.page,limit:25}};},post:async(url,body)=>{posts.push({url,body});return {data:{message:'Queued'}};}};
 const req=id=>id==='react'?interop(react):id==='react-router-dom'?{Link:'a'}:id==='react-hot-toast'?interop({success(){},error(){}}):id.endsWith('api/axios')?interop(api):clientRequire(id),m={exports:{}};
 vm.runInThisContext('(function(require,module,exports,setInterval,clearInterval){'+esbuild.transformSync(fs.readFileSync(path.join(root,'client/src/components/EmailQueueMonitor.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code+'\n})')(req,m,m.exports,(fn,ms)=>{assert.equal(ms,10000);return 1;},()=>{});
 const render=()=>{si=ri=ci=ei=0;effects=[];const tree=m.exports.default();for(const effect of effects)effect();return tree;};
 const find=(node,test)=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}return null;}return test(node)?node:find(node.props?.children,test);};
 let tree=render();await new Promise(resolve=>setImmediate(resolve));tree=render();assert.equal(calls[0].url,'/config/admin/mcp/gmail/queue');assert(find(tree,n=>n.props?.className==='mcp-warning'));const next=find(tree,n=>n.type==='button'&&n.props.children.includes('Next'));assert.equal(next.props.disabled,false);next.props.onClick();render();await new Promise(resolve=>setImmediate(resolve));tree=render();assert.equal(calls.at(-1).params.page,2);
 find(tree,n=>n.type==='select'&&n.props.value==='pending').props.onChange({target:{value:'failed'}});render();await new Promise(resolve=>setImmediate(resolve));tree=render();assert.equal(calls.at(-1).params.status,'failed');assert.equal(calls.at(-1).params.page,1);await find(tree,n=>n.type==='button'&&n.props.children.includes('Retry email')).props.onClick();assert.deepEqual(posts[0],{url:'/config/admin/mcp/gmail/mailboxes/queue-box/retry',body:{messageId:'message-1'}});
 fail=true;await find(tree,n=>n.type==='button'&&n.props.children.includes('Refresh queue')).props.onClick();tree=render();assert(find(tree,n=>n.props?.role==='alert'));for(const effect of effectState)effect?.cleanup?.();
 pass('Queue monitor binds live counts, backlog warnings, paginated status filters and per-message retries, and reports refresh failures without hiding existing data');
}
async function main(){
 const emailModule={exports:{}};vm.runInThisContext('(function(module,exports){'+esbuild.transformSync(fs.readFileSync(path.join(root,'client/src/utils/emailComment.js'),'utf8'),{format:'cjs'}).code+'\n})')(emailModule,emailModule.exports);
 const split=emailModule.exports.splitEmailComment;
 const original='The issue is still happening.\r\n\r\nOn Mon, Nov 23, 2026 at 7:29 PM Customer <test@example.test>\r\nwrote:\r\n\r\n> Earlier reply\r\n> On an earlier day:\r\n>> Original issue';
 const emailParts=split(original);assert.equal(emailParts.reply,'The issue is still happening.');assert(emailParts.quoted.includes('Original issue'));assert(original.includes('\r\n'));
 assert.deepEqual(split('First email\n\nAll details here.'),{reply:'First email\n\nAll details here.',quoted:''});assert.equal(split('My answer\n\n> Previous question').quoted,'> Previous question');assert.equal(split('My answer\n> Question\nInline new answer').quoted,'');assert.equal(split('Latest answer\n\n-----Original Message-----\nFrom: old@example.test\nEarlier body').reply,'Latest answer');assert.equal(split('On Monday I wrote:\nThis is my actual issue.').quoted,'');assert.equal(split('Latest\n\nFrom: old@example.test\nSent: Monday\nTo: support@example.test\nSubject: Earlier\n\nOld text').reply,'Latest');
 pass('Email comments separate wrapped Gmail and Outlook quotes, preserve original text and keep uncertain or inline-reply content visible');
 await mailboxEditor();await savedCredentials();await queueMonitoring();await aiLogBindings();
 await compactTicketActivity();
 await sharedNotificationBadges();
 await findingsEditor();
 await routingPicker();
 await attachmentUploads();
 await exportQA();
 for(const globalReport of [false,true]){await exportReport(globalReport);pass((globalReport?'Global':'Personal')+' export uses correct endpoint/date filters and reopens with all sheets, fresh totals, ticket rows, labels, text values and formatting');await exportReport(globalReport,null);pass((globalReport?'Global':'Personal')+' export preserves N/A instead of numeric zero');await exportReport(globalReport,1.5,true);pass((globalReport?'Global':'Personal')+' export handles network failure and restores button state');}
 const globals=new Set('undefined NaN Infinity console window document navigator localStorage sessionStorage fetch URL URLSearchParams Blob File FormData FileReader Image XMLSerializer TextEncoder TextDecoder AbortController Headers Response Request Map Set WeakMap WeakSet Object Array String Number Boolean Math Date JSON RegExp Error TypeError Promise Symbol BigInt Intl Buffer Uint8Array ArrayBuffer parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame atob btoa confirm alert location performance crypto CustomEvent ResizeObserver'.split(' '));let modules=0;
 function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())scan(file);else if(/\.(jsx|js)$/.test(file)){const ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx']});traverse(ast,{ReferencedIdentifier(p){assert(globals.has(p.node.name)||p.scope.hasBinding(p.node.name)||p.node.name==='arguments',file+': unresolved '+p.node.name)}});modules++}}}
 scan(path.join(root,'client/src'));pass(modules+' client modules parse with no unresolved identifiers');console.log(checks+' client binding checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
