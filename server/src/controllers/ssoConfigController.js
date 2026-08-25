const { Issuer } = require('openid-client');
const pool = require('../db/pool');
const { invalidateClient } = require('./ssoController');
const { logAdminAudit } = require('./adminAuditController');

async function getSSOConfig(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM sso_config WHERE id = 1');
    const cfg = result.rows[0] || null;
    if (!cfg) return res.json({ success: true, config: null });
    res.json({
      success: true,
      config: {
        providerName:    cfg.provider_name,
        issuerUrl:       cfg.issuer_url,
        clientId:        cfg.client_id,
        clientSecretSet: !!cfg.client_secret,
        redirectUri:     cfg.redirect_uri,
        autoProvision:   cfg.auto_provision,
        isEnabled:       cfg.is_enabled,
        updatedAt:       cfg.updated_at,
      },
    });
  } catch (err) { next(err); }
}

async function saveSSOConfig(req, res, next) {
  try {
    const { providerName, issuerUrl, clientId, clientSecret, redirectUri, autoProvision, isEnabled } = req.body;

    if (!issuerUrl || !clientId || !redirectUri) {
      return res.status(400).json({ success: false, message: 'Issuer URL, Client ID and Redirect URI are required.' });
    }

    // Keep existing secret if a new one was not provided
    let secret = clientSecret || '';
    if (!secret) {
      const ex = await pool.query('SELECT client_secret FROM sso_config WHERE id = 1');
      secret = ex.rows[0]?.client_secret || '';
    }

    await pool.query(
      `INSERT INTO sso_config
         (id, provider_name, issuer_url, client_id, client_secret, redirect_uri, auto_provision, is_enabled, updated_at, updated_by)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7,NOW(),$8)
       ON CONFLICT (id) DO UPDATE SET
         provider_name = EXCLUDED.provider_name,
         issuer_url    = EXCLUDED.issuer_url,
         client_id     = EXCLUDED.client_id,
         client_secret = EXCLUDED.client_secret,
         redirect_uri  = EXCLUDED.redirect_uri,
         auto_provision= EXCLUDED.auto_provision,
         is_enabled    = EXCLUDED.is_enabled,
         updated_at    = NOW(),
         updated_by    = EXCLUDED.updated_by`,
      [providerName || '', issuerUrl, clientId, secret, redirectUri, !!autoProvision, !!isEnabled, req.session.userId]
    );

    invalidateClient();
    logAdminAudit(req.session?.userId, 'SSO_CONFIG_UPDATED', 'sso_config', '1', 'SSO Configuration', { providerName, issuerUrl, isEnabled }, req.ip);
    res.json({ success: true, message: 'SSO configuration saved successfully.' });
  } catch (err) { next(err); }
}

async function testSSOConnection(req, res, next) {
  try {
    const { issuerUrl } = req.body;
    if (!issuerUrl) return res.status(400).json({ success: false, message: 'Issuer URL is required.' });

    const issuer = await Issuer.discover(issuerUrl);
    res.json({
      success: true,
      message: `Connection successful`,
      issuer: issuer.metadata.issuer,
    });
  } catch (err) {
    res.json({ success: false, message: err.message || 'Discovery failed.' });
  }
}

async function clearSSOConfig(req, res, next) {
  try {
    await pool.query('DELETE FROM sso_config WHERE id = 1');
    invalidateClient();
    res.json({ success: true, message: 'SSO configuration cleared.' });
  } catch (err) { next(err); }
}

module.exports = { getSSOConfig, saveSSOConfig, testSSOConnection, clearSSOConfig };
