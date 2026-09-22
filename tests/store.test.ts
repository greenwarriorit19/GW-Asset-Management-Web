import { describe, it, expect, beforeEach } from 'vitest';
import { Store, BusinessRuleError, ROLE_PERMISSIONS } from '../src/data/store';
import type { Asset } from '../src/data/types';
import { buildSeed } from './fixtures/demo';

// Users in the demo dataset: U-SA super admin · U-AA asset admin · U-DH-OPS / U-DH-IT dept heads · U-EMP (E-004, OPS) · U-EMP2 (E-006, IT) · U-AUD auditor
let s: Store;
const asAdmin = () => s.switchUser('U-AA');

const newAsset = (over: Partial<Parameters<Store['registerAsset']>[0]> = {}) => {
  asAdmin();
  return s.registerAsset({
    categoryId: 'C-MOB', name: 'Test Phone', manufacturer: 'Samsung', model: 'A16', serialNumber: `SN-${Math.random().toString(36).slice(2, 10)}`,
    ownershipType: 'Company Owned', supplierName: 'Supplier', invoiceNumber: 'INV-1', poNumber: 'PO-1', purchaseDate: '2026-09-01', purchaseCost: 15000,
    condition: 'New', departmentId: 'D-ADM', locationId: 'L-HO', reason: 'New asset received', ...over,
  });
};

/** Full issue: create handover → dept-head approval → employee acknowledgement. Returns handover id. */
const issue = (assetId: string, employeeId = 'E-006', head = 'U-DH-IT', ackUser = 'U-EMP2') => {
  asAdmin();
  const h = s.createHandover({ employeeId, issuedByUserId: 'U-AA', purpose: 'Project work', locationOfUse: 'HO', items: [{ assetId, condition: 'New', quantity: 1, accessories: 'Charger', remarks: '' }], reason: 'Department request approved' });
  s.switchUser(head); s.approveHandover(h.id, true, 'Approved');
  s.switchUser(ackUser); s.acknowledgeHandover(h.id, s.employeeName(employeeId), 'U-SA');
  asAdmin();
  return h.id;
};

beforeEach(() => {
  localStorage.clear();
  s = new Store();
  s.switchUser('U-SA');
  s.importDatabase(buildSeed());
  asAdmin();
});

describe('Live start & master data', () => {
  it('a fresh installation starts empty with master lists and the Super Admin only', () => {
    localStorage.clear();
    const fresh = new Store();
    const db = fresh.getSnapshot();
    expect(db.assets).toHaveLength(0);
    expect(db.employees).toHaveLength(0);
    expect(db.users).toHaveLength(1);
    expect(db.users[0].role).toBe('super_admin');
    expect(db.departments.length).toBeGreaterThan(0);
    expect(db.categories.length).toBeGreaterThan(0);
    expect(db.auditLogs[0].action).toBe('DATABASE_INITIALISED');
  });
  it('a backup can be restored and the database reset to empty again', () => {
    expect(s.getSnapshot().assets.length).toBe(26);
    expect(() => s.importDatabase('{"users":[]}')).toThrow(/permit/);       // asset admin cannot restore
    s.switchUser('U-SA');
    expect(() => s.importDatabase('{"users":[]}')).toThrow(/not valid|Super Admin/);
    s.startEmpty();
    expect(s.getSnapshot().assets.length).toBe(0);
    expect(s.nextAssetId('C-MOB')).toBe('GW-AST-MOB-0001');
  });
});

describe('Rule 1 & 2 — unique Asset ID, duplicate serial / IMEI / SIM', () => {
  it('generates sequential IDs per category', () => {
    expect(newAsset().id).toBe('GW-AST-MOB-0007');
    expect(newAsset().id).toBe('GW-AST-MOB-0008');
    expect(newAsset({ categoryId: 'C-LAP' }).id).toBe('GW-AST-LAP-0007');
  });
  it('rejects duplicate serial (case-insensitive), IMEI and SIM', () => {
    expect(() => newAsset({ serialNumber: 'r58x3a1b2c01' })).toThrow(/Serial number/);
    expect(() => newAsset({ imei: '356938035643801' })).toThrow(/IMEI/);
    expect(() => newAsset({ sim: '8991100012345601' })).toThrow(/SIM/);
  });
  it('registration is Available, writes a REGISTRATION transaction, audit entry and pending approval', () => {
    const a = newAsset();
    expect(a.status).toBe('Available');
    expect(s.assetHistory(a.id).map(t => t.type)).toEqual(['REGISTRATION']);
    expect(s.getSnapshot().auditLogs[0]).toMatchObject({ action: 'ASSET_REGISTERED', entityId: a.id, userId: 'U-AA' });
    expect(s.getSnapshot().approvals.find(x => x.entityId === a.id)).toMatchObject({ entityType: 'Registration', decision: 'Pending Approval' });
  });
  it('edit keeps status/custodian untouched and needs a reason', () => {
    const a = newAsset();
    expect(() => s.updateAsset(a.id, { name: 'X' }, '')).toThrow(/reason/i);
    s.updateAsset(a.id, { name: 'Renamed', status: 'Disposed', custodianEmployeeId: 'E-001' } as Partial<Asset>, 'Correction');
    expect(s.asset(a.id)).toMatchObject({ name: 'Renamed', status: 'Available' });
    expect(s.asset(a.id)!.custodianEmployeeId).toBeUndefined();
    expect(s.assetHistory(a.id)[0].type).toBe('UPDATE');
  });
});

