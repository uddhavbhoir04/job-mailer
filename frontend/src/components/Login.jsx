/** Password screen shown when the backend requires APP_PASSWORD. */
import { useState } from 'react';
import { api, auth, API_BASE } from '../api.js';

export default function Login({ onSuccess }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setError('');
    try {
      if (await api.checkPassword(pw)) {
        auth.set(pw);
        onSuccess();
      } else {
        setError('Wrong password');
      }
    } catch {
      setError(`Cannot reach the backend${API_BASE ? ` at ${API_BASE}` : ''}. If it's on a free plan it may take ~1 minute to wake up.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-lg font-bold">✉️ Job Application Mailer</h1>
          <p className="text-sm text-slate-500">Enter the dashboard password (APP_PASSWORD on the backend).</p>
        </div>
        <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !pw}>{busy ? 'Checking…' : 'Log in'}</button>
      </form>
    </div>
  );
}
