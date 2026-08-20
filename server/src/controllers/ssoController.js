const { Issuer, generators } = require('openid-client');
const pool = require('../db/pool');
const logger = require('../utils/logger');

let _client = null;

// Called by ssoConfigController after config is saved/cleared
function invalidateClient() {
  _client = null;
  logger.info('SSO: OIDC client cache invalidated');
}

async function getClient() {
  if (_client) return _client;

  // 1. Try DB config (set via Admin UI)
  let cfg = null;
  try {
    const r = await pool.query(
      'SELECT issuer_url, client_id, client_secret, redirect_uri FROM sso_config WHERE id = 1 AND is_enabled = true'
    );
    if (r.rows[0]) {
      const row = r.rows[0];
      cfg = { issuerUrl: row.issuer_url, clientId: row.client_id, clientSecret: row.client_secret, redirectUri: row.redirect_uri };
    }
  } catch { /* table may not exist yet */ }

  // 2. Fall back to environment variables
  if (!cfg) {
    const { SSO_ISSUER_URL, SSO_CLIENT_ID, SSO_CLIENT_SECRET, SSO_REDIRECT_URI } = process.env;
    if (SSO_ISSUER_URL && SSO_CLIENT_ID && SSO_CLIENT_SECRET && SSO_REDIRECT_URI) {
      cfg = { issuerUrl: SSO_ISSUER_URL, clientId: SSO_CLIENT_ID, clientSecret: SSO_CLIENT_SECRET, redirectUri: SSO_REDIRECT_URI };
    }
  }

  if (!cfg) return null;

  try {
    const issuer = await Issuer.discover(cfg.issuerUrl);
    _client = new issuer.Client({
      client_id:      cfg.clientId,
      client_secret:  cfg.clientSecret,
      redirect_uris:  [cfg.redirectUri],
      response_types: ['code'],
    });
    logger.info(`SSO: OIDC client initialized — issuer ${cfg.issuerUrl}`);
  } catch (err) {
    logger.error('SSO: OIDC discovery failed —', err.message);
    _client = null;
  }

  return _client;
}

// GET /api/auth/sso — redirect user to identity provider
async function redirectToProvider(req, res, next) {
  try {
    const client = await getClient();
    if (!client) {
      return res.status(501).json({ success: false, message: 'SSO is not configured on this server.' });
    }

    const state        = generators.state();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    req.session.ssoState        = state;
    req.session.ssoCodeVerifier = codeVerifier;

    const url = client.authorizationUrl({
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/sso/callback — handle provider redirect
async function handleCallback(req, res, next) {
  try {
    const client = await getClient();
    if (!client) return res.redirect('/login?error=sso_not_configured');

    const { ssoState, ssoCodeVerifier } = req.session;
    delete req.session.ssoState;
    delete req.session.ssoCodeVerifier;

    const params = client.callbackParams(req);

    let tokenSet;
    try {
      tokenSet = await client.callback(
        process.env.SSO_REDIRECT_URI,
        params,
        { state: ssoState, code_verifier: ssoCodeVerifier }
      );
    } catch (err) {
      logger.warn('SSO callback token exchange failed:', err.message);
      return res.redirect('/login?error=sso_failed');
    }

    const userinfo = await client.userinfo(tokenSet.access_token);
    const { sub, email, name, given_name, family_name } = userinfo;

    if (!email) {
      logger.warn('SSO callback: provider returned no email for sub', sub);
      return res.redirect('/login?error=sso_no_email');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Try to find by sso_sub (strongest match)
    // 2. Fall back to email match (links existing accounts on first SSO login)
    let result = await pool.query(
      `SELECT id, username, email, full_name, role, is_active, sso_sub
       FROM users
       WHERE sso_sub = $1 OR (email = $2 AND is_active = true)
       LIMIT 1`,
      [sub, normalizedEmail]
    );

    if (result.rows.length === 0) {
      if (process.env.SSO_AUTO_PROVISION !== 'true') {
        logger.warn(`SSO: no user found for email ${normalizedEmail} and auto-provision is off`);
        return res.redirect('/login?error=sso_user_not_found');
      }

      // Auto-provision new user as employee
      const fullName = name
        || [given_name, family_name].filter(Boolean).join(' ')
        || normalizedEmail.split('@')[0];
      const baseUsername = normalizedEmail.split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase();

      result = await pool.query(
        `INSERT INTO users (username, email, full_name, password_hash, role, sso_sub, sso_provider)
         VALUES ($1, $2, $3, '', 'employee', $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET sso_sub = EXCLUDED.sso_sub, sso_provider = EXCLUDED.sso_provider
         RETURNING id, username, email, full_name, role, is_active`,
        [baseUsername, normalizedEmail, fullName, sub, process.env.SSO_PROVIDER_NAME || 'oidc']
      );

      logger.info(`SSO: auto-provisioned user ${normalizedEmail}`);
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.redirect('/login?error=account_disabled');
    }

    // Link sso_sub to existing account on first SSO login
    if (!user.sso_sub) {
      await pool.query(
        'UPDATE users SET sso_sub = $1, sso_provider = $2 WHERE id = $3',
        [sub, process.env.SSO_PROVIDER_NAME || 'oidc', user.id]
      );
    }

    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.role     = user.role;
    req.session.fullName = user.full_name;

    logger.info(`SSO login: ${user.username} (${user.role})`);
    res.redirect('/');
  } catch (err) {
    logger.error('SSO handleCallback error:', err.message);
    res.redirect('/login?error=sso_failed');
  }
}

// GET /api/auth/sso-status — lets the frontend know if SSO is available
async function ssoStatus(req, res) {
  // Check DB config first
  try {
    const r = await pool.query(
      'SELECT provider_name FROM sso_config WHERE id = 1 AND is_enabled = true'
    );
    if (r.rows[0]) {
      return res.json({ enabled: true, providerName: r.rows[0].provider_name || 'SSO' });
    }
  } catch { /* table may not exist */ }

  // Fall back to env vars
  const configured = !!(
    process.env.SSO_ISSUER_URL && process.env.SSO_CLIENT_ID &&
    process.env.SSO_CLIENT_SECRET && process.env.SSO_REDIRECT_URI
  );
  res.json({
    enabled: configured,
    providerName: process.env.SSO_PROVIDER_NAME || (configured ? 'SSO' : null),
  });
}

module.exports = { redirectToProvider, handleCallback, ssoStatus, invalidateClient };
