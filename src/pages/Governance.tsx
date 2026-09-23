import { Fragment, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import { type AuditLog, type AssetDocument, type Attachment, type User, type Role, type Employee, type Category, type Department, type Location, type RoleDef } from '../data/types';
import { PERMISSION_GROUPS, type Permission } from '../data/store';
import { PageHead, Section, Status, DataTable, Input, PasswordInput, Select, SearchSelect, FileInput, AttachmentLink, Modal, RowActions, useAction, fmtDateTime, fmtSize, type Column, DateInput } from '../components/ui';
import { getDriveConfig, setDriveConfig, testDriveConnection, signOutDrive, DEFAULT_FOLDER_ID, type DriveConfig } from '../lib/drive';
import { exportRows } from '../lib/export';
import { askReason, askConfirm } from '../components/Dialog';
import { loadSampleData } from '../data/sample';

// ---------- 13. Audit Log ----------
export function AuditLogPage() {
  const { db, store } = useStore();
  const [q, setQ] = useState('');
  const [user, setUser] = useState('');
  const rows = db.auditLogs.filter(l => (!user || l.userId === user) && (!q || [l.action, l.entityId, l.entityType, l.reason, l.details ?? ''].some(x => x.toLowerCase().includes(q.toLowerCase()))));
  const columns: Column<AuditLog>[] = [
    { key: 'at', header: 'Date / Time', render: l => fmtDateTime(l.at) },
    { key: 'userName', header: 'User', render: l => <>{l.userName}<div className="muted small">{store.roleName(l.role)}</div></> },
    { key: 'action', header: 'Action', render: l => <span className="mono">{l.action}</span> },
    { key: 'entity', header: 'Entity', render: l => <>{l.entityType} <span className="mono">{l.entityId}</span></> },
    { key: 'reason', header: 'Reason', render: l => l.reason },
    { key: 'details', header: 'Details', render: l => l.details ?? '' },
  ];
  return (
    <>
      <PageHead crumbs="Governance" title="Audit Log" actions={store.can('reports.export') && <button className="btn" onClick={() => exportRows('Audit-Log', rows.map(l => ({ 'Date / Time': fmtDateTime(l.at), User: l.userName, Role: l.role, Action: l.action, Entity: l.entityType, Reference: l.entityId, Reason: l.reason, Details: l.details ?? '' })), 'xlsx')}>Export Excel</button>} />
      <div className="rule-note">Every important action records the user, role, date, time and reason (Rule 11). Entries are immutable.</div>
      <div className="toolbar">
        <input className="grow" placeholder="Search action, reference or reason…" value={q} onChange={e => setQ(e.target.value)} />
        <SearchSelect className="tb" value={user} onChange={e => setUser(e.target.value)} placeholder="All users" options={db.users.map(u => ({ value: u.id, label: u.name }))} />
        <span className="muted small">{rows.length} entries</span>
      </div>
      <Section title="Audit Trail" compact><DataTable rows={rows} columns={columns} /></Section>
    </>
  );
}

// ---------- 14. Document Management ----------
export function DocumentsPage() {
  const { db, store } = useStore();
  const [sp] = useSearchParams();
  const { run, Messages } = useAction();
  const [assetId, setAssetId] = useState(sp.get('asset') ?? '');
  const [entityType, setEntityType] = useState('Asset');
  const [entityId, setEntityId] = useState(sp.get('asset') ?? '');
  const [docType, setDocType] = useState('Invoice');
  const [att, setAtt] = useState<Attachment>();
  const [remarks, setRemarks] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const visibleIds = new Set(store.visibleAssets().map(a => a.id));
  const rows = db.documents.filter(d => !d.assetId || visibleIds.has(d.assetId)).filter(d => (!type || d.documentType === type) && (!q || [d.attachment.name, d.entityId, d.assetId ?? '', d.documentType].some(x => x.toLowerCase().includes(q.toLowerCase())))).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const columns: Column<AssetDocument>[] = [
    { key: 'type', header: 'Document Type', render: d => d.documentType },
    { key: 'file', header: 'File', render: d => <>{d.attachment.name} <span className="muted small">({fmtSize(d.attachment.size)})</span></> },
    { key: 'asset', header: 'Asset', render: d => <span className="mono">{d.assetId ?? '—'}</span> },
    { key: 'entity', header: 'Linked Record', render: d => <>{d.entityType} <span className="mono">{d.entityId}</span></> },
    { key: 'by', header: 'Uploaded', render: d => <>{fmtDateTime(d.uploadedAt)}<div className="muted small">{store.userName(d.uploadedByUserId)}</div></> },
    { key: 'remarks', header: 'Remarks', render: d => d.remarks ?? '' },
    { key: 'dl', header: '', render: d => <AttachmentLink a={d.attachment} /> },
  ];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!att) return;
    const ok = run(() => store.uploadDocument({ assetId: assetId || undefined, entityType, entityId: entityId || assetId, documentType: docType, attachment: att, remarks }), 'Document uploaded.');
    if (ok !== undefined) { setRemarks(''); setAtt(undefined); }
  };
  const entityOptions: Record<string, { value: string; label: string }[]> = {
    Asset: db.assets.map(a => ({ value: a.id, label: `${a.id} — ${a.name}` })),
    Handover: db.handovers.map(h => ({ value: h.id, label: h.id })), Return: db.returns.map(r => ({ value: r.id, label: r.id })), Transfer: db.transfers.map(t => ({ value: t.id, label: t.id })),
    Repair: db.repairs.map(r => ({ value: r.id, label: r.id })), Incident: db.incidents.map(i => ({ value: i.id, label: i.id })), Disposal: db.disposals.map(d => ({ value: d.id, label: d.id })),
  };
  return (
    <>
      <PageHead crumbs="Governance" title="Document Management" />
      <Messages />
      {store.can('documents.upload') && (
        <form onSubmit={submit}>
          <Section title="Upload Document">
            <div className="form-grid cols-4">
              <Select label="Asset" value={assetId} onChange={e => { setAssetId(e.target.value); if (entityType === 'Asset') setEntityId(e.target.value); }} placeholder="Not asset-specific" options={entityOptions.Asset} />
              <Select label="Linked Record Type" value={entityType} onChange={e => { setEntityType(e.target.value); setEntityId(e.target.value === 'Asset' ? assetId : ''); }} options={Object.keys(entityOptions).map(k => ({ value: k, label: k === 'Handover' ? 'Assignment' : k }))} />
              <Select label="Linked Record" required value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="Select…" options={entityOptions[entityType]} />
              <Select label="Document Type" value={docType} onChange={e => setDocType(e.target.value)} options={['Invoice', 'Warranty', 'Photograph', 'Purchase Order', 'Quotation', 'Service Report', 'Signed Assignment Form', 'Signed Return Form', 'Incident Evidence', 'Police Report', 'Proof of Disposal', 'Data Erasure Certificate', 'Other'].map(t => ({ value: t, label: t }))} />
              <FileInput label="File" required span={2} accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" tag={assetId || entityId || undefined} kind={docType} onChange={setAtt} />
              <Input label="Remarks" span={2} value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>
            <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" type="submit" disabled={!att || !entityId}>Upload</button></div>
          </Section>
        </form>
      )}
      <div className="toolbar">
        <input className="grow" placeholder="Search file, asset or reference…" value={q} onChange={e => setQ(e.target.value)} />
        <SearchSelect className="tb" value={type} onChange={e => setType(e.target.value)} placeholder="All types" options={[...new Set(db.documents.map(d => d.documentType))].map(t => ({ value: t, label: t }))} />
        <span className="muted small">{rows.length} documents</span>
      </div>
      <Section title="Document Library" compact><DataTable rows={rows} columns={columns} /></Section>
    </>
  );
}

