const pool=require('../db/pool');
const bounded=(value,fallback,min,max)=>{const n=Number(value);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback;};
function limits(){return {workers:bounded(process.env.SERVIT_EMAIL_WORKERS,3,1,6),mailboxes:bounded(process.env.SERVIT_EMAIL_MAILBOX_WORKERS,2,1,3),batchSize:bounded(process.env.SERVIT_EMAIL_BATCH_SIZE,50,10,100)};}
async function parallel(items,count,fn){
 let cursor=0;const results=[];
 await Promise.all(Array.from({length:Math.min(count,items.length)},async()=>{while(cursor<items.length){const index=cursor++;try{results[index]={status:'fulfilled',value:await fn(items[index],index)};}catch(reason){results[index]={status:'rejected',reason};}}}));
 return results;
}
let active=0;const waiting=[];
async function worker(fn){
 await new Promise(resolve=>{if(active<limits().workers){active++;resolve();}else waiting.push(resolve);});
 let db,slot;
 try{
  db=await pool.connect();
  // The shared slots also cap concurrent work across server instances.
  for(let i=0;i<limits().workers;i++)if((await db.query("SELECT pg_try_advisory_lock(hashtext(current_schema()||':servit-email-workers'),$1) AS locked",[i])).rows[0].locked){slot=i;break;}
  if(slot===undefined)return {busy:true};
  return await fn();
 }finally{
  if(slot!==undefined)await db.query("SELECT pg_advisory_unlock(hashtext(current_schema()||':servit-email-workers'),$1)",[slot]).catch(()=>{});
  db?.release();active--;if(waiting.length){active++;waiting.shift()();}
 }
}
async function monitor(db=pool){
 const rows=(await db.query(`WITH history AS (
  SELECT mailbox_id,message_id,status,next_attempt_at,processing_started_at,completed_at,created_at,duration_ms FROM gmail_delivery_queue
  UNION ALL SELECT mailbox_id,message_id,status,NULL::timestamptz,NULL::timestamptz,completed_at,completed_at,duration_ms FROM gmail_completed_receipts
 ) SELECT b.id AS mailbox_id,b.address,
  COUNT(q.message_id)::int AS total,COUNT(*) FILTER(WHERE q.status='pending')::int AS pending,
  COUNT(*) FILTER(WHERE q.status='processing')::int AS processing,
  COUNT(*) FILTER(WHERE q.status='failed')::int AS failed,COUNT(*) FILTER(WHERE q.status='needs_review')::int AS needs_review,
  COUNT(*) FILTER(WHERE q.status='processed')::int AS processed,COUNT(*) FILTER(WHERE q.status='skipped')::int AS skipped,
  COUNT(*) FILTER(WHERE q.status='pending' AND q.next_attempt_at>NOW())::int AS delayed,
  COUNT(*) FILTER(WHERE q.status='processing' AND q.processing_started_at<NOW()-INTERVAL '5 minutes')::int AS stalled,
  COUNT(*) FILTER(WHERE q.status='processed' AND q.completed_at>=NOW()-INTERVAL '1 hour')::int AS processed_last_hour,
  MIN(q.created_at) FILTER(WHERE q.status='pending') AS oldest_pending_at,
  ROUND(AVG(q.duration_ms) FILTER(WHERE q.completed_at>=NOW()-INTERVAL '1 hour'))::int AS avg_processing_ms
  FROM email_automation_mailboxes b LEFT JOIN history q ON q.mailbox_id=b.id GROUP BY b.id,b.address ORDER BY b.address`)).rows;
 const totals={total:0,pending:0,processing:0,failed:0,needs_review:0,processed:0,skipped:0,delayed:0,stalled:0,processed_last_hour:0,oldest_pending_at:null};
 for(const row of rows){for(const key of Object.keys(totals))if(key!=='oldest_pending_at')totals[key]+=row[key];if(row.oldest_pending_at&&(!totals.oldest_pending_at||row.oldest_pending_at<totals.oldest_pending_at))totals.oldest_pending_at=row.oldest_pending_at;}
 return {limits:limits(),totals,mailboxes:rows,checkedAt:new Date().toISOString()};
}
async function page({status='pending',mailboxId=null,page=1,limit=25}={}){
 const params=[status,mailboxId],where='q.status=$1 AND ($2::uuid IS NULL OR q.mailbox_id=$2)';
 const total=Number((await pool.query('SELECT COUNT(*) FROM gmail_delivery_queue q WHERE '+where,params)).rows[0].count);
 const items=(await pool.query(`SELECT q.mailbox_id,q.message_id,q.thread_id,q.status,q.attempts,q.note,q.created_at,q.updated_at,q.processing_started_at,q.next_attempt_at,q.completed_at,q.duration_ms,q.ticket_id,b.address,t.ticket_number
  FROM gmail_delivery_queue q JOIN email_automation_mailboxes b ON b.id=q.mailbox_id LEFT JOIN tickets t ON t.id=q.ticket_id
  WHERE ${where} ORDER BY q.created_at,q.message_id LIMIT $3 OFFSET $4`,[...params,limit,(page-1)*limit])).rows;
 return {...await monitor(),items,total,page,limit};
}
async function pruneCompleted(){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext(current_schema()||':servit-email-history-retention'))");
  const result=await db.query(`WITH removed AS (
   DELETE FROM gmail_delivery_queue WHERE (mailbox_id,message_id) IN (
    SELECT mailbox_id,message_id FROM gmail_delivery_queue WHERE status IN ('processed','skipped')
    ORDER BY updated_at DESC,mailbox_id,message_id OFFSET 40
   ) AND status IN ('processed','skipped') RETURNING mailbox_id,message_id,status,completed_at,updated_at,duration_ms
  ) INSERT INTO gmail_completed_receipts(mailbox_id,message_id,status,completed_at,duration_ms)
   SELECT mailbox_id,message_id,status,COALESCE(completed_at,updated_at),duration_ms FROM removed ON CONFLICT DO NOTHING`);
  await db.query('COMMIT');return result.rowCount;
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
async function enqueue(db,mailboxId,messageId){
 // Discovery already owns a transaction. The shared lock prevents a concurrent
 // trim from moving a row between the receipt check and the queue insertion.
 await db.query("SELECT pg_advisory_xact_lock_shared(hashtext(current_schema()||':servit-email-history-retention'))");
 return db.query(`INSERT INTO gmail_delivery_queue(mailbox_id,message_id)
  SELECT $1::uuid,$2::text WHERE NOT EXISTS(SELECT 1 FROM gmail_completed_receipts WHERE mailbox_id=$1 AND message_id=$2)
  ON CONFLICT DO NOTHING`,[mailboxId,messageId]);
}
async function enqueueThread(mailboxId,messages){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock_shared(hashtext(current_schema()||':servit-email-history-retention'))");
  await db.query(`INSERT INTO gmail_delivery_queue(mailbox_id,message_id,thread_id,received_at)
   SELECT $1,x.message_id,x.thread_id,x.received_at FROM jsonb_to_recordset($2::jsonb) AS x(message_id TEXT,thread_id TEXT,received_at TIMESTAMPTZ)
   WHERE NOT EXISTS(SELECT 1 FROM gmail_completed_receipts r WHERE r.mailbox_id=$1 AND r.message_id=x.message_id)
   ON CONFLICT(mailbox_id,message_id) DO UPDATE SET thread_id=COALESCE(gmail_delivery_queue.thread_id,EXCLUDED.thread_id),received_at=COALESCE(gmail_delivery_queue.received_at,EXCLUDED.received_at)`,[mailboxId,JSON.stringify(messages)]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
module.exports={limits,parallel,worker,monitor,page,pruneCompleted,enqueue,enqueueThread};
