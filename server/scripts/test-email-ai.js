const assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express');
const {Client,Pool}=require('pg'),{migrate,connectionConfig}=require('../../database/migrate');
const pool=require('../src/db/pool');let checks=0;const pass=text=>{checks++;console.log('PASS: '+text);};
async function main(){
 const db=new Client(connectionConfig());await db.connect();const schema='email_ai_test_'+crypto.randomBytes(8).toString('hex'),saved={query:pool.query,rawQuery:pool.rawQuery,connect:pool.connect},originalFetch=global.fetch,oldKey=process.env.EMAIL_ENCRYPTION_KEY;
 let isolated,server;
 try{
  await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);await migrate(db);isolated=new Pool({...connectionConfig(),options:'-c search_path='+schema});pool.query=isolated.query.bind(isolated);pool.rawQuery=pool.query;pool.connect=isolated.connect.bind(isolated);process.env.EMAIL_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  const ids={};for(const role of ['admin','employee','manager'])ids[role]=(await db.query('INSERT INTO users(username,email,full_name,password_hash,role) VALUES($1,$2,$1,$3,$4) RETURNING id',[role,role+'@example.test','unused',role])).rows[0].id;
  const a=(await db.query("INSERT INTO assignment_groups(name,description) VALUES('Dell','Storage support') RETURNING id")).rows[0].id,b=(await db.query("INSERT INTO assignment_groups(name) VALUES('Finance') RETURNING id")).rows[0].id;
  await db.query('INSERT INTO department_findings(department_id,content,created_by) VALUES($1,$2,$3)',[a,'customer@dell.example',ids.admin]);
  await db.query(`INSERT INTO ticket_fields(field_key,label,field_type,is_required,options) VALUES('country','Country','dropdown',TRUE,'[{"value":"IN","label":"India"}]')`);
  await db.query("INSERT INTO email_automation_mailboxes(address,defaults) VALUES('support@example.test','{}')");
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={userId:ids[req.headers['x-test-role']||'admin'],destroy(){}};next();});app.use('/api/config',require('../src/routes/config'));app.use('/api/audit',require('../src/routes/audit'));app.use((e,req,res,next)=>{if(!e.status)console.error('Test API:',e.message);res.status(e.status||500).json({message:e.status?e.message:'Test API failure'});});server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const api=async(path='',body,role='admin')=>{const r=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/config/admin/mcp/ai'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-test-role':role},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  for(const role of ['employee','manager'])for(const [path,body] of [['',undefined],['/providers',{}],['/test',{}],['/activate',{}]])assert.equal((await api(path,body,role)).status,403);
  pass('AI credentials, connection checks and activation are Admin-only for all three providers');
  const ai=require('../src/services/emailAI');let mode='good',requests=[],race=false;
  const modelAnswer={departmentId:b,subdepartmentId:null,routingEvidence:'Dell issue',fields:[{key:'customerName',value:'Dell',evidence:'Customer: Dell.'},{key:'moduleText',value:'FlashArray',evidence:'Module: FlashArray.'},{key:'priority',value:'HIGH',evidence:'Priority: HIGH.'},{key:'impact',value:'LOW',evidence:'Priority: HIGH.'},{key:'customData.country',value:'IN',evidence:'Country: India.'},{key:'customData.fake',value:'Invented',evidence:'Country: India.'},{key:'categoryId',value:crypto.randomUUID(),evidence:'Dell issue'},{key:'assignedTo',value:ids.admin,evidence:'Dell issue'},{key:'status',value:'CLOSED',evidence:'Dell issue'}]};
  global.fetch=async(url,options)=>{
   const provider=String(url).startsWith('https://api.openai.com/')?'openai':String(url).startsWith('https://generativelanguage.googleapis.com/')?'gemini':String(url).startsWith('https://api.anthropic.com/')?'claude':null;assert(provider,'Only fixed provider API hosts may receive credentials');
   const body=JSON.parse(options.body);requests.push(provider);assert(options.redirect==='error');assert(body.model||provider==='gemini');assert(!String(url).includes('fake-key'));
   const input=JSON.parse(provider==='openai'?body.input:provider==='gemini'?body.contents[0].parts[0].text:body.messages[0].content);
   if(provider==='openai'){assert.equal(options.headers.Authorization,'Bearer fake-key-openai');assert.equal(body.store,false);assert(body.text.format.schema);}
   if(provider==='gemini'){assert.equal(options.headers['x-goog-api-key'],'fake-key-gemini');assert(body.generationConfig.responseJsonSchema);}
   if(provider==='claude'){assert.equal(options.headers['x-api-key'],'fake-key-claude');assert(body.output_config.format.schema);assert(options.headers['anthropic-version']);}
   if(race){race=false;await db.query('UPDATE email_ai_providers SET version=version+1,status=$2 WHERE provider=$1',[provider,'untested']);}
   if(mode==='error')return new Response('{"error":"fake-key-must-not-leak"}',{status:401});
   if(mode==='network-once'){mode='good';throw Object.assign(new Error('Simulated socket timeout'),{name:'TimeoutError'});}
   if(mode==='rate-limit')return new Response('{}',{status:429,headers:{'Retry-After':'120'}});
   if(mode==='overload'||mode==='overload-once'){if(mode==='overload-once')mode='good';return new Response('{"error":{"message":"Temporary overload"}}',{status:503});}
   const answer=mode==='badjson'?'not JSON':JSON.stringify(input.email.sender==='test@example.invalid'?{departmentId:null,subdepartmentId:null,routingEvidence:null,fields:[]}:modelAnswer);
   const result=provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text:answer}]}]}:provider==='gemini'?{candidates:[{finishReason:'STOP',content:{parts:[{text:answer}]}}]}:{stop_reason:'end_turn',content:[{type:'text',text:answer}]};
   return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  };
  assert.equal((await api()).data.enabled,false);const input={mailbox:'support@example.test',messageId:'ai-first',threadId:'ai-thread',sender:'customer@dell.example',subject:'Dell issue',body:'Customer: Dell. Module: FlashArray. Country: India. Priority: HIGH.'};assert.deepEqual(await ai.enrich(input),input);assert.equal(requests.length,0);
  for(const provider of ['openai','gemini','claude']){
   assert.equal((await api('/providers',{provider,model:'test-'+provider,apiKey:'fake-key-'+provider})).status,200);assert.equal((await api('/activate',{enabled:true,provider})).status,400);assert.equal((await api('/test',{provider})).status,200);assert((await api()).data.providers.some(p=>p.provider===provider&&p.status==='connected'));
  }
  assert(!(await db.query('SELECT api_key_encrypted FROM email_ai_providers')).rows.some(row=>row.api_key_encrypted.includes('fake-key')));assert(!JSON.stringify((await api()).data).includes('fake-key'));
  pass('OpenAI, Gemini and Claude use real documented request shapes; checks validate model output, encrypted keys stay private and untested providers cannot be activated');
  for(const provider of ['openai','gemini','claude']){
   await api('/activate',{enabled:true,provider});const start=requests.length,enriched=await ai.enrich({...input,messageId:'ai-'+provider,threadId:'thread-'+provider});assert.deepEqual(requests.slice(start),[provider]);assert.equal(enriched.ticketFields.customerName,'Dell');assert.equal(enriched.ticketFields.priority,'HIGH');assert.equal(enriched.ticketFields.customData.country,'IN');assert.equal(enriched.ticketFields.impact,undefined);assert.equal(enriched.ticketFields.categoryId,undefined);assert.equal(enriched.ticketFields.assignedTo,undefined);assert.equal(enriched.ticketFields.status,undefined);assert.equal(enriched.aiMetadata.provider,provider);
   const result=await require('../src/services/emailProcessing').processEmail(enriched);assert.equal(result.departmentId,a);assert.equal(result.detailsIncomplete,true);const ticket=(await db.query('SELECT * FROM tickets WHERE id=$1',[result.ticketId])).rows[0];assert.equal(ticket.category_id,null);assert.equal(ticket.impact,null);assert.equal(ticket.urgency,null);assert.equal(ticket.assigned_to,null);assert.equal(ticket.status,'NEW');assert.equal(ticket.custom_data.country,'IN');
   const after=requests.length;assert.equal((await ai.enrich(enriched)).aiMetadata.provider,provider);await ai.enrich({...input,messageId:'reply-'+provider,threadId:'thread-'+provider});assert.equal(requests.length,after);
  }
  pass('Switching providers uses only the selected vendor; supported evidence is applied, invented/privileged fields are discarded, findings win, missing values stay null and replies/duplicates skip AI');
  await api('/activate',{enabled:true,provider:'openai'});mode='error';const failed=await ai.enrich({...input,messageId:'failed-ai',threadId:'failed-ai-thread'});assert.equal(failed.aiMetadata.status,'failed');assert.equal(failed.ticketFields,undefined);const captured=await require('../src/services/emailProcessing').processEmail(failed);assert(captured.ticketId);assert.equal(captured.detailsIncomplete,true);assert.equal(captured.aiStatus,'failed');assert.equal((await api()).data.connected,false);assert(!JSON.stringify((await api()).data).includes('fake-key-must-not-leak'));
  pass('Provider failure still captures the original email ticket without fabricated values and shows a sanitized connection error');
  const authRequests=requests.length;await ai.enrich({...input,messageId:'auth-needs-review',threadId:'auth-needs-review'});assert.equal(requests.length,authRequests);
  mode='good';await api('/activate',{enabled:true,provider:'gemini'});let retryStart=requests.length;mode='overload-once';const recovered=await ai.enrich({...input,messageId:'transient-ai',threadId:'transient-ai'});assert.equal(recovered.aiMetadata.status,'applied');assert.equal(requests.length-retryStart,2);
  mode='overload';retryStart=requests.length;const overloaded=await ai.enrich({...input,sender:'unknown@example.test',messageId:'overloaded-labelled',threadId:'overloaded-labelled',body:'Department: Finance\nCustomer: Dell\nModule: FlashArray\nCountry: India\nPriority: HIGH'});assert.equal(overloaded.aiMetadata.status,'failed');assert.equal(requests.length-retryStart,2);assert((await api()).data.providers.find(p=>p.provider==='gemini').last_error.includes('overloaded'));const routedDespiteOutage=await require('../src/services/emailProcessing').processEmail(overloaded);assert.match(routedDespiteOutage.ticketNumber,/^INC\d+$/);assert.equal(routedDespiteOutage.departmentId,b);assert.equal(routedDespiteOutage.assignedTo,null);
  pass('Temporary overload is retried once; persistent 503 errors are identified accurately and labelled routing still creates an INC ticket');
  let health=(await api()).data;assert.equal(health.enabled,true);assert.equal(health.connected,true);assert.equal(health.degraded,true);assert.equal(health.providers.find(p=>p.provider==='gemini').status,'connected');
  const beforeCooldown=requests.length,oldRetry=health.providers.find(p=>p.provider==='gemini').retry_after;assert(oldRetry);assert.equal((await ai.enrich({...input,messageId:'during-cooldown',threadId:'during-cooldown'})).aiMetadata.status,'failed');assert.equal(requests.length,beforeCooldown);
  assert.equal((await api('/test',{provider:'gemini'})).status,400);health=(await api()).data;assert.equal(health.connected,true);assert(new Date(health.providers.find(p=>p.provider==='gemini').retry_after)>new Date(oldRetry));
  await db.query("UPDATE email_ai_providers SET retry_after=NOW()-INTERVAL '1 second' WHERE provider='gemini'");mode='network-once';retryStart=requests.length;assert.equal((await ai.enrich({...input,messageId:'recovered-network',threadId:'recovered-network'})).aiMetadata.status,'applied');assert.equal(requests.length-retryStart,2);health=(await api()).data;assert.equal(health.degraded,false);assert.equal(health.providers.find(p=>p.provider==='gemini').consecutive_failures,0);assert.equal(health.providers.find(p=>p.provider==='gemini').retry_after,null);
  pass('Overload keeps verified credentials and activation, cooldown suppresses repeated calls, backoff increases, and the next successful email automatically clears service warnings');
  mode='rate-limit';retryStart=requests.length;assert.equal((await ai.enrich({...input,messageId:'quota-case',threadId:'quota-case'})).aiMetadata.status,'failed');assert.equal(requests.length-retryStart,1);health=(await api()).data;assert(health.degraded);assert(new Date(health.providers.find(p=>p.provider==='gemini').retry_after).getTime()>Date.now()+110000);assert.equal(health.connected,true);
  await db.query("UPDATE email_ai_providers SET retry_after=NOW()-INTERVAL '1 second' WHERE provider='gemini'");
  pass('Rate limiting preserves the verified connection and honors Retry-After instead of repeatedly calling the provider');
  mode='good';const recoveryStart=requests.length;await Promise.all([ai.recoverAvailability(),ai.recoverAvailability()]);assert.equal(requests.length-recoveryStart,1);assert.equal((await api()).data.degraded,false);assert.equal((await api()).data.connected,true);
  await ai.recoverAvailability();assert.equal(requests.length-recoveryStart,1);
  await db.query("UPDATE email_ai_providers SET last_error_kind='transient',retry_after=NOW()+INTERVAL '5 minutes' WHERE provider='gemini'");await ai.recoverAvailability();assert.equal(requests.length-recoveryStart,1);
  await db.query("UPDATE email_ai_providers SET retry_after=NOW()-INTERVAL '1 second' WHERE provider='gemini'");await api('/activate',{enabled:false,provider:'gemini'});await ai.recoverAvailability();assert.equal(requests.length-recoveryStart,1);await api('/activate',{enabled:true,provider:'gemini'});await ai.recoverAvailability();assert.equal((await api()).data.degraded,false);
  pass('One automatic synthetic health check restores service after cooldown without a new email; concurrent workers, future retry times and disabled AI do not generate extra requests');
  mode='good';
  const parentOnly=await require('../src/services/emailProcessing').processEmail(await ai.enrich({...input,sender:'other@example.test',messageId:'parent-ai',threadId:'parent-ai'}));assert.equal(parentOnly.departmentId,b);assert.equal(parentOnly.subdepartmentId,null);assert.equal(parentOnly.assignedTo,null);assert.equal(parentOnly.needsRouting,false);
  modelAnswer.departmentId=null;modelAnswer.subdepartmentId=null;modelAnswer.routingEvidence=null;
  for(const provider of ['openai','gemini','claude']){
   await api('/test',{provider});await api('/activate',{enabled:true,provider});
   const unresolved=await require('../src/services/emailProcessing').processEmail(await ai.enrich({...input,sender:'unknown@example.test',subject:'Question',body:'Please assist.',messageId:'unresolved-'+provider,threadId:'unresolved-'+provider}));assert.equal(unresolved.departmentId,null);assert.equal(unresolved.assignedTo,ids.admin);assert.equal(unresolved.needsRouting,true);assert.equal(unresolved.status,'NEW');
  }
  pass('A valid AI department-only match stays unassigned in that team; unresolved routes from OpenAI, Gemini and Claude are assigned to Admin');
  mode='badjson';assert.equal((await api('/test',{provider:'gemini'})).status,400);mode='good';race=true;assert.equal((await api('/test',{provider:'claude'})).status,409);await api('/test',{provider:'claude'});await api('/activate',{enabled:true,provider:'claude'});
  assert.equal((await api('/providers',{provider:'claude',model:'changed-model',apiKey:''})).status,200);assert.equal((await api()).data.enabled,false);assert.equal((await api()).data.providers.find(p=>p.provider==='claude').status,'untested');
  pass('Malformed responses, stale checks and changed models cannot leave AI falsely ready; changing active credentials/model disables processing until rechecked');
  const before=(await db.query('SELECT count(*) FROM tickets')).rows[0].count;await migrate(db);assert.equal((await db.query('SELECT count(*) FROM tickets')).rows[0].count,before);assert.equal((await api()).data.providers.filter(p=>p.keySet).length,3);
  pass('Repeated migrations preserve captured tickets and all three encrypted provider configurations');

  const aiLogs=(await db.query('SELECT * FROM email_ai_logs ORDER BY created_at')).rows;
  assert(aiLogs.some(l=>l.purpose==='connection_check'&&l.outcome==='success'));
  assert(aiLogs.some(l=>l.purpose==='recovery_check'&&l.outcome==='success'));
  const authLog=aiLogs.find(l=>l.message_id==='failed-ai');assert.equal(authLog.outcome,'failed');assert.equal(authLog.error_code,'HTTP_401');assert.equal(authLog.attempts[0].httpStatus,401);
  const retried=aiLogs.find(l=>l.message_id==='transient-ai');assert.equal(retried.outcome,'success');assert.equal(retried.attempts.length,2);assert.deepEqual(retried.attempts.map(a=>a.httpStatus),[503,200]);assert.equal(retried.attempts[0].retryScheduled,true);
  assert.equal(aiLogs.find(l=>l.message_id==='quota-case').error_code,'HTTP_429');
  assert.equal(aiLogs.find(l=>l.message_id==='during-cooldown').outcome,'deferred');
  assert(aiLogs.some(l=>l.outcome==='skipped'&&l.thread_id==='thread-openai'));
  assert(aiLogs.some(l=>l.error_code==='INVALID_STRUCTURED_OUTPUT'));
  const serialized=JSON.stringify(aiLogs);for(const secret of ['fake-key','Customer: Dell. Module: FlashArray.','customer@dell.example','routingEvidence','api_key_encrypted'])assert(!serialized.includes(secret),'Sensitive data leaked: '+secret);
  pass('AI history persists all provider successes, failures, 401/429 diagnostics, both retry attempts, cooldown decisions, thread skips and recovery checks without keys, email bodies or model text');
  const auditApi=async(path,role='admin',body)=>{const r=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/audit'+path,{method:body?'PUT':'GET',headers:{'x-test-role':role,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};};
  const day=new Date().toISOString().slice(0,10),[yr,mo]=day.split('-');
  const query='?date='+day+'&year='+yr+'&month='+mo+'&tz=UTC';
  for(const role of ['employee','manager'])assert.equal((await auditApi('/ai'+query,role)).status,403);
  let listed=await auditApi('/ai'+query);assert.equal(listed.status,200);assert.equal(listed.data.summary.total,aiLogs.length);assert(listed.data.activeDays.includes(day));assert(listed.data.logs.some(l=>l.message_id==='failed-ai'&&l.ticket_number===captured.ticketNumber));
  listed=await auditApi('/ai'+query+'&status=failed&provider=openai&search=failed-ai');assert.equal(listed.data.summary.total,1);assert.equal(listed.data.logs[0].error_code,'HTTP_401');
  listed=await auditApi('/ai'+query+'&limit=1&page=2');assert.equal(listed.data.logs.length,1);assert(listed.data.pagination.pages>1);
  for(const invalid of ['&status=oops','&provider=evil','&limit=-1','&page=1.5','&tz=NotAZone'])assert.equal((await auditApi('/ai'+query+invalid)).status,400);
  pass('AI Logs API is Admin-only, resolves ticket links, supports server-side search/outcome/provider filters, local calendar dates and pagination, and rejects invalid queries');
  assert.equal((await auditApi('/retention','admin',{ai_enabled:true,ai_retention_days:0})).status,400);
  assert.equal((await auditApi('/retention','admin',{ai_enabled:'false',ai_retention_days:30})).status,400);
  const savedPolicy=await auditApi('/retention','admin',{ai_enabled:true,ai_retention_days:7});assert.equal(savedPolicy.status,200);assert.equal(savedPolicy.data.settings.ai_retention_days,7);
  const oldId=aiLogs[0].id;await db.query("UPDATE email_ai_logs SET created_at=NOW()-INTERVAL '8 days' WHERE id=$1",[oldId]);
  const integrity=async()=>{const out={};for(const table of ['tickets','ticket_comments','ticket_attachments','incoming_email_messages','incoming_email_threads','email_ai_providers'])out[table]=(await db.query("SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) hash FROM "+table+" t")).rows[0].hash;return out;};
  const snapshots=await integrity();const removed=await require('../src/services/aiLogs').cleanup();assert.equal(removed.rowCount,1);assert.deepEqual(await integrity(),snapshots);
  await auditApi('/retention','admin',{ai_enabled:false});await db.query("UPDATE email_ai_logs SET created_at=NOW()-INTERVAL '100 days'");assert.equal((await require('../src/services/aiLogs').cleanup()).rowCount,0);
  pass('AI retention validates and saves the policy, deletes only expired AI logs, honors disabled deletion and preserves ticket/comment/attachment/original-email/provider data');
  console.log(checks+' multi-provider AI checks passed. Provider responses were simulated; API authorization, validation, encryption and ticket writes were real.');
 }finally{global.fetch=originalFetch;if(server)await new Promise(resolve=>server.close(resolve));if(isolated)await isolated.end();Object.assign(pool,saved);if(oldKey===undefined)delete process.env.EMAIL_ENCRYPTION_KEY;else process.env.EMAIL_ENCRYPTION_KEY=oldKey;await db.query('SET search_path TO public');await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await db.end();await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
