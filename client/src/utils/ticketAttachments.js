import api from '../api/axios';

export const MAX_ATTACHMENT_SIZE=25*1024*1024;
export function selectAttachments(files,existing=[]){
 const accepted=[],errors=[];
 for(const file of files){
  if(file.size>MAX_ATTACHMENT_SIZE){errors.push(`${file.name}: too large (max 25 MB)`);continue;}
  if(existing.length+accepted.length>=10){errors.push('Select up to 10 attachments at a time.');break;}
  accepted.push(file);
 }
 return {files:accepted,errors};
}

// One file per request stays within the deployed 30 MB proxy limit and isolates failures.
export async function uploadTicketFiles(ticketId,files,onProgress=()=>{},submissionToken){
 const attachments=[],errors=[];
 for(const [index,file] of files.entries()){
  try{
   if(file.size>MAX_ATTACHMENT_SIZE)throw new Error('Too large (max 25 MB)');
   const body=new FormData();body.append('files',file);
   const {data}=await api.post(`/tickets/${ticketId}/attachments`,body,{...(submissionToken?{headers:{'X-Ticket-Submission':submissionToken}}:{}),onUploadProgress:event=>{
    if(event.total){const progress=Math.round(event.loaded*100/event.total);onProgress(index,{progress,status:progress<100?'uploading':'processing'});}
   }});
   if(!data.success||!data.attachments?.length||data.errors?.length)throw new Error(data.errors?.join('; ')||data.message||'The file was not saved.');
   attachments.push(...data.attachments);onProgress(index,{progress:100,status:'done'});
  }catch(error){
   const message=error.response?.data?.message||error.message||'Upload failed';
   errors.push(`${file.name}: ${message}`);onProgress(index,{status:'error',error:message});
  }
 }
 return {attachments,errors};
}
