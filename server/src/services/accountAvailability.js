function normalize(field,value){
  if(typeof value!=='string')throw Object.assign(new Error('Enter a valid '+field+'.'),{status:400});
  const normalized=value.trim().toLowerCase();
  const valid=field==='username'?/^[a-z0-9._-]{1,50}$/.test(normalized):normalized.length<=255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if(!valid)throw Object.assign(new Error('Enter a valid '+field+'.'),{status:400});
  return normalized;
}
async function checkAccountAvailability(db,body){
  const fields=['username','email'].filter(field=>body[field]!==undefined);
  if(!fields.length)throw Object.assign(new Error('Enter a username or email to check.'),{status:400});
  const values=Object.fromEntries(fields.map(field=>[field,normalize(field,body[field])]));
  const result=await db.query(`SELECT
    EXISTS(SELECT 1 FROM users WHERE deleted_at IS NULL AND LOWER(username)=$1) AS username_exists,
    EXISTS(SELECT 1 FROM users WHERE deleted_at IS NULL AND LOWER(email)=$2) AS email_exists`,[values.username||null,values.email||null]);
  return Object.fromEntries(fields.map(field=>[field,{available:!result.rows[0][field+'_exists']} ]));
}
module.exports={checkAccountAvailability};
