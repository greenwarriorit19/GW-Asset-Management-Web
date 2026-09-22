import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import { ASSET_STATUSES, CONDITIONS, OWNERSHIP_TYPES, type Asset, type Attachment, type Condition, type OwnershipType } from '../data/types';
import { today } from '../data/store';
import { PageHead, Section, Status, DataTable, Input, Select, SearchSelect, TextArea, FileInput, AttachmentLink, ReadOnly, Modal, Alert, useAction, fmtDate, fmtDateTime, fmtMoney, fmtSize, type Column } from '../components/ui';
import { useQr, assetUrl } from '../components/A4Document';
import { RegistrationDoc, AssetHistoryDoc } from '../documents';
import { exportRows } from '../lib/export';

// ---------- 3. Asset Inventory ----------
export function AssetInventory() {
  const { db, store } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');
  const [dept, setDept] = useState('');
  const [loc, setLoc] = useState('');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return store.visibleAssets().filter(a =>
      (!status || a.status === status) && (!cat || a.categoryId === cat) && (!dept || a.departmentId === dept) && (!loc || a.locationId === loc) &&
      (!s || [a.id, a.name, a.manufacturer, a.model, a.serialNumber, a.imei, a.sim, store.employeeName(a.custodianEmployeeId)].some(x => (x ?? '').toLowerCase().includes(s))))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [db, q, status, cat, dept, loc, store]);

  const columns: Column<Asset>[] = [
    { key: 'id', header: 'Asset ID', render: a => <span className="mono">{a.id}</span> },
    { key: 'name', header: 'Asset', render: a => <><div>{a.name}</div><div className="muted small">{a.manufacturer} {a.model}</div></> },
    { key: 'cat', header: 'Category', render: a => store.catName(a.categoryId) },
    { key: 'sn', header: 'Serial / IMEI', render: a => <span className="mono">{[a.serialNumber, a.imei].filter(Boolean).join(' / ')}</span> },
    { key: 'status', header: 'Status', render: a => <Status value={a.status} /> },
    { key: 'cond', header: 'Condition' , render: a => a.condition },
    { key: 'cust', header: 'Custodian', render: a => store.employeeName(a.custodianEmployeeId) },
    { key: 'dept', header: 'Department', render: a => store.deptName(a.departmentId) },
    { key: 'loc', header: 'Location', render: a => store.locName(a.locationId) },
    { key: 'cost', header: 'Cost', num: true, render: a => fmtMoney(a.purchaseCost) },
  ];

  return (
    <>
      <PageHead crumbs="Assets" title="Asset Inventory" actions={<>
        {store.can('reports.export') && <button className="btn" onClick={() => exportRows('Asset-Inventory', rows.map(a => ({ 'Asset ID': a.id, Name: a.name, Category: store.catName(a.categoryId), Manufacturer: a.manufacturer, Model: a.model, 'Serial No': a.serialNumber, IMEI: a.imei ?? '', SIM: a.sim ?? '', Status: a.status, Condition: a.condition, Custodian: store.employeeName(a.custodianEmployeeId), Department: store.deptName(a.departmentId), Location: store.locName(a.locationId), 'Purchase Date': a.purchaseDate, 'Purchase Cost': a.purchaseCost, 'Warranty Expiry': a.warrantyExpiry ?? '' })), 'xlsx')}>Export Excel</button>}
        {store.can('asset.register') && <Link className="btn" to="/assets/import">Bulk Import</Link>}
        {store.can('asset.register') && <Link className="btn primary" to="/assets/register">Register Asset</Link>}
      </>} />
      <div className="toolbar">
        <input className="grow" placeholder="Search by Asset ID, name, serial, IMEI, SIM or custodian…" value={q} onChange={e => setQ(e.target.value)} />
        <SearchSelect className="tb" value={status} onChange={e => setStatus(e.target.value)} placeholder="All statuses" options={ASSET_STATUSES.map(s => ({ value: s, label: s }))} />
        <SearchSelect className="tb" value={cat} onChange={e => setCat(e.target.value)} placeholder="All categories" options={db.categories.map(c => ({ value: c.id, label: c.name }))} />
        <SearchSelect className="tb" value={dept} onChange={e => setDept(e.target.value)} placeholder="All departments" options={db.departments.map(d => ({ value: d.id, label: d.name }))} />
        <SearchSelect className="tb" value={loc} onChange={e => setLoc(e.target.value)} placeholder="All locations" options={db.locations.map(l => ({ value: l.id, label: l.name }))} />
        <span className="muted small">{rows.length} of {store.visibleAssets().length}</span>
      </div>
      <Section title="Asset Register" compact>
        <DataTable rows={rows} columns={columns} onRowClick={a => nav(`/assets/${a.id}`)} />
      </Section>
    </>
  );
}

