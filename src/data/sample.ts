import type { Store } from './store';

// Creates a small, clearly-labelled test dataset THROUGH the normal store workflows, so every record has
// proper transactions, references and audit entries. Safe to run more than once (serials are unique per run).
export function loadSampleData(store: Store): string {
  store.require('settings.manage');
  const db = store.getSnapshot();
  const dept = (code: string) => db.departments.find(d => d.code === code)?.id ?? db.departments[0].id;
  const loc = (code: string) => db.locations.find(l => l.code === code)?.id ?? db.locations[0].id;
  const cat = (code: string) => db.categories.find(c => c.code === code)?.id ?? db.categories[0].id;
  const tag = Date.now().toString(36).toUpperCase().slice(-4);   // makes serials unique on every run
  const reason = 'Sample data for testing';

  // 1. Employees
  const empIds = store.importEmployees([
    { name: 'Sample — Arun Kumar', erpId: `ERP-${tag}-1`, designation: 'Field Supervisor', departmentId: dept('OPS'), dateOfJoining: '2024-03-01', workLocationId: loc('PM'), mobile: '+91 90000 00001', email: `arun.${tag}@example.com`, active: true },
    { name: 'Sample — Meena Devi', erpId: `ERP-${tag}-2`, designation: 'Zone Supervisor', departmentId: dept('OPS'), dateOfJoining: '2024-06-10', workLocationId: loc('OM'), mobile: '+91 90000 00002', email: `meena.${tag}@example.com`, active: true },
    { name: 'Sample — Deepak R', erpId: `ERP-${tag}-3`, designation: 'IT Engineer', departmentId: dept('IT'), dateOfJoining: '2023-11-20', workLocationId: loc('HO'), mobile: '+91 90000 00003', email: `deepak.${tag}@example.com`, active: true },
    { name: 'Sample — Kavitha P', erpId: `ERP-${tag}-4`, designation: 'Accounts Executive', departmentId: dept('FIN'), dateOfJoining: '2023-07-12', workLocationId: loc('HO'), mobile: '+91 90000 00004', email: `kavitha.${tag}@example.com`, active: true },
  ], reason);
  const [arun, meena, deepak, kavitha] = empIds;

  // 2. Assets (all start Available)
  const base = { ownershipType: 'Company Owned' as const, supplierName: '', poNumber: '', condition: 'New' as const, departmentId: dept('ADM'), locationId: loc('HO'), purchaseDate: '2026-06-15', warrantyStart: '2026-06-15', warrantyExpiry: '2027-06-14' };
  const ids = store.importAssets([
    { ...base, categoryId: cat('MOB'), name: 'Samsung Galaxy A35', manufacturer: 'Samsung', model: 'SM-A356E', serialNumber: `SMP-${tag}-M1`, imei: `35${tag}0000001`, sim: `8991${tag}0001`, mdmRegistered: true, invoiceNumber: 'PV/2026/1001', purchaseCost: 24999, specification: '8 GB RAM / 128 GB', accessories: 'Charger - 25W, USB-C cable, Back case' },
    { ...base, categoryId: cat('MOB'), name: 'Samsung Galaxy A35', manufacturer: 'Samsung', model: 'SM-A356E', serialNumber: `SMP-${tag}-M2`, imei: `35${tag}0000002`, sim: `8991${tag}0002`, mdmRegistered: true, invoiceNumber: 'PV/2026/1001', purchaseCost: 24999, specification: '8 GB RAM / 128 GB', accessories: 'Charger - 25W, USB-C cable' },
    { ...base, categoryId: cat('MOB'), name: 'Redmi Note 13', manufacturer: 'Xiaomi', model: '23124RA7EO', serialNumber: `SMP-${tag}-M3`, imei: `86${tag}0000003`, sim: `8991${tag}0003`, mdmRegistered: false, invoiceNumber: 'PV/2026/1002', purchaseCost: 17999, specification: '6 GB RAM / 128 GB', accessories: 'Charger - 33W, Case' },
    { ...base, categoryId: cat('LAP'), name: 'Dell Latitude 5540', manufacturer: 'Dell', model: 'Latitude 5540', serialNumber: `SMP-${tag}-L1`, invoiceNumber: 'DELL-IN-44821', purchaseCost: 78500, specification: 'i5-1335U / 16 GB / 512 GB SSD', accessories: 'Charger - 65W, Laptop bag, Wireless mouse' },
    { ...base, categoryId: cat('LAP'), name: 'HP ProBook 450 G10', manufacturer: 'HP', model: 'ProBook 450 G10', serialNumber: `SMP-${tag}-L2`, invoiceNumber: 'CPP/2026/0331', purchaseCost: 64200, specification: 'i5-1334U / 8 GB / 512 GB SSD', accessories: 'Charger - 65W, Bag' },
    { ...base, categoryId: cat('TAB'), name: 'Samsung Galaxy Tab A9+', manufacturer: 'Samsung', model: 'SM-X210', serialNumber: `SMP-${tag}-T1`, imei: `35${tag}0000004`, sim: `8991${tag}0004`, mdmRegistered: true, invoiceNumber: 'PV/2026/1003', purchaseCost: 18999, specification: '11-inch, 8 GB / 128 GB', accessories: 'Charger, Cover' },
    { ...base, categoryId: cat('GPS'), name: 'Teltonika FMB920', manufacturer: 'Teltonika', model: 'FMB920', serialNumber: `SMP-${tag}-G1`, imei: `35${tag}0000005`, sim: `8991${tag}0005`, invoiceNumber: 'VMT/2026/0044', purchaseCost: 4200, specification: '2G/GNSS tracker', accessories: 'Wiring harness' },
    { ...base, categoryId: cat('CAM'), name: 'Body Camera BC-200', manufacturer: 'Hikvision', model: 'DS-MH2311', serialNumber: `SMP-${tag}-C1`, imei: `HK${tag}0000006`, mdmRegistered: false, invoiceNumber: 'SVS/2026/2210', purchaseCost: 15800, specification: '1080p, 64 GB, 8h battery', accessories: 'Dock, Clip, Charger' },
    { ...base, categoryId: cat('SIM'), name: 'Airtel Corporate SIM', manufacturer: 'Airtel', model: 'Prepaid Corporate', serialNumber: `8991${tag}00070001`, sim: `98400${tag.slice(0, 5)}`, invoiceNumber: 'AIR/2026/CP-118', purchaseCost: 0, specification: 'Corporate plan 2 GB/day', accessories: '' },
    { ...base, categoryId: cat('FUR'), name: 'Executive Office Chair', manufacturer: 'Featherlite', model: 'Contact Project', serialNumber: `SMP-${tag}-F1`, invoiceNumber: 'FF/2026/3391', purchaseCost: 9800, specification: 'High back, mesh', accessories: '' },
  ], reason);
  const [m1, m2, m3, l1, l2, t1, g1, c1, s1] = ids;
  const item = (assetId: string, accessories: string) => ({ assetId, condition: 'New' as const, quantity: 1, accessories, remarks: '' });
  const issuer = store.currentUser.id;

  // 3. Assignments — assets pass to the employee on submit
  store.createHandover({ employeeId: arun, issuedByUserId: issuer, items: [item(m1, 'Charger - 25W, USB-C cable, Back case'), item(s1, '')], reason });
  store.createHandover({ employeeId: deepak, issuedByUserId: issuer, items: [item(l1, 'Charger - 65W, Laptop bag, Wireless mouse')], reason });
  store.createHandover({ employeeId: meena, issuedByUserId: issuer, items: [item(m2, 'Charger - 25W, USB-C cable'), item(c1, 'Dock, Clip, Charger')], reason });

  // 4. A return pending inspection
  store.createHandover({ employeeId: kavitha, issuedByUserId: issuer, items: [item(l2, 'Charger - 65W, Bag')], reason });
  store.createReturn({ assetId: l2, conditionReported: 'Fair', accessoriesReturned: 'Charger - 65W', employeeRemarks: 'Bag misplaced', employeeSignature: 'Sample — Kavitha P', reason: 'Replaced with new laptop' });

  // 5. A repair in progress and an incident under investigation
  store.openRepair({ assetId: m3, faultDescription: 'Battery swollen; charging port damaged', vendor: 'Xiaomi Authorised Service – Puducherry', estimatedCost: 3200, expectedReturnDate: '2026-10-05', reason: 'Fault reported by supervisor' });
  store.openIncident({ assetId: g1, type: 'Damaged', incidentDate: '2026-09-18', reportedByEmployeeId: arun, location: 'Vehicle Workshop', description: 'Water ingress found in tracker casing during installation.', reason: 'Damage found during installation' });

  // 6. A retirement recommendation
  store.startRetirement({ assetId: t1, retirementReason: 'Screen cracked beyond economic repair', technicalRecommendation: 'Repair quote exceeds 60% of replacement cost', reason: 'End of life' });

  return `Sample data loaded: ${empIds.length} employees, ${ids.length} assets (${m1} … ${ids[ids.length - 1]}), 4 assignments, 1 return pending inspection, 1 repair, 1 incident, 1 retirement.`;
}
