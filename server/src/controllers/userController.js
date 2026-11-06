const pool = require('../db/pool');
const argon2 = require('argon2');
const { logAdminAudit } = require('./adminAuditController');
const accessUsers = require('../access/users');
const { need, forbidden } = require('../access/policy');

async function list(req, res, next) {
  try {
    const { scope } = req.query;

    const whereClause = scope === 'with_tickets'
      ? `WHERE (u.deleted_at IS NULL OR EXISTS (
           SELECT 1 FROM tickets
           WHERE (assigned_to = u.id OR (assigned_to IS NULL AND created_by = u.id))
             AND deleted_at IS NULL
         ))`
      : `WHERE u.deleted_at IS NULL`;

    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at,
             u.deleted_at, u.mfa_required, u.mfa_enabled,
             (SELECT name FROM access_roles WHERE key=u.role) AS role_name,
             COALESCE((SELECT json_agg(group_id) FROM user_managed_groups WHERE user_id=u.id),'[]') AS managed_group_ids,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS ticket_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')) AS open_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status IN ('RESOLVED','CLOSED')) AS resolved_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.priority = 'CRITICAL') AS critical_count,
             COALESCE(
               (SELECT json_agg(json_build_object('id', g.id, 'name', g.name))
                FROM user_groups ug JOIN assignment_groups g ON g.id = ug.group_id
                WHERE ug.user_id = u.id),
               '[]'
             ) AS groups
      FROM users u
      LEFT JOIN tickets t ON (t.assigned_to = u.id OR (t.assigned_to IS NULL AND t.created_by = u.id))
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.full_name
    `);
    res.json({ success: true, users: result.rows });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.created_at, u.deleted_at, (SELECT name FROM access_roles WHERE key=u.role) AS role_name,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS ticket_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')) AS open_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.status IN ('RESOLVED','CLOSED')) AS resolved_count,
             COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.priority = 'CRITICAL') AS critical_count
      FROM users u
      LEFT JOIN tickets t ON (t.assigned_to = u.id OR (t.assigned_to IS NULL AND t.created_by = u.id))
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function createAccount(client, req, body) {
  const {username,email,fullName,password,role='employee',mfaRequired=true}=body;
  if(typeof username!=='string' || !/^[a-z0-9._-]{1,50}$/i.test(username) || typeof email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>255 || typeof fullName!=='string' || !fullName.trim() || fullName.length>255 || typeof password!=='string' || password.length<8 || password.length>256) accessUsers.fail('Enter valid account details and a password of 8–256 characters.');
  if(typeof mfaRequired!=='boolean')accessUsers.fail('Invalid MFA requirement.');
  const selected=await accessUsers.assignRole(client,req,role);
  if(mfaRequired===false) need(req,'users.mfa_requirement');
  if((body.groupIds?.length || body.managedGroupIds?.length)) need(req,'users.groups');
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  const result=await client.query('INSERT INTO users(username,email,full_name,password_hash,role,mfa_required) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,username,email,full_name,role,is_active',[username.toLowerCase().trim(),email.toLowerCase().trim(),fullName.trim(),hash,selected.key,mfaRequired!==false]);
  await accessUsers.setGroups(client,req,result.rows[0].id,body);
  return result.rows[0];
}
async function create(req,res,next) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');await accessUsers.lock(client);
    const user=await createAccount(client,req,req.body);
    await client.query('COMMIT');
    await logAdminAudit(req.access.userId,'USER_CREATED','user',user.id,user.full_name,{role:user.role},req.ip);
    res.status(201).json({success:true,user});
  } catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')e=Object.assign(new Error('Username or email already exists'),{status:409});next(e)}finally{client.release()}
}
async function update(req,res,next) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');await accessUsers.lock(client);
    const user=await accessUsers.target(client,req,req.params.id,req.body);
    const {fullName,email,role,isActive,groupIds,managedGroupIds,mfaRequired}=req.body;
    let nextRole=user.role;
    if(role!==undefined && role!==user.role) nextRole=(await accessUsers.assignRole(client,req,role)).key;
    if(isActive!==undefined && isActive!==user.is_active) {need(req,'users.status');if(typeof isActive!=='boolean')accessUsers.fail('Invalid account status.');}
    if(mfaRequired!==undefined && mfaRequired!==user.mfa_required) {need(req,'users.mfa_requirement');if(typeof mfaRequired!=='boolean')accessUsers.fail('Invalid MFA setting.');}
    if(fullName!==undefined && (typeof fullName!=='string' || !fullName.trim() || fullName.length>255))accessUsers.fail('Enter a valid full name.');
    if(email!==undefined && (typeof email!=='string' || email.length>255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))accessUsers.fail('Enter a valid email.');
    for(const [field,table] of [['groupIds','user_groups'],['managedGroupIds','user_managed_groups']]) if(req.body[field]!==undefined){
      if(!Array.isArray(req.body[field]))accessUsers.fail('Select valid groups.');
      const prior=(await client.query(`SELECT group_id FROM ${table} WHERE user_id=$1`,[user.id])).rows.map(r=>r.group_id).sort();
      if(JSON.stringify(prior)!==JSON.stringify([...req.body[field]].sort()))need(req,'users.groups');
    }
    const result=await client.query('UPDATE users SET full_name=$1,email=$2,role=$3,is_active=$4,mfa_required=$5,updated_at=NOW() WHERE id=$6 RETURNING id,username,email,full_name,role,is_active,mfa_required,mfa_enabled',[fullName?.trim()||user.full_name,email?.trim().toLowerCase()||user.email,nextRole,isActive??user.is_active,mfaRequired??user.mfa_required,user.id]);
    await accessUsers.setGroups(client,req,user.id,{groupIds,managedGroupIds});
    await client.query('COMMIT');
    await logAdminAudit(req.access.userId,'USER_UPDATED','user',user.id,result.rows[0].full_name,{old_role:user.role,role:nextRole,groupIds,managedGroupIds,isActive,mfaRequired},req.ip);
    res.json({success:true,user:result.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')e=Object.assign(new Error('Email already exists'),{status:409});next(e)}finally{client.release()}
}

async function resetPassword(req, res, next) {
  try {
    await accessUsers.target(pool,req,req.params.id);
    const { id } = req.params;
    const { password } = req.body;
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
      return res.status(400).json({ success: false, message: 'Password must be 8–256 characters' });
    }
    const hash = await argon2.hash(password);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, full_name, username',
      [hash, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const { full_name, username } = result.rows[0];
    logAdminAudit(req.session?.userId, 'USER_PASSWORD_RESET', 'user', id, full_name, { username }, req.ip);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) { next(err); }
}

async function deleteUser(req,res,next) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');await accessUsers.lock(client);
    const user=await accessUsers.target(client,req,req.params.id,{deleting:true});
    if(req.body.deleteTickets===true) {need(req,'users.delete_tickets');await client.query('UPDATE tickets SET deleted_at=NOW(),deleted_by=$2 WHERE created_by=$1 AND deleted_at IS NULL',[user.id,req.access.userId]);}
    await client.query("UPDATE users SET username=username||'_del_'||LEFT(id::text,8),email=email||'_del_'||LEFT(id::text,8),deleted_at=NOW(),is_active=false,updated_at=NOW() WHERE id=$1",[user.id]);
    await client.query('COMMIT');await logAdminAudit(req.access.userId,'USER_DELETED','user',user.id,user.full_name,{deleteTickets:req.body.deleteTickets===true},req.ip);
    res.json({success:true,message:'User deleted'});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
}

async function deleteAllTickets(req, res, next) {
  try {
    await accessUsers.target(pool,req,req.params.id);
    const { id } = req.params;
    const user = await pool.query('SELECT id, full_name FROM users WHERE id = $1', [id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const result = await pool.query(
      'UPDATE tickets SET deleted_at = NOW() WHERE created_by = $1 AND deleted_at IS NULL RETURNING id',
      [id]
    );
    res.json({ success: true, deleted: result.rowCount, message: `${result.rowCount} ticket(s) deleted for "${user.rows[0].full_name}"` });
  } catch (err) { next(err); }
}

async function bulkCreate(req,res,next) {
  try {
    const {adminPassword,users}=req.body;
    if(!Array.isArray(users) || !users.length || users.length>500 || typeof adminPassword!=='string')accessUsers.fail('Provide a password and 1–500 users.');
    const caller=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.access.userId])).rows[0];
    if(!caller || !await argon2.verify(caller.password_hash,adminPassword))throw forbidden();
    need(req,'users.create');
    const groupRows=(await pool.query('SELECT id,name FROM assignment_groups WHERE is_active=true')).rows;
    const resolveNames=value=>(Array.isArray(value)?value:String(value||'').split(',')).map(n=>{
      const found=groupRows.find(g=>g.name.toLowerCase()===String(n).trim().toLowerCase());
      if(!found)accessUsers.fail('Group not found: '+n);return found.id;
    });
    const created=[],failed=[];
    for(const row of users){
      const client=await pool.connect();
      try {
        await client.query('BEGIN');await accessUsers.lock(client);
        const user=await createAccount(client,req,{...row,groupIds:row.groupIds||resolveNames(row.groups||[]),managedGroupIds:row.managedGroupIds||resolveNames(row.managedGroups||[])});
        await client.query('COMMIT');created.push({username:user.username,fullName:user.full_name});
      }catch(e){await client.query('ROLLBACK').catch(()=>{});failed.push({username:row.username,reason:e.code==='23505'?'Username or email already exists':e.status?e.message:'Could not create user'});}finally{client.release()}
    }
    await logAdminAudit(req.access.userId,'USER_BULK_CREATED','user','',created.length+' users',{created:created.length,failed:failed.length},req.ip);
    res.json({success:true,created:created.length,failed,createdUsers:created});
  }catch(e){next(e)}
}

async function resetMfa(req, res, next) {
  try {
    await accessUsers.target(pool,req,req.params.id);
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1 AND deleted_at IS NULL RETURNING id, full_name, username',
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    const { full_name, username } = result.rows[0];
    logAdminAudit(req.session?.userId, 'USER_MFA_RESET', 'user', id, full_name, { username }, req.ip);
    res.json({ success: true, message: 'MFA reset â€” user must re-enroll on next login' });
  } catch (err) { next(err); }
}

async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, is_active, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.session.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function updateMe(req, res, next) {
  try {
    const { fullName, email, currentPassword, newPassword } = req.body;
    const existing = await pool.query(
      'SELECT id, email, full_name, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.session.userId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = existing.rows[0];

    const sets = [];
    const params = [];

    if (fullName && fullName.trim()) {
      params.push(fullName.trim()); sets.push(`full_name = $${params.length}`);
    }
    if (email && email.trim() && email.toLowerCase() !== user.email) {
      const conflict = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
        [email.toLowerCase(), req.session.userId]
      );
      if (conflict.rows.length > 0) return res.status(409).json({ success: false, message: 'Email already in use' });
      params.push(email.toLowerCase()); sets.push(`email = $${params.length}`);
    }

    if (newPassword) {
      if(typeof newPassword!=='string'||newPassword.length<8||newPassword.length>256)accessUsers.fail('Password must be 8–256 characters.');
      if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password required to set a new password' });
      const valid = await argon2.verify(user.password_hash, currentPassword);
      if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
      params.push(hash); sets.push(`password_hash = $${params.length}`);
    }

    if (sets.length === 0) return res.json({ success: true, message: 'No changes' });

    params.push(req.session.userId);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id, username, email, full_name, role`,
      params
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { next(err); }
}

async function bulkCheck(req, res, next) {
  try {
    const { usernames = [], emails = [] } = req.body;
    if (!usernames.length && !emails.length) {
      return res.json({ success: true, conflictUsernames: [], conflictEmails: [] });
    }
    const rows = await pool.query(
      `SELECT username, email FROM users
       WHERE deleted_at IS NULL
         AND (username = ANY($1) OR email = ANY($2))`,
      [
        usernames.map(u => String(u).toLowerCase().trim()),
        emails.map(e => String(e).toLowerCase().trim()),
      ]
    );
    res.json({
      success: true,
      conflictUsernames: rows.rows.map(r => r.username),
      conflictEmails:    rows.rows.map(r => r.email),
    });
  } catch (err) { next(err); }
}

async function activity(req,res,next){try{const {rows}=await pool.query('SELECT action,details,created_at,(SELECT full_name FROM users WHERE id=al.user_id) AS actor_name FROM admin_audit_logs al WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at DESC LIMIT 100',['user',req.params.id]);res.json({success:true,activity:rows})}catch(e){next(e)}}

module.exports = { activity, list, getOne, create, update, resetPassword, resetMfa, deleteUser, deleteAllTickets, bulkCreate, bulkCheck, getMe, updateMe };
