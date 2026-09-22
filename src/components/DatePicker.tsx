import { useEffect, useMemo, useRef, useState } from 'react';

// Calendar date picker. Value in/out is always 'YYYY-MM-DD' (or '' when empty), so it is a drop-in
// replacement for <input type="date"> and calls onChange with { target: { value } } like the rest of the forms.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (v: string) => { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : undefined; };
export const fmtPretty = (v: string) => { const p = parse(v); return p ? `${pad(p.d)} ${MONTHS[p.m].slice(0, 3)} ${p.y}` : ''; };

export interface DatePickerProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  min?: string; max?: string;
}

export function DatePicker({ value, onChange, required, disabled, placeholder = 'Select date', min, max }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const sel = parse(value);
  const [view, setView] = useState({ y: sel?.y ?? today.getFullYear(), m: sel?.m ?? today.getMonth() });
  const wrap = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => { if (open) setView({ y: sel?.y ?? today.getFullYear(), m: sel?.m ?? today.getMonth() }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !(t instanceof HTMLOptionElement)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // 6 × 7 grid starting on the Sunday on/before the 1st, with leading/trailing days of adjacent months greyed.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const start = new Date(view.y, view.m, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view]);

  const pick = (d: Date) => { onChange({ target: { value: toIso(d.getFullYear(), d.getMonth(), d.getDate()) } }); setOpen(false); };
  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  const shift = (n: number) => { const d = new Date(view.y, view.m + n, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); };
  const years = useMemo(() => { const y0 = today.getFullYear(); return Array.from({ length: 41 }, (_, i) => y0 - 30 + i); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing a date directly (dd/mm/yyyy or yyyy-mm-dd) is also accepted.
  const commitTyped = () => {
    const t = typed.trim(); if (!t) { setTyped(''); return; }
    let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); let iso = m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : '';
    if (!iso) { m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) iso = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`; }
    if (iso && parse(iso) && !isNaN(new Date(iso).getTime())) onChange({ target: { value: iso } });
    setTyped('');
  };

  return (
    <div ref={wrap} className={`dp ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}>
      <input className="dp-input" value={open && typed !== '' ? typed : fmtPretty(value)} placeholder={placeholder} disabled={disabled}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={e => { setTyped(e.target.value); if (!open) setOpen(true); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTyped(); setOpen(false); } }}
        onBlur={() => { if (typed) commitTyped(); }} autoComplete="off" />
      <span className="dp-icon" aria-hidden>▦</span>
      {value && !disabled && <button type="button" className="dp-clear" tabIndex={-1} aria-label="Clear" onMouseDown={e => e.preventDefault()} onClick={() => onChange({ target: { value: '' } })}>×</button>}
      {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => undefined} className="ss-hidden" onInvalid={e => { e.preventDefault(); setOpen(true); wrap.current?.classList.add('invalid'); }} />}
      {open && !disabled && (
        // preventDefault keeps the input focused while clicking days, but must NOT block the month / year selects
        <div className="dp-pop" onMouseDown={e => { if (!(e.target as HTMLElement).closest('select')) e.preventDefault(); }}>
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
            <select value={view.m} onChange={e => setView({ ...view, m: +e.target.value })}>{MONTHS.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
            <select value={view.y} onChange={e => setView({ ...view, y: +e.target.value })}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
            <button type="button" className="dp-nav" onClick={() => shift(1)} aria-label="Next month">›</button>
          </div>
          <div className="dp-grid">
            {DOW.map(d => <div key={d} className="dp-dow">{d}</div>)}
            {cells.map(d => {
              const iso = toIso(d.getFullYear(), d.getMonth(), d.getDate());
              const other = d.getMonth() !== view.m;
              const isToday = d.toDateString() === today.toDateString();
              const cls = ['dp-day', other ? 'other' : '', iso === value ? 'selected' : '', isToday ? 'today' : '', inRange(iso) ? '' : 'off'].join(' ');
              return <button type="button" key={iso} className={cls} disabled={!inRange(iso)} onClick={() => pick(d)}>{pad(d.getDate())}</button>;
            })}
          </div>
          <div className="dp-foot">
            <button type="button" className="btn sm ghost" onClick={() => pick(today)}>Today</button>
            <button type="button" className="btn sm ghost" onClick={() => { onChange({ target: { value: '' } }); setOpen(false); }}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
