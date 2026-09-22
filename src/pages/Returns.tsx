import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import { CONDITIONS, type AssetReturn, type Condition } from '../data/types';
import { PageHead, Section, Status, DataTable, Input, Select, TextArea, ReadOnly, Modal, useAction, fmtDate, type Column } from '../components/ui';
import { ReturnDoc } from '../documents';

export function Returns() {
  const { db, store } = useStore();
  const [sp, setSp] = useSearchParams();
  const { run, Messages } = useAction();
  const [open, setOpen] = useState<AssetReturn | null>(null);
  const u = store.currentUser;

  // New return form state
  const [assetId, setAssetId] = useState(sp.get('asset') ?? '');
  const [cond, setCond] = useState<Condition>('Good');
  const [acc, setAcc] = useState(() => store.asset(sp.get('asset') ?? '')?.accessories ?? '');
  const [remarks, setRemarks] = useState('');
  const [sig, setSig] = useState('');
  const [reason, setReason] = useState('');
  const asset = store.asset(assetId);
  const emp = store.employee(asset?.custodianEmployeeId);
  const assignable = db.assets.filter(a => a.status === 'Assigned' && (store.can('return.create') || a.custodianEmployeeId === u.employeeId));

  // Inspection state
  const [iCond, setICond] = useState<Condition>('Good');
  const [iOut, setIOut] = useState<AssetReturn['inspectionOutcome']>('Acceptable');
  const [iNotes, setINotes] = useState('');
  const [iReason, setIReason] = useState('');

  const rows = db.returns.filter(r => store.can('asset.view_all') || r.employeeId === u.employeeId || (store.can('asset.view_department') && store.employee(r.employeeId)?.departmentId === u.departmentId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns: Column<AssetReturn>[] = [
    { key: 'id', header: 'Reference', render: r => <span className="mono">{r.id}</span> },
    { key: 'date', header: 'Date', render: r => fmtDate(r.date) },
    { key: 'asset', header: 'Asset', render: r => <><span className="mono">{r.assetId}</span> {store.asset(r.assetId)?.name}</> },
    { key: 'emp', header: 'Returned By', render: r => store.employeeName(r.employeeId) },
    { key: 'cond', header: 'Condition Reported', render: r => r.conditionReported },
    { key: 'insp', header: 'Inspection', render: r => r.inspected ? `${r.inspectionOutcome} → ${r.inspectionCondition}` : <Status value="Pending Inspection" /> },
    { key: 'status', header: 'Status', render: r => <Status value={r.status} /> },
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = run(() => store.createReturn({ assetId, conditionReported: cond, accessoriesReturned: acc, employeeRemarks: remarks, employeeSignature: sig, reason }), 'Return recorded. Asset is Under Inspection until inspected.');
    if (r) { setAssetId(''); setAcc(''); setRemarks(''); setSig(''); setReason(''); setSp({}); setOpen(r); }
  };

  return (
    <>
      <PageHead crumbs="Custody" title="Asset Return" />
      <Messages />
      {store.can('return.create') ? (
        <form onSubmit={submit}>
          <Section title="Record Asset Return">
            <div className="rule-note">Rule 8: a returned asset moves to <b>Under Inspection</b>. It becomes Available only after inspection; faulty items go to Under Repair, damaged items open an incident report automatically.</div>
            <div className="form-grid cols-4">
              <Select label="Asset (scan QR or select)" required span={2} value={assetId} onChange={e => { setAssetId(e.target.value); setAcc(store.asset(e.target.value)?.accessories ?? ''); }} placeholder="Select assigned asset…" options={assignable.map(a => ({ value: a.id, label: `${a.id} — ${a.name} · ${store.employeeName(a.custodianEmployeeId)}` }))} />
              <ReadOnly label="Returning Employee" value={emp ? `${emp.name} (${emp.employeeCode})` : ''} />
              <ReadOnly label="Return Reference" value={store.nextRef('RT', db.returns)} />
              <Select label="Condition Reported" required value={cond} onChange={e => setCond(e.target.value as Condition)} options={CONDITIONS.map(c => ({ value: c, label: c }))} />
              <Input label="Accessories Returned" span={2} value={acc} onChange={e => setAcc(e.target.value)} hint={asset?.accessories ? `Issued with: ${asset.accessories}` : undefined} />
              <Input label="Employee Signature (typed name)" required value={sig} onChange={e => setSig(e.target.value)} />
              <TextArea label="Employee Remarks" span={2} value={remarks} onChange={e => setRemarks(e.target.value)} />
              <TextArea label="Reason for Return" required span={2} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" type="submit" disabled={!assetId}>Record Return</button></div>
          </Section>
        </form>
      ) : store.can('return.request') && (
        <Section title="Request a Return"><p>To return an asset, hand it to the Asset Administrator, who will record the return and inspect it. Your assigned assets: {assignable.map(a => a.id).join(', ') || 'none'}.</p></Section>
      )}

      <Section title="Return Register" compact><DataTable rows={rows} columns={columns} onRowClick={r => setOpen(r)} /></Section>

      {open && (
        <Modal title={`Return ${open.id}`} onClose={() => setOpen(null)} wide>
          {!open.inspected && store.can('return.inspect') && (
            <Section title="Inspection (required before the asset can become Available)">
              <div className="form-grid">
                <Select label="Condition on Inspection" required value={iCond} onChange={e => setICond(e.target.value as Condition)} options={CONDITIONS.map(c => ({ value: c, label: c }))} />
                <Select label="Outcome" required value={iOut ?? ''} onChange={e => setIOut(e.target.value as AssetReturn['inspectionOutcome'])} options={[{ value: 'Acceptable', label: 'Acceptable → Available' }, { value: 'Faulty', label: 'Faulty → Under Repair' }, { value: 'Damaged', label: 'Damaged → incident report' }]} />
                <Input label="Reason" required value={iReason} onChange={e => setIReason(e.target.value)} />
                <TextArea label="Inspection Notes" span="full" required value={iNotes} onChange={e => setINotes(e.target.value)} />
              </div>
              <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => { const ok = run(() => store.inspectReturn(open.id, { inspectionCondition: iCond, inspectionOutcome: iOut, inspectionNotes: iNotes, reason: iReason }), 'Inspection recorded.'); if (ok !== undefined) setOpen(db.returns.find(r => r.id === open.id) ?? null); }}>Complete Inspection</button></div>
            </Section>
          )}
          <ReturnDoc ret={db.returns.find(r => r.id === open.id) ?? open} />
        </Modal>
      )}
    </>
  );
}