describe('Rules 3, 4, 7 — handover', () => {
  it('only Available assets can be issued', () => {
    expect(() => s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', purpose: 'p', locationOfUse: 'x', items: [{ assetId: 'GW-AST-MOB-0001', condition: 'Good', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' })).toThrow(/Rule 4/);
  });
  it('reserves on submission, blocks a second issue, releases on rejection', () => {
    const a = newAsset();
    const h = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', purpose: 'p', locationOfUse: 'x', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' });
    expect(s.asset(a.id)!.status).toBe('Reserved');
    expect(() => s.createHandover({ employeeId: 'E-004', issuedByUserId: 'U-AA', purpose: 'p', locationOfUse: 'x', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' })).toThrow(/Rule 4/);
    s.switchUser('U-DH-IT'); s.approveHandover(h.id, false, 'Not required');
    expect(s.asset(a.id)!.status).toBe('Available');
    expect(s.getSnapshot().handovers.find(x => x.id === h.id)!.status).toBe('Rejected');
  });
  it('department head can only approve own department', () => {
    const a = newAsset();
    const h = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', purpose: 'p', locationOfUse: 'x', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' });
    s.switchUser('U-DH-OPS');
    expect(() => s.approveHandover(h.id, true, 'ok')).toThrow(/own department/);
  });
  it('asset becomes Assigned only after the employee signs; custodian/department/location follow the employee', () => {
    const a = newAsset();
    const h = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', purpose: 'p', locationOfUse: 'x', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' });
    s.switchUser('U-DH-IT'); s.approveHandover(h.id, true, 'ok');
    expect(s.asset(a.id)!.status).toBe('Reserved');
    s.switchUser('U-EMP');                       // a different employee
    expect(() => s.acknowledgeHandover(h.id, 'S. Karthik', 'U-SA')).toThrow(/receiving employee/);
    s.switchUser('U-EMP2');
    expect(() => s.acknowledgeHandover(h.id, '   ', 'U-SA')).toThrow(/signature/);
    s.acknowledgeHandover(h.id, 'V. Lakshmi', 'U-SA');
    expect(s.asset(a.id)).toMatchObject({ status: 'Assigned', custodianEmployeeId: 'E-006', departmentId: 'D-IT', locationId: 'L-HO' });
    expect(s.getSnapshot().handovers.find(x => x.id === h.id)).toMatchObject({ status: 'Active', acknowledged: true, employeeSignature: 'V. Lakshmi' });
  });
  it('inactive employee cannot receive assets', () => {
    s.switchUser('U-SA');
    const e = s.getSnapshot().employees.find(x => x.id === 'E-006')!;
    s.saveEmployee({ ...e, active: false });
    const a = newAsset();
    expect(() => s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', purpose: 'p', locationOfUse: 'x', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' })).toThrow(/active employee/);
  });
});

