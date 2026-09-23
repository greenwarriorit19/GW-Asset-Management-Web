import { Fragment } from 'react';
import { parseAccessories, roman } from '../lib/accessories';
import { A4Document, Fields, assetUrl } from '../components/A4Document';
import { fmtDate, fmtDateTime, fmtMoney } from '../components/ui';
import { useStore } from '../data/context';
import type { Asset, Handover, AssetReturn, Transfer, Repair, Incident, Disposal, Employee } from '../data/types';


const ACK = '“I understand that I have received the above listed assets and that they are to be used for solely company related duties. I also understand that I am responsible for maintaining these assets. I understand that upon termination of my employment, I am mandated to return these items to the company. In the absence of this return, the company has the right to withhold my final pay until the return of these assets. By signing this agreement, I acknowledge that I have received these assets from the company in good working conditions and I agree to the terms and conditions.”';

/** Asset rows with each accessory as its own indented sub-row (i, ii, …). */
function AssetItemsTable({ rows }: { rows: { asset?: Asset; assetId: string; condition?: string; quantity?: number; accessories?: string; remarks?: string }[] }) {
  const { store } = useStore();
  return (
    <table className="list">
      <thead><tr><th>#</th><th>Asset ID / Accessories</th><th>Asset Type</th><th>Make and Model</th><th>Serial No</th><th>IMEI No</th><th>SIM No</th><th>Condition</th><th>Qty</th><th>Remarks</th></tr></thead>
      <tbody>
        {rows.map((it, i) => { const a = it.asset ?? store.asset(it.assetId); const acc = parseAccessories(it.accessories); return (
          <Fragment key={it.assetId + i}>
            <tr><td>{i + 1}</td><td><b>{it.assetId}</b></td><td>{store.catName(a?.categoryId)}</td><td>{a ? `${a.manufacturer} ${a.model}` : ''}</td>
              <td>{a?.serialNumber || '—'}</td><td>{a?.imei || '—'}</td><td>{a?.sim || '—'}</td><td>{it.condition ?? a?.condition ?? ''}</td><td>{it.quantity ?? 1}</td><td>{it.remarks ?? ''}</td></tr>
            {acc.map((x, j) => <tr key={j} className="sub"><td>{roman(j + 1)}</td><td>Accessories</td><td>{x.name}</td><td>{x.model}</td><td></td><td></td><td></td><td></td><td>{x.qty}</td><td></td></tr>)}
          </Fragment>); })}
      </tbody>
    </table>
  );
}

/** "K. Anbarasan — Operations Manager" for a user id (designation from the linked employee, else the role name). */
function personWithTitle(store: ReturnType<typeof useStore>['store'], userId?: string) {
  const u = store.user(userId);
  if (!u) return '';
  const title = store.employee(u.employeeId)?.designation ?? store.roleName(u.role);
  return `${u.name} — ${title}`;
}

function AssetBlock({ a }: { a: Asset }) {
  const { store } = useStore();
  return (
    <>
      <h4>Asset Identification</h4>
      <Fields rows={[
        ['Asset ID', a.id], ['Category', store.catName(a.categoryId)],
        ['Asset Name', a.name], ['Manufacturer / Model', `${a.manufacturer} ${a.model}`],
        ['Serial Number', a.serialNumber], ['IMEI / SIM', [a.imei, a.sim].filter(Boolean).join(' / ')],
        ['Current Status', a.status], ['Current Condition', a.condition],
      ]} />
    </>
  );
}

function EmployeeBlock({ e, title = 'Employee Details' }: { e?: Employee; title?: string }) {
  const { store } = useStore();
  return (
    <>
      <h4>{title}</h4>
      <Fields rows={[
        ['Employee Name', e?.name], ['Employee ID', e?.employeeCode],
        ['ERP ID', e?.erpId], ['Designation', e?.designation],
        ['Department', store.deptName(e?.departmentId)], ['Work Location', store.locName(e?.workLocationId)],
        ['Date of Joining', e ? fmtDate(e.dateOfJoining) : ''], ['Mobile Number', e?.mobile],
        ['Email Address', e?.email], ['Employee Status', e ? (e.active ? 'Active' : 'Inactive') : ''],
      ]} />
    </>
  );
}