// ---------- Asset detail: current state + permanent history + QR ----------
export function AssetDetail() {
  const { id } = useParams();
  const { db, store } = useStore();
  const nav = useNavigate();
  const a = db.assets.find(x => x.id === id);
  const [tab, setTab] = useState<'overview' | 'history' | 'documents' | 'form' | 'historyDoc'>('overview');
  const [edit, setEdit] = useState(false);
  const qr = useQr(a ? assetUrl(a.id) : undefined);
  if (!a) return <Alert kind="error">Asset {id} not found.</Alert>;
  const visible = store.visibleAssets().some(x => x.id === a.id);
  if (!visible) return <Alert kind="error">You do not have permission to view this asset.</Alert>;
  const history = store.assetHistory(a.id);
  const docs = db.documents.filter(d => d.assetId === a.id);
  const activeHandover = db.handovers.find(h => h.status === 'Active' && h.items.some(i => i.assetId === a.id));

  return (
    <>
      <PageHead crumbs={`Assets / ${store.catName(a.categoryId)}`} title={`${a.id} — ${a.name}`} actions={<>
        <Link className="btn" to={`/track?asset=${a.id}`}>Track (full record)</Link>
        {store.can('asset.edit') && <button className="btn" onClick={() => setEdit(true)}>Edit Details</button>}
        {store.can('handover.create') && a.status === 'Available' && <Link className="btn primary" to={`/handovers/new?asset=${a.id}`}>Issue to Employee</Link>}
        {store.can('return.create') && a.status === 'Assigned' && <Link className="btn" to={`/returns?asset=${a.id}`}>Record Return</Link>}
        {store.can('transfer.request') && ['Assigned', 'Available'].includes(a.status) && <Link className="btn" to={`/transfers?asset=${a.id}`}>Transfer</Link>}
        {store.can('repair.create') && !['Lost', 'Retired', 'Disposed'].includes(a.status) && !db.repairs.some(r => r.assetId === a.id && r.status !== 'Completed') && <Link className="btn" to={`/repairs?asset=${a.id}`}>Send for Repair</Link>}
        {store.can('incident.report') && !['Lost', 'Retired', 'Disposed'].includes(a.status) && <Link className="btn danger" to={`/incidents?asset=${a.id}`}>Report Loss / Damage</Link>}
        {store.can('disposal.request') && !['Retired', 'Disposed'].includes(a.status) && <Link className="btn" to={`/disposals?asset=${a.id}`}>Recommend Retirement</Link>}
      </>} />

      <div className="tabs">
        {(['overview', 'history', 'documents', 'form', 'historyDoc'] as const).map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {{ overview: 'Overview', history: `Transaction History (${history.length})`, documents: `Documents (${docs.length})`, form: 'Registration Form', historyDoc: 'Asset History Report' }[t]}
          </button>))}
      </div>

      {tab === 'overview' && (
        <div className="grid cols-3">
          <div style={{ gridColumn: 'span 2' }}>
            <Section title="Current State">
              <dl className="kv">
                <dt>Status</dt><dd><Status value={a.status} /> &nbsp; Condition: <b>{a.condition}</b></dd>
                <dt>Custodian</dt><dd>{a.custodianEmployeeId ? <>{store.employeeName(a.custodianEmployeeId)} ({store.employee(a.custodianEmployeeId)?.employeeCode}) {activeHandover && <> · Handover <Link to={`/handovers/${activeHandover.id}`}>{activeHandover.id}</Link></>}</> : '—'}</dd>
                <dt>Department</dt><dd>{store.deptName(a.departmentId)}</dd>
                <dt>Location</dt><dd>{store.locName(a.locationId)}</dd>
              </dl>
            </Section>
            <Section title="Identification">
              <dl className="kv">
                <dt>Category</dt><dd>{store.catName(a.categoryId)}</dd>
                <dt>Manufacturer / Model</dt><dd>{a.manufacturer} {a.model}</dd>
                <dt>Serial Number</dt><dd className="mono">{a.serialNumber}</dd>
                {a.imei && <><dt>IMEI</dt><dd className="mono">{a.imei}</dd></>}
                {a.sim && <><dt>SIM</dt><dd className="mono">{a.sim}</dd></>}
                <dt>Barcode / QR</dt><dd className="mono">{a.barcode}</dd>
                <dt>Ownership</dt><dd>{a.ownershipType}</dd>
                <dt>Specification</dt><dd>{a.specification || '—'}</dd>
                <dt>Accessories</dt><dd>{a.accessories || '—'}</dd>
              </dl>
            </Section>
            <Section title="Procurement & Warranty">
              <dl className="kv">
                <dt>Invoice / PO</dt><dd>{a.invoiceNumber} / {a.poNumber}</dd>
                <dt>Purchase</dt><dd>{fmtDate(a.purchaseDate)} · {fmtMoney(a.purchaseCost)}</dd>
                <dt>Warranty</dt><dd>{fmtDate(a.warrantyStart)} – {fmtDate(a.warrantyExpiry)}</dd>
                <dt>Registered</dt><dd>{fmtDateTime(a.registeredAt)} by {store.userName(a.registeredBy)} {a.registrationApprovedBy ? `· approved by ${store.userName(a.registrationApprovedBy)}` : <Status value="Pending Approval" />}</dd>
              </dl>
            </Section>
            {(a.maintenanceNotes || a.remarks) && <Section title="Notes"><pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{a.maintenanceNotes}{a.maintenanceNotes && a.remarks ? '\n' : ''}{a.remarks}</pre></Section>}
          </div>
          <div>
            <Section title="QR Code">
              <div style={{ textAlign: 'center' }}>
                {qr && <img src={qr} alt="QR" style={{ width: 160, height: 160 }} />}
                <div className="mono small" style={{ marginTop: 6 }}>{a.id}</div>
                <div className="muted small">Scanning opens this asset record.</div>
                {qr && <a className="btn sm" style={{ marginTop: 8, display: 'inline-block' }} href={qr} download={`${a.id}-qr.png`}>Download QR label</a>}
              </div>
            </Section>
            {a.photo && <Section title="Photograph">{a.photo.dataUrl && <img src={a.photo.dataUrl} alt="Asset" style={{ width: '100%', border: '1px solid var(--grey-300)', marginBottom: 8 }} />}<AttachmentLink a={a.photo} /></Section>}
            {(a.invoiceAttachment || a.warrantyAttachment) && <Section title="Purchase Documents"><div className="btn-row">{a.invoiceAttachment && <span>Invoice: <AttachmentLink a={a.invoiceAttachment} /></span>}{a.warrantyAttachment && <span>Warranty: <AttachmentLink a={a.warrantyAttachment} /></span>}</div></Section>}
            <Section title="Custody Summary" compact>
              <table className="data"><thead><tr><th>Custodian</th><th>From</th></tr></thead>
                <tbody>{history.filter(t => t.type === 'HANDOVER' || t.type === 'TRANSFER').map(t => <tr key={t.id}><td>{store.employeeName(t.toEmployeeId)}</td><td>{fmtDate(t.date)}</td></tr>)}
                  {history.filter(t => t.type === 'HANDOVER').length === 0 && <tr><td className="empty" colSpan={2}>Never assigned.</td></tr>}</tbody></table>
            </Section>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <Section title="Permanent Transaction History" right={<span className="muted small">Append-only. Records are never edited or deleted.</span>}>
          <ul className="timeline">
            {history.map(t => (
              <li key={t.id}>
                <span className="when">{fmtDateTime(t.date)}</span>
                <span className="type">{t.type.replace('_', ' ')}</span>
                <span>
                  {t.reference && <span className="mono">{t.reference} · </span>}
                  {t.statusBefore !== t.statusAfter ? <><Status value={t.statusBefore} /> → <Status value={t.statusAfter} /> </> : <Status value={t.statusAfter} />}
                  {(t.fromEmployeeId || t.toEmployeeId) && <span> · {store.employeeName(t.fromEmployeeId)} → {store.employeeName(t.toEmployeeId)}</span>}
                  {t.conditionAfter && t.conditionBefore !== t.conditionAfter && <span> · condition {t.conditionBefore ?? '?'} → {t.conditionAfter}</span>}
                  <div className="small">{t.reason}{t.remarks ? ` — ${t.remarks}` : ''} <span className="muted">· {t.performedByName}</span></div>
                </span>
              </li>))}
          </ul>
        </Section>
      )}

      {tab === 'documents' && (
        <Section title="Attached Documents" compact right={store.can('documents.upload') && <Link className="btn sm" to={`/documents?asset=${a.id}`}>Upload</Link>}>
          <table className="data"><thead><tr><th>Type</th><th>File</th><th>Linked To</th><th>Uploaded</th><th /></tr></thead>
            <tbody>{docs.length === 0 && <tr><td className="empty" colSpan={5}>No documents attached.</td></tr>}
              {docs.map(d => <tr key={d.id}><td>{d.documentType}</td><td>{d.attachment.name} <span className="muted small">({fmtSize(d.attachment.size)})</span></td><td className="mono">{d.entityType} {d.entityId}</td><td>{fmtDateTime(d.uploadedAt)} · {store.userName(d.uploadedByUserId)}</td><td><AttachmentLink a={d.attachment} /></td></tr>)}
            </tbody></table>
        </Section>
      )}

      {tab === 'form' && <RegistrationDoc asset={a} />}
      {tab === 'historyDoc' && <AssetHistoryDoc asset={a} />}

      {edit && <AssetForm asset={a} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); nav(`/assets/${a.id}`); }} />}
    </>
  );
}