describe('Rule 8 — return and inspection', () => {
  it('return goes to Under Inspection, releases custody and closes the handover', () => {
    const a = newAsset(); const h = issue(a.id);
    const r = s.createReturn({ assetId: a.id, conditionReported: 'Good', accessoriesReturned: 'Charger', employeeSignature: 'V. Lakshmi', reason: 'Project ended' });
    expect(r.handoverId).toBe(h);
    expect(s.asset(a.id)).toMatchObject({ status: 'Under Inspection', custodianEmployeeId: undefined });
    expect(s.getSnapshot().handovers.find(x => x.id === h)!.status).toBe('Closed');
    expect(() => s.createReturn({ assetId: a.id, conditionReported: 'Good', accessoriesReturned: '', employeeSignature: 'x', reason: 'again' })).toThrow(/Assigned/);
  });
  it('inspection outcomes: Acceptable → Available, Faulty → Under Repair, Damaged → Damaged + auto incident', () => {
    const outcomes: Array<['Acceptable' | 'Faulty' | 'Damaged', string]> = [['Acceptable', 'Available'], ['Faulty', 'Under Repair'], ['Damaged', 'Damaged']];
    for (const [outcome, status] of outcomes) {
      const a = newAsset(); issue(a.id);
      const r = s.createReturn({ assetId: a.id, conditionReported: 'Good', accessoriesReturned: '', employeeSignature: 'V. Lakshmi', reason: 'Returned' });
      s.inspectReturn(r.id, { inspectionCondition: outcome === 'Acceptable' ? 'Good' : 'Damaged', inspectionOutcome: outcome, inspectionNotes: 'checked', reason: 'Inspection done' });
      expect(s.asset(a.id)!.status).toBe(status);
      if (outcome === 'Damaged') expect(s.getSnapshot().incidents.find(i => i.assetId === a.id)).toMatchObject({ type: 'Damaged', reportedByEmployeeId: 'E-006', status: 'Reported' });
    }
  });
  it('an inspected return cannot be inspected twice', () => {
    const a = newAsset(); issue(a.id);
    const r = s.createReturn({ assetId: a.id, conditionReported: 'Good', accessoriesReturned: '', employeeSignature: 'x', reason: 'Returned' });
    s.inspectReturn(r.id, { inspectionCondition: 'Good', inspectionOutcome: 'Acceptable', inspectionNotes: 'ok', reason: 'Inspection done' });
    expect(() => s.inspectReturn(r.id, { inspectionCondition: 'Good', inspectionOutcome: 'Acceptable', inspectionNotes: 'ok', reason: 'again' })).toThrow(/already/);
  });
});

describe('Transfer', () => {
  it('request → approval → completion creates a fresh handover; history keeps both custodians', () => {
    const a = newAsset(); issue(a.id);
    const t = s.requestTransfer({ assetId: a.id, toEmployeeId: 'E-004', toDepartmentId: 'D-OPS', toLocationId: 'L-PM', reason: 'Needed in field', conditionAtTransfer: 'Good' });
    expect(() => s.requestTransfer({ assetId: a.id, toEmployeeId: 'E-004', toDepartmentId: 'D-OPS', toLocationId: 'L-PM', reason: 'dup', conditionAtTransfer: 'Good' })).toThrow(/already pending/);
    expect(() => s.completeTransfer(t.id, 'too early')).toThrow(/approved/);
    s.switchUser('U-DH-OPS'); s.approveTransfer(t.id, true, 'Approved');
    asAdmin(); const ho2 = s.completeTransfer(t.id, 'Handed over at HO')!;
    expect(s.asset(a.id)).toMatchObject({ status: 'Transferred', custodianEmployeeId: undefined, departmentId: 'D-OPS', locationId: 'L-PM' });
    s.switchUser('U-EMP'); s.acknowledgeHandover(ho2, 'S. Karthik', 'U-SA');
    expect(s.asset(a.id)).toMatchObject({ status: 'Assigned', custodianEmployeeId: 'E-004' });
    const custodians = s.assetHistory(a.id).filter(x => x.type === 'HANDOVER').map(x => x.toEmployeeId);
    expect(custodians).toEqual(['E-004', 'E-006']);
    expect(s.getSnapshot().handovers.filter(h => h.items.some(i => i.assetId === a.id) && h.status === 'Closed')).toHaveLength(1);
  });
  it('transfer to a department pool leaves the asset Available with no custodian', () => {
    const a = newAsset(); issue(a.id);
    const t = s.requestTransfer({ assetId: a.id, toDepartmentId: 'D-OPS', toLocationId: 'L-WS', reason: 'Pool stock', conditionAtTransfer: 'Good' });
    s.switchUser('U-DH-OPS'); s.approveTransfer(t.id, true, 'ok'); asAdmin(); s.completeTransfer(t.id, 'done');
    expect(s.asset(a.id)).toMatchObject({ status: 'Available', custodianEmployeeId: undefined, departmentId: 'D-OPS' });
  });
  it('an employee can only request transfer of their own assets', () => {
    s.switchUser('U-EMP2');
    expect(() => s.requestTransfer({ assetId: 'GW-AST-MOB-0001', toEmployeeId: 'E-006', toDepartmentId: 'D-IT', toLocationId: 'L-HO', reason: 'want it', conditionAtTransfer: 'Good' })).toThrow(/assigned to you/);
  });
});

