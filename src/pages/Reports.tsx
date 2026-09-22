import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import type { Store } from '../data/store';
import { today, addMonths } from '../data/store';
import type { Database } from '../data/types';
import { PageHead, Section, SearchSelect, fmtDateTime } from '../components/ui';
import { exportRows, type Row } from '../lib/export';

type Report = { key: string; name: string; build: (db: Database, s: Store) => Row[] };

const assetRow = (s: Store) => (a: Database['assets'][number]): Row => ({
  'Asset ID': a.id, Category: s.catName(a.categoryId), Asset: a.name, 'Make / Model': `${a.manufacturer} ${a.model}`, 'Serial No': a.serialNumber, IMEI: a.imei ?? '', SIM: a.sim ?? '',
  Status: a.status, Condition: a.condition, Custodian: s.employeeName(a.custodianEmployeeId), 'Employee ID': s.employee(a.custodianEmployeeId)?.employeeCode ?? '', Department: s.deptName(a.departmentId), Location: s.locName(a.locationId),
  'Purchase Date': a.purchaseDate, 'Purchase Cost': a.purchaseCost, 'Warranty Expiry': a.warrantyExpiry ?? '',
});

export const REPORTS: Report[] = [
  { key: 'register', name: 'Complete Asset Register', build: (db, s) => db.assets.map(assetRow(s)) },
  { key: 'employee', name: 'Employee-Wise Asset Report', build: (db, s) => db.assets.filter(a => a.custodianEmployeeId).sort((a, b) => (a.custodianEmployeeId ?? '').localeCompare(b.custodianEmployeeId ?? '')).map(a => ({ Employee: s.employeeName(a.custodianEmployeeId), 'Employee ID': s.employee(a.custodianEmployeeId)?.employeeCode ?? '', Designation: s.employee(a.custodianEmployeeId)?.designation ?? '', Department: s.deptName(a.departmentId), 'Asset ID': a.id, Asset: a.name, 'Serial / IMEI': [a.serialNumber, a.imei].filter(Boolean).join(' / '), Condition: a.condition, Status: a.status, Value: a.purchaseCost })) },
  { key: 'department', name: 'Department-Wise Asset Report', build: (db, s) => db.departments.flatMap(d => db.assets.filter(a => a.departmentId === d.id).map(a => ({ Department: d.name, ...assetRow(s)(a) }))) },
  { key: 'location', name: 'Location-Wise Asset Report', build: (db, s) => db.locations.flatMap(l => db.assets.filter(a => a.locationId === l.id).map(a => ({ Location: l.name, ...assetRow(s)(a) }))) },
  { key: 'available', name: 'Available Asset Report', build: (db, s) => db.assets.filter(a => a.status === 'Available').map(assetRow(s)) },
  { key: 'assigned', name: 'Assigned Asset Report', build: (db, s) => db.assets.filter(a => ['Assigned', 'Transferred'].includes(a.status)).map(assetRow(s)) },
  { key: 'warranty', name: 'Warranty Expiry Report', build: (db, s) => db.assets.filter(a => a.warrantyExpiry && !['Disposed', 'Retired'].includes(a.status)).sort((a, b) => a.warrantyExpiry!.localeCompare(b.warrantyExpiry!)).map(a => ({ 'Asset ID': a.id, Asset: a.name, Supplier: a.supplierName, 'Warranty Start': a.warrantyStart ?? '', 'Warranty Expiry': a.warrantyExpiry, 'Days Remaining': Math.ceil((new Date(a.warrantyExpiry!).getTime() - Date.now()) / 86400000), Status: a.warrantyExpiry! < today() ? 'Expired' : a.warrantyExpiry! <= addMonths(today(), 1) ? 'Expiring within 30 days' : 'In warranty', Custodian: s.employeeName(a.custodianEmployeeId) })) },
  { key: 'repair', name: 'Repair and Maintenance Report', build: (db, s) => db.repairs.map(r => ({ Reference: r.id, 'Asset ID': r.assetId, Asset: s.asset(r.assetId)?.name ?? '', Reported: r.reportedDate, Fault: r.faultDescription, Vendor: r.vendor, 'Estimated Cost': r.estimatedCost, 'Actual Cost': r.actualCost ?? '', Completion: r.completionDate ?? '', Outcome: r.outcome ?? '', Approval: r.approval, Status: r.status })) },
  { key: 'incident', name: 'Lost and Damaged Asset Report', build: (db, s) => db.incidents.map(i => ({ Reference: i.id, Type: i.type, 'Incident Date': i.incidentDate, 'Asset ID': i.assetId, Asset: s.asset(i.assetId)?.name ?? '', Value: s.asset(i.assetId)?.purchaseCost ?? '', 'Reported By': s.employeeName(i.reportedByEmployeeId), Location: i.location, Responsibility: i.responsibility ?? '', 'Recovery Amount': i.recoveryAmount ?? '', Resolution: i.resolution ?? '', Approval: i.approval, Status: i.status })) },
  { key: 'returnpending', name: 'Return Pending Report', build: (db, s) => [
    ...db.handovers.filter(h => h.status === 'Active' && h.expectedReturnDate && h.expectedReturnDate < today()).flatMap(h => h.items.map(i => ({ Type: 'Overdue return', Reference: h.id, 'Asset ID': i.assetId, Employee: s.employeeName(h.employeeId), 'Expected Return': h.expectedReturnDate ?? '', 'Days Overdue': Math.ceil((Date.now() - new Date(h.expectedReturnDate!).getTime()) / 86400000) }))),
    ...db.returns.filter(r => !r.inspected).map(r => ({ Type: 'Pending inspection', Reference: r.id, 'Asset ID': r.assetId, Employee: s.employeeName(r.employeeId), 'Expected Return': r.date, 'Days Overdue': Math.ceil((Date.now() - new Date(r.date).getTime()) / 86400000) })),
  ] },
  { key: 'retired', name: 'Retired and Disposed Asset Report', build: (db, s) => db.disposals.map(d => ({ Reference: d.id, 'Asset ID': d.assetId, Asset: s.asset(d.assetId)?.name ?? '', 'Purchase Cost': s.asset(d.assetId)?.purchaseCost ?? '', 'Retirement Reason': d.retirementReason, 'Retirement Approval': d.retirementApproval, 'Approved By': s.userName(d.retirementApprovedByUserId), 'Disposal Method': d.disposalMethod ?? '', 'Disposal Date': d.disposalDate ?? '', 'Realised Value': d.disposalValue ?? '', 'Data Erased': d.dataErased === undefined ? '' : d.dataErased ? 'Yes' : 'No', Authorization: d.disposalApproval, Status: d.status })) },
  { key: 'history', name: 'Asset Transaction History', build: (db, s) => db.transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).map(t => ({ 'Date / Time': fmtDateTime(t.date), Transaction: t.type, Reference: t.reference ?? '', 'Asset ID': t.assetId, From: s.employeeName(t.fromEmployeeId), To: s.employeeName(t.toEmployeeId), 'Status Before': t.statusBefore, 'Status After': t.statusAfter, Condition: t.conditionAfter ?? '', 'Performed By': t.performedByName, Reason: t.reason })) },
  { key: 'value', name: 'Asset Value Report', build: (db, s) => db.categories.map(c => { const list = db.assets.filter(a => a.categoryId === c.id); const active = list.filter(a => !['Disposed'].includes(a.status)); return { Category: c.name, 'Total Assets': list.length, 'Active Assets': active.length, 'Purchase Value (Active)': active.reduce((x, a) => x + a.purchaseCost, 0), 'Assigned Value': list.filter(a => a.status === 'Assigned').reduce((x, a) => x + a.purchaseCost, 0), 'Lost / Damaged Value': list.filter(a => ['Lost', 'Damaged'].includes(a.status)).reduce((x, a) => x + a.purchaseCost, 0), 'Disposed Value': list.filter(a => a.status === 'Disposed').reduce((x, a) => x + a.purchaseCost, 0), 'Repair Spend': db.repairs.filter(r => s.asset(r.assetId)?.categoryId === c.id).reduce((x, r) => x + (r.actualCost ?? 0), 0) }; }) },
  { key: 'audit', name: 'Audit Log Report', build: (db) => db.auditLogs.map(l => ({ 'Date / Time': fmtDateTime(l.at), User: l.userName, Role: l.role, Action: l.action, 'Entity Type': l.entityType, Reference: l.entityId, Reason: l.reason, Details: l.details ?? '' })) },
];

