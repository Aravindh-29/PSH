const crypto=require('node:crypto');
const pool=require('../db/pool');
const settings=require('../services/mcpSettings');
const {uuid}=require('../access/context');
const {logAdminAudit}=require('./adminAuditController');
function admin(req,res,next){if(!req.access?.admin)return res.status(403).json({message:'Only Admin can configure the MCP server.'});next();}
async function get(req,res,next){try{
 const state=await settings.snapshot();
 const context=await require('../services/emailRouting').context(pool,{allowed_department_ids:[],defaults:{}});
 const subcategories=(await pool.query('SELECT id,name,category_id FROM subcategories WHERE is_active ORDER BY name')).rows;
 const gmail=await require('../services/gmailConnection').publicConfig();
 const ai=await require('../services/emailAI').publicConfig();
 res.json({...state.public,ai,aiConnected:ai.connected,gmail,gmailConnected:gmail.connections.some(c=>c.status==='connected'),context:{...context,subcategories},endpoint:'/api/mcp'});
}catch(e){next(e);}}
async function save(req,res,next){
 const db=await pool.connect();
 try{
  if(typeof req.body.enabled!=='boolean')settings.fail('Select whether MCP is enabled.');
  if(req.body.generateToken!==undefined&&typeof req.body.generateToken!=='boolean')settings.fail('Invalid credential option.');
  const generated=req.body.generateToken?crypto.randomBytes(32).toString('hex'):null;
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('servit-mcp-settings'))");
  const current=(await db.query('SELECT * FROM mcp_server_settings WHERE id=1 FOR UPDATE')).rows[0];
  await db.query(`INSERT INTO mcp_server_settings(id,is_enabled,token_encrypted) VALUES(1,$1,$2)
   ON CONFLICT(id) DO UPDATE SET is_enabled=EXCLUDED.is_enabled,token_encrypted=EXCLUDED.token_encrypted,checked_at=NULL,checked_fingerprint=NULL,updated_at=NOW()`,[req.body.enabled,generated?settings.encrypt(generated):current?.token_encrypted||null]);
  await db.query('COMMIT');
  logAdminAudit(req.session.userId,'MCP_SETTINGS_UPDATED','mcp_server_settings','1','MCP Server',{enabled:req.body.enabled,credentialRotated:!!generated},req.ip);
  res.json({success:true,generatedToken:generated,message:generated?'Settings saved. The new credential is saved securely and can be copied by an Admin. Update integrations using the previous credential.':'MCP settings saved.'});
 }catch(e){await db.query('ROLLBACK');next(e);}finally{db.release();}
}
async function saveMailbox(req,res,next){
 const db=await pool.connect();
 try{
  const body=req.body,address=String(body.address||'').trim().toLowerCase();
  if(address.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))settings.fail('Enter a valid support mailbox address.');
  if(typeof body.is_active!=='boolean')settings.fail('Select mailbox processing status.');
  const allowed=body.allowed_department_ids||[],domains=body.sender_domains||[],defaults=body.defaults||{};
  if(!Array.isArray(allowed)||allowed.length>500||allowed.some(id=>!uuid(id)))settings.fail('Select valid routing departments.');
  if(!Array.isArray(domains)||domains.length>100||domains.some(x=>typeof x!=='string'||x.length>253||!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(x)))settings.fail('Enter sender domains such as dell.com, without @ or wildcards.');
  if(!defaults||typeof defaults!=='object'||Array.isArray(defaults)||JSON.stringify(defaults).length>100000)settings.fail('Invalid ticket defaults.');
  const parsed=require('../mcp/server').envelope.ticketFields.unwrap().safeParse(defaults);
  if(!parsed.success)settings.fail('Default ticket values contain invalid fields or values.');
  const fallback=body.fallback_department_id||null,child=body.fallback_subdepartment_id||null;
  if(fallback&&!uuid(fallback)||child&&(!uuid(child)||!fallback))settings.fail('Select a valid fallback department.');
  await db.query('BEGIN');
  // Serialize configuration writes and checks; renaming an existing mailbox is
  // forbidden because saved message/thread identities belong to that mailbox.
  await db.query("SELECT pg_advisory_xact_lock(hashtext('servit-mcp-settings'))");
  let prior=null;
  if(req.params.id){if(!uuid(req.params.id))settings.fail('Invalid mailbox.');prior=(await db.query('SELECT * FROM email_automation_mailboxes WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!prior)settings.fail('Mailbox not found.');if(prior.address!==address)settings.fail('Add a new mailbox instead of renaming an existing mailbox.');}
  else if((await db.query('SELECT 1 FROM email_automation_mailboxes WHERE address=$1',[address])).rowCount)settings.fail('This mailbox already exists. Select it to edit its settings.');
  const active=(await db.query('SELECT id FROM assignment_groups WHERE id=ANY($1::uuid[]) AND is_active',[allowed])).rows;
  if(new Set(allowed).size!==active.length)settings.fail('One or more selected departments are inactive or missing.');
  const box={address,is_active:body.is_active,defaults,allowed_department_ids:allowed,sender_domains:domains.map(x=>x.toLowerCase()),fallback_department_id:fallback,fallback_subdepartment_id:child};
  if(fallback&&(!prior||fallback!==prior.fallback_department_id||child!==prior.fallback_subdepartment_id)){const ctx=await require('../services/emailRouting').context(db,box);require('../services/emailRouting').choose(ctx,{sender:'check@servit.invalid',subject:'',body:'',routingDecision:{departmentId:fallback,subdepartmentId:child,reason:'Validate configured fallback'}});}
  const args=[address,body.is_active,defaults,allowed,box.sender_domains,fallback,child];
  if(prior)await db.query('UPDATE email_automation_mailboxes SET is_active=$2,defaults=$3,allowed_department_ids=$4,sender_domains=$5,fallback_department_id=$6,fallback_subdepartment_id=$7,updated_at=NOW() WHERE address=$1',args);
  else await db.query('INSERT INTO email_automation_mailboxes(address,is_active,defaults,allowed_department_ids,sender_domains,fallback_department_id,fallback_subdepartment_id) VALUES($1,$2,$3,$4,$5,$6,$7)',args);
  await db.query('UPDATE mcp_server_settings SET checked_at=NULL,checked_fingerprint=NULL WHERE id=1');
  await db.query('COMMIT');
  logAdminAudit(req.session.userId,'MCP_MAILBOX_SAVED','email_automation_mailboxes',prior?.id||address,address,{created:!prior},req.ip);
  res.json({success:true,message:'Mailbox settings saved. Gmail is not connected by this step.'});
 }catch(e){await db.query('ROLLBACK');next(e);}finally{db.release();}
}
async function test(req,res,next){
 let client;
 try{
  const state=await settings.snapshot();
  if(!state.public.configured)settings.fail('Enable MCP, configure a credential, and complete the active mailbox settings before testing.');
  await pool.query('UPDATE mcp_server_settings SET checked_at=NULL,checked_fingerprint=NULL WHERE id=1');
  const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
  const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  client=new Client({name:'servit-admin-connection-check',version:'1.0.0'});
  // Fixed local endpoint: never send the integration credential to an Admin-supplied URL.
  const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${req.socket.localPort}/api/mcp`),{requestInit:{headers:{Authorization:'Bearer '+state.settings.token}},fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)})});
  await client.connect(transport);
  const tools=await client.listTools();
  for(const name of ['get_routing_context','preview_email_routing','process_email','get_ticket','list_email_processing'])if(!tools.tools.some(t=>t.name===name))throw Error('Missing MCP tool');
  for(const box of state.public.mailboxes.filter(b=>b.is_active)){
   const response=await client.callTool({name:'get_routing_context',arguments:{mailbox:box.address}});
   if(response.isError)throw Error('Mailbox context failed');
  }
  // A concurrent save must not inherit an earlier connection-check success.
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query("SELECT pg_advisory_xact_lock(hashtext('servit-mcp-settings'))");
   const current=await settings.snapshot(db);
   if(current.signature!==state.signature){await db.query('ROLLBACK');return res.status(409).json({message:'Settings changed during the check. Test the saved settings again.'});}
   await db.query(`INSERT INTO mcp_server_settings(id,is_enabled,checked_at,checked_fingerprint) VALUES(1,$1,NOW(),$2) ON CONFLICT(id) DO UPDATE SET checked_at=NOW(),checked_fingerprint=$2`,[state.settings.enabled,state.signature]);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  res.json({success:true,message:'MCP connected and ready. Gmail connection status is shown separately.',...(await settings.snapshot()).public});
 }catch(e){if(e.status)return next(e);res.status(400).json({message:'MCP connection check failed. Check the server status, credential and mailbox settings, then retry.'});}
 finally{await client?.close().catch(()=>{});}
}
async function copyCredential(req,res,next){try{
 const {kind,provider}=req.body;let secret;
 if(kind==='mcp')secret=(await settings.runtime()).token;
 else if(kind==='google')secret=require('../services/gmailConnection').secret((await require('../services/gmailConnection').oauth()).client_secret_encrypted);
 else if(kind==='ai'){
  if(!Object.hasOwn(require('../services/emailAI').providers,provider))settings.fail('Select a supported provider.');
  const row=(await pool.query('SELECT api_key_encrypted FROM email_ai_providers WHERE provider=$1',[provider])).rows[0];
  if(row)secret=require('../services/emailSettings').decrypt(row.api_key_encrypted);
 }else settings.fail('Select a supported credential.');
 if(!secret)settings.fail('This credential has not been saved.');
 res.set('Cache-Control','no-store');res.set('Pragma','no-cache');
 logAdminAudit(req.session.userId,'MCP_CREDENTIAL_COPIED','mcp_credentials',kind,provider||kind,{},req.ip);
 res.json({secret});
}catch(e){next(e.status?e:Object.assign(new Error('Could not copy the saved credential.'),{status:400}));}}
module.exports={admin,get,save,saveMailbox,test,copyCredential};