// ---------- 12. Users, Roles & Permissions ----------
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function UsersPage() {
  const { db, store } = useStore();
  const { run, Messages } = useAction();
  const [edit, setEdit] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const isNewUser = !!edit && !db.users.some(u => u.id === edit.id);
  const live = store.mode === 'supabase';
  const describe = (r: 'created' | 'created_needs_confirmation' | 'already_exists', email: string) =>
    r === 'created' ? `Login created for ${email}. They can sign in now.` :
    r === 'created_needs_confirmation' ? `Login created. A confirmation email was sent to ${email}; they must click it before signing in.` :
    `${email} already has a login; use "Send password reset" if they cannot sign in.`;
  const saveUser = async () => {
    if (!edit) return;
    if (live && isNewUser && password.length < 8) { setLoginMsg('Set an initial password of at least 8 characters.'); return; }
    const ok = run(() => store.saveUser(edit), 'User saved.');
    if (ok === undefined) return;
    if (live && isNewUser) {
      setLoginBusy(true);
      try { const r = await store.createLogin(edit.id, password); setLoginMsg(describe(r, edit.email)); setPassword(''); }
      catch (e) { setLoginMsg(`User saved, but the login was not created: ${e instanceof Error ? e.message : String(e)}`); return; }
      finally { setLoginBusy(false); }
    }
    if (!(live && isNewUser)) setEdit(null);
  };
  const [showEmpLogins, setShowEmpLogins] = useState(false);
  // Staff logins created from an employee record are managed there; this page is for administrative accounts.
  const isEmployeeLogin = (u: User) => u.role === 'employee' && !!u.employeeId;
  const userRows = showEmpLogins ? db.users : db.users.filter(u => !isEmployeeLogin(u));
  const empLoginCount = db.users.filter(isEmployeeLogin).length;
  const [roleEdit, setRoleEdit] = useState<RoleDef | null>(null);
  const [isNewRole, setIsNewRole] = useState(false);
  const roles = db.roles;
  const columns: Column<User>[] = [
    { key: 'name', header: 'Name' }, { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: u => store.roleName(u.role) },
    { key: 'emp', header: 'Employee', render: u => store.employee(u.employeeId)?.employeeCode ?? '—' },
    { key: 'dept', header: 'Department', render: u => store.deptName(u.departmentId) },
    { key: 'active', header: 'Status', render: u => <Status value={u.active ? 'Active' : 'Inactive'} /> },
    { key: 'actions', header: 'Actions', render: u => <RowActions label={`user ${u.name}`} blockers={store.userDeleteBlockers(u.id)} onEdit={() => { setLoginMsg(null); setPassword(''); setEdit({ ...u }); }} onDelete={reason => run(() => store.deleteUser(u.id, reason), 'User deleted.')} /> },
  ];
  const roleRows = roles.map(r => ({ ...r, id: r.code }));
  const togglePerm = (p: Permission) => roleEdit && setRoleEdit({ ...roleEdit, permissions: roleEdit.permissions.includes(p) ? roleEdit.permissions.filter(x => x !== p) : [...roleEdit.permissions, p] });
  const setGroup = (perms: Permission[], on: boolean) => roleEdit && setRoleEdit({ ...roleEdit, permissions: on ? [...new Set([...roleEdit.permissions, ...perms])] : roleEdit.permissions.filter(x => !perms.includes(x)) });

  return (
    <>
      <PageHead crumbs="Governance" title="Users, Roles and Permissions" actions={<>
        <button className="btn" onClick={() => { setIsNewRole(true); setRoleEdit({ code: '', name: '', description: '', permissions: [], builtIn: false }); }}>Add Role</button>
        <button className="btn primary" onClick={() => { setLoginMsg(null); setPassword(''); setEdit({ id: `U-${Date.now().toString(36).toUpperCase()}`, name: '', email: '', role: 'employee', active: true }); }}>Add User</button>
      </>} />
      <Messages />
      <Section title="Users" compact right={empLoginCount > 0
        ? <label className="checkbox small" style={{ textTransform: 'none', letterSpacing: 0 }}><input type="checkbox" checked={showEmpLogins} onChange={e => setShowEmpLogins(e.target.checked)} /> Show {empLoginCount} employee login(s) — normally managed on the employee record</label>
        : undefined}>
        <DataTable rows={userRows} columns={columns} onRowClick={u => { setLoginMsg(null); setPassword(''); setEdit({ ...u }); }} />
      </Section>

      <Section title="Roles" compact right={<span className="muted small">Click a role to view or edit its permissions</span>}>
        <DataTable rows={roleRows} onRowClick={r => { setIsNewRole(false); setRoleEdit({ code: r.code, name: r.name, description: r.description, permissions: [...r.permissions], builtIn: r.builtIn }); }} columns={[
          { key: 'name', header: 'Role' }, { key: 'code', header: 'Code', render: r => <span className="mono">{r.code}</span> },
          { key: 'description', header: 'Description', render: r => r.description ?? '' },
          { key: 'perms', header: 'Permissions', num: true, render: r => r.permissions.length },
          { key: 'users', header: 'Users', num: true, render: r => db.users.filter(u => u.role === r.code).length },
          { key: 'type', header: 'Type', render: r => <Status value={r.builtIn ? 'Built-in' : 'Custom'} /> },
          { key: 'actions', header: 'Actions', render: r => <RowActions label={`role ${r.name}`} blockers={store.roleDeleteBlockers(r.code)} onEdit={() => { setIsNewRole(false); setRoleEdit({ code: r.code, name: r.name, description: r.description, permissions: [...r.permissions], builtIn: r.builtIn }); }} onDelete={reason => run(() => store.deleteRole(r.code, reason), 'Role deleted.')} /> },
        ]} />
      </Section>

      <Section title="Role Permission Matrix" compact>
        <div className="table-wrap"><table className="data matrix">
          <thead><tr><th>Permission</th>{roles.map(r => <th key={r.code} style={{ textAlign: 'center' }}>{r.name}</th>)}</tr></thead>
          <tbody>{PERMISSION_GROUPS.map(g => <Fragment key={g.title}><tr><td colSpan={roles.length + 1} style={{ background: 'var(--grey-50)', fontWeight: 600 }}>{g.title}</td></tr>
            {g.perms.map(p => <tr key={p.key}><td>{p.label} <span className="mono muted small">{p.key}</span></td>{roles.map(r => <td key={r.code} style={{ textAlign: 'center' }}>{r.permissions.includes(p.key) ? <span className="tick" aria-label="Allowed">✓</span> : <span className="muted">–</span>}</td>)}</tr>)}</Fragment>)}</tbody>
        </table></div>
      </Section>

      {edit && (
        <Modal title={db.users.some(u => u.id === edit.id) ? `Edit ${edit.name}` : 'New User'} onClose={() => setEdit(null)} footer={<>
          {db.users.some(u => u.id === edit.id) && (() => { const blockers = store.userDeleteBlockers(edit.id); return (
            <button className="btn danger" style={{ marginRight: 'auto' }} title={blockers.length ? `Cannot delete: ${blockers.join('; ')}` : 'Permanently delete this login'} disabled={blockers.length > 0}
              onClick={async () => { const reason = await askReason({ title: `Delete user ${edit.name}`, message: 'This cannot be undone. The deletion and its reason are recorded in the audit log.' }); if (reason) { const ok = run(() => store.deleteUser(edit.id, reason), 'User deleted.'); if (ok !== undefined) setEdit(null); } }}>
              {blockers.length ? 'Delete (has history — deactivate instead)' : 'Delete User'}
            </button>); })()}
          <button className="btn ghost" onClick={() => { setEdit(null); setLoginMsg(null); setPassword(''); }}>{loginMsg && isNewUser ? 'Close' : 'Cancel'}</button><button className="btn primary" disabled={loginBusy || (live && isNewUser && password.length < 8) || !edit.name.trim() || !edit.email.trim()} title={live && isNewUser && password.length < 8 ? 'Enter an initial password of at least 8 characters' : undefined} onClick={saveUser}>{loginBusy ? 'Creating login…' : isNewUser && live ? 'Save & Create Login' : 'Save'}</button></>}>
          <div className="form-grid cols-2">
            <Input label="Full Name" required value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
            <Input label="Email" type="email" required value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} />
            <Select label="Role" value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value as Role })} options={roles.map(r => ({ value: r.code, label: r.name }))} hint={store.roleDef(edit.role)?.description} />
            <Select label="Linked Employee" value={edit.employeeId ?? ''} onChange={e => { const em = store.employee(e.target.value); setEdit({ ...edit, employeeId: e.target.value || undefined, departmentId: em?.departmentId ?? edit.departmentId }); }} placeholder="None" options={db.employees.map(e => ({ value: e.id, label: `${e.name} (${e.employeeCode})` }))} />
            <Select label="Department (for Department Head scope)" value={edit.departmentId ?? ''} onChange={e => setEdit({ ...edit, departmentId: e.target.value || undefined })} placeholder="None" options={db.departments.map(d => ({ value: d.id, label: d.name }))} hint="Create, edit or delete departments under Master Data → Departments" />
            <label className="checkbox field"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
            {live && isNewUser && <PasswordInput label="Initial password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              hint={`${password.length < 8 ? `${password.length}/8 characters — at least 8 required` : `${password.length} characters ✓`}. Share it with the person; a reset link can be sent later from this dialog.`} />}
            {live && !isNewUser && (
              <div className="field span-full">
                <label>Login (Supabase Auth)</label>
                <div className="btn-row">
                  <button type="button" className="btn sm" disabled={loginBusy} onClick={async () => { const pw = await askReason({ title: `Create login for ${edit.email}`, message: 'Set an initial password for this person. A reset link can be sent later from this dialog.', confirmLabel: 'Create login', danger: false, reason: { label: 'Initial password', placeholder: 'At least 8 characters', minLength: 8 } }); if (!pw) return; setLoginBusy(true); try { setLoginMsg(describe(await store.createLogin(edit.id, pw), edit.email)); } catch (e) { setLoginMsg(e instanceof Error ? e.message : String(e)); } finally { setLoginBusy(false); } }}>Create login</button>
                  <button type="button" className="btn sm" disabled={loginBusy} onClick={async () => { setLoginBusy(true); try { await store.sendPasswordReset(edit.id); setLoginMsg(`Password reset link emailed to ${edit.email}.`); } catch (e) { setLoginMsg(e instanceof Error ? e.message : String(e)); } finally { setLoginBusy(false); } }}>Send password reset</button>
                  <span className="hint">Deactivating the user (untick Active) blocks sign-in immediately.</span>
                </div>
              </div>
            )}
            {loginMsg && <div className="alert" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>{loginMsg}</div>}
          </div>
        </Modal>
      )}

      {roleEdit && (() => {
        const locked = roleEdit.code === 'super_admin';
        const blockers = isNewRole ? [] : store.roleDeleteBlockers(roleEdit.code);
        return (
        <Modal title={isNewRole ? 'New Role' : `${roleEdit.name} — permissions`} onClose={() => setRoleEdit(null)} wide footer={<>
          {!isNewRole && <button className="btn danger" style={{ marginRight: 'auto' }} disabled={blockers.length > 0} title={blockers.length ? `Cannot delete: ${blockers.join('; ')}` : 'Delete this role'}
            onClick={async () => { const reason = await askReason({ title: `Delete role ${roleEdit.name}`, message: 'This cannot be undone. The deletion and its reason are recorded in the audit log.' }); if (reason) { if (run(() => store.deleteRole(roleEdit.code, reason), 'Role deleted.') !== undefined) setRoleEdit(null); } }}>
            {blockers.length ? `Delete (${blockers.join('; ')})` : 'Delete Role'}</button>}
          <button className="btn ghost" onClick={() => setRoleEdit(null)}>Cancel</button>
          {!locked && <button className="btn primary" onClick={() => { if (run(() => store.saveRole(roleEdit, isNewRole ? 'Role created' : 'Permissions updated'), 'Role saved.') !== undefined) setRoleEdit(null); }}>{isNewRole ? 'Create Role' : 'Save Permissions'}</button>}
        </>}>
          {locked && <div className="alert">The Super Admin role always has every permission and cannot be changed.</div>}
          <div className="form-grid cols-3">
            <Input label="Role Name" required value={roleEdit.name} disabled={roleEdit.builtIn} onChange={e => setRoleEdit({ ...roleEdit, name: e.target.value, code: isNewRole ? slug(e.target.value) : roleEdit.code })} />
            <Input label="Code" value={roleEdit.code} readOnly hint={isNewRole ? 'Generated from the name' : undefined} />
            <Input label="Description" value={roleEdit.description ?? ''} disabled={locked} onChange={e => setRoleEdit({ ...roleEdit, description: e.target.value })} />
          </div>
          <div className="btn-row" style={{ margin: '12px 0 6px' }}>
            <span className="muted small">{roleEdit.permissions.length} of {PERMISSION_GROUPS.reduce((n, g) => n + g.perms.length, 0)} permissions selected</span>
            {!locked && <><button type="button" className="btn sm ghost" onClick={() => setGroup(PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key)), true)}>Select all</button><button type="button" className="btn sm ghost" onClick={() => setGroup(PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key)), false)}>Clear</button></>}
          </div>
          <div className="grid cols-2">
            {PERMISSION_GROUPS.map(g => (
              <Section key={g.title} title={g.title} right={!locked && <label className="checkbox small"><input type="checkbox" checked={g.perms.every(p => roleEdit.permissions.includes(p.key))} onChange={e => setGroup(g.perms.map(p => p.key), e.target.checked)} /> all</label>}>
                {g.perms.map(p => <label key={p.key} className="checkbox" style={{ padding: '4px 0' }}><input type="checkbox" disabled={locked} checked={roleEdit.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} /> {p.label} <span className="mono muted small">{p.key}</span></label>)}
              </Section>
            ))}
          </div>
        </Modal>); })()}
    </>
  );
}

