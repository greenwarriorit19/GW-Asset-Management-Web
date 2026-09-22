// Supabase persistence for the Store: loads every table into the in-memory Database, writes the
// per-row difference after each commit, and listens for other users' changes over Realtime.
import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { Database, User } from './types';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
export const supabaseConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

let client: SupabaseClient | undefined;
export function supabase(): SupabaseClient {
  if (!client) {
    if (!supabaseConfigured()) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return client;
}

// ---------- collection ↔ table ----------
export type Collection = Exclude<keyof Database, 'version'>;
export const TABLES: Record<Collection, string> = {
  users: 'users', roles: 'roles', departments: 'departments', locations: 'locations', categories: 'asset_categories', employees: 'employees',
  assets: 'assets', transactions: 'asset_transactions', handovers: 'handovers', returns: 'asset_returns', transfers: 'asset_transfers',
  repairs: 'asset_repairs', incidents: 'asset_incidents', verifications: 'asset_verifications', disposals: 'asset_disposals',
  approvals: 'asset_approvals', documents: 'asset_documents', auditLogs: 'audit_logs',
};
const COLLECTIONS = (Object.keys(TABLES) as Collection[]).filter(c => c !== 'verifications');   // verification module retired
const APPEND_ONLY = new Set<Collection>(['transactions', 'auditLogs']);
/** Roles are keyed by `code` in the database; everything else by `id`. */
export const KEY: Partial<Record<Collection, string>> = { roles: 'code' };
// Insert order respects foreign keys; deletes run in reverse.
export const ORDER: Collection[] = ['roles', 'departments', 'locations', 'categories', 'employees', 'users', 'assets', 'transactions', 'handovers', 'returns', 'transfers', 'repairs', 'incidents', 'disposals', 'approvals', 'documents', 'auditLogs'];

const snake = (s: string) => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export function toRow(obj: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) row[snake(k)] = v === undefined ? null : v;
  return row;
}
export function fromRow(row: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'updated_at') continue;
    if (v === null) continue;                               // optional fields stay undefined in the app model
    obj[camel(k)] = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && NUMERIC.has(k) ? Number(v) : v;
  }
  return obj;
}
const NUMERIC = new Set(['purchase_cost', 'estimated_cost', 'actual_cost', 'recovery_amount', 'disposal_value', 'verification_interval_months']);

// ---------- load ----------
export async function loadDatabase(): Promise<Database> {
  const sb = supabase();
  const db = { version: 1, verifications: [] } as unknown as Database;
  await Promise.all(COLLECTIONS.map(async c => {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {                    // PostgREST pages at 1000 rows
      const { data, error } = await sb.from(TABLES[c]).select('*').range(from, from + 999);
      if (error) throw new Error(`Supabase (${TABLES[c]}): ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    (db as unknown as Record<string, unknown[]>)[c] = rows.map(fromRow);
  }));
  // Keep a stable ordering identical to the local store's (ids are sequential).
  for (const c of COLLECTIONS) (db[c] as { id?: string; code?: string }[]).sort((a, b) => String(a.id ?? a.code).localeCompare(String(b.id ?? b.code)));
  return db;
}

// ---------- write the difference between two snapshots ----------
export interface SyncResult { upserts: number; deletes: number }

const rowsOf = (db: Database, c: Collection) => db[c] as unknown as Record<string, unknown>[];

export async function persistDiff(prev: Database, next: Database): Promise<SyncResult> {
  const sb = supabase();
  let upserts = 0, deletes = 0;
  const errors: string[] = [];
  for (const c of ORDER) {
    const key = KEY[c] ?? 'id';
    const before = new Map(rowsOf(prev, c).map(r => [String(r[key]), r]));
    const after = new Map(rowsOf(next, c).map(r => [String(r[key]), r]));
    const changed = [...after.values()].filter(r => { const b = before.get(String(r[key])); return !b || JSON.stringify(b) !== JSON.stringify(r); });
    if (changed.length) {
      // Append-only tables only ever receive inserts of brand-new rows.
      const rows = (APPEND_ONLY.has(c) ? changed.filter(r => !before.has(String(r[key]))) : changed).map(toRow);
      if (rows.length) {
        const q = APPEND_ONLY.has(c) ? sb.from(TABLES[c]).insert(rows) : sb.from(TABLES[c]).upsert(rows, { onConflict: key });
        const { error } = await q;
        if (error) errors.push(`${TABLES[c]}: ${error.message}`); else upserts += rows.length;
      }
    }
  }
  for (const c of [...ORDER].reverse()) {
    if (APPEND_ONLY.has(c)) continue;
    const key = KEY[c] ?? 'id';
    const afterIds = new Set(rowsOf(next, c).map(r => String(r[key])));
    const removed = rowsOf(prev, c).map(r => String(r[key])).filter(id => !afterIds.has(id));
    if (removed.length) {
      const { error } = await sb.from(TABLES[c]).delete().in(key, removed);
      if (error) errors.push(`${TABLES[c]}: ${error.message}`); else deletes += removed.length;
    }
  }
  if (errors.length) throw new Error(errors.join(' · '));
  return { upserts, deletes };
}

/** Replaces the whole database (backup restore): deletes everything not in `next`, then writes `next`. */
export async function replaceDatabase(prev: Database, next: Database) {
  return persistDiff(prev, next);
}

// ---------- realtime ----------
export function subscribeChanges(onChange: () => void): () => void {
  const sb = supabase();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ch: RealtimeChannel = sb.channel('gw-asset-db');
  for (const c of COLLECTIONS) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: TABLES[c] }, () => {
      clearTimeout(timer); timer = setTimeout(onChange, 400);   // coalesce bursts of row events into one reload
    });
  }
  ch.subscribe();
  return () => { clearTimeout(timer); sb.removeChannel(ch); };
}

// ---------- auth ----------
export async function currentAuthEmail(): Promise<string | undefined> {
  const { data } = await supabase().auth.getSession();
  return data.session?.user.email ?? undefined;
}
export async function signIn(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
}
export async function signOut() { await supabase().auth.signOut(); }
export async function resetPassword(email: string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}` });
  if (error) throw new Error(error.message);
}
export async function updatePassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
export function onAuthChange(cb: (email?: string) => void) {
  const { data } = supabase().auth.onAuthStateChange((_e, session) => cb(session?.user.email ?? undefined));
  return () => data.subscription.unsubscribe();
}
/** The app user record for a signed-in email, if that person has been given access. */
export function matchUser(db: Database, email?: string): User | undefined {
  if (!email) return undefined;
  return db.users.find(u => u.active && u.email.trim().toLowerCase() === email.trim().toLowerCase());
}
