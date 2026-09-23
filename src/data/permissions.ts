// Permission catalogue and the built-in role definitions. Custom roles are stored in the database
// (db.roles) and can be created / edited under Users & Permissions.

export type Permission =
  | 'asset.register' | 'asset.edit' | 'asset.view_all' | 'asset.view_department' | 'asset.view_own'
  | 'handover.create'
  | 'return.create' | 'return.inspect' | 'return.request'
  | 'transfer.request' | 'transfer.approve' | 'transfer.complete'
  | 'repair.create' | 'repair.approve' | 'repair.complete'
  | 'incident.report' | 'incident.investigate' | 'incident.approve'
  | 'verification.perform'
  | 'disposal.request' | 'disposal.approve_retirement' | 'disposal.record' | 'disposal.approve'
  | 'reports.view' | 'reports.export' | 'audit.view' | 'documents.upload' | 'documents.view'
  | 'users.manage' | 'settings.manage';

export const PERMISSION_GROUPS: { title: string; perms: { key: Permission; label: string }[] }[] = [
  { title: 'Assets', perms: [
    { key: 'asset.register', label: 'Register new assets' }, { key: 'asset.edit', label: 'Edit asset details' },
    { key: 'asset.view_all', label: 'View all assets (organisation-wide)' }, { key: 'asset.view_department', label: 'View own department\'s assets' }, { key: 'asset.view_own', label: 'View own assigned assets' },
  ] },
  { title: 'Handover / Return / Transfer', perms: [
    { key: 'handover.create', label: 'Assign assets to employees' },
    { key: 'return.create', label: 'Record returns' }, { key: 'return.inspect', label: 'Inspect returned assets' }, { key: 'return.request', label: 'Request a return' },
    { key: 'transfer.request', label: 'Request transfers' }, { key: 'transfer.approve', label: 'Approve transfers' }, { key: 'transfer.complete', label: 'Complete transfers' },
  ] },
  { title: 'Repair / Incident', perms: [
    { key: 'repair.create', label: 'Send for repair' }, { key: 'repair.approve', label: 'Approve repairs' }, { key: 'repair.complete', label: 'Complete repairs' },
    { key: 'incident.report', label: 'Report loss / damage' }, { key: 'incident.investigate', label: 'Investigate incidents' }, { key: 'incident.approve', label: 'Approve incident resolution' },
  ] },
  { title: 'Retirement / Disposal', perms: [
    { key: 'disposal.request', label: 'Recommend retirement' }, { key: 'disposal.approve_retirement', label: 'Approve retirement' }, { key: 'disposal.record', label: 'Record disposal' }, { key: 'disposal.approve', label: 'Authorize disposal' },
  ] },
  { title: 'Governance', perms: [
    { key: 'reports.view', label: 'View reports' }, { key: 'reports.export', label: 'Export reports (Excel / PDF)' }, { key: 'audit.view', label: 'View audit log' },
    { key: 'documents.upload', label: 'Upload documents' }, { key: 'documents.view', label: 'View documents' },
    { key: 'users.manage', label: 'Manage users and roles' }, { key: 'settings.manage', label: 'Manage master data and settings' },
  ] },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key));

export interface RoleDef {
  code: string;            // e.g. super_admin, or a custom slug like store_keeper
  name: string;            // display name
  description?: string;
  permissions: Permission[];
  builtIn: boolean;        // built-in roles cannot be deleted; super_admin cannot be edited
}

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  asset_admin: [
    'asset.register', 'asset.edit', 'asset.view_all', 'handover.create', 'return.create', 'return.inspect',
    'transfer.request', 'transfer.complete', 'repair.create', 'repair.complete', 'incident.report', 'incident.investigate',
    'verification.perform', 'disposal.request', 'disposal.record', 'reports.view', 'reports.export', 'audit.view',
    'documents.upload', 'documents.view',
  ],
};

export const BUILT_IN_ROLES: RoleDef[] = [
  { code: 'super_admin', name: 'Super Admin', description: 'Complete system access; manages users, roles, categories and settings', permissions: ROLE_PERMISSIONS.super_admin, builtIn: true },
  { code: 'asset_admin', name: 'Asset Administrator', description: 'Registers, issues, transfers, receives, repairs, retires and disposes of assets; generates reports', permissions: ROLE_PERMISSIONS.asset_admin, builtIn: true },
];
