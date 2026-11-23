const {scopePredicate}=require('../access/context');
const bad=message=>{throw Object.assign(new Error(message),{status:400})};
// Deliberately explicit ticket-read scope: a permitted unassigned department
// queue is not an assignment to the current user. Do not broaden other views.
function base(req,filters=true){
 const params=[req.access.userId],conditions=['t.deleted_at IS NULL',
  '(t.assigned_to=$1 OR t.assigned_to IS NULL)',`(${scopePredicate(req.access,'tickets.view')})`];
 const add=(value,expression)=>{params.push(value);conditions.push(expression.replaceAll('?', '$'+params.length))};
 if(filters){
  const {search,startDate,endDate}=req.query;
  if(search){if(typeof search!=='string'||search.length>200)bad('Search must be up to 200 characters.');add('%'+search+'%', '(t.ticket_number ILIKE ? OR t.short_description ILIKE ? OR t.customer_name ILIKE ?)')}
  for(const date of [startDate,endDate])if(date!==undefined&&(typeof date!=='string'||date<'0001-01-01'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))bad('Choose a valid date range.');
  if(startDate&&endDate&&startDate>endDate)bad('The start date must be before the end date.');
  if(startDate)add(startDate,'t.created_at>=?::date');
  if(endDate)add(endDate,"t.created_at<(?::date+INTERVAL '1 day')");
 }
 return{params,sql:`SELECT t.*,COALESCE(r.seen_revision,0)<t.inbox_revision AS is_unopened
 FROM tickets t LEFT JOIN ticket_inbox_receipts r ON r.ticket_id=t.id AND r.user_id=$1
 WHERE ${conditions.join(' AND ')}`};
}
module.exports={base};
