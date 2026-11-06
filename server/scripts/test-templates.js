// Local integration test. Supply TEST_USERNAME and TEST_PASSWORD for an admin
// with MFA disabled. Temporary records are removed in finally; existing records
// are never edited. Run while the local API is running.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../src/db/pool');
const { definition, valuesFor } = require('../src/services/templateService');
const origin = process.env.TEST_API_URL || 'http://localhost:5000/api';
const createdTemplates = [], createdTickets = [];
let cookie;
async function api(path, method = 'GET', body, expected = 200, session = cookie) {
  const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
  return { result, response };
}
async function createTemplate(payload) {
  const { result } = await api('/config/admin/templates', 'POST', payload, 201);
  createdTemplates.push(result.template.id);
  return result.template;
}
async function createTicket(payload) {
  const { result } = await api('/tickets', 'POST', payload, 201);
  createdTickets.push(result.ticket.id);
  return result.ticket;
}
async function run() {
  try {
    assert(process.env.TEST_USERNAME && process.env.TEST_PASSWORD, 'Set TEST_USERNAME and TEST_PASSWORD.');
    const field = type => ({ id: randomUUID(), label: type, type, options: type === 'dropdown' ? ['Production', 'Test'] : [] });
    const fields = ['text', 'integer', 'dropdown', 'toggle'].map(field);
    fields[0].required = true;
    const valid = { [fields[0].id]: 'Long notes\n'.repeat(6000), [fields[1].id]: 0, [fields[2].id]: 'Production', [fields[3].id]: false };
    assert.equal(valuesFor({ fields }, valid)[fields[1].id], 0);
    assert.equal(valuesFor({ fields }, valid)[fields[3].id], false);
    for (const bad of [1.5, '1e3', true, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => valuesFor({ fields }, { ...valid, [fields[1].id]: bad }));
    assert.throws(() => definition({ name: 'Bad', fields: [{ ...fields[2], options: ['Test', 'test'] }] }));
    assert.throws(() => definition({ name: 'Bad', fields: [fields[0], { ...fields[0], id: randomUUID() }] }));
    assert.throws(() => valuesFor({ fields }, { ...valid, unexpected: 'value' }));
    console.log('PASS: type validation, zero, false, duplicate labels/options, unknown fields');
    await api('/config/templates', 'GET', undefined, 401, '');
    const login = await api('/auth/login', 'POST', { username: process.env.TEST_USERNAME, password: process.env.TEST_PASSWORD });
    assert(login.result.user?.role === 'admin', 'Admin login must complete without MFA.');
    cookie = login.response.headers.get('set-cookie').split(';')[0];
    const employee = (await pool.query("SELECT id,username,role,full_name FROM users WHERE role='employee' AND is_active=true AND deleted_at IS NULL LIMIT 1")).rows[0];
    if (employee) {
      // Exercise middleware using a short-lived signed local session; no user settings change.
      const session = require('express-session');
      const Store = require('connect-pg-simple')(session);
      const store = new Store({ pool, tableName: 'session' });
      const sid = randomUUID();
      await new Promise((resolve, reject) => store.set(sid, { cookie: { maxAge: 60000, expires: new Date(Date.now() + 60000) }, userId: employee.id, username: employee.username, role: employee.role }, error => error ? reject(error) : resolve()));
      const signature = require('cookie-signature').sign(sid, process.env.SESSION_SECRET);
      const employeeCookie = `psh.sid=${encodeURIComponent('s:' + signature)}`;
      try { await api('/config/admin/templates', 'POST', { name: 'Denied', fields }, 403, employeeCookie); }
      finally { await new Promise((resolve, reject) => store.destroy(sid, error => error ? reject(error) : resolve())); store.close(); }
    }
    console.log('PASS: unauthenticated and employee administration denied');
    const name = `Template verification ${Date.now()}`;
    const template = await createTemplate({ name, fields });
    await api('/config/admin/templates', 'POST', { name: name.toUpperCase(), fields }, 409);
    const categories = (await api('/config/categories')).result.categories;
    const types = (await api('/config/ticket-types')).result.types;
    const base = { customerName: 'Template verification only', moduleText: 'General', categoryId: categories[0].id, typeId: types[0].id, shortDescription: 'Temporary automated template verification', description: 'Automatically removed after verification.', priority: 'MEDIUM' };
    const normal = await createTicket(base);
    assert.equal(normal.template_id, null);
    const ticket = await createTicket({ ...base, templateId: template.id, templateValues: valid });
    const opened = (await api(`/tickets/${ticket.id}`)).result.ticket;
    assert.deepEqual(opened.template_values, valid);
    assert.equal(opened.template_snapshot.name, name);
    await api('/tickets', 'POST', { ...base, templateId: template.id, templateValues: {} }, 400);
    await api('/tickets', 'POST', { ...base, templateId: template.id, templateValues: { ...valid, [fields[2].id]: 'Unknown' } }, 400);
    await api('/tickets', 'POST', { ...base, templateId: 'bad-id' }, 400);
    console.log('PASS: optional template, all four field types, long-text round trip, invalid values rejected');
    await api(`/config/admin/templates/${template.id}`, 'PUT', { name: name + ' edited', fields: [{ ...fields[0], label: 'Renamed Notes' }], is_active: false });
    assert(!(await api('/config/templates')).result.templates.some(t => t.id === template.id));
    assert((await api('/config/templates?all=true')).result.templates.some(t => t.id === template.id));
    const edited = await api(`/tickets/${ticket.id}`, 'PUT', { templateId: template.id, templateValues: { ...valid, [fields[1].id]: 7 } });
    assert.equal(edited.result.ticket.template_snapshot.fields[0].label, 'text');
    assert.equal(edited.result.ticket.template_values[fields[1].id], 7);
    await api('/tickets', 'POST', { ...base, templateId: template.id, templateValues: valid }, 400);
    const second = await createTemplate({ name: name + ' second', fields: [field('toggle')] });
    const switched = (await api(`/tickets/${ticket.id}`, 'PUT', { templateId: second.id, templateValues: {} })).result.ticket;
    assert.equal(switched.template_id, second.id);
    assert.deepEqual(switched.template_values, {});
    const cleared = (await api(`/tickets/${ticket.id}`, 'PUT', { templateId: null, templateValues: {} })).result.ticket;
    assert.equal(cleared.template_id, null);
    assert.equal(cleared.template_snapshot, null);
    assert.deepEqual(cleared.template_values, {});
    const audit = (await api(`/tickets/${ticket.id}`)).result.audit;
    assert(audit.some(a => a.field_name === 'template_values'));
    console.log('PASS: edit, deactivate, historical snapshot, switch, clear, audit trail');
  } finally {
    // Only delete records whose IDs were returned to this verification run.
    if (createdTickets.length) {
      await pool.query('DELETE FROM ticket_sla_instances WHERE ticket_id = ANY($1::uuid[])', [createdTickets]);
      await pool.query('DELETE FROM notifications WHERE ticket_id = ANY($1::uuid[])', [createdTickets]);
      await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdTickets]);
    }
    if (createdTemplates.length) {
      await pool.query('DELETE FROM admin_audit_logs WHERE entity_type=$1 AND entity_id=ANY($2::text[])', ['ticket_template', createdTemplates]);
      await pool.query('DELETE FROM ticket_templates WHERE id=ANY($1::uuid[])', [createdTemplates]);
    }
    if (cookie) await api('/auth/logout', 'POST');
    await pool.end();
    console.log('Temporary verification records cleaned up.');
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
