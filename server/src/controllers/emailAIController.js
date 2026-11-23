const pool=require('../db/pool');
const ai=require('../services/emailAI');
const {logAdminAudit}=require('./adminAuditController');
async function get(req,res,next){try{res.json(await ai.publicConfig());}catch(e){next(e);}}
async function save(req,res,next){
 const db=await pool.connect();
 try{
  const {provider,model,apiKey}=req.body;if(!Object.hasOwn(ai.providers,provider))ai.fail('Select Google Gemini, OpenAI or Claude.');
  if(typeof model!=='string'||!model.length||model.length>150||!/^[a-zA-Z0-9._:-]+$/.test(model))ai.fail('Enter a valid model ID from your provider account.');
  if(apiKey!==undefined&&(typeof apiKey!=='string'||apiKey.length>2000||/\s/.test(apiKey)))ai.fail('Enter a valid API key without whitespace.');
  await db.query('BEGIN');const prior=(await db.query('SELECT * FROM email_ai_providers WHERE provider=$1 FOR UPDATE',[provider])).rows[0];
  if(!prior&&!apiKey)ai.fail('Enter an API key.');
  const {decrypt}=require('../services/emailSettings');let changed=!prior||prior.model!==model||!!apiKey;
  if(prior&&apiKey){try{changed=prior.model!==model||decrypt(prior.api_key_encrypted)!==apiKey;}catch{changed=true;}}
  if(changed){await db.query(`INSERT INTO email_ai_providers(provider,model,api_key_encrypted) VALUES($1,$2,$3) ON CONFLICT(provider) DO UPDATE SET model=$2,api_key_encrypted=$3,version=email_ai_providers.version+1,status='untested',checked_at=NULL,last_error=NULL,last_error_kind=NULL,retry_after=NULL,consecutive_failures=0,last_success_at=NULL,last_failure_at=NULL,updated_at=NOW()`,[provider,model,apiKey?ai.encrypt(apiKey):prior.api_key_encrypted]);await db.query('UPDATE email_ai_settings SET is_enabled=FALSE,updated_at=NOW() WHERE active_provider=$1',[provider]);}
  await db.query('COMMIT');logAdminAudit(req.session.userId,'EMAIL_AI_PROVIDER_SAVED','email_ai_providers',provider,ai.providers[provider],{model,changed},req.ip);
  res.json({success:true,message:changed?'AI provider settings saved. Check the connection before enabling.':'AI settings unchanged.'});
 }catch(e){await db.query('ROLLBACK');next(e);}finally{db.release();}
}
async function test(req,res,next){
 let config;
 try{
  if(!Object.hasOwn(ai.providers,req.body.provider))ai.fail('Select a supported AI provider.');
  config=(await pool.query('SELECT * FROM email_ai_providers WHERE provider=$1',[req.body.provider])).rows[0];if(!config)ai.fail('Save the provider API key and model first.');
  await ai.callProvider(config,{email:{sender:'test@example.invalid',subject:'Connection check',body:'Synthetic connectivity check. There are no customer details, categories or routing destinations. Return null destinations and an empty fields array.'},context:{groups:[],findings:[],categories:[],ticketTypes:[],subcategories:[],fieldDefinitions:[]}});
  const updated=await ai.recordSuccess(config,{checked:true});
  if(!updated.rowCount)return res.status(409).json({message:'AI settings changed during the connection check. Test the saved settings again.'});
  res.json({success:true,message:ai.providers[config.provider]+' connected and ready.'});
 }catch(e){if(config)await ai.recordFailure(config,e).catch(()=>{});next(e.status?e:Object.assign(new Error('AI connection failed.'),{status:400}));}
}
async function activate(req,res,next){
 const db=await pool.connect();
 try{
  if(typeof req.body.enabled!=='boolean')ai.fail('Select whether AI email processing is enabled.');
  const provider=req.body.provider||null;if(provider&&!Object.hasOwn(ai.providers,provider))ai.fail('Select a supported provider.');
  await db.query('BEGIN');
  if(req.body.enabled){const row=(await db.query("SELECT status FROM email_ai_providers WHERE provider=$1 FOR UPDATE",[provider])).rows[0];if(row?.status!=='connected')ai.fail('Save and successfully check the selected provider before enabling AI.');}
  await db.query(`INSERT INTO email_ai_settings(id,is_enabled,active_provider) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET is_enabled=$1,active_provider=$2,updated_at=NOW()`,[req.body.enabled,provider]);
  await db.query('COMMIT');logAdminAudit(req.session.userId,'EMAIL_AI_ACTIVATION','email_ai_settings','1','Email AI',{enabled:req.body.enabled,provider},req.ip);
  res.json({success:true,message:req.body.enabled?'AI email extraction enabled for new conversations.':'AI email extraction disabled. Email capture continues using findings and rules.'});
 }catch(e){await db.query('ROLLBACK');next(e);}finally{db.release();}
}
module.exports={get,save,test,activate};
