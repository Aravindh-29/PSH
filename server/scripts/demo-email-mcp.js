// Hands-on local demo. Reads the private MCP credential from .env, never prints it.
const fs=require('node:fs'),path=require('node:path');
require('dotenv').config({path:process.env.SERVIT_ENV_FILE||path.join(__dirname,'../../.env')});
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const action=process.argv[2]||'help',statePath=path.join(__dirname,'../../backups/stage1-demo.json');
async function main(){
 if(!['preview','first','duplicate','reply','status'].includes(action)){
  console.log('Usage: node server/scripts/demo-email-mcp.js preview|first|duplicate|reply|status');return;
 }
 if(!fs.existsSync(statePath))throw Error('The demo mailbox/session must be configured first.');
 const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
 const client=new Client({name:'servit-hands-on-demo',version:'1.0.0'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(state.endpoint||'http://127.0.0.1:5000/api/mcp'),{requestInit:{headers:{Authorization:'Bearer '+process.env.SERVIT_MCP_TOKEN}}}));
  let tool='process_email',args={...state.first};
  if(action==='preview'){tool='preview_email_routing';args={mailbox:args.mailbox,sender:args.sender,subject:args.subject,body:args.body};}
  if(action==='reply'){
   if(!state.ticketId)throw Error('Run the first step before replying.');
   const next=(state.replyNumber||0)+1;
   args={mailbox:state.first.mailbox,sender:state.first.sender,messageId:state.first.messageId+'-reply-'+next,threadId:state.first.threadId,subject:'Re: '+state.first.subject,body:`[STAGE 1 DEMO — reply ${next}]\nThe Dell system issue is still happening. Please check the attached test logs.`,attachments:[{name:'stage1-demo-reply-log.txt',mimeType:'text/plain',contentBase64:Buffer.from('Simulated reply log for the Stage 1 hands-on test.').toString('base64')}]};
  }
  if(action==='status'){
   if(!state.ticketId)throw Error('Run the first step before checking status.');
   tool='get_ticket';args={mailbox:state.first.mailbox,ticketId:state.ticketId};
  }
  const result=await client.callTool({name:tool,arguments:args});
  if(result.isError)throw Error(result.content?.find(c=>c.type==='text')?.text||'MCP operation failed.');
  const data=JSON.parse(result.content.find(c=>c.type==='text').text);
  if(action==='first'||action==='duplicate'){if(data.ticketId)state.ticketId=data.ticketId;if(data.ticketNumber)state.ticketNumber=data.ticketNumber;}
  if(action==='reply')state.replyNumber=(state.replyNumber||0)+1;
  if(!['status','preview'].includes(action))fs.writeFileSync(statePath,JSON.stringify(state,null,2)+'\n');
  if(action==='status')console.log(JSON.stringify({ticketNumber:data.ticket.ticket_number,status:data.ticket.status,createdBy:data.ticket.created_by_name,assignedTo:data.ticket.assigned_to,departmentId:data.ticket.assignment_group_id,subdepartmentId:data.ticket.subgroup_id,receivedEmails:data.messages.length,messages:data.messages.map(m=>({messageId:m.message_id,body:m.body}))},null,2));
  else console.log(JSON.stringify(data,null,2));
 }finally{await client.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
