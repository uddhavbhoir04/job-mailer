/**
 * One-time helper: authorizes this app to send email as you through the Gmail API
 * and prints a GMAIL_OAUTH_REFRESH_TOKEN to put in your host's environment variables.
 *
 * Run on your own computer:
 *   1. Put GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in backend/.env
 *      (OAuth client of type "Desktop app", see README "Gmail API setup")
 *   2. npm run gmail:auth
 *   3. Sign in with the Gmail account you send from and click Allow
 *
 * Only the gmail.send scope is requested: the app can send mail, not read your inbox.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';

const clientId = (process.env.GMAIL_OAUTH_CLIENT_ID || '').trim();
const clientSecret = (process.env.GMAIL_OAUTH_CLIENT_SECRET || '').trim();
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

if (!clientId || !clientSecret) {
  console.error('\nSet GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in backend/.env first (see README "Gmail API setup").\n');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end();
    return;
  }
  const finish = (status, msg) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<body style="font-family:sans-serif;padding:40px"><h2>${msg}</h2><p>You can close this tab and return to the terminal.</p></body>`);
  };
  if (url.searchParams.get('state') !== state) return finish(400, 'State mismatch – please run the script again.');
  if (url.searchParams.get('error')) {
    finish(400, `Authorization denied: ${url.searchParams.get('error')}`);
    console.error(`\nAuthorization denied: ${url.searchParams.get('error')}\n`);
    return server.close();
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code'),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const data = await tokenRes.json();
  if (!tokenRes.ok || !data.refresh_token) {
    finish(500, 'Could not get a refresh token – see terminal.');
    console.error('\nToken exchange failed:', data, '\n');
    return server.close();
  }
  finish(200, '✅ Gmail authorized');
  console.log('\n✅ Success! Add this to backend/.env and to Render → Environment:\n');
  console.log(`GMAIL_OAUTH_REFRESH_TOKEN=${data.refresh_token}\n`);
  console.log('Keep it secret: it allows sending email as you. Revoke anytime at https://myaccount.google.com/permissions\n');
  server.close();
});

let redirectUri;
server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline', // gives a refresh token
      prompt: 'consent', // always return a refresh token, even on re-auth
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
  console.log('\nOpening Google sign-in in your browser. If it does not open, visit:\n');
  console.log(authUrl, '\n');
  try {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    spawn(opener, [authUrl], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    /* user can copy the URL */
  }
});
