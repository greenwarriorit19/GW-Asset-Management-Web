import { emptyDatabase } from './master';
import * as sb from './supabase';
import type {
  Database, User, Role, Asset, AssetStatus, Condition, Transaction, TransactionType, Handover, HandoverItem,
  AssetReturn, Transfer, Repair, Incident, Verification, Disposal, Approval, Attachment, Employee, Category,
  Department, Location,
} from './types';

const STORAGE_KEY = 'gw-asset-management-db-v1';
const SESSION_KEY = 'gw-asset-management-user';

export class BusinessRuleError extends Error {}

// ---------- Permissions ----------
import { ALL_PERMISSIONS, type Permission, type RoleDef } from './permissions';
import { identifierNeeds } from '../lib/categoryFields';
export { ROLE_PERMISSIONS, ALL_PERMISSIONS, PERMISSION_GROUPS } from './permissions';
export type { Permission, RoleDef } from './permissions';

// ---------- Helpers ----------
export const nowIso = () => new Date().toISOString();
// Local calendar date (IST), not the UTC date.
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => localDate(new Date());
export const yyyymm = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
export const addMonths = (dateStr: string, months: number) => {
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : '')); d.setMonth(d.getMonth() + months); return localDate(d);
};

type Listener = () => void;


export type StoreMode = 'local' | 'supabase';
export interface SessionState {
  mode: StoreMode;
  phase: 'loading' | 'login' | 'ready';
  email?: string;               // signed-in Supabase email (supabase mode)
  error?: string;               // load / login error
  sync: { state: 'idle' | 'saving' | 'saved' | 'error'; message?: string; at?: string };
}

/** Department Head, Employee and Auditor were retired: drop them wherever nobody still holds one. */
const RETIRED_ROLES = ['dept_head', 'employee', 'auditor'];
function dropRetiredRoles(roles: RoleDef[], users: User[]): RoleDef[] {
  return roles.filter(r => !RETIRED_ROLES.includes(r.code) || users.some(u => u.role === r.code));
}

export class Store {
  private db: Database;
  private listeners = new Set<Listener>();
  currentUser: User;
  readonly mode: StoreMode;
  private session: SessionState;
  private saving: Promise<void> = Promise.resolve();
  private reloadPending = false;
  private unsubscribeRealtime?: () => void;
  readonly ready: Promise<void>;

  constructor() {
    this.mode = sb.supabaseConfigured() ? 'supabase' : 'local';
    if (this.mode === 'local') {
      this.db = this.load();
      const savedUser = localStorage.getItem(SESSION_KEY);
      this.currentUser = this.db.users.find(u => u.id === savedUser) ?? this.db.users[0];
      this.session = { mode: 'local', phase: 'ready', sync: { state: 'idle' } };
      this.lastCommitted = this.db;
      this.ready = Promise.resolve();
    } else {
      this.db = emptyDatabase();
      this.currentUser = this.db.users[0];
      this.session = { mode: 'supabase', phase: 'loading', sync: { state: 'idle' } };
      this.lastCommitted = this.db;
      this.ready = this.initSupabase();
    }
  }

  // ---------- Supabase session ----------
  getState = () => this.session;
  private setSession(patch: Partial<SessionState>) { this.session = { ...this.session, ...patch }; this.listeners.forEach(l => l()); }

  private async initSupabase() {
    try {
      const email = await sb.currentAuthEmail();
      if (email) await this.enterWithEmail(email);
      else this.setSession({ phase: 'login' });
    } catch (e) {
      this.setSession({ phase: 'login', error: e instanceof Error ? e.message : String(e) });
    }
    sb.onAuthChange(email => { if (!email && this.session.phase === 'ready') this.leave(); });
  }

  /** Loads the database for a signed-in email and enters the app if that email has a user record. */
  private async enterWithEmail(email: string) {
    const db = await sb.loadDatabase();
    const user = sb.matchUser(db, email);
    if (!user) {
      await sb.signOut();
      throw new BusinessRuleError(`${email} is signed in, but has no user account in the Asset Management System. Ask the Super Admin to add it under Users & Permissions.`);
    }
    db.roles = dropRetiredRoles(db.roles, db.users);
    this.db = db;
    this.lastCommitted = db;
    this.currentUser = user;
    this.unsubscribeRealtime?.();
    // Live updates are a convenience: if the realtime channel cannot start, sign-in must still succeed.
    try { this.unsubscribeRealtime = sb.subscribeChanges(() => this.reloadFromServer()); }
    catch (e) { this.unsubscribeRealtime = undefined; console.warn('Live updates are unavailable; the app will not refresh by itself.', e); }
    this.setSession({ phase: 'ready', email, error: undefined, sync: { state: 'idle' } });
  }

  async login(email: string, password: string) {
    this.setSession({ error: undefined });
    try {
      await sb.signIn(email, password);
      await this.enterWithEmail(email);
    } catch (e) {
      this.setSession({ phase: 'login', error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }
  async logout() { await sb.signOut(); this.leave(); }
  private leave() {
    this.unsubscribeRealtime?.(); this.unsubscribeRealtime = undefined;
    this.db = emptyDatabase(); this.currentUser = this.db.users[0];
    this.setSession({ phase: 'login', email: undefined });
  }
  async resetPassword(email: string) { await sb.resetPassword(email); }
  /** Creates the Supabase Auth login for an app user (Super Admin only). */
  async createLogin(userId: string, password: string): Promise<sb.CreateLoginResult> {
    this.require('users.manage');
    if (this.mode !== 'supabase') throw new BusinessRuleError('Logins exist only when the app is connected to Supabase.');
    const u = this.user(userId);
    if (!u) throw new BusinessRuleError('User not found');
    if (password.length < 8) throw new BusinessRuleError('Password must be at least 8 characters.');
    const r = await sb.createAuthUser(u.email.trim(), password);
    this.snapshotBefore();
    this.audit(r === 'already_exists' ? 'LOGIN_EXISTS' : 'LOGIN_CREATED', 'User', userId, 'Login credentials for the Asset Management System', u.email);
    this.commit();
    return r;
  }
  /** Emails a password-reset link to an app user (Super Admin only). */
  async sendPasswordReset(userId: string) {
    this.require('users.manage');
    const u = this.user(userId);
    if (!u) throw new BusinessRuleError('User not found');
    await sb.resetPassword(u.email.trim());
    this.snapshotBefore();
    this.audit('PASSWORD_RESET_SENT', 'User', userId, 'Password reset link emailed', u.email);
    this.commit();
  }
  async updatePassword(password: string) { await sb.updatePassword(password); }

  /** Re-attempts the last failed write (the local change is still in memory). */
  retrySave() {
    if (this.mode !== 'supabase') return;
    this.setSession({ sync: { state: 'saving' } });
    const before = this.lastFailedBase ?? this.lastCommitted;
    const next = this.db;
    this.saving = this.saving.then(() => sb.persistDiff(before, next)).then(
      r => { this.lastFailedBase = undefined; this.lastCommitted = next; this.setSession({ sync: { state: 'saved', at: nowIso(), message: `${r.upserts + r.deletes} row(s)` } }); },
      e => this.setSession({ sync: { state: 'error', at: nowIso(), message: `Not saved to the server: ${e instanceof Error ? e.message : String(e)}` } }),
    );
  }
  private lastFailedBase?: Database;

  /** Another user changed something: re-read the database once any in-flight save has finished. */
  private async reloadFromServer() {
    if (this.session.phase !== 'ready') return;
    this.reloadPending = true;
    await this.saving;
    if (!this.reloadPending) return;
    this.reloadPending = false;
    try {
      const db = await sb.loadDatabase();
      this.db = db;
      this.lastCommitted = db;
      const me = db.users.find(u => u.id === this.currentUser.id);
      if (me) this.currentUser = me;
      this.listeners.forEach(l => l());
    } catch (e) {
      this.setSession({ sync: { state: 'error', message: e instanceof Error ? e.message : String(e), at: nowIso() } });
    }
  }

  private load(): Database {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const db = JSON.parse(raw) as Database;
        // Migration: older data stored roles as plain codes.
        if (!db.roles?.length || typeof db.roles[0] === 'string') db.roles = emptyDatabase().roles;
        db.roles = dropRetiredRoles(db.roles, db.users);
        return db;
      }
    } catch { /* fall through */ }
    // First run: start LIVE (empty) — master lists + Super Admin only.
    const db = emptyDatabase();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return db;
  }

  private commit(prev?: Database) {
    if (this.mode === 'local') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
      this.db = { ...this.db };            // new reference so React re-renders
      this.listeners.forEach(l => l());
      return;
    }
    const before = prev ?? this.lastCommitted;
    this.db = { ...this.db };
    const next = this.db;
    this.lastCommitted = next;
    this.mutating = false;
    this.setSession({ sync: { state: 'saving' } });
    this.saving = this.saving.then(() => sb.persistDiff(before, next)).then(
      r => this.setSession({ sync: { state: 'saved', at: nowIso(), message: `${r.upserts + r.deletes} row(s)` } }),
      e => { this.lastFailedBase = before; this.setSession({ sync: { state: 'error', at: nowIso(), message: `Not saved to the server: ${e instanceof Error ? e.message : String(e)}` } }); },
    );
  }
  /** Snapshot the last state known to be on the server, so each commit only writes what changed. */
  private lastCommitted!: Database;
  private mutating = false;
  /** Called at the start of every mutation; nested calls (e.g. inspection → auto incident) keep the outer snapshot. */
  private snapshotBefore() {
    if (this.mode !== 'supabase' || this.mutating) return;
    this.lastCommitted = { ...this.db };   // collections are replaced immutably, so a shallow copy is a true "before"
    this.mutating = true;
  }

  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.db;