export function Reports() {
  const { db, store } = useStore();
  const [sp, setSp] = useSearchParams();
  const key = sp.get('r') ?? 'register';
  const [q, setQ] = useState('');
  const report = REPORTS.find(r => r.key === key) ?? REPORTS[0];
  const rows = useMemo(() => {
    const all = report.build(db, store);
    const s = q.trim().toLowerCase();
    return s ? all.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(s))) : all;
  }, [report, db, store, q]);
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const canExport = store.can('reports.export');
  return (
    <>
      <PageHead crumbs="Governance" title="Reports and Export" actions={canExport && <>
        <button className="btn" onClick={() => exportRows(report.name.replace(/\s+/g, '-'), rows, 'xlsx', report.name)}>Export Excel</button>
        <button className="btn" onClick={() => exportRows(report.name.replace(/\s+/g, '-'), rows, 'csv', report.name)}>Export CSV</button>
        <button className="btn primary" onClick={() => exportRows(report.name.replace(/\s+/g, '-'), rows, 'pdf', report.name)}>Export PDF</button>
        <button className="btn ghost" onClick={() => window.print()}>Print</button>
      </>} />
      <div className="toolbar">
        <SearchSelect className="tb" style={{ minWidth: 300 }} value={report.key} onChange={e => setSp({ r: e.target.value })} options={REPORTS.map(r => ({ value: r.key, label: r.name }))} />
        <input className="grow" placeholder="Filter rows…" value={q} onChange={e => setQ(e.target.value)} />
        <span className="muted small">{rows.length} rows · generated {fmtDateTime(new Date().toISOString())}</span>
      </div>
      <Section title={report.name} compact>
        <div className="table-wrap">
          <table className="data">
            <thead><tr>{keys.map(k => <th key={k} className={typeof rows[0][k] === 'number' ? 'num' : ''}>{k}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td className="empty">No data for this report.</td></tr>}
              {rows.map((r, i) => <tr key={i}>{keys.map(k => <td key={k} className={typeof r[k] === 'number' ? 'num' : ''}>{typeof r[k] === 'number' ? (r[k] as number).toLocaleString('en-IN') : String(r[k] ?? '')}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
