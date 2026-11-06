const pool = require('../db/pool');
const settings = require('../services/emailSettings');
const { need } = require('../access/policy');
const { uuid } = require('../access/context');
const { logAdminAudit } = require('./adminAuditController');
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function getConfig(req,res,next) {
  try { res.json({success:true,config:settings.publicConfig((await pool.query('SELECT * FROM email_config WHERE id=1')).rows[0])}); }
  catch(error){next(error);}
}
async function saveConfig(req,res,next) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const prior=(await client.query('SELECT * FROM email_config WHERE id=1 FOR UPDATE')).rows[0]||settings.defaults;
    const {cfg,changed}=settings.prepare(req.body,prior);
    if(!changed.length){need(req,'email.view');await client.query('ROLLBACK');return res.json({success:true,message:'No changes',config:settings.publicConfig(prior)});}
    if(changed.some(name=>name!=='is_enabled'))need(req,'email.edit');
    if(changed.includes('is_enabled'))need(req,'email.toggle');
    const names=settings.fields,values=names.map(name=>cfg[name]);values.push(req.session.userId);
    await client.query('UPDATE email_config SET '+names.map((name,i)=>name+'=$'+(i+1)).join(',')+',updated_at=NOW(),updated_by=$'+values.length+' WHERE id=1',values);
    await client.query('COMMIT');
    logAdminAudit(req.session.userId,'EMAIL_CONFIG_UPDATED','email_config','1','Email Configuration',{changedFields:changed},req.ip);
    res.json({success:true,message:'Email configuration saved',config:settings.publicConfig(cfg)});
  } catch(error){await client.query('ROLLBACK');next(error);} finally {client.release();}
}
async function testConfig(req,res,next) {
  let transporter;
  try {
    need(req,'email.test');
    const prior=(await pool.query('SELECT * FROM email_config WHERE id=1')).rows[0]||settings.defaults;
    const {cfg,changed}=settings.prepare(req.body,prior,true);
    if(changed.some(name=>name!=='is_enabled'))need(req,'email.edit');
    const recipient=req.body.test_to||cfg.smtp_user;
    if(!settings.address(recipient))throw Object.assign(new Error('Enter one valid test recipient email address.'),{status:400});
    transporter=settings.transport(cfg,changed.length?undefined:async(next,previous)=>{await pool.query('UPDATE email_config SET oauth_refresh_token=$1 WHERE id=1 AND oauth_refresh_token=$2',[next,previous]);});
    await transporter.verify();
    const result=await transporter.sendMail({from:{name:cfg.from_name||'SERV-IT Notifications',address:cfg.from_email},to:recipient,subject:'SERV-IT email configuration test',
      html:'<h2>SERV-IT email configuration test</h2><p>The SMTP server accepted this test message for '+escape(recipient)+'.</p><p>This test does not enable or save notification settings.</p>'});
    if(!result.accepted?.length)throw new Error('Message not accepted');
    logAdminAudit(req.session.userId,'EMAIL_TEST_SENT','email_config','1','Email Configuration',{recipient},req.ip);
    res.json({success:true,message:'SMTP server accepted the test email for '+recipient+'. Check the recipient mailbox and spam folder.'});
  }catch(error){if(error.status)return next(error);res.status(400).json({success:false,message:settings.safeError(error)});}finally{transporter?.close();}
}
async function deliveries(req,res,next) {
  try {
    const {rows}=await pool.query('SELECT id,recipient,subject,status,attempts,last_error,created_at,sent_at FROM email_outbox ORDER BY created_at DESC LIMIT 50');
    res.json({success:true,deliveries:rows});
  }catch(error){next(error);}
}
async function retry(req,res,next) {
  try {
    need(req,'email.retry');
    if(!uuid(req.params.id))throw Object.assign(new Error('Invalid delivery identifier.'),{status:400});
    const result=await pool.query("UPDATE email_outbox SET status='pending',attempts=0,next_attempt_at=NOW(),last_error=NULL WHERE id=$1 AND status='failed' RETURNING id",[req.params.id]);
    if(!result.rowCount)return res.status(409).json({success:false,message:'Only failed deliveries can be retried.'});
    logAdminAudit(req.session.userId,'EMAIL_DELIVERY_RETRY','email_outbox',req.params.id,'Email delivery',{},req.ip);
    res.json({success:true,message:'Delivery queued for retry.'});
  }catch(error){next(error);}
}
module.exports={getConfig,saveConfig,testConfig,deliveries,retry};
