const pool=require('../db/pool');
const gmail=require('./gmailConnection');
const queue=require('./gmailQueue');
const {simpleParser}=require('mailparser');
const {htmlToText}=require('html-to-text');
const {ALLOWED_MIME_TYPES,MAX_FILE_SIZE}=require('../controllers/attachmentController');
let running=null,delivering=null,deliveryTimer=null;
const validReceived=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Number(value)>=0;
async function envelope(box,message){
 if(!message.id||!message.threadId||!message.raw)gmail.fail('Gmail returned an incomplete message.');
 const received=Number(message.internalDate);if(!validReceived(message.internalDate))gmail.fail('Gmail message has no valid received time.');
 if(received<new Date(box.start_at).getTime())return {skip:'Message predates the chosen processing start time.'};
 if((message.labelIds||[]).some(label=>['SENT','DRAFT','SPAM','TRASH'].includes(label)))return {skip:'Sent, draft, spam or trash message excluded.'};
 const parsed=await simpleParser(Buffer.from(message.raw,'base64url'),{maxHtmlLengthToParse:2000000,skipImageLinks:true});
 const sender=parsed.from?.value?.[0]?.address?.toLowerCase();
 if(!sender||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender))gmail.fail('Email sender could not be read. Open the original message in Gmail.');
 if(sender===box.address)return {skip:'Outgoing/self-sent support mailbox message excluded.'};
 if(box.sender_domains.length&&!box.sender_domains.includes(sender.split('@')[1]))return {skip:'Sender domain is outside the configured allowlist.'};
 let body=parsed.text;
 if(!body&&parsed.html){
  if(parsed.html.length>2000000)gmail.fail('HTML email body exceeds the conversion limit. Review the original email in Gmail.');
  body=htmlToText(parsed.html,{wordwrap:false,limits:{maxInputLength:2000000,maxDepth:200}});
 }
 body=body||'[Email contains no readable text. Open the original email in Gmail.]';
 if(body.length>200000)gmail.fail('Email body exceeds 200,000 characters. Review the original email in Gmail.');
 const attachments=[],attachmentWarnings=[];let size=0;
 for(const file of parsed.attachments||[]){
  const name=(file.filename||'attachment').slice(0,500),mimeType=file.contentType||'application/octet-stream';
  const reason=!ALLOWED_MIME_TYPES.includes(mimeType)?'Unsupported attachment type':attachments.length>=10?'Attachment count exceeds 10':size+file.content.length>MAX_FILE_SIZE?'Combined attachments exceed 25 MB':null;
  if(reason){if(attachmentWarnings.length<100)attachmentWarnings.push({name,reason});continue;}
  size+=file.content.length;attachments.push({name,mimeType,contentBase64:file.content.toString('base64')});
 }
 return {mailbox:box.address,messageId:message.id,threadId:message.threadId,sender,subject:(parsed.subject||'').slice(0,2000),body,receivedAt:new Date(received).toISOString(),attachments,attachmentWarnings};
}
async function mcpClient(){
 const settings=await require('./mcpSettings').runtime();
 if(!settings.enabled||settings.token.length<32)gmail.fail('Enable and configure MCP before processing Gmail.');
 const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
 const client=new Client({name:'servit-gmail-ingestion',version:'1.0.0'});
 try{await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${process.env.PORT||5000}/api/mcp`),{requestInit:{headers:{Authorization:'Bearer '+settings.token}},fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(60000)})}));return client;}
 catch(e){await client.close().catch(()=>{});throw e;}
}
async function syncMailbox(id,{force=false,clientFactory=mcpClient,phase='both'}={}){
 if(phase==='both'){
  const discovered=await syncMailbox(id,{force,clientFactory,phase:'discovery'});
  if(discovered.busy||discovered.paused)return discovered;
  const delivered=await syncMailbox(id,{force,clientFactory,phase:'delivery'});
  return {...discovered,...delivered,discovered:discovered.discovered,morePages:!!(discovered.morePages||delivered.morePages)};
 }
 const db=await pool.connect();let client,locked=false,box;
 const lockKey=(phase==='delivery'?'gmail-delivery:':'gmail:')+id;
 try{
  locked=(await db.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",[lockKey])).rows[0].locked;
  if(!locked)return {busy:true};
  box=(await db.query(`SELECT b.*,c.start_at,c.scan_after,c.scan_until,c.page_token,c.history_id,c.history_page_token,c.refresh_token_encrypted,c.is_paused,c.status AS gmail_status FROM email_automation_mailboxes b JOIN gmail_connections c ON c.mailbox_id=b.id WHERE b.id=$1`,[id])).rows[0];
  if(!box?.is_active||box.is_paused||!box.refresh_token_encrypted||['disconnected','reauth_required'].includes(box.gmail_status)){if(force)gmail.fail('Enable, connect and resume this mailbox before syncing.');return {paused:true};}
  const runtime=await require('./mcpSettings').runtime();
  if(!runtime.enabled||runtime.token.length<32){if(force)gmail.fail('Enable and configure MCP first.');return {paused:true};}
  if(runtime.allowedMailboxes.length&&!runtime.allowedMailboxes.includes(box.address))gmail.fail('This mailbox is outside the MCP server credential scope.');
  const token=await gmail.accessToken(box,db),profile=await gmail.api(token,'profile');
  if(profile.emailAddress?.toLowerCase()!==box.address)gmail.fail('Google account does not match the configured mailbox.');
  if(phase==='discovery'){
  let historyPage=box.history_page_token,historyPages=0,discovered=0;
  if(box.history_id){
   do{
    const params=new URLSearchParams({startHistoryId:box.history_id,historyTypes:'messageAdded',maxResults:'100'});if(historyPage)params.set('pageToken',historyPage);
    let changes;
    try{changes=await gmail.api(token,'history?'+params);}catch(error){
     if(error.googleStatus===404){await db.query('UPDATE gmail_connections SET history_id=$2,history_page_token=NULL WHERE mailbox_id=$1',[id,profile.historyId||null]);historyPage=null;break;}
     if(historyPage&&error.googleStatus===400)await db.query('UPDATE gmail_connections SET history_page_token=NULL WHERE mailbox_id=$1',[id]);
     throw error;
    }
    await db.query('BEGIN');
    try{
     for(const history of changes.history||[])for(const added of history.messagesAdded||[]){
      const messageId=added.message?.id;if(typeof messageId!=='string'||messageId.length>512)gmail.fail('Invalid Gmail history message identifier.');
      discovered+=(await queue.enqueue(db,id,messageId)).rowCount;
     }
     historyPage=changes.nextPageToken||null;
     await db.query('UPDATE gmail_connections SET history_page_token=$2,history_id=CASE WHEN $2::text IS NULL THEN $3 ELSE history_id END WHERE mailbox_id=$1',[id,historyPage,changes.historyId||box.history_id]);
     await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}
   }while(historyPage&&++historyPages<5);
  }else if(profile.historyId)await db.query('UPDATE gmail_connections SET history_id=$2 WHERE mailbox_id=$1',[id,profile.historyId]);
  const until=box.scan_until||new Date(),after=box.scan_after||box.start_at;
  // Fixed scan window, persisted page token and a two-minute overlap prevent
  // new arrivals/page retries from moving a checkpoint past undiscovered mail.
  const query=`after:${Math.max(0,Math.floor(new Date(after).getTime()/1000)-120)} before:${Math.ceil(new Date(until).getTime()/1000)+1} -in:sent -in:drafts`;
  let page=box.page_token,pages=0;
  do{
   const params=new URLSearchParams({q:query,maxResults:'100',includeSpamTrash:'false'});if(page)params.set('pageToken',page);
   let listed;
   try{listed=await gmail.api(token,'messages?'+params);}catch(e){if(page&&e.googleStatus===400){await db.query('UPDATE gmail_connections SET page_token=NULL,scan_until=NULL WHERE mailbox_id=$1',[id]);}throw e;}
   await db.query('BEGIN');
   try{
    for(const message of listed.messages||[]){if(typeof message.id!=='string'||message.id.length>512)gmail.fail('Invalid Gmail message identifier.');const inserted=await queue.enqueue(db,id,message.id);discovered+=inserted.rowCount;}
    page=listed.nextPageToken||null;
    await db.query('UPDATE gmail_connections SET page_token=$2,scan_until=$3,scan_after=CASE WHEN $2::text IS NULL THEN $4 ELSE scan_after END WHERE mailbox_id=$1',[id,page,page?until:null,until]);
    await db.query('COMMIT');
   }catch(e){await db.query('ROLLBACK');throw e;}
  }while(page&&++pages<5);
  return {discovered,morePages:!!(page||historyPage)};
  }
  // This lock is separate from discovery, so incoming mail keeps being queued
  // while slow AI calls or attachments are processed.
  await db.query("UPDATE gmail_delivery_queue SET status='pending',processing_started_at=NULL,note='Recovered interrupted processing',next_attempt_at=NOW() WHERE mailbox_id=$1 AND status='processing'",[id]);
  const jobs=(await db.query("SELECT * FROM gmail_delivery_queue WHERE mailbox_id=$1 AND status='pending' AND next_attempt_at<=NOW() ORDER BY COALESCE(received_at,created_at),created_at,message_id LIMIT $2",[id,queue.limits().batchSize])).rows;
  let processed=0,review=0,skipped=0,metadataProgress=0,mailboxError;
  const finish=async(job,status,note,ticketId=null,warnings=null,started=null)=>{
   await pool.query(`UPDATE gmail_delivery_queue SET status=$3,ticket_id=COALESCE($4,ticket_id),note=$5,attachment_warnings=COALESCE($6,attachment_warnings),
    processing_started_at=NULL,completed_at=CASE WHEN $3 IN ('processed','skipped','failed','needs_review') THEN NOW() ELSE NULL END,
    duration_ms=$7,updated_at=NOW() WHERE mailbox_id=$1 AND message_id=$2`,[id,job.message_id,status,ticketId,note,warnings?JSON.stringify(warnings):null,started?Date.now()-started:null]);
  };
  const failed=async(job,error,claimed=false)=>{
   const attempts=job.attempts+(claimed?0:1),globalError=error.reauth||error.googleStatus===403||error.retryable;
   const status=error.googleStatus===404?'skipped':!globalError&&attempts>=5?'failed':'pending';
   await pool.query("UPDATE gmail_delivery_queue SET attempts=GREATEST(attempts,$3),next_attempt_at=NOW()+($4*INTERVAL '1 second') WHERE mailbox_id=$1 AND message_id=$2",[id,job.message_id,attempts,Math.max(error.retryAfterSeconds||0,Math.min(3600,30*2**Math.min(attempts,7)))]);
   await finish(job,status,status==='skipped'?'Message no longer exists in Gmail.':error.status?error.message:'Email import failed. Automatic retry scheduled; open Gmail if the error persists.');
   if(status==='skipped')skipped++;
   if(globalError)mailboxError=error;
   return {stop:status!=='skipped'};
  };
  // Only small metadata is fetched ahead of processing. Large MIME bodies and
  // attachments are fetched only after a bounded worker slot is acquired.
  const prepared=await queue.parallel(jobs,queue.limits().workers,async job=>{
   if(mailboxError)return null;
   if(job.thread_id&&job.received_at)return job;
   try{
    const meta=await gmail.api(token,'messages/'+encodeURIComponent(job.message_id)+'?format=metadata&fields=id,threadId,internalDate,labelIds');
    if(typeof meta.threadId!=='string'||!meta.threadId||meta.threadId.length>512||!validReceived(meta.internalDate))gmail.fail('Gmail message metadata is incomplete.');
    job.thread_id=meta.threadId;job.received_at=new Date(Number(meta.internalDate));
    await pool.query('UPDATE gmail_delivery_queue SET thread_id=$3,received_at=$4 WHERE mailbox_id=$1 AND message_id=$2',[id,job.message_id,job.thread_id,job.received_at]);
    metadataProgress++;
    return job;
   }catch(error){await failed(job,error);return null;}
  });
  const threads=new Map();
  for(const result of prepared)if(result.status==='fulfilled'&&result.value){const job=result.value;if(!threads.has(job.thread_id))threads.set(job.thread_id,[]);threads.get(job.thread_id).push(job);}
  // A first email can appear on a later discovery page than its reply. Enqueue
  // the conversation's earlier incoming messages before allowing first creation.
  await queue.parallel([...threads],queue.limits().workers,async([threadId,items])=>{
   if(mailboxError)return;
   try{
    if(!(await pool.query('SELECT 1 FROM incoming_email_threads WHERE mailbox_id=$1 AND thread_id=$2',[id,threadId])).rowCount){
     const thread=await gmail.api(token,'threads/'+encodeURIComponent(threadId)+'?format=metadata&fields=id,messages(id,threadId,internalDate,labelIds)');
     if(!Array.isArray(thread.messages)||thread.messages.length>10000)gmail.fail('Gmail conversation metadata is incomplete or too large.');
     for(const m of thread.messages)if(typeof m.id!=='string'||!m.id||m.id.length>512||!validReceived(m.internalDate)||m.labelIds&&!Array.isArray(m.labelIds))gmail.fail('Invalid conversation message metadata.');
     const earlier=thread.messages.filter(m=>Number(m.internalDate)>=new Date(box.start_at).getTime()&&!(m.labelIds||[]).some(l=>['SENT','DRAFT','SPAM','TRASH'].includes(l))).map(m=>({message_id:m.id,thread_id:threadId,received_at:new Date(Number(m.internalDate)).toISOString()}));
     if(earlier.length)await queue.enqueueThread(id,earlier);
    }
   }catch(error){for(const job of items)await failed(job,error);threads.delete(threadId);}
  });
  if(threads.size&&!mailboxError)client=await clientFactory();
  const enabled=async()=>!!(await pool.query(`SELECT 1 FROM gmail_connections c JOIN email_automation_mailboxes b ON b.id=c.mailbox_id
   WHERE c.mailbox_id=$1 AND b.is_active AND NOT c.is_paused AND c.refresh_token_encrypted IS NOT NULL AND c.status NOT IN ('disconnected','reauth_required')
   AND COALESCE((SELECT is_enabled FROM mcp_server_settings WHERE id=1),$2::boolean)`,[id,runtime.enabled])).rowCount;
  const requeuePaused=async job=>{await pool.query("UPDATE gmail_delivery_queue SET status='pending',attempts=GREATEST(attempts-1,0),processing_started_at=NULL,note='Processing paused before ticket write',updated_at=NOW() WHERE mailbox_id=$1 AND message_id=$2",[id,job.message_id]);return {stop:true};};
  await queue.parallel([...threads.values()],queue.limits().workers,async items=>{
   items.sort((a,b)=>a.received_at-b.received_at||a.message_id.localeCompare(b.message_id));
   for(const item of items){
    if(mailboxError)break;
    const result=await queue.worker(async()=>{
     if(mailboxError||!await enabled())return {stop:true};
     // A failed/review/delayed predecessor blocks later replies, even across
     // batches and restarts. Other conversations remain independent.
     if((await pool.query(`SELECT 1 FROM gmail_delivery_queue p WHERE p.mailbox_id=$1 AND p.thread_id=$2
      AND p.status NOT IN ('processed','skipped') AND (COALESCE(p.received_at,p.created_at),p.message_id)<($3::timestamptz,$4::text) LIMIT 1`,[id,item.thread_id,item.received_at,item.message_id])).rowCount)return {stop:true};
     const job=(await pool.query("UPDATE gmail_delivery_queue SET status='processing',attempts=attempts+1,processing_started_at=NOW(),updated_at=NOW() WHERE mailbox_id=$1 AND message_id=$2 AND status='pending' RETURNING *",[id,item.message_id])).rows[0];
     if(!job)return {};
     const started=Date.now();
     try{
      const message=await gmail.api(token,'messages/'+encodeURIComponent(job.message_id)+'?format=raw');
      let input=await envelope(box,message);
      if(input.skip){await finish(job,'skipped',input.skip,null,null,started);skipped++;return {};}
      if(input.threadId!==item.thread_id)gmail.fail('Gmail conversation changed during processing. Review this message.');
      if(!await enabled())return requeuePaused(job);
      input=await require('./emailAI').enrich(input);
      if(!await enabled())return requeuePaused(job);
      const result=await client.callTool({name:'process_email',arguments:input},undefined,{timeout:60000});
      if(result.isError)throw Object.assign(new Error('MCP could not process this email. Check department findings and the processing history.'),{status:400});
      const outcome=result.structuredContent||JSON.parse(result.content[0].text),status=outcome.action==='needs_review'?'needs_review':'processed';
      const note=outcome.reason||(outcome.needsRouting?'Captured · Needs routing':outcome.detailsIncomplete?'Captured · Details incomplete':outcome.action)+(outcome.aiStatus==='failed'?' · AI unavailable; captured without AI':'');
      await finish(job,status,note,outcome.ticketId||null,outcome.attachmentErrors||job.attachment_warnings||input.attachmentWarnings,started);
      if(status==='needs_review')review++;else processed++;
      return {stop:status==='needs_review'};
     }catch(error){if(error.code===429||error.status===429){error.retryable=true;error.retryAfterSeconds=Math.max(60,error.retryAfterSeconds||0);error.status=429;error.message='MCP request limit reached. Processing will resume automatically.';}return failed(job,error,true);}
    });
    if(result.busy||result.stop)break;
   }
  });
  if(mailboxError)throw mailboxError;
  await db.query("UPDATE gmail_connections SET status='connected',verified_at=NOW(),last_sync_at=NOW(),next_sync_at=NULL,last_error=NULL,updated_at=NOW() WHERE mailbox_id=$1 AND refresh_token_encrypted=$2 AND status NOT IN ('disconnected','reauth_required')",[id,box.refresh_token_encrypted]);
  const more=(await pool.query(`SELECT 1 FROM gmail_delivery_queue q WHERE q.mailbox_id=$1 AND q.status='pending' AND q.next_attempt_at<=NOW()
   AND NOT EXISTS(SELECT 1 FROM gmail_delivery_queue p WHERE p.mailbox_id=q.mailbox_id AND p.thread_id=q.thread_id AND p.status NOT IN ('processed','skipped')
    AND (COALESCE(p.received_at,p.created_at),p.message_id)<(COALESCE(q.received_at,q.created_at),q.message_id)) LIMIT 1`,[id])).rowCount>0;
  await queue.pruneCompleted().catch(()=>console.error('[Gmail history] Completed history cleanup will retry.'));
  return {processed,review,skipped,morePages:more,progress:processed+review+skipped+metadataProgress};
 }catch(error){if(locked)await gmail.recordError(id,error,db,box?.refresh_token_encrypted).catch(()=>{});throw error;}
 finally{await client?.close().catch(()=>{});if(locked)await db.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[lockKey]).catch(()=>{});db.release();}
}
async function mailboxes(){return (await pool.query("SELECT c.mailbox_id FROM gmail_connections c JOIN email_automation_mailboxes b ON b.id=c.mailbox_id WHERE b.is_active AND NOT c.is_paused AND c.refresh_token_encrypted IS NOT NULL AND c.status IN ('connected','error') AND (c.next_sync_at IS NULL OR c.next_sync_at<=NOW()) ORDER BY c.last_sync_at NULLS FIRST,c.mailbox_id")).rows;}
function drainQueue(){
 if(!delivering)delivering=(async()=>{
  const results=await queue.parallel(await mailboxes(),queue.limits().mailboxes,box=>syncMailbox(box.mailbox_id,{phase:'delivery'}));
  if(results.some(r=>r.status==='fulfilled'&&r.value.morePages&&r.value.progress>0)&&!deliveryTimer){deliveryTimer=setTimeout(()=>{deliveryTimer=null;drainQueue();},1000);deliveryTimer.unref();}
 })().catch(()=>{}).finally(()=>{delivering=null;});
 return delivering;
}
function processQueue(){
 if(!running)running=(async()=>{
  await queue.pruneCompleted().catch(()=>console.error('[Gmail history] Completed history cleanup will retry.'));
  await queue.parallel(await mailboxes(),queue.limits().mailboxes,box=>syncMailbox(box.mailbox_id,{phase:'discovery'}));
  drainQueue();
 })().catch(()=>{}).finally(()=>{running=null;});
 return running;
}
function start(){const timer=setInterval(processQueue,30000);timer.unref();setTimeout(processQueue,5000).unref();return timer;}
module.exports={envelope,syncMailbox,processQueue,drainQueue,start};
