import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import type { Handover, HandoverItem } from '../data/types';
import { PageHead, Section, Status, DataTable, Input, Select, SearchSelect, ReadOnly, Alert, Modal, useAction, fmtDate, fmtDateTime, type Column } from '../components/ui';
import { AssetLines } from '../components/AssetLines';
import { HandoverDoc, ClearanceDoc } from '../documents';
import { askReason } from '../components/Dialog';

export function HandoverList() {
  const { db, store } = useStore();
  const nav = useNavigate();
  const [filter, setFilter] = useState('');
  const [clearanceEmp, setClearanceEmp] = useState('');
  const [editing, setEditing] = useState<Handover | null>(null);
  const u = store.currentUser;
  const rows = db.handovers
    .filter(h => store.can('asset.view_all') || (store.can('asset.view_department') && store.employee(h.employeeId)?.departmentId === u.departmentId) || h.employeeId === u.employeeId)
    .filter(h => !filter || h.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns: Column<Handover>[] = [
    { key: 'id', header: 'Reference', render: h => <span className="mono">{h.id}</span> },
    { key: 'date', header: 'Date', render: h => fmtDate(h.date) },
    { key: 'emp', header: 'Employee', render: h => <>{store.employeeName(h.employeeId)} <span className="muted small">{store.employee(h.employeeId)?.employeeCode}</span></> },
    { key: 'dept', header: 'Department', render: h => store.deptName(store.employee(h.employeeId)?.departmentId) },
    { key: 'items', header: 'Assets', render: h => h.items.map(i => i.assetId).join(', ') },
    { key: 'purpose', header: 'Purpose', render: h => h.purpose },
    { key: 'status', header: 'Status', render: h => <Status value={h.status} /> },
    { key: 'actions', header: 'Actions', render: h => (
      <div className="btn-row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        <button type="button" className="btn sm" onClick={() => nav(`/handovers/${h.id}`)}>View</button>
        {store.can('handover.create') && ['Active', 'Awaiting Acknowledgement'].includes(h.status) &&
          <button type="button" className="btn sm" onClick={() => setEditing(h)}>Edit</button>}
      </div>) },
  ];
  return (
    <>
      <PageHead crumbs="Custody" title="Assets Assigned to Employees" actions={<>
        {store.can('reports.view') && <SearchSelect className="tb" style={{ minWidth: 260 }} value={clearanceEmp} onChange={e => setClearanceEmp(e.target.value)} placeholder="Employee clearance report…" options={db.employees.map(e => ({ value: e.id, label: `${e.name} (${e.employeeCode})` }))} />}
        {store.can('handover.create') && <Link className="btn primary" to="/handovers/new">Assign Asset to Employee</Link>}
      </>} />
      {clearanceEmp && <ClearanceDoc employee={store.employee(clearanceEmp)!} />}
      <div className="toolbar">
        <SearchSelect className="tb" value={filter} onChange={e => setFilter(e.target.value)} placeholder="All statuses" options={['Active', 'Awaiting Acknowledgement', 'Closed', 'Rejected'].map(s => ({ value: s === 'Rejected' ? 'Rejected' : s, label: s === 'Rejected' ? 'Cancelled' : s }))} />
        <span className="muted small">{rows.length} assignments</span>
      </div>
      <Section title="Assignment Register" compact><DataTable rows={rows} columns={columns} onRowClick={h => nav(`/handovers/${h.id}`)} /></Section>
      {editing && <HandoverEdit handover={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Amends the lines of an assignment: condition, quantity, accessories and remarks. Assets and employee are fixed. */
function HandoverEdit({ handover, onClose }: { handover: Handover; onClose: () => void }) {
  const { store } = useStore();
  const { runOk, Messages } = useAction();
  const [items, setItems] = useState<HandoverItem[]>(handover.items.map(i => ({ ...i })));
  const [reason, setReason] = useState('');
  return (
    <Modal wide title={`Edit assignment ${handover.id}`} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={reason.trim().length < 3 || items.length === 0} title={items.length === 0 ? 'Keep at least one asset, or cancel the whole assignment' : undefined} onClick={() => { if (runOk(() => store.updateHandoverItems(handover.id, items, reason), 'Assignment updated.')) onClose(); }}>Save Changes</button>
    </>}>
      <Messages />
      <p className="muted small" style={{ marginTop: 0 }}>Assigned to <b>{store.employeeName(handover.employeeId)}</b>. Condition, quantity, accessories and remarks can be corrected, and an asset can be removed — it goes straight back to <b>Available</b>. Adding a different asset means raising a new assignment.</p>
      <AssetLines items={items} setItems={setItems} allowRemove />
      <div style={{ marginTop: 12 }}><Input label="Reason for the change" required value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Charger added at handover" hint="Recorded on each amended asset's history." /></div>
    </Modal>
  );
}

export function HandoverDetail() {
  const { id } = useParams();
  const { db, store } = useStore();
  const { run, Messages } = useAction();
  const h = db.handovers.find(x => x.id === id);
  if (!h) return <Alert kind="error">Assignment not found.</Alert>;
  const emp = store.employee(h.employeeId)!;

  return (
    <>
      <PageHead crumbs="Custody / Asset Assigned to Employee" title={h.id} actions={<Status value={h.status} />} />
      <Messages />
      {h.transferId && <Alert>This assignment was generated by transfer <Link to="/transfers">{h.transferId}</Link>.</Alert>}
      <div className="grid cols-2">
        <Section title="Workflow">
          <dl className="kv">
            <dt>Created</dt><dd>{fmtDateTime(h.createdAt)} by {store.userName(h.createdByUserId)}</dd>
            <dt>Issued by</dt><dd>{store.userName(h.issuedByUserId)}</dd>
            <dt>Assigned to</dt><dd>{emp.name} · {emp.employeeCode} · {store.deptName(emp.departmentId)}</dd>
            <dt>Assets</dt><dd>{h.items.map(i => i.assetId).join(', ')}</dd>{h.approvalComments ? <><dt>Remarks</dt><dd>“{h.approvalComments}”</dd></> : null}
          </dl>
        </Section>
        <div>
          {h.status === 'Awaiting Acknowledgement' && store.can('handover.create') && (
            <Section title="Confirm Assignment"><p className="small">This assignment was raised while the old signature step still existed. Confirming hands the asset(s) to {emp.name} now; no signature is needed.</p>
              <button className="btn primary" onClick={() => run(() => store.confirmAssignment(h.id), 'Assignment confirmed; assets are now Assigned.')}>Confirm Assignment</button></Section>
          )}
          {['Active', 'Awaiting Acknowledgement'].includes(h.status) && store.can('handover.create') && (
            <Section title="Cancel Assignment"><p className="small">Withdraws an assignment raised in error and returns the asset(s) to Available. Once the employee has used the asset, record an <Link to="/returns">Asset Return</Link> instead.</p>
              <button className="btn danger" onClick={async () => { const reason = await askReason({ title: `Cancel assignment ${h.id}`, message: 'The assigned assets will become Available again.', confirmLabel: 'Cancel assignment' }); if (reason) run(() => store.cancelHandover(h.id, reason), 'Assignment cancelled; assets released.'); }}>Cancel Assignment</button></Section>
          )}
          {h.status === 'Active' && store.can('return.create') && <Section title="Actions"><div className="btn-row">{h.items.map(i => store.asset(i.assetId)?.status === 'Assigned' && <Link key={i.assetId} className="btn" to={`/returns?asset=${i.assetId}`}>Return {i.assetId}</Link>)}</div></Section>}
        </div>
      </div>
      <HandoverDoc handover={h} />
    </>
  );
}

export function HandoverNew() {
  const { db, store } = useStore();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { run, Messages } = useAction();
  const [employeeId, setEmployeeId] = useState('');
  const [issuedBy, setIssuedBy] = useState(store.currentUser.id);
  const reason = 'Asset assigned to employee';
  const [items, setItems] = useState<HandoverItem[]>(() => {
    const pre = sp.get('asset'); const a = pre ? store.asset(pre) : undefined;
    return a && a.status === 'Available' ? [{ assetId: a.id, condition: a.condition, quantity: 1, accessories: a.accessories ?? '', remarks: '' }] : [];
  });
  const [pick, setPick] = useState('');
  const emp = store.employee(employeeId);
  const available = db.assets.filter(a => a.status === 'Available' && !items.some(i => i.assetId === a.id));
  const add = () => { const a = store.asset(pick); if (!a) return; setItems([...items, { assetId: a.id, condition: a.condition, quantity: 1, accessories: a.accessories ?? '', remarks: '' }]); setPick(''); };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const h = run(() => store.createHandover({ employeeId, issuedByUserId: issuedBy, items, reason }), 'Assignment saved; the assets are now assigned.');
    if (h) nav(`/handovers/${h.id}`);
  };

  return (
    <>
      <PageHead crumbs="Custody / Asset Assigned to Employee" title="Assign Asset to Employee" actions={<span className="mono muted">{store.nextRef('HO', db.handovers)}</span>} />
      <div className="rule-note">Only <b>Available</b> assets can be assigned (Rule 4). Submitting hands the assets over straight away — no approval or signature step; they become <b>Assigned</b> to the employee immediately.</div>
      <form onSubmit={submit}>
        <Messages />
        <Section title="Employee Details">
          <div className="form-grid cols-4">
            <Select label="Employee" required span={2} value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="Select employee…" options={db.employees.filter(e => e.active).map(e => ({ value: e.id, label: `${e.name} — ${e.employeeCode} (${store.deptName(e.departmentId)})` }))} />
            <ReadOnly label="Employee ID" value={emp?.employeeCode ?? ''} />
            <ReadOnly label="ERP ID" value={emp?.erpId ?? ''} />
            <ReadOnly label="Designation" value={emp?.designation ?? ''} />
            <ReadOnly label="Department" value={emp ? store.deptName(emp.departmentId) : ''} />
            <ReadOnly label="Date of Joining" value={emp ? fmtDate(emp.dateOfJoining) : ''} />
            <ReadOnly label="Work Location" value={emp ? store.locName(emp.workLocationId) : ''} />
            <ReadOnly label="Mobile / Email" value={emp ? `${emp.mobile} · ${emp.email}` : ''} />
          </div>
        </Section>
        <Section title="Assignment Details">
          <div className="form-grid cols-4">
            <ReadOnly label="Assignment Reference No" value={store.nextRef('HO', db.handovers)} />
            <ReadOnly label="Assigned Date" value={fmtDate(new Date().toISOString())} />
            <Select label="Issued By" required value={issuedBy} onChange={e => setIssuedBy(e.target.value)} options={db.users.filter(u => ['asset_admin', 'super_admin'].includes(u.role)).map(u => ({ value: u.id, label: u.name }))} />
          </div>
        </Section>
        <Section title="Assets to Assign" compact className="assign-card" right={<span className="ac-count">{items.length} selected</span>}>
          <div className="assign-bar">
            <span className="ab-label">Add asset</span>
            <SearchSelect className="tb" value={pick} onChange={e => setPick(e.target.value)} placeholder={available.length ? 'Search asset ID, name or serial…' : 'No assets are Available'} options={available.map(a => ({ value: a.id, label: `${a.id} — ${a.name} (${a.serialNumber})` }))} />
            <button type="button" className="btn sm primary" disabled={!pick} onClick={add}>Add to list</button>
            <span className="ab-avail">{available.length} available</span>
          </div>
          <AssetLines items={items} setItems={setItems} allowRemove empty={
            available.length > 0
              ? <>Pick an asset from <b>Add asset</b> above — {available.length} asset(s) are Available.</>
              : db.assets.length === 0
                ? <>No assets have been registered yet. <Link to="/assets/register">Register an asset</Link> or use <Link to="/assets/import">Bulk Import</Link> first.</>
                : <>None of the {db.assets.length} registered asset(s) are <b>Available</b> to assign — {[...new Set(db.assets.map(a => a.status))].map(st => `${db.assets.filter(a => a.status === st).length} ${st}`).join(', ')}. Return or free one, or <Link to="/assets/register">register a new asset</Link>.</>} />
        </Section>
        <div className="btn-row end" style={{ marginBottom: 18 }}><Link className="btn ghost" to="/handovers">Cancel</Link><button className="btn primary" type="submit" disabled={!employeeId || items.length === 0}>Submit</button></div>
      </form>
    </>
  );
}
