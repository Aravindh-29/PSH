const pool = require('../db/pool');
const { randomUUID } = require('node:crypto');

// Only server-owned diagnostics are persisted. Never copy vendor response bodies,
// exception messages, prompts, field values, headers or credentials into history.
function failure(error, attempts = []) {
 const kind = ['auth','configuration','transient','request'].includes(error?.failureKind) ? error.failureKind : 'internal';
 const http = attempts.at(-1)?.httpStatus;
 const known = {
  'The AI credential cannot be decrypted. Restore the server encryption key or save a new API key.':'CREDENTIAL_DECRYPT_FAILED',
  'Email and routing context exceed the AI input limit. Capturing without AI.':'INPUT_TOO_LARGE',
  'AI response is too large.':'RESPONSE_TOO_LARGE',
  'AI provider returned an unreadable response.':'UNREADABLE_RESPONSE',
  'AI response did not complete.':'INCOMPLETE_RESPONSE',
  'AI response was blocked or incomplete.':'BLOCKED_OR_INCOMPLETE',
  'AI returned invalid structured details. Capturing without AI.':'INVALID_STRUCTURED_OUTPUT'
 };
 const code = http >= 400 ? 'HTTP_' + http : known[error?.message] || (kind === 'request' ? 'INVALID_RESPONSE' : kind === 'transient' ? 'NETWORK_OR_TIMEOUT' : kind.toUpperCase());
 const messages = {
  auth: 'Provider rejected the credentials or model permission. Check the saved API key and model access.',
  configuration: 'Provider configuration or request was rejected. Check the model ID, API access and billing.',
  transient: http === 429 ? 'Provider rate limit or quota reached. Processing will retry after the cooldown.' : 'Provider unavailable, network failure or timeout. Automatic recovery will retry; email capture continues.',
  request: 'Response was blocked, incomplete, unreadable or failed structured-output validation, or the request exceeded the size limit. Email capture continues without AI values.',
  internal: 'AI preparation or processing failed inside SERVIT. Check server diagnostics using this process ID. Email capture continues.'
 };
 return {kind, code, message: Object.hasOwn(known,error?.message) ? error.message : messages[kind]};
}
async function write(config, meta = {}, entry = {}, db = pool) {
 const id = randomUUID();
 try {
  await db.query(`INSERT INTO email_ai_logs(id,provider,model,purpose,outcome,mailbox_id,message_id,thread_id,started_at,duration_ms,failure_kind,error_code,error_message,attempts,result_summary)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
   [id, config.provider, config.model, meta.purpose || 'connection_check', entry.outcome,
    meta.mailboxId || null, meta.messageId || null, meta.threadId || null,
    new Date(entry.started || Date.now()), Math.max(0,Date.now() - (entry.started || Date.now())),
    entry.failure?.kind || null, entry.failure?.code || null, entry.failure?.message || null,
    JSON.stringify(entry.attempts || []), JSON.stringify(entry.summary || {})]);
 } catch {
  // Observability must not prevent capture or cause duplicate tickets on retry.
  console.error('[AI logs] Could not persist process diagnostics');
 }
 return id;
}
async function cleanup(db = pool) {
 return db.query(`DELETE FROM email_ai_logs WHERE created_at < NOW() - (
  SELECT ai_retention_days * INTERVAL '1 day' FROM audit_retention_settings WHERE id=1 AND ai_enabled)`);
}
module.exports = { write, failure, cleanup };
