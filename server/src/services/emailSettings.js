const crypto = require('node:crypto');
const tls = require('node:tls');
const net = require('node:net');
const nodemailer = require('nodemailer');
const https = require('node:https');

const MASK = '••••••••';
const secrets = ['smtp_pass', 'oauth_client_secret', 'oauth_refresh_token'];
const fields = ['smtp_host','smtp_port','smtp_user','from_name','from_email','encryption','is_enabled','auth_type','oauth_client_id','oauth_token_url','tls_servername','tls_ca',...secrets];
const defaults = { smtp_host:'',smtp_port:587,smtp_user:'',smtp_pass:'',from_name:'SERV-IT Notifications',from_email:'',encryption:'tls',is_enabled:false,auth_type:'password',oauth_client_id:'',oauth_client_secret:'',oauth_refresh_token:'',oauth_token_url:'https://oauth2.googleapis.com/token',tls_servername:'',tls_ca:'' };
const bad = message => Object.assign(new Error(message), {status:400});
function key() {
  const value = process.env.EMAIL_ENCRYPTION_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value,'base64').length!==32) throw new Error('EMAIL_ENCRYPTION_KEY must contain a base64-encoded 32-byte key.');
  return Buffer.from(value,'base64');
}
function encrypt(value) {
  if (!value) return '';
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const text=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return 'enc:v1:'+Buffer.concat([iv,cipher.getAuthTag(),text]).toString('base64');
}
function decrypt(value) {
  if (!value || !value.startsWith('enc:v1:')) return value || ''; // Migration compatibility.
  try {
    const data=Buffer.from(value.slice(7),'base64'),cipher=crypto.createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));
    cipher.setAuthTag(data.subarray(12,28));
    return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8');
  } catch { throw new Error('Saved email credentials could not be decrypted. Check EMAIL_ENCRYPTION_KEY.'); }
}
function publicConfig(row={}) {
  const cfg={...defaults,...row};
  for (const name of secrets) { cfg[name]=''; cfg[name+'_set']=!!row[name]; }
  delete cfg.updated_by;
  return cfg;
}
function prepare(input, prior={}, testing=false) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw bad('Enter email configuration details.');
  const allowed=new Set([...fields,'test_to',...secrets.map(s=>'clear_'+s)]);
  for (const name of Object.keys(input)) if(!allowed.has(name)) throw bad('Unknown email configuration field: '+name);
  const cfg={...defaults,...prior}, changed=[];
  for (const name of fields) {
    if (testing && name==='is_enabled') continue;
    if (input[name]===undefined) continue;
    let value=input[name];
    if (name==='is_enabled') { if(typeof value!=='boolean')throw bad('Enabled must be On or Off.'); }
    else if (name==='smtp_port') {
      if(!/^[0-9]+$/.test(String(value))||Number(value)<1||Number(value)>65535)throw bad('SMTP port must be a whole number from 1 to 65535.');
      value=Number(value);
    } else {
      if(typeof value!=='string')throw bad('Invalid value for '+name+'.');
      if(value.length>(name==='tls_ca'?20000:secrets.includes(name)?16000:2048))throw bad(name+' is too long.');
      if(!secrets.includes(name))value=value.trim();
    }
    if(secrets.includes(name)) {
      // Empty or masked fields retain the existing secret. Clearing is explicit.
      if(value===''||value===MASK)continue;
      if(value!==decrypt(prior[name])){cfg[name]=encrypt(value);changed.push(name);}
    } else if(value!==cfg[name]) {cfg[name]=value;changed.push(name);}
  }
  for(const name of secrets) if(input['clear_'+name]!==undefined) {
    if(typeof input['clear_'+name]!=='boolean')throw bad('Invalid clear-credential option.');
    if(input['clear_'+name] && cfg[name]) {cfg[name]='';if(!changed.includes(name))changed.push(name);}
  }
  if(!testing&&!changed.length) return {cfg,changed};
  const disabling=changed.length===1&&changed[0]==='is_enabled'&&!cfg.is_enabled;
  if(!disabling) validate(cfg, !testing&&!cfg.is_enabled&&secrets.some(s=>input['clear_'+s]===true));
  const identityChanged=['smtp_host','smtp_user','auth_type','oauth_client_id','oauth_token_url'].some(s=>changed.includes(s));
  if(identityChanged && prior.smtp_host) {
    const required=cfg.auth_type==='password'?['smtp_pass']:cfg.auth_type==='oauth2'?['oauth_client_secret','oauth_refresh_token']:[];
    if(required.some(s=>typeof input[s]!=='string'||!input[s]||input[s]===MASK))throw bad('Re-enter credentials when changing the SMTP server, account or OAuth identity.');
  }
  return {cfg,changed};
}
function address(value) { return typeof value==='string'&&value.length<=254&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value); }
function validate(cfg, allowMissingSecrets=false) {
  if(!cfg.smtp_host || cfg.smtp_host.length>253 || (!net.isIP(cfg.smtp_host)&&! /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(cfg.smtp_host)))throw bad('Enter a valid SMTP hostname or IP address without a URL or port.');
  if(!['tls','ssl','none'].includes(cfg.encryption))throw bad('Choose STARTTLS, SSL/TLS or None.');
  if(!['password','oauth2','none'].includes(cfg.auth_type))throw bad('Choose Password, OAuth2 or No authentication.');
  if(!Number.isInteger(cfg.smtp_port)||cfg.smtp_port<1||cfg.smtp_port>65535)throw bad('Enter a valid SMTP port.');
  if(!address(cfg.from_email))throw bad('Enter one valid From Email address.');
  if(/[\r\n]/.test(cfg.from_name)||cfg.from_name.length>255)throw bad('Enter a valid sender name.');
  if(cfg.auth_type!=='none'&&!cfg.smtp_user)throw bad('SMTP username is required.');
  if(cfg.auth_type==='password'&&!cfg.smtp_pass&&!allowMissingSecrets)throw bad('Enter the SMTP password or app password.');
  if(cfg.auth_type==='oauth2') {
    if(!address(cfg.smtp_user)||!cfg.oauth_client_id||(!allowMissingSecrets&&(!cfg.oauth_client_secret||!cfg.oauth_refresh_token)))throw bad('OAuth2 requires an email account, client ID, client secret and refresh token.');
    try {const url=new URL(cfg.oauth_token_url);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error();}catch{throw bad('Enter an HTTPS OAuth token endpoint.');}
  }
  if(cfg.tls_servername && !/^[a-z0-9.-]+$/i.test(cfg.tls_servername))throw bad('Enter a valid TLS server name.');
  if(cfg.tls_ca) { try {tls.createSecureContext({ca:cfg.tls_ca});if(!cfg.tls_ca.includes('-----BEGIN CERTIFICATE-----'))throw Error();}catch{throw bad('Enter a valid PEM CA certificate.');} }
}
function refreshAccessToken(cfg) {
  return new Promise((resolve,reject)=>{
    const fail=()=>reject(Object.assign(new Error('OAuth token refresh failed.'),{code:'EAUTH'}));
    const body=new URLSearchParams({grant_type:'refresh_token',client_id:cfg.oauth_client_id,client_secret:decrypt(cfg.oauth_client_secret),refresh_token:decrypt(cfg.oauth_refresh_token)}).toString();
    const request=https.request(cfg.oauth_token_url,{method:'POST',rejectUnauthorized:true,ca:cfg.tls_ca||undefined,timeout:10000,
      headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}},response=>{
      let data='';response.on('data',chunk=>{data+=chunk;if(data.length>65536)request.destroy();});
      response.on('error',fail);
      response.on('end',()=>{try{const result=JSON.parse(data);if(response.statusCode!==200||typeof result.access_token!=='string'||!result.access_token) return fail();resolve(result);}catch{fail();}});
    });
    request.on('timeout',()=>request.destroy());request.on('error',fail);request.end(body);
  });
}
function transport(cfg,onRotate) {
  validate(cfg);
  const options={host:cfg.smtp_host,port:Number(cfg.smtp_port),secure:cfg.encryption==='ssl',requireTLS:cfg.encryption==='tls',ignoreTLS:cfg.encryption==='none',
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,
    tls:{rejectUnauthorized:true,...(cfg.tls_servername?{servername:cfg.tls_servername}:{}),...(cfg.tls_ca?{ca:cfg.tls_ca}:{})},disableFileAccess:true,disableUrlAccess:true};
  if(cfg.auth_type==='password')options.auth={user:cfg.smtp_user,pass:decrypt(cfg.smtp_pass)};
  if(cfg.auth_type==='oauth2')options.auth={type:'OAuth2',user:cfg.smtp_user,clientId:cfg.oauth_client_id,clientSecret:decrypt(cfg.oauth_client_secret),refreshToken:decrypt(cfg.oauth_refresh_token),accessUrl:cfg.oauth_token_url};
  const transporter=nodemailer.createTransport(options);
  if(cfg.auth_type==='oauth2') {
    let cached,expires=0,pending;
    transporter.set('oauth2_provision_cb',(user,renew,callback)=>{
      if(cached&&!renew&&expires>Date.now()+30000)return callback(null,cached,expires);
      if(!pending)pending=refreshAccessToken(cfg).then(async result=>{
        if(result.refresh_token&&result.refresh_token!==decrypt(cfg.oauth_refresh_token)){
          const previous=cfg.oauth_refresh_token,next=encrypt(result.refresh_token);
          if(onRotate)await onRotate(next,previous);
          cfg.oauth_refresh_token=next;
        }
        cached=result.access_token;expires=Date.now()+Math.max(1,Number(result.expires_in)||3600)*1000;
        return cached;
      }).finally(()=>{pending=null;});
      pending.then(token=>callback(null,token,expires),error=>callback(error));
    });
  }
  return transporter;
}
function safeError(error) {
  if(error?.code==='EAUTH')return 'SMTP authentication failed. Check the account, credential and provider authentication policy.';
  if(/CERT|TLS|SSL|SELF_SIGNED|ALTNAME/i.test(error?.code||'')||/certificate/i.test(error?.message||''))return 'TLS certificate validation failed. Check the server name and trusted CA certificate.';
  if(['ETIMEDOUT','ECONNECTION','ESOCKET','EDNS','ECONNREFUSED','ENOTFOUND'].includes(error?.code))return 'Could not connect to the SMTP server. Check the host, port, encryption and network access.';
  if(error?.code==='EENVELOPE')return 'The SMTP server rejected the sender or recipient. Check the approved addresses.';
  return 'Email delivery failed. Check the SMTP settings and delivery history.';
}
async function init(client) {
  key();
  await client.query(`ALTER TABLE email_config ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'password',
    ADD COLUMN IF NOT EXISTS oauth_client_id TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS oauth_client_secret TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS oauth_token_url TEXT NOT NULL DEFAULT 'https://oauth2.googleapis.com/token',
    ADD COLUMN IF NOT EXISTS tls_servername TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS tls_ca TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS email_outbox(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),recipient TEXT NOT NULL,subject TEXT NOT NULL,html TEXT NOT NULL,
      from_name TEXT NOT NULL,from_email TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),locked_at TIMESTAMPTZ,sent_at TIMESTAMPTZ,last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS email_outbox_pending ON email_outbox(status,next_attempt_at);`);
  const {rows}=await client.query('SELECT * FROM email_config WHERE id=1');
  for(const name of secrets) if(rows[0]?.[name]&&!rows[0][name].startsWith('enc:v1:'))await client.query(`UPDATE email_config SET ${name}=$1 WHERE id=1`,[encrypt(rows[0][name])]);
}
module.exports={MASK,secrets,fields,defaults,encrypt,decrypt,publicConfig,prepare,validate,address,transport,safeError,init};