  /** Wipes all transactional and mock records. Keeps departments, locations, categories and the Super Admin login. */
  startEmpty() {
    this.require('settings.manage');
    if (this.mode === 'supabase') throw new BusinessRuleError('The shared database keeps its history permanently and cannot be reset from the app.');
    this.db = emptyDatabase();
    this.currentUser = this.db.users[0];
    localStorage.setItem(SESSION_KEY, this.currentUser.id);
    this.commit();
  }

  /** Restores a JSON backup produced by exportJson(). Replaces ALL current data. */
  importDatabase(input: string | Database) {
    this.require('settings.manage');
    if (this.mode === 'supabase') throw new BusinessRuleError('Restore is only available in browser-local mode; the shared database is backed up by Supabase.');
    const db = typeof input === 'string' ? JSON.parse(input) as Database : input;
    const required: (keyof Database)[] = ['users', 'roles', 'departments', 'locations', 'categories', 'employees', 'assets', 'transactions', 'handovers', 'auditLogs'];
    for (const k of required) if (!Array.isArray(db[k])) throw new BusinessRuleError(`Backup file is not valid: missing "${k}".`);
    if (!db.users.some(u => u.role === 'super_admin' && u.active)) throw new BusinessRuleError('Backup has no active Super Admin; refusing to import.');
    if (typeof (db.roles as unknown[])[0] === 'string') db.roles = emptyDatabase().roles;
    this.db = db;
    if (!this.db.users.some(u => u.id === this.currentUser.id)) this.currentUser = this.db.users.find(u => u.role === 'super_admin')!;
    this.audit('DATABASE_RESTORED', 'System', 'DB', 'Restored from JSON backup', `${db.assets.length} assets, ${db.transactions.length} transactions`);
    this.commit();
  }

  exportJson() { return JSON.stringify(this.db, null, 2); }

  // ---------- Session ----------
  switchUser(userId: string) {
    if (this.mode === 'supabase') throw new BusinessRuleError('Sign out and sign in as the other user.');
    const u = this.db.users.find(x => x.id === userId);
    if (!u) return;
    this.currentUser = u;
    localStorage.setItem(SESSION_KEY, userId);
    this.commit();
  }
  roleDef(code?: string): RoleDef | undefined { return this.db.roles.find(r => r.code === code); }
  roleName(code?: string) { return this.roleDef(code)?.name ?? code ?? '—'; }
  can(p: Permission) { return this.roleDef(this.currentUser.role)?.permissions.includes(p) ?? false; }
  require(p: Permission) {
    if (!this.can(p)) throw new BusinessRuleError(`Your role (${this.currentUser.role}) does not permit this action (${p}).`);
  }

  // ---------- Lookups ----------
  asset(id: string) { return this.db.assets.find(a => a.id === id); }
  employee(id?: string) { return id ? this.db.employees.find(e => e.id === id) : undefined; }
  user(id?: string) { return id ? this.db.users.find(u => u.id === id) : undefined; }
  department(id?: string) { return id ? this.db.departments.find(d => d.id === id) : undefined; }
  location(id?: string) { return id ? this.db.locations.find(l => l.id === id) : undefined; }
  category(id?: string) { return id ? this.db.categories.find(c => c.id === id) : undefined; }
  userName(id?: string) { return this.user(id)?.name ?? '—'; }
  employeeName(id?: string) { return this.employee(id)?.name ?? '—'; }
  deptName(id?: string) { return this.department(id)?.name ?? '—'; }
  locName(id?: string) { return this.location(id)?.name ?? '—'; }
  catName(id?: string) { return this.category(id)?.name ?? '—'; }

  /** Assets visible to the current user according to role scope. */
  visibleAssets(): Asset[] {
    const u = this.currentUser;
    if (this.can('asset.view_all')) return this.db.assets;
    if (this.can('asset.view_department')) return this.db.assets.filter(a => a.departmentId === u.departmentId);
    return this.db.assets.filter(a => a.custodianEmployeeId === u.employeeId);
  }

  assetHistory(assetId: string): Transaction[] {
    // Sequential ids break ties for transactions written in the same millisecond.
    return this.db.transactions.filter(t => t.assetId === assetId).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }

