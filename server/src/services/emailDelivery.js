const pool=require('../db/pool');
const logger=require('../utils/logger');
const settings=require('./emailSettings');
let running;
async function enqueue(cfg,to,subject,html) {
  if(!cfg?.is_enabled)return {queued:0};
  const recipients=[...new Set((Array.isArray(to)?to:[to]).filter(settings.address).map(s=>s.toLowerCase()))];
  for(const recipient of recipients)await pool.query(`INSERT INTO email_outbox(recipient,subject,html,from_name,from_email) VALUES($1,$2,$3,$4,$5)`,[recipient,subject,html,cfg.from_name,cfg.from_email]);
  return {queued:recipients.length};
}
async function drain() {
  for(let i=0;i<10;i++) {
    const cfg=(await pool.query('SELECT * FROM email_config WHERE id=1')).rows[0];
    if(!cfg?.is_enabled)return;
    await pool.query("UPDATE email_outbox SET status='failed',locked_at=NULL,last_error='Delivery interrupted after the final attempt. Review before retrying.' WHERE status='sending' AND locked_at<NOW()-INTERVAL '5 minutes' AND attempts>=3");
    const {rows}=await pool.query(`UPDATE email_outbox SET status='sending',locked_at=NOW(),attempts=attempts+1 WHERE id=(
      SELECT id FROM email_outbox WHERE (status='pending' AND next_attempt_at<=NOW()) OR (status='sending' AND locked_at<NOW()-INTERVAL '5 minutes' AND attempts<3)
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`);
    const job=rows[0];if(!job)break;
    let transporter;
    try {
      transporter=settings.transport(cfg,async(next,previous)=>{await pool.query('UPDATE email_config SET oauth_refresh_token=$1 WHERE id=1 AND oauth_refresh_token=$2',[next,previous]);});
      await transporter.sendMail({from:{name:job.from_name,address:job.from_email},to:job.recipient,subject:job.subject,html:job.html,messageId:`<${job.id}@servit.local>`});
      await pool.query("UPDATE email_outbox SET status='sent',sent_at=NOW(),last_error=NULL,locked_at=NULL WHERE id=$1",[job.id]);
    } catch(error) {
      const message=settings.safeError(error),retry=job.attempts<3;
      await pool.query(`UPDATE email_outbox SET status=$2,last_error=$3,locked_at=NULL,next_attempt_at=NOW()+($4*INTERVAL '1 second') WHERE id=$1`,[job.id,retry?'pending':'failed',message,30*2**job.attempts]);
      logger.error('Email delivery '+job.id+': '+message);
    } finally {transporter?.close();}
  }
}
function processQueue() {
  if(!running)running=drain().catch(()=>logger.error('Email delivery worker could not process the queue.')).finally(()=>{running=null;});
  return running;
}
function start() {const timer=setInterval(processQueue,15000);timer.unref();processQueue();return timer;}
module.exports={enqueue,processQueue,start};