// ---------- Master data: employees, categories, departments, locations ----------
const describeLogin = (r: 'created' | 'created_needs_confirmation' | 'already_exists', email: string) =>
  r === 'created' ? `Login created for ${email}. They can sign in now.` :
  r === 'created_needs_confirmation' ? `Login created. A confirmation email was sent to ${email}; they must click it before signing in.` :
  `${email} already has a login — the password has not been changed. Use “Send password reset” if they cannot sign in.`;

export function SettingsPage() {
  const { db, store } = useStore();
  const { run, Messages } = useAction();
  const [spTab] = useSearchParams();
  const tabs = ['employees', 'categories', 'departments', 'locations', 'drive', 'data'] as const;
  const [tab, setTab] = useState<typeof tabs[number]>(() => (tabs as readonly string[]).includes(spTab.get('tab') ?? '') ? spTab.get('tab') as typeof tabs[number] : 'employees');
  const [drive, setDrive] = useState<DriveConfig>(getDriveConfig);
  const [driveMsg, setDriveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [testing, setTesting] = useState(false);
  const [emp, setEmp] = useState<Employee | null>(null);
  const [empPw, setEmpPw] = useState('');                 // initial password when giving an employee a login
  const [empLoginMsg, setEmpLoginMsg] = useState<string | null>(null);
  const [empLoginBusy, setEmpLoginBusy] = useState(false);
  const [cat, setCat] = useState<Category | null>(null);
  const [dep, setDep] = useState<Department | null>(null);
  const [loc, setLoc] = useState<Location | null>(null);
  const nextEmpCode = `GW-EMP-${String(db.employees.length + 1).padStart(4, '0')}`;
  const openEmp = (e: Employee) => { setEmpPw(''); setEmpLoginMsg(null); setEmp(e); };
  return (
    <>
      <PageHead crumbs="Governance" title="Master Data & Settings" />
      <Messages />
      <div className="tabs">{(['employees', 'categories', 'departments', 'locations', 'drive', 'data'] as const).map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'data' ? 'Data' : t === 'drive' ? 'Google Drive' : t[0].toUpperCase() + t.slice(1)}</button>)}</div>

      {tab === 'employees' && <Section title="Employees" compact right={<button className="btn sm primary" onClick={() => openEmp({ id: `E-${Date.now().toString(36).toUpperCase()}`, employeeCode: nextEmpCode, erpId: '', name: '', designation: '', departmentId: db.departments[0]?.id ?? '', dateOfJoining: '', workLocationId: db.locations[0]?.id ?? '', mobile: '', email: '', active: true })}>Add Employee</button>}>
        <DataTable rows={db.employees} onRowClick={e => openEmp({ ...e })} columns={[{ key: 'employeeCode', header: 'Employee ID' }, { key: 'erpId', header: 'ERP ID', render: e => e.erpId || '—' }, { key: 'name', header: 'Name' }, { key: 'designation', header: 'Designation' }, { key: 'dept', header: 'Department', render: e => store.deptName(e.departmentId) }, { key: 'loc', header: 'Location', render: e => store.locName(e.workLocationId) }, { key: 'mobile', header: 'Mobile' }, { key: 'assets', header: 'Assets Held', num: true, render: e => db.assets.filter(a => a.custodianEmployeeId === e.id).length }, { key: 'active', header: 'Status', render: e => <Status value={e.active ? 'Active' : 'Inactive'} /> },
          { key: 'actions', header: 'Actions', render: e => <RowActions label={`employee ${e.name}`} blockers={store.employeeDeleteBlockers(e.id)} onEdit={() => openEmp({ ...e })} onDelete={reason => run(() => store.deleteEmployee(e.id, reason), 'Employee deleted.')} /> }]} />
      </Section>}
      {tab === 'categories' && <Section title="Asset Categories" compact right={<button className="btn sm primary" onClick={() => setCat({ id: `C-${Date.now().toString(36).toUpperCase()}`, code: '', name: '', verificationIntervalMonths: 6 })}>Add Category</button>}>
        <DataTable rows={db.categories} onRowClick={c => setCat({ ...c })} columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Category' }, { key: 'prefix', header: 'Asset ID Format', render: c => <span className="mono">GW-AST-{c.code}-0001</span> }, { key: 'count', header: 'Assets', num: true, render: c => db.assets.filter(a => a.categoryId === c.id).length },
          { key: 'actions', header: 'Actions', render: c => <RowActions label={`category ${c.name}`} blockers={store.categoryDeleteBlockers(c.id)} onEdit={() => setCat({ ...c })} onDelete={reason => run(() => store.deleteCategory(c.id, reason), 'Category deleted.')} /> }]} />
      </Section>}
      {tab === 'departments' && <Section title="Departments" compact right={<button className="btn sm primary" onClick={() => setDep({ id: `D-${Date.now().toString(36).toUpperCase()}`, code: '', name: '' })}>Add Department</button>}>
        <DataTable rows={db.departments} onRowClick={d => setDep({ ...d })} columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Department' }, { key: 'head', header: 'Department Head', render: d => store.employeeName(d.headEmployeeId) }, { key: 'count', header: 'Assets', num: true, render: d => db.assets.filter(a => a.departmentId === d.id).length },
          { key: 'actions', header: 'Actions', render: d => <RowActions label={`department ${d.name}`} blockers={store.departmentDeleteBlockers(d.id)} onEdit={() => setDep({ ...d })} onDelete={reason => run(() => store.deleteDepartment(d.id, reason), 'Department deleted.')} /> }]} />
      </Section>}
      {tab === 'locations' && <Section title="Locations" compact right={<button className="btn sm primary" onClick={() => setLoc({ id: `L-${Date.now().toString(36).toUpperCase()}`, code: '', name: '' })}>Add Location</button>}>
        <DataTable rows={db.locations} onRowClick={l => setLoc({ ...l })} columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Location' }, { key: 'count', header: 'Assets', num: true, render: l => db.assets.filter(a => a.locationId === l.id).length },
          { key: 'actions', header: 'Actions', render: l => <RowActions label={`location ${l.name}`} blockers={store.locationDeleteBlockers(l.id)} onEdit={() => setLoc({ ...l })} onDelete={reason => run(() => store.deleteLocation(l.id, reason), 'Location deleted.')} /> }]} />
      </Section>}
      {tab === 'drive' && (
        <Section title="Google Drive — attachment storage">
          <p>When enabled, every uploaded invoice, warranty, asset photograph, quotation, service report, disposal proof and library document is stored in the shared Drive folder, inside a sub-folder named after the Asset ID. The record keeps a link to the Drive file.</p>
          <div className="form-grid cols-2">
            <Input label="Drive folder ID" required value={drive.folderId} onChange={e => setDrive({ ...drive, folderId: e.target.value.trim() })} hint={`From the folder URL: drive.google.com/drive/folders/<ID>. Default: "Asset proof" (${DEFAULT_FOLDER_ID})`} />
            <Input label="Google OAuth Client ID" required value={drive.clientId} onChange={e => setDrive({ ...drive, clientId: e.target.value.trim() })} hint="Ends with .apps.googleusercontent.com — created once in Google Cloud Console (see steps below)" />
            <label className="checkbox field"><input type="checkbox" checked={drive.enabled} onChange={e => setDrive({ ...drive, enabled: e.target.checked })} /> Enable Google Drive storage for new uploads</label>
          </div>
          {driveMsg && <div className={`alert ${driveMsg.ok ? 'success' : 'error'}`} style={{ marginTop: 12 }}>{driveMsg.text}</div>}
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => { setDriveConfig(drive); setDriveMsg({ text: 'Drive settings saved.', ok: true }); }}>Save</button>
            <button className="btn" disabled={testing || !drive.clientId || !drive.folderId} onClick={async () => {
              setDriveConfig(drive); setTesting(true); setDriveMsg(null);
              try { const r = await testDriveConnection(); setDrive(d => ({ ...d, folderName: r.folderName, account: r.account })); setDriveConfig({ ...drive, folderName: r.folderName, account: r.account });
                setDriveMsg({ text: r.canWrite ? `Connected as ${r.account}. Folder "${r.folderName}" is writable.` : `Connected as ${r.account}, but this account can only VIEW "${r.folderName}". Ask the folder owner (greenwarriorit19@gmail.com) to share it with Editor access, or sign in with the owner account.`, ok: r.canWrite }); }
              catch (e) { setDriveMsg({ text: e instanceof Error ? e.message : String(e), ok: false }); }
              finally { setTesting(false); }
            }}>{testing ? 'Connecting…' : 'Connect & test'}</button>
            <button className="btn ghost" onClick={() => { signOutDrive(); setDriveMsg({ text: 'Signed out of Google Drive for this session.', ok: true }); }}>Sign out</button>
            {drive.account && <span className="muted small">Last connected: {drive.account} → {drive.folderName}</span>}
          </div>
          <h3 style={{ marginTop: 18 }}>One-time setup (Google Cloud Console)</h3>
          <ol className="small" style={{ lineHeight: 1.7 }}>
            <li>Sign in at <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> with the Google account that owns the folder (greenwarriorit19@gmail.com) and create a project, e.g. <i>GW Asset Management</i>.</li>
            <li><b>APIs &amp; Services → Library</b> → enable <b>Google Drive API</b>.</li>
            <li><b>APIs &amp; Services → OAuth consent screen</b> → External → app name "Green Warrior Asset Management" → add the scope <code>…/auth/drive</code> → add the Google accounts of staff who will upload as <b>Test users</b> (or publish the app).</li>
            <li><b>Credentials → Create credentials → OAuth client ID</b> → type <b>Web application</b> → Authorized JavaScript origins: <code>{window.location.origin}</code> (add the production URL later) → Create.</li>
            <li>Copy the <b>Client ID</b> into the field above, tick Enable, Save, then <b>Connect &amp; test</b> — a Google sign-in window opens; choose an account that has Editor access to the folder.</li>
          </ol>
        </Section>
      )}
      {tab === 'data' && <Section title="Data">
        {store.mode === 'supabase' ? <p>Data is stored in the shared <b>Supabase</b> database; every user sees the same live records and Supabase keeps the backups. The JSON download below is an extra offline copy.</p> : <p>This build stores data in the browser (localStorage) so it runs without a server. Take a <b>JSON backup</b> regularly and keep it outside this PC; <b>Restore</b> loads a backup into this browser.</p>}
        <div className="btn-row">
          <button className="btn" onClick={async () => { if (await askConfirm({ title: 'Load sample data', message: 'Adds clearly-labelled test records (4 employees, 10 assets, assignments, a return, a repair, an incident and a retirement) through the normal workflows so every form can be tried. In the shared database they stay in the permanent history like any other record.', confirmLabel: 'Load sample data' })) run(() => loadSampleData(store), 'Sample data loaded.'); }}>Load sample data (testing)</button>
          <button className="btn" onClick={() => { const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(store.exportJson()); a.download = `gw-asset-db-${new Date().toISOString().slice(0, 10)}.json`; a.click(); }}>Download JSON backup</button>
          {store.mode === 'local' && <><label className="btn" style={{ display: 'inline-block' }}>Restore from JSON backup<input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const ok = await askConfirm({ title: 'Restore backup', message: `Replace ALL current data with the contents of ${f.name}? This cannot be undone.`, confirmLabel: 'Restore', danger: true }); e.target.value = ''; if (!ok) return; const txt = await f.text(); run(() => store.importDatabase(txt), 'Backup restored.'); }} /></label>
          <button className="btn danger" onClick={async () => { if (await askConfirm({ title: 'Reset to empty database', message: 'Removes ALL records (assets, employees, handovers, history, users except Super Admin). Departments, locations and categories are kept. This cannot be undone.', confirmLabel: 'Reset database', danger: true })) store.startEmpty(); }}>Reset to empty database</button></>}
        </div>
      </Section>}

      {emp && <Modal title={emp.name || 'New Employee'} onClose={() => { setEmp(null); setEmpPw(''); setEmpLoginMsg(null); }} footer={<>
          {db.employees.some(e => e.id === emp.id) && (() => { const blockers = store.employeeDeleteBlockers(emp.id); return (
            <button className="btn danger" style={{ marginRight: 'auto' }} title={blockers.length ? `Cannot delete: ${blockers.join('; ')}` : 'Permanently delete this employee'} disabled={blockers.length > 0}
              onClick={async () => { const reason = await askReason({ title: `Delete employee ${emp.name}`, message: 'This cannot be undone. The deletion and its reason are recorded in the audit log.' }); if (reason) { if (run(() => store.deleteEmployee(emp.id, reason), 'Employee deleted.') !== undefined) setEmp(null); } }}>
              {blockers.length ? 'Delete (has asset history — mark Inactive instead)' : 'Delete Employee'}
            </button>); })()}
          <button className="btn ghost" onClick={() => setEmp(null)}>Cancel</button><button className="btn primary" onClick={() => { if (run(() => store.saveEmployee(emp), 'Employee saved.') !== undefined) setEmp(null); }}>Save</button></>}>
        {(() => {
          const saved = db.employees.some(x => x.id === emp.id);
          const login = saved ? store.employeeLogin(emp.id) : undefined;
          const live = store.mode === 'supabase';
          const canLogin = store.can('users.manage');
          const pwHint = !live ? 'Logins exist only when the app is connected to the shared database.'
            : !saved ? 'Save the employee first, then reopen this record to set a password.'
            : login ? 'This email ID already has a password. Passwords are never shown — send a reset link and they choose a new one.'
            : `${empPw.length < 8 ? `${empPw.length}/8 characters — at least 8 required` : `${empPw.length} characters ✓`}, then press Create Login. Share it with the employee; they can change it later.`;   // the password for the email ID above
          return (
        <div className="form-grid cols-2">
          <Input label="Employee ID" required value={emp.employeeCode} onChange={e => setEmp({ ...emp, employeeCode: e.target.value })} />
          <Input label="Employee Name" required value={emp.name} onChange={e => setEmp({ ...emp, name: e.target.value })} />
          <Input label="ERP ID" value={emp.erpId ?? ''} onChange={e => setEmp({ ...emp, erpId: e.target.value })} hint="Reference in the ERP / payroll system" />
          <Input label="Designation" required value={emp.designation} onChange={e => setEmp({ ...emp, designation: e.target.value })} />
          <Select label="Department" value={emp.departmentId} onChange={e => setEmp({ ...emp, departmentId: e.target.value })} options={db.departments.map(d => ({ value: d.id, label: d.name }))} />
          <DateInput label="Date of Joining" value={emp.dateOfJoining} onChange={e => setEmp({ ...emp, dateOfJoining: e.target.value })} />
          <Select label="Work Location" value={emp.workLocationId} onChange={e => setEmp({ ...emp, workLocationId: e.target.value })} options={db.locations.map(l => ({ value: l.id, label: l.name }))} />
          <Input label="Mobile Number" value={emp.mobile} onChange={e => setEmp({ ...emp, mobile: e.target.value })} />
          {/* Email and password sit together: the email is the login name and the password is set beside it. */}
          <Input label="Email ID" type="email" value={emp.email} onChange={e => setEmp({ ...emp, email: e.target.value })} hint={canLogin && live ? 'The employee signs in with this email ID.' : undefined} />
          {canLogin && <PasswordInput label="Password" minLength={8} autoComplete="new-password"
            disabled={!live || !saved || !!login} placeholder={login ? '••••••••' : 'At least 8 characters'} value={login ? '' : empPw} onChange={e => setEmpPw(e.target.value)} hint={pwHint} />}
          <label className="checkbox field"><input type="checkbox" checked={emp.active} onChange={e => setEmp({ ...emp, active: e.target.checked })} /> Active (inactive employees cannot be assigned assets)</label>
          {canLogin && live && saved && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Login{login && <> · <span className="mono small">{login.email}</span> <Status value="Active" /></>}</label>
              <div className="btn-row" style={{ marginTop: 4 }}>
                {!login && <button type="button" className="btn sm primary" disabled={empLoginBusy || empPw.length < 8 || !emp.email.trim()}
                  title={!emp.email.trim() ? 'Enter an email address first' : empPw.length < 8 ? 'Password must be at least 8 characters' : undefined}
                  onClick={async () => { setEmpLoginBusy(true); setEmpLoginMsg(null);
                    try { const r = await store.createEmployeeLogin(emp.id, empPw); setEmpLoginMsg(describeLogin(r, emp.email)); setEmpPw(''); }
                    catch (err) { setEmpLoginMsg(err instanceof Error ? err.message : String(err)); }
                    finally { setEmpLoginBusy(false); } }}>{empLoginBusy ? 'Creating login…' : 'Create Login'}</button>}
                {login && <button type="button" className="btn sm" disabled={empLoginBusy}
                  onClick={async () => { setEmpLoginBusy(true); setEmpLoginMsg(null);
                    try { await store.sendPasswordReset(login.id); setEmpLoginMsg(`Password reset link emailed to ${login.email}.`); }
                    catch (err) { setEmpLoginMsg(err instanceof Error ? err.message : String(err)); }
                    finally { setEmpLoginBusy(false); } }}>Send password reset</button>}
              </div>
              {empLoginMsg && <div className="alert" style={{ marginTop: 8, marginBottom: 0 }}>{empLoginMsg}</div>}
            </div>
          )}
          {saved && store.employeeDeleteBlockers(emp.id).length > 0 && <div className="alert" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>This employee has asset history ({store.employeeDeleteBlockers(emp.id).join('; ')}). Records are never deleted — untick <b>Active</b> to retire the employee; their history stays on every asset.</div>}
        </div>); })()}
      </Modal>}
      {cat && <Modal title={cat.name || 'New Category'} onClose={() => setCat(null)} footer={<>
          {db.categories.some(x => x.id === cat.id) && (() => { const b = store.categoryDeleteBlockers(cat.id); return <button className="btn danger" style={{ marginRight: 'auto' }} disabled={b.length > 0} title={b.length ? `Cannot delete: ${b.join('; ')}` : 'Delete'} onClick={async () => { const reason = await askReason({ title: `Delete category ${cat.name}`, message: 'This cannot be undone. The deletion and its reason are recorded in the audit log.' }); if (reason && run(() => store.deleteCategory(cat.id, reason), 'Category deleted.') !== undefined) setCat(null); }}>{b.length ? `Delete (in use: ${b.join('; ')})` : 'Delete Category'}</button>; })()}
          <button className="btn ghost" onClick={() => setCat(null)}>Cancel</button><button className="btn primary" onClick={() => { if (run(() => store.saveCategory({ ...cat, code: cat.code.toUpperCase() }), 'Category saved.') !== undefined) setCat(null); }}>Save</button></>}>
        <div className="form-grid cols-2">
          <Input label="Code (3–4 letters, used in Asset ID)" required maxLength={4} value={cat.code} onChange={e => setCat({ ...cat, code: e.target.value.toUpperCase() })} hint={`GW-AST-${cat.code || 'XXX'}-0001`} />
          <Input label="Category Name" required value={cat.name} onChange={e => setCat({ ...cat, name: e.target.value })} />
          <Input label="Description" value={cat.description ?? ''} onChange={e => setCat({ ...cat, description: e.target.value })} />
        </div>
      </Modal>}
      {dep && <Modal title={dep.name || 'New Department'} onClose={() => setDep(null)} footer={<>
          {db.departments.some(x => x.id === dep.id) && (() => { const b = store.departmentDeleteBlockers(dep.id); return <button className="btn danger" style={{ marginRight: 'auto' }} disabled={b.length > 0} title={b.length ? `Cannot delete: ${b.join('; ')}` : 'Delete'} onClick={async () => { const reason = await askReason({ title: `Delete department ${dep.name}`, message: 'This cannot be undone. The deletion and its reason are recorded in the audit log.' }); if (reason && run(() => store.deleteDepartment(dep.id, reason), 'Department deleted.') !== undefined) setDep(null); }}>{b.length ? `Delete (in use: ${b.join('; ')})` : 'Delete Department'}</button>; })()}
          <button className="btn ghost" onClick={() => setDep(null)}>Cancel</button><button className="btn primary" onClick={() => { if (run(() => store.saveDepartment(dep), 'Department saved.') !== undefined) setDep(null); }}>Save</button></>}>
        <div className="form-grid cols-2">
          <Input label="Code" required value={dep.code} onChange={e => setDep({ ...dep, code: e.target.value.toUpperCase() })} />
          <Input label="Department Name" required value={dep.name} onChange={e => setDep({ ...dep, name: e.target.value })} />
          <Select label="Department Head" value={dep.headEmployeeId ?? ''} onChange={e => setDep({ ...dep, headEmployeeId: e.target.value || undefined })} placeholder="None" options={db.employees.map(e => ({ value: e.id, label: e.name }))} />
        </div>
      </Modal>}
      {loc && <Modal title={loc.name || 'New Location'} onClose={() => setLoc(null)} footer={<>
          {db.locations.some(x => x.id === loc.id) && (() => { const b = store.locationDeleteBlockers(loc.id); return <button className="btn danger" style={{ marginRight: 'auto' }} disabled={b.length > 0} title={b.length ? `Cannot delete: ${b.join('; ')}` : 'Delete'} onClick={async () => { const reason = await askReason({ title: `Delete location ${loc.name}`, message: 'This cannot be undone. The deletion and its reason are recorded in the audit log.' }); if (reason && run(() => store.deleteLocation(loc.id, reason), 'Location deleted.') !== undefined) setLoc(null); }}>{b.length ? `Delete (in use: ${b.join('; ')})` : 'Delete Location'}</button>; })()}
          <button className="btn ghost" onClick={() => setLoc(null)}>Cancel</button><button className="btn primary" onClick={() => { if (run(() => store.saveLocation(loc), 'Location saved.') !== undefined) setLoc(null); }}>Save</button></>}>
        <div className="form-grid cols-2">
          <Input label="Code" required value={loc.code} onChange={e => setLoc({ ...loc, code: e.target.value.toUpperCase() })} />
          <Input label="Location Name" required value={loc.name} onChange={e => setLoc({ ...loc, name: e.target.value })} />
        </div>
      </Modal>}
    </>
  );
}