  // ---------- Reference numbering ----------
  nextAssetId(categoryId: string) {
    const cat = this.category(categoryId);
    if (!cat) throw new BusinessRuleError('Category not found');
    const prefix = `GW-AST-${cat.code}-`;
    const max = this.db.assets.filter(a => a.id.startsWith(prefix)).reduce((m, a) => Math.max(m, Number(a.id.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }
  nextRef(kind: 'HO' | 'RT' | 'TR' | 'RP' | 'INC' | 'DSP' | 'VF', existing: { id: string }[]) {
    const prefix = `GW-${kind}-${yyyymm()}-`;
    const max = existing.filter(x => x.id.startsWith(prefix)).reduce((m, x) => Math.max(m, Number(x.id.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }
  private seq(prefix: string, list: { id: string }[]) {
    const max = list.filter(x => x.id.startsWith(prefix)).reduce((m, x) => Math.max(m, Number(x.id.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(max + 1).padStart(6, '0')}`;
  }

  // ---------- Audit & transactions (append-only) ----------
  private audit(action: string, entityType: string, entityId: string, reason: string, details?: string) {
    this.db.auditLogs = [{
      id: this.seq('AL-', this.db.auditLogs), at: nowIso(), userId: this.currentUser.id, userName: this.currentUser.name,
      role: this.currentUser.role, action, entityType, entityId, reason, details,
    }, ...this.db.auditLogs];
  }

  private addTransaction(p: Omit<Transaction, 'id' | 'performedByUserId' | 'performedByName' | 'date'> & { date?: string }) {
    const t: Transaction = {
      id: this.seq('T-', this.db.transactions), date: p.date ?? nowIso(),
      performedByUserId: this.currentUser.id, performedByName: this.currentUser.name, ...p,
    };
    this.db.transactions = [...this.db.transactions, t];
    return t;
  }

  private setAsset(id: string, patch: Partial<Asset>) {
    this.db.assets = this.db.assets.map(a => a.id === id ? { ...a, ...patch } : a);
  }

  private addApproval(entityType: Approval['entityType'], entityId: string, approverRole: Role) {
    this.db.approvals = [...this.db.approvals, {
      id: this.seq('AP-', this.db.approvals), entityType, entityId, requestedByUserId: this.currentUser.id,
      requestedAt: nowIso(), approverRole, decision: 'Pending Approval',
    }];
  }
  private decideApproval(entityType: Approval['entityType'], entityId: string, approved: boolean, comments?: string) {
    this.db.approvals = this.db.approvals.map(a =>
      a.entityType === entityType && a.entityId === entityId && a.decision === 'Pending Approval'
        ? { ...a, decision: approved ? 'Approved' : 'Rejected', decidedByUserId: this.currentUser.id, decidedAt: nowIso(), comments }
        : a);
  }

  private requireReason(reason: string) {
    if (!reason || reason.trim().length < 3) throw new BusinessRuleError('A reason is required for this action.');
  }

  // ---------- Duplicate checks (Rule 2) ----------
  /** Rule 2: the identifiers a category actually has must be filled in (a SIM needs its number, a phone its IMEI). */
  requireIdentifiers(a: { categoryId: string; serialNumber?: string; imei?: string; sim?: string }) {
    const cat = this.category(a.categoryId);
    if (!cat) throw new BusinessRuleError('Select an asset category.');
    const need = identifierNeeds(cat);
    if (need.serial === 'required' && !a.serialNumber?.trim()) throw new BusinessRuleError(`${need.serialLabel} is required for ${cat.name}.`);
    if (need.imei === 'required' && !a.imei?.trim()) throw new BusinessRuleError(`${need.imeiLabel} is required for ${cat.name}.`);
    if (need.sim === 'required' && !a.sim?.trim()) throw new BusinessRuleError(`${need.simLabel} is required for ${cat.name}.`);
  }
  checkDuplicates(a: { serialNumber?: string; imei?: string; sim?: string }, excludeId?: string): string[] {
    const errs: string[] = [];
    const others = this.db.assets.filter(x => x.id !== excludeId);
    const norm = (s?: string) => (s ?? '').trim().toUpperCase();
    if (norm(a.serialNumber) && others.some(x => norm(x.serialNumber) === norm(a.serialNumber))) errs.push(`Serial number ${a.serialNumber} already exists.`);
    if (norm(a.imei) && others.some(x => norm(x.imei) === norm(a.imei))) errs.push(`IMEI ${a.imei} already exists.`);
    if (norm(a.sim) && others.some(x => norm(x.sim) === norm(a.sim))) errs.push(`SIM number ${a.sim} already exists.`);
    return errs;
  }

  // ---------- 2. Asset registration ----------
  registerAsset(input: Omit<Asset, 'id' | 'status' | 'registeredBy' | 'registeredAt' | 'custodianEmployeeId'> & { reason: string }): Asset {
    this.snapshotBefore();
    this.require('asset.register');
    if (!input.name?.trim()) throw new BusinessRuleError('Asset name is required.');
    this.requireIdentifiers(input);
    const dup = this.checkDuplicates(input);
    if (dup.length) throw new BusinessRuleError(dup.join(' '));
    const id = this.nextAssetId(input.categoryId);
    const cat = this.category(input.categoryId)!;
    const { reason: _reason, ...fields } = input;          // `reason` belongs to the transaction / audit entry, not to the asset row
    const asset: Asset = {
      ...fields, id, barcode: input.barcode || id, status: 'Available', registeredBy: this.currentUser.id, registeredAt: nowIso(),
      lastVerificationDate: input.lastVerificationDate || today(),
      nextVerificationDate: input.nextVerificationDate || addMonths(today(), cat.verificationIntervalMonths),
    };
    this.db.assets = [...this.db.assets, asset];
    this.addTransaction({ type: 'REGISTRATION', assetId: id, statusBefore: 'Available', statusAfter: 'Available', conditionAfter: asset.condition,
      toDepartmentId: asset.departmentId, toLocationId: asset.locationId, reason: input.reason, remarks: `Invoice ${asset.invoiceNumber}` });
    this.addApproval('Registration', id, 'super_admin');
    this.attach(id, 'Asset', id, 'Invoice', asset.invoiceAttachment);
    this.attach(id, 'Asset', id, 'Warranty', asset.warrantyAttachment);
    this.attach(id, 'Asset', id, 'Photograph', asset.photo);
    this.audit('ASSET_REGISTERED', 'Asset', id, input.reason);
    this.commit();
    return asset;
  }

  /** Bulk registration (Excel import): validates everything first, then writes all rows in ONE commit. Returns the new Asset IDs. */
  importAssets(rows: Omit<Asset, 'id' | 'status' | 'registeredBy' | 'registeredAt' | 'custodianEmployeeId'>[], reason: string): string[] {
    this.require('asset.register');
    this.requireReason(reason);
    this.snapshotBefore();
    const seen = { sn: new Set<string>(), imei: new Set<string>(), sim: new Set<string>() };
    const u = (x?: string) => (x ?? '').trim().toUpperCase();
    rows.forEach((r, i) => {
      if (!r.name?.trim() || !r.serialNumber?.trim()) throw new BusinessRuleError(`Row ${i + 1}: name and serial number are required.`);
      const dup = this.checkDuplicates(r);
      if (dup.length) throw new BusinessRuleError(`Row ${i + 1}: ${dup.join(' ')}`);
      if (seen.sn.has(u(r.serialNumber)) || (r.imei && seen.imei.has(u(r.imei))) || (r.sim && seen.sim.has(u(r.sim)))) throw new BusinessRuleError(`Row ${i + 1}: duplicate serial / IMEI / SIM within the file.`);
      seen.sn.add(u(r.serialNumber)); if (r.imei) seen.imei.add(u(r.imei)); if (r.sim) seen.sim.add(u(r.sim));
      if (!this.category(r.categoryId)) throw new BusinessRuleError(`Row ${i + 1}: category not found.`);
    });
    const ids: string[] = [];
    for (const r of rows) {
      const id = this.nextAssetId(r.categoryId);
      const asset: Asset = { ...r, id, barcode: r.barcode || id, status: 'Available', registeredBy: this.currentUser.id, registeredAt: nowIso() };
      this.db.assets = [...this.db.assets, asset];
      this.addTransaction({ type: 'REGISTRATION', assetId: id, statusBefore: 'Available', statusAfter: 'Available', conditionAfter: asset.condition, toDepartmentId: asset.departmentId, toLocationId: asset.locationId, reason, remarks: `Bulk import · Invoice ${asset.invoiceNumber}` });
      ids.push(id);
    }
    this.audit('ASSETS_IMPORTED', 'Asset', ids.length === 1 ? ids[0] : `${ids[0]} … ${ids[ids.length - 1]}`, reason, `${ids.length} asset(s) registered from Excel`);
    this.commit();
    return ids;
  }

  /** Bulk employee import in ONE commit. Blank employee codes are generated (GW-EMP-0001…). */
  importEmployees(rows: (Omit<Employee, 'id' | 'employeeCode'> & { employeeCode?: string })[], reason: string): string[] {
    this.require('settings.manage');
    this.requireReason(reason);
    this.snapshotBefore();
    const existing = new Set(this.db.employees.map(e => e.employeeCode.toUpperCase()));
    let next = this.db.employees.reduce((m, e) => Math.max(m, Number(e.employeeCode.replace(/\D/g, '')) || 0), 0);
    const ids: string[] = [];
    for (const [i, r] of rows.entries()) {
      if (!r.name?.trim() || !r.designation?.trim()) throw new BusinessRuleError(`Row ${i + 1}: name and designation are required.`);
      if (!this.department(r.departmentId) || !this.location(r.workLocationId)) throw new BusinessRuleError(`Row ${i + 1}: department or location not found.`);
      let code = (r.employeeCode ?? '').trim().toUpperCase();
      if (!code) { do { next += 1; code = `GW-EMP-${String(next).padStart(4, '0')}`; } while (existing.has(code)); }
      if (existing.has(code)) throw new BusinessRuleError(`Row ${i + 1}: Employee ID ${code} already exists.`);
      existing.add(code);
      const id = `E-${Date.now().toString(36).toUpperCase()}${i}`;
      this.db.employees = [...this.db.employees, { ...r, id, employeeCode: code }];
      ids.push(id);
    }
    this.audit('EMPLOYEES_IMPORTED', 'Employee', `${ids.length} record(s)`, reason, `${ids.length} employee(s) added from Excel`);
    this.commit();
    return ids;
  }

  updateAsset(id: string, patch: Partial<Asset>, reason: string) {
    this.snapshotBefore();
    this.require('asset.edit');
    this.requireReason(reason);
    const before = this.asset(id);
    if (!before) throw new BusinessRuleError('Asset not found');
    this.requireIdentifiers({ ...before, ...patch });
    const dup = this.checkDuplicates({ ...before, ...patch }, id);
    if (dup.length) throw new BusinessRuleError(dup.join(' '));
    // Status and custody are never edited directly — they only change through transactions.
    const { status: _s, custodianEmployeeId: _c, id: _i, ...safe } = patch;
    void _s; void _c; void _i;
    this.setAsset(id, safe);
    const changed = Object.keys(safe).filter(k => (before as unknown as Record<string, unknown>)[k] !== (safe as unknown as Record<string, unknown>)[k]);
    this.addTransaction({ type: 'UPDATE', assetId: id, statusBefore: before.status, statusAfter: before.status, reason, remarks: `Fields changed: ${changed.join(', ')}` });
    this.audit('ASSET_UPDATED', 'Asset', id, reason, changed.join(', '));
    this.commit();
  }

  approveRegistration(assetId: string, approved: boolean, comments: string) {
    this.snapshotBefore();
    this.require('settings.manage');
    this.decideApproval('Registration', assetId, approved, comments);
    if (approved) this.setAsset(assetId, { registrationApprovedBy: this.currentUser.id });
    this.audit(approved ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED', 'Asset', assetId, comments || 'Registration reviewed');
    this.commit();
  }

  // ---------- 4. Employee handover ----------
  createHandover(input: { employeeId: string; issuedByUserId: string; expectedReturnDate?: string; purpose?: string; locationOfUse?: string; items: HandoverItem[]; reason: string }): Handover {
    this.snapshotBefore();
    this.require('handover.create');
    this.requireReason(input.reason);
    if (!input.items.length) throw new BusinessRuleError('Add at least one asset to the assignment.');
    const emp = this.employee(input.employeeId);
    if (!emp || !emp.active) throw new BusinessRuleError('Select an active employee.');
    for (const it of input.items) {
      const a = this.asset(it.assetId);
      if (!a) throw new BusinessRuleError(`Asset ${it.assetId} not found.`);
      if (a.status !== 'Available') throw new BusinessRuleError(`Rule 4: ${a.id} is ${a.status}. Only Available assets can be issued.`);
      if (a.custodianEmployeeId) throw new BusinessRuleError(`Rule 3: ${a.id} already has an active custodian.`);
      const pendingElsewhere = this.db.handovers.some(h => ['Awaiting Approval', 'Awaiting Acknowledgement'].includes(h.status) && h.items.some(x => x.assetId === it.assetId));   // legacy rows only
      if (pendingElsewhere) throw new BusinessRuleError(`Rule 3: ${a.id} is already on a pending assignment.`);
    }
    const id = this.nextRef('HO', this.db.handovers);
    // No approval and no acknowledgement step: submitting hands the assets over there and then.
    const h: Handover = {
      id, date: today(), employeeId: input.employeeId, issuedByUserId: input.issuedByUserId, expectedReturnDate: input.expectedReturnDate,
      purpose: input.purpose ?? input.reason, locationOfUse: input.locationOfUse ?? this.locName(emp.workLocationId), items: input.items,
      approval: 'Approved', approvedByUserId: this.currentUser.id, approvedAt: nowIso(), acknowledged: true, acknowledgedAt: nowIso(),
      status: 'Active', createdByUserId: this.currentUser.id, createdAt: nowIso(),
    };
    this.db.handovers = [...this.db.handovers, h];
    // Custody passes immediately: the assets become Assigned to the employee on submit.
    for (const it of input.items) {
      const a = this.asset(it.assetId)!;
      this.addTransaction({ type: 'HANDOVER', assetId: a.id, reference: id, toEmployeeId: input.employeeId, fromDepartmentId: a.departmentId, toDepartmentId: emp.departmentId,
        fromLocationId: a.locationId, toLocationId: emp.workLocationId, statusBefore: a.status, statusAfter: 'Assigned', conditionBefore: a.condition, conditionAfter: it.condition, reason: h.purpose || `Assignment ${id}` });
      this.setAsset(a.id, { status: 'Assigned', custodianEmployeeId: input.employeeId, departmentId: emp.departmentId, locationId: emp.workLocationId, condition: it.condition });
    }
    this.audit('HANDOVER_CREATED', 'Handover', id, input.reason, `${input.items.length} asset(s) to ${emp.name}`);
    this.commit();
    return h;
  }

  /** Edits the lines of an active assignment: condition, quantity, accessories and remarks. Assets and employee are fixed. */
  updateHandoverItems(id: string, items: HandoverItem[], reason: string) {
    this.snapshotBefore();
    this.require('handover.create');
    this.requireReason(reason);
    const h = this.db.handovers.find(x => x.id === id);
    if (!h) throw new BusinessRuleError('Assignment not found.');
    if (!['Active', 'Awaiting Acknowledgement'].includes(h.status)) throw new BusinessRuleError(`A ${h.status.toLowerCase()} assignment can no longer be edited.`);
    const before = new Map(h.items.map(i => [i.assetId, i]));
    if (items.some(i => !before.has(i.assetId))) {
      throw new BusinessRuleError('An asset cannot be added to an existing assignment. Raise a new assignment for it instead.');
    }
    if (!items.length) throw new BusinessRuleError('Keep at least one asset, or cancel the whole assignment.');
    const dropped = h.items.filter(i => !items.some(x => x.assetId === i.assetId));
    for (const it of dropped) {                                   // a dropped asset must still be the one this assignment issued
      const a = this.asset(it.assetId)!;
      if (!['Assigned', 'Reserved'].includes(a.status) || (a.custodianEmployeeId && a.custodianEmployeeId !== h.employeeId)) {
        throw new BusinessRuleError(`${a.id} is ${a.status} and has already moved on; record an Asset Return instead of removing it here.`);
      }
    }
    this.db.handovers = this.db.handovers.map(x => x.id === id ? { ...x, items } : x);
    for (const it of dropped) {
      const a = this.asset(it.assetId)!;
      this.addTransaction({ type: 'STATUS_CHANGE', assetId: a.id, reference: id, fromEmployeeId: h.employeeId, statusBefore: a.status, statusAfter: 'Available', reason: `Removed from assignment ${id}: ${reason}` });
      this.setAsset(a.id, { status: 'Available', custodianEmployeeId: undefined });
    }
    for (const it of items) {
      const was = before.get(it.assetId)!;
      const a = this.asset(it.assetId);
      const changes = [
        was.condition !== it.condition ? `condition ${was.condition} → ${it.condition}` : '',
        was.quantity !== it.quantity ? `qty ${was.quantity} → ${it.quantity}` : '',
        (was.accessories ?? '') !== (it.accessories ?? '') ? 'accessories' : '',
        (was.remarks ?? '') !== (it.remarks ?? '') ? 'remarks' : '',
      ].filter(Boolean);
      if (!changes.length) continue;
      const st = a?.status ?? 'Assigned';
      this.addTransaction({ type: 'UPDATE', assetId: it.assetId, reference: id, statusBefore: st, statusAfter: st, conditionBefore: was.condition, conditionAfter: it.condition, toEmployeeId: h.employeeId, reason: `Assignment ${id} amended: ${changes.join(', ')}. ${reason}` });
      // The asset carries the condition it is held in, so a corrected condition follows through.
      if (a && was.condition !== it.condition && a.custodianEmployeeId === h.employeeId) this.setAsset(a.id, { condition: it.condition });
    }
    this.audit('HANDOVER_UPDATED', 'Handover', id, reason, dropped.length ? `${items.length} line(s); released ${dropped.map(d => d.assetId).join(', ')}` : `${items.length} line(s)`);
    this.commit();
  }

  /** Legacy rows only: completes an assignment that was left awaiting a signature before the signature step was removed. */
  confirmAssignment(id: string) {
    this.snapshotBefore();
    this.require('handover.create');
    const h = this.db.handovers.find(x => x.id === id);
    if (!h || h.status !== 'Awaiting Acknowledgement') throw new BusinessRuleError('This assignment is not waiting to be confirmed.');
    const emp = this.employee(h.employeeId)!;
    this.db.handovers = this.db.handovers.map(x => x.id === id ? { ...x, acknowledged: true, acknowledgedAt: nowIso(), status: 'Active' } : x);
    for (const it of h.items) {
      const a = this.asset(it.assetId)!;
      this.addTransaction({ type: 'HANDOVER', assetId: a.id, reference: id, toEmployeeId: h.employeeId, fromDepartmentId: a.departmentId, toDepartmentId: emp.departmentId,
        fromLocationId: a.locationId, toLocationId: emp.workLocationId, statusBefore: a.status, statusAfter: 'Assigned', conditionBefore: a.condition, conditionAfter: it.condition, reason: h.purpose || `Assignment ${id}` });
      this.setAsset(a.id, { status: 'Assigned', custodianEmployeeId: h.employeeId, departmentId: emp.departmentId, locationId: emp.workLocationId, condition: it.condition });
    }
    this.audit('HANDOVER_CONFIRMED', 'Handover', id, `Assignment confirmed for ${emp.name}`);
    this.commit();
  }

  /** Withdraws an assignment made in error; the assets go straight back to Available. */
  cancelHandover(id: string, reason: string) {
    this.require('handover.create');
    this.requireReason(reason);
    this.snapshotBefore();
    const h = this.db.handovers.find(x => x.id === id);
    if (!h || !['Active', 'Awaiting Acknowledgement'].includes(h.status)) throw new BusinessRuleError('Only an active assignment can be cancelled.');
    for (const it of h.items) {                                   // nothing may have moved on since the assignment
      const a = this.asset(it.assetId)!;
      if (!['Assigned', 'Reserved'].includes(a.status) || (a.custodianEmployeeId && a.custodianEmployeeId !== h.employeeId)) {
        throw new BusinessRuleError(`${a.id} is ${a.status} and has already moved on; record an Asset Return instead of cancelling.`);
      }
    }
    for (const it of h.items) {
      const a = this.asset(it.assetId)!;
      this.addTransaction({ type: 'STATUS_CHANGE', assetId: a.id, reference: id, fromEmployeeId: h.employeeId, statusBefore: a.status, statusAfter: 'Available', reason: `Assignment ${id} cancelled: ${reason}` });
      this.setAsset(a.id, { status: 'Available', custodianEmployeeId: undefined });
    }
    this.db.handovers = this.db.handovers.map(x => x.id === id ? { ...x, status: 'Rejected', approval: 'Rejected', approvalComments: reason } : x);
    this.audit('HANDOVER_CANCELLED', 'Handover', id, reason);
    this.commit();
  }

  // ---------- 5. Return ----------
  createReturn(input: { assetId: string; conditionReported: Condition; accessoriesReturned: string; employeeRemarks?: string; employeeSignature: string; reason: string }): AssetReturn {
    this.snapshotBefore();
    this.require('return.create');
    this.requireReason(input.reason);
    const a = this.asset(input.assetId);
    if (!a) throw new BusinessRuleError('Asset not found');
    if (a.status !== 'Assigned' || !a.custodianEmployeeId) throw new BusinessRuleError('Only Assigned assets with a custodian can be returned.');
    const handover = this.db.handovers.find(h => h.status === 'Active' && h.employeeId === a.custodianEmployeeId && h.items.some(i => i.assetId === a.id));
    const id = this.nextRef('RT', this.db.returns);
    const r: AssetReturn = {
      id, date: today(), assetId: a.id, employeeId: a.custodianEmployeeId, handoverId: handover?.id, receivedByUserId: this.currentUser.id,
      conditionReported: input.conditionReported, accessoriesReturned: input.accessoriesReturned, employeeRemarks: input.employeeRemarks,
      inspected: false, employeeSignature: input.employeeSignature, receiverSignature: this.currentUser.name, status: 'Pending Inspection',
      createdByUserId: this.currentUser.id, createdAt: nowIso(),
    };
    this.db.returns = [...this.db.returns, r];
    this.addTransaction({ type: 'RETURN', assetId: a.id, reference: id, fromEmployeeId: a.custodianEmployeeId, statusBefore: a.status, statusAfter: 'Under Inspection', conditionBefore: a.condition, conditionAfter: input.conditionReported, reason: input.reason });
    // Rule 8 — returned assets go to Under Inspection, never straight to Available. Custody is released.
    this.setAsset(a.id, { status: 'Under Inspection', custodianEmployeeId: undefined, condition: input.conditionReported });
    if (handover) {
      const stillHeld = handover.items.some(i => i.assetId !== a.id && this.asset(i.assetId)?.custodianEmployeeId === handover.employeeId);
      if (!stillHeld) this.db.handovers = this.db.handovers.map(h => h.id === handover.id ? { ...h, status: 'Closed' } : h);
    }
    this.audit('RETURN_CREATED', 'Return', id, input.reason);
    this.commit();
    return r;
  }

  inspectReturn(id: string, input: { inspectionCondition: Condition; inspectionOutcome: AssetReturn['inspectionOutcome']; inspectionNotes: string; reason: string }) {
    this.snapshotBefore();
    this.require('return.inspect');
    this.requireReason(input.reason);
    const r = this.db.returns.find(x => x.id === id);
    if (!r || r.inspected) throw new BusinessRuleError('Return already inspected or not found.');
    const a = this.asset(r.assetId)!;
    const after: AssetStatus = input.inspectionOutcome === 'Acceptable' ? 'Available' : input.inspectionOutcome === 'Faulty' ? 'Under Repair' : 'Damaged';
    const { reason: _r, ...inspection } = input;                         // reason → audit entry
    this.db.returns = this.db.returns.map(x => x.id === id ? { ...x, inspected: true, inspectedByUserId: this.currentUser.id, inspectionDate: today(), ...inspection, status: 'Completed' } : x);
    this.addTransaction({ type: 'INSPECTION', assetId: a.id, reference: id, statusBefore: a.status, statusAfter: after, conditionBefore: a.condition, conditionAfter: input.inspectionCondition, reason: `Inspection outcome: ${input.inspectionOutcome}. ${input.reason}`, remarks: input.inspectionNotes });
    this.setAsset(a.id, { status: after, condition: input.inspectionCondition, departmentId: 'D-ADM', locationId: after === 'Under Repair' ? 'L-WS' : a.locationId });
    if (input.inspectionOutcome === 'Damaged') {
      // Rule 9 — damaged assets need an incident report; open one automatically for the returning employee.
      this.openIncident({ assetId: a.id, type: 'Damaged', incidentDate: today(), reportedByEmployeeId: r.employeeId, location: this.locName(a.locationId), description: `Damage found on return inspection ${id}: ${input.inspectionNotes}`, reason: 'Auto-created from return inspection' }, false);
    }
    this.audit('RETURN_INSPECTED', 'Return', id, input.reason, `Outcome ${input.inspectionOutcome} → ${after}`);
    this.commit();
  }

  // ---------- 6. Transfer ----------
  requestTransfer(input: { assetId: string; toEmployeeId?: string; toDepartmentId: string; toLocationId: string; reason: string; conditionAtTransfer: Condition }): Transfer {
    this.snapshotBefore();
    this.require('transfer.request');
    this.requireReason(input.reason);
    const a = this.asset(input.assetId);
    if (!a) throw new BusinessRuleError('Asset not found');
    if (!['Assigned', 'Available'].includes(a.status)) throw new BusinessRuleError(`Asset is ${a.status}; only Assigned or Available assets can be transferred.`);
    if (this.db.transfers.some(t => t.assetId === a.id && ['Awaiting Approval', 'Approved'].includes(t.status))) throw new BusinessRuleError('A transfer is already pending for this asset.');
    const id = this.nextRef('TR', this.db.transfers);
    const t: Transfer = {
      id, date: today(), assetId: a.id, fromEmployeeId: a.custodianEmployeeId, toEmployeeId: input.toEmployeeId, fromDepartmentId: a.departmentId, toDepartmentId: input.toDepartmentId,
      fromLocationId: a.locationId, toLocationId: input.toLocationId, reason: input.reason, conditionAtTransfer: input.conditionAtTransfer, requestedByUserId: this.currentUser.id,
      approval: 'Pending Approval', status: 'Awaiting Approval', createdAt: nowIso(),
    };
    this.db.transfers = [...this.db.transfers, t];
    this.addApproval('Transfer', id, 'super_admin');
    this.audit('TRANSFER_REQUESTED', 'Transfer', id, input.reason);
    this.commit();
    return t;
  }

  approveTransfer(id: string, approved: boolean, comments: string) {
    this.snapshotBefore();
    this.require('transfer.approve');
    const t = this.db.transfers.find(x => x.id === id);
    if (!t || t.status !== 'Awaiting Approval') throw new BusinessRuleError('Transfer is not awaiting approval.');
    this.decideApproval('Transfer', id, approved, comments);
    this.db.transfers = this.db.transfers.map(x => x.id === id ? { ...x, approval: approved ? 'Approved' : 'Rejected', approvedByUserId: this.currentUser.id, approvedAt: nowIso(), approvalComments: comments, status: approved ? 'Approved' : 'Rejected' } : x);
    this.audit(approved ? 'TRANSFER_APPROVED' : 'TRANSFER_REJECTED', 'Transfer', id, comments || 'Transfer reviewed');
    this.commit();
  }

  /** Completes an approved transfer: releases the old custodian (history retained), then issues a fresh handover to the new custodian. */
  completeTransfer(id: string, reason: string) {
    this.snapshotBefore();
    this.require('transfer.complete');
    this.requireReason(reason);
    const t = this.db.transfers.find(x => x.id === id);
    if (!t || t.status !== 'Approved') throw new BusinessRuleError('Transfer must be approved before completion.');
    const a = this.asset(t.assetId)!;
    this.addTransaction({ type: 'TRANSFER', assetId: a.id, reference: id, fromEmployeeId: t.fromEmployeeId, toEmployeeId: t.toEmployeeId, fromDepartmentId: t.fromDepartmentId, toDepartmentId: t.toDepartmentId,
      fromLocationId: t.fromLocationId, toLocationId: t.toLocationId, statusBefore: a.status, statusAfter: t.toEmployeeId ? 'Assigned' : 'Available', conditionBefore: a.condition, conditionAfter: t.conditionAtTransfer, reason: t.reason, remarks: reason });
    // The previous custodian's handover is closed, never deleted.
    if (t.fromEmployeeId) {
      this.db.handovers = this.db.handovers.map(h => h.status === 'Active' && h.employeeId === t.fromEmployeeId && h.items.some(i => i.assetId === a.id) && h.items.length === 1 ? { ...h, status: 'Closed' } : h);
    }
    let newHandoverId: string | undefined;
    if (t.toEmployeeId) {
      // A fresh assignment record is raised for the new custodian and takes effect immediately.
      this.setAsset(a.id, { status: 'Assigned', custodianEmployeeId: t.toEmployeeId, departmentId: t.toDepartmentId, locationId: t.toLocationId, condition: t.conditionAtTransfer });
      const emp = this.employee(t.toEmployeeId)!;
      newHandoverId = this.nextRef('HO', this.db.handovers);
      this.db.handovers = [...this.db.handovers, {
        id: newHandoverId, date: today(), employeeId: t.toEmployeeId, issuedByUserId: this.currentUser.id, purpose: `Transfer ${id}: ${t.reason}`, locationOfUse: this.locName(t.toLocationId),
        items: [{ assetId: a.id, condition: t.conditionAtTransfer, quantity: 1, accessories: a.accessories ?? '', remarks: `Transferred from ${this.employeeName(t.fromEmployeeId)}` }],
        approval: 'Approved', approvedByUserId: t.approvedByUserId, approvedAt: t.approvedAt, acknowledged: true, acknowledgedAt: nowIso(), status: 'Active', createdByUserId: this.currentUser.id, createdAt: nowIso(), transferId: id,
      }];
      this.addTransaction({ type: 'HANDOVER', assetId: a.id, reference: newHandoverId, toEmployeeId: t.toEmployeeId, fromDepartmentId: t.fromDepartmentId, toDepartmentId: t.toDepartmentId,
        fromLocationId: t.fromLocationId, toLocationId: t.toLocationId, statusBefore: 'Transferred', statusAfter: 'Assigned', conditionBefore: t.conditionAtTransfer, conditionAfter: t.conditionAtTransfer,
        reason: `Transfer ${id}: ${t.reason}` });
      void emp;
    } else {
      this.setAsset(a.id, { status: 'Available', custodianEmployeeId: undefined, departmentId: t.toDepartmentId, locationId: t.toLocationId, condition: t.conditionAtTransfer });
    }
    this.db.transfers = this.db.transfers.map(x => x.id === id ? { ...x, status: 'Completed', completedAt: nowIso(), newHandoverId } : x);
    this.audit('TRANSFER_COMPLETED', 'Transfer', id, reason, newHandoverId ? `New assignment ${newHandoverId}` : 'Moved to pool');
    this.commit();
    return newHandoverId;
  }

  // ---------- 7. Repair ----------
  openRepair(input: { assetId: string; faultDescription: string; vendor: string; estimatedCost: number; expectedReturnDate?: string; quotation?: Attachment; reason: string }): Repair {
    this.snapshotBefore();
    this.require('repair.create');
    this.requireReason(input.reason);
    const a = this.asset(input.assetId);
    if (!a) throw new BusinessRuleError('Asset not found');
    if (['Lost', 'Retired', 'Disposed'].includes(a.status)) throw new BusinessRuleError(`Asset is ${a.status} and cannot be sent for repair.`);
    if (this.db.repairs.some(r => r.assetId === a.id && r.status !== 'Completed')) throw new BusinessRuleError('An open repair already exists for this asset.');
    const id = this.nextRef('RP', this.db.repairs);
    const r: Repair = { id, assetId: a.id, reportedDate: today(), reportedByUserId: this.currentUser.id, faultDescription: input.faultDescription, vendor: input.vendor, estimatedCost: input.estimatedCost,
      expectedReturnDate: input.expectedReturnDate, quotation: input.quotation, approval: 'Pending Approval', status: 'Open', statusBeforeRepair: a.status, custodianBeforeRepair: a.custodianEmployeeId, createdAt: nowIso() };
    this.db.repairs = [...this.db.repairs, r];
    this.addTransaction({ type: 'REPAIR_SENT', assetId: a.id, reference: id, fromEmployeeId: a.custodianEmployeeId, toLocationId: 'L-WS', statusBefore: a.status, statusAfter: 'Under Repair', conditionBefore: a.condition, reason: input.reason, remarks: input.faultDescription });
    this.setAsset(a.id, { status: 'Under Repair' });
    this.attach(a.id, 'Repair', id, 'Quotation', input.quotation);
    this.addApproval('Repair', id, 'super_admin');
    this.audit('REPAIR_OPENED', 'Repair', id, input.reason, `Vendor ${input.vendor}, est. ₹${input.estimatedCost}`);
    this.commit();
    return r;
  }

  approveRepair(id: string, approved: boolean, comments: string) {
    this.snapshotBefore();
    this.require('repair.approve');
    const r = this.db.repairs.find(x => x.id === id);
    if (!r || r.approval !== 'Pending Approval') throw new BusinessRuleError('Repair is not awaiting approval.');
    this.decideApproval('Repair', id, approved, comments);
    this.db.repairs = this.db.repairs.map(x => x.id === id ? { ...x, approval: approved ? 'Approved' : 'Rejected', approvedByUserId: this.currentUser.id, status: approved ? 'In Progress' : x.status } : x);
    this.audit(approved ? 'REPAIR_APPROVED' : 'REPAIR_REJECTED', 'Repair', id, comments || 'Repair reviewed');
    this.commit();
  }

  completeRepair(id: string, input: { actualCost: number; completionDate: string; workDone: string; inspectionNotes: string; outcome: Repair['outcome']; conditionAfter: Condition; serviceReport?: Attachment; reason: string }) {
    this.snapshotBefore();
    this.require('repair.complete');
    this.requireReason(input.reason);
    const r = this.db.repairs.find(x => x.id === id);
    if (!r || r.status === 'Completed') throw new BusinessRuleError('Repair not found or already completed.');
    const a = this.asset(r.assetId)!;
    let after: AssetStatus = 'Available';
    let custodian: string | undefined;
    if (input.outcome === 'Assigned') {
      if (!r.custodianBeforeRepair) throw new BusinessRuleError('Asset had no custodian before repair; choose Available or Retired.');
      after = 'Assigned'; custodian = r.custodianBeforeRepair;
    } else if (input.outcome === 'Retired') { after = 'Retired'; }
    const { reason: _r, conditionAfter: _c, ...repairFields } = input;   // reason → audit, conditionAfter → the asset
    this.db.repairs = this.db.repairs.map(x => x.id === id ? { ...x, ...repairFields, inspectedByUserId: this.currentUser.id, status: 'Completed' } : x);
    this.addTransaction({ type: 'REPAIR_COMPLETED', assetId: a.id, reference: id, toEmployeeId: custodian, statusBefore: a.status, statusAfter: after, conditionBefore: a.condition, conditionAfter: input.conditionAfter, reason: input.reason, remarks: `${input.workDone}. Cost ₹${input.actualCost}` });
    this.setAsset(a.id, { status: after, custodianEmployeeId: custodian, condition: input.conditionAfter, maintenanceNotes: `${a.maintenanceNotes ? a.maintenanceNotes + '\n' : ''}${input.completionDate}: ${input.workDone} (₹${input.actualCost}, ${r.vendor})` });
    if (after === 'Retired') this.startRetirement({ assetId: a.id, retirementReason: `Repair ${id} outcome: not economical to repair`, technicalRecommendation: input.inspectionNotes, reason: input.reason }, false, true);
    this.attach(a.id, 'Repair', id, 'Service Report', input.serviceReport);
    this.audit('REPAIR_COMPLETED', 'Repair', id, input.reason, `Outcome ${input.outcome}`);
    this.commit();
  }

  // ---------- 9. Lost / damaged ----------
  openIncident(input: { assetId: string; type: 'Lost' | 'Damaged'; incidentDate: string; reportedByEmployeeId: string; location: string; description: string; policeReportNo?: string; reason: string }, commit = true): Incident {
    this.snapshotBefore();
    this.require('incident.report');
    this.requireReason(input.reason);
    const a = this.asset(input.assetId);
    if (!a) throw new BusinessRuleError('Asset not found');
    const id = this.nextRef('INC', this.db.incidents);
    const inc: Incident = { id, assetId: a.id, type: input.type, incidentDate: input.incidentDate, reportedByEmployeeId: input.reportedByEmployeeId, reportedByUserId: this.currentUser.id,
      location: input.location, description: input.description, policeReportNo: input.policeReportNo, approval: 'Pending Approval', status: 'Reported', createdAt: nowIso() };
    this.db.incidents = [...this.db.incidents, inc];
    const after: AssetStatus = input.type === 'Lost' ? 'Lost' : 'Damaged';
    this.addTransaction({ type: 'INCIDENT', assetId: a.id, reference: id, fromEmployeeId: a.custodianEmployeeId, statusBefore: a.status, statusAfter: after, conditionBefore: a.condition, conditionAfter: input.type === 'Damaged' ? 'Damaged' : a.condition, reason: input.reason, remarks: input.description });
    this.setAsset(a.id, { status: after, condition: input.type === 'Damaged' ? 'Damaged' : a.condition });
    this.addApproval('Incident', id, 'super_admin');
    this.audit('INCIDENT_REPORTED', 'Incident', id, input.reason, `${input.type} – ${a.id}`);
    if (commit) this.commit();
    return inc;
  }

  investigateIncident(id: string, input: { investigationNotes: string; responsibility: string; recoveryAction: string; recoveryAmount?: number; resolution: Incident['resolution']; reason: string }) {
    this.snapshotBefore();
    this.require('incident.investigate');
    this.requireReason(input.reason);
    const inc = this.db.incidents.find(x => x.id === id);
    if (!inc || inc.status === 'Closed') throw new BusinessRuleError('Incident not found or already closed.');
    const { reason: _r, ...incidentFields } = input;                     // reason → audit entry
    this.db.incidents = this.db.incidents.map(x => x.id === id ? { ...x, ...incidentFields, investigatedByUserId: this.currentUser.id, status: 'Awaiting Approval' } : x);
    this.audit('INCIDENT_INVESTIGATED', 'Incident', id, input.reason, `Resolution proposed: ${input.resolution}`);
    this.commit();
  }

  approveIncident(id: string, approved: boolean, comments: string) {
    this.snapshotBefore();
    this.require('incident.approve');
    const inc = this.db.incidents.find(x => x.id === id);
    if (!inc || inc.status !== 'Awaiting Approval') throw new BusinessRuleError('Incident is not awaiting approval.');
    this.decideApproval('Incident', id, approved, comments);
    const a = this.asset(inc.assetId)!;
    if (approved) {
      let after: AssetStatus = a.status;
      if (inc.resolution === 'Recovered') after = inc.type === 'Lost' ? 'Under Inspection' : a.status;
      if (inc.resolution === 'Repair') after = 'Under Repair';
      if (inc.resolution === 'Retired' || inc.resolution === 'Written Off') after = 'Retired';
      if (after !== a.status) {
        this.addTransaction({ type: 'STATUS_CHANGE', assetId: a.id, reference: id, fromEmployeeId: a.custodianEmployeeId, statusBefore: a.status, statusAfter: after, reason: `Incident ${id} resolution: ${inc.resolution}`, remarks: comments });
        // Custody is kept while an asset is repaired; it is released on retirement or when a lost item is recovered for inspection.
        this.setAsset(a.id, { status: after, custodianEmployeeId: after === 'Retired' || after === 'Under Inspection' ? undefined : a.custodianEmployeeId });
        if (after === 'Retired') this.startRetirement({ assetId: a.id, retirementReason: `Incident ${id}: ${inc.resolution}`, technicalRecommendation: inc.investigationNotes ?? '', reason: comments || 'Incident approved' }, false, true);
      }
    }
    this.db.incidents = this.db.incidents.map(x => x.id === id ? { ...x, approval: approved ? 'Approved' : 'Rejected', approvedByUserId: this.currentUser.id, approvedAt: nowIso(), status: approved ? 'Closed' : 'Under Investigation' } : x);
    this.audit(approved ? 'INCIDENT_APPROVED' : 'INCIDENT_REJECTED', 'Incident', id, comments || 'Incident reviewed');
    this.commit();
  }

  // ---------- 8. Verification ----------
  recordVerification(input: { assetId: string; foundCustodianId?: string; foundLocationId?: string; foundCondition?: Condition; result: Verification['result']; notes?: string; nextVerificationDate: string; reason: string }): Verification {
    this.snapshotBefore();
    this.require('verification.perform');
    this.requireReason(input.reason);
    const a = this.asset(input.assetId);
    if (!a) throw new BusinessRuleError('Asset not found');
    const id = this.nextRef('VF', this.db.verifications);
    const v: Verification = { id, assetId: a.id, date: today(), verifiedByUserId: this.currentUser.id, expectedCustodianId: a.custodianEmployeeId, foundCustodianId: input.foundCustodianId, expectedLocationId: a.locationId,
      foundLocationId: input.foundLocationId, expectedStatus: a.status, foundCondition: input.foundCondition, result: input.result, notes: input.notes, nextVerificationDate: input.nextVerificationDate, createdAt: nowIso() };
    this.db.verifications = [...this.db.verifications, v];
    this.addTransaction({ type: 'VERIFICATION', assetId: a.id, reference: id, statusBefore: a.status, statusAfter: a.status, conditionBefore: a.condition, conditionAfter: input.foundCondition ?? a.condition, reason: `${input.result}. ${input.reason}`, remarks: input.notes });
    this.setAsset(a.id, { lastVerificationDate: today(), nextVerificationDate: input.nextVerificationDate, condition: input.foundCondition ?? a.condition });
    this.audit('VERIFICATION_RECORDED', 'Verification', id, input.reason, input.result);
    this.commit();
    return v;
  }

  // ---------- 10. Retirement & disposal ----------
  startRetirement(input: { assetId: string; retirementReason: string; technicalRecommendation?: string; reason: string }, commit = true, preApproved = false): Disposal {
    this.snapshotBefore();
    if (!preApproved) this.require('disposal.request');
    this.requireReason(input.reason);
    const a = this.asset(input.assetId);
    if (!a) throw new BusinessRuleError('Asset not found');
    if (this.db.disposals.some(d => d.assetId === a.id && d.status !== 'Rejected')) throw new BusinessRuleError('A retirement/disposal record already exists for this asset.');
    if (['Disposed'].includes(a.status)) throw new BusinessRuleError('Asset already disposed.');
    const id = this.nextRef('DSP', this.db.disposals);
    const d: Disposal = { id, assetId: a.id, retirementRequestedByUserId: this.currentUser.id, retirementRequestedAt: nowIso(), retirementReason: input.retirementReason, technicalRecommendation: input.technicalRecommendation,
      retirementApproval: preApproved ? 'Approved' : 'Pending Approval', retirementApprovedByUserId: preApproved ? this.currentUser.id : undefined, retirementApprovedAt: preApproved ? nowIso() : undefined,
      disposalApproval: 'Pending Approval', status: preApproved ? 'Retired' : 'Retirement Pending', createdAt: nowIso() };
    this.db.disposals = [...this.db.disposals, d];
    if (!preApproved) this.addApproval('Retirement', id, 'super_admin');
    this.audit('RETIREMENT_REQUESTED', 'Disposal', id, input.reason, input.retirementReason);
    if (commit) this.commit();
    return d;
  }

  approveRetirement(id: string, approved: boolean, comments: string) {
    this.snapshotBefore();
    this.require('disposal.approve_retirement');
    const d = this.db.disposals.find(x => x.id === id);
    if (!d || d.status !== 'Retirement Pending') throw new BusinessRuleError('Retirement is not pending.');
    this.decideApproval('Retirement', id, approved, comments);
    const a = this.asset(d.assetId)!;
    if (approved) {
      this.addTransaction({ type: 'RETIREMENT', assetId: a.id, reference: id, fromEmployeeId: a.custodianEmployeeId, statusBefore: a.status, statusAfter: 'Retired', reason: d.retirementReason, remarks: comments });
      this.setAsset(a.id, { status: 'Retired', custodianEmployeeId: undefined });
    }
    this.db.disposals = this.db.disposals.map(x => x.id === id ? { ...x, retirementApproval: approved ? 'Approved' : 'Rejected', retirementApprovedByUserId: this.currentUser.id, retirementApprovedAt: nowIso(), status: approved ? 'Retired' : 'Rejected' } : x);
    this.audit(approved ? 'RETIREMENT_APPROVED' : 'RETIREMENT_REJECTED', 'Disposal', id, comments || 'Retirement reviewed');
    this.commit();
  }

  recordDisposal(id: string, input: { dataErased: boolean; disposalMethod: Disposal['disposalMethod']; disposalDate: string; disposalValue?: number; disposalVendor?: string; disposalProof?: Attachment; dataErasureCertificate?: Attachment; reason: string }) {
    this.snapshotBefore();
    this.require('disposal.record');
    this.requireReason(input.reason);
    const d = this.db.disposals.find(x => x.id === id);
    if (!d || d.status !== 'Retired') throw new BusinessRuleError('Asset must be Retired before disposal can be recorded.');
    if (!input.disposalProof) throw new BusinessRuleError('Rule 10: supporting disposal document is required.');
    const { reason: _r, ...disposalFields } = input;                     // reason → audit entry
    this.db.disposals = this.db.disposals.map(x => x.id === id ? { ...x, ...disposalFields, status: 'Disposal Pending' } : x);
    this.attach(d.assetId, 'Disposal', id, 'Proof of Disposal', input.disposalProof);
    this.attach(d.assetId, 'Disposal', id, 'Data Erasure Certificate', input.dataErasureCertificate);
    this.addApproval('Disposal', id, 'super_admin');
    this.audit('DISPOSAL_RECORDED', 'Disposal', id, input.reason, `${input.disposalMethod} on ${input.disposalDate}`);
    this.commit();
  }

  approveDisposal(id: string, approved: boolean, comments: string) {
    this.snapshotBefore();
    this.require('disposal.approve');
    const d = this.db.disposals.find(x => x.id === id);
    if (!d || d.status !== 'Disposal Pending') throw new BusinessRuleError('Disposal is not pending authorization.');
    this.decideApproval('Disposal', id, approved, comments);
    const a = this.asset(d.assetId)!;
    if (approved) {
      this.addTransaction({ type: 'DISPOSAL', assetId: a.id, reference: id, statusBefore: a.status, statusAfter: 'Disposed', reason: `${d.disposalMethod} – ${d.disposalVendor ?? ''}`, remarks: comments });
      this.setAsset(a.id, { status: 'Disposed' });
    }
    this.db.disposals = this.db.disposals.map(x => x.id === id ? { ...x, disposalApproval: approved ? 'Approved' : 'Rejected', disposalApprovedByUserId: this.currentUser.id, disposalApprovedAt: nowIso(), status: approved ? 'Disposed' : 'Retired' } : x);
    this.audit(approved ? 'DISPOSAL_AUTHORIZED' : 'DISPOSAL_REJECTED', 'Disposal', id, comments || 'Disposal reviewed');
    this.commit();
  }

  // ---------- 14. Documents ----------
  private attach(assetId: string | undefined, entityType: string, entityId: string, documentType: string, att?: Attachment, remarks?: string) {
    if (!att) return;
    this.db.documents = [...this.db.documents, { id: this.seq('DOC-', this.db.documents), assetId, entityType, entityId, documentType, attachment: att, uploadedByUserId: this.currentUser.id, uploadedAt: nowIso(), remarks }];
  }
  uploadDocument(input: { assetId?: string; entityType: string; entityId: string; documentType: string; attachment: Attachment; remarks?: string }) {
    this.snapshotBefore();
    this.require('documents.upload');
    this.attach(input.assetId, input.entityType, input.entityId, input.documentType, input.attachment, input.remarks);
    this.audit('DOCUMENT_UPLOADED', input.entityType, input.entityId, `Uploaded ${input.documentType}`, input.attachment.name);
    this.commit();
  }

  // ---------- 12. Users & master data ----------
  /** Creates or updates a role. super_admin is fixed; built-in roles keep their code and name but permissions may be tuned. */
  saveRole(r: RoleDef, reason = 'Role updated') {
    this.snapshotBefore();
    this.require('users.manage');
    const code = (r.code.trim() || r.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!code || !r.name.trim()) throw new BusinessRuleError('Role name is required.');
    if (code === 'super_admin') throw new BusinessRuleError('The Super Admin role cannot be modified.');
    const perms = r.permissions.filter(p => ALL_PERMISSIONS.includes(p));
    if (!perms.length) throw new BusinessRuleError('Select at least one permission.');
    const existing = this.roleDef(code);
    const def: RoleDef = { code, name: r.name.trim(), description: r.description?.trim() || undefined, permissions: perms, builtIn: existing?.builtIn ?? false };
    this.db.roles = existing ? this.db.roles.map(x => x.code === code ? def : x) : [...this.db.roles, def];
    this.audit(existing ? 'ROLE_UPDATED' : 'ROLE_CREATED', 'Role', code, reason, `${def.name}: ${perms.length} permission(s)`);
    this.commit();
    return def;
  }
  roleDeleteBlockers(code: string): string[] {
    const b: string[] = [];
    const r = this.roleDef(code);
    if (!r) return ['role not found'];
    if (r.builtIn) b.push('built-in role');
    const n = this.db.users.filter(u => u.role === code).length;
    if (n) b.push(`assigned to ${n} user(s)`);
    return b;
  }
  deleteRole(code: string, reason: string) {
    this.snapshotBefore();
    this.require('users.manage');
    this.requireReason(reason);
    const blockers = this.roleDeleteBlockers(code);
    if (blockers.length) throw new BusinessRuleError(`Cannot delete role: ${blockers.join('; ')}.`);
    const r = this.roleDef(code)!;
    this.db.roles = this.db.roles.filter(x => x.code !== code);
    this.audit('ROLE_DELETED', 'Role', code, reason, r.name);
    this.commit();
  }

  saveUser(u: User) {
    this.snapshotBefore();
    this.require('users.manage');
    if (!this.roleDef(u.role)) throw new BusinessRuleError('Select a valid role.');
    const exists = this.db.users.some(x => x.id === u.id);
    this.db.users = exists ? this.db.users.map(x => x.id === u.id ? u : x) : [...this.db.users, u];
    this.audit(exists ? 'USER_UPDATED' : 'USER_CREATED', 'User', u.id, `Role ${u.role}`);
    this.commit();
  }
  /** Why an employee cannot be deleted (history must be kept) — empty list means deletable. */
  employeeDeleteBlockers(id: string): string[] {
    const b: string[] = [];
    const held = this.db.assets.filter(a => a.custodianEmployeeId === id).length;
    if (held) b.push(`custodian of ${held} asset(s)`);
    const tx = this.db.transactions.filter(t => t.fromEmployeeId === id || t.toEmployeeId === id).length;
    if (tx) b.push(`${tx} transaction(s) in asset history`);
    const ho = this.db.handovers.filter(h => h.employeeId === id).length;
    if (ho) b.push(`${ho} assignment record(s)`);
    const inc = this.db.incidents.filter(i => i.reportedByEmployeeId === id).length;
    if (inc) b.push(`${inc} incident report(s)`);
    const u = this.db.users.find(x => x.employeeId === id);
    if (u) b.push(`linked to login "${u.name}" (unlink or delete the user first)`);
    if (this.db.departments.some(d => d.headEmployeeId === id)) b.push('set as a department head');
    return b;
  }
  deleteEmployee(id: string, reason: string) {
    this.snapshotBefore();
    this.require('settings.manage');
    this.requireReason(reason);
    const e = this.employee(id);
    if (!e) throw new BusinessRuleError('Employee not found');
    const blockers = this.employeeDeleteBlockers(id);
    if (blockers.length) throw new BusinessRuleError(`Cannot delete ${e.name}: ${blockers.join('; ')}. Mark the employee Inactive instead so history is preserved.`);
    this.db.employees = this.db.employees.filter(x => x.id !== id);
    this.audit('EMPLOYEE_DELETED', 'Employee', id, reason, `${e.employeeCode} ${e.name}`);
    this.commit();
  }
  userDeleteBlockers(id: string): string[] {
    const b: string[] = [];
    if (id === this.currentUser.id) b.push('you cannot delete the account you are signed in with');
    if (this.db.users.filter(u => u.role === 'super_admin' && u.active).length === 1 && this.user(id)?.role === 'super_admin') b.push('the last active Super Admin');
    const tx = this.db.transactions.filter(t => t.performedByUserId === id).length;
    if (tx) b.push(`${tx} transaction(s) performed`);
    const ap = this.db.approvals.filter(a => a.decidedByUserId === id || a.requestedByUserId === id).length;
    if (ap) b.push(`${ap} approval record(s)`);
    const al = this.db.auditLogs.filter(l => l.userId === id).length;
    if (al) b.push(`${al} audit entr(ies)`);
    return b;
  }
  deleteUser(id: string, reason: string) {
    this.snapshotBefore();
    this.require('users.manage');
    this.requireReason(reason);
    const u = this.user(id);
    if (!u) throw new BusinessRuleError('User not found');
    const blockers = this.userDeleteBlockers(id);
    if (blockers.length) throw new BusinessRuleError(`Cannot delete ${u.name}: ${blockers.join('; ')}. Deactivate the user instead.`);
    this.db.users = this.db.users.filter(x => x.id !== id);
    this.audit('USER_DELETED', 'User', id, reason, `${u.name} (${u.role})`);
    this.commit();
  }

  saveEmployee(e: Employee) {
    this.snapshotBefore();
    this.require('settings.manage');
    const exists = this.db.employees.some(x => x.id === e.id);
    this.db.employees = exists ? this.db.employees.map(x => x.id === e.id ? e : x) : [...this.db.employees, e];
    this.audit(exists ? 'EMPLOYEE_UPDATED' : 'EMPLOYEE_CREATED', 'Employee', e.id, e.employeeCode);
    this.commit();
  }
  // ---- Master-data deletes: refused while any record still references the entry (history is never rewritten) ----
  departmentDeleteBlockers(id: string): string[] {
    const b: string[] = [];
    const n = (x: number, what: string) => { if (x) b.push(`${x} ${what}`); };
    n(this.db.assets.filter(a => a.departmentId === id).length, 'asset(s) in this department');
    n(this.db.employees.filter(e => e.departmentId === id).length, 'employee(s)');
    n(this.db.users.filter(u => u.departmentId === id).length, 'user login(s) scoped to it');
    n(this.db.transactions.filter(t => t.fromDepartmentId === id || t.toDepartmentId === id).length, 'transaction(s) in asset history');
    n(this.db.transfers.filter(t => t.fromDepartmentId === id || t.toDepartmentId === id).length, 'transfer record(s)');
    return b;
  }
  deleteDepartment(id: string, reason: string) {
    this.snapshotBefore();
    this.require('settings.manage');
    this.requireReason(reason);
    const d = this.department(id);
    if (!d) throw new BusinessRuleError('Department not found');
    const blockers = this.departmentDeleteBlockers(id);
    if (blockers.length) throw new BusinessRuleError(`Cannot delete ${d.name}: ${blockers.join('; ')}. Move them to another department first.`);
    this.db.departments = this.db.departments.filter(x => x.id !== id);
    this.audit('DEPARTMENT_DELETED', 'Department', id, reason, `${d.code} ${d.name}`);
    this.commit();
  }
  locationDeleteBlockers(id: string): string[] {
    const b: string[] = [];
    const n = (x: number, what: string) => { if (x) b.push(`${x} ${what}`); };
    n(this.db.assets.filter(a => a.locationId === id).length, 'asset(s) at this location');
    n(this.db.employees.filter(e => e.workLocationId === id).length, 'employee(s) based here');
    n(this.db.transactions.filter(t => t.fromLocationId === id || t.toLocationId === id).length, 'transaction(s) in asset history');
    n(this.db.transfers.filter(t => t.fromLocationId === id || t.toLocationId === id).length, 'transfer record(s)');
    return b;
  }
  deleteLocation(id: string, reason: string) {
    this.snapshotBefore();
    this.require('settings.manage');
    this.requireReason(reason);
    const l = this.location(id);
    if (!l) throw new BusinessRuleError('Location not found');
    const blockers = this.locationDeleteBlockers(id);
    if (blockers.length) throw new BusinessRuleError(`Cannot delete ${l.name}: ${blockers.join('; ')}.`);
    this.db.locations = this.db.locations.filter(x => x.id !== id);
    this.audit('LOCATION_DELETED', 'Location', id, reason, `${l.code} ${l.name}`);
    this.commit();
  }
  categoryDeleteBlockers(id: string): string[] {
    const n = this.db.assets.filter(a => a.categoryId === id).length;
    return n ? [`${n} asset(s) registered in this category`] : [];
  }
  deleteCategory(id: string, reason: string) {
    this.snapshotBefore();
    this.require('settings.manage');
    this.requireReason(reason);
    const c = this.category(id);
    if (!c) throw new BusinessRuleError('Category not found');
    const blockers = this.categoryDeleteBlockers(id);
    if (blockers.length) throw new BusinessRuleError(`Cannot delete ${c.name}: ${blockers.join('; ')}. Asset IDs (GW-AST-${c.code}-…) must stay resolvable.`);
    this.db.categories = this.db.categories.filter(x => x.id !== id);
    this.audit('CATEGORY_DELETED', 'Category', id, reason, `${c.code} ${c.name}`);
    this.commit();
  }

  saveCategory(c: Category) {
    this.snapshotBefore();
    this.require('settings.manage');
    if (!/^[A-Z]{2,4}$/.test(c.code) || !c.name.trim()) throw new BusinessRuleError('Category needs a 2–4 letter code and a name.');
    if (this.db.categories.some(x => x.id !== c.id && x.code === c.code)) throw new BusinessRuleError(`Category code ${c.code} already exists.`);
    const exists = this.db.categories.some(x => x.id === c.id);
    this.db.categories = exists ? this.db.categories.map(x => x.id === c.id ? c : x) : [...this.db.categories, c];
    this.audit(exists ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED', 'Category', c.id, c.code);
    this.commit();
  }
  saveDepartment(d: Department) {
    this.snapshotBefore();
    this.require('settings.manage');
    if (!d.code.trim() || !d.name.trim()) throw new BusinessRuleError('Department code and name are required.');
    if (this.db.departments.some(x => x.id !== d.id && x.code.toUpperCase() === d.code.toUpperCase())) throw new BusinessRuleError(`Department code ${d.code} already exists.`);
    const exists = this.db.departments.some(x => x.id === d.id);
    this.db.departments = exists ? this.db.departments.map(x => x.id === d.id ? d : x) : [...this.db.departments, d];
    this.audit(exists ? 'DEPARTMENT_UPDATED' : 'DEPARTMENT_CREATED', 'Department', d.id, d.code);
    this.commit();
  }
  saveLocation(l: Location) {
    this.snapshotBefore();
    this.require('settings.manage');
    if (!l.code.trim() || !l.name.trim()) throw new BusinessRuleError('Location code and name are required.');
    if (this.db.locations.some(x => x.id !== l.id && x.code.toUpperCase() === l.code.toUpperCase())) throw new BusinessRuleError(`Location code ${l.code} already exists.`);
    const exists = this.db.locations.some(x => x.id === l.id);
    this.db.locations = exists ? this.db.locations.map(x => x.id === l.id ? l : x) : [...this.db.locations, l];
    this.audit(exists ? 'LOCATION_UPDATED' : 'LOCATION_CREATED', 'Location', l.id, l.code);
    this.commit();
  }

  // ---------- Metrics ----------
  metrics() {
    const assets = this.db.assets;
    const count = (s: AssetStatus) => assets.filter(a => a.status === s).length;
    const in30 = addMonths(today(), 1);
    const active = assets.filter(a => !['Disposed', 'Retired', 'Lost'].includes(a.status));
    return {
      total: assets.length, available: count('Available'), assigned: count('Assigned') + count('Transferred'), underRepair: count('Under Repair'),
      damaged: count('Damaged'), lost: count('Lost'), retired: count('Retired'), disposed: count('Disposed'),
      totalValue: assets.filter(a => a.status !== 'Disposed').reduce((s, a) => s + (a.purchaseCost || 0), 0),
      warrantyExpiring: active.filter(a => a.warrantyExpiry && a.warrantyExpiry >= today() && a.warrantyExpiry <= in30).length,
      verificationOverdue: active.filter(a => a.nextVerificationDate && a.nextVerificationDate < today()).length,
      byCategory: this.db.categories.map(c => ({ label: c.name, value: assets.filter(a => a.categoryId === c.id).length })).filter(x => x.value > 0),
      byDepartment: this.db.departments.map(d => ({ label: d.name, value: assets.filter(a => a.departmentId === d.id).length })).filter(x => x.value > 0),
      byLocation: this.db.locations.map(l => ({ label: l.name, value: assets.filter(a => a.locationId === l.id).length })).filter(x => x.value > 0),
      recent: [...this.db.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
      pendingApprovals: this.db.approvals.filter(a => a.decision === 'Pending Approval'),
    };
  }
}

export const store = new Store();
export type { TransactionType };
