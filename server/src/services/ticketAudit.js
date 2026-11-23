async function logAudit(client, ticketId, userId, action, fieldName, oldValue, newValue, ipAddress) {
  await client.query(
    `INSERT INTO ticket_audit_logs (ticket_id, user_id, action, field_name, old_value, new_value, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ticketId, userId, action, fieldName || null, oldValue ? String(oldValue) : null, newValue ? String(newValue) : null, ipAddress || null]
  );
}

module.exports=logAudit;
