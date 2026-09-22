import type { Database } from './types';
import { BUILT_IN_ROLES } from './permissions';

// Live starting point for a new installation: base master lists and the Super Admin login only.
// Everything else (employees, assets, history) is entered through the application.
export function emptyDatabase(): Database {
  const now = new Date().toISOString();
  const admin = { id: 'U-SA', name: 'System Administrator', email: 'admin@greenwarrior.in', role: 'super_admin' as const, active: true };
  return {
    version: 1,
    users: [admin],
    roles: BUILT_IN_ROLES.map(r => ({ ...r, permissions: [...r.permissions] })),
    departments: [
      { id: 'D-ADM', code: 'ADM', name: 'Administration' },
      { id: 'D-OPS', code: 'OPS', name: 'Operations' },
      { id: 'D-IT', code: 'IT', name: 'Information Technology' },
      { id: 'D-FIN', code: 'FIN', name: 'Finance & Accounts' },
      { id: 'D-HR', code: 'HR', name: 'Human Resources' },
    ],
    locations: [
      { id: 'L-HO', code: 'HO', name: 'Head Office – Puducherry', address: 'Puducherry' },
      { id: 'L-PM', code: 'PM', name: 'PM Zone Depot' },
      { id: 'L-OM', code: 'OM', name: 'OM Zone Depot' },
      { id: 'L-WS', code: 'WS', name: 'Vehicle Workshop' },
    ],
    categories: [
      { id: 'C-MOB', code: 'MOB', name: 'Mobile Phone', verificationIntervalMonths: 6 },
      { id: 'C-LAP', code: 'LAP', name: 'Laptop', verificationIntervalMonths: 6 },
      { id: 'C-TAB', code: 'TAB', name: 'Tablet', verificationIntervalMonths: 6 },
      { id: 'C-GPS', code: 'GPS', name: 'GPS Tracker', verificationIntervalMonths: 3 },
      { id: 'C-CAM', code: 'CAM', name: 'Camera / Body Camera', verificationIntervalMonths: 6 },
      { id: 'C-SIM', code: 'SIM', name: 'SIM Card', verificationIntervalMonths: 12 },
      { id: 'C-FUR', code: 'FUR', name: 'Furniture & Fixtures', verificationIntervalMonths: 12 },
    ],
    employees: [], assets: [], transactions: [], handovers: [], returns: [], transfers: [], repairs: [],
    incidents: [], verifications: [], disposals: [], approvals: [], documents: [],
    auditLogs: [{ id: 'AL-000001', at: now, userId: admin.id, userName: admin.name, role: admin.role, action: 'DATABASE_INITIALISED', entityType: 'System', entityId: 'DB', reason: 'System initialised for live use' }],
  };
}
