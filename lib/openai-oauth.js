const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.chzzk-scribe');
const DEFAULT_TOKEN_PATH = path.join(DEFAULT_CONFIG_DIR, 'openai-oauth.json');
const OPENAI_OAUTH_DEFAULTS = {
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  authorizationUrl: 'https://auth.openai.com/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  port: 1455,
  callbackPath: '/auth/callback',
};

function base64Url(buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function openBrowser(url) {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function getDefaultRedirectUri(port = OPENAI_OAUTH_DEFAULTS.port, callbackPath = OPENAI_OAUTH_DEFAULTS.callbackPath) {
  return `http://localhost:${port}${callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`}`;
}

function saveToken(token, tokenPath = DEFAULT_TOKEN_PATH) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify({ ...token, savedAt: new Date().toISOString() }, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return tokenPath;
}

function loadToken(tokenPath = DEFAULT_TOKEN_PATH) {
  if (!fs.existsSync(tokenPath)) return null;
  return JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
}

function clearToken(tokenPath = DEFAULT_TOKEN_PATH) {
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  return true;
}

async function exchangeCode({ tokenUrl, clientId, redirectUri, code, verifier }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${response.status} ${text}`);
  }
  return JSON.parse(text);
}

async function startOAuthLogin({
  clientId = OPENAI_OAUTH_DEFAULTS.clientId,
  authorizationUrl = OPENAI_OAUTH_DEFAULTS.authorizationUrl,
  tokenUrl = OPENAI_OAUTH_DEFAULTS.tokenUrl,
  scopes = OPENAI_OAUTH_DEFAULTS.scopes,
  redirectUri,
  port = OPENAI_OAUTH_DEFAULTS.port,
  callbackPath = OPENAI_OAUTH_DEFAULTS.callbackPath,
  tokenPath = DEFAULT_TOKEN_PATH,
  timeoutMs = 180000,
} = {}) {
  if (!clientId || !authorizationUrl || !tokenUrl) {
    throw new Error('clientId, authorizationUrl, tokenUrl are required for OAuth login.');
  }

  const finalRedirectUri = redirectUri || getDefaultRedirectUri(port, callbackPath);
  const { verifier, challenge } = createPkcePair();
  const state = base64Url(crypto.randomBytes(16));
  const auth = new URL(authorizationUrl);
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', finalRedirectUri);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', Array.isArray(scopes) ? scopes.join(' ') : scopes);
  auth.searchParams.set('state', state);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('prompt', 'login');

  const redirect = new URL(finalRedirectUri);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url || '/', finalRedirectUri);
        if (requestUrl.pathname !== redirect.pathname) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        if (requestUrl.searchParams.get('state') !== state) {
          throw new Error('OAuth state mismatch.');
        }
        const error = requestUrl.searchParams.get('error');
        if (error) throw new Error(`OAuth error: ${error}`);
        const code = requestUrl.searchParams.get('code');
        if (!code) throw new Error('OAuth code was not returned.');

        const token = await exchangeCode({
          tokenUrl,
          clientId,
          redirectUri: finalRedirectUri,
          code,
          verifier,
        });
        const savedPath = saveToken({
          ...token,
          provider: 'openai',
          clientId,
          scopes,
          redirectUri: finalRedirectUri,
        }, tokenPath);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h1>치지직 스크라이브 인증 완료</h1><p>이 창을 닫아도 됩니다.</p></body></html>');
        server.close();
        resolve({ success: true, tokenPath: savedPath, expiresIn: token.expires_in });
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(error.message);
        server.close();
        reject(error);
      }
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error('OAuth login timed out.'));
    }, timeoutMs);

    server.on('close', () => clearTimeout(timer));
    server.on('error', reject);
    server.listen(Number(redirect.port || port), redirect.hostname, () => {
      openBrowser(auth.toString());
    });
  });
}

module.exports = {
  DEFAULT_TOKEN_PATH,
  OPENAI_OAUTH_DEFAULTS,
  getDefaultRedirectUri,
  startOAuthLogin,
  loadToken,
  saveToken,
  clearToken,
};