describe('Repair', () => {
  it('open → approve → complete; Assigned outcome restores the custodian; cost noted in maintenance log', () => {
    const a = newAsset(); issue(a.id);
    const r = s.openRepair({ assetId: a.id, faultDescription: 'Screen', vendor: 'V', estimatedCost: 2000, reason: 'Fault reported' });
    expect(s.asset(a.id)!.status).toBe('Under Repair');
    expect(() => s.openRepair({ assetId: a.id, faultDescription: 'x', vendor: 'V', estimatedCost: 1, reason: 'dup' })).toThrow(/open repair already/);
    s.switchUser('U-DH-IT'); s.approveRepair(r.id, true, 'ok');
    asAdmin(); s.completeRepair(r.id, { actualCost: 1800, completionDate: '2026-09-22', workDone: 'Screen replaced', inspectionNotes: 'ok', outcome: 'Assigned', conditionAfter: 'Good', reason: 'Repair complete' });
    expect(s.asset(a.id)).toMatchObject({ status: 'Assigned', custodianEmployeeId: 'E-006', condition: 'Good' });
    expect(s.asset(a.id)!.maintenanceNotes).toContain('₹1800');
  });
  it('Retired outcome opens a pre-approved retirement record', () => {
    const a = newAsset();
    const r = s.openRepair({ assetId: a.id, faultDescription: 'Dead', vendor: 'V', estimatedCost: 9000, reason: 'Fault' });
    s.switchUser('U-DH-IT'); s.approveRepair(r.id, true, 'ok'); asAdmin();
    s.completeRepair(r.id, { actualCost: 0, completionDate: '2026-09-22', workDone: 'Not repairable', inspectionNotes: 'BER', outcome: 'Retired', conditionAfter: 'Not Working', reason: 'Beyond economic repair' });
    expect(s.asset(a.id)!.status).toBe('Retired');
    expect(s.getSnapshot().disposals.find(d => d.assetId === a.id)).toMatchObject({ status: 'Retired', retirementApproval: 'Approved' });
  });
  it('cannot send Lost / Retired / Disposed assets for repair', () => {
    expect(() => s.openRepair({ assetId: 'GW-AST-MOB-0005', faultDescription: 'x', vendor: 'V', estimatedCost: 1, reason: 'test' })).toThrow(/Lost/);
    expect(() => s.openRepair({ assetId: 'GW-AST-FUR-0002', faultDescription: 'x', vendor: 'V', estimatedCost: 1, reason: 'test' })).toThrow(/Disposed/);
  });
});

describe('Rule 9 — lost / damaged', () => {
  it('employee may report only own assets; report sets status and opens an approval', () => {
    s.switchUser('U-EMP2');
    expect(() => s.openIncident({ assetId: 'GW-AST-MOB-0001', type: 'Lost', incidentDate: '2026-09-22', reportedByEmployeeId: 'E-006', location: 'x', description: 'y', reason: 'zzz' })).toThrow(/assigned to you/);
    const inc = s.openIncident({ assetId: 'GW-AST-LAP-0002', type: 'Damaged', incidentDate: '2026-09-22', reportedByEmployeeId: 'E-006', location: 'HO', description: 'Cracked', reason: 'Dropped' });
    expect(s.asset('GW-AST-LAP-0002')).toMatchObject({ status: 'Damaged', condition: 'Damaged', custodianEmployeeId: 'E-006' });
    expect(s.getSnapshot().approvals.find(x => x.entityId === inc.id)).toMatchObject({ approverRole: 'dept_head', decision: 'Pending Approval' });
  });
  it('investigation then approval applies the resolution (Repair keeps custody; Written Off retires)', () => {
    const a = newAsset(); issue(a.id);
    const inc = s.openIncident({ assetId: a.id, type: 'Damaged', incidentDate: '2026-09-22', reportedByEmployeeId: 'E-006', location: 'HO', description: 'Cracked', reason: 'Dropped' });
    s.switchUser('U-DH-IT');
    expect(() => s.approveIncident(inc.id, true, 'skip')).toThrow(/awaiting approval/);
    s.investigateIncident(inc.id, { investigationNotes: 'Accidental', responsibility: 'None', recoveryAction: 'None', resolution: 'Repair', reason: 'Reviewed' });
    s.approveIncident(inc.id, true, 'Proceed');
    expect(s.asset(a.id)).toMatchObject({ status: 'Under Repair', custodianEmployeeId: 'E-006' });
    expect(s.getSnapshot().incidents.find(i => i.id === inc.id)!.status).toBe('Closed');

    const b = newAsset(); issue(b.id);
    asAdmin(); const inc2 = s.openIncident({ assetId: b.id, type: 'Lost', incidentDate: '2026-09-22', reportedByEmployeeId: 'E-006', location: 'Field', description: 'Missing', policeReportNo: 'FIR-1', reason: 'Lost on duty' });
    s.switchUser('U-DH-IT');
    s.investigateIncident(inc2.id, { investigationNotes: 'Not recoverable', responsibility: 'Employee', recoveryAction: 'Salary recovery', recoveryAmount: 5000, resolution: 'Written Off', reason: 'Reviewed' });
    s.approveIncident(inc2.id, true, 'Write off');
    expect(s.asset(b.id)).toMatchObject({ status: 'Retired', custodianEmployeeId: undefined });
    expect(s.getSnapshot().disposals.find(d => d.assetId === b.id)?.status).toBe('Retired');
  });
});

