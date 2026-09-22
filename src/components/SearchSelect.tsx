import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

export interface Option { value: string; label: string }
export interface SearchSelectProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;   // same shape call sites already use (e.target.value)
  options: Option[];
  placeholder?: string;      // shown when nothing is selected; when set, the selection can also be cleared
  disabled?: boolean;
  required?: boolean;
  style?: CSSProperties;
  className?: string;
  title?: string;
}

/** Searchable dropdown: type to filter, arrow keys to move, Enter to pick, Esc to close. */
export function SearchSelect({ value, onChange, options, placeholder, disabled, required, style, className, title }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const words = q.split(/\s+/);
    return options.filter(o => { const l = o.label.toLowerCase() + ' ' + o.value.toLowerCase(); return words.every(w => l.includes(w)); });
  }, [options, query]);

  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {
    const el = list.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (v: string) => { onChange({ target: { value: v } }); close(); };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) { setOpen(true); e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { setActive(a => Math.min(filtered.length - 1, a + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setActive(a => Math.max(0, a - 1)); e.preventDefault(); }
    else if (e.key === 'Enter') { if (filtered[active]) pick(filtered[active].value); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === 'Tab') { close(); }
  };

  return (
    <div ref={wrap} className={`ss ${open ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className ?? ''}`} style={style} title={title}>
      <input
        role="combobox" aria-expanded={open} aria-controls={id} aria-autocomplete="list"
        className="ss-input"
        value={open ? query : (selected?.label ?? '')}
        placeholder={selected && !open ? undefined : (placeholder ?? 'Search…')}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {value && placeholder !== undefined && !disabled && <button type="button" className="ss-clear" aria-label="Clear" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => pick('')}>×</button>}
      <span className="ss-caret" aria-hidden>▾</span>
      {/* Participates in native form validation without being visible. */}
      {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => undefined} className="ss-hidden" onInvalid={e => { e.preventDefault(); wrap.current?.querySelector<HTMLInputElement>('.ss-input')?.focus(); setOpen(true); wrap.current?.classList.add('invalid'); }} />}
      {open && !disabled && (
        <ul ref={list} id={id} role="listbox" className="ss-list">
          {filtered.length === 0 && <li className="ss-empty">No matches</li>}
          {filtered.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}
              className={`ss-opt ${i === active ? 'active' : ''} ${o.value === value ? 'selected' : ''}`}
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)}>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
