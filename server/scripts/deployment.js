// Deployment helpers avoid parsing .env or PostgreSQL URLs with shell sed/eval.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { Client } = require('pg');
const root = path.resolve(__dirname, '../..');
const envPath = process.env.SERVIT_ENV_FILE || path.join(root, '.env');
function environment(file = envPath) {
  const config = dotenv.parse(fs.readFileSync(file));
  Object.assign(process.env, config);
  return config;
}
async function prepare(file = envPath) {
  const config = environment(file);
  const { connectionConfig } = require('../../database/migrate');
  const client = new Client(connectionConfig());
  try {
    await client.connect();
    const exists = (await client.query("SELECT to_regclass('email_config') AS name")).rows[0].name;
    const columns = exists ? (await client.query("SELECT attname FROM pg_attribute WHERE attrelid='email_config'::regclass AND attname=ANY($1) AND NOT attisdropped", [['smtp_pass','oauth_client_secret','oauth_refresh_token']])).rows.map(r => r.attname) : [];
    const row = columns.length ? (await client.query('SELECT '+columns.join(',')+' FROM email_config WHERE id=1')).rows[0] || {} : {};
    if (!config.EMAIL_ENCRYPTION_KEY) {
      if (Object.values(row).some(value => value?.startsWith('enc:v1:'))) throw new Error('Encrypted email credentials already exist. Restore the original EMAIL_ENCRYPTION_KEY before updating.');
      const value = crypto.randomBytes(32).toString('base64');
      // Remove an empty assignment, preserve every other setting and comment.
      let text = fs.readFileSync(file,'utf8').replace(/^\s*(?:export\s+)?EMAIL_ENCRYPTION_KEY\s*=.*$/gm,'');
      fs.writeFileSync(file, text.replace(/\s*$/,'')+'\nEMAIL_ENCRYPTION_KEY='+value+'\n', {mode:0o600});
      process.env.EMAIL_ENCRYPTION_KEY = value;
      console.log('Created a persistent email encryption key in .env (value hidden).');
    }
    const settings = require('../src/services/emailSettings');
    // Validate the key even if credentials are empty; verify existing ciphertext.
    settings.encrypt('deployment-key-check');
    for (const value of Object.values(row)) if (value?.startsWith('enc:v1:')) settings.decrypt(value);
    if(process.platform!=='win32')fs.chmodSync(file,0o600);
    console.log('Environment verified. Existing configuration and encryption key preserved.');
  } finally { await client.end(); }
}
function backup(destination) {
  const config=environment(),url=new URL(config.DATABASE_URL);
  const target=path.resolve(destination);
  if(!fs.statSync(path.dirname(target)).isDirectory())throw new Error('Backup directory does not exist.');
  const result=spawnSync(process.env.PG_DUMP_BIN||'pg_dump',['--host',url.hostname,'--port',url.port||'5432','--username',decodeURIComponent(url.username),'--dbname',decodeURIComponent(url.pathname.slice(1)),'--format=custom','--file',target],
    {env:{...process.env,PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:url.searchParams.get('sslmode')||(config.DATABASE_SSL==='true'?'verify-full':'prefer')},stdio:['ignore','ignore','pipe'],windowsHide:true});
  if(result.status!==0||!fs.existsSync(target)||fs.statSync(target).size===0)throw new Error('Database backup failed. Confirm pg_dump version, credentials, network and available disk space.');
  if(process.platform!=='win32')fs.chmodSync(target,0o600);
  console.log('Database backup completed: '+target);
}
async function health() {
  const config=environment(),port=Number(config.PORT||5000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT in .env');
  for(let attempt=0;attempt<30;attempt++) {
    try {const response=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(2000)});const body=await response.json();if(response.ok&&body.status==='healthy'&&body.database==='connected'){console.log('Application and database health checks passed.');return;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Application did not become healthy. Inspect systemctl status servit and journalctl -u servit.');
}
async function main(){const command=process.argv[2];if(command==='prepare-env')await prepare();else if(command==='backup'&&process.argv[3])backup(process.argv[3]);else if(command==='health')await health();else throw new Error('Use prepare-env, backup <file>, or health.');}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prepare,backup,health};