describe('Rule 10 — retirement and disposal', () => {
  it('needs management approval, then proof, then authorization; history survives disposal', () => {
    const a = newAsset();
    const d = s.startRetirement({ assetId: a.id, retirementReason: 'Obsolete', reason: 'End of life' });
    expect(() => s.startRetirement({ assetId: a.id, retirementReason: 'x', reason: 'again' })).toThrow(/already exists/);
    expect(() => s.recordDisposal(d.id, { dataErased: true, disposalMethod: 'Scrap', disposalDate: '2026-09-22', disposalProof: { name: 'r.pdf', type: 'application/pdf', size: 1 }, reason: 'scrap' })).toThrow(/Retired before/);
    s.switchUser('U-SA'); s.approveRetirement(d.id, true, 'Approved');
    expect(s.asset(a.id)!.status).toBe('Retired');
    asAdmin();
    expect(() => s.recordDisposal(d.id, { dataErased: true, disposalMethod: 'Scrap', disposalDate: '2026-09-22', reason: 'scrapped' })).toThrow(/Rule 10/);
    s.recordDisposal(d.id, { dataErased: true, disposalMethod: 'Scrap', disposalDate: '2026-09-22', disposalValue: 200, disposalProof: { name: 'r.pdf', type: 'application/pdf', size: 1 }, reason: 'scrapped' });
    expect(s.getSnapshot().documents.find(x => x.entityId === d.id)?.documentType).toBe('Proof of Disposal');
    expect(() => s.approveDisposal(d.id, true, 'ok')).toThrow(/permit/);        // asset admin cannot authorize
    s.switchUser('U-SA'); s.approveDisposal(d.id, true, 'Authorized');
    expect(s.asset(a.id)!.status).toBe('Disposed');
    expect(s.assetHistory(a.id).map(t => t.type)).toEqual(['DISPOSAL', 'RETIREMENT', 'REGISTRATION']);
  });
  it('rejected retirement leaves the asset in service', () => {
    const a = newAsset();
    const d = s.startRetirement({ assetId: a.id, retirementReason: 'Obsolete', reason: 'End of life' });
    s.switchUser('U-SA'); s.approveRetirement(d.id, false, 'Still usable');
    expect(s.asset(a.id)!.status).toBe('Available');
    expect(s.getSnapshot().disposals.find(x => x.id === d.id)!.status).toBe('Rejected');
  });
});

describe('Rules 5, 6, 11 — transactions, immutability, audit', () => {
  it('every action appends a transaction and an audit entry with user, time and reason', () => {
    const a = newAsset();
    const before = s.getSnapshot().transactions.length;
    issue(a.id);
    s.createReturn({ assetId: a.id, conditionReported: 'Good', accessoriesReturned: '', employeeSignature: 'x', reason: 'Returned' });
    const tx = s.getSnapshot().transactions.slice(before);
    expect(tx.map(t => t.type)).toEqual(['STATUS_CHANGE', 'HANDOVER', 'RETURN']);
    for (const t of tx) { expect(t.performedByUserId).toBeTruthy(); expect(t.date).toMatch(/^\d{4}-/); expect(t.reason.length).toBeGreaterThan(2); }
    const audit = s.getSnapshot().auditLogs.slice(0, 5).map(l => l.action);
    expect(audit).toContain('RETURN_CREATED'); expect(audit).toContain('HANDOVER_ACKNOWLEDGED'); expect(audit).toContain('HANDOVER_APPROVED');
    for (const l of s.getSnapshot().auditLogs.slice(0, 5)) { expect(l.userName).toBeTruthy(); expect(l.role).toBeTruthy(); expect(l.reason).toBeTruthy(); }
  });
  it('the store exposes no way to edit or delete history', () => {
    const proto = Object.getOwnPropertyNames(Store.prototype);
    // Only master-data deletes exist (and those refuse when history references the record). Never for history tables.
    expect(proto.filter(m => /^(delete|remove)/i.test(m)).sort()).toEqual(['deleteCategory', 'deleteDepartment', 'deleteEmployee', 'deleteLocation', 'deleteRole', 'deleteUser']);
    expect(proto.some(m => /(delete|remove).*(transaction|audit|handover|return|transfer|repair|incident|disposal|asset)/i.test(m))).toBe(false);
    expect(proto.filter(m => /(edit|update|set|delete|remove).*transaction|transaction.*(edit|update|set|delete|remove)/i.test(m))).toEqual([]);
  });
  it('a reason is mandatory on every action (Rule 11)', () => {
    const a = newAsset();
    expect(() => s.openRepair({ assetId: a.id, faultDescription: 'x', vendor: 'V', estimatedCost: 1, reason: 'ok' })).toThrow(BusinessRuleError);
    expect(() => s.startRetirement({ assetId: a.id, retirementReason: 'x', reason: '' })).toThrow(/reason/i);
  });
});