// 1. Asset Registration Form
export function RegistrationDoc({ asset }: { asset: Asset }) {
  const { store } = useStore();
  const a = asset;
  return (
    <A4Document title="Asset Registration Form" reference={a.id} date={a.registeredAt} qrText={assetUrl(a.id)}
      signatures={[
        { label: 'Registered By', value: store.userName(a.registeredBy), sub: personWithTitle(store, a.registeredBy).split(' — ')[1], date: a.registeredAt },
        { label: 'Verified By (Finance)' },
        { label: 'Approved By', value: a.registrationApprovedBy ? store.userName(a.registrationApprovedBy) : undefined, sub: a.registrationApprovedBy ? personWithTitle(store, a.registrationApprovedBy).split(' — ')[1] : 'Admin / Finance Head' },
      ]}>
      <h4>Asset Identification</h4>
      <Fields rows={[
        ['Asset ID', a.id], ['Asset Category', store.catName(a.categoryId)], ['Asset Name', a.name], ['Manufacturer', a.manufacturer],
        ['Model', a.model], ['Serial Number', a.serialNumber], ['IMEI Number', a.imei], ['SIM Number', a.sim],
        ['Barcode / QR Code', a.barcode], ['Ownership Type', a.ownershipType],
      ]} />
      <h4>Procurement</h4>
      <Fields rows={[
        ['Invoice Number', a.invoiceNumber], ['Purchase Order Number', a.poNumber], ['Purchase Date', fmtDate(a.purchaseDate)],
        ['Purchase Cost', fmtMoney(a.purchaseCost)], ['Warranty Start', fmtDate(a.warrantyStart)], ['Warranty Expiry', fmtDate(a.warrantyExpiry)],
      ]} />
      <h4>Allocation & Status</h4>
      <Fields rows={[
        ['Current Status', a.status], ['Current Condition', a.condition], ['Department', store.deptName(a.departmentId)], ['Assigned Location', store.locName(a.locationId)],
        ['Custodian / Employee', store.employeeName(a.custodianEmployeeId)], ['Employee ID', store.employee(a.custodianEmployeeId)?.employeeCode],
      ]} />
      <h4>Specification & Notes</h4>
      <Fields cols={1} rows={[
        ['Configuration / Technical Specification', a.specification], ['Accessories Included', a.accessories], ['Maintenance Notes', a.maintenanceNotes], ['Remarks', a.remarks],
        ['Attachments', [a.invoiceAttachment && `Invoice: ${a.invoiceAttachment.name}`, a.warrantyAttachment && `Warranty: ${a.warrantyAttachment.name}`, a.photo && `Photo: ${a.photo.name}`].filter(Boolean).join(' · ')],
      ]} />
    </A4Document>
  );
}

// 2. Asset Assignment to Employee Form
export function HandoverDoc({ handover }: { handover: Handover }) {
  const { store } = useStore();
  const h = handover;
  const e = store.employee(h.employeeId);
  return (
    <A4Document title="Asset Assignment to Employee Form" reference={h.id} date={h.date} qrText={`${window.location.origin}${window.location.pathname}#/handovers/${h.id}`}
      acknowledgement={ACK}
      signatures={[
        { label: 'Employee Signature', value: h.employeeSignature, date: h.acknowledgedAt },
        { label: 'Issued By', sub: personWithTitle(store, h.issuedByUserId).split(' — ')[1], date: h.date },
        { label: 'Authorized Signatory', value: h.authorizedSignatoryUserId ? store.userName(h.authorizedSignatoryUserId) : undefined, sub: personWithTitle(store, h.authorizedSignatoryUserId).split(' — ')[1], date: h.acknowledgedAt },
        { label: 'Department Head', value: undefined, sub: store.employee(store.department(store.employee(h.employeeId)?.departmentId)?.headEmployeeId)?.name },
      ]}>
      <EmployeeBlock e={e} />
      <h4>Assignment Details</h4>
      <Fields rows={[
        ['Assignment Reference No', h.id], ['Assigned Date', fmtDate(h.date)],
        ['Issued By', personWithTitle(store, h.issuedByUserId)], ['Status', h.status === 'Rejected' ? 'Cancelled' : h.status],
      ]} />
      <h4>Assets Assigned</h4>
      <AssetItemsTable rows={h.items} />
    </A4Document>
  );
}

