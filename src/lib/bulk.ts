// Excel bulk import: template generation, parsing and row validation for assets and employees.
import type { Database, Condition, OwnershipType } from '../data/types';
import { OWNERSHIP_TYPES } from '../data/types';
import { identifierNeeds } from './categoryFields';

export const ASSET_COLUMNS = [
  ['Asset Name', 'REQUIRED'], ['Category', 'REQUIRED — code or name, e.g. MOB or Mobile Phone'], ['Manufacturer', 'REQUIRED'], ['Model', 'REQUIRED'],
  ['Serial Number', 'BY CATEGORY — required for most assets, optional for SIM cards; must be unique'],
  ['IMEI Number', 'BY CATEGORY — required for phones, optional for tablets / GPS / cameras, otherwise leave blank; must be unique'],
  ['SIM Number', 'BY CATEGORY — required for SIM cards, optional where a SIM is fitted, otherwise leave blank; must be unique'],   ['Ownership Type', `optional — one of: ${OWNERSHIP_TYPES.join(', ')} (default Company Owned)`], ['Invoice Number', 'optional'],
  ['Purchase Date', 'REQUIRED — date (YYYY-MM-DD or Excel date)'], ['Purchase Cost', 'REQUIRED — number in ₹'], ['Warranty Start Date', 'REQUIRED — date'], ['Warranty Expiry Date', 'REQUIRED — date'],
  ['Specification', 'REQUIRED'], ['Accessories', 'REQUIRED — comma-separated, e.g. Charger - Moto 33W, Back case x2'], ['Maintenance Notes', 'optional'], ['Remarks', 'optional'],
] as const;


/** Identifier columns whose requirement depends on the asset's category (see categoryFields). */
const BY_CATEGORY: string[] = ['Serial Number', 'IMEI Number', 'SIM Number'];

export const EMPLOYEE_COLUMNS = [
  ['Employee ID', 'optional — e.g. GW-EMP-0031; generated when blank'], ['ERP ID', 'optional — reference in the ERP / payroll system'], ['Employee Name', 'required'], ['Designation', 'required'], ['Department', 'required — code or name'],
  ['Date of Joining', 'date'], ['Work Location', 'required — code or name'], ['Mobile Number', ''], ['Email Address', ''], ['Active', 'Yes / No (default Yes)'],
] as const;

export interface AssetRow {
  name: string; categoryId: string; manufacturer: string; model: string; serialNumber: string; imei?: string; sim?: string; barcode?: string;
  ownershipType: OwnershipType; supplierName: string; invoiceNumber: string; poNumber: string; purchaseDate: string; purchaseCost: number;
  warrantyStart?: string; warrantyExpiry?: string; funding?: string; condition: Condition; departmentId: string; locationId: string;
  specification?: string; accessories?: string; maintenanceNotes?: string; remarks?: string;
}
export interface EmployeeRow { employeeCode?: string; erpId?: string; name: string; designation: string; departmentId: string; dateOfJoining: string; workLocationId: string; mobile: string; email: string; active: boolean }
export interface Parsed<T> { line: number; data: T; errors: string[]; raw: Record<string, unknown> }

const norm = (s: unknown) => String(s ?? '').trim();
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function findCol(row: Record<string, unknown>, name: string): unknown {
  const want = key(name);
  for (const k of Object.keys(row)) if (key(k) === want) return row[k];
  // tolerate shortened headers: "Serial" for "Serial Number", "Category" etc.
  for (const k of Object.keys(row)) if (want.startsWith(key(k)) && key(k).length >= 4) return row[k];
  // …and headers the template annotates: "Serial Number *", "IMEI Number (by category)"
  for (const k of Object.keys(row)) if (key(k).startsWith(want) && want.length >= 4) return row[k];
  return undefined;
}

