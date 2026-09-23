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
    imei: `IM-${Math.random().toString(36).slice(2, 10)}`,
    ownershipType: 'Company Owned', supplierName: 'Supplier', invoiceNumber: 'INV-1', poNumber: 'PO-1', purchaseDate: '2026-09-01', purchaseCost: 15000,
    condition: 'New', departmentId: 'D-ADM', locationId: 'L-HO', reason: 'New asset received', ...over,
  });
};

/** Full issue: creating the assignment hands the asset over immediately. Returns handover id. */
const issue = (assetId: string, employeeId = 'E-006') => {
  asAdmin();
  const h = s.createHandover({ employeeId, issuedByUserId: 'U-AA', items: [{ assetId, condition: 'New', quantity: 1, accessories: 'Charger', remarks: '' }], reason: 'Department request approved' });
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
  it('an identity-only asset names itself and keeps the fields its form hides', () => {
    const sim = s.registerAsset({ categoryId: 'C-SIM', name: '', manufacturer: 'Jio', model: 'Postpaid', serialNumber: '8991X0001', sim: '9840055501',
      ownershipType: 'Company Owned', supplierName: '', invoiceNumber: 'INV-9', poNumber: '', purchaseDate: '2026-01-01', purchaseCost: 199,
      specification: '2 GB/day', accessories: 'Tray pin', condition: 'New', departmentId: 'D-ADM', locationId: 'L-HO', reason: 'New SIM' });
    expect(sim.name).toBe('Jio SIM Card 9840055501');
    s.updateAsset(sim.id, { manufacturer: 'Airtel' }, 'Operator corrected');
    const after = s.asset(sim.id)!;
    expect(after).toMatchObject({ manufacturer: 'Airtel', specification: '2 GB/day', accessories: 'Tray pin', invoiceNumber: 'INV-9' });
  });
  it('a mis-registered asset can be deleted; one with history cannot', () => {
    const a = newAsset();
    expect(s.assetDeleteBlockers(a.id)).toEqual([]);
    const txBefore = s.getSnapshot().transactions.length;
    s.deleteAsset(a.id, 'Registered twice by mistake');
    expect(s.asset(a.id)).toBeUndefined();
    expect(s.getSnapshot().transactions.length).toBe(txBefore - 1);            // its registration entry goes too
    expect(s.getSnapshot().auditLogs[0]).toMatchObject({ action: 'ASSET_DELETED', entityId: a.id });
    const b = newAsset(); issue(b.id);                                          // now it has history
    expect(s.assetDeleteBlockers(b.id).join('; ')).toMatch(/assigned|assignment record/);
    expect(() => s.deleteAsset(b.id, 'no longer needed')).toThrow(/cannot be deleted/);
  });
  it('the category decides which identifiers are required', () => {
    expect(() => s.registerAsset({ categoryId: 'C-SIM', name: 'Airtel connection', manufacturer: 'Airtel', model: 'Prepaid', serialNumber: '', ownershipType: 'Company Owned', supplierName: '', invoiceNumber: 'I', poNumber: '', purchaseDate: '2026-09-01', purchaseCost: 200, condition: 'New', departmentId: 'D-ADM', locationId: 'L-HO', reason: 'New SIM' })).toThrow(/SIM Number .* required for SIM Card/);
    const sim = s.registerAsset({ categoryId: 'C-SIM', name: 'Airtel connection', manufacturer: 'Airtel', model: 'Prepaid', serialNumber: '', sim: '9876500001', ownershipType: 'Company Owned', supplierName: '', invoiceNumber: 'I', poNumber: '', purchaseDate: '2026-09-01', purchaseCost: 200, condition: 'New', departmentId: 'D-ADM', locationId: 'L-HO', reason: 'New SIM' });
    expect(sim.sim).toBe('9876500001');                                   // a SIM needs its number, not a serial
    expect(() => newAsset({ imei: undefined })).toThrow(/IMEI Number is required for Mobile Phone/);
    expect(newAsset({ categoryId: 'C-LAP', imei: undefined }).id).toMatch(/GW-AST-LAP-/);   // a laptop needs neither
  });
  it('only Available assets can be issued', () => {
    expect(() => s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', items: [{ assetId: 'GW-AST-MOB-0001', condition: 'Good', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' })).toThrow(/Rule 4/);
  });
  it('submitting assigns the assets (no approval or signature step), blocks a second issue, cancelling releases them', () => {
    const a = newAsset();
    const h = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' });
    expect(h.status).toBe('Active');
    expect(s.getSnapshot().approvals.some(x => x.entityId === h.id)).toBe(false);
    expect(s.asset(a.id)!.status).toBe('Assigned');
    expect(() => s.createHandover({ employeeId: 'E-004', issuedByUserId: 'U-AA', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' })).toThrow(/Rule 4/);
    s.cancelHandover(h.id, 'Not required');
    expect(s.asset(a.id)).toMatchObject({ status: 'Available', custodianEmployeeId: undefined });
    expect(s.getSnapshot().handovers.find(x => x.id === h.id)!.status).toBe('Rejected');
    expect(() => s.cancelHandover(h.id, 'again')).toThrow(/active assignment/);
  });
  it('custodian, department and location follow the employee as soon as the assignment is submitted', () => {
    const a = newAsset();
    const h = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' });
    expect(s.asset(a.id)).toMatchObject({ status: 'Assigned', custodianEmployeeId: 'E-006', departmentId: 'D-IT', locationId: 'L-HO' });
    expect(s.getSnapshot().handovers.find(x => x.id === h.id)).toMatchObject({ status: 'Active', acknowledged: true });
    expect(s.assetHistory(a.id).some(x => x.type === 'HANDOVER' && x.toEmployeeId === 'E-006')).toBe(true);
  });
  it('an active assignment can be amended: condition, qty, accessories and remarks, with history', () => {
    const a = newAsset();
    const id = issue(a.id);
    const h = s.getSnapshot().handovers.find(x => x.id === id)!;
    s.updateHandoverItems(id, [{ ...h.items[0], condition: 'Good', quantity: 2, accessories: 'Charger, Case', remarks: 'Case added later' }], 'Case handed over next day');
    const after = s.getSnapshot().handovers.find(x => x.id === id)!;
    expect(after.items[0]).toMatchObject({ condition: 'Good', quantity: 2, accessories: 'Charger, Case', remarks: 'Case added later' });
    expect(s.asset(a.id)!.condition).toBe('Good');
    const tx = s.assetHistory(a.id).find(t => t.type === 'UPDATE')!;
    expect(tx.reason).toMatch(/condition New → Good/);
    expect(() => s.updateHandoverItems(id, [{ assetId: newAsset().id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], 'swap')).toThrow(/cannot be added/);
    expect(() => s.updateHandoverItems(id, [], 'drop everything')).toThrow(/at least one asset/);
    s.cancelHandover(id, 'No longer needed');
    expect(() => s.updateHandoverItems(id, after.items, 'too late')).toThrow(/can no longer be edited/);
  });
  it('removing an asset from an assignment releases it', () => {
    const a = newAsset(), b = newAsset();
    const h = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', items: [a, b].map(x => ({ assetId: x.id, condition: 'New' as const, quantity: 1, accessories: '', remarks: '' })), reason: 'Two assets issued' });
    s.updateHandoverItems(h.id, h.items.filter(i => i.assetId === a.id), 'Second phone not needed');
    expect(s.getSnapshot().handovers.find(x => x.id === h.id)!.items).toHaveLength(1);
    expect(s.asset(b.id)).toMatchObject({ status: 'Available', custodianEmployeeId: undefined });
    expect(s.asset(a.id)!.status).toBe('Assigned');
    expect(s.assetHistory(b.id)[0].reason).toMatch(/Removed from assignment/);
  });
  it('inactive employee cannot receive assets', () => {
    s.switchUser('U-SA');
    const e = s.getSnapshot().employees.find(x => x.id === 'E-006')!;
    s.saveEmployee({ ...e, active: false });
    const a = newAsset();
    expect(() => s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'test req' })).toThrow(/active employee/);
  });
});