// 3. Asset Return Form (includes the Inspection section)
export function ReturnDoc({ ret }: { ret: AssetReturn }) {
  const { store } = useStore();
  const a = store.asset(ret.assetId)!;
  return (
    <A4Document title="Asset Return Form" reference={ret.id} date={ret.date} qrText={assetUrl(a.id)}
      signatures={[
        { label: 'Employee Signature', value: ret.employeeSignature, date: ret.date },
        { label: 'Received By', value: ret.receiverSignature, date: ret.date },
        { label: 'Inspected By', value: ret.inspectedByUserId ? store.userName(ret.inspectedByUserId) : undefined, date: ret.inspectionDate },
        { label: 'Authorized Signatory' },
      ]}>
      <EmployeeBlock e={store.employee(ret.employeeId)} title="Returning Employee" />
      <h4>Return Details</h4>
      <Fields rows={[
        ['Return Reference No', ret.id], ['Return Date', fmtDate(ret.date)], ['Original Assignment Ref', ret.handoverId], ['Received By', personWithTitle(store, ret.receivedByUserId)],
        ['Condition Reported', ret.conditionReported], ['Employee Remarks', ret.employeeRemarks],
      ]} />
      <h4>Assets Returned</h4>
      <AssetItemsTable rows={[{ asset: a, assetId: a.id, condition: ret.conditionReported, quantity: 1, accessories: ret.accessoriesReturned, remarks: ret.employeeRemarks }]} />
      <h4>Inspection Record</h4>
      <Fields rows={[
        ['Inspection Date', ret.inspectionDate ? fmtDate(ret.inspectionDate) : ''], ['Inspected By', ret.inspectedByUserId ? personWithTitle(store, ret.inspectedByUserId) : ''],
        ['Condition on Inspection', ret.inspectionCondition], ['Inspection Outcome', ret.inspectionOutcome],
      ]} />
      <Fields cols={1} rows={[['Inspection Notes', ret.inspectionNotes]]} />
    </A4Document>
  );
}

// 4. Asset Transfer Form
export function TransferDoc({ transfer }: { transfer: Transfer }) {
  const { store } = useStore();
  const t = transfer;
  const a = store.asset(t.assetId)!;
  return (
    <A4Document title="Asset Transfer Form" reference={t.id} date={t.date} qrText={assetUrl(a.id)}
      signatures={[
        { label: 'Releasing Custodian', value: t.status === 'Completed' ? store.employeeName(t.fromEmployeeId) : undefined, date: t.completedAt },
        { label: 'Receiving Custodian', value: t.status === 'Completed' && t.toEmployeeId ? store.employeeName(t.toEmployeeId) : undefined },
        { label: 'Asset Administrator', value: t.status === 'Completed' ? store.userName(t.requestedByUserId) : undefined, date: t.completedAt },
        { label: 'Department Head Approval', value: t.approvedByUserId ? store.userName(t.approvedByUserId) : undefined, date: t.approvedAt },
      ]}>
      <h4>Asset Transferred</h4>
      <AssetItemsTable rows={[{ asset: a, assetId: a.id, condition: t.conditionAtTransfer, quantity: 1, accessories: a.accessories, remarks: '' }]} />
      <h4>Transfer From</h4>
      <Fields rows={[['Custodian', store.employeeName(t.fromEmployeeId)], ['Employee ID', store.employee(t.fromEmployeeId)?.employeeCode], ['Department', store.deptName(t.fromDepartmentId)], ['Location', store.locName(t.fromLocationId)]]} />
      <h4>Transfer To</h4>
      <Fields rows={[['Custodian', t.toEmployeeId ? store.employeeName(t.toEmployeeId) : 'Department pool (no custodian)'], ['Employee ID', store.employee(t.toEmployeeId)?.employeeCode], ['Department', store.deptName(t.toDepartmentId)], ['Location', store.locName(t.toLocationId)]]} />
      <h4>Transfer Details</h4>
      <Fields rows={[
        ['Transfer Reference No', t.id], ['Transfer Date', fmtDate(t.date)], ['Requested By', personWithTitle(store, t.requestedByUserId)], ['Condition at Transfer', t.conditionAtTransfer],
        ['Approved By', t.approvedByUserId ? `${personWithTitle(store, t.approvedByUserId)}${t.approvedAt ? ` (${fmtDate(t.approvedAt)})` : ''}` : 'Pending approval'], ['Approval', t.approval], ['New Assignment Ref', t.newHandoverId], ['Completed On', t.completedAt ? fmtDateTime(t.completedAt) : ''],
      ]} />
      <Fields cols={1} rows={[['Reason for Transfer', t.reason], ['Approver Comments', t.approvalComments]]} />
    </A4Document>
  );
}

