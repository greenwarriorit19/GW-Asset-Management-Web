import type { Database, Asset, AssetStatus, Condition, Transaction } from '../../src/data/types';
import { BUILT_IN_ROLES } from '../../src/data/permissions';

// TEST FIXTURE ONLY — demonstration dataset used by the automated tests. Not shipped in the app.
// Every asset seeded here is given a REGISTRATION transaction
// so the permanent history starts from day one.

const iso = (d: string, t = '09:30:00') => `${d}T${t}+05:30`;

export function buildSeed(): Database {
  const departments = [
    { id: 'D-ADM', code: 'ADM', name: 'Administration', headEmployeeId: 'E-001' },
    { id: 'D-OPS', code: 'OPS', name: 'Operations', headEmployeeId: 'E-003' },
    { id: 'D-IT', code: 'IT', name: 'Information Technology', headEmployeeId: 'E-005' },
    { id: 'D-FIN', code: 'FIN', name: 'Finance & Accounts', headEmployeeId: 'E-007' },
    { id: 'D-HR', code: 'HR', name: 'Human Resources', headEmployeeId: 'E-009' },
  ];
  const locations = [
    { id: 'L-HO', code: 'HO', name: 'Head Office – Puducherry', address: 'Puducherry' },
    { id: 'L-PM', code: 'PM', name: 'PM Zone Depot', address: 'Puducherry Municipality zone' },
    { id: 'L-OM', code: 'OM', name: 'OM Zone Depot', address: 'Oulgaret Municipality zone' },
    { id: 'L-WS', code: 'WS', name: 'Vehicle Workshop', address: 'Workshop yard' },
  ];
  const categories = [
    { id: 'C-MOB', code: 'MOB', name: 'Mobile Phone', verificationIntervalMonths: 6 },
    { id: 'C-LAP', code: 'LAP', name: 'Laptop', verificationIntervalMonths: 6 },
    { id: 'C-GPS', code: 'GPS', name: 'GPS Tracker', verificationIntervalMonths: 3 },
    { id: 'C-CAM', code: 'CAM', name: 'Camera / Body Camera', verificationIntervalMonths: 6 },
    { id: 'C-SIM', code: 'SIM', name: 'SIM Card', verificationIntervalMonths: 12 },
    { id: 'C-FUR', code: 'FUR', name: 'Furniture & Fixtures', verificationIntervalMonths: 12 },
    { id: 'C-TAB', code: 'TAB', name: 'Tablet', verificationIntervalMonths: 6 },
  ];
  const employees = [
    { id: 'E-001', employeeCode: 'GW-EMP-0001', name: 'R. Selvakumar', designation: 'Administration Head', departmentId: 'D-ADM', dateOfJoining: '2021-04-01', workLocationId: 'L-HO', mobile: '+91 98400 11001', email: 'selvakumar@greenwarrior.in', active: true },
    { id: 'E-002', employeeCode: 'GW-EMP-0002', name: 'M. Priya', designation: 'Asset Administrator', departmentId: 'D-ADM', dateOfJoining: '2022-01-10', workLocationId: 'L-HO', mobile: '+91 98400 11002', email: 'priya@greenwarrior.in', active: true },
    { id: 'E-003', employeeCode: 'GW-EMP-0003', name: 'K. Anbarasan', designation: 'Operations Manager', departmentId: 'D-OPS', dateOfJoining: '2020-08-15', workLocationId: 'L-PM', mobile: '+91 98400 11003', email: 'anbarasan@greenwarrior.in', active: true },
    { id: 'E-004', employeeCode: 'GW-EMP-0004', name: 'S. Karthik', designation: 'Field Supervisor', departmentId: 'D-OPS', dateOfJoining: '2023-03-01', workLocationId: 'L-PM', mobile: '+91 98400 11004', email: 'karthik@greenwarrior.in', active: true },
    { id: 'E-005', employeeCode: 'GW-EMP-0005', name: 'A. Deepak', designation: 'IT Head', departmentId: 'D-IT', dateOfJoining: '2021-11-20', workLocationId: 'L-HO', mobile: '+91 98400 11005', email: 'deepak@greenwarrior.in', active: true },
    { id: 'E-006', employeeCode: 'GW-EMP-0006', name: 'V. Lakshmi', designation: 'Software Developer', departmentId: 'D-IT', dateOfJoining: '2024-02-05', workLocationId: 'L-HO', mobile: '+91 98400 11006', email: 'lakshmi@greenwarrior.in', active: true },
    { id: 'E-007', employeeCode: 'GW-EMP-0007', name: 'N. Raghavan', designation: 'Finance Head', departmentId: 'D-FIN', dateOfJoining: '2020-06-01', workLocationId: 'L-HO', mobile: '+91 98400 11007', email: 'raghavan@greenwarrior.in', active: true },
    { id: 'E-008', employeeCode: 'GW-EMP-0008', name: 'P. Kavitha', designation: 'Accounts Executive', departmentId: 'D-FIN', dateOfJoining: '2023-07-12', workLocationId: 'L-HO', mobile: '+91 98400 11008', email: 'kavitha@greenwarrior.in', active: true },
    { id: 'E-009', employeeCode: 'GW-EMP-0009', name: 'J. Meenakshi', designation: 'HR Manager', departmentId: 'D-HR', dateOfJoining: '2022-05-16', workLocationId: 'L-HO', mobile: '+91 98400 11009', email: 'meenakshi@greenwarrior.in', active: true },
    { id: 'E-010', employeeCode: 'GW-EMP-0010', name: 'B. Murugan', designation: 'Field Supervisor', departmentId: 'D-OPS', dateOfJoining: '2023-09-01', workLocationId: 'L-OM', mobile: '+91 98400 11010', email: 'murugan@greenwarrior.in', active: true },
    { id: 'E-011', employeeCode: 'GW-EMP-0011', name: 'T. Ramesh', designation: 'Workshop In-charge', departmentId: 'D-OPS', dateOfJoining: '2022-10-03', workLocationId: 'L-WS', mobile: '+91 98400 11011', email: 'ramesh@greenwarrior.in', active: true },
    { id: 'E-012', employeeCode: 'GW-EMP-0012', name: 'G. Sundari', designation: 'Zone Supervisor', departmentId: 'D-OPS', dateOfJoining: '2024-06-10', workLocationId: 'L-OM', mobile: '+91 98400 11012', email: 'sundari@greenwarrior.in', active: true },
  ];
  const users = [
    { id: 'U-SA', name: 'System Administrator', email: 'sysadmin@greenwarrior.in', role: 'super_admin' as const, active: true },
    { id: 'U-AA', name: 'M. Priya', email: 'priya@greenwarrior.in', role: 'asset_admin' as const, employeeId: 'E-002', departmentId: 'D-ADM', active: true },
    // Only two roles exist: Super Admin approves, Asset Administrator runs the day-to-day work.
    { id: 'U-DH-OPS', name: 'K. Anbarasan', email: 'anbarasan@greenwarrior.in', role: 'super_admin' as const, employeeId: 'E-003', departmentId: 'D-OPS', active: true },
    { id: 'U-DH-IT', name: 'A. Deepak', email: 'deepak@greenwarrior.in', role: 'super_admin' as const, employeeId: 'E-005', departmentId: 'D-IT', active: true },
    { id: 'U-EMP', name: 'S. Karthik', email: 'karthik@greenwarrior.in', role: 'asset_admin' as const, employeeId: 'E-004', departmentId: 'D-OPS', active: true },
    { id: 'U-EMP2', name: 'V. Lakshmi', email: 'lakshmi@greenwarrior.in', role: 'asset_admin' as const, employeeId: 'E-006', departmentId: 'D-IT', active: true },
    { id: 'U-AUD', name: 'N. Raghavan', email: 'raghavan@greenwarrior.in', role: 'asset_admin' as const, employeeId: 'E-007', departmentId: 'D-FIN', active: true },
  ];

  type Row = [cat: string, n: number, name: string, mfr: string, model: string, sn: string, imei: string | undefined, sim: string | undefined,
    supplier: string, inv: string, po: string, pdate: string, cost: number, wstart: string, wexp: string, status: AssetStatus, cond: Condition,
    dept: string, loc: string, cust: string | undefined, spec: string, acc: string];

  const rows: Row[] = [
    ['MOB', 1, 'Samsung Galaxy A35', 'Samsung', 'SM-A356E', 'R58X3A1B2C01', '356938035643801', undefined, 'Poorvika Mobiles', 'PV/2025/1187', 'GW-PO-2025-021', '2025-03-12', 24999, '2025-03-12', '2026-03-11', 'Assigned', 'Good', 'D-OPS', 'L-PM', 'E-004', '8 GB RAM / 128 GB', 'Charger, USB-C cable, case'],
    ['MOB', 2, 'Samsung Galaxy A35', 'Samsung', 'SM-A356E', 'R58X3A1B2C02', '356938035643819', undefined, 'Poorvika Mobiles', 'PV/2025/1187', 'GW-PO-2025-021', '2025-03-12', 24999, '2025-03-12', '2026-03-11', 'Assigned', 'Good', 'D-OPS', 'L-OM', 'E-010', '8 GB RAM / 128 GB', 'Charger, USB-C cable, case'],
    ['MOB', 3, 'Samsung Galaxy A35', 'Samsung', 'SM-A356E', 'R58X3A1B2C03', '356938035643827', undefined, 'Poorvika Mobiles', 'PV/2025/1187', 'GW-PO-2025-021', '2025-03-12', 24999, '2025-03-12', '2026-03-11', 'Available', 'Good', 'D-ADM', 'L-HO', undefined, '8 GB RAM / 128 GB', 'Charger, USB-C cable'],
    ['MOB', 4, 'Redmi Note 13', 'Xiaomi', '23124RA7EO', 'XM23124RA0004', '867530041234567', undefined, 'Poorvika Mobiles', 'PV/2024/0912', 'GW-PO-2024-088', '2024-11-05', 17999, '2024-11-05', '2025-11-04', 'Under Repair', 'Not Working', 'D-OPS', 'L-WS', undefined, '6 GB RAM / 128 GB', 'Charger'],
    ['MOB', 5, 'Redmi Note 13', 'Xiaomi', '23124RA7EO', 'XM23124RA0005', '867530041234575', undefined, 'Poorvika Mobiles', 'PV/2024/0912', 'GW-PO-2024-088', '2024-11-05', 17999, '2024-11-05', '2025-11-04', 'Lost', 'Good', 'D-OPS', 'L-OM', 'E-012', '6 GB RAM / 128 GB', 'Charger, case'],
    ['MOB', 6, 'Redmi Note 13', 'Xiaomi', '23124RA7EO', 'XM23124RA0006', '867530041234583', undefined, 'Poorvika Mobiles', 'PV/2024/0912', 'GW-PO-2024-088', '2024-11-05', 17999, '2024-11-05', '2025-11-04', 'Assigned', 'Good', 'D-OPS', 'L-PM', 'E-003', '6 GB RAM / 128 GB', 'Charger, case'],
    ['LAP', 1, 'Dell Latitude 5540', 'Dell', 'Latitude 5540', 'DL5540-7HX2P93', undefined, undefined, 'Dell India (Enterprise)', 'DELL-IN-44821', 'GW-PO-2024-031', '2024-04-18', 78500, '2024-04-18', '2027-04-17', 'Assigned', 'Good', 'D-IT', 'L-HO', 'E-005', 'i5-1335U / 16 GB / 512 GB SSD', 'Charger 65W, laptop bag'],
    ['LAP', 2, 'Dell Latitude 5540', 'Dell', 'Latitude 5540', 'DL5540-7HX2P94', undefined, undefined, 'Dell India (Enterprise)', 'DELL-IN-44821', 'GW-PO-2024-031', '2024-04-18', 78500, '2024-04-18', '2027-04-17', 'Assigned', 'Good', 'D-IT', 'L-HO', 'E-006', 'i5-1335U / 16 GB / 512 GB SSD', 'Charger 65W, laptop bag, mouse'],
    ['LAP', 3, 'HP ProBook 450 G10', 'HP', 'ProBook 450 G10', 'HP450G10-5CD3', undefined, undefined, 'Computer Point Puducherry', 'CPP/2025/0331', 'GW-PO-2025-009', '2025-01-22', 64200, '2025-01-22', '2026-01-21', 'Assigned', 'Good', 'D-FIN', 'L-HO', 'E-008', 'i5-1334U / 8 GB / 512 GB SSD', 'Charger, bag'],
    ['LAP', 4, 'HP ProBook 450 G10', 'HP', 'ProBook 450 G10', 'HP450G10-5CD4', undefined, undefined, 'Computer Point Puducherry', 'CPP/2025/0331', 'GW-PO-2025-009', '2025-01-22', 64200, '2025-01-22', '2026-01-21', 'Available', 'Good', 'D-ADM', 'L-HO', undefined, 'i5-1334U / 8 GB / 512 GB SSD', 'Charger, bag'],
    ['LAP', 5, 'Lenovo ThinkPad E14', 'Lenovo', 'ThinkPad E14 Gen 5', 'LNV-E14-PF4K2Q', undefined, undefined, 'Lenovo Exclusive Store', 'LES/2022/718', 'GW-PO-2022-014', '2022-06-30', 58900, '2022-06-30', '2025-06-29', 'Retired', 'Fair', 'D-ADM', 'L-HO', undefined, 'i3-1215U / 8 GB / 256 GB', 'Charger'],
    ['LAP', 6, 'Lenovo ThinkPad E14', 'Lenovo', 'ThinkPad E14 Gen 5', 'LNV-E14-PF4K2R', undefined, undefined, 'Lenovo Exclusive Store', 'LES/2022/718', 'GW-PO-2022-014', '2022-06-30', 58900, '2022-06-30', '2025-06-29', 'Assigned', 'Fair', 'D-HR', 'L-HO', 'E-009', 'i3-1215U / 8 GB / 256 GB', 'Charger'],
    ['GPS', 1, 'Teltonika FMB920', 'Teltonika', 'FMB920', 'TLT-FMB920-352093081', '352093081452001', '8991000912345001', 'VM Tracker Solutions', 'VMT/2025/0044', 'GW-PO-2025-015', '2025-02-10', 4200, '2025-02-10', '2026-02-09', 'Assigned', 'Good', 'D-OPS', 'L-PM', 'E-011', '2G/GNSS tracker', 'Wiring harness'],
    ['GPS', 2, 'Teltonika FMB920', 'Teltonika', 'FMB920', 'TLT-FMB920-352093082', '352093081452002', '8991000912345002', 'VM Tracker Solutions', 'VMT/2025/0044', 'GW-PO-2025-015', '2025-02-10', 4200, '2025-02-10', '2026-02-09', 'Assigned', 'Good', 'D-OPS', 'L-PM', 'E-011', '2G/GNSS tracker', 'Wiring harness'],
    ['GPS', 3, 'Teltonika FMB920', 'Teltonika', 'FMB920', 'TLT-FMB920-352093083', '352093081452003', '8991000912345003', 'VM Tracker Solutions', 'VMT/2025/0044', 'GW-PO-2025-015', '2025-02-10', 4200, '2025-02-10', '2026-02-09', 'Available', 'New', 'D-OPS', 'L-WS', undefined, '2G/GNSS tracker', 'Wiring harness'],
    ['GPS', 4, 'Teltonika FMB920', 'Teltonika', 'FMB920', 'TLT-FMB920-352093084', '352093081452004', '8991000912345004', 'VM Tracker Solutions', 'VMT/2025/0044', 'GW-PO-2025-015', '2025-02-10', 4200, '2025-02-10', '2026-02-09', 'Damaged', 'Damaged', 'D-OPS', 'L-WS', undefined, '2G/GNSS tracker', 'Wiring harness'],
    ['CAM', 1, 'Body Camera BC-200', 'Hikvision', 'DS-MH2311', 'HKV-BC200-00871', undefined, undefined, 'Secure Vision Systems', 'SVS/2025/2210', 'GW-PO-2025-030', '2025-05-02', 15800, '2025-05-02', '2026-05-01', 'Assigned', 'Good', 'D-OPS', 'L-OM', 'E-012', '1080p, 64 GB, 8h battery', 'Dock, clip, charger'],
    ['CAM', 2, 'Body Camera BC-200', 'Hikvision', 'DS-MH2311', 'HKV-BC200-00872', undefined, undefined, 'Secure Vision Systems', 'SVS/2025/2210', 'GW-PO-2025-030', '2025-05-02', 15800, '2025-05-02', '2026-05-01', 'Under Inspection', 'Fair', 'D-OPS', 'L-HO', undefined, '1080p, 64 GB, 8h battery', 'Dock, clip, charger'],
    ['CAM', 3, 'Body Camera BC-200', 'Hikvision', 'DS-MH2311', 'HKV-BC200-00873', undefined, undefined, 'Secure Vision Systems', 'SVS/2025/2210', 'GW-PO-2025-030', '2025-05-02', 15800, '2025-05-02', '2026-05-01', 'Available', 'New', 'D-ADM', 'L-HO', undefined, '1080p, 64 GB, 8h battery', 'Dock, clip, charger'],
    ['SIM', 1, 'Airtel Corporate SIM', 'Airtel', 'Prepaid Corporate', 'SIM-AIR-0001', undefined, '8991100012345601', 'Bharti Airtel Ltd', 'AIR/2025/CP-118', 'GW-PO-2025-021', '2025-03-12', 0, '', '', 'Assigned', 'Good', 'D-OPS', 'L-PM', 'E-004', 'Corporate plan 2 GB/day', ''],
    ['SIM', 2, 'Airtel Corporate SIM', 'Airtel', 'Prepaid Corporate', 'SIM-AIR-0002', undefined, '8991100012345602', 'Bharti Airtel Ltd', 'AIR/2025/CP-118', 'GW-PO-2025-021', '2025-03-12', 0, '', '', 'Assigned', 'Good', 'D-OPS', 'L-OM', 'E-010', 'Corporate plan 2 GB/day', ''],
    ['SIM', 3, 'Airtel Corporate SIM', 'Airtel', 'Prepaid Corporate', 'SIM-AIR-0003', undefined, '8991100012345603', 'Bharti Airtel Ltd', 'AIR/2025/CP-118', 'GW-PO-2025-021', '2025-03-12', 0, '', '', 'Available', 'New', 'D-ADM', 'L-HO', undefined, 'Corporate plan 2 GB/day', ''],
    ['TAB', 1, 'Samsung Galaxy Tab A9+', 'Samsung', 'SM-X210', 'R9TX2B0001', undefined, undefined, 'Poorvika Mobiles', 'PV/2025/1502', 'GW-PO-2025-041', '2025-07-15', 18999, '2025-07-15', '2026-07-14', 'Assigned', 'New', 'D-OPS', 'L-PM', 'E-003', '11-inch, 8 GB / 128 GB', 'Charger, cover'],
    ['TAB', 2, 'Samsung Galaxy Tab A9+', 'Samsung', 'SM-X210', 'R9TX2B0002', undefined, undefined, 'Poorvika Mobiles', 'PV/2025/1502', 'GW-PO-2025-041', '2025-07-15', 18999, '2025-07-15', '2026-07-14', 'Reserved', 'New', 'D-ADM', 'L-HO', undefined, '11-inch, 8 GB / 128 GB', 'Charger, cover'],
    ['FUR', 1, 'Executive Office Chair', 'Featherlite', 'Contact Project', 'FL-CH-2023-041', undefined, undefined, 'Featherlite Furniture', 'FF/2023/3391', 'GW-PO-2023-052', '2023-08-21', 9800, '', '', 'Assigned', 'Good', 'D-ADM', 'L-HO', 'E-001', 'High back, mesh', ''],
    ['FUR', 2, 'Steel Filing Cabinet 4-Drawer', 'Godrej', 'Vertical 4D', 'GDJ-FC-1188', undefined, undefined, 'Godrej Interio', 'GI/2021/882', 'GW-PO-2021-008', '2021-05-11', 14500, '', '', 'Disposed', 'Damaged', 'D-FIN', 'L-HO', undefined, 'Steel, 4 drawer', ''],
  ];

  const assets: Asset[] = rows.map(r => {
    const [cat, n, name, manufacturer, model, serialNumber, imei, sim, supplierName, invoiceNumber, poNumber, purchaseDate, purchaseCost, warrantyStart, warrantyExpiry, status, condition, departmentId, locationId, custodianEmployeeId, specification, accessories] = r;
    const id = `GW-AST-${cat}-${String(n).padStart(4, '0')}`;
    const lastVer = ['MOB', 'GPS'].includes(cat) ? '2026-03-15' : '2025-12-10';
    const nextVer = cat === 'GPS' ? '2026-06-15' : ['MOB'].includes(cat) ? '2026-09-15' : '2026-12-10';
    return {
      id, categoryId: `C-${cat}`, name, manufacturer, model, serialNumber, imei, sim, barcode: id,
      ownershipType: 'Company Owned', supplierName, invoiceNumber, poNumber, purchaseDate, purchaseCost,
      warrantyStart: warrantyStart || undefined, warrantyExpiry: warrantyExpiry || undefined, funding: 'Municipal Sanitation Contract',
      status, condition, departmentId, locationId, custodianEmployeeId,
      lastVerificationDate: lastVer, nextVerificationDate: nextVer,
      specification, accessories, maintenanceNotes: '', remarks: '',
      registeredBy: 'U-AA', registeredAt: iso(purchaseDate, '11:00:00'), registrationApprovedBy: 'U-SA',
    };
  });

  const tx: Transaction[] = [];
  let t = 1;
  const push = (p: Omit<Transaction, 'id'>) => tx.push({ id: `T-${String(t++).padStart(6, '0')}`, ...p });

  for (const a of assets) {
    push({ type: 'REGISTRATION', assetId: a.id, date: a.registeredAt, statusBefore: 'Available', statusAfter: 'Available',
      conditionAfter: 'New', toDepartmentId: a.departmentId, toLocationId: a.locationId, performedByUserId: 'U-AA', performedByName: 'M. Priya',
      reason: 'New asset registered', remarks: `Invoice ${a.invoiceNumber}` });
  }

  // Handovers producing the current assignments.
  const handovers: Database['handovers'] = [];
  const hoDefs: Array<[ref: string, date: string, emp: string, assets: string[], purpose: string, loc: string]> = [
    ['GW-HO-202503-0001', '2025-03-15', 'E-004', ['GW-AST-MOB-0001', 'GW-AST-SIM-0001'], 'Field supervision – PM zone', 'PM Zone'],
    ['GW-HO-202503-0002', '2025-03-15', 'E-010', ['GW-AST-MOB-0002', 'GW-AST-SIM-0002'], 'Field supervision – OM zone', 'OM Zone'],
    ['GW-HO-202411-0001', '2024-11-08', 'E-003', ['GW-AST-MOB-0006'], 'Operations coordination', 'PM Zone'],
    ['GW-HO-202404-0001', '2024-04-22', 'E-005', ['GW-AST-LAP-0001'], 'IT administration', 'Head Office'],
    ['GW-HO-202404-0002', '2024-04-22', 'E-006', ['GW-AST-LAP-0002'], 'Software development', 'Head Office'],
    ['GW-HO-202501-0001', '2025-01-27', 'E-008', ['GW-AST-LAP-0003'], 'Accounts processing', 'Head Office'],
    ['GW-HO-202207-0001', '2022-07-04', 'E-009', ['GW-AST-LAP-0006'], 'HR records', 'Head Office'],
    ['GW-HO-202502-0001', '2025-02-14', 'E-011', ['GW-AST-GPS-0001', 'GW-AST-GPS-0002'], 'Vehicle tracker installation stock', 'Workshop'],
    ['GW-HO-202505-0001', '2025-05-06', 'E-012', ['GW-AST-CAM-0001', 'GW-AST-MOB-0005'], 'Zone supervision – OM', 'OM Zone'],
    ['GW-HO-202507-0001', '2025-07-18', 'E-003', ['GW-AST-TAB-0001'], 'Route monitoring', 'PM Zone'],
    ['GW-HO-202308-0001', '2023-08-25', 'E-001', ['GW-AST-FUR-0001'], 'Office use', 'Head Office'],
  ];
  for (const [ref, date, emp, ids, purpose, loc] of hoDefs) {
    const e = employees.find(x => x.id === emp)!;
    handovers.push({
      id: ref, date, employeeId: emp, issuedByUserId: 'U-AA', purpose, locationOfUse: loc,
      items: ids.map(assetId => ({ assetId, condition: 'Good', quantity: 1, accessories: assets.find(a => a.id === assetId)?.accessories ?? '', remarks: '' })),
      approval: 'Approved', approvedByUserId: emp === 'E-005' || emp === 'E-006' ? 'U-DH-IT' : 'U-DH-OPS', approvedAt: iso(date, '10:00:00'),
      acknowledged: true, acknowledgedAt: iso(date, '10:30:00'), employeeSignature: e.name, authorizedSignatoryUserId: 'U-SA',
      status: 'Active', createdByUserId: 'U-AA', createdAt: iso(date),
    });
    for (const assetId of ids) {
      const a = assets.find(x => x.id === assetId)!;
      push({ type: 'HANDOVER', assetId, date: iso(date, '10:30:00'), reference: ref, toEmployeeId: emp, toDepartmentId: e.departmentId, toLocationId: e.workLocationId,
        statusBefore: 'Available', statusAfter: 'Assigned', conditionBefore: a.condition, conditionAfter: 'Good',
        performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: purpose });
    }
  }

  // MOB-0003: issued to Finance, transferred to Operations, returned and inspected — now back in the pool as Available.
  push({ type: 'HANDOVER', assetId: 'GW-AST-MOB-0003', date: iso('2025-04-02', '10:30:00'), reference: 'GW-HO-202504-0001', toEmployeeId: 'E-008', toDepartmentId: 'D-FIN', toLocationId: 'L-HO', statusBefore: 'Available', statusAfter: 'Assigned', conditionBefore: 'New', conditionAfter: 'New', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Accounts field collections' });
  handovers.push({ id: 'GW-HO-202504-0001', date: '2025-04-02', employeeId: 'E-008', issuedByUserId: 'U-AA', purpose: 'Accounts field collections', locationOfUse: 'Head Office', items: [{ assetId: 'GW-AST-MOB-0003', condition: 'New', quantity: 1, accessories: 'Charger, USB-C cable, case', remarks: '' }], approval: 'Approved', approvedByUserId: 'U-SA', approvedAt: iso('2025-04-02'), acknowledged: true, acknowledgedAt: iso('2025-04-02', '10:30:00'), employeeSignature: 'P. Kavitha', authorizedSignatoryUserId: 'U-SA', status: 'Closed', createdByUserId: 'U-AA', createdAt: iso('2025-04-02') });
  push({ type: 'TRANSFER', assetId: 'GW-AST-MOB-0003', date: iso('2026-01-20', '11:00:00'), reference: 'GW-TR-202601-0001', fromEmployeeId: 'E-008', toEmployeeId: 'E-012', fromDepartmentId: 'D-FIN', toDepartmentId: 'D-OPS', fromLocationId: 'L-HO', toLocationId: 'L-OM', statusBefore: 'Assigned', statusAfter: 'Transferred', conditionBefore: 'Good', conditionAfter: 'Good', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Reallocated to OM zone supervision', remarks: 'Handed over at head office' });
  push({ type: 'HANDOVER', assetId: 'GW-AST-MOB-0003', date: iso('2026-01-21', '09:40:00'), reference: 'GW-HO-202601-0001', toEmployeeId: 'E-012', fromDepartmentId: 'D-FIN', toDepartmentId: 'D-OPS', fromLocationId: 'L-HO', toLocationId: 'L-OM', statusBefore: 'Transferred', statusAfter: 'Assigned', conditionBefore: 'Good', conditionAfter: 'Good', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Transfer GW-TR-202601-0001: Reallocated to OM zone supervision' });
  handovers.push({ id: 'GW-HO-202601-0001', date: '2026-01-21', employeeId: 'E-012', issuedByUserId: 'U-AA', purpose: 'Transfer GW-TR-202601-0001: Reallocated to OM zone supervision', locationOfUse: 'OM Zone Depot', items: [{ assetId: 'GW-AST-MOB-0003', condition: 'Good', quantity: 1, accessories: 'Charger, USB-C cable', remarks: 'Transferred from P. Kavitha; case missing' }], approval: 'Approved', approvedByUserId: 'U-DH-OPS', approvedAt: iso('2026-01-20', '10:00:00'), acknowledged: true, acknowledgedAt: iso('2026-01-21', '09:40:00'), employeeSignature: 'G. Sundari', authorizedSignatoryUserId: 'U-SA', status: 'Closed', createdByUserId: 'U-AA', createdAt: iso('2026-01-20', '11:00:00'), transferId: 'GW-TR-202601-0001' });
  push({ type: 'RETURN', assetId: 'GW-AST-MOB-0003', date: iso('2026-08-12', '16:30:00'), reference: 'GW-RT-202608-0001', fromEmployeeId: 'E-012', statusBefore: 'Assigned', statusAfter: 'Under Inspection', conditionBefore: 'Good', conditionAfter: 'Good', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Replaced by newer handset' });
  push({ type: 'INSPECTION', assetId: 'GW-AST-MOB-0003', date: iso('2026-08-13', '10:15:00'), reference: 'GW-RT-202608-0001', toDepartmentId: 'D-ADM', toLocationId: 'L-HO', statusBefore: 'Under Inspection', statusAfter: 'Available', conditionBefore: 'Good', conditionAfter: 'Good', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Inspection outcome: Acceptable. Minor scuffs; fully functional', remarks: 'Returned to head-office pool' });

  // Repair in progress for MOB-0004 (previously with E-004).
  push({ type: 'HANDOVER', assetId: 'GW-AST-MOB-0004', date: iso('2024-11-08', '10:30:00'), reference: 'GW-HO-202411-0002', toEmployeeId: 'E-004', toDepartmentId: 'D-OPS', toLocationId: 'L-PM', statusBefore: 'Available', statusAfter: 'Assigned', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Field supervision' });
  handovers.push({ id: 'GW-HO-202411-0002', date: '2024-11-08', employeeId: 'E-004', issuedByUserId: 'U-AA', purpose: 'Field supervision', locationOfUse: 'PM Zone', items: [{ assetId: 'GW-AST-MOB-0004', condition: 'New', quantity: 1, accessories: 'Charger', remarks: '' }], approval: 'Approved', approvedByUserId: 'U-DH-OPS', approvedAt: iso('2024-11-08'), acknowledged: true, acknowledgedAt: iso('2024-11-08', '10:30:00'), employeeSignature: 'S. Karthik', authorizedSignatoryUserId: 'U-SA', status: 'Closed', createdByUserId: 'U-AA', createdAt: iso('2024-11-08') });
  push({ type: 'RETURN', assetId: 'GW-AST-MOB-0004', date: iso('2026-09-02', '15:10:00'), reference: 'GW-RT-202609-0001', fromEmployeeId: 'E-004', statusBefore: 'Assigned', statusAfter: 'Under Inspection', conditionBefore: 'Good', conditionAfter: 'Not Working', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Device not powering on' });
  push({ type: 'INSPECTION', assetId: 'GW-AST-MOB-0004', date: iso('2026-09-03', '11:00:00'), reference: 'GW-RT-202609-0001', statusBefore: 'Under Inspection', statusAfter: 'Under Repair', conditionAfter: 'Not Working', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Inspection outcome: Faulty – sent for repair' });
  push({ type: 'REPAIR_SENT', assetId: 'GW-AST-MOB-0004', date: iso('2026-09-04', '09:45:00'), reference: 'GW-RP-202609-0001', toLocationId: 'L-WS', statusBefore: 'Under Repair', statusAfter: 'Under Repair', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Battery/charging port fault' });

  // Lost incident for MOB-0005.
  push({ type: 'INCIDENT', assetId: 'GW-AST-MOB-0005', date: iso('2026-09-10', '18:20:00'), reference: 'GW-INC-202609-0001', fromEmployeeId: 'E-012', statusBefore: 'Assigned', statusAfter: 'Lost', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Reported lost during field duty' });
  // Damaged GPS-0004.
  push({ type: 'INCIDENT', assetId: 'GW-AST-GPS-0004', date: iso('2026-08-21', '12:00:00'), reference: 'GW-INC-202608-0001', statusBefore: 'Available', statusAfter: 'Damaged', conditionAfter: 'Damaged', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Water ingress found during installation' });
  // CAM-0002 returned pending inspection.
  push({ type: 'HANDOVER', assetId: 'GW-AST-CAM-0002', date: iso('2025-05-06', '10:30:00'), reference: 'GW-HO-202505-0002', toEmployeeId: 'E-010', toDepartmentId: 'D-OPS', toLocationId: 'L-OM', statusBefore: 'Available', statusAfter: 'Assigned', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Zone supervision – OM' });
  handovers.push({ id: 'GW-HO-202505-0002', date: '2025-05-06', employeeId: 'E-010', issuedByUserId: 'U-AA', purpose: 'Zone supervision – OM', locationOfUse: 'OM Zone', items: [{ assetId: 'GW-AST-CAM-0002', condition: 'New', quantity: 1, accessories: 'Dock, clip, charger', remarks: '' }], approval: 'Approved', approvedByUserId: 'U-DH-OPS', approvedAt: iso('2025-05-06'), acknowledged: true, acknowledgedAt: iso('2025-05-06', '10:30:00'), employeeSignature: 'B. Murugan', authorizedSignatoryUserId: 'U-SA', status: 'Closed', createdByUserId: 'U-AA', createdAt: iso('2025-05-06') });
  push({ type: 'RETURN', assetId: 'GW-AST-CAM-0002', date: iso('2026-09-18', '16:00:00'), reference: 'GW-RT-202609-0002', fromEmployeeId: 'E-010', statusBefore: 'Assigned', statusAfter: 'Under Inspection', conditionBefore: 'Good', conditionAfter: 'Fair', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Return – camera replaced with newer unit' });
  // LAP-0005 retired, FUR-0002 disposed.
  push({ type: 'RETIREMENT', assetId: 'GW-AST-LAP-0005', date: iso('2026-07-30', '14:00:00'), reference: 'GW-DSP-202607-0001', statusBefore: 'Available', statusAfter: 'Retired', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'End of life – battery and hinge failure' });
  push({ type: 'RETIREMENT', assetId: 'GW-AST-FUR-0002', date: iso('2026-05-12', '14:00:00'), reference: 'GW-DSP-202605-0001', statusBefore: 'Available', statusAfter: 'Retired', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Rusted; drawers not operable' });
  push({ type: 'DISPOSAL', assetId: 'GW-AST-FUR-0002', date: iso('2026-05-28', '11:00:00'), reference: 'GW-DSP-202605-0001', statusBefore: 'Retired', statusAfter: 'Disposed', performedByUserId: 'U-AA', performedByName: 'M. Priya', reason: 'Sold as scrap – receipt SCR/2026/044' });

  tx.sort((a, b) => a.date.localeCompare(b.date));

  const db: Database = {
    version: 1,
    users, roles: BUILT_IN_ROLES.map(r => ({ ...r, permissions: [...r.permissions] })),
    departments, locations, categories, employees, assets, transactions: tx, handovers,
    returns: [
      { id: 'GW-RT-202608-0001', date: '2026-08-12', assetId: 'GW-AST-MOB-0003', employeeId: 'E-012', handoverId: 'GW-HO-202601-0001', receivedByUserId: 'U-AA', conditionReported: 'Good', accessoriesReturned: 'Charger, USB-C cable', employeeRemarks: 'Working fine', inspected: true, inspectedByUserId: 'U-AA', inspectionDate: '2026-08-13', inspectionCondition: 'Good', inspectionOutcome: 'Acceptable', inspectionNotes: 'Minor scuffs; fully functional', employeeSignature: 'G. Sundari', receiverSignature: 'M. Priya', status: 'Completed', createdByUserId: 'U-AA', createdAt: iso('2026-08-12', '16:30:00') },
      { id: 'GW-RT-202609-0001', date: '2026-09-02', assetId: 'GW-AST-MOB-0004', employeeId: 'E-004', handoverId: 'GW-HO-202411-0002', receivedByUserId: 'U-AA', conditionReported: 'Not Working', accessoriesReturned: 'Charger', employeeRemarks: 'Stopped charging', inspected: true, inspectedByUserId: 'U-AA', inspectionDate: '2026-09-03', inspectionCondition: 'Not Working', inspectionOutcome: 'Faulty', inspectionNotes: 'Charging port damaged; battery swollen', employeeSignature: 'S. Karthik', receiverSignature: 'M. Priya', status: 'Completed', createdByUserId: 'U-AA', createdAt: iso('2026-09-02', '15:10:00') },
      { id: 'GW-RT-202609-0002', date: '2026-09-18', assetId: 'GW-AST-CAM-0002', employeeId: 'E-010', handoverId: 'GW-HO-202505-0002', receivedByUserId: 'U-AA', conditionReported: 'Fair', accessoriesReturned: 'Dock, clip', employeeRemarks: 'Charger misplaced', inspected: false, employeeSignature: 'B. Murugan', receiverSignature: 'M. Priya', status: 'Pending Inspection', createdByUserId: 'U-AA', createdAt: iso('2026-09-18', '16:00:00') },
    ],
    transfers: [
      { id: 'GW-TR-202601-0001', date: '2026-01-20', assetId: 'GW-AST-MOB-0003', fromEmployeeId: 'E-008', toEmployeeId: 'E-012', fromDepartmentId: 'D-FIN', toDepartmentId: 'D-OPS', fromLocationId: 'L-HO', toLocationId: 'L-OM', reason: 'Reallocated to OM zone supervision', conditionAtTransfer: 'Good', requestedByUserId: 'U-AA', approval: 'Approved', approvedByUserId: 'U-DH-OPS', approvedAt: iso('2026-01-20', '10:00:00'), approvalComments: 'Approved – OM zone needs a handset', status: 'Completed', completedAt: iso('2026-01-20', '11:00:00'), newHandoverId: 'GW-HO-202601-0001', createdAt: iso('2026-01-19', '15:00:00') },
    ],
    repairs: [
      { id: 'GW-RP-202609-0001', assetId: 'GW-AST-MOB-0004', reportedDate: '2026-09-04', reportedByUserId: 'U-AA', faultDescription: 'Battery swollen; charging port damaged', vendor: 'Xiaomi Authorised Service – Puducherry', estimatedCost: 3200, expectedReturnDate: '2026-09-25', approval: 'Approved', approvedByUserId: 'U-DH-IT', status: 'In Progress', statusBeforeRepair: 'Under Inspection', custodianBeforeRepair: 'E-004', createdAt: iso('2026-09-04', '09:45:00') },
    ],
    incidents: [
      { id: 'GW-INC-202609-0001', assetId: 'GW-AST-MOB-0005', type: 'Lost', incidentDate: '2026-09-10', reportedByEmployeeId: 'E-012', reportedByUserId: 'U-AA', location: 'OM Zone – Ward 14 route', description: 'Phone missing after route inspection; last seen at vehicle cabin.', policeReportNo: 'CSR/2026/1188', status: 'Under Investigation', approval: 'Pending Approval', createdAt: iso('2026-09-10', '18:20:00') },
      { id: 'GW-INC-202608-0001', assetId: 'GW-AST-GPS-0004', type: 'Damaged', incidentDate: '2026-08-21', reportedByEmployeeId: 'E-011', reportedByUserId: 'U-AA', location: 'Vehicle Workshop', description: 'Water ingress found in tracker casing during installation.', investigatedByUserId: 'U-DH-OPS', investigationNotes: 'Unit stored in open rack during rain. No individual negligence.', responsibility: 'No individual responsibility – storage process gap', recoveryAction: 'Storage rack moved indoors', resolution: 'Retired', status: 'Closed', approval: 'Approved', approvedByUserId: 'U-DH-OPS', approvedAt: iso('2026-08-25'), createdAt: iso('2026-08-21', '12:00:00') },
    ],
    verifications: [],
    disposals: [
      { id: 'GW-DSP-202607-0001', assetId: 'GW-AST-LAP-0005', retirementRequestedByUserId: 'U-AA', retirementRequestedAt: iso('2026-07-25'), retirementReason: 'End of life – battery and hinge failure; repair uneconomical', technicalRecommendation: 'Retire; not repairable within 40% of replacement cost', retirementApproval: 'Approved', retirementApprovedByUserId: 'U-SA', retirementApprovedAt: iso('2026-07-30', '14:00:00'), disposalApproval: 'Pending Approval', status: 'Retired', createdAt: iso('2026-07-25') },
      { id: 'GW-DSP-202605-0001', assetId: 'GW-AST-FUR-0002', retirementRequestedByUserId: 'U-AA', retirementRequestedAt: iso('2026-05-08'), retirementReason: 'Rusted; drawers not operable', retirementApproval: 'Approved', retirementApprovedByUserId: 'U-SA', retirementApprovedAt: iso('2026-05-12', '14:00:00'), dataErased: false, disposalMethod: 'Scrap', disposalDate: '2026-05-28', disposalValue: 600, disposalVendor: 'Puducherry Scrap Traders', disposalApproval: 'Approved', disposalApprovedByUserId: 'U-SA', disposalApprovedAt: iso('2026-05-28', '11:00:00'), status: 'Disposed', createdAt: iso('2026-05-08') },
    ],
    approvals: [
      { id: 'AP-000001', entityType: 'Incident', entityId: 'GW-INC-202609-0001', requestedByUserId: 'U-AA', requestedAt: iso('2026-09-10', '18:20:00'), approverRole: 'dept_head', decision: 'Pending Approval' },
      { id: 'AP-000002', entityType: 'Disposal', entityId: 'GW-DSP-202607-0001', requestedByUserId: 'U-AA', requestedAt: iso('2026-08-01'), approverRole: 'super_admin', decision: 'Pending Approval' },
    ],
    documents: [
      { id: 'DOC-000003', assetId: 'GW-AST-MOB-0003', entityType: 'Asset', entityId: 'GW-AST-MOB-0003', documentType: 'Invoice', attachment: { name: 'PV-2025-1187.pdf', type: 'application/pdf', size: 142000 }, uploadedByUserId: 'U-AA', uploadedAt: iso('2025-03-12', '11:05:00') },
      { id: 'DOC-000004', assetId: 'GW-AST-MOB-0003', entityType: 'Handover', entityId: 'GW-HO-202601-0001', documentType: 'Signed Handover Form', attachment: { name: 'GW-HO-202601-0001-signed.pdf', type: 'application/pdf', size: 88000 }, uploadedByUserId: 'U-AA', uploadedAt: iso('2026-01-21', '10:00:00') },
      { id: 'DOC-000001', assetId: 'GW-AST-LAP-0001', entityType: 'Asset', entityId: 'GW-AST-LAP-0001', documentType: 'Invoice', attachment: { name: 'DELL-IN-44821.pdf', type: 'application/pdf', size: 184320 }, uploadedByUserId: 'U-AA', uploadedAt: iso('2024-04-18', '11:00:00') },
      { id: 'DOC-000002', assetId: 'GW-AST-FUR-0002', entityType: 'Disposal', entityId: 'GW-DSP-202605-0001', documentType: 'Proof of Disposal', attachment: { name: 'SCR-2026-044-receipt.jpg', type: 'image/jpeg', size: 93400 }, uploadedByUserId: 'U-AA', uploadedAt: iso('2026-05-28', '11:00:00') },
    ],
    auditLogs: [
      { id: 'AL-000001', at: iso('2026-09-18', '16:00:00'), userId: 'U-AA', userName: 'M. Priya', role: 'asset_admin', action: 'RETURN_CREATED', entityType: 'Return', entityId: 'GW-RT-202609-0002', reason: 'Return – camera replaced with newer unit' },
      { id: 'AL-000002', at: iso('2026-09-10', '18:20:00'), userId: 'U-AA', userName: 'M. Priya', role: 'asset_admin', action: 'INCIDENT_REPORTED', entityType: 'Incident', entityId: 'GW-INC-202609-0001', reason: 'Reported lost during field duty' },
      { id: 'AL-000003', at: iso('2026-09-04', '09:45:00'), userId: 'U-AA', userName: 'M. Priya', role: 'asset_admin', action: 'REPAIR_OPENED', entityType: 'Repair', entityId: 'GW-RP-202609-0001', reason: 'Battery/charging port fault' },
    ],
  };
  return db;
}
