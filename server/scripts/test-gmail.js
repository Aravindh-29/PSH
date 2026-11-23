// Google is simulated; OAuth routes, sessions, encryption, PostgreSQL and MCP HTTP are real.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express'),session=require('express-session');
const {Client,Pool}=require('pg'),{migrate,connectionConfig}=require('../../database/migrate');
const pool=require('../src/db/pool');
let checks=0;const pass=text=>{checks++;console.log('PASS: '+text);};
async function main(){
 const savedInterval=global.setInterval,savedTimeout=global.setTimeout,delays=[];
 try{global.setInterval=(fn,ms)=>{delays.push(ms);return {unref(){}};};global.setTimeout=(fn,ms)=>{delays.push(ms);return {unref(){}};};require('../src/services/gmailIngestion').start();}finally{global.setInterval=savedInterval;global.setTimeout=savedTimeout;}
 assert.deepEqual(delays,[30000,5000]);pass('Automatic Gmail processing is scheduled every 30 seconds with a five-second startup check');
 const db=new Client(connectionConfig());await db.connect();const schema='gmail_test_'+crypto.randomBytes(8).toString('hex');
 const oldPool={query:pool.query,rawQuery:pool.rawQuery,connect:pool.connect},nativeFetch=global.fetch;
 const names=['EMAIL_ENCRYPTION_KEY','SERVIT_MCP_ENABLED','SERVIT_MCP_TOKEN','SERVIT_MCP_MAILBOXES','CLIENT_URL','PORT'],env=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 let isolated,server;const outbound=require('../src/services/emailDelivery'),oldEnqueue=outbound.enqueue;let outboundCount=0;outbound.enqueue=async()=>{outboundCount++;};
 try{
  await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);await migrate(db);
  isolated=new Pool({...connectionConfig(),options:'-c search_path='+schema,max:15});pool.query=isolated.query.bind(isolated);pool.rawQuery=pool.query;pool.connect=isolated.connect.bind(isolated);
  process.env.EMAIL_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');process.env.SERVIT_MCP_ENABLED='true';process.env.SERVIT_MCP_TOKEN=crypto.randomBytes(32).toString('hex');process.env.SERVIT_MCP_MAILBOXES='';process.env.CLIENT_URL='http://127.0.0.1:5173';
  const users={};for(const role of ['admin','employee','manager'])users[role]=(await db.query('INSERT INTO users(username,email,full_name,password_hash,role) VALUES($1,$2,$1,$3,$4) RETURNING id',[role,role+'@example.test','unused',role])).rows[0].id;
  const department=(await db.query("INSERT INTO assignment_groups(name) VALUES('Dell') RETURNING id")).rows[0].id;
  await db.query('INSERT INTO department_findings(department_id,content,created_by) VALUES($1,$2,$3)',[department,'customer@dell.example',users.admin]);
  const category=(await db.query("INSERT INTO categories(name) VALUES('Email') RETURNING id")).rows[0].id;
  const box=(await db.query('INSERT INTO email_automation_mailboxes(address,defaults) VALUES($1,$2) RETURNING id',['support@example.test',{moduleText:'Storage',categoryId:category}])).rows[0].id;
  const app=express();app.use('/api/mcp',require('../src/mcp/router').createRouter());app.use(express.json());app.use(session({secret:'isolated-gmail-session-secret-for-tests',resave:false,saveUninitialized:false}));app.use((req,res,next)=>{if(req.headers['x-test-user'])req.session.userId=users[req.headers['x-test-user']];next();});app.use('/api/config',require('../src/routes/config'));app.use((e,req,res,next)=>res.status(e.status||500).json({message:e.status?e.message:'Test server error'}));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});process.env.PORT=String(server.address().port);const base='http://127.0.0.1:'+process.env.PORT;
  let cookie='',profileAddress='support@example.test',revoke=false,denied=false,listPageMode=false,failList=false,refreshCount=0,exchangeCount=0;let ids=[],historyIds=[];const messages=new Map();
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  global.fetch=async(input,options={})=>{
   const url=String(input);
   if(url==='https://oauth2.googleapis.com/token'){
    const params=new URLSearchParams(options.body);assert.equal(params.get('client_id'),'test.apps.googleusercontent.com');assert.equal(params.get('client_secret'),'fake-google-secret');
    if(params.get('grant_type')==='authorization_code'){exchangeCount++;assert(params.get('code_verifier'));return json({access_token:'fake-access',refresh_token:'fake-refresh',scope:require('../src/services/gmailConnection').SCOPE});}
    refreshCount++;return revoke?json({error:'invalid_grant'},400):json({access_token:'fake-access'});
   }
   if(url.startsWith('https://gmail.googleapis.com/')){
    assert.equal(options.headers.Authorization,'Bearer fake-access');
    if(denied)return json({error:{errors:[{reason:'forbidden'}]}},403);
    const parsed=new URL(url),path=parsed.pathname.split('/users/me/')[1];
    if(path==='profile')return json({emailAddress:profileAddress,historyId:'123'});
    if(path==='history')return json({history:historyIds.map(id=>({messagesAdded:[{message:{id}}]})),historyId:'124'});
    if(path==='messages'){
     assert(parsed.searchParams.get('q').includes('after:'));assert.equal(parsed.searchParams.get('includeSpamTrash'),'false');
     if(failList)return json({error:{message:'temporary'}},503);
     if(listPageMode&&!parsed.searchParams.get('pageToken'))return json({messages:ids.slice(0,1).map(id=>({id})),nextPageToken:'page-2'});
     return json({messages:(listPageMode?ids.slice(1):ids).map(id=>({id}))});
    }
    if(path.startsWith('threads/')){const threadId=decodeURIComponent(path.split('/')[1]);return json({id:threadId,messages:[...messages.values()].filter(m=>m.threadId===threadId).map(({id,threadId,internalDate,labelIds})=>({id,threadId,internalDate,labelIds}))});}
    const id=decodeURIComponent(path.split('/')[1]);return messages.has(id)?json(messages.get(id)):json({error:{}},404);
   }
   if(url.startsWith('https://'))throw Error('Unexpected external network request');
   return nativeFetch(input,options);
  };
  async function api(path='',method='GET',body,role='admin'){
   const response=await nativeFetch(base+'/api/config/admin/mcp'+path,{method,redirect:'manual',headers:{'Content-Type':'application/json',...(role?{'x-test-user':role}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
   if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
   const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,location:response.headers.get('location')};
  }
  for(const role of ['employee','manager'])for(const [path,method,body] of [['/gmail','GET'],['/gmail/settings','POST',{}],['/gmail/connect','POST',{}],['/gmail/callback?state=x','GET'],['/gmail/mailboxes/'+box,'POST',{action:'disconnect'}],['/gmail/mailboxes/'+box+'/retry','POST',{messageId:'x'}]])assert.equal((await api(path,method,body,role)).status,403);
  pass('Gmail settings, OAuth callback, mailbox controls and retry endpoints deny User and Manager');
  let r=await api('/gmail/settings','POST',{clientId:'test.apps.googleusercontent.com',clientSecret:'fake-google-secret'});assert.equal(r.status,200);
  r=await api('/gmail');assert.equal(r.data.redirectUri,'http://127.0.0.1:5173/api/config/admin/mcp/gmail/callback');assert(r.data.clientSecretSet);assert(!JSON.stringify(r.data).includes('fake-google-secret'));
  assert(!(await db.query('SELECT client_secret_encrypted FROM gmail_oauth_settings')).rows[0].client_secret_encrypted.includes('fake-google-secret'));
  const startAt=new Date(Date.now()-600000).toISOString();
  async function begin(){const response=await api('/gmail/connect','POST',{mailboxId:box,startAt});assert.equal(response.status,200);const url=new URL(response.data.url);assert.equal(url.hostname,'accounts.google.com');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),require('../src/services/gmailConnection').SCOPE);return url.searchParams.get('state');}
  const bad=await begin(),exchangesBefore=exchangeCount;assert((await api('/gmail/callback?code=fake-code&state=wrong')).location.endsWith('gmail=failed'));assert.equal(exchangeCount,exchangesBefore);
  assert((await api('/gmail/callback?code=fake-code&state='+bad)).location.endsWith('gmail=connected'));
  const exchangeAfter=exchangeCount;assert((await api('/gmail/callback?code=fake-code&state='+bad)).location.endsWith('gmail=failed'));assert.equal(exchangeCount,exchangeAfter);
  let conn=(await db.query('SELECT * FROM gmail_connections WHERE mailbox_id=$1',[box])).rows[0];assert.equal(conn.status,'connected');assert.equal(conn.start_at.toISOString(),startAt);assert(!conn.refresh_token_encrypted.includes('fake-refresh'));
  pass('Real session-bound OAuth state/PKCE/offline permission connects the exact mailbox; state replay is rejected and tokens stay encrypted');
  const gmailService=require('../src/services/gmailConnection');assert.equal(gmailService.validState('x',{stateHash:'0'.repeat(64),expires:Date.now()-1}),false);assert.equal(gmailService.validState(['x'],{}),false);
  profileAddress='wrong@example.test';const wrong=await begin();assert((await api('/gmail/callback?code=fake&state='+wrong)).location.endsWith('gmail=failed'));profileAddress='support@example.test';
  assert.equal((await db.query('SELECT connected_address FROM gmail_connections')).rows[0].connected_address,profileAddress);
  const cancelled=await begin();assert((await api('/gmail/callback?error=access_denied&state='+cancelled)).location.endsWith('gmail=failed'));
  pass('Wrong Google account and denied consent cannot replace an existing mailbox connection');
  function mail(id,thread='thread-1',text='Storage issue',extra={}){const raw=`From: =?UTF-8?B?RGVsbCBDdXN0b21lcg==?= <customer@dell.example>\r\nTo: support@example.test\r\nSubject: =?UTF-8?B?RGVsbCBzdG9yYWdlIGlzc3Vl?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`;const message={id,threadId:thread,internalDate:String(Date.now()-20000),labelIds:['INBOX'],raw:Buffer.from(raw).toString('base64url'),...extra};messages.set(id,message);return message;}
  mail('m1');mail('old','old-thread','Old issue',{internalDate:String(Date.now()-3600000)});mail('sent','sent-thread','Outgoing',{labelIds:['SENT']});mail('deleted');messages.delete('deleted');ids=['m1','old','sent','deleted'];listPageMode=true;
  const ingestion=require('../src/services/gmailIngestion');r=await ingestion.syncMailbox(box,{force:true});assert.equal(r.processed,1);assert.equal(r.skipped,3);
  let ticket=(await db.query("SELECT t.* FROM tickets t JOIN incoming_email_threads l ON l.ticket_id=t.id WHERE l.thread_id='thread-1'")).rows[0];assert(ticket);assert.equal(ticket.assigned_to,null);assert.equal(ticket.assignment_group_id,department);
  mail('history-only','thread-1','Late indexed customer reply');ids=[];historyIds=['history-only'];assert.equal((await ingestion.syncMailbox(box,{force:true})).processed,1);assert((await db.query("SELECT 1 FROM incoming_email_messages WHERE message_id='history-only'")).rowCount);historyIds=[];ids=['m1','old','sent','deleted'];
  pass('Gmail history discovers a new reply even when it is absent from the search listing');
  assert.equal((await db.query('SELECT short_description FROM tickets WHERE id=$1',[ticket.id])).rows[0].short_description,'Dell storage issue');
  const count=async table=>Number((await db.query('SELECT count(*) FROM '+table)).rows[0].count);const ticketCount=await count('tickets'),comments=await count('ticket_comments');
  await ingestion.syncMailbox(box,{force:true});assert.equal(await count('tickets'),ticketCount);assert.equal(await count('ticket_comments'),comments);
  await db.query("UPDATE gmail_delivery_queue SET status='pending',next_attempt_at=NOW() WHERE message_id='m1'");await ingestion.syncMailbox(box,{force:true});assert.equal(await count('ticket_comments'),comments);
  pass('Paged Gmail discovery creates a System/unassigned ticket via real MCP, excludes old/sent/deleted messages and survives scan repeats or post-commit queue retries');
  await db.query("UPDATE tickets SET status='CLOSED',assigned_to=$2 WHERE id=$1",[ticket.id,users.employee]);mail('m2','thread-1','The issue returned.\nPlease check again.');ids=['m2'];listPageMode=false;await ingestion.syncMailbox(box,{force:true});
  ticket=(await db.query('SELECT * FROM tickets WHERE id=$1',[ticket.id])).rows[0];assert.equal(ticket.status,'IN_PROGRESS');assert.equal(ticket.assigned_to,users.employee);assert.equal(await count('tickets'),ticketCount);
  pass('A real-ingestion reply uses the original Thread ID, reopens Closed to In Progress and preserves the assignee');
  const raw=`From: customer@dell.example\r\nTo: support@example.test\r\nSubject: Logs\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>HTML reply with logs</p>\r\n--x\r\nContent-Type: text/plain; name=logs.txt\r\nContent-Disposition: attachment; filename=logs.txt\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('Exact log bytes').toString('base64')}\r\n--x\r\nContent-Type: application/x-executable; name=bad.exe\r\nContent-Disposition: attachment; filename=bad.exe\r\n\r\nunsupported\r\n--x--`;
  mail('m3','thread-1','',{raw:Buffer.from(raw).toString('base64url')});ids=['m3'];await ingestion.syncMailbox(box,{force:true});
  assert.equal((await db.query('SELECT file_data FROM ticket_attachments WHERE ticket_id=$1',[ticket.id])).rows[0].file_data.toString(),'Exact log bytes');assert.equal((await db.query("SELECT attachment_warnings FROM gmail_delivery_queue WHERE message_id='m3'")).rows[0].attachment_warnings.length,1);
  assert((await db.query("SELECT body FROM ticket_comments WHERE id=(SELECT comment_id FROM incoming_email_messages WHERE message_id='m3')")).rows[0].body.includes('HTML reply with logs'));
  pass('MIME parsing decodes HTML-only bodies and attachment bytes; unsupported attachments are recorded as warnings');
  const parts=Array.from({length:11},(_,i)=>`--many\r\nContent-Type: text/plain; name=file${i}.txt\r\nContent-Disposition: attachment; filename=file${i}.txt\r\n\r\nlog ${i}\r\n`).join('');
  const many=mail('many','limits-thread','',{raw:Buffer.from('From: customer@dell.example\r\nSubject: Files\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=many\r\n\r\n--many\r\nContent-Type: text/plain\r\n\r\nBody\r\n'+parts+'--many--').toString('base64url')});
  const parsedMany=await ingestion.envelope({address:'support@example.test',start_at:startAt,sender_domains:[]},many);assert.equal(parsedMany.attachments.length,10);assert.equal(parsedMany.attachmentWarnings.length,1);
  assert((await ingestion.envelope({address:'support@example.test',start_at:startAt,sender_domains:['other.example']},messages.get('m1'))).skip.includes('domain'));
  mail('large','large-thread','a'.repeat(200001));ids=['large'];await ingestion.syncMailbox(box,{force:true});await db.query("UPDATE gmail_delivery_queue SET attempts=4,next_attempt_at=NOW() WHERE message_id='large'");await ingestion.syncMailbox(box,{force:true});assert.equal((await db.query("SELECT status FROM gmail_delivery_queue WHERE message_id='large'")).rows[0].status,'failed');
  pass('Expired/malformed OAuth state is rejected; sender restrictions, attachment count warnings and oversized-body failure remain visible');
  mail('review','new-thread','Unknown customer',{raw:Buffer.from('From: unknown@example.test\r\nSubject: Help\r\n\r\nPlease assist').toString('base64url')});ids=['review'];await ingestion.syncMailbox(box,{force:true});assert.equal((await db.query("SELECT status FROM gmail_delivery_queue WHERE message_id='review'")).rows[0].status,'processed');const unroutedId=(await db.query("SELECT ticket_id FROM gmail_delivery_queue WHERE message_id='review'")).rows[0].ticket_id;assert.equal((await db.query('SELECT routing_needs_review FROM tickets WHERE id=$1',[unroutedId])).rows[0].routing_needs_review,true);
  await db.query('INSERT INTO department_findings(department_id,content,created_by) VALUES($1,$2,$3)',[department,'unknown@example.test',users.admin]);assert.equal((await api('/gmail/mailboxes/'+box+'/retry','POST',{messageId:'review'})).status,400);await ingestion.syncMailbox(box,{force:true});assert.equal((await db.query("SELECT status FROM gmail_delivery_queue WHERE message_id='review'")).rows[0].status,'processed');
  pass('Unclear emails are captured once as unrouted tickets, and processed mail cannot be replayed into a duplicate');
  mail('retry','retry-thread');ids=['retry'];const beforeFailure=await count('tickets');await ingestion.syncMailbox(box,{force:true,clientFactory:async()=>({callTool:async()=>{throw Error('MCP offline');},close:async()=>{}})});assert.equal(await count('tickets'),beforeFailure);assert.equal((await db.query("SELECT status FROM gmail_delivery_queue WHERE message_id='retry'")).rows[0].status,'pending');await db.query("UPDATE gmail_delivery_queue SET next_attempt_at=NOW() WHERE message_id='retry'");await ingestion.syncMailbox(box,{force:true});assert.equal(await count('tickets'),beforeFailure+1);
  pass('Temporary processing failures keep a durable pending message; retry creates exactly one ticket');
  assert.equal((await api('/gmail/mailboxes/'+box,'POST',{action:'pause'})).status,200);assert.equal((await ingestion.syncMailbox(box)).paused,true);assert.equal((await api('/gmail/mailboxes/'+box,'POST',{action:'sync'})).status,400);await api('/gmail/mailboxes/'+box,'POST',{action:'resume'});
  const holder=await isolated.connect();await holder.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['gmail:'+box]);assert.equal((await ingestion.syncMailbox(box)).busy,true);await holder.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['gmail:'+box]);holder.release();
  conn=(await db.query('SELECT scan_after FROM gmail_connections')).rows[0];failList=true;await assert.rejects(ingestion.syncMailbox(box));failList=false;assert.equal((await db.query('SELECT scan_after FROM gmail_connections')).rows[0].scan_after.toISOString(),conn.scan_after.toISOString());
  revoke=true;await assert.rejects(ingestion.syncMailbox(box));assert.equal((await db.query('SELECT status FROM gmail_connections')).rows[0].status,'reauth_required');revoke=false;
  const again=await begin();assert((await api('/gmail/callback?code=fake&state='+again)).location.endsWith('gmail=connected'));assert.equal((await db.query('SELECT start_at FROM gmail_connections')).rows[0].start_at.toISOString(),startAt);
  pass('Pause/resume, worker locking, Google outages and revoked grants preserve checkpoints; reconnect retains the original start time');
  const total=await count('tickets');await api('/gmail/mailboxes/'+box,'POST',{action:'disconnect'});conn=(await db.query('SELECT * FROM gmail_connections')).rows[0];assert.equal(conn.refresh_token_encrypted,null);assert.equal(conn.status,'disconnected');assert.equal(await count('tickets'),total);assert.equal((await ingestion.syncMailbox(box)).paused,true);
  const final=await api('/gmail');assert(!JSON.stringify(final.data).includes('fake-google-secret'));assert(!JSON.stringify(final.data).includes('fake-refresh'));assert.equal(outboundCount,0);assert(refreshCount>0);await migrate(db);assert.equal(await count('tickets'),total);
  pass('Disconnect removes local authorization without deleting tickets/history; repeat migrations preserve data, public responses hide secrets and no outbound email is sent');
  console.log(checks+' Gmail integration checks passed. Google responses were simulated; MCP HTTP and database writes were real.');
 }finally{
  global.fetch=nativeFetch;outbound.enqueue=oldEnqueue;if(server)await new Promise(resolve=>server.close(resolve));if(isolated)await isolated.end();Object.assign(pool,oldPool);for(const name of names)if(env[name]===undefined)delete process.env[name];else process.env[name]=env[name];await db.query('SET search_path TO public');await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await db.end();await pool.end();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
