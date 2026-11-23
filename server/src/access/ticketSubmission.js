// Creation may route work outside the creator's visibility. This short-lived,
// user-bound capability permits only uploading the selected creation attachments.
const crypto=require('node:crypto');
const key=process.env.SESSION_SECRET||crypto.randomBytes(32);
const sign=value=>crypto.createHmac('sha256',key).update(value).digest('hex');
function issue(ticketId,userId,expires=Date.now()+20*60*1000){
 const value=`${ticketId}:${userId}:${expires}`;
 return `${expires}.${sign(value)}`;
}
function valid(token,ticketId,userId){
 if(typeof token!=='string'||token.length>100)return false;
 const [expires,signature]=token.split('.');
 if(!/^\d+$/.test(expires)||!/^[a-f0-9]{64}$/.test(signature||'')||Number(expires)<Date.now()||Number(expires)>Date.now()+21*60*1000)return false;
 return crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(`${ticketId}:${userId}:${expires}`),'hex'));
}
module.exports={issue,valid};
