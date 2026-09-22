import { useState, type FormEvent } from 'react';
import { useStore } from '../data/context';
import { COMPANY } from '../components/A4Document';

/** Sign-in screen for the shared (Supabase) database. */
export function Login() {
  const { store, session } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await store.login(email.trim(), password); } catch { /* shown via session.error */ } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="signin" onSubmit={submit}>
        <div className="signin-brand">{COMPANY}<small>Asset Management System</small></div>
        <p className="signin-heading">Login</p>

        {session.error && <div className="signin-msg error">{session.error}</div>}

        <label className="signin-field">
          <svg className="input-icon" xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 16 16" aria-hidden>
            <path d="M13.106 7.222c0-2.967-2.249-5.032-5.482-5.032-3.35 0-5.646 2.318-5.646 5.702 0 3.493 2.235 5.708 5.762 5.708.862 0 1.689-.123 2.304-.335v-.862c-.43.199-1.354.328-2.29.328-2.926 0-4.813-1.88-4.813-4.798 0-2.844 1.921-4.881 4.594-4.881 2.735 0 4.608 1.688 4.608 4.156 0 1.682-.554 2.769-1.416 2.769-.492 0-.772-.28-.772-.76V5.206H8.923v.834h-.11c-.266-.595-.881-.964-1.6-.964-1.4 0-2.378 1.162-2.378 2.823 0 1.737.957 2.906 2.379 2.906.8 0 1.415-.39 1.709-1.087h.11c.081.67.703 1.148 1.503 1.148 1.572 0 2.57-1.415 2.57-3.643zm-7.177.704c0-1.197.54-1.907 1.456-1.907.93 0 1.524.738 1.524 1.907S8.308 9.84 7.371 9.84c-.895 0-1.442-.725-1.442-1.914z" />
          </svg>
          <input className="input-field" type="email" required autoFocus autoComplete="username" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        </label>

        <label className="signin-field">
          <svg className="input-icon" xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 16 16" aria-hidden>
            <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
          </svg>
          <input className="input-field" type={show ? 'text' : 'password'} required autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" className="signin-eye" tabIndex={-1} onClick={() => setShow(s => !s)} title={show ? 'Hide password' : 'Show password'} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </label>

        <div className="signin-actions">
          <button className="signin-btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
        </div>

      </form>
    </div>
  );
}
