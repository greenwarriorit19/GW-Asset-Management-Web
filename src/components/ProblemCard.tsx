import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../data/context';

/** The label a field is known by on screen, for naming it in the card. */
function labelOf(el: Element): string {
  const field = el.closest('.field');
  const text = field?.querySelector('label')?.textContent
    ?? (el as HTMLInputElement).placeholder
    ?? el.getAttribute('aria-label') ?? '';
  return text.replace(/\*$/, '').trim();
}

/**
 * One card for anything that needs attention: a refused action, or fields left incomplete.
 * Incomplete fields are caught from the browser's own validation, so every form is covered
 * without each page having to ask.
 */
export function ProblemCard() {
  const { store, session } = useStore();
  const problem = session.problem;

  useEffect(() => {
    let pending: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInvalid = (e: Event) => {
      e.preventDefault();                                   // our card replaces the browser's bubble
      const el = e.target as HTMLElement;
      const name = labelOf(el);
      if (name && !pending.includes(name)) pending.push(name);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const fields = pending; pending = [];
        store.problem(fields.length === 1 ? 'This field needs attention before saving:' : 'These fields need attention before saving:', fields);
        (document.querySelector(':invalid:not(form)') as HTMLElement | null)?.focus();
      }, 0);
    };
    document.addEventListener('invalid', onInvalid, true);
    return () => { document.removeEventListener('invalid', onInvalid, true); clearTimeout(timer); };
  }, [store]);

  useEffect(() => {
    if (!problem) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') store.clearProblem(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [problem, store]);

  if (!problem) return null;
  return createPortal(
    <div className="problem-card" role="alertdialog" aria-modal="false" key={problem.at}>
      <div className="pc-head"><span className="pc-icon" aria-hidden>!</span><b>Needs attention</b>
        <button type="button" className="pc-close" aria-label="Dismiss" onClick={() => store.clearProblem()}>×</button></div>
      <p className="pc-msg">{problem.message}</p>
      {problem.fields && problem.fields.length > 0 && <ul className="pc-fields">{problem.fields.map(f => <li key={f}>{f}</li>)}</ul>}
      <div className="btn-row end"><button type="button" className="btn sm primary" onClick={() => store.clearProblem()}>Got it</button></div>
    </div>, document.body);
}
