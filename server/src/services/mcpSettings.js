const crypto=require('node:crypto');
const pool=require('../db/pool');
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
function key(){
 const secret=process.env.EMAIL_ENCRYPTION_KEY;
 if(!secret||!/^[A-Za-z0-9+/]{43}=$/.test(secret)||Buffer.from(secret,'base64').length!==32)fail('Configure the server EMAIL_ENCRYPTION_KEY before saving an MCP credential.');
 return crypto.createHmac('sha256',Buffer.from(secret,'base64')).update('servit-mcp-settings').digest();
}
function encrypt(token){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
 const data=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),data].map(x=>x.toString('base64')).join('.');
}
function decrypt(value){
 try{const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64')),cipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');}
 catch{fail('The saved MCP credential cannot be read. Restore the server EMAIL_ENCRYPTION_KEY or generate a new credential.');}
}
async function runtime(db=pool,{allowUnreadable=false}={}){
 const row=(await db.query('SELECT * FROM mcp_server_settings WHERE id=1')).rows[0];
 let token=process.env.SERVIT_MCP_TOKEN||'',credentialError=null;
 if(row?.token_encrypted)try{token=decrypt(row.token_encrypted);}catch(error){if(!allowUnreadable)throw error;token='';credentialError=error.message;}
 return {enabled:row?row.is_enabled:process.env.SERVIT_MCP_ENABLED==='true',token,credentialError,origin:process.env.CLIENT_URL||'http://127.0.0.1:5173',allowedMailboxes:(process.env.SERVIT_MCP_MAILBOXES||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),row};
}
function fingerprint(settings,boxes){return crypto.createHash('sha256').update(JSON.stringify([settings.enabled,settings.token,settings.origin,settings.allowedMailboxes,boxes])).digest('hex');}
async function mailboxStatus(db,box,settings){
 const problems=[];
 if(!box.is_active)problems.push('Mailbox processing is disabled.');
 if(settings.allowedMailboxes.length&&!settings.allowedMailboxes.includes(box.address))problems.push('Mailbox is blocked by the server credential scope.');
 return {...box,problems,ready:problems.length===0};
}
async function snapshot(db=pool){
 const settings=await runtime(db,{allowUnreadable:true}),boxes=(await db.query('SELECT * FROM email_automation_mailboxes ORDER BY address')).rows;
 const mailboxes=await Promise.all(boxes.map(box=>mailboxStatus(db,box,settings)));
 const active=mailboxes.filter(box=>box.is_active),signature=fingerprint(settings,boxes);
 const configured=settings.enabled&&settings.token.length>=32&&active.length>0&&active.every(box=>box.ready);
 return {settings,signature,public:{enabled:settings.enabled,hasToken:settings.token.length>=32,credentialError:settings.credentialError,mailboxes,allowedMailboxes:settings.allowedMailboxes,configured,connected:!!(configured&&settings.row?.checked_at&&settings.row.checked_fingerprint===signature),checkedAt:settings.row?.checked_at||null,aiConnected:false}};
}
module.exports={runtime,encrypt,snapshot,fail};