describe('Reference numbering', () => {
  it('uses GW-XX-YYYYMM-0001 and increments within the month', () => {
    const ym = new Date(); const period = `${ym.getFullYear()}${String(ym.getMonth() + 1).padStart(2, '0')}`;
    const a = newAsset(); const b = newAsset();
    const h1 = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', purpose: 'p', locationOfUse: 'x', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'req one' });
    const h2 = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', purpose: 'p', locationOfUse: 'x', items: [{ assetId: b.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'req two' });
    expect(h1.id).toBe(`GW-HO-${period}-0001`); expect(h2.id).toBe(`GW-HO-${period}-0002`);
    expect(s.nextRef('RT', s.getSnapshot().returns)).toMatch(/^GW-RT-\d{6}-\d{4}$/);
    expect(s.nextRef('INC', s.getSnapshot().incidents)).toMatch(/^GW-INC-\d{6}-\d{4}$/);
    expect(s.nextRef('DSP', s.getSnapshot().disposals)).toMatch(/^GW-DSP-\d{6}-\d{4}$/);
  });
});

describe('Roles and permissions', () => {
  it('auditor is read-only', () => {
    s.switchUser('U-AUD');
    expect(() => s.registerAsset({} as never)).toThrow(/permit/);
    expect(s.can('reports.view')).toBe(true); expect(s.can('audit.view')).toBe(true); expect(s.can('asset.register')).toBe(false);
    expect(s.visibleAssets().length).toBe(26);
  });
  it('employee sees only own assets; department head only own department', () => {
    s.switchUser('U-EMP2');
    expect(s.visibleAssets().every(a => a.custodianEmployeeId === 'E-006')).toBe(true);
    expect(s.visibleAssets().length).toBeGreaterThan(0);
    s.switchUser('U-DH-OPS');
    expect(s.visibleAssets().every(a => a.departmentId === 'D-OPS')).toBe(true);
    expect(() => s.registerAsset({} as never)).toThrow(/permit/);
  });
  it('permission matrix matches the specification', () => {
    expect(ROLE_PERMISSIONS.super_admin).toContain('users.manage');
    expect(ROLE_PERMISSIONS.asset_admin).not.toContain('handover.approve');
    expect(ROLE_PERMISSIONS.asset_admin).not.toContain('disposal.approve');
    expect(ROLE_PERMISSIONS.dept_head).toEqual(expect.arrayContaining(['handover.approve', 'transfer.approve', 'incident.approve']));
    expect(ROLE_PERMISSIONS.employee).toEqual(expect.arrayContaining(['handover.acknowledge', 'incident.report', 'return.request', 'transfer.request']));
    expect(ROLE_PERMISSIONS.employee).not.toContain('asset.register');
    expect(ROLE_PERMISSIONS.auditor.every(p => !/create|register|edit|approve|record|upload|manage|perform|complete|inspect|request|\.report$/.test(p))).toBe(true);
  });
  it('users and master data can be managed by Super Admin only', () => {
    expect(() => s.saveCategory({ id: 'C-X', code: 'PRN', name: 'Printer', verificationIntervalMonths: 6 })).toThrow(/permit/);
    s.switchUser('U-SA');
    s.saveCategory({ id: 'C-X', code: 'PRN', name: 'Printer', verificationIntervalMonths: 6 });
    expect(s.nextAssetId('C-X')).toBe('GW-AST-PRN-0001');
    s.saveUser({ id: 'U-NEW', name: 'New', email: 'new@gw.in', role: 'employee', active: true });
    expect(s.getSnapshot().users.find(u => u.id === 'U-NEW')).toBeTruthy();
  });
});

describe('Dashboard metrics', () => {
  it('counts agree with the asset register', () => {
    const m = s.metrics(); const assets = s.getSnapshot().assets;
    expect(m.total).toBe(assets.length);
    expect(m.available).toBe(assets.filter(a => a.status === 'Available').length);
    expect(m.assigned).toBe(assets.filter(a => ['Assigned', 'Transferred'].includes(a.status)).length);
    expect(m.disposed).toBe(assets.filter(a => a.status === 'Disposed').length);
    expect(m.totalValue).toBe(assets.filter(a => a.status !== 'Disposed').reduce((x, a) => x + a.purchaseCost, 0));
    expect(m.byCategory.reduce((x, c) => x + c.value, 0)).toBe(assets.length);
    expect(m.byDepartment.reduce((x, c) => x + c.value, 0)).toBe(assets.length);
  });
});

