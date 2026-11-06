// Regression checks for security updates. Loopback HTTP and temporary files only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const express = require('express');
const compression = require('compression');
const multer = require('multer');
const ExcelJS = require('../../client/node_modules/exceljs');
const JSZip = require('../../client/node_modules/jszip');
let checks = 0;
function check(name, condition) { assert(condition, name); checks++; console.log('PASS: ' + name); }
async function main() {
  const app = express(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'servit-dependency-test-'));
  app.use(compression({ threshold: 0 }));
  app.use(express.json()); app.use(express.urlencoded({ extended: true }));
  app.post('/echo', (req, res) => res.json(req.body));
  app.get('/compressed', (req, res) => res.json({ text: 'Verified compression '.repeat(500) }));
  app.post('/upload', multer({ storage: multer.memoryStorage(), limits: { files: 2 } }).array('files', 2),
    (req, res) => res.json({ files: req.files.map(file => ({ name: file.originalname, text: file.buffer.toString() })), note: req.body.note }));
  const pool = require('../src/db/pool'), originalQuery = pool.query;
  // Stub data only; exercise the real attachment ZIP controller and HTTP stream.
  pool.query = async sql => ({ rows: sql.includes('FROM tickets')
    ? [{ ticket_number: 'TEST0001', created_by: 'fixture', assigned_to: null }]
    : [{ file_name: 'notes.txt', file_data: Buffer.from('First note') }, { file_name: 'notes.txt', file_data: Buffer.from('Second note') }] });
  app.get('/ticket/:id/attachments', (req, res, next) => { req.session = { role: 'admin' }; next(); }, require('../src/controllers/attachmentController').downloadZip);
  app.use((error, req, res, next) => res.status(400).json({ error: error.code || 'BAD_REQUEST' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  try {
    const { default: axios } = await import(pathToFileURL(path.resolve(__dirname, '../../client/node_modules/axios/index.js')).href);
    const response = await axios.post(url + '/echo', { message: 'Patched HTTP client' }, { proxy: false });
    check('Patched Axios preserves JSON requests and responses', response.data.message === 'Patched HTTP client');
    const nested = await fetch(url + '/echo', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'user[name]=Manager&groups[]=L1&groups[]=L2' });
    const nestedBody = await nested.json();
    check('Patched Express/qs preserves nested form parsing', nestedBody.user.name === 'Manager' && nestedBody.groups.join(',') === 'L1,L2');
    const compressed = await fetch(url + '/compressed', { headers: { 'accept-encoding': 'gzip' } });
    check('Patched compression produces readable gzip responses', compressed.headers.get('content-encoding') === 'gzip' && (await compressed.json()).text.length > 1000);
    const body = new FormData(); body.set('note', 'Work note');
    body.append('files', new Blob(['First attachment'], { type: 'text/plain' }), 'one.txt');
    body.append('files', new Blob(['Second attachment'], { type: 'text/plain' }), 'two.txt');
    const uploaded = await fetch(url + '/upload', { method: 'POST', body }); const result = await uploaded.json();
    check('Multer 2 preserves multiple memory uploads and form fields', uploaded.status === 200 && result.files.length === 2 && result.files[0].text === 'First attachment' && result.note === 'Work note');
    const extra = new FormData(); for (let i = 0; i < 3; i++) extra.append('files', new Blob(['x']), i + '.txt');
    const rejected = await fetch(url + '/upload', { method: 'POST', body: extra });
    check('Multer 2 enforces file-count limits', rejected.status === 400 && (await rejected.json()).error === 'LIMIT_FILE_COUNT');
    const malformed = await fetch(url + '/upload', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=missing' }, body: '--wrong--' });
    check('Malformed multipart returns a handled error', malformed.status === 400);
    check('HTTP server remains responsive after malformed upload', (await fetch(url + '/compressed')).status === 200);
    fs.writeFileSync(path.join(temp, 'export.txt'), 'ZIP export content');
    fs.writeFileSync(path.join(temp, 'skip.log'), 'Not part of archive');
    const { ZipArchive } = await import('archiver');
    const archive = new ZipArchive(), chunks = [];
    const archiveDone = new Promise((resolve, reject) => { archive.on('data', chunk => chunks.push(chunk)); archive.on('end', resolve); archive.on('error', reject); });
    archive.glob('*.txt', { cwd: temp }); archive.append('Ticket attachment', { name: 'ticket.txt' });
    await archive.finalize(); await archiveDone;
    const zip = await JSZip.loadAsync(Buffer.concat(chunks));
    check('Patched glob matcher preserves ZIP selection and contents', Object.keys(zip.files).length === 2 && await zip.file('export.txt').async('string') === 'ZIP export content' && await zip.file('ticket.txt').async('string') === 'Ticket attachment');
    const downloaded = await fetch(url + '/ticket/fixture/attachments');
    const ticketZip = await JSZip.loadAsync(await downloaded.arrayBuffer());
    check('Actual ticket ZIP handler streams valid archives and deduplicates names', downloaded.status === 200 && downloaded.headers.get('content-type').includes('application/zip') && await ticketZip.file('notes.txt').async('string') === 'First note' && await ticketZip.file('notes(2).txt').async('string') === 'Second note');
    const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Roles');
    sheet.addRow(['Name', 'Role']); sheet.addRow(['David', 'Manager']); sheet.getCell('A1').font = { bold: true };
    const bytes = await workbook.xlsx.writeBuffer(), reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(bytes);
    check('Excel exports remain readable with values and formatting', reopened.getWorksheet('Roles').getCell('B2').value === 'Manager' && reopened.getWorksheet('Roles').getCell('A1').font.bold);
    const { minimatch } = createRequire(require.resolve('nodemon/package.json'))('minimatch');
    check('Patched development matcher keeps file-pattern support', minimatch('server/src/server.js', '**/*.js') && !minimatch('photo.png', '**/*.js'));
    console.log(checks + ' dependency compatibility checks passed.');
  } finally { pool.query = originalQuery; await pool.end(); await new Promise(resolve => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
