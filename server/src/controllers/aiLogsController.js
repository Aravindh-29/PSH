const pool = require('../db/pool');
async function list(req,res,next) {
 try {
  if(!req.access?.admin)return res.status(403).json({message:'AI logs are available to Admin only.'});
  const {date, tz='UTC', status='', provider='', purpose='', search='', year, month}=req.query;
  const page=Number(req.query.page||1),limit=Number(req.query.limit||50);
  let validZone=true;try{new Intl.DateTimeFormat('en',{timeZone:tz});}catch{validZone=false;}
  if(!validZone || !/^\d{4}-\d{2}-\d{2}$/.test(date||'') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date ||
   !Number.isInteger(page)||page<1||page>1000000||!Number.isInteger(limit)||limit<1||limit>100 ||
   !['','success','failed','deferred','skipped'].includes(status)||!['','openai','gemini','claude'].includes(provider)||
   !['','email_analysis','connection_check','recovery_check'].includes(purpose)||typeof search!=='string'||search.length>200 ||
   !Number.isInteger(Number(year))||Number(year)<2000||Number(year)>9999||!Number.isInteger(Number(month))||Number(month)<1||Number(month)>12)
   return res.status(400).json({message:'Invalid AI log filters.'});
  const params=[date,tz,status,provider,purpose,'%'+search+'%'];
  const from=`FROM email_ai_logs a LEFT JOIN email_automation_mailboxes b ON b.id=a.mailbox_id
   LEFT JOIN incoming_email_messages m ON m.mailbox_id=a.mailbox_id AND m.message_id=a.message_id
   LEFT JOIN tickets t ON t.id=m.ticket_id`;
  const where=`WHERE DATE(a.created_at AT TIME ZONE $2)=$1::date
   AND ($3='' OR a.outcome=$3) AND ($4='' OR a.provider=$4) AND ($5='' OR a.purpose=$5)
   AND ($6='%%' OR a.id::text ILIKE $6 OR a.message_id ILIKE $6 OR a.thread_id ILIKE $6 OR b.address ILIKE $6
    OR t.ticket_number ILIKE $6 OR a.error_message ILIKE $6 OR a.error_code ILIKE $6)`;
  const counts=(await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE a.outcome='success')::int success,
   COUNT(*) FILTER(WHERE a.outcome='failed')::int failed,COUNT(*) FILTER(WHERE a.outcome='deferred')::int deferred,
   COUNT(*) FILTER(WHERE a.outcome='skipped')::int skipped ${from} ${where}`,params)).rows[0];
  const logs=(await pool.query(`SELECT a.*,b.address AS mailbox,t.ticket_number,t.id AS ticket_id,m.status AS email_status
   ${from} ${where} ORDER BY a.created_at DESC,a.id LIMIT $7 OFFSET $8`,[...params,limit,(page-1)*limit])).rows;
  const activeDays=(await pool.query(`SELECT DISTINCT DATE(created_at AT TIME ZONE $1)::text AS day FROM email_ai_logs
   WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE $1)=$2 AND EXTRACT(MONTH FROM created_at AT TIME ZONE $1)=$3`,[tz,year,month])).rows.map(r=>r.day);
  res.json({logs,summary:counts,activeDays,pagination:{page,pages:Math.max(1,Math.ceil(counts.total/limit)),total:counts.total}});
 }catch(e){next(e);}
}
module.exports={list};
