// SMTP integration tests use a disposable PostgreSQL schema and loopback servers.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),Module=require('node:module');
const {spawnSync}=require('node:child_process');
const https=require('node:https');
const {randomUUID}=require('node:crypto');
require('dotenv').config({path:path.join(__dirname,'../../.env')});
const {Pool}=require('pg');
const settings=require('../src/services/emailSettings');
const {authorize}=require('../src/access/policy');
const smtp=require('./email-test-smtp');
const root=path.resolve(__dirname,'../..');
let checks=0;
function check(name,condition){assert(condition,name);checks++;console.log('PASS: '+name);}
function load(relative,stubs){const file=path.join(root,relative),module={exports:{}};const native=Module.createRequire(file);vm.runInThisContext(Module.wrap(fs.readFileSync(file,'utf8')),{filename:file})(module.exports,n=>n in stubs?stubs[n]:native(n),module,file,path.dirname(file));return module.exports;}
function res(){return{statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
  const schema='email_verify_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.DATABASE_URL});
  const db=new Pool({connectionString:process.env.DATABASE_URL,options:'-c search_path='+schema+',public'});db.rawQuery=db.query.bind(db);
  const servers=[],temp=fs.mkdtempSync(path.join(os.tmpdir(),'servit-email-test-'));
  const keyFile=path.join(temp,'key.pem'),certFile=path.join(temp,'cert.pem');
  const openssl=process.env.TEST_OPENSSL||(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
  const certResult=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{windowsHide:true});
  assert.equal(certResult.status,0,'Set TEST_OPENSSL to an OpenSSL executable.');
  const certs={key:fs.readFileSync(keyFile),cert:fs.readFileSync(certFile)};
  const listener=async options=>{const server=await smtp({...certs,...options});servers.push(server);return server};
  const local=await listener();
  const actor=(await admin.query("SELECT id FROM users WHERE role='admin' AND deleted_at IS NULL LIMIT 1")).rows[0].id;
  const noop={info(){},error(){}};
  try{
    await admin.query('CREATE SCHEMA '+schema);
    await db.query(`CREATE TABLE email_config(id INTEGER PRIMARY KEY DEFAULT 1,smtp_host TEXT DEFAULT '',smtp_port INTEGER DEFAULT 587,smtp_user TEXT DEFAULT '',smtp_pass TEXT DEFAULT '',from_name TEXT DEFAULT '',from_email TEXT DEFAULT '',encryption TEXT DEFAULT 'tls',is_enabled BOOLEAN DEFAULT false,updated_at TIMESTAMPTZ DEFAULT NOW(),updated_by UUID);
      INSERT INTO email_config(id) VALUES(1);
      CREATE TABLE email_outbox(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),recipient TEXT NOT NULL,subject TEXT NOT NULL,html TEXT NOT NULL,from_name TEXT NOT NULL,from_email TEXT NOT NULL,status TEXT DEFAULT 'pending',attempts INTEGER DEFAULT 0,next_attempt_at TIMESTAMPTZ DEFAULT NOW(),locked_at TIMESTAMPTZ,sent_at TIMESTAMPTZ,last_error TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE organization_branding(id INTEGER,customize BOOLEAN,organization_name TEXT,service_desk_name TEXT);
      INSERT INTO organization_branding VALUES(1,true,'Example Organization','Example Desk');`);
    await settings.init(db);await settings.init(db);
    check('Email schema migration is idempotent',true);
    const encrypted=settings.encrypt('fake-audit-password');
    check('AES-GCM encrypts and decrypts credentials',encrypted!=='fake-audit-password'&&settings.decrypt(encrypted)==='fake-audit-password');
    assert.throws(()=>settings.decrypt(encrypted.slice(0,-4)+'AAAA'));checks++;
    const controller=load('server/src/controllers/emailConfigController.js',{'../db/pool':db,'./adminAuditController':{logAdminAudit(){}}});
    const delivery=load('server/src/services/emailDelivery.js',{'../db/pool':db,'../utils/logger':noop});
    const service=load('server/src/services/emailService.js',{'../db/pool':db,'./emailDelivery':delivery,'../utils/logger':noop});
    const all={'email.view':'all','email.edit':'all','email.test':'all','email.toggle':'all','email.history':'all','email.retry':'all'};
    async function call(handler,body={},permissions=all,expected=200,params={}){
      const p=handler==='testConfig'?'/admin/email/test':handler==='deliveries'?'/admin/email/deliveries':handler==='retry'?'/admin/email/retry/'+params.id:'/admin/email';
      const request={body,params,query:{},method:['getConfig','deliveries'].includes(handler)?'GET':'POST',path:p,baseUrl:'/api/config',session:{userId:actor},access:{admin:false,permissions,role:'test',userId:actor},ip:'127.0.0.1'};
      const response=res();try{await authorize(request,db);await controller[handler](request,response,error=>{throw error})}catch(error){response.statusCode=error.status||500;response.body={message:error.message};}
      assert.equal(response.statusCode,expected,handler+': '+JSON.stringify(response.body));checks++;return response.body;
    }
    const base={smtp_host:'127.0.0.1',smtp_port:local.port,smtp_user:'audit@example.invalid',smtp_pass:'fake-audit-password',from_name:'Example Desk',from_email:'audit@example.invalid',encryption:'none',auth_type:'password',is_enabled:false};
    await call('saveConfig',base);
    const saved=(await db.query('SELECT * FROM email_config')).rows[0];
    check('Database stores ciphertext and API does not expose credentials',saved.smtp_pass.startsWith('enc:v1:')&&!JSON.stringify(await call('getConfig')).includes('fake-audit-password'));
    await call('saveConfig',{from_name:'Updated sender'},{'email.view':'all','email.edit':'all'});
    check('Partial save preserves credentials and disabled state',(await db.query('SELECT NOT is_enabled AND smtp_pass=$1 AS ok FROM email_config',[saved.smtp_pass])).rows[0].ok);
    await call('saveConfig',{is_enabled:true},{'email.view':'all','email.edit':'all'},403);
    await call('saveConfig',{is_enabled:true},{'email.view':'all','email.toggle':'all'});
    await call('saveConfig',{is_enabled:false},{'email.view':'all','email.toggle':'all'});
    await call('saveConfig',{from_name:'Denied'},{'email.view':'all'},403);
    for(const body of [{smtp_port:-1},{smtp_port:'587bad'},{smtp_port:65536},{encryption:'INVALID'},{from_email:'not-an-email'},{is_enabled:'false'},{smtp_host:'https://bad.invalid'},{unexpected:true}])await call('saveConfig',body,all,400);
    await call('saveConfig',{smtp_pass:''});
    check('Blank credential input preserves saved password',settings.decrypt((await db.query('SELECT smtp_pass FROM email_config')).rows[0].smtp_pass)==='fake-audit-password');
    await call('testConfig',{test_to:'recipient@example.invalid'},{'email.view':'all','email.test':'all'});
    check('Test-only role sends using saved settings',local.messages.length===1);
    await call('testConfig',{test_to:'recipient@example.invalid',from_name:'Override'},{'email.view':'all','email.test':'all'},403);
    await call('testConfig',{test_to:'recipient@example.invalid'},{'email.view':'all'},403);
    await call('testConfig',{test_to:'invalid'},all,400);
    await call('testConfig',{test_to:'recipient@example.invalid',smtp_pass:'wrong'},all,400);
    const rejected=await listener({rejectRecipient:true});
    await call('testConfig',{...base,smtp_port:rejected.port,test_to:'recipient@example.invalid'},all,400);
    const ssl=await listener({implicitTLS:true}),starttls=await listener({starttls:true});
    for(const [server,encryption] of [[ssl,'ssl'],[starttls,'tls']]){
      await call('testConfig',{...base,smtp_port:server.port,encryption,tls_servername:'localhost',test_to:'recipient@example.invalid'},all,400);
      check(encryption+' rejects untrusted certificate',server.messages.length===0);
      await call('testConfig',{...base,smtp_port:server.port,encryption,tls_servername:'localhost',tls_ca:certs.cert.toString(),test_to:'recipient@example.invalid'});
      check(encryption+' accepts correctly trusted private CA',server.messages.length===1);
    }
    await call('testConfig',{...base,encryption:'tls',test_to:'recipient@example.invalid'},all,400);
    await call('saveConfig',{auth_type:'none'});
    await call('testConfig',{test_to:'recipient@example.invalid'});
    check('Approved relay works without authentication',true);
    await call('saveConfig',{...base,smtp_pass:'fake-audit-password'});
    const oauth={...saved,auth_type:'oauth2',oauth_client_id:'test-client',oauth_client_secret:settings.encrypt('fake-client-secret'),oauth_refresh_token:settings.encrypt('fake-refresh'),oauth_token_url:'https://oauth2.googleapis.com/token'};
    const oauthTransport=settings.transport(oauth);
    oauthTransport.set('oauth2_provision_cb',(user,renew,cb)=>cb(null,'fake-access',Date.now()+3600000));
    await oauthTransport.sendMail({from:'audit@example.invalid',to:'recipient@example.invalid',subject:'OAuth fixture',text:'Local OAuth SMTP test'});oauthTransport.close();
    check('OAuth2 SMTP uses XOAUTH2 token authentication',local.authentications.some(a=>a.oauth2));
    let tokenRequests=0,refreshRequest,rotated=false;
    const tokenServer=https.createServer(certs,(request,response)=>{let text='';request.on('data',chunk=>text+=chunk);request.on('end',()=>{tokenRequests++;refreshRequest=new URLSearchParams(text);response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({access_token:'fake-access',refresh_token:'fake-rotated-refresh',expires_in:3600}));});});
    await new Promise(resolve=>tokenServer.listen(0,'127.0.0.1',resolve));
    servers.push({close:async()=>{tokenServer.closeAllConnections();await new Promise(resolve=>tokenServer.close(resolve));}});
    const refreshed=settings.transport({...oauth,tls_ca:certs.cert.toString(),oauth_token_url:'https://127.0.0.1:'+tokenServer.address().port+'/token'},async(next,previous)=>{rotated=settings.decrypt(next)==='fake-rotated-refresh'&&settings.decrypt(previous)==='fake-refresh';});
    await refreshed.verify();await refreshed.sendMail({from:'audit@example.invalid',to:'recipient@example.invalid',subject:'OAuth refresh fixture',text:'Test'});refreshed.close();
    check('OAuth2 obtains and reuses a real HTTPS refresh response',tokenRequests===1&&refreshRequest.get('grant_type')==='refresh_token'&&refreshRequest.get('refresh_token')==='fake-refresh');
    check('Rotating OAuth refresh tokens are encrypted and persisted through callback',rotated);
    await call('saveConfig',{clear_smtp_pass:true});
    check('Explicit clear removes encrypted secret while disabled',!(await db.query('SELECT smtp_pass FROM email_config')).rows[0].smtp_pass);
    await call('saveConfig',{is_enabled:true},all,400);
    await call('saveConfig',{smtp_pass:'fake-audit-password',is_enabled:true});
    const ticket={id:randomUUID(),ticket_number:'TEST001',short_description:'<b>Untrusted subject</b>',customer_name:'Example & Co',priority:'HIGH',status:'NEW'};
    await service.notifyStatusChanged(ticket,'NEW','OPEN','Actor',['same@example.invalid','same@example.invalid']);
    check('Duplicate recipients produce one queued message',Number((await db.query('SELECT COUNT(*) FROM email_outbox')).rows[0].count)===1);
    await service.notifyCommentAdded(ticket,'<img src=x onerror=bad>','Actor','WORK_NOTE',['recipient@example.invalid']);
    let jobs=(await db.query('SELECT * FROM email_outbox')).rows;
    check('Email HTML is escaped and organization branding applied',jobs.every(j=>!j.html.includes('<b>Untrusted')&&!j.html.includes('<img src=x'))&&jobs.every(j=>j.html.includes('Example Organization')));
    const before=local.messages.length;await delivery.processQueue();
    check('Durable queue delivers and records accepted messages',local.messages.length===before+2&&Number((await db.query("SELECT COUNT(*) FROM email_outbox WHERE status='sent'")).rows[0].count)===2);
    for(const send of [()=>service.notifyTicketCreated(ticket,'Actor','recipient@example.invalid'),()=>service.notifyTicketAssigned(ticket,'Actor','recipient@example.invalid'),()=>service.notifyTicketResolved(ticket,'Actor',['recipient@example.invalid']),()=>service.notifyCommentAdded(ticket,'Comment','Actor','COMMENT',['recipient@example.invalid']),()=>service.notifySLAWarn(ticket,'SLA',50,30,['recipient@example.invalid']),()=>service.notifySLACritical(ticket,'SLA',75,15,['recipient@example.invalid']),()=>service.notifySLABreach(ticket,'SLA',15,['recipient@example.invalid'])])await send();
    const worker2=load('server/src/services/emailDelivery.js',{'../db/pool':db,'../utils/logger':noop});
    const beforeConcurrent=local.messages.length;await Promise.all([delivery.processQueue(),worker2.processQueue()]);
    check('Concurrent workers deliver seven jobs without duplicates',local.messages.length===beforeConcurrent+7);
    await db.query('UPDATE email_config SET smtp_pass=$1',[settings.encrypt('wrong')]);
    await service.notifyTicketCreated(ticket,'Actor','recipient@example.invalid');
    for(let i=0;i<3;i++){await db.query("UPDATE email_outbox SET next_attempt_at=NOW() WHERE status='pending'");await delivery.processQueue();}
    const failed=(await db.query("SELECT * FROM email_outbox WHERE status='failed'")).rows[0];
    check('Failed delivery retries three times and records a safe error',failed?.attempts===3&&failed.last_error.includes('authentication')&&!failed.last_error.includes('wrong'));
    await db.query('UPDATE email_config SET smtp_pass=$1',[settings.encrypt('fake-audit-password')]);
    await call('retry',{}, {'email.view':'all','email.test':'all'},403,{id:failed.id});
    await call('deliveries',{}, {'email.view':'all'},403);
    await call('retry',{},all,400,{id:'-'.repeat(36)});
    await call('retry',{},all,200,{id:failed.id});await delivery.processQueue();
    check('Manual retry recovers a failed delivery',(await db.query('SELECT status FROM email_outbox WHERE id=$1',[failed.id])).rows[0].status==='sent');
    const stale=(await db.query("INSERT INTO email_outbox(recipient,subject,html,from_name,from_email,status,attempts,locked_at) VALUES('recipient@example.invalid','Interrupted','Test','Test','audit@example.invalid','sending',3,NOW()-INTERVAL '10 minutes') RETURNING id")).rows[0];
    await delivery.processQueue();
    check('Interrupted final attempts stop at the retry limit',(await db.query('SELECT status,attempts FROM email_outbox WHERE id=$1',[stale.id])).rows[0].status==='failed');
    const history=await call('deliveries');check('Delivery history contains safe metadata only',history.deliveries.length>0&&history.deliveries.every(d=>!('html'in d)&&!('smtp_pass'in d)));
    await call('saveConfig',{is_enabled:false});const count=Number((await db.query('SELECT COUNT(*) FROM email_outbox')).rows[0].count);await service.notifyTicketCreated(ticket,'Actor','recipient@example.invalid');check('Disabled notifications do not enqueue messages',Number((await db.query('SELECT COUNT(*) FROM email_outbox')).rows[0].count)===count);
    // Reproduce combined edit notifications using the actual unchanged controller.
    const creator=randomUUID(),oldAssignee=randomUUID(),newAssignee=randomUUID(),original={...ticket,created_by:creator,assigned_to:oldAssignee,short_description:'Old subject'},updated={...original,assigned_to:newAssignee,status:'RESOLVED',short_description:'New subject'};
    const notices=[],queries=[];let notes=0;
    const transaction={release(){},async query(sql,params){if(sql.startsWith('SELECT * FROM tickets'))return{rows:[{...original}]};if(sql.startsWith('UPDATE tickets'))return{rows:[updated]};if(sql.includes('SELECT full_name'))return{rows:[{full_name:'Actor'}]};if(sql.includes('INSERT INTO ticket_comments'))notes++;return{rows:[]};}};
    const ticketPool={async connect(){return transaction},async query(sql,params){queries.push({sql,params});return sql.includes('SELECT full_name')?{rows:[{full_name:'Actor'}]}:{rows:[{email:'recipient@example.invalid'}]};}};
    const spy=new Proxy({},{get:(_,name)=>(...args)=>{notices.push({name,args});return Promise.resolve()}});
    const tickets=load('server/src/controllers/ticketController.js',{'../db/pool':ticketPool,'../services/emailService':spy,'../utils/logger':noop,'../access/policy':{recordCan:()=>true},'../services/templateService':{resolveTicketTemplate(){}},'../services/slaService':{onStatusChange:async()=>{}}});
    await tickets.update({params:{id:ticket.id},body:{assignedTo:newAssignee,status:'RESOLVED',shortDescription:'New subject',workNote:'Progress'},session:{userId:actor,role:'admin',username:'audit'},access:{admin:true},ip:'127.0.0.1'},res(),e=>{throw e});await flush();await flush();
    check('Reassignment/status notifications use updated ticket details and assignee',notices.some(n=>n.name==='notifyTicketAssigned'&&n.args[0].short_description==='New subject')&&queries.filter(q=>q.sql.includes('SELECT email')).every(q=>!q.params.flat().includes(oldAssignee)));
    check('Work notes saved with ticket edits trigger notification',notes===1&&notices.some(n=>n.name==='notifyCommentAdded'&&n.args[3]==='WORK_NOTE'));
    notices.length=0;await tickets.update({params:{id:ticket.id},body:{workNote:'Note only'},session:{userId:actor,role:'admin',username:'audit'},access:{admin:true},ip:'127.0.0.1'},res(),e=>{throw e});await flush();await flush();check('Note-only edits trigger work-note notification',notices.some(n=>n.name==='notifyCommentAdded'));
    console.log('Email integration passed: '+checks+' checks.');
  }finally{for(const server of servers)await server.close();await db.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();const resolved=path.resolve(temp);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('servit-email-test-'));fs.rmSync(resolved,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
