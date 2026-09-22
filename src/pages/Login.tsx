import { useState, type FormEvent } from 'react';
import { useStore } from '../data/context';
import { Input } from '../components/ui';
import { COMPANY } from '../components/A4Document';
import { Loader } from '../components/Loader';

/** Sign-in screen for the shared (Supabase) database. */
export function Login() {
  const { store, session } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setInfo(null);
    try { await store.login(email.trim(), password); } catch { /* shown via session.error */ } finally { setBusy(false); }
  };
  const forgot = async () => {
    if (!email.trim()) { setInfo('Enter your email first, then click "Forgot password".'); return; }
    try { await store.resetPassword(email.trim()); setInfo(`A password-reset link has been sent to ${email.trim()}.`); }
    catch (err) { setInfo(err instanceof Error ? err.message : String(err)); }
  };
  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div className="login-brand">{COMPANY}<small>Asset Management System</small></div>
        <h2>Sign in</h2>
        {session.error && <div className="alert error">{session.error}</div>}
        {info && <div className="alert">{info}</div>}
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <Input label="Email" type="email" required autoFocus autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
          <Input label="Password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="btn-row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button type="button" className="btn ghost" onClick={forgot} disabled={busy}>Forgot password</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? <Loader inline /> : 'Sign in'}</button>
        </div>
        <p className="muted small" style={{ marginTop: 16 }}>Access is granted by the Super Admin under Users &amp; Permissions. Contact IT if you cannot sign in.</p>
      </form>
    </div>
  );
}