// 5. Repair and Maintenance Form
export function RepairDoc({ repair }: { repair: Repair }) {
  const { store } = useStore();
  const r = repair;
  const a = store.asset(r.assetId)!;
  return (
    <A4Document title="Repair and Maintenance Form" reference={r.id} date={r.reportedDate} qrText={assetUrl(a.id)}
      signatures={[
        { label: 'Reported By', value: store.userName(r.reportedByUserId), date: r.reportedDate },
        { label: 'Approved By (Admin / IT Head)', value: r.approvedByUserId ? store.userName(r.approvedByUserId) : undefined },
        { label: 'Inspected By (on completion)', value: r.inspectedByUserId ? store.userName(r.inspectedByUserId) : undefined, date: r.completionDate },
        { label: 'Authorized Signatory' },
      ]}>
      <h4>Asset Sent for Repair</h4>
      <AssetItemsTable rows={[{ asset: a, assetId: a.id, condition: a.condition, quantity: 1, accessories: a.accessories, remarks: r.faultDescription }]} />
      <h4>Fault & Vendor</h4>
      <Fields rows={[
        ['Repair Reference No', r.id], ['Reported Date', fmtDate(r.reportedDate)], ['Vendor / Service Centre', r.vendor], ['Estimated Cost', fmtMoney(r.estimatedCost)],
        ['Expected Return Date', r.expectedReturnDate ? fmtDate(r.expectedReturnDate) : ''], ['Custodian Before Repair', store.employeeName(r.custodianBeforeRepair)], ['Approved By', r.approvedByUserId ? personWithTitle(store, r.approvedByUserId) : 'Pending approval'], ['Status', r.status],
      ]} />
      <Fields cols={1} rows={[['Fault Description', r.faultDescription], ['Quotation', r.quotation?.name]]} />
      <h4>Completion & Inspection</h4>
      <Fields rows={[
        ['Completion Date', r.completionDate ? fmtDate(r.completionDate) : ''], ['Actual Cost', r.actualCost !== undefined ? fmtMoney(r.actualCost) : ''],
        ['Outcome Status', r.outcome], ['Service Report', r.serviceReport?.name],
      ]} />
      <Fields cols={1} rows={[['Work Done', r.workDone], ['Post-repair Inspection Notes', r.inspectionNotes]]} />
    </A4Document>
  );
}

// 6. Lost or Damaged Asset Report
export function IncidentDoc({ incident }: { incident: Incident }) {
  const { store } = useStore();
  const i = incident;
  const a = store.asset(i.assetId)!;
  return (
    <A4Document title={`${i.type} Asset Report`} reference={i.id} date={i.incidentDate} qrText={assetUrl(a.id)}
      signatures={[
        { label: 'Reported By (Employee)', value: store.employeeName(i.reportedByEmployeeId), date: i.incidentDate },
        { label: 'Investigated By (Department Head)', value: i.investigatedByUserId ? store.userName(i.investigatedByUserId) : undefined },
        { label: 'Approved By (Management)', value: i.approvedByUserId ? store.userName(i.approvedByUserId) : undefined, date: i.approvedAt },
        { label: 'Asset Administrator', value: store.userName(i.reportedByUserId), date: i.createdAt },
      ]}>
      <AssetBlock a={a} />
      <EmployeeBlock e={store.employee(i.reportedByEmployeeId)} title="Reporting Employee / Custodian" />
      <h4>Incident Details</h4>
      <Fields rows={[
        ['Incident Reference No', i.id], ['Incident Type', i.type], ['Incident Date', fmtDate(i.incidentDate)], ['Location', i.location],
        ['Police / FIR Reference', i.policeReportNo], ['Status', i.status], ['Approval', i.approval], ['Asset Purchase Value', fmtMoney(a.purchaseCost)],
      ]} />
      <Fields cols={1} rows={[['Description of Incident', i.description]]} />
      <h4>Investigation & Resolution</h4>
      <Fields rows={[['Responsibility', i.responsibility], ['Recovery Action', i.recoveryAction], ['Recovery Amount', i.recoveryAmount !== undefined ? fmtMoney(i.recoveryAmount) : ''], ['Resolution', i.resolution]]} />
      <Fields cols={1} rows={[['Investigation Notes', i.investigationNotes]]} />
    </A4Document>
  );
}

