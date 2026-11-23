// Test-only real process crash after MCP commit, before queue acknowledgement.
const fs=require('node:fs');
async function main(){
 if(process.env.SERVIT_QUEUE_CRASH_TEST!=='yes'||!/^gmail_bulk_test_[a-f0-9]+$/.test(process.env.SERVIT_QUEUE_TEST_SCHEMA||''))throw Error('Disposable test schema required.');
 const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(fixture.testOnly!==true)throw Error('Test fixture required.');
 const pool=require('../../src/db/pool');
 const db=await pool.connect();await db.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['gmail-delivery:'+fixture.mailboxId]);
 await db.query("UPDATE gmail_delivery_queue SET status='processing',attempts=attempts+1,processing_started_at=NOW() WHERE mailbox_id=$1 AND message_id=$2",[fixture.mailboxId,fixture.input.messageId]);
 const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
 const client=new Client({name:'queue-crash-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+process.env.PORT+'/api/mcp'),{requestInit:{headers:{Authorization:'Bearer '+process.env.SERVIT_MCP_TOKEN}}}));
 const result=await client.callTool({name:'process_email',arguments:fixture.input});if(result.isError)throw Error('Test MCP commit failed.');
 // Deliberately skip cleanup: PostgreSQL must release session locks itself.
 fs.writeFileSync(process.argv[2]+'.committed','MCP commit confirmed');
 process.kill(process.pid,'SIGKILL');
}
main().catch(error=>{console.error('Crash-test setup failed: '+error.message);process.exit(1);});