describe('Documents', () => {
  it('uploads are linked to the asset and audited; Drive links are preserved', () => {
    s.uploadDocument({ assetId: 'GW-AST-MOB-0001', entityType: 'Asset', entityId: 'GW-AST-MOB-0001', documentType: 'Photograph', attachment: { name: 'p.jpg', type: 'image/jpeg', size: 10, driveId: 'abc', url: 'https://drive.google.com/file/d/abc/view' } });
    const d = s.getSnapshot().documents.find(x => x.attachment.driveId === 'abc')!;
    expect(d).toMatchObject({ assetId: 'GW-AST-MOB-0001', documentType: 'Photograph', uploadedByUserId: 'U-AA' });
    expect(s.getSnapshot().auditLogs[0].action).toBe('DOCUMENT_UPLOADED');
    s.switchUser('U-AUD');
    expect(() => s.uploadDocument({ entityType: 'Asset', entityId: 'x', documentType: 'Other', attachment: { name: 'a', type: 't', size: 1 } })).toThrow(/permit/);
  });
});

describe('Persistence', () => {
  it('state survives a reload (new Store instance reads the same data)', () => {
    const a = newAsset();
    const again = new Store();
    expect(again.asset(a.id)?.name).toBe('Test Phone');
    expect(again.currentUser.id).toBe('U-AA');
  });
});

describe('Deleting users and employees', () => {
  it('an employee with no history can be deleted; one with asset history cannot (deactivate instead)', () => {
    s.switchUser('U-SA');
    s.saveEmployee({ id: 'E-NEW', employeeCode: 'GW-EMP-0099', name: 'Temp Person', designation: 'Helper', departmentId: 'D-OPS', dateOfJoining: '2026-09-01', workLocationId: 'L-PM', mobile: '', email: '', active: true });
    expect(s.employeeDeleteBlockers('E-NEW')).toEqual([]);
    s.deleteEmployee('E-NEW', 'Entered by mistake');
    expect(s.employee('E-NEW')).toBeUndefined();
    expect(s.getSnapshot().auditLogs[0].action).toBe('EMPLOYEE_DELETED');
    // E-004 holds assets and has handovers
    expect(s.employeeDeleteBlockers('E-004').length).toBeGreaterThan(0);
    expect(() => s.deleteEmployee('E-004', 'cleanup')).toThrow(/Cannot delete/);
    expect(s.employee('E-004')).toBeTruthy();
  });
  it('a user with activity cannot be deleted; the signed-in user and last Super Admin are protected', () => {
    s.switchUser('U-SA');
    s.saveUser({ id: 'U-TMP', name: 'Temp Login', email: 'tmp@gw.in', role: 'employee', active: true });
    expect(s.userDeleteBlockers('U-TMP')).toEqual([]);
    s.deleteUser('U-TMP', 'Duplicate login');
    expect(s.user('U-TMP')).toBeUndefined();
    expect(() => s.deleteUser('U-AA', 'cleanup')).toThrow(/Cannot delete/);     // has transactions
    expect(() => s.deleteUser('U-SA', 'cleanup')).toThrow(/signed in/);
    s.switchUser('U-AA');
    expect(() => s.deleteUser('U-AUD', 'cleanup')).toThrow(/permit/);           // asset admin lacks users.manage
  });
});

