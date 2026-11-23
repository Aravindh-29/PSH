const pool=require('../db/pool');
const {base}=require('../services/ticketInbox');

async function list(req,res,next){try{
 const inbox=base(req,false),canQuery=!!(req.access.admin||req.access.permissions['query.view']);
 // Ticket alerts and My Query read exactly the same per-user ticket receipts.
 const {rows}=await pool.rawQuery(`WITH inbox AS (${inbox.sql}),
 ticket_alerts AS (
  SELECT 'ticket:'||id::text AS id,
   CASE inbox_event WHEN 'EMAIL_RECEIVED' THEN 'TICKET_EMAIL_RECEIVED' WHEN 'EMAIL_REOPENED' THEN 'TICKET_REOPENED_EMAIL' WHEN 'REOPENED' THEN 'TICKET_REOPENED' ELSE 'TICKET_ROUTED' END AS type,
   CASE inbox_event WHEN 'EMAIL_RECEIVED' THEN 'New email received' WHEN 'EMAIL_REOPENED' THEN 'Closed → In Progress by email'
    WHEN 'REOPENED' THEN 'Closed ticket reopened'
    ELSE CASE WHEN assigned_to IS NULL THEN 'Unassigned department ticket' ELSE 'Ticket assigned to you' END END AS title,
   ticket_number||' · '||CASE inbox_event WHEN 'EMAIL_RECEIVED' THEN 'A new customer email was added. Open this ticket to read it.' WHEN 'EMAIL_REOPENED' THEN 'A customer email reopened this ticket. Open it to review the reply.'
    WHEN 'REOPENED' THEN 'This ticket has been reopened. Open it to review.' ELSE 'Open this ticket to review its latest routing or assignment.' END AS message,
   id AS ticket_id,ticket_number,FALSE AS is_read,
   CASE WHEN inbox_event='ARRIVED' THEN created_at ELSE inbox_event_at END AS created_at,
   inbox_revision::text AS ticket_revision
  FROM inbox WHERE is_unopened AND $2::boolean
 ), other_alerts AS (
  SELECT id::text,type,title,message,ticket_id,ticket_number,is_read,created_at,NULL::text AS ticket_revision
  FROM notifications WHERE user_id=$1 AND ticket_id IS NULL
 ), alerts AS (SELECT * FROM ticket_alerts UNION ALL SELECT * FROM other_alerts), latest AS (
  SELECT * FROM alerts ORDER BY is_read ASC,created_at DESC,id LIMIT 30
 )
 SELECT COALESCE((SELECT json_agg(latest ORDER BY is_read,created_at DESC,id) FROM latest),'[]'::json) AS notifications,
 (SELECT COUNT(*)::int FROM ticket_alerts) AS ticket_unread,
 (SELECT COUNT(*)::int FROM other_alerts WHERE NOT is_read) AS other_unread`,[...inbox.params,canQuery]);
 const row=rows[0];res.json({success:true,notifications:row.notifications,ticketUnread:row.ticket_unread,otherUnread:row.other_unread,unread:row.ticket_unread+row.other_unread});
}catch(e){next(e)}}

async function markRead(req,res,next){try{
 if(!/^\d+$/.test(req.params.id))return res.status(400).json({success:false,message:'Open the ticket to clear its notification and My Query badge together.'});
 await pool.query('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2 AND ticket_id IS NULL',[req.params.id,req.session.userId]);
 res.json({success:true});
}catch(e){next(e)}}
async function markAllRead(req,res,next){try{
 // Non-ticket alerts may be dismissed; ticket alerts require opening the ticket.
 await pool.query('UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND ticket_id IS NULL AND NOT is_read',[req.session.userId]);
 res.json({success:true});
}catch(e){next(e)}}
module.exports={list,markRead,markAllRead};
