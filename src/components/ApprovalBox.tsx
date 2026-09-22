import { useState } from 'react';
import { Section, TextArea } from './ui';

/** Reusable approve / reject panel. A comment (reason) is captured with every decision (Rule 11). */
export function ApprovalBox({ title, onDecide, approveLabel = 'Approve', rejectLabel = 'Reject' }: { title: string; onDecide: (approved: boolean, comments: string) => void; approveLabel?: string; rejectLabel?: string }) {
  const [c, setC] = useState('');
  return (
    <Section title={title}>
      <TextArea label="Comments / reason for decision" required value={c} onChange={e => setC(e.target.value)} />
      <div className="btn-row end" style={{ marginTop: 10 }}>
        <button className="btn danger" disabled={c.trim().length < 3} onClick={() => onDecide(false, c)}>{rejectLabel}</button>
        <button className="btn primary" disabled={c.trim().length < 3} onClick={() => onDecide(true, c)}>{approveLabel}</button>
      </div>
    </Section>
  );
}