function toDate(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return undefined;
    const d = new Date(Math.round(v.getTime() / 60000) * 60000);   // Excel day serials land a few ms before midnight; snap to the minute
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') { const d = new Date(Math.round(v - 25569) * 86400 * 1000); return d.toISOString().slice(0, 10); }   // Excel serial → UTC date
  const s = norm(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;   // dd/mm/yyyy
  const d = new Date(s); return isNaN(d.getTime()) ? undefined : toDate(d);
}

function lookup(list: { id: string; code: string; name: string }[], v: unknown): string | undefined {
  const s = key(norm(v)); if (!s) return undefined;
  return (list.find(x => key(x.code) === s) ?? list.find(x => key(x.name) === s) ?? list.find(x => key(x.id) === s))?.id;
}

export function validateAssets(rows: Record<string, unknown>[], db: Database): Parsed<AssetRow>[] {
  const serials = new Set(db.assets.map(a => a.serialNumber.toUpperCase()));
  const imeis = new Set(db.assets.map(a => (a.imei ?? '').toUpperCase()).filter(Boolean));
  const sims = new Set(db.assets.map(a => (a.sim ?? '').toUpperCase()).filter(Boolean));
  const seenS = new Set<string>(), seenI = new Set<string>(), seenM = new Set<string>();
  return rows.map((raw, i) => {
    const e: string[] = [];
    const g = (n: string) => norm(findCol(raw, n));
    const cat = lookup(db.categories, findCol(raw, 'Category')); if (!cat) e.push(`Category "${g('Category')}" not found`);
    // Allocation (department / location / custodian) is set when the asset is assigned; new assets register as Available / New.
    const dept = db.departments[0]?.id, loc = db.locations[0]?.id;
    if (!dept || !loc) e.push('No departments / locations defined in Master Data');
    for (const f of ['Asset Name', 'Manufacturer', 'Model', 'Purchase Date', 'Purchase Cost', 'Warranty Start Date', 'Warranty Expiry Date', 'Specification', 'Accessories']) if (!g(f)) e.push(`${f} is required`);
    // Which identifiers are demanded depends on the category: a SIM card needs its number, a phone its IMEI.
    const need = identifierNeeds(db.categories.find(c => c.id === cat));
    if (need.serial === 'required' && !g('Serial Number')) e.push('Serial Number is required');
    if (need.imei === 'required' && !g('IMEI Number')) e.push(`IMEI Number is required for ${g('Category')}`);
    if (need.sim === 'required' && !g('SIM Number')) e.push(`SIM Number is required for ${g('Category')}`);
    const sn = g('Serial Number').toUpperCase(), imei = g('IMEI Number').toUpperCase(), sim = g('SIM Number').toUpperCase();
    if (sn && (serials.has(sn) || seenS.has(sn))) e.push(`Serial ${sn} already exists`); if (sn) seenS.add(sn);
    if (imei && (imeis.has(imei) || seenI.has(imei))) e.push(`IMEI ${imei} already exists`); if (imei) seenI.add(imei);
    if (sim && (sims.has(sim) || seenM.has(sim))) e.push(`SIM ${sim} already exists`); if (sim) seenM.add(sim);
    const own = OWNERSHIP_TYPES.find(o => key(o) === key(g('Ownership Type'))) ?? (g('Ownership Type') ? undefined : 'Company Owned');
    if (!own) e.push(`Ownership Type "${g('Ownership Type')}" invalid`);
    const cond: Condition = 'New';
    const cost = Number(String(findCol(raw, 'Purchase Cost') ?? '').replace(/[^\d.]/g, '')); if (g('Purchase Cost') && isNaN(cost)) e.push('Purchase Cost is not a number');
    const pd = toDate(findCol(raw, 'Purchase Date')); if (g('Purchase Date') && !pd) e.push('Purchase Date not recognised');
    const ws = toDate(findCol(raw, 'Warranty Start Date')); if (g('Warranty Start Date') && !ws) e.push('Warranty Start Date not recognised');
    const we = toDate(findCol(raw, 'Warranty Expiry Date')); if (g('Warranty Expiry Date') && !we) e.push('Warranty Expiry Date not recognised');
    const data: AssetRow = {
      name: g('Asset Name'), categoryId: cat ?? '', manufacturer: g('Manufacturer'), model: g('Model'), serialNumber: g('Serial Number'),
      imei: need.imei === 'hidden' ? undefined : g('IMEI Number') || undefined,
      sim: need.sim === 'hidden' ? undefined : g('SIM Number') || undefined, barcode: undefined,
      ownershipType: (own ?? 'Company Owned') as OwnershipType, supplierName: '', invoiceNumber: g('Invoice Number'), poNumber: '',
      purchaseDate: pd ?? '', purchaseCost: isNaN(cost) ? 0 : cost, warrantyStart: ws, warrantyExpiry: we,
      funding: undefined, condition: cond, departmentId: dept ?? '', locationId: loc ?? '',
      specification: g('Specification') || undefined, accessories: g('Accessories') || undefined, maintenanceNotes: g('Maintenance Notes') || undefined, remarks: g('Remarks') || undefined,
    };
    return { line: i + 2, data, errors: e, raw };
  });
}

export function validateEmployees(rows: Record<string, unknown>[], db: Database): Parsed<EmployeeRow>[] {
  const codes = new Set(db.employees.map(e => e.employeeCode.toUpperCase()));
  const seen = new Set<string>();
  return rows.map((raw, i) => {
    const e: string[] = [];
    const g = (n: string) => norm(findCol(raw, n));
    const dept = lookup(db.departments, findCol(raw, 'Department')); if (!dept) e.push(`Department "${g('Department')}" not found`);
    const loc = lookup(db.locations, findCol(raw, 'Work Location')); if (!loc) e.push(`Work Location "${g('Work Location')}" not found`);
    for (const f of ['Employee Name', 'Designation']) if (!g(f)) e.push(`${f} is required`);
    const code = g('Employee ID').toUpperCase();
    if (code && (codes.has(code) || seen.has(code))) e.push(`Employee ID ${code} already exists`); if (code) seen.add(code);
    const active = !/^(n|no|false|0|inactive)$/i.test(g('Active'));
    return { line: i + 2, errors: e, raw, data: { employeeCode: code || undefined, erpId: g('ERP ID') || undefined, name: g('Employee Name'), designation: g('Designation'), departmentId: dept ?? '', dateOfJoining: toDate(findCol(raw, 'Date of Joining')) ?? '', workLocationId: loc ?? '', mobile: g('Mobile Number'), email: g('Email Address'), active } };
  });
}

/** Reads the first sheet of an .xlsx/.xls/.csv into header-keyed rows. */
export async function readSheet(file: File, sheetName?: string): Promise<{ rows: Record<string, unknown>[]; sheets: string[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.filter(n => !/^(instructions|lists)$/i.test(n));
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : sheets[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' }).filter(r => Object.values(r).some(v => norm(v) !== ''));
  return { rows, sheets };
}

/** The header row the template writes: * = always required, (by category) = depends on the asset's category. */
export function assetTemplateHeaders(): string[] {
  return ASSET_COLUMNS.map(c => BY_CATEGORY.includes(c[0]) ? `${c[0]} (by category)` : c[1].startsWith('REQUIRED') ? `${c[0]} *` : c[0]);
}

/** Downloads the Excel template: Assets + Employees sheets with headers, an example row, and an Instructions sheet listing valid values. */
export async function downloadTemplate(db: Database) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const assetHeaders = assetTemplateHeaders();
  const examples = [
    // One example per identifier shape: a phone needs an IMEI, a SIM card needs its number, a laptop needs neither.
    ['Samsung Galaxy A35', 'MOB', 'Samsung', 'SM-A356E', 'R58X3A1B2C99', '356938035640000', '', 'Company Owned', 'PV/2026/0001', '2026-09-01', 24999, '2026-09-01', '2027-08-31', '8 GB RAM / 128 GB', 'Charger - 25W, USB-C cable, Back case', '', ''],
    ['Airtel connection', 'SIM', 'Airtel', 'Prepaid', '8991000012345678901', '', '9840000001', 'Company Owned', 'PV/2026/0002', '2026-09-01', 199, '', '', 'Unlimited voice + 2 GB/day', 'SIM tray pin', '', ''],
    ['Dell Latitude 5540', 'LAP', 'Dell', 'Latitude 5540', 'DL5540X9912', '', '', 'Company Owned', 'PV/2026/0003', '2026-09-01', 68500, '2026-09-01', '2029-08-31', 'i5 / 16 GB / 512 GB SSD', 'Charger - 65W, Laptop bag', '', ''],
  ];
  const wa = XLSX.utils.aoa_to_sheet([assetHeaders, ...examples]);
  wa['!cols'] = assetHeaders.map(h => ({ wch: Math.max(14, h.length + 2) }));
  // Mark mandatory columns with a * in the header (cell colours are not supported by the community build of SheetJS).
  XLSX.utils.book_append_sheet(wb, wa, 'Assets');
  const empHeaders = EMPLOYEE_COLUMNS.map(c => c[0]);
  const we = XLSX.utils.aoa_to_sheet([empHeaders, ['', 'ERP-1042', 'A. Kumar', 'Field Supervisor', 'OPS', '2026-09-01', 'PM', '+91 98400 00000', 'kumar@greenwarrior.in', 'Yes']]);
  we['!cols'] = empHeaders.map(h => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, we, 'Employees');
  const instr: (string | number)[][] = [
    ['GREEN WARRIOR — BULK IMPORT TEMPLATE'], [''],
    ['Fill the Assets and/or Employees sheet, one record per row, keep the header row, then upload the file under Assets → Bulk Import.'],
    ['Delete the three example rows before uploading. Categories, departments and locations must already exist (Master Data). Codes or names are both accepted.'],
    ['Columns marked * are always required. Serial Number, IMEI Number and SIM Number are marked "(by category)" — what each category needs is listed under VALID CATEGORIES below.'], [''],
    ['ASSET COLUMNS'], ...ASSET_COLUMNS.map(c => [c[0], c[1]]), [''],
    ['EMPLOYEE COLUMNS'], ...EMPLOYEE_COLUMNS.map(c => [c[0], c[1]]), [''],
    ['VALID CATEGORIES — and the identifiers each one needs'], ['Code', 'Name', 'Serial Number / IMEI Number / SIM Number'],
    ...db.categories.map(c => { const n = identifierNeeds(c); return [c.code, c.name, `${n.serial} / ${n.imei === 'hidden' ? 'leave blank' : n.imei} / ${n.sim === 'hidden' ? 'leave blank' : n.sim}`]; }), [''],
    ['VALID DEPARTMENTS (Employees sheet)'], ...db.departments.map(d => [d.code, d.name]), [''],
    ['VALID LOCATIONS (Employees sheet)'], ...db.locations.map(l => [l.code, l.name]),
  ];
  const wi = XLSX.utils.aoa_to_sheet(instr); wi['!cols'] = [{ wch: 28 }, { wch: 60 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(wb, wi, 'Instructions');
  XLSX.writeFile(wb, 'GW-Asset-Bulk-Import-Template.xlsx');
}