// 8. Retirement and Disposal Approval Form (+ Disposal Certificate)
export function DisposalDoc({ disposal }: { disposal: Disposal }) {
  const { store } = useStore();
  const d = disposal;
  const a = store.asset(d.assetId)!;
  return (
    <A4Document title="Retirement and Disposal Approval Form" reference={d.id} date={d.retirementRequestedAt} qrText={assetUrl(a.id)}
      signatures={[
        { label: 'Recommended By (Asset Administrator)', value: store.userName(d.retirementRequestedByUserId), date: d.retirementRequestedAt },
        { label: 'Retirement Approved By (Management)', value: d.retirementApprovedByUserId ? store.userName(d.retirementApprovedByUserId) : undefined, date: d.retirementApprovedAt },
        { label: 'Disposal Authorized By', value: d.disposalApprovedByUserId ? store.userName(d.disposalApprovedByUserId) : undefined, date: d.disposalApprovedAt },
        { label: 'Finance Acknowledgement' },
      ]}>
      <h4>Asset for Retirement / Disposal</h4>
      <AssetItemsTable rows={[{ asset: a, assetId: a.id, condition: a.condition, quantity: 1, accessories: a.accessories, remarks: d.retirementReason }]} />
      <h4>Asset Value</h4>
      <Fields rows={[['Purchase Date', fmtDate(a.purchaseDate)], ['Purchase Cost', fmtMoney(a.purchaseCost)], ['Invoice No', a.invoiceNumber]]} />
      <h4>Section A — Retirement Approval</h4>
      <Fields rows={[['Requested By', personWithTitle(store, d.retirementRequestedByUserId)], ['Requested On', fmtDateTime(d.retirementRequestedAt)], ['Retirement Approved By', d.retirementApprovedByUserId ? personWithTitle(store, d.retirementApprovedByUserId) : d.retirementApproval], ['Approved On', d.retirementApprovedAt ? fmtDateTime(d.retirementApprovedAt) : '']]} />
      <Fields cols={1} rows={[['Reason for Retirement', d.retirementReason], ['Technical Recommendation', d.technicalRecommendation]]} />
      <h4>Section B — Disposal Certificate</h4>
      <Fields rows={[
        ['Data Securely Erased', d.dataErased === undefined ? '' : d.dataErased ? 'Yes' : 'Not applicable'], ['Erasure Certificate', d.dataErasureCertificate?.name],
        ['Disposal Method', d.disposalMethod], ['Disposal Date', d.disposalDate ? fmtDate(d.disposalDate) : ''],
        ['Disposal Vendor / Recipient', d.disposalVendor], ['Realised Value', d.disposalValue !== undefined ? fmtMoney(d.disposalValue) : ''],
        ['Proof of Disposal', d.disposalProof?.name], ['Disposal Authorized By', d.disposalApprovedByUserId ? personWithTitle(store, d.disposalApprovedByUserId) : d.disposalApproval],
      ]} />
      <Fields cols={1} rows={[['Record Status', d.status]]} />
    </A4Document>
  );
}

