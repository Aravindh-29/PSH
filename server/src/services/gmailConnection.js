const crypto=require('node:crypto');
const pool=require('../db/pool');
const secrets=require('./emailSettings');
const SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function redirectUri(){
 const origin=new URL(process.env.CLIENT_URL||'http://127.0.0.1:5173');
 if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))fail('Use HTTPS for the application URL, except for localhost testing.');
 return origin.origin+'/api/config/admin/mcp/gmail/callback';
}
async function google(url,options={}){
 let response;
 try{response=await fetch(url,{...options,signal:AbortSignal.timeout(30000),redirect:'error'});}catch{fail('Google could not be reached. Retry the connection or sync.',502);}
 if(Number(response.headers.get('content-length'))>75*1024*1024)fail('The Gmail message is too large to import. Open it in Gmail for review.');
 const text=await response.text();if(text.length>75*1024*1024)fail('The Gmail response exceeds the import size limit.');
 let data;try{data=JSON.parse(text);}catch{fail('Google returned an unreadable response.',502);}
 if(!response.ok){
  const reauth=response.status===401||data.error==='invalid_grant';
  const rateLimited=response.status===429||response.status===403&&data.error?.errors?.some(e=>['rateLimitExceeded','userRateLimitExceeded','quotaExceeded'].includes(e.reason));
  const retryHeader=response.headers.get('retry-after'),retryAfterSeconds=retryHeader?Math.min(3600,Math.max(0,/^\d+$/.test(retryHeader)?Number(retryHeader):Math.ceil((Date.parse(retryHeader)-Date.now())/1000)||0)):0;
  throw Object.assign(new Error(reauth?'Google authorization expired or was revoked. Connect Gmail again.':rateLimited?'Google rate limit reached. Sync will retry automatically.':response.status===403?'Google denied Gmail access. Check Gmail API, account permissions and consent.':'Google request failed. Check OAuth settings and retry.'),{status:400,reauth,retryable:rateLimited||response.status>=500,googleStatus:response.status,retryAfterSeconds});
 }
 return data;
}
async function oauth(db=pool){const row=(await db.query('SELECT * FROM gmail_oauth_settings WHERE id=1')).rows[0];if(!row)fail('Save Google Client ID and Client Secret first.');return row;}
function secret(value){try{return secrets.decrypt(value);}catch{fail('Google credentials cannot be decrypted. Restore EMAIL_ENCRYPTION_KEY or save new credentials.');}}
async function accessToken(connection,db=pool){
 const config=await oauth(db);
 if(!connection.refresh_token_encrypted)fail('Connect this Gmail mailbox first.');
 return (await google('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:secret(config.client_secret_encrypted),refresh_token:secret(connection.refresh_token_encrypted),grant_type:'refresh_token'})})).access_token;
}
const api=(token,path)=>google('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:'Bearer '+token}});
async function publicConfig(db=pool){
 const config=(await db.query('SELECT client_id,version FROM gmail_oauth_settings WHERE id=1')).rows[0];
 const connections=(await db.query(`SELECT c.mailbox_id,c.connected_address,c.status,c.is_paused,c.start_at,c.connected_at,c.verified_at,c.last_sync_at,c.last_error,b.address,b.is_active FROM gmail_connections c JOIN email_automation_mailboxes b ON b.id=c.mailbox_id ORDER BY b.address`)).rows;
 const deliveries=(await db.query(`SELECT q.mailbox_id,q.message_id,q.status,q.attempts,q.ticket_id,q.note,q.attachment_warnings,q.updated_at,b.address,t.ticket_number FROM gmail_delivery_queue q JOIN email_automation_mailboxes b ON b.id=q.mailbox_id LEFT JOIN tickets t ON t.id=q.ticket_id ORDER BY q.updated_at DESC LIMIT 40`)).rows;
 return {clientId:config?.client_id||'',clientSecretSet:!!config,redirectUri:redirectUri(),scope:SCOPE,pollSeconds:30,connections,deliveries};
}
function authorization(config,address){
 const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(32).toString('base64url');
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:config.client_id,redirect_uri:redirectUri(),response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',login_hint:address,state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 return {url:url.href,stateHash:crypto.createHash('sha256').update(state).digest('hex'),verifier};
}
function validState(state,saved){
 return typeof state==='string'&&state.length<=256&&saved&&saved.expires>Date.now()&&typeof saved.stateHash==='string'&&saved.stateHash.length===64&&crypto.timingSafeEqual(crypto.createHash('sha256').update(state).digest(),Buffer.from(saved.stateHash,'hex'));
}
async function exchange(code,saved,config){
 const token=await google('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:secret(config.client_secret_encrypted),redirect_uri:saved.redirectUri,code,code_verifier:saved.verifier,grant_type:'authorization_code'})});
 if(!token.access_token||!token.refresh_token)fail('Google did not provide offline access. Connect again and approve Gmail read access.');
 if(token.scope&&!token.scope.split(' ').includes(SCOPE))fail('Gmail read permission was not granted.');
 return {token,profile:await api(token.access_token,'profile')};
}
async function recordError(id,error,db=pool,expectedToken=null){await db.query(`UPDATE gmail_connections SET status=$2,last_error=$3,next_sync_at=NOW()+($5*INTERVAL '1 second'),updated_at=NOW() WHERE mailbox_id=$1 AND status<>'disconnected' AND refresh_token_encrypted IS NOT NULL AND ($4::text IS NULL OR refresh_token_encrypted=$4)`,[id,error.reauth?'reauth_required':'error',error.status?error.message:'Gmail sync failed. Retry or reconnect the mailbox.',expectedToken,Math.max(60,error.retryAfterSeconds||0)]);}
module.exports={SCOPE,redirectUri,google,oauth,secret,accessToken,api,publicConfig,authorization,validState,exchange,recordError,fail};
