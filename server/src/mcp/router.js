const express=require('express'),crypto=require('node:crypto');
const {rateLimit}=require('express-rate-limit');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {createServer}=require('./server');

function createRouter(config){
 const router=express.Router();
 const settings=()=>config||{enabled:process.env.SERVIT_MCP_ENABLED==='true',token:process.env.SERVIT_MCP_TOKEN||'',origin:process.env.CLIENT_URL||'http://127.0.0.1:5173',allowedMailboxes:(process.env.SERVIT_MCP_MAILBOXES||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)};
 router.use(async(req,res,next)=>{
  let c;try{c=config?settings():await require('../services/mcpSettings').runtime();}catch{return res.status(503).json({message:'MCP configuration is unavailable. Ask an administrator to check its settings.'});}
  if(!c.enabled||c.token.length<32)return res.status(503).json({message:'MCP is disabled or not securely configured.'});
  let origin;try{origin=new URL(c.origin).origin;}catch{return res.status(503).json({message:'MCP origin is not configured correctly.'});}
  if(req.headers.origin&&req.headers.origin!==origin)return res.status(403).json({message:'Origin is not allowed.'});
  const allowedHosts=new Set([new URL(origin).hostname,'localhost','127.0.0.1','[::1]']);
  if(!allowedHosts.has(req.hostname))return res.status(403).json({message:'Host is not allowed.'});
  const provided=(req.headers.authorization||'').replace(/^Bearer /,'');
  const digest=value=>crypto.createHash('sha256').update(value).digest();
  if(!req.headers.authorization?.startsWith('Bearer ')||!crypto.timingSafeEqual(digest(provided),digest(c.token))){res.set('WWW-Authenticate','Bearer');return res.status(401).json({message:'Valid MCP integration credentials are required.'});}
  req.mcpConfig=c;next();
 });
 const requestLimit=Math.max(120,Math.min(10000,Number(process.env.SERVIT_MCP_RATE_LIMIT_PER_MINUTE)||600));
 router.use(rateLimit({windowMs:60000,limit:requestLimit,standardHeaders:'draft-7',legacyHeaders:false,validate:{trustProxy:false}}));
 // Authenticate before allocating large bodies. The rest of the API stays at 1 MB.
 router.use(express.json({limit:'36mb'}));
 router.post('/',async(req,res,next)=>{
  const server=createServer(req.mcpConfig),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{transport.close().catch(()=>{});server.close().catch(()=>{});});
  try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}
  catch(e){if(!res.headersSent)res.status(500).json({jsonrpc:'2.0',error:{code:-32603,message:'MCP request failed.'},id:req.body?.id??null});}
 });
 router.all('/',(req,res)=>res.status(405).set('Allow','POST').json({jsonrpc:'2.0',error:{code:-32000,message:'Stateless MCP uses POST; streaming sessions are not enabled.'},id:null}));
 router.use((error,req,res,next)=>res.status(error.status===413?413:400).json({message:error.status===413?'MCP request exceeds 36 MB.':'Invalid MCP request body.'}));
 return router;
}
module.exports={createRouter};
