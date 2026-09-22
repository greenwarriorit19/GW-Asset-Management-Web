import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/context';
import { PageHead, Section, Status, TextArea, DataTable, fmtDateTime, type Column } from '../components/ui';
import type { Approval } from '../data/types';

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

const LINK: Record<Approval['entityType'], (id: string) => string> = {
  Registration: id => `/assets/${id}`, Handover: id => `/handovers/${id}`, Transfer: () => '/transfers', Repair: () => '/repairs',
  Incident: () => '/incidents', Retirement: () => '/disposals', Disposal: () => '/disposals', Return: () => '/returns',
};

export function ApprovalsQueue() {
  const { db, store } = useStore();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const role = store.currentUser.role;
  const mine = (a: Approval) => role === 'super_admin' || a.approverRole === role;
  const rows = db.approvals.filter(a => tab === 'all' || a.decision === 'Pending Approval').filter(mine).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const columns: Column<Approval>[] = [
    { key: 'requestedAt', header: 'Requested', render: a => fmtDateTime(a.requestedAt) },
    { key: 'entityType', header: 'Type' },
    { key: 'entityId', header: 'Reference', render: a => <Link className="mono" to={LINK[a.entityType](a.entityId)}>{a.entityId}</Link> },
    { key: 'by', header: 'Requested By', render: a => store.userName(a.requestedByUserId) },
    { key: 'role', header: 'Approver', render: a => store.roleName(a.approverRole) },
    { key: 'decision', header: 'Decision', render: a => <Status value={a.decision} /> },
    { key: 'decided', header: 'Decided', render: a => a.decidedByUserId ? `${store.userName(a.decidedByUserId)} · ${fmtDateTime(a.decidedAt)}` : '—' },
    { key: 'comments', header: 'Comments', render: a => a.comments ?? '' },
  ];
  return (
    <>
      <PageHead crumbs="Overview" title="Approvals" />
      <div className="rule-note">Approval matrix: Registration → Finance/Admin Head · Handover, Transfer, Lost/Damaged → Department Head · Repair → Admin/IT Head · Retirement & Disposal → Management. Open the reference to record a decision.</div>
      <div className="tabs"><button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Pending ({db.approvals.filter(a => a.decision === 'Pending Approval' && mine(a)).length})</button><button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All</button></div>
      <Section title="Approval Queue" compact><DataTable rows={rows} columns={columns} empty="Nothing awaiting your approval." /></Section>
    </>
  );
}
