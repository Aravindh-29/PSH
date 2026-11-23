export function aiStatus(ai){
 const verified=(ai?.providers||[]).filter(p=>p.keySet&&p.status==='connected');
 const active=(ai?.providers||[]).find(p=>p.provider===ai?.activeProvider);
 if(ai?.enabled&&ai.connected&&active?.degraded)return {ready:false,configured:true,label:active.last_error_kind==='request'?'Connected · Last request needs review':'Connected · Provider temporarily unavailable',description:active.retry_after?`AI remains enabled. Next email analysis can retry after ${new Date(active.retry_after).toLocaleTimeString()}. Ticket capture continues.`:'The saved connection is verified. Ticket capture continues; a later successful analysis clears this warning.'};
 if(ai?.enabled)return ai.connected&&active?.status==='connected'
  ?{ready:true,label:'Connected and enabled',description:`${active.name} is processing new email conversations.`}
  :{ready:false,label:'Enabled · Connection needs attention',description:'Check the active provider connection below. Email capture continues.'};
 if(verified.length)return {ready:false,label:'Connected · Not activated',description:'Connection verified. Enable AI routing to process new email conversations.',activateProvider:verified.length===1?verified[0].provider:null};
 return {ready:false,label:'Not connected',description:'Configure and check an AI provider below.'};
}
