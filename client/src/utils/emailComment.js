// Presentation only: original email/comment storage is never rewritten.
// Unknown quote formats remain fully visible instead of dropping content.
export function splitEmailComment(body=''){
 const text=String(body).replace(/\r\n?/g,'\n'),lines=text.split('\n');
 let boundary=-1;
 for(let i=1;i<lines.length;i++){
  if(!lines.slice(0,i).join('\n').trim())continue;
  if(/^\s*On\s/i.test(lines[i])){
   for(let end=i;end<Math.min(lines.length,i+5);end++){
    const header=lines.slice(i,end+1).join(' ');
    if(header.length>1000)break;
    if(/\bwrote:\s*$/i.test(header)&&(/\S+@\S+/.test(header)||/\d/.test(header))){boundary=i;break;}
   }
  }
  if(boundary<0&&/^\s*-{3,}\s*Original Message\s*-{3,}\s*$/i.test(lines[i]))boundary=i;
  if(boundary<0&&/^\s*From:\s*\S/i.test(lines[i])){
   const header=lines.slice(i,i+9).join('\n');
   if(/^\s*(?:Sent|Date):/mi.test(header)&&/^\s*To:/mi.test(header)&&/^\s*Subject:/mi.test(header))boundary=i;
  }
  if(boundary>=0)break;
 }
 if(boundary<0){
  const firstQuote=lines.findIndex(line=>/^\s*>/.test(line));
  if(firstQuote>0&&lines.slice(0,firstQuote).join('\n').trim()&&lines.slice(firstQuote).every(line=>!line.trim()||/^\s*>/.test(line)))boundary=firstQuote;
 }
 return boundary<0?{reply:text.trim(),quoted:''}:{reply:lines.slice(0,boundary).join('\n').trim(),quoted:lines.slice(boundary).join('\n').trim()};
}
