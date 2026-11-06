const pool = require('../db/pool');
const { logAdminAudit } = require('./adminAuditController');
const defaults = { customize: false, organization_name: '', service_desk_name: '', accent_color: '#E85D04', logo_data: '' };
const columns = 'customize, organization_name, service_desk_name, accent_color, logo_data';
async function get(req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT ${columns} FROM organization_branding WHERE id=1`);
    const branding = rows[0] || defaults;
    res.json({ success: true, branding: req.path.endsWith('/public') && !branding.customize ? defaults : branding });
  } catch (error) { next(error); }
}
async function save(req, res, next) {
  const { customize, organization_name, service_desk_name = '', accent_color = '#E85D04', logo_data = '' } = req.body;
  const text = (v, max) => typeof v === 'string' && v.trim().length <= max;
  if (typeof customize !== 'boolean' || !text(organization_name, 150) || (customize && !organization_name.trim()) || !text(service_desk_name, 150) || !['#E85D04','#1768AC','#008577'].includes(accent_color)) {
    return res.status(400).json({ success: false, message: 'Enter an organization name (up to 150 characters), valid service desk name and accent color.' });
  }
  // Raster-only logos: enforce both the declared type and the file signature.
  if (typeof logo_data !== 'string') return res.status(400).json({ success: false, message: 'Invalid logo.' });
  if (logo_data) {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo_data);
    if (!match || logo_data.length > 350000) return res.status(400).json({ success: false, message: 'Upload a PNG, JPEG, or WebP logo up to 256 KB.' });
    const bytes = Buffer.from(match[2], 'base64');
    const valid = match[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    if (!valid || bytes.length > 262144) return res.status(400).json({ success: false, message: 'Invalid logo image. Use PNG, JPEG, or WebP up to 256 KB.' });
  }
  try {
    const { rows } = await pool.query(`UPDATE organization_branding SET customize=$1, organization_name=$2, service_desk_name=$3, accent_color=$4, logo_data=$5, updated_by=$6, updated_at=NOW() WHERE id=1 RETURNING ${columns}`, [customize, organization_name.trim(), service_desk_name.trim(), accent_color, logo_data, req.session.userId]);
    await logAdminAudit(req.session.userId, 'BRANDING_UPDATED', 'organization_branding', '1', organization_name.trim(), { customize, accent_color, logo_present: !!logo_data }, req.ip);
    res.json({ success: true, branding: rows[0] });
  } catch (error) { next(error); }
}
module.exports = { get, save };