// ---------- 2. Asset Registration (new) & edit ----------
export function AssetRegister() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [done, setDone] = useState<string | null>(sp.get('done'));
  return (
    <>
      <PageHead crumbs="Assets" title="Asset Registration" />
      {done && <Alert kind="success">Asset <b>{done}</b> registered with status Available. <Link to={`/assets/${done}`}>Open record</Link> · <Link to="/assets/register" onClick={() => setDone(null)}>Register another</Link></Alert>}
      <div className="rule-note">Rules enforced: unique Asset ID generated per category (GW-AST-CATEGORY-0001); serial, IMEI and SIM numbers are checked for duplicates; registration is recorded as the first transaction in the asset's permanent history and queued for Finance / Admin Head approval.</div>
      {/* key forces a fresh, empty form after each registration */}
      <AssetForm key={done ?? 'new'} onSaved={id => nav(`/assets/register?done=${id}`)} />
    </>
  );
}

type FormState = Omit<Asset, 'id' | 'status' | 'registeredBy' | 'registeredAt' | 'custodianEmployeeId' | 'purchaseCost'> & { purchaseCost: string };

function AssetForm({ asset, onSaved, onClose }: { asset?: Asset; onSaved: (id: string) => void; onClose?: () => void }) {
  const { db, store } = useStore();
  const { run, Messages } = useAction();
  const [reason, setReason] = useState(asset ? '' : 'New asset received against invoice');
  const [f, setF] = useState<FormState>(() => asset ? { ...asset, purchaseCost: String(asset.purchaseCost) } : {
    categoryId: db.categories[0]?.id ?? '', name: '', manufacturer: '', model: '', serialNumber: '', imei: '', sim: '', barcode: '',
    ownershipType: 'Company Owned', supplierName: '', invoiceNumber: '', poNumber: '', purchaseDate: today(), purchaseCost: '',
    warrantyStart: '', warrantyExpiry: '', funding: '', condition: 'New', departmentId: db.departments[0]?.id ?? '', locationId: db.locations[0]?.id ?? '',
    specification: '', accessories: '', maintenanceNotes: '', remarks: '',
  });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(s => ({ ...s, [k]: v }));
  const previewId = asset ? asset.id : (() => { try { return store.nextAssetId(f.categoryId); } catch { return ''; } })();
  const dupWarn = store.checkDuplicates({ serialNumber: f.serialNumber, imei: f.imei, sim: f.sim }, asset?.id);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload = { ...f, purchaseCost: Number(f.purchaseCost) || 0, imei: f.imei || undefined, sim: f.sim || undefined, warrantyStart: f.warrantyStart || undefined, warrantyExpiry: f.warrantyExpiry || undefined };
    if (asset) {
      const ok = run(() => store.updateAsset(asset.id, payload, reason), 'Asset updated.');
      if (ok !== undefined) onSaved(asset.id);
    } else {
      const created = run(() => store.registerAsset({ ...payload, reason }));
      if (created) onSaved(created.id);
    }
  };

  const body = (
    <form onSubmit={submit}>
      <Messages />
      {dupWarn.length > 0 && <Alert kind="error">{dupWarn.join(' ')}</Alert>}
      <Section title="Identification">
        <div className="form-grid">
          <ReadOnly label="Asset ID (auto-generated)" value={previewId} />
          <Select label="Asset Category" required value={f.categoryId} onChange={e => set('categoryId', e.target.value)} options={db.categories.map(c => ({ value: c.id, label: `${c.name} (${c.code})` }))} disabled={!!asset} />
          <Input label="Asset Name" required value={f.name} onChange={e => set('name', e.target.value)} />
          <Input label="Manufacturer" required value={f.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
          <Input label="Model" required value={f.model} onChange={e => set('model', e.target.value)} />
          <Input label="Serial Number" required value={f.serialNumber} onChange={e => set('serialNumber', e.target.value)} hint="Checked for duplicates" />
          <Input label="IMEI Number" value={f.imei ?? ''} onChange={e => set('imei', e.target.value)} inputMode="numeric" />
          <Input label="SIM Number" value={f.sim ?? ''} onChange={e => set('sim', e.target.value)} inputMode="numeric" />
          <Input label="Barcode / QR Code" value={f.barcode ?? ''} onChange={e => set('barcode', e.target.value)} hint="Defaults to the Asset ID" />
          <Select label="Ownership Type" required value={f.ownershipType} onChange={e => set('ownershipType', e.target.value as OwnershipType)} options={OWNERSHIP_TYPES.map(o => ({ value: o, label: o }))} />
        </div>
      </Section>
      <Section title="Procurement">
        <div className="form-grid">
          <Input label="Invoice Number" required value={f.invoiceNumber} onChange={e => set('invoiceNumber', e.target.value)} />
          <Input label="Purchase Order Number" value={f.poNumber} onChange={e => set('poNumber', e.target.value)} />
          <Input label="Purchase Date" type="date" required value={f.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} />
          <Input label="Purchase Cost (₹)" type="number" min={0} required value={f.purchaseCost} onChange={e => set('purchaseCost', e.target.value)} />
          <Input label="Warranty Start Date" type="date" value={f.warrantyStart ?? ''} onChange={e => set('warrantyStart', e.target.value)} />
          <Input label="Warranty Expiry Date" type="date" value={f.warrantyExpiry ?? ''} onChange={e => set('warrantyExpiry', e.target.value)} />
        </div>
      </Section>
      <Section title="Allocation">
        <div className="form-grid">
          <ReadOnly label="Current Status" value={asset ? asset.status : 'Available (on registration)'} />
          <Select label="Current Condition" required value={f.condition} onChange={e => set('condition', e.target.value as Condition)} options={CONDITIONS.map(c => ({ value: c, label: c }))} />
          <Select label="Department" required value={f.departmentId} onChange={e => set('departmentId', e.target.value)} options={db.departments.map(d => ({ value: d.id, label: d.name }))} />
          <Select label="Assigned Location" required value={f.locationId} onChange={e => set('locationId', e.target.value)} options={db.locations.map(l => ({ value: l.id, label: l.name }))} />
          <ReadOnly label="Custodian / Employee" value={asset ? store.employeeName(asset.custodianEmployeeId) : 'None — set via Employee Handover'} />
          <ReadOnly label="Employee ID" value={asset ? store.employee(asset.custodianEmployeeId)?.employeeCode ?? '—' : '—'} />
        </div>
      </Section>
      <Section title="Specification, Accessories & Attachments">
        <div className="form-grid">
          <TextArea label="Configuration / Technical Specification" span={3} value={f.specification ?? ''} onChange={e => set('specification', e.target.value)} />
          <TextArea label="Accessories Included" value={f.accessories ?? ''} onChange={e => set('accessories', e.target.value)} />
          <TextArea label="Maintenance Notes" value={f.maintenanceNotes ?? ''} onChange={e => set('maintenanceNotes', e.target.value)} />
          <TextArea label="Remarks" value={f.remarks ?? ''} onChange={e => set('remarks', e.target.value)} />
          <FileInput label="Invoice Attachment" accept=".pdf,image/*" tag={previewId} kind="Invoice" onChange={(a?: Attachment) => set('invoiceAttachment', a)} hint={f.invoiceAttachment?.name} />
          <FileInput label="Warranty Attachment" accept=".pdf,image/*" tag={previewId} kind="Warranty" onChange={(a?: Attachment) => set('warrantyAttachment', a)} hint={f.warrantyAttachment?.name} />
          <FileInput label="Asset Photograph" accept="image/*" tag={previewId} kind="Photo" onChange={(a?: Attachment) => set('photo', a)} hint={f.photo?.name} />
        </div>
      </Section>
      <Section title="Authorisation">
        <div className="form-grid">
          <Input label={asset ? 'Reason for change' : 'Reason / Remarks for registration'} required span={2} value={reason} onChange={e => setReason(e.target.value)} />
          <ReadOnly label="Recorded by" value={`${store.currentUser.name} · ${new Date().toLocaleString('en-IN')}`} />
        </div>
        <div className="btn-row end" style={{ marginTop: 12 }}>
          {onClose && <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>}
          <button type="submit" className="btn primary">{asset ? 'Save Changes' : 'Register Asset'}</button>
        </div>
      </Section>
    </form>
  );
  return asset && onClose ? <Modal title={`Edit ${asset.id}`} onClose={onClose} wide>{body}</Modal> : body;
}
