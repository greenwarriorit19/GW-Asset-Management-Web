import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import type { Incident } from '../data/types';
import { today } from '../data/store';
import { PageHead, Section, Status, DataTable, Input, Select, TextArea, ReadOnly, Modal, useAction, fmtDate, type Column, DateInput } from '../components/ui';
import { IncidentDoc } from '../documents';
import { ApprovalBox } from '../components/ApprovalBox';

export function Incidents() {
  const { db, store } = useStore();
  const [sp, setSp] = useSearchParams();
  const { run, Messages } = useAction();
  const [open, setOpen] = useState<Incident | null>(null);
  const u = store.currentUser;

  const [assetId, setAssetId] = useState(sp.get('asset') ?? '');
  const [type, setType] = useState<'Lost' | 'Damaged'>('Damaged');
  const [date, setDate] = useState(today());
  // Default the reporting employee to the asset's custodian when arriving via ?asset=, else to the signed-in employee.
  const [reportedBy, setReportedBy] = useState(() => store.asset(sp.get('asset') ?? '')?.custodianEmployeeId ?? u.employeeId ?? '');
  const [location, setLocation] = useState('');
  const [desc, setDesc] = useState('');
  const [police, setPolice] = useState('');
  const [reason, setReason] = useState('');
  const candidates = db.assets.filter(a => !['Lost', 'Retired', 'Disposed'].includes(a.status) && (u.role !== 'employee' || a.custodianEmployeeId === u.employeeId));

  const [inv, setInv] = useState({ investigationNotes: '', responsibility: '', recoveryAction: '', recoveryAmount: '', resolution: 'Repair' as Incident['resolution'], reason: '' });

  const rows = db.incidents.filter(i => store.can('asset.view_all') || i.reportedByEmployeeId === u.employeeId || (store.can('asset.view_department') && store.employee(i.reportedByEmployeeId)?.departmentId === u.departmentId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns: Column<Incident>[] = [
    { key: 'id', header: 'Reference', render: i => <span className="mono">{i.id}</span> },
    { key: 'type', header: 'Type', render: i => <Status value={i.type} /> },
    { key: 'date', header: 'Incident Date', render: i => fmtDate(i.incidentDate) },
    { key: 'asset', header: 'Asset', render: i => <><span className="mono">{i.assetId}</span> {store.asset(i.assetId)?.name}</> },
    { key: 'emp', header: 'Reported By', render: i => store.employeeName(i.reportedByEmployeeId) },
    { key: 'resolution', header: 'Resolution', render: i => i.resolution ?? '—' },
    { key: 'approval', header: 'Approval', render: i => <Status value={i.approval} /> },
    { key: 'status', header: 'Status', render: i => <Status value={i.status} /> },
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const inc = run(() => store.openIncident({ assetId, type, incidentDate: date, reportedByEmployeeId: reportedBy, location, description: desc, policeReportNo: police || undefined, reason }), `Incident reported. Asset status: ${type}.`);
    if (inc) { setAssetId(''); setDesc(''); setLocation(''); setPolice(''); setReason(''); setSp({}); setOpen(inc); }
  };
  const current = open ? db.incidents.find(i => i.id === open.id) ?? open : null;

  return (
    <>
      <PageHead crumbs="Lifecycle" title="Lost or Damaged Assets" />
      <Messages />
      {store.can('incident.report') && (
        <form onSubmit={submit}>
          <Section title="Report Loss or Damage">
            <div className="rule-note">Rule 9: loss or damage requires an incident report, Department Head investigation and Management approval before the asset is repaired, recovered, written off or retired.</div>
            <div className="form-grid cols-4">
              <Select label="Asset" required span={2} value={assetId} onChange={e => { setAssetId(e.target.value); const a = store.asset(e.target.value); if (a?.custodianEmployeeId) setReportedBy(a.custodianEmployeeId); }} placeholder="Select asset…" options={candidates.map(a => ({ value: a.id, label: `${a.id} — ${a.name} · ${store.employeeName(a.custodianEmployeeId)}` }))} />
              <Select label="Incident Type" required value={type} onChange={e => setType(e.target.value as 'Lost' | 'Damaged')} options={[{ value: 'Damaged', label: 'Damaged' }, { value: 'Lost', label: 'Lost' }]} />
              <ReadOnly label="Incident Reference" value={store.nextRef('INC', db.incidents)} />
              <DateInput label="Incident Date" required value={date} onChange={e => setDate(e.target.value)} />
              <Select label="Reported By (Employee)" required value={reportedBy} onChange={e => setReportedBy(e.target.value)} placeholder="Select…" options={db.employees.map(e => ({ value: e.id, label: `${e.name} (${e.employeeCode})` }))} disabled={u.role === 'employee'} />
              <Input label="Location of Incident" required value={location} onChange={e => setLocation(e.target.value)} />
              <Input label="Police / FIR Reference" value={police} onChange={e => setPolice(e.target.value)} hint="Required for lost mobile devices" />
              <TextArea label="Description of Incident" required span={2} value={desc} onChange={e => setDesc(e.target.value)} />
              <TextArea label="Reason / Remarks" required span={2} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn danger" type="submit" disabled={!assetId}>Submit Incident Report</button></div>
          </Section>
        </form>
      )}
      <Section title="Incident Register" compact><DataTable rows={rows} columns={columns} onRowClick={i => setOpen(i)} /></Section>

      {current && (
        <Modal title={`Incident ${current.id}`} onClose={() => setOpen(null)} wide>
          {['Reported', 'Under Investigation'].includes(current.status) && store.can('incident.investigate') && (
            <Section title="Department Head Investigation">
              <div className="form-grid">
                <TextArea label="Investigation Notes" required span="full" value={inv.investigationNotes} onChange={e => setInv({ ...inv, investigationNotes: e.target.value })} />
                <Input label="Responsibility" required value={inv.responsibility} onChange={e => setInv({ ...inv, responsibility: e.target.value })} hint="e.g. Employee negligence / No individual responsibility" />
                <Input label="Recovery Action" required value={inv.recoveryAction} onChange={e => setInv({ ...inv, recoveryAction: e.target.value })} />
                <Input label="Recovery Amount (₹)" type="number" min={0} value={inv.recoveryAmount} onChange={e => setInv({ ...inv, recoveryAmount: e.target.value })} />
                <Select label="Proposed Resolution" value={inv.resolution ?? ''} onChange={e => setInv({ ...inv, resolution: e.target.value as Incident['resolution'] })} options={['Repair', 'Recovered', 'Written Off', 'Retired'].map(r => ({ value: r, label: r }))} />
                <Input label="Reason" required span={2} value={inv.reason} onChange={e => setInv({ ...inv, reason: e.target.value })} />
              </div>
              <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => run(() => store.investigateIncident(current.id, { ...inv, recoveryAmount: inv.recoveryAmount ? Number(inv.recoveryAmount) : undefined }), 'Investigation recorded; awaiting management approval.')}>Submit Investigation</button></div>
            </Section>
          )}
          {current.status === 'Awaiting Approval' && store.can('incident.approve') && <ApprovalBox title={`Management Approval — resolution: ${current.resolution}`} onDecide={(ok, c) => run(() => store.approveIncident(current.id, ok, c), ok ? 'Incident closed; asset status updated per resolution.' : 'Returned for further investigation.')} />}
          <IncidentDoc incident={current} />
        </Modal>
      )}
    </>
  );
}
