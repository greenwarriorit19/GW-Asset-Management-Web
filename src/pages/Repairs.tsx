import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import { CONDITIONS, type Repair, type Condition, type Attachment } from '../data/types';
import { today } from '../data/store';
import { PageHead, Section, Status, DataTable, Input, Select, TextArea, ReadOnly, FileInput, Modal, useAction, fmtDate, fmtMoney, type Column, DateInput } from '../components/ui';
import { RepairDoc } from '../documents';
import { ApprovalBox } from '../components/ApprovalBox';

export function Repairs() {
  const { db, store } = useStore();
  const [sp, setSp] = useSearchParams();
  const { run, Messages } = useAction();
  const [open, setOpen] = useState<Repair | null>(null);
  const u = store.currentUser;

  const [assetId, setAssetId] = useState(sp.get('asset') ?? '');
  const [fault, setFault] = useState('');
  const [vendor, setVendor] = useState('');
  const [est, setEst] = useState('');
  const [expected, setExpected] = useState('');
  const [quotation, setQuotation] = useState<Attachment>();
  const [reason, setReason] = useState('');
  // Any in-service asset without an open repair job (incidents resolved as "Repair" arrive here already Under Repair).
  const openRepairAssets = new Set(db.repairs.filter(r => r.status !== 'Completed').map(r => r.assetId));
  const candidates = db.assets.filter(a => !['Lost', 'Retired', 'Disposed'].includes(a.status) && !openRepairAssets.has(a.id));

  const [actual, setActual] = useState('');
  const [completion, setCompletion] = useState(today());
  const [work, setWork] = useState('');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<Repair['outcome']>('Available');
  const [condAfter, setCondAfter] = useState<Condition>('Good');
  const [report, setReport] = useState<Attachment>();
  const [cReason, setCReason] = useState('');

  const rows = db.repairs.filter(r => store.can('asset.view_all') || (store.can('asset.view_department') && store.asset(r.assetId)?.departmentId === u.departmentId) || r.custodianBeforeRepair === u.employeeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns: Column<Repair>[] = [
    { key: 'id', header: 'Reference', render: r => <span className="mono">{r.id}</span> },
    { key: 'date', header: 'Reported', render: r => fmtDate(r.reportedDate) },
    { key: 'asset', header: 'Asset', render: r => <><span className="mono">{r.assetId}</span> {store.asset(r.assetId)?.name}</> },
    { key: 'fault', header: 'Fault', render: r => r.faultDescription },
    { key: 'vendor', header: 'Vendor', render: r => r.vendor },
    { key: 'est', header: 'Est. Cost', num: true, render: r => fmtMoney(r.estimatedCost) },
    { key: 'act', header: 'Actual', num: true, render: r => r.actualCost !== undefined ? fmtMoney(r.actualCost) : '—' },
    { key: 'approval', header: 'Approval', render: r => <Status value={r.approval} /> },
    { key: 'status', header: 'Status', render: r => <Status value={r.status} /> },
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = run(() => store.openRepair({ assetId, faultDescription: fault, vendor, estimatedCost: Number(est) || 0, expectedReturnDate: expected || undefined, quotation, reason }), 'Repair job opened. Asset status: Under Repair.');
    if (r) { setAssetId(''); setFault(''); setVendor(''); setEst(''); setExpected(''); setReason(''); setSp({}); setOpen(r); }
  };
  const current = open ? db.repairs.find(r => r.id === open.id) ?? open : null;

  return (
    <>
      <PageHead crumbs="Lifecycle" title="Repair and Maintenance" />
      <Messages />
      {store.can('repair.create') && (
        <form onSubmit={submit}>
          <Section title="Send Asset for Repair">
            <div className="form-grid cols-4">
              <Select label="Asset" required span={2} value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="Select asset…" options={candidates.map(a => ({ value: a.id, label: `${a.id} — ${a.name} · ${a.status}` }))} />
              <ReadOnly label="Repair Reference" value={store.nextRef('RP', db.repairs)} />
              <ReadOnly label="Current Custodian" value={assetId ? store.employeeName(store.asset(assetId)?.custodianEmployeeId) : ''} />
              <TextArea label="Fault Description" required span={2} value={fault} onChange={e => setFault(e.target.value)} />
              <Input label="Vendor / Service Centre" required value={vendor} onChange={e => setVendor(e.target.value)} />
              <Input label="Estimated Cost (₹)" type="number" min={0} required value={est} onChange={e => setEst(e.target.value)} />
              <DateInput label="Expected Return Date" value={expected} onChange={e => setExpected(e.target.value)} />
              <FileInput label="Quotation" accept=".pdf,image/*" tag={assetId || undefined} kind="Repair-Quotation" onChange={setQuotation} />
              <Input label="Reason" required span={2} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" type="submit" disabled={!assetId}>Open Repair Job</button></div>
          </Section>
        </form>
      )}
      <Section title="Repair Register" compact><DataTable rows={rows} columns={columns} onRowClick={r => setOpen(r)} /></Section>

      {current && (
        <Modal title={`Repair ${current.id}`} onClose={() => setOpen(null)} wide>
          {current.approval === 'Pending Approval' && store.can('repair.approve') && <ApprovalBox title="Admin / IT Head Approval of Repair" onDecide={(ok, c) => run(() => store.approveRepair(current.id, ok, c), ok ? 'Repair approved.' : 'Repair rejected.')} />}
          {current.status !== 'Completed' && store.can('repair.complete') && (
            <Section title="Record Completion & Post-repair Inspection">
              <div className="form-grid">
                <Input label="Actual Cost (₹)" type="number" min={0} required value={actual} onChange={e => setActual(e.target.value)} />
                <DateInput label="Completion Date" required value={completion} onChange={e => setCompletion(e.target.value)} />
                <Select label="Condition after Repair" value={condAfter} onChange={e => setCondAfter(e.target.value as Condition)} options={CONDITIONS.map(c => ({ value: c, label: c }))} />
                <TextArea label="Work Done" required span={2} value={work} onChange={e => setWork(e.target.value)} />
                <Select label="Outcome Status" value={outcome ?? ''} onChange={e => setOutcome(e.target.value as Repair['outcome'])} options={[{ value: 'Available', label: 'Available (return to pool)' }, { value: 'Assigned', label: `Assigned (back to ${store.employeeName(current.custodianBeforeRepair)})` }, { value: 'Retired', label: 'Retired (not economical)' }]} />
                <TextArea label="Inspection Notes" required span={2} value={notes} onChange={e => setNotes(e.target.value)} />
                <FileInput label="Service Report" accept=".pdf,image/*" tag={current.assetId} kind={`Service-Report-${current.id}`} onChange={setReport} />
                <Input label="Reason" required span="full" value={cReason} onChange={e => setCReason(e.target.value)} />
              </div>
              <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => run(() => store.completeRepair(current.id, { actualCost: Number(actual) || 0, completionDate: completion, workDone: work, inspectionNotes: notes, outcome, conditionAfter: condAfter, serviceReport: report, reason: cReason }), 'Repair completed.')}>Complete Repair</button></div>
            </Section>
          )}
          <RepairDoc repair={current} />
        </Modal>
      )}
    </>
  );
}