describe('Custom roles', () => {
  it('a custom role can be created, assigned, enforced, edited and deleted', () => {
    s.switchUser('U-SA');
    const r = s.saveRole({ code: '', name: 'Store Keeper', description: 'Issues and receives assets', permissions: ['asset.view_all', 'handover.create', 'return.create'], builtIn: false }, 'New role');
    expect(r.code).toBe('store_keeper');
    s.saveUser({ id: 'U-SK', name: 'Store Keeper One', email: 'sk@gw.in', role: 'store_keeper', active: true });
    s.switchUser('U-SK');
    expect(s.can('handover.create')).toBe(true);
    expect(s.can('asset.register')).toBe(false);
    expect(() => s.registerAsset({} as never)).toThrow(/permit/);
    expect(s.visibleAssets().length).toBe(26);
    s.switchUser('U-SA');
    expect(() => s.deleteRole('store_keeper', 'cleanup')).toThrow(/assigned to 1 user/);
    s.saveRole({ ...r, permissions: ['asset.view_own'] }, 'Reduced');
    s.switchUser('U-SK'); expect(s.can('handover.create')).toBe(false);
    s.switchUser('U-SA'); s.saveUser({ id: 'U-SK', name: 'Store Keeper One', email: 'sk@gw.in', role: 'employee', active: true });
    s.deleteRole('store_keeper', 'No longer needed');
    expect(s.roleDef('store_keeper')).toBeUndefined();
  });
  it('super_admin cannot be modified; built-in roles cannot be deleted; unknown role rejected on user', () => {
    s.switchUser('U-SA');
    expect(() => s.saveRole({ code: 'super_admin', name: 'X', permissions: ['audit.view'], builtIn: true })).toThrow(/cannot be modified/);
    expect(() => s.deleteRole('employee', 'cleanup')).toThrow(/built-in/);
    expect(() => s.saveUser({ id: 'U-X', name: 'X', email: 'x@gw.in', role: 'ghost', active: true })).toThrow(/valid role/);
    s.switchUser('U-AA');
    expect(() => s.saveRole({ code: 'x', name: 'X', permissions: ['audit.view'], builtIn: false })).toThrow(/permit/);
  });
  it('old saved data with plain role codes is migrated to role definitions', () => {
    const raw = JSON.parse(localStorage.getItem('gw-asset-management-db-v1')!);
    raw.roles = ['super_admin', 'asset_admin', 'dept_head', 'employee', 'auditor'];
    localStorage.setItem('gw-asset-management-db-v1', JSON.stringify(raw));
    const again = new Store();
    expect(again.roleDef('dept_head')?.permissions).toContain('handover.approve');
    again.switchUser('U-EMP'); expect(again.can('handover.acknowledge')).toBe(true);
  });
});

describe('Departments, locations, categories — create / edit / delete', () => {
  it('department: create, rename, duplicate code rejected, delete only when unused', () => {
    s.switchUser('U-SA');
    s.saveDepartment({ id: 'D-QA', code: 'QA', name: 'Quality Assurance' });
    expect(s.deptName('D-QA')).toBe('Quality Assurance');
    expect(() => s.saveDepartment({ id: 'D-X', code: 'qa', name: 'Dup' })).toThrow(/already exists/);
    s.saveDepartment({ id: 'D-QA', code: 'QA', name: 'Quality & Audit' });
    expect(s.deptName('D-QA')).toBe('Quality & Audit');
    expect(s.departmentDeleteBlockers('D-QA')).toEqual([]);
    s.deleteDepartment('D-QA', 'Not needed');
    expect(s.department('D-QA')).toBeUndefined();
    expect(s.departmentDeleteBlockers('D-OPS').length).toBeGreaterThan(0);
    expect(() => s.deleteDepartment('D-OPS', 'cleanup')).toThrow(/Cannot delete Operations/);
    s.switchUser('U-AA');
    expect(() => s.deleteDepartment('D-HR', 'cleanup')).toThrow(/permit/);
  });
  it('location and category deletes are blocked while referenced', () => {
    s.switchUser('U-SA');
    s.saveLocation({ id: 'L-TMP', code: 'TMP', name: 'Temporary Store' });
    s.deleteLocation('L-TMP', 'Closed');
    expect(s.location('L-TMP')).toBeUndefined();
    expect(() => s.deleteLocation('L-HO', 'cleanup')).toThrow(/Cannot delete/);
    s.saveCategory({ id: 'C-PRN', code: 'PRN', name: 'Printer', verificationIntervalMonths: 6 });
    expect(() => s.saveCategory({ id: 'C-X', code: 'PRN', name: 'Dup', verificationIntervalMonths: 6 })).toThrow(/already exists/);
    expect(() => s.saveCategory({ id: 'C-Y', code: 'printer', name: 'Bad code', verificationIntervalMonths: 6 })).toThrow(/2–4 letter/);
    s.deleteCategory('C-PRN', 'Unused');
    expect(s.category('C-PRN')).toBeUndefined();
    expect(() => s.deleteCategory('C-MOB', 'cleanup')).toThrow(/asset\(s\) registered/);
    expect(s.getSnapshot().auditLogs.slice(0, 3).map(l => l.action)).toContain('CATEGORY_DELETED');
  });
});

describe('Handover document accessories', () => {
  it('parses "name - model xN" lists into separate rows', async () => {
    const { parseAccessories } = await import('../src/lib/accessories');
    expect(parseAccessories('Charger - Moto 33W, Back case x2; USB-C cable (1m)')).toEqual([
      { name: 'Charger', model: 'Moto 33W', qty: 1 }, { name: 'Back case', model: '', qty: 2 }, { name: 'USB-C cable', model: '1m', qty: 1 },
    ]);
    expect(parseAccessories('')).toEqual([]);
  });
});