// 9. Asset History Report — complete lifecycle of one asset
export function AssetHistoryDoc({ asset }: { asset: Asset }) {
  const { store } = useStore();
  const hist = store.assetHistory(asset.id).slice().reverse();
  return (
    <A4Document title="Asset History Report" reference={asset.id} date={new Date().toISOString()} qrText={assetUrl(asset.id)} filename={`${asset.id}-history`}>
      <AssetBlock a={asset} />
      <Fields rows={[['Custodian', store.employeeName(asset.custodianEmployeeId)], ['Department', store.deptName(asset.departmentId)], ['Location', store.locName(asset.locationId)], ['Purchase Cost', fmtMoney(asset.purchaseCost)]]} />
      <h4>Lifecycle Transactions ({hist.length})</h4>
      <table className="list">
        <thead><tr><th>Date / Time</th><th>Transaction</th><th>Reference</th><th>From → To</th><th>Status</th><th>Condition</th><th>Performed By</th><th>Reason</th></tr></thead>
        <tbody>
          {hist.map(t => (
            <tr key={t.id}>
              <td>{fmtDateTime(t.date)}</td><td>{t.type.replace('_', ' ')}</td><td>{t.reference ?? ''}</td>
              <td>{[t.fromEmployeeId && store.employeeName(t.fromEmployeeId), t.toEmployeeId && store.employeeName(t.toEmployeeId)].filter(Boolean).join(' → ') || (t.toLocationId ? store.locName(t.toLocationId) : '')}</td>
              <td>{t.statusBefore === t.statusAfter ? t.statusAfter : `${t.statusBefore} → ${t.statusAfter}`}</td>
              <td>{t.conditionAfter ?? ''}</td><td>{t.performedByName}</td><td>{t.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </A4Document>
  );
}

// 10. Employee Clearance Report — confirms all assets returned (employee exit)
export function ClearanceDoc({ employee }: { employee: Employee }) {
  const { db, store } = useStore();
  const held = db.assets.filter(a => a.custodianEmployeeId === employee.id);
  const history = db.transactions.filter(t => t.toEmployeeId === employee.id || t.fromEmployeeId === employee.id).sort((a, b) => a.date.localeCompare(b.date));
  const cleared = held.length === 0;
  return (
    <A4Document title="Employee Asset Clearance Report" reference={`GW-CLR-${employee.employeeCode.replace('GW-EMP-', '')}`} date={new Date().toISOString()} filename={`${employee.employeeCode}-clearance`}
      signatures={[{ label: 'Employee', value: undefined }, { label: 'Asset Administrator', value: store.userName(store.currentUser.id) }, { label: 'Department Head' }, { label: 'HR / Authorized Signatory' }]}>
      <EmployeeBlock e={employee} />
      <h4>Clearance Status</h4>
      <Fields rows={[['Assets Currently Held', String(held.length)], ['Clearance', cleared ? 'CLEARED — no company assets outstanding' : 'NOT CLEARED — assets outstanding'], ['Total Value Outstanding', fmtMoney(held.reduce((s, a) => s + a.purchaseCost, 0))], ['Report Generated', fmtDateTime(new Date().toISOString())]]} />
      <h4>Assets Outstanding</h4>
      <table className="list">
        <thead><tr><th>Asset ID</th><th>Asset</th><th>Serial / IMEI</th><th>Condition</th><th>Value</th><th>Issued On</th></tr></thead>
        <tbody>
          {held.length === 0 && <tr><td colSpan={6}>None.</td></tr>}
          {held.map(a => <tr key={a.id}><td>{a.id}</td><td>{a.name}</td><td>{[a.serialNumber, a.imei].filter(Boolean).join(' / ')}</td><td>{a.condition}</td><td>{fmtMoney(a.purchaseCost)}</td><td>{fmtDate(db.transactions.filter(t => t.assetId === a.id && t.toEmployeeId === employee.id).slice(-1)[0]?.date)}</td></tr>)}
        </tbody>
      </table>
      <h4>Custody History</h4>
      <table className="list">
        <thead><tr><th>Date</th><th>Transaction</th><th>Reference</th><th>Asset</th><th>Status</th></tr></thead>
        <tbody>{history.map(t => <tr key={t.id}><td>{fmtDate(t.date)}</td><td>{t.type}</td><td>{t.reference}</td><td>{t.assetId}</td><td>{t.statusAfter}</td></tr>)}</tbody>
      </table>
    </A4Document>
  );
}