describe('Rule 8 — return', () => {
  it('a return completes on submission: custody released, asset Available, handover closed', () => {
    const a = newAsset(); const h = issue(a.id);
    const r = s.createReturn({ assetId: a.id, conditionReported: 'Good', accessoriesReturned: 'Charger', employeeSignature: 'V. Lakshmi', reason: 'Project ended' });
    expect(r).toMatchObject({ handoverId: h, status: 'Completed', inspected: true, inspectionOutcome: 'Acceptable' });
    expect(s.asset(a.id)).toMatchObject({ status: 'Available', custodianEmployeeId: undefined, condition: 'Good' });
    expect(s.getSnapshot().handovers.find(x => x.id === h)!.status).toBe('Closed');
    expect(() => s.createReturn({ assetId: a.id, conditionReported: 'Good', accessoriesReturned: '', employeeSignature: 'x', reason: 'again' })).toThrow(/Assigned/);
  });
  it('a damaged return goes to Damaged and opens an incident (Rule 9)', () => {
    const a = newAsset(); issue(a.id);
    s.createReturn({ assetId: a.id, conditionReported: 'Damaged', accessoriesReturned: '', employeeSignature: 'x', employeeRemarks: 'Screen cracked', reason: 'Dropped in the field' });
    expect(s.asset(a.id)).toMatchObject({ status: 'Damaged', condition: 'Damaged', custodianEmployeeId: undefined });
    expect(s.getSnapshot().incidents.find(i => i.assetId === a.id)).toMatchObject({ type: 'Damaged', status: 'Reported' });
  });
  it('a return keeps the department and location the asset is recorded at', () => {
    const a = newAsset(); issue(a.id);
    const before = s.asset(a.id)!;
    s.createReturn({ assetId: a.id, conditionReported: 'Fair', accessoriesReturned: '', employeeSignature: 'x', reason: 'Returned for check' });
    const after = s.asset(a.id)!;
    expect(after.departmentId).toBe(before.departmentId);
    expect(s.department(after.departmentId)).toBeTruthy();
    expect(s.location(after.locationId)).toBeTruthy();
  });
  it('a department or location that does not exist is refused', () => {
    expect(() => newAsset({ departmentId: 'D-GONE' })).toThrow(/department that exists/);
    expect(() => newAsset({ locationId: 'L-GONE' })).toThrow(/location that exists/);
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
    expect(s.getSnapshot().handovers.find(x => x.id === ho2)).toMatchObject({ status: 'Active', transferId: t.id });
    expect(s.asset(a.id)).toMatchObject({ status: 'Assigned', custodianEmployeeId: 'E-004', departmentId: 'D-OPS', locationId: 'L-PM' });
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
  it('a report sets the status and opens an approval', () => {
    s.switchUser('U-EMP2');
    const inc = s.openIncident({ assetId: 'GW-AST-LAP-0002', type: 'Damaged', incidentDate: '2026-09-22', reportedByEmployeeId: 'E-006', location: 'HO', description: 'Cracked', reason: 'Dropped' });
    expect(s.asset('GW-AST-LAP-0002')).toMatchObject({ status: 'Damaged', condition: 'Damaged', custodianEmployeeId: 'E-006' });
    expect(s.getSnapshot().approvals.find(x => x.entityId === inc.id)).toMatchObject({ approverRole: 'super_admin', decision: 'Pending Approval' });
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
    expect(tx.map(t => t.type)).toEqual(['HANDOVER', 'RETURN']);
    for (const t of tx) { expect(t.performedByUserId).toBeTruthy(); expect(t.date).toMatch(/^\d{4}-/); expect(t.reason.length).toBeGreaterThan(2); }
    const audit = s.getSnapshot().auditLogs.slice(0, 5).map(l => l.action);
    expect(audit).toContain('RETURN_CREATED'); expect(audit).toContain('HANDOVER_CREATED');
    for (const l of s.getSnapshot().auditLogs.slice(0, 5)) { expect(l.userName).toBeTruthy(); expect(l.role).toBeTruthy(); expect(l.reason).toBeTruthy(); }
  });
  it('the store exposes no way to edit or delete history', () => {
    const proto = Object.getOwnPropertyNames(Store.prototype);
    // Master-data deletes, plus an asset delete that refuses as soon as the asset has any history.
    expect(proto.filter(m => /^(delete|remove)/i.test(m)).sort()).toEqual(['deleteAsset', 'deleteCategory', 'deleteDepartment', 'deleteEmployee', 'deleteLocation', 'deleteRole', 'deleteUser']);
    expect(proto.some(m => /(delete|remove).*(transaction|audit|handover|return|transfer|repair|incident|disposal)/i.test(m))).toBe(false);
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
    const h1 = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', items: [{ assetId: a.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'req one' });
    const h2 = s.createHandover({ employeeId: 'E-006', issuedByUserId: 'U-AA', items: [{ assetId: b.id, condition: 'New', quantity: 1, accessories: '', remarks: '' }], reason: 'req two' });
    expect(h1.id).toBe(`GW-HO-${period}-0001`); expect(h2.id).toBe(`GW-HO-${period}-0002`);
    expect(s.nextRef('RT', s.getSnapshot().returns)).toMatch(/^GW-RT-\d{6}-\d{4}$/);
    expect(s.nextRef('INC', s.getSnapshot().incidents)).toMatch(/^GW-INC-\d{6}-\d{4}$/);
    expect(s.nextRef('DSP', s.getSnapshot().disposals)).toMatch(/^GW-DSP-\d{6}-\d{4}$/);
  });
});

describe('Roles and permissions', () => {
  it('permission matrix matches the specification', () => {
    expect(ROLE_PERMISSIONS.super_admin).toContain('users.manage');
    expect(ROLE_PERMISSIONS.asset_admin).not.toContain('disposal.approve');
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual(['super_admin', 'asset_admin']);   // only two roles ship
    expect(ROLE_PERMISSIONS.asset_admin).toEqual(expect.arrayContaining(['asset.register', 'handover.create', 'return.inspect']));
    expect(ROLE_PERMISSIONS.asset_admin).not.toContain('users.manage');
  });
  it('users and master data can be managed by Super Admin only', () => {
    expect(() => s.saveCategory({ id: 'C-X', code: 'PRN', name: 'Printer', verificationIntervalMonths: 6 })).toThrow(/permit/);
    s.switchUser('U-SA');
    s.saveCategory({ id: 'C-X', code: 'PRN', name: 'Printer', verificationIntervalMonths: 6 });
    expect(s.nextAssetId('C-X')).toBe('GW-AST-PRN-0001');
    s.saveUser({ id: 'U-NEW', name: 'New', email: 'new@gw.in', role: 'asset_admin', active: true });
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
    s.switchUser('U-SA');
    s.saveRole({ code: 'viewer', name: 'Viewer', description: 'Read only', permissions: ['documents.view'], builtIn: false }, 'Read-only role');
    s.saveUser({ id: 'U-VIEW', name: 'Viewer', email: 'viewer@gw.in', role: 'viewer', active: true });
    s.switchUser('U-VIEW');
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
    s.saveUser({ id: 'U-TMP', name: 'Temp Login', email: 'tmp@gw.in', role: 'asset_admin', active: true });
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
    s.switchUser('U-SA'); s.saveUser({ id: 'U-SK', name: 'Store Keeper One', email: 'sk@gw.in', role: 'asset_admin', active: true });
    s.deleteRole('store_keeper', 'No longer needed');
    expect(s.roleDef('store_keeper')).toBeUndefined();
  });
  it('super_admin cannot be modified; built-in roles cannot be deleted; unknown role rejected on user', () => {
    s.switchUser('U-SA');
    expect(() => s.saveRole({ code: 'super_admin', name: 'X', permissions: ['audit.view'], builtIn: true })).toThrow(/cannot be modified/);
    expect(() => s.deleteRole('asset_admin', 'cleanup')).toThrow(/built-in/);
    expect(() => s.saveUser({ id: 'U-X', name: 'X', email: 'x@gw.in', role: 'ghost', active: true })).toThrow(/valid role/);
    s.switchUser('U-AA');
    expect(() => s.saveRole({ code: 'x', name: 'X', permissions: ['audit.view'], builtIn: false })).toThrow(/permit/);
  });
  it('old saved data with plain role codes is migrated to role definitions', () => {
    const raw = JSON.parse(localStorage.getItem('gw-asset-management-db-v1')!);
    raw.roles = ['super_admin', 'asset_admin'];                       // v1 saved plain role codes
    localStorage.setItem('gw-asset-management-db-v1', JSON.stringify(raw));
    const again = new Store();
    expect(again.roleDef('asset_admin')?.permissions).toContain('asset.register');
    again.switchUser('U-AA'); expect(again.can('handover.create')).toBe(true);
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

describe('Bulk import (Excel)', () => {
  it('validates rows against the register and within the file, resolving codes or names', async () => {
    const { validateAssets, validateEmployees } = await import('../src/lib/bulk');
    const db = s.getSnapshot();
    const full = { 'Asset Name': 'Phone A', Category: 'MOB', Manufacturer: 'Samsung', Model: 'A16', 'Serial Number': 'BULK-1', 'IMEI Number': '123', 'Purchase Date': '2026-09-01', 'Purchase Cost': '15,000', 'Warranty Start Date': '2026-09-01', 'Warranty Expiry Date': '2027-08-31', Specification: '8 GB', Accessories: 'Charger' };
    const rows = [
      full,
      { ...full, 'Asset Name': 'Phone B', Category: 'Mobile Phone', 'Serial Number': 'r58x3a1b2c01', 'IMEI Number': '124' },      // serial exists in register
      { ...full, 'Asset Name': 'Phone C', Category: 'XYZ', 'IMEI Number': '125' },                                              // bad category + dup serial within file
      { ...full, 'Asset Name': '', Manufacturer: '', 'Serial Number': 'BULK-9', 'IMEI Number': '', 'Purchase Date': new Date(2026, 8, 5), Accessories: '' },
      { ...full, 'Asset Name': 'Laptop', Category: 'LAP', 'Serial Number': 'BULK-L', 'IMEI Number': '' },                    // a laptop has no IMEI
      { ...full, 'Asset Name': 'SIM 1', Category: 'SIM', 'Serial Number': 'BULK-M', 'IMEI Number': '', 'SIM Number': '' },    // a SIM card must carry its number
    ];
    const v = validateAssets(rows, db);
    expect(v[0].errors).toEqual([]);
    expect(v[0].data).toMatchObject({ categoryId: 'C-MOB', condition: 'New', purchaseCost: 15000, purchaseDate: '2026-09-01', warrantyExpiry: '2027-08-31', supplierName: '' });
    expect(v[1].errors.join()).toMatch(/Serial R58X3A1B2C01 already exists/);
    expect(v[2].errors.join()).toMatch(/Category "XYZ" not found/); expect(v[2].errors.join()).toMatch(/Serial BULK-1 already exists/);
    expect(v[3].errors.join()).toMatch(/Asset Name is required/); expect(v[3].errors.join()).toMatch(/IMEI Number is required/); expect(v[3].errors.join()).toMatch(/Accessories is required/); expect(v[3].data.purchaseDate).toBe('2026-09-05');
    expect(v[4].errors).toEqual([]);
    expect(v[5].errors.join()).toMatch(/SIM Number is required/);
    const e = validateEmployees([{ 'Employee Name': 'New Person', Designation: 'Driver', Department: 'OPS', 'Work Location': 'PM Zone Depot', Active: 'no' }, { 'Employee ID': 'GW-EMP-0001', 'Employee Name': 'Dup', Designation: 'x', Department: 'OPS', 'Work Location': 'PM' }], db);
    expect(e[0].errors).toEqual([]); expect(e[0].data).toMatchObject({ departmentId: 'D-OPS', workLocationId: 'L-PM', active: false });
    expect(e[1].errors.join()).toMatch(/already exists/);
  });
  it('imports valid assets in one commit with sequential IDs, transactions and a single audit entry; rejects duplicates atomically', () => {
    const base = { manufacturer: 'Samsung', model: 'A16', ownershipType: 'Company Owned' as const, supplierName: 'S', invoiceNumber: 'I', poNumber: '', purchaseDate: '2026-09-01', purchaseCost: 1000, condition: 'New' as const, departmentId: 'D-OPS', locationId: 'L-PM' };
    const txBefore = s.getSnapshot().transactions.length; const auditBefore = s.getSnapshot().auditLogs.length;
    const ids = s.importAssets([{ ...base, name: 'A', categoryId: 'C-MOB', serialNumber: 'BULK-A', imei: '998' }, { ...base, name: 'B', categoryId: 'C-MOB', serialNumber: 'BULK-B', imei: '999' }, { ...base, name: 'C', categoryId: 'C-LAP', serialNumber: 'BULK-C' }], 'Excel import');
    expect(ids).toEqual(['GW-AST-MOB-0007', 'GW-AST-MOB-0008', 'GW-AST-LAP-0007']);
    expect(s.getSnapshot().transactions.length).toBe(txBefore + 3);
    expect(s.getSnapshot().auditLogs.length).toBe(auditBefore + 1);
    expect(s.asset('GW-AST-MOB-0008')).toMatchObject({ status: 'Available', imei: '999', barcode: 'GW-AST-MOB-0008' });
    const n = s.getSnapshot().assets.length;
    expect(() => s.importAssets([{ ...base, name: 'D', categoryId: 'C-MOB', serialNumber: 'BULK-D', imei: '997' }, { ...base, name: 'E', categoryId: 'C-MOB', serialNumber: 'bulk-a', imei: '996' }], 'again')).toThrow(/Row 2.*already exists/);
    expect(s.getSnapshot().assets.length).toBe(n);      // nothing from the failed batch was written
  });
  it('imports employees, generating GW-EMP codes when blank', () => {
    s.switchUser('U-SA');
    const ids = s.importEmployees([{ name: 'P One', designation: 'Driver', departmentId: 'D-OPS', dateOfJoining: '2026-09-01', workLocationId: 'L-PM', mobile: '', email: '', active: true }, { employeeCode: 'GW-EMP-0100', name: 'P Two', designation: 'Clerk', departmentId: 'D-FIN', dateOfJoining: '', workLocationId: 'L-HO', mobile: '', email: '', active: true }], 'Excel import');
    const codes = ids.map(id => s.employee(id)!.employeeCode);
    expect(codes).toEqual(['GW-EMP-0013', 'GW-EMP-0100']);
    s.switchUser('U-AA');
    expect(() => s.importEmployees([], 'x')).toThrow(/permit/);
  });
  it('a SIM row needs neither name nor procurement detail', async () => {
    const { validateAssets } = await import('../src/lib/bulk');
    const db = s.getSnapshot();
    const v = validateAssets([{ Category: 'SIM', Manufacturer: 'Airtel', Model: 'Prepaid', 'SIM Number': '9840000123' }], db);
    expect(v[0].errors).toEqual([]);
    expect(v[0].data).toMatchObject({ categoryId: 'C-SIM', sim: '9840000123' });
    const [id] = s.importAssets(v.map(x => x.data), 'SIM import');
    expect(s.asset(id)!.name).toBe('Airtel SIM Card 9840000123');     // named by the store
  });
  it('template and upload round-trip through a real .xlsx file', async () => {
    const XLSX = await import('xlsx');
    const { readSheet, validateAssets, assetTemplateHeaders } = await import('../src/lib/bulk');
    const headers = assetTemplateHeaders();   // exactly the header row the template writes, annotations and all
    const row = ['Excel Phone', 'MOB', 'Samsung', 'A16', 'XL-1', '111', '', 'Yes', 'Company Owned', 'I', new Date(2026, 8, 1), 12000, '2026-09-01', '2027-08-31', '8 GB', 'Charger', '', ''];
    const simRow = ['Excel SIM', 'SIM', 'Airtel', 'Prepaid', '', '', '9840000009', '', 'Company Owned', 'I', new Date(2026, 8, 1), 199, '2026-09-01', '2027-08-31', 'Unlimited', 'Pin', '', ''];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, row, simRow]), 'Assets');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = { name: 't.xlsx', arrayBuffer: async () => buf } as unknown as File;
    const { rows } = await readSheet(file, 'Assets');
    const v = validateAssets(rows, s.getSnapshot());
    expect(v).toHaveLength(2); expect(v[0].errors).toEqual([]);
    expect(v[0].data).toMatchObject({ name: 'Excel Phone', serialNumber: 'XL-1', imei: '111', mdmRegistered: true, purchaseDate: '2026-09-01', purchaseCost: 12000, condition: 'New', accessories: 'Charger' });
    expect(v[1].errors).toEqual([]);                                                   // a SIM row needs no serial and no IMEI
    expect(v[1].data).toMatchObject({ name: 'Excel SIM', categoryId: 'C-SIM', serialNumber: '', sim: '9840000009', imei: undefined, mdmRegistered: undefined });
  });
});

describe('Accessory serialization', () => {
  it('round-trips accessory rows to the stored string and back', async () => {
    const { parseAccessories, serializeAccessories } = await import('../src/lib/accessories');
    const list = [{ name: 'Charger', model: 'Moto 33W', qty: 1 }, { name: 'Back case', model: '', qty: 2 }, { name: '', model: 'ignored', qty: 1 }];
    const str = serializeAccessories(list);
    expect(str).toBe('Charger - Moto 33W, Back case x2');
    expect(parseAccessories(str)).toEqual([{ name: 'Charger', model: 'Moto 33W', qty: 1 }, { name: 'Back case', model: '', qty: 2 }]);
  });
});

describe('Sample data', () => {
  it('loads a coherent test set through the normal workflows, twice without conflicts', async () => {
    const { loadSampleData } = await import('../src/data/sample');
    s.switchUser('U-SA'); s.startEmpty();
    const msg = loadSampleData(s);
    expect(msg).toMatch(/4 employees, 10 assets/);
    const db = s.getSnapshot();
    expect(db.employees.length).toBe(4); expect(db.assets.length).toBe(10);
    expect(db.assets.filter(a => a.status === 'Assigned').length).toBe(5);
    expect(db.assets.filter(a => a.status === 'Reserved').length).toBe(0);
    expect(db.assets.filter(a => a.status === 'Under Repair').length).toBe(1);
    expect(db.assets.filter(a => a.status === 'Damaged').length).toBe(1);
    expect(db.disposals.length).toBe(1);
    expect(db.transactions.every(t => t.reason && t.performedByUserId)).toBe(true);
    await new Promise(r => setTimeout(r, 2));   // different tag → unique serials
    loadSampleData(s);
    expect(s.getSnapshot().assets.length).toBe(20);
    s.saveUser({ id: 'U-TMP-AA', name: 'Admin', email: 'aa@gw.in', role: 'asset_admin', active: true });
    s.switchUser('U-TMP-AA');
    expect(() => loadSampleData(s)).toThrow(/permit/);
  });
});
