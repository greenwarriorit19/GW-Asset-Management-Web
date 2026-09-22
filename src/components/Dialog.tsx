import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// In-app replacement for window.prompt / window.confirm.
//   const reason = await askReason({ title: 'Delete location', message: 'Delete "PM Zone Depot"?' });   // string | null
//   const ok = await askConfirm({ title: 'Reset database', message: '…', danger: true });                // boolean

export interface DialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  reason?: { label?: string; placeholder?: string; minLength?: number } | false;   // ask for a reason (default: yes for askReason)
}

type Pending = { opts: DialogOptions; resolve: (v: string | null) => void } | null;
let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

function open(opts: DialogOptions): Promise<string | null> {
  return new Promise(resolve => { pending = { opts, resolve }; notify(); });
}
function settle(v: string | null) { const p = pending; pending = null; notify(); p?.resolve(v); }

/** Asks for a mandatory reason; resolves to the text, or null when cancelled. */
export const askReason = (opts: DialogOptions) => open({ confirmLabel: 'Delete', danger: true, ...opts, reason: opts.reason === false ? false : { minLength: 3, ...(opts.reason || {}) } });
/** Yes / no confirmation; resolves to true when confirmed. */
export const askConfirm = async (opts: DialogOptions) => (await open({ confirmLabel: 'Confirm', ...opts, reason: false })) !== null;

export function DialogHost() {
  const p = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => pending, () => pending);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { setText(''); if (p) setTimeout(() => (p.opts.reason ? input.current : btn.current)?.focus(), 0); }, [p]);
  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') settle(null); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [p]);
  if (!p) return null;
  const { opts } = p;
  const min = opts.reason ? (opts.reason.minLength ?? 3) : 0;
  const valid = !opts.reason || text.trim().length >= min;
  const confirm = () => { if (valid) settle(opts.reason ? text.trim() : ''); };
  return (
    <div className="modal-backdrop" style={{ zIndex: 200, alignItems: 'center' }} onMouseDown={e => { if (e.target === e.currentTarget) settle(null); }}>
      <form className="modal" style={{ maxWidth: 460 }} role="alertdialog" aria-modal="true" onSubmit={e => { e.preventDefault(); confirm(); }}>
        <div className="modal-head"><h3>{opts.title}</h3></div>
        <div className="modal-body">
          {opts.message && <p style={{ marginBottom: opts.reason ? 12 : 0 }}>{opts.message}</p>}
          {opts.reason && (
            <div className="field">
              <label>{opts.reason.label ?? 'Reason'}<span className="req">*</span></label>
              <input ref={input} value={text} onChange={e => setText(e.target.value)} placeholder={opts.reason.placeholder ?? 'Why is this being done? (recorded in the audit log)'} />
              {!valid && text.length > 0 && <span className="hint" style={{ color: 'var(--danger)' }}>At least {min} characters.</span>}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={() => settle(null)}>{opts.cancelLabel ?? 'Cancel'}</button>
          <button ref={btn} type="submit" className={`btn ${opts.danger ? 'danger' : 'primary'}`} disabled={!valid}>{opts.confirmLabel ?? 'OK'}</button>
        </div>
      </form>
    </div>
  );
}
