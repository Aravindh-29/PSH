// Local administrator CLI; never prints integration credentials or reads customer mail.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {connectionConfig}=require('../../database/migrate');
const {Client}=require('pg');
const args=process.argv.slice(2),has=flag=>args.includes(flag),value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
async function main(){
 if(has('--init-token')){
  const envFile=process.env.SERVIT_ENV_FILE||path.join(__dirname,'../../.env');
  let source=fs.readFileSync(envFile,'utf8');
  const saved=process.env.SERVIT_MCP_TOKEN;
  if(saved&&saved.length<32)throw Error('Existing SERVIT_MCP_TOKEN is too short. Set a secure token with at least 32 characters.');
  for(const [key,val] of Object.entries({SERVIT_MCP_TOKEN:saved||crypto.randomBytes(32).toString('hex'),SERVIT_MCP_ENABLED:'true'})){
   const regex=new RegExp('^'+key+'=.*$','m');source=regex.test(source)?source.replace(regex,()=>key+'='+val):source.replace(/\s*$/,'')+'\n'+key+'='+val+'\n';
  }
  fs.writeFileSync(envFile,source,{mode:0o600});console.log('Secured MCP enabled in .env. Credential value hidden; restart the backend.');
  if(!has('--mailbox')&&!has('--list'))return;
 }
 const db=new Client(connectionConfig());await db.connect();
 try{
  if(has('--list')){console.log(JSON.stringify((await db.query('SELECT address,is_active,allowed_department_ids,fallback_department_id,fallback_subdepartment_id FROM email_automation_mailboxes ORDER BY address')).rows,null,2));return;}
  const address=value('--mailbox')?.trim().toLowerCase();
  if(!address){console.log('Usage: node server/scripts/configure-email-mcp.js --init-token\n       node server/scripts/configure-email-mcp.js --mailbox support@example.com --defaults-file mailbox-defaults.json [--fallback-department UUID] [--fallback-subdepartment UUID] [--departments UUID,UUID] [--sender-domains customer.example] [--disable]\n       node server/scripts/configure-email-mcp.js --list');return;}
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))throw Error('Provide a valid mailbox address.');
  const prior=(await db.query('SELECT * FROM email_automation_mailboxes WHERE address=$1',[address])).rows[0];
  const defaults=value('--defaults-file')?JSON.parse(fs.readFileSync(path.resolve(value('--defaults-file')),'utf8')):prior?.defaults||{};
  if(!defaults||typeof defaults!=='object'||Array.isArray(defaults)||JSON.stringify(defaults).length>100000)throw Error('Defaults must be a JSON object of at most 100 KB.');
  const split=flag=>value(flag)?.split(',').map(v=>v.trim()).filter(Boolean);
  const allowed=split('--departments')||prior?.allowed_department_ids||[],domains=(split('--sender-domains')||prior?.sender_domains||[]).map(v=>v.toLowerCase());
  if(domains.some(v=>!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)))throw Error('Enter sender domains without @ or wildcards.');
  const fallback=value('--fallback-department')||prior?.fallback_department_id||null,child=value('--fallback-subdepartment')||prior?.fallback_subdepartment_id||null;
  const uuid=require('../src/access/context').uuid;
  if(allowed.some(id=>!uuid(id))||fallback&&!uuid(fallback)||child&&!uuid(child))throw Error('Department IDs must be valid UUIDs.');
  for(const id of allowed)if(!(await db.query('SELECT 1 FROM assignment_groups WHERE id=$1 AND is_active',[id])).rowCount)throw Error('Allowed department is inactive or missing.');
  const box={address,allowed_department_ids:allowed,defaults,fallback_department_id:fallback,fallback_subdepartment_id:child};
  const routing=require('../src/services/emailRouting');
  if(fallback)routing.choose(await routing.context(db,box),{sender:'setup@servit.invalid',subject:'',body:'',routingDecision:{departmentId:fallback,subdepartmentId:child,reason:'Validate configured fallback'}});
  const message=await require('../src/services/emailProcessing').fieldsError(db,{status:'NEW',...defaults,shortDescription:'Incoming email',description:'Incoming email body',assignmentGroupId:fallback||null},{allowMissing:true});
  await db.query(`INSERT INTO email_automation_mailboxes(address,defaults,allowed_department_ids,sender_domains,fallback_department_id,fallback_subdepartment_id,is_active)
   VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(address) DO UPDATE SET defaults=EXCLUDED.defaults,allowed_department_ids=EXCLUDED.allowed_department_ids,sender_domains=EXCLUDED.sender_domains,fallback_department_id=EXCLUDED.fallback_department_id,fallback_subdepartment_id=EXCLUDED.fallback_subdepartment_id,is_active=EXCLUDED.is_active,updated_at=NOW()`,[address,defaults,allowed,domains,fallback,child,!has('--disable')]);
  console.log('Mailbox configuration saved. This does not connect Gmail or read any emails.');
  if(message)console.log('Provided defaults need review: '+message);
 }finally{await db.end();await require('../src/db/pool').end();}
}
main().catch(error=>{console.error(error.status?error.message:'Could not configure MCP. Check arguments, database connectivity and defaults JSON.');process.exitCode=1;});
