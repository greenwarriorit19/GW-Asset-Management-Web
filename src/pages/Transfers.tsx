import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import { CONDITIONS, type Transfer, type Condition } from '../data/types';
import { PageHead, Section, Status, DataTable, Input, Select, TextArea, ReadOnly, Modal, useAction, fmtDate, type Column } from '../components/ui';
import { TransferDoc } from '../documents';
import { ApprovalBox } from '../components/ApprovalBox';

export function Transfers() {
  const { db, store } = useStore();
  const [sp, setSp] = useSearchParams();
  const { run, Messages } = useAction();
  const [open, setOpen] = useState<Transfer | null>(null);
  const [completeReason, setCompleteReason] = useState('');
  const u = store.currentUser;

  const [assetId, setAssetId] = useState(sp.get('asset') ?? '');
  const [toEmp, setToEmp] = useState('');
  const pre = store.asset(sp.get('asset') ?? '');
  const [toDept, setToDept] = useState(pre?.departmentId ?? '');
  const [toLoc, setToLoc] = useState(pre?.locationId ?? '');
  const [cond, setCond] = useState<Condition>(pre?.condition ?? 'Good');
  const [reason, setReason] = useState('');
  const asset = store.asset(assetId);
  const candidates = db.assets.filter(a => ['Assigned', 'Available'].includes(a.status));

  const rows = db.transfers.filter(t => store.can('asset.view_all') || t.fromEmployeeId === u.employeeId || t.toEmployeeId === u.employeeId || (store.can('asset.view_department') && [t.fromDepartmentId, t.toDepartmentId].includes(u.departmentId ?? ''))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns: Column<Transfer>[] = [
    { key: 'id', header: 'Reference', render: t => <span className="mono">{t.id}</span> },
    { key: 'date', header: 'Date', render: t => fmtDate(t.date) },
    { key: 'asset', header: 'Asset', render: t => <><span className="mono">{t.assetId}</span> {store.asset(t.assetId)?.name}</> },
    { key: 'from', header: 'From', render: t => <>{store.employeeName(t.fromEmployeeId)}<div className="muted small">{store.deptName(t.fromDepartmentId)} · {store.locName(t.fromLocationId)}</div></> },
    { key: 'to', header: 'To', render: t => <>{t.toEmployeeId ? store.employeeName(t.toEmployeeId) : 'Department pool'}<div className="muted small">{store.deptName(t.toDepartmentId)} · {store.locName(t.toLocationId)}</div></> },
    { key: 'approval', header: 'Approval', render: t => <Status value={t.approval} /> },
    { key: 'status', header: 'Status', render: t => <Status value={t.status} /> },
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = run(() => store.requestTransfer({ assetId, toEmployeeId: toEmp || undefined, toDepartmentId: toDept, toLocationId: toLoc, reason, conditionAtTransfer: cond }), 'Transfer request submitted for Department Head approval.');
    if (t) { setAssetId(''); setToEmp(''); setReason(''); setSp({}); setOpen(t); }
  };
  const current = open ? db.transfers.find(t => t.id === open.id) ?? open : null;

  return (
    <>
      <PageHead crumbs="Custody" title="Asset Transfer" />
      <Messages />
      {store.can('transfer.request') && (
        <form onSubmit={submit}>
          <Section title="Request Transfer">
            <div className="rule-note">Transfer flow: request → Department Head approval → Asset Administrator completes (releases current custodian, records condition) → new custodian signs a fresh assignment. Both custodians remain in the transaction history.</div>
            <div className="form-grid cols-4">
              <Select label="Asset" required span={2} value={assetId} onChange={e => { setAssetId(e.target.value); const a = store.asset(e.target.value); if (a) { setCond(a.condition); setToDept(a.departmentId); setToLoc(a.locationId); } }} placeholder="Select asset…" options={candidates.map(a => ({ value: a.id, label: `${a.id} — ${a.name} · ${a.status}${a.custodianEmployeeId ? ' · ' + store.employeeName(a.custodianEmployeeId) : ''}` }))} />
              <ReadOnly label="Current Custodian" value={asset ? store.employeeName(asset.custodianEmployeeId) : ''} />
              <ReadOnly label="Current Department / Location" value={asset ? `${store.deptName(asset.departmentId)} · ${store.locName(asset.locationId)}` : ''} />
              <Select label="New Custodian" span={2} value={toEmp} onChange={e => { setToEmp(e.target.value); const em = store.employee(e.target.value); if (em) { setToDept(em.departmentId); setToLoc(em.workLocationId); } }} placeholder="None — return to department pool" options={db.employees.filter(e => e.active && e.id !== asset?.custodianEmployeeId).map(e => ({ value: e.id, label: `${e.name} — ${e.employeeCode} (${store.deptName(e.departmentId)})` }))} />
              <Select label="New Department" required value={toDept} onChange={e => setToDept(e.target.value)} placeholder="Select…" options={db.departments.map(d => ({ value: d.id, label: d.name }))} />
              <Select label="New Location" required value={toLoc} onChange={e => setToLoc(e.target.value)} placeholder="Select…" options={db.locations.map(l => ({ value: l.id, label: l.name }))} />
              <Select label="Condition at Transfer" required value={cond} onChange={e => setCond(e.target.value as Condition)} options={CONDITIONS.map(c => ({ value: c, label: c }))} />
              <TextArea label="Reason for Transfer" required span={3} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" type="submit" disabled={!assetId || !toDept || !toLoc}>Submit Transfer Request</button></div>
          </Section>
        </form>
      )}
      <Section title="Transfer Register" compact><DataTable rows={rows} columns={columns} onRowClick={t => setOpen(t)} /></Section>

      {current && (
        <Modal title={`Transfer ${current.id}`} onClose={() => setOpen(null)} wide>
          {current.status === 'Awaiting Approval' && store.can('transfer.approve') && <ApprovalBox title="Department Head Approval" onDecide={(ok, c) => run(() => store.approveTransfer(current.id, ok, c), ok ? 'Transfer approved.' : 'Transfer rejected.')} />}
          {current.status === 'Approved' && store.can('transfer.complete') && (
            <Section title="Complete Transfer">
              <p className="small">Completing releases {store.employeeName(current.fromEmployeeId)} from custody{current.toEmployeeId ? ` and generates a fresh assignment for ${store.employeeName(current.toEmployeeId)} to acknowledge` : ' and returns the asset to the department pool as Available'}.</p>
              <Input label="Completion remarks / reason" required value={completeReason} onChange={e => setCompleteReason(e.target.value)} />
              <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" disabled={completeReason.trim().length < 3} onClick={() => { const ho = run(() => store.completeTransfer(current.id, completeReason), 'Transfer completed.'); if (ho) setCompleteReason(''); }}>Complete Transfer</button></div>
            </Section>
          )}
          {current.newHandoverId && <div className="alert">New assignment <Link to={`/handovers/${current.newHandoverId}`}>{current.newHandoverId}</Link> generated for the receiving custodian.</div>}
          <TransferDoc transfer={current} />
        </Modal>
      )}
    </>
  );
}
