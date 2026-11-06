const { randomUUID } = require('crypto');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
function uuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function definition(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 150) invalid('Template name is required (up to 150 characters).');
  if (!Array.isArray(input.fields) || !input.fields.length) invalid('Add at least one template field.');
  const ids = new Set(), labels = new Set();
  const fields = input.fields.map(field => {
    if (!field || typeof field.label !== 'string' || !field.label.trim() || field.label.trim().length > 150) invalid('Each field needs a name (up to 150 characters).');
    if (!['text', 'integer', 'dropdown', 'toggle'].includes(field.type)) invalid('Unsupported template field type.');
    const id = field.id || randomUUID();
    if (!uuid(id) || ids.has(id)) invalid('Field identifiers must be unique.');
    const label = field.label.trim();
    if (labels.has(label.toLowerCase())) invalid('Field names must be unique within a template.');
    ids.add(id); labels.add(label.toLowerCase());
    let options = [];
    if (field.type === 'dropdown') {
      if (!Array.isArray(field.options) || !field.options.length) invalid(`Add dropdown options for ${label}.`);
      options = field.options.map(option => {
        if (typeof option !== 'string' || !option.trim() || option.trim().length > 200) invalid('Dropdown options must be non-empty text (up to 200 characters).');
        return option.trim();
      });
      if (new Set(options.map(o => o.toLowerCase())).size !== options.length) invalid('Dropdown options must be unique.');
    }
    return { id, label, type: field.type, required: field.required === true, options };
  });
  return { name: input.name.trim(), fields };
}
function valuesFor(snapshot, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Template values must be an object.');
  const values = {};
  const fields = snapshot?.fields || [];
  if (Object.keys(input).some(key => !fields.some(f => f.id === key))) invalid('Unknown template field.');
  for (const field of fields) {
    const value = input[field.id];
    const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim());
    if (empty) {
      if (field.required) invalid(`${field.label} is required.`);
      continue;
    }
    if (field.type === 'integer') {
      if (!['number', 'string'].includes(typeof value) || !/^-?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) invalid(`${field.label} must be a whole number within the supported range.`);
      values[field.id] = Number(value);
    } else if (field.type === 'toggle') {
      if (typeof value !== 'boolean') invalid(`${field.label} must be On or Off.`);
      values[field.id] = value;
    } else {
      if (typeof value !== 'string') invalid(`${field.label} must be text.`);
      if (field.type === 'dropdown' && !field.options.includes(value)) invalid(`Choose a valid option for ${field.label}.`);
      values[field.id] = value;
    }
  }
  return values;
}

// Existing tickets keep their original definition, even after an admin edits a template.
async function resolveTicketTemplate(client, body, existing = null) {
  const id = body.templateId === undefined ? existing?.template_id : body.templateId;
  if (!id) {
    if (body.templateValues && Object.keys(body.templateValues).length) invalid('Select a template before entering template values.');
    return { id: null, snapshot: null, values: {} };
  }
  if (!uuid(id)) invalid('Invalid template identifier.');
  let snapshot;
  if (existing?.template_id === id && existing.template_snapshot) {
    snapshot = existing.template_snapshot;
  } else {
    const result = await client.query('SELECT name, fields FROM ticket_templates WHERE id = $1 AND is_active = true', [id]);
    if (!result.rows.length) invalid('This template is no longer available. Choose another template.');
    snapshot = result.rows[0];
  }
  const input = body.templateValues === undefined && existing?.template_id === id ? existing.template_values : body.templateValues;
  return { id, snapshot, values: valuesFor(snapshot, input) };
}
module.exports = { definition, valuesFor, resolveTicketTemplate, uuid };
