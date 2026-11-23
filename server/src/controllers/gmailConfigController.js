const pool=require('../db/pool');
const gmail=require('../services/gmailConnection');
const {encrypt}=require('../services/emailSettings');
const {uuid}=require('../access/context');
const {logAdminAudit}=require('./adminAuditController');
const saveSession=req=>new Promise((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
async function lock(db,id){await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['gmail:'+id]);}
async function mailbox(id,db=pool){if(!uuid(id))gmail.fail('Select a configured mailbox.');const row=(await db.query('SELECT * FROM email_automation_mailboxes WHERE id=$1',[id])).rows[0];if(!row)gmail.fail('Mailbox not found.');return row;}
async function save(req,res,next){
 const db=await pool.connect();
 try{
  const id=typeof req.body.clientId==='string'?req.body.clientId.trim():null,secret=req.body.clientSecret;
  if(typeof id!=='string'||id.length>500||!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(id))gmail.fail('Enter the Google Web application Client ID.');
  if(secret!==undefined&&(typeof secret!=='string'||secret.length>2000||/[\r\n]/.test(secret)))gmail.fail('Enter a valid Client Secret.');
  await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtext('servit-gmail-oauth'))");
  const prior=(await db.query('SELECT * FROM gmail_oauth_settings WHERE id=1 FOR UPDATE')).rows[0];
  if(!secret&&!prior)gmail.fail('Enter the Google Client Secret.');
  if(!secret&&prior?.client_id!==id)gmail.fail('Enter the matching Client Secret when changing the Client ID.');
  const changed=!prior||prior.client_id!==id||!!secret&&gmail.secret(prior.client_secret_encrypted)!==secret;
  if(changed){
   const connections=(await db.query('SELECT mailbox_id FROM gmail_connections ORDER BY mailbox_id')).rows;
   for(const connection of connections)await lock(db,connection.mailbox_id);
   await db.query(`INSERT INTO gmail_oauth_settings(id,client_id,client_secret_encrypted) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET client_id=$1,client_secret_encrypted=$2,version=gmail_oauth_settings.version+1,updated_at=NOW()`,[id,secret?encrypt(secret):prior.client_secret_encrypted]);
   await db.query("UPDATE gmail_connections SET status='reauth_required',is_paused=TRUE,refresh_token_encrypted=NULL,last_error='Google OAuth settings changed. Connect this mailbox again.',updated_at=NOW()");
  }
  await db.query('COMMIT');logAdminAudit(req.session.userId,'GMAIL_OAUTH_SETTINGS_SAVED','gmail_oauth_settings','1','Gmail OAuth',{changed},req.ip);
  res.json({success:true,message:changed?'Google settings saved. Connect each mailbox to authorize Gmail.':'Google settings unchanged.'});
 }catch(e){await db.query('ROLLBACK');next(e);}finally{db.release();}
}
async function connect(req,res,next){try{
 if(req.get('origin')&&req.get('origin')!==new URL(gmail.redirectUri()).origin)gmail.fail('Open SERVIT using the application address shown in the redirect URI before connecting Gmail. Do not switch between localhost and 127.0.0.1.');
 const box=await mailbox(req.body.mailboxId);if(!box.is_active)gmail.fail('Enable the mailbox before connecting Gmail.');
 const config=await gmail.oauth(),auth=gmail.authorization(config,box.address);
 let startAt=new Date();
 if(req.body.startAt){startAt=new Date(req.body.startAt);if(!Number.isFinite(startAt.getTime())||startAt>Date.now())gmail.fail('Choose a valid start date that is not in the future.');}
 req.session.gmailOAuth={stateHash:auth.stateHash,verifier:auth.verifier,mailboxId:box.id,address:box.address,userId:req.session.userId,version:config.version,redirectUri:gmail.redirectUri(),startAt:startAt.toISOString(),expires:Date.now()+10*60000};
 await saveSession(req);res.json({url:auth.url});
}catch(e){next(e);}}
async function callback(req,res){
 const base=new URL('/admin/mcp',process.env.CLIENT_URL||'http://127.0.0.1:5173');
 const saved=req.session.gmailOAuth;
 try{
  if(!gmail.validState(req.query.state,saved)||saved.userId!==req.session.userId)gmail.fail('Invalid or expired Google sign-in.');
  delete req.session.gmailOAuth;await saveSession(req);
  if(req.query.error)gmail.fail('Google permission was not approved.');
  if(typeof req.query.code!=='string'||req.query.code.length>4096)gmail.fail('Missing authorization code.');
  const config=await gmail.oauth();if(config.version!==saved.version||gmail.redirectUri()!==saved.redirectUri)gmail.fail('OAuth settings changed. Start the connection again.');
  const {token,profile}=await gmail.exchange(req.query.code,saved,config);
  if(profile.emailAddress?.toLowerCase()!==saved.address)gmail.fail('Sign in with the configured support mailbox.');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtext('servit-gmail-oauth'))");await lock(db,saved.mailboxId);
   if((await gmail.oauth(db)).version!==saved.version)gmail.fail('OAuth settings changed.');
   const box=await mailbox(saved.mailboxId,db);if(!box.is_active||box.address!==saved.address)gmail.fail('Mailbox configuration changed.');
   await db.query(`INSERT INTO gmail_connections(mailbox_id,connected_address,refresh_token_encrypted,status,is_paused,start_at,scan_after,connected_at,verified_at,history_id)
    VALUES($1,$2,$3,'connected',FALSE,$4,$4,NOW(),NOW(),$5) ON CONFLICT(mailbox_id) DO UPDATE SET connected_address=$2,refresh_token_encrypted=$3,status='connected',is_paused=FALSE,start_at=COALESCE(gmail_connections.start_at,$4),scan_after=COALESCE(gmail_connections.scan_after,gmail_connections.start_at,$4),history_id=COALESCE(gmail_connections.history_id,$5),connected_at=NOW(),verified_at=NOW(),last_error=NULL,updated_at=NOW()`,[box.id,box.address,encrypt(token.refresh_token),saved.startAt,profile.historyId||null]);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  logAdminAudit(req.session.userId,'GMAIL_CONNECTED','email_automation_mailboxes',saved.mailboxId,saved.address,{},req.ip);
  base.searchParams.set('gmail','connected');
 }catch{base.searchParams.set('gmail','failed');}
 res.set('Referrer-Policy','no-referrer').redirect(303,base.href);
}
async function action(req,res,next){
 const db=await pool.connect();
 try{
  const box=await mailbox(req.params.id),action=req.body.action;
  if(!['check','pause','resume','disconnect','sync'].includes(action))gmail.fail('Select a valid Gmail action.');
  if(action==='sync'){
   const connection=(await db.query('SELECT * FROM gmail_connections WHERE mailbox_id=$1',[box.id])).rows[0];
   if(!box.is_active||!connection||connection.is_paused||!connection.refresh_token_encrypted||['disconnected','reauth_required'].includes(connection.status))gmail.fail('Enable, connect and resume this mailbox before syncing.');
   require('../services/gmailIngestion').syncMailbox(box.id,{force:true}).catch(()=>{});
   return res.status(202).json({success:true,message:'Mailbox sync started. Connection status and processing history update automatically.'});
  }
  await db.query('BEGIN');await lock(db,box.id);
  const connection=(await db.query('SELECT * FROM gmail_connections WHERE mailbox_id=$1 FOR UPDATE',[box.id])).rows[0];if(!connection)gmail.fail('Connect this mailbox first.');
  if(action==='check'){
   const token=await gmail.accessToken(connection,db),profile=await gmail.api(token,'profile');if(profile.emailAddress?.toLowerCase()!==box.address)gmail.fail('Connected Google account does not match the mailbox.');
   await db.query("UPDATE gmail_connections SET status='connected',verified_at=NOW(),last_error=NULL,updated_at=NOW() WHERE mailbox_id=$1",[box.id]);
  }else if(action==='disconnect')await db.query("UPDATE gmail_connections SET status='disconnected',is_paused=TRUE,refresh_token_encrypted=NULL,last_error=NULL,updated_at=NOW() WHERE mailbox_id=$1",[box.id]);
  else{if(!connection.refresh_token_encrypted||['disconnected','reauth_required'].includes(connection.status))gmail.fail('Connect Gmail again before resuming.');await db.query('UPDATE gmail_connections SET is_paused=$2,updated_at=NOW() WHERE mailbox_id=$1',[box.id,action==='pause']);}
  await db.query('COMMIT');logAdminAudit(req.session.userId,'GMAIL_'+action.toUpperCase(),'email_automation_mailboxes',box.id,box.address,{},req.ip);
  res.json({success:true,message:action==='check'?'Gmail connection verified.':action==='disconnect'?'Gmail disconnected in SERVIT. Existing tickets and email history are preserved.':'Gmail processing '+(action==='pause'?'paused.':'resumed.')});
 }catch(e){await db.query('ROLLBACK');if(req.body.action==='check'&&uuid(req.params.id))await gmail.recordError(req.params.id,e).catch(()=>{});next(e);}finally{db.release();}
}
async function retry(req,res,next){try{
 await mailbox(req.params.id);
 if(typeof req.body.messageId!=='string'||req.body.messageId.length>512)gmail.fail('Invalid Gmail message.');
 const result=await pool.query("UPDATE gmail_delivery_queue SET status='pending',next_attempt_at=NOW(),note=NULL,updated_at=NOW() WHERE mailbox_id=$1 AND message_id=$2 AND status IN ('failed','needs_review') RETURNING message_id",[req.params.id,req.body.messageId]);
 if(!result.rowCount)gmail.fail('Only failed or review messages can be retried.');
 require('../services/gmailIngestion').drainQueue();
 res.json({success:true,message:'Email queued for retry. Earlier messages in the same conversation are processed before later replies.'});
}catch(e){next(e);}}
async function get(req,res,next){try{res.json(await gmail.publicConfig());}catch(e){next(e);}}
async function queueStatus(req,res,next){try{
 const status=req.query.status||'pending',page=Number(req.query.page||1),limit=Number(req.query.limit||25),mailboxId=req.query.mailboxId||null;
 if(!['pending','processing','processed','needs_review','failed','skipped'].includes(status)||!Number.isInteger(page)||page<1||page>1000000||!Number.isInteger(limit)||limit<1||limit>100||mailboxId&&!uuid(mailboxId))gmail.fail('Select a valid queue filter and page.');
 res.json(await require('../services/gmailQueue').page({status,page,limit,mailboxId}));
}catch(e){next(e);}}
module.exports={get,save,connect,callback,action,retry,queueStatus};
