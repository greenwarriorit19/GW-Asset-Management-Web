import { useEffect, useState, type ReactNode, type ChangeEvent } from 'react';
import type { Attachment } from '../data/types';
import { SearchSelect, type Option } from './SearchSelect';
import { askReason } from './Dialog';
import { DatePicker, type DatePickerProps } from './DatePicker';
import { driveEnabled, uploadToDrive, driveFileName } from '../lib/drive';
export { SearchSelect };

// ---------- Page scaffolding ----------
export function PageHead({ title, crumbs, actions }: { title: string; crumbs?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Section({ title, right, children, compact, className }: { title: string; right?: ReactNode; children: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={`section ${compact ? 'compact' : ''} ${className ?? ''}`}>
      <div className="section-title"><span>{title}</span>{right}</div>
      <div className="section-body">{children}</div>
    </div>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }) {
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h3>{title}</h3><button className="btn sm ghost" onClick={onClose}>Close</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Form fields ----------
type FieldBase = { label: string; required?: boolean; hint?: string; span?: 2 | 3 | 'full'; className?: string };
const spanClass = (s?: FieldBase['span']) => s === 'full' ? 'span-full' : s ? `span-${s}` : '';

export function Input({ label, required, hint, span, className, ...rest }: FieldBase & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`field ${spanClass(span)} ${className ?? ''}`}>
      <label>{label}{required && <span className="req">*</span>}</label>
      <input required={required} {...rest} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function TextArea({ label, required, hint, span, className, ...rest }: FieldBase & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={`field ${spanClass(span)} ${className ?? ''}`}>
      <label>{label}{required && <span className="req">*</span>}</label>
      <textarea required={required} {...rest} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Select({ label, required, hint, span, className, options, placeholder, value, onChange, disabled }: FieldBase & { options: Option[]; placeholder?: string; value: string; onChange: (e: { target: { value: string } }) => void; disabled?: boolean }) {
  return (
    <div className={`field ${spanClass(span)} ${className ?? ''}`}>
      <label>{label}{required && <span className="req">*</span>}</label>
      <SearchSelect value={value} onChange={onChange} options={options} placeholder={placeholder} required={required} disabled={disabled} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/** Calendar date field (replaces <input type="date">). */
export function DateInput({ label, required, hint, span, className, ...rest }: FieldBase & DatePickerProps) {
  return (
    <div className={`field ${spanClass(span)} ${className ?? ''}`}>
      <label>{label}{required && <span className="req">*</span>}</label>
      <DatePicker required={required} {...rest} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/** Password field with a show / hide toggle. */
export function PasswordInput({ label, required, hint, span, className, value, onChange, autoComplete, autoFocus, minLength }: FieldBase & { value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; autoComplete?: string; autoFocus?: boolean; minLength?: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className={`field ${spanClass(span)} ${className ?? ''}`}>
      <label>{label}{required && <span className="req">*</span>}</label>
      <div className="pw">
        <input type={show ? 'text' : 'password'} required={required} value={value} onChange={onChange} autoComplete={autoComplete} autoFocus={autoFocus} minLength={minLength} />
        <button type="button" className="pw-toggle" onClick={() => setShow(s => !s)} tabIndex={-1} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function ReadOnly({ label, value, span, hint }: { label: string; value: ReactNode; span?: FieldBase['span']; hint?: string }) {
  return (
    <div className={`field ${spanClass(span)}`}>
      <label>{label}</label>
      <input readOnly value={typeof value === 'string' || typeof value === 'number' ? value : ''} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/** Reads a file input into an Attachment. Images and small files are kept inline as data URLs. */
/** `tag` (usually the Asset ID) becomes the Drive sub-folder; `kind` (Invoice, Warranty, Photo…) prefixes the file name. */
export function FileInput({ label, onChange, accept, span, hint, required, tag, kind }: { label: string; onChange: (a?: Attachment) => void; accept?: string; span?: FieldBase['span']; hint?: string; required?: boolean; tag?: string; kind?: string }) {
  const [status, setStatus] = useState<{ text: string; kind: 'ok' | 'busy' | 'err' } | null>(null);
  const readInline = (f: File) => new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
  const handle = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) { setStatus(null); onChange(undefined); return; }
    const att: Attachment = { name: f.name, type: f.type, size: f.size };
    const isImage = f.type.startsWith('image/');
    if (driveEnabled()) {
      setStatus({ text: `Uploading ${f.name} to Google Drive…`, kind: 'busy' });
      try {
        const up = await uploadToDrive(f, { subfolder: tag, name: driveFileName(tag, kind ?? label, f.name) });
        att.driveId = up.id; att.url = up.webViewLink; att.name = up.name;
        if (isImage && f.size <= 400_000) att.dataUrl = await readInline(f);   // small preview kept locally
        setStatus({ text: `Saved to Drive${tag ? ` › ${tag}` : ''}: ${up.name}`, kind: 'ok' });
      } catch (err) {
        if (f.size <= 1_500_000) att.dataUrl = await readInline(f);
        setStatus({ text: `${err instanceof Error ? err.message : String(err)} — kept a local copy instead.`, kind: 'err' });
      }
    } else {
      if (f.size <= 1_500_000) att.dataUrl = await readInline(f);
      setStatus({ text: f.name, kind: 'ok' });
    }
    onChange(att);
  };
  return (
    <div className={`field ${spanClass(span)}`}>
      <label>{label}{required && <span className="req">*</span>}</label>
      <input type="file" accept={accept} onChange={handle} required={required} />
      <span className="hint" style={status?.kind === 'err' ? { color: 'var(--danger)' } : undefined}>
        {status?.text || hint || (driveEnabled() ? 'PDF, JPG or PNG — uploaded to the Google Drive "Asset proof" folder.' : 'PDF, JPG or PNG. Files up to 1.5 MB are stored inline.')}
      </span>
    </div>
  );
}

/** Download / open link for an attachment, wherever it is stored. */
export function AttachmentLink({ a }: { a?: Attachment }) {
  if (!a) return null;
  if (a.url) return <a className="btn sm" href={a.url} target="_blank" rel="noopener">Open in Drive</a>;
  if (a.dataUrl) return <a className="btn sm" href={a.dataUrl} download={a.name}>Download</a>;
  return <span className="muted small">Reference only</span>;
}

// ---------- Status ----------
export function Status({ value }: { value: string }) {
  const cls = 's-' + value.toLowerCase().replace(/[^a-z]+/g, '-');
  const alias = /pending|awaiting|open|in progress|reported|under investigation/i.test(value) ? 's-pending' : '';
  return <span className={`status ${cls} ${alias}`}>{value}</span>;
}

// ---------- Data table ----------
export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode; num?: boolean; width?: string }
export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, empty = 'No records.' }: { rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void; empty?: string }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr>{columns.map(c => <th key={c.key} className={c.num ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td className="empty" colSpan={columns.length}>{empty}</td></tr>}
          {rows.map(r => (
            <tr key={r.id} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map(c => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Edit / Delete buttons for master-data rows. `blockers` non-empty → Delete disabled with the reasons as tooltip. */
export function RowActions({ onEdit, onDelete, blockers = [], label }: { onEdit: () => void; onDelete: (reason: string) => void; blockers?: string[]; label: string }) {
  return (
    <div className="btn-row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
      <button type="button" className="btn sm" onClick={onEdit}>Edit</button>
      <button type="button" className="btn sm danger" disabled={blockers.length > 0} title={blockers.length ? `Cannot delete: ${blockers.join('; ')}` : `Delete ${label}`}
        onClick={async () => { const reason = await askReason({ title: `Delete ${label}`, message: 'This cannot be undone. The deletion and its reason are recorded in the audit log.' }); if (reason) onDelete(reason); }}>Delete</button>
    </div>
  );
}

// ---------- Formatting ----------
export const fmtDate = (d?: string) => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (d?: string) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtMoney = (n?: number) => n === undefined || n === null ? '—' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const fmtSize = (n: number) => n > 1_000_000 ? (n / 1_000_000).toFixed(1) + ' MB' : Math.round(n / 1000) + ' KB';

/** Runs a store action, capturing BusinessRuleError messages for display. */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = <T,>(fn: () => T, successMsg?: string): T | undefined => {
    try { setError(null); const r = fn(); if (successMsg) setOk(successMsg); return r; }
    catch (e) { setOk(null); setError(e instanceof Error ? e.message : String(e)); return undefined; }
  };
  // Success notices disappear on their own after 3 seconds; errors stay until the next action.
  useEffect(() => { if (!ok) return; const t = setTimeout(() => setOk(null), 3000); return () => clearTimeout(t); }, [ok]);
  const Messages = () => <>{error && <Alert kind="error">{error}</Alert>}{ok && <div className="toast" role="status">{ok}</div>}</>;
  return { run, error, ok, Messages, clear: () => { setError(null); setOk(null); } };
}
