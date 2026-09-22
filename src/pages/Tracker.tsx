import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import { PageHead, Section, Status, AttachmentLink, fmtDate, fmtDateTime, fmtMoney, fmtSize } from '../components/ui';
import { AssetHistoryDoc } from '../documents';
import { exportRows } from '../lib/export';

/** Asset Tracker — one screen with the entire record of a single asset, found by Asset ID / serial / IMEI / SIM. */
export function Tracker() {
  const { db, store } = useStore();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('asset') ?? '');
  const [tab, setTab] = useState<'summary' | 'report'>('summary');

  const term = (sp.get('asset') ?? '').trim().toUpperCase();
  const matches = term ? store.visibleAssets().filter(a => [a.id, a.serialNumber, a.imei, a.sim, a.barcode].some(x => (x ?? '').toUpperCase() === term))
    .concat(store.visibleAssets().filter(a => [a.id, a.serialNumber, a.imei, a.sim, a.name].some(x => (x ?? '').toUpperCase().includes(term)))).filter((a, i, arr) => arr.indexOf(a) === i) : [];
  const a = matches[0];

  const submit = (e: FormEvent) => { e.preventDefault(); setSp(q.trim() ? { asset: q.trim() } : {}); };

  const handovers = a ? db.handovers.filter(h => h.items.some(i => i.assetId === a.id)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)) : [];
  const returns = a ? db.returns.filter(r => r.assetId === a.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt)) : [];
  const transfers = a ? db.transfers.filter(t => t.assetId === a.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt)) : [];
  const repairs = a ? db.repairs.filter(r => r.assetId === a.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt)) : [];
  const incidents = a ? db.incidents.filter(i => i.assetId === a.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt)) : [];
  const disposals = a ? db.disposals.filter(d => d.assetId === a.id) : [];
  const docs = a ? db.documents.filter(d => d.assetId === a.id) : [];
  const history = a ? store.assetHistory(a.id) : [];
  const custodians = history.filter(t => t.toEmployeeId && (t.type === 'HANDOVER' || t.type === 'TRANSFER')).map(t => ({ id: t.id, who: store.employeeName(t.toEmployeeId), from: t.date, ref: t.reference }));
  const repairSpend = repairs.reduce((s, r) => s + (r.actualCost ?? 0), 0);

  return (
    <>
      <PageHead crumbs="Assets" title="Asset Tracker" actions={a && store.can('reports.export') && <button className="btn" onClick={() => exportRows(`${a.id}-history`, history.slice().reverse().map(t => ({ 'Date / Time': fmtDateTime(t.date), Transaction: t.type, Reference: t.reference ?? '', From: store.employeeName(t.fromEmployeeId), To: store.employeeName(t.toEmployeeId), 'Status Before': t.statusBefore, 'Status After': t.statusAfter, Condition: t.conditionAfter ?? '', 'Performed By': t.performedByName, Reason: t.reason })), 'xlsx', `Asset History — ${a.id}`)}>Export History (Excel)</button>} />

      <form onSubmit={submit} className="toolbar">
        <input className="grow" autoFocus placeholder="Enter Asset ID (e.g. GW-AST-MOB-0001), serial number, IMEI or SIM — or scan the QR label" value={q} onChange={e => setQ(e.target.value)} style={{ fontFamily: 'Consolas, monospace' }} />
        <button className="btn primary" type="submit">Track</button>
        {term && <button type="button" className="btn ghost" onClick={() => { setQ(''); setSp({}); }}>Clear</button>}
      </form>

      {term && !a && <div className="alert error">No asset matches “{term}”.</div>}
      {matches.length > 1 && <div className="alert">{matches.length} assets match. Showing <b>{a!.id}</b>. Others: {matches.slice(1, 8).map(m => <Link key={m.id} to={`/track?asset=${m.id}`} onClick={() => setQ(m.id)} className="mono" style={{ marginRight: 8 }}>{m.id}</Link>)}</div>}

      {!term && (
        <Section title="How to use">
          <p>Type or scan an Asset ID to see everything recorded against that asset in one place: current custodian and status, every handover, return, transfer, repair, loss/damage report, retirement/disposal record, attached documents and the complete transaction timeline.</p>
          <div className="btn-row">{store.visibleAssets().map(x => ({ x, n: db.transactions.filter(t => t.assetId === x.id).length })).sort((p, q) => q.n - p.n).slice(0, 8).map(({ x }) => <button key={x.id} type="button" className="btn sm ghost mono" onClick={() => { setQ(x.id); setSp({ asset: x.id }); }}>{x.id}</button>)}</div>
        </Section>
      )}

      {a && (
        <>
          <div className="tabs">
            <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Complete Record</button>
            <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>Asset History Report (A4)</button>
          </div>

          {tab === 'report' && <AssetHistoryDoc asset={a} />}

          {tab === 'summary' && (
            <>
              <div className="grid cols-6" style={{ marginBottom: 18 }}>
                <div className="metric" style={{ gridColumn: 'span 2' }}><div className="label">Asset</div><div className="value" style={{ fontSize: 17 }}>{a.id}</div><div className="sub">{a.name} · {a.manufacturer} {a.model} · <Link to={`/assets/${a.id}`}>open record</Link></div></div>
                <div className="metric"><div className="label">Status</div><div className="value" style={{ fontSize: 15, marginTop: 8 }}><Status value={a.status} /></div><div className="sub">Condition: {a.condition}</div></div>
                <div className="metric"><div className="label">Current Custodian</div><div className="value" style={{ fontSize: 15 }}>{store.employeeName(a.custodianEmployeeId)}</div><div className="sub">{store.employee(a.custodianEmployeeId)?.employeeCode ?? 'No custodian'}</div></div>
                <div className="metric"><div className="label">Department / Location</div><div className="value" style={{ fontSize: 14 }}>{store.deptName(a.departmentId)}</div><div className="sub">{store.locName(a.locationId)}</div></div>
                <div className="metric"><div className="label">Value / Repair Spend</div><div className="value" style={{ fontSize: 15 }}>{fmtMoney(a.purchaseCost)}</div><div className="sub">Repairs {fmtMoney(repairSpend)} · {history.length} transactions</div></div>
              </div>

              <div className="grid cols-2">
                <Section title="Identification">
                  <dl className="kv">
                    <dt>Category</dt><dd>{store.catName(a.categoryId)}</dd>
                    <dt>Serial / IMEI / SIM</dt><dd className="mono">{[a.serialNumber, a.imei, a.sim].filter(Boolean).join(' / ')}</dd>
                    <dt>Warranty</dt><dd>{fmtDate(a.warrantyStart)} – {fmtDate(a.warrantyExpiry)}</dd>
                    <dt>Accessories</dt><dd>{a.accessories || '—'}</dd>
                    <dt>Registered</dt><dd>{fmtDateTime(a.registeredAt)} by {store.userName(a.registeredBy)}</dd>
                  </dl>
                </Section>
                <Section title={`Custody Chain (${custodians.length})`} compact>
                  <table className="data"><thead><tr><th>#</th><th>Custodian</th><th>From</th><th>Reference</th></tr></thead>
                    <tbody>{custodians.length === 0 && <tr><td className="empty" colSpan={4}>Never assigned.</td></tr>}
                      {custodians.slice().reverse().map((c, i) => <tr key={c.id}><td>{i + 1}</td><td>{c.who}{i === custodians.length - 1 && a.custodianEmployeeId ? <Status value="Current" /> : ''}</td><td>{fmtDate(c.from)}</td><td className="mono">{c.ref}</td></tr>)}
                    </tbody></table>
                </Section>
              </div>

              <Section title={`Assignments to Employees (${handovers.length})`} compact>
                <table className="data"><thead><tr><th>Reference</th><th>Date</th><th>Employee</th><th>Purpose</th><th>Condition</th><th>Approval</th><th>Acknowledged</th><th>Status</th></tr></thead>
                  <tbody>{handovers.length === 0 && <tr><td className="empty" colSpan={8}>No handovers.</td></tr>}
                    {handovers.map(h => { const it = h.items.find(i => i.assetId === a.id)!; return <tr key={h.id} className="clickable" onClick={() => nav(`/handovers/${h.id}`)}><td className="mono">{h.id}</td><td>{fmtDate(h.date)}</td><td>{store.employeeName(h.employeeId)} <span className="muted small">{store.employee(h.employeeId)?.employeeCode}</span></td><td>{h.purpose}</td><td>{it.condition}</td><td><Status value={h.approval} /> {h.approvedByUserId && <span className="muted small">{store.userName(h.approvedByUserId)}</span>}</td><td>{h.acknowledged ? `${h.employeeSignature} · ${fmtDate(h.acknowledgedAt)}` : '—'}</td><td><Status value={h.status} /></td></tr>; })}
                  </tbody></table>
              </Section>

              <Section title={`Returns (${returns.length})`} compact>
                <table className="data"><thead><tr><th>Reference</th><th>Date</th><th>Returned By</th><th>Condition Reported</th><th>Accessories</th><th>Inspection</th><th>Status</th></tr></thead>
                  <tbody>{returns.length === 0 && <tr><td className="empty" colSpan={7}>No returns.</td></tr>}
                    {returns.map(r => <tr key={r.id} className="clickable" onClick={() => nav('/returns')}><td className="mono">{r.id}</td><td>{fmtDate(r.date)}</td><td>{store.employeeName(r.employeeId)}</td><td>{r.conditionReported}</td><td>{r.accessoriesReturned}</td><td>{r.inspected ? `${r.inspectionOutcome} → ${r.inspectionCondition} (${store.userName(r.inspectedByUserId)}, ${fmtDate(r.inspectionDate)})` : <Status value="Pending Inspection" />}</td><td><Status value={r.status} /></td></tr>)}
                  </tbody></table>
              </Section>

              <Section title={`Transfers (${transfers.length})`} compact>
                <table className="data"><thead><tr><th>Reference</th><th>Date</th><th>From</th><th>To</th><th>Reason</th><th>Approval</th><th>Status</th></tr></thead>
                  <tbody>{transfers.length === 0 && <tr><td className="empty" colSpan={7}>No transfers.</td></tr>}
                    {transfers.map(t => <tr key={t.id} className="clickable" onClick={() => nav('/transfers')}><td className="mono">{t.id}</td><td>{fmtDate(t.date)}</td><td>{store.employeeName(t.fromEmployeeId)}<div className="muted small">{store.deptName(t.fromDepartmentId)} · {store.locName(t.fromLocationId)}</div></td><td>{t.toEmployeeId ? store.employeeName(t.toEmployeeId) : 'Department pool'}<div className="muted small">{store.deptName(t.toDepartmentId)} · {store.locName(t.toLocationId)}</div></td><td>{t.reason}</td><td><Status value={t.approval} /></td><td><Status value={t.status} /></td></tr>)}
                  </tbody></table>
              </Section>

              <Section title={`Repair & Maintenance (${repairs.length})`} compact>
                <table className="data"><thead><tr><th>Reference</th><th>Reported</th><th>Fault</th><th>Vendor</th><th>Est. / Actual Cost</th><th>Completed</th><th>Outcome</th><th>Status</th></tr></thead>
                  <tbody>{repairs.length === 0 && <tr><td className="empty" colSpan={8}>No repairs.</td></tr>}
                    {repairs.map(r => <tr key={r.id} className="clickable" onClick={() => nav('/repairs')}><td className="mono">{r.id}</td><td>{fmtDate(r.reportedDate)}</td><td>{r.faultDescription}</td><td>{r.vendor}</td><td className="num">{fmtMoney(r.estimatedCost)} / {r.actualCost !== undefined ? fmtMoney(r.actualCost) : '—'}</td><td>{r.completionDate ? fmtDate(r.completionDate) : '—'}</td><td>{r.outcome ?? '—'}</td><td><Status value={r.status} /></td></tr>)}
                  </tbody></table>
              </Section>

              <Section title={`Lost / Damaged Reports (${incidents.length})`} compact>
                <table className="data"><thead><tr><th>Reference</th><th>Type</th><th>Date</th><th>Reported By</th><th>Description</th><th>Responsibility</th><th>Resolution</th><th>Status</th></tr></thead>
                  <tbody>{incidents.length === 0 && <tr><td className="empty" colSpan={8}>No incidents.</td></tr>}
                    {incidents.map(i => <tr key={i.id} className="clickable" onClick={() => nav('/incidents')}><td className="mono">{i.id}</td><td><Status value={i.type} /></td><td>{fmtDate(i.incidentDate)}</td><td>{store.employeeName(i.reportedByEmployeeId)}</td><td>{i.description}</td><td>{i.responsibility ?? '—'}</td><td>{i.resolution ?? '—'}</td><td><Status value={i.status} /></td></tr>)}
                  </tbody></table>
              </Section>

              {disposals.length > 0 && (
                <Section title="Retirement & Disposal" compact>
                  <table className="data"><thead><tr><th>Reference</th><th>Retirement Reason</th><th>Retirement</th><th>Disposal Method</th><th>Disposal Date</th><th>Realised Value</th><th>Authorization</th><th>Status</th></tr></thead>
                    <tbody>{disposals.map(d => <tr key={d.id} className="clickable" onClick={() => nav('/disposals')}><td className="mono">{d.id}</td><td>{d.retirementReason}</td><td><Status value={d.retirementApproval} /></td><td>{d.disposalMethod ?? '—'}</td><td>{d.disposalDate ? fmtDate(d.disposalDate) : '—'}</td><td className="num">{d.disposalValue !== undefined ? fmtMoney(d.disposalValue) : '—'}</td><td><Status value={d.disposalApproval} /></td><td><Status value={d.status} /></td></tr>)}</tbody></table>
                </Section>
              )}

              <Section title={`Documents (${docs.length})`} compact>
                <table className="data"><thead><tr><th>Type</th><th>File</th><th>Linked To</th><th>Uploaded</th><th /></tr></thead>
                  <tbody>{docs.length === 0 && <tr><td className="empty" colSpan={5}>No documents attached.</td></tr>}
                    {docs.map(d => <tr key={d.id}><td>{d.documentType}</td><td>{d.attachment.name} <span className="muted small">({fmtSize(d.attachment.size)})</span></td><td className="mono">{d.entityType} {d.entityId}</td><td>{fmtDateTime(d.uploadedAt)} · {store.userName(d.uploadedByUserId)}</td><td><AttachmentLink a={d.attachment} /></td></tr>)}
                  </tbody></table>
              </Section>

              <Section title={`Complete Transaction Timeline (${history.length})`} right={<span className="muted small">Append-only; never edited or deleted.</span>}>
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
            </>
          )}
        </>
      )}
    </>
  );
}
