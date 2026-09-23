import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { ALL_PERMISSIONS } from '../src/data/permissions';

// Runs supabase/schema.sql against an in-process PostgreSQL so the migration is proven to apply
// and the key database-side rules behave, before it is pasted into the Supabase SQL editor.
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // Supabase-provided pieces emulated: auth schema, the `authenticated` role and the realtime publication.
  await db.exec(`
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"email":"greenwarriorit19@gmail.com"}'::jsonb $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    create publication supabase_realtime;
  `);
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
}, 60_000);

describe('supabase/schema.sql', () => {
  it('creates every application table', async () => {
    const r = await db.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`);
    const names = r.rows.map(x => x.table_name);
    for (const t of ['roles', 'departments', 'locations', 'asset_categories', 'employees', 'users', 'assets', 'asset_transactions', 'audit_logs', 'handovers', 'asset_returns', 'asset_transfers', 'asset_repairs', 'asset_incidents', 'asset_disposals', 'asset_approvals', 'asset_documents']) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });

  it('is idempotent — running the script twice is harmless', async () => {
    await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
    const r = await db.query<{ n: number }>(`select count(*)::int as n from roles`);
    expect(r.rows[0].n).toBe(2);
  });

  it('seeds roles, master data and the Super Admin login', async () => {
    const roles = await db.query<{ code: string; n: number }>(`select code, cardinality(permissions) as n from roles order by code`);
    expect(roles.rows.map(x => x.code).sort()).toEqual(['asset_admin', 'super_admin']);
    expect(roles.rows.find(x => x.code === 'super_admin')!.n).toBe(ALL_PERMISSIONS.length);
    const u = await db.query<{ id: string; role: string }>(`select id, role from users`);
    expect(u.rows).toEqual([{ id: 'U-SA', role: 'super_admin' }]);
    const c = await db.query<{ n: number }>(`select count(*)::int as n from asset_categories`);
    expect(c.rows[0].n).toBe(7);
    const me = await db.query<{ id: string }>(`select app_user_id() as id`);
    expect(me.rows[0].id).toBe('U-SA');
  });

  it('enforces unique serial / IMEI (Rule 2), Asset ID format (Rule 1) and append-only history (Rule 6)', async () => {
    await db.exec(`insert into assets (id, category_id, name, serial_number, imei, mdm_registered, registered_by, registered_at) values ('GW-AST-MOB-0001', 'C-MOB', 'Phone', 'SN-1', '111', true, 'U-SA', '2026-09-22T00:00:00Z')`);
    await expect(db.exec(`insert into assets (id, category_id, name, serial_number, registered_at) values ('GW-AST-MOB-0002', 'C-MOB', 'Phone', 'sn-1', 'x')`)).rejects.toThrow(/assets_serial_uq/);
    await expect(db.exec(`insert into assets (id, category_id, name, serial_number, registered_at) values ('BAD-ID', 'C-MOB', 'Phone', 'SN-9', 'x')`)).rejects.toThrow(/check/);
    await db.exec(`insert into asset_transactions (id, type, asset_id, date, status_before, status_after, performed_by_user_id, performed_by_name, reason) values ('T-000001', 'REGISTRATION', 'GW-AST-MOB-0001', '2026-09-22T00:00:00Z', 'Available', 'Available', 'U-SA', 'Admin', 'New asset')`);
    await expect(db.exec(`update asset_transactions set reason = 'edited'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`delete from asset_transactions`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`delete from audit_logs`)).rejects.toThrow(/append-only/);
  });

  it('stores workflow records with JSON items / attachments and keeps updated_at current', async () => {
    await db.exec(`insert into employees (id, employee_code, name, department_id, work_location_id) values ('E-1', 'GW-EMP-0001', 'Arun', 'D-OPS', 'L-PM')`);
    await db.exec(`insert into handovers (id, date, employee_id, issued_by_user_id, items, status, created_by_user_id, created_at)
      values ('GW-HO-202609-0001', '2026-09-22', 'E-1', 'U-SA', '[{"assetId":"GW-AST-MOB-0001","condition":"New","quantity":1,"accessories":"Charger","remarks":""}]', 'Awaiting Approval', 'U-SA', 'x')`);
    const before = await db.query<{ updated_at: string }>(`select updated_at from handovers`);
    await new Promise(r => setTimeout(r, 20));
    await db.exec(`update handovers set status = 'Active'`);
    const after = await db.query<{ updated_at: string; items: unknown }>(`select updated_at, items from handovers`);
    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(new Date(before.rows[0].updated_at).getTime());
    expect((after.rows[0].items as { assetId: string }[])[0].assetId).toBe('GW-AST-MOB-0001');
  });

  it('row level security is enabled on every table with a staff policy', async () => {
    const r = await db.query<{ tablename: string; rowsecurity: boolean }>(`select tablename, rowsecurity from pg_tables where schemaname = 'public'`);
    expect(r.rows.every(x => x.rowsecurity)).toBe(true);
    const p = await db.query<{ n: number }>(`select count(*)::int as n from pg_policies where schemaname = 'public'`);
    expect(p.rows[0].n).toBe(r.rows.length);
  });

  it('reporting views work', async () => {
    const m = await db.query<{ total_assets: number }>(`select total_assets from v_dashboard_metrics`);
    expect(Number(m.rows[0].total_assets)).toBe(1);
    const reg = await db.query<{ category: string }>(`select category from v_asset_register`);
    expect(reg.rows[0].category).toBe('Mobile Phone');
  });
});

describe('app model ↔ table round-trip', () => {
  it('every record of the full demo dataset survives toRow → PostgreSQL → fromRow unchanged', async () => {
    const { buildSeed } = await import('./fixtures/demo');
    const { ORDER, TABLES, KEY, toRow, fromRow } = await import('../src/data/supabase');
    const seed = buildSeed();
    const fresh = new PGlite();
    await fresh.exec(`create schema if not exists auth; create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$; create publication supabase_realtime;`);
    await fresh.exec(readFileSync('supabase/schema.sql', 'utf8'));
    // Start from an empty set of seeded rows so the fixture's own master data is what gets compared.
    await fresh.exec(`alter table audit_logs disable trigger audit_logs_immutable; delete from audit_logs; alter table audit_logs enable trigger audit_logs_immutable; delete from users; delete from asset_categories; delete from locations; delete from departments; delete from roles;`);
    let total = 0;
    for (const c of ORDER) {
      const key = KEY[c] ?? 'id';
      const rows = (seed[c] as unknown as Record<string, unknown>[]);
      for (const obj of rows) {
        const row = toRow(obj);
        const cols = Object.keys(row);
        const sql = `insert into ${TABLES[c]} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) on conflict do nothing`;
        await fresh.query(sql, cols.map(k => (row[k] !== null && typeof row[k] === 'object' && !Array.isArray(row[k])) ? JSON.stringify(row[k]) : row[k]));
        const back = await fresh.query<Record<string, unknown>>(`select * from ${TABLES[c]} where ${key} = $1`, [obj[key]]);
        const restored = fromRow(back.rows[0]);
        const original = JSON.parse(JSON.stringify(obj));            // drop undefined keys like the wire format does
        expect(restored, `${TABLES[c]} ${String(obj[key])}`).toEqual(original);
        total++;
      }
    }
    expect(total).toBeGreaterThan(80);
  }, 120_000);
});

describe('supabase/reset.sql', () => {
  it('after a v1-style database, reset.sql + schema.sql leaves a clean v2 schema', async () => {
    const pg = new PGlite();
    await pg.exec(`create schema if not exists auth; create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$; create publication supabase_realtime;`);
    // a v1 leftover: same table name, different columns
    await pg.exec(`create type role_code as enum ('super_admin'); create table asset_transactions (id bigserial primary key, occurred_at timestamptz);`);
    await pg.exec(readFileSync('supabase/reset.sql', 'utf8'));
    await pg.exec(readFileSync('supabase/schema.sql', 'utf8'));
    const cols = await pg.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'asset_transactions'`);
    expect(cols.rows.map(c => c.column_name)).toContain('date');
    const r = await pg.query<{ n: number }>(`select count(*)::int as n from roles`);
    expect(r.rows[0].n).toBe(2);
  }, 60_000);
});

describe('records created by the app fit the database schema', () => {
  it('a full lifecycle through the store inserts into PostgreSQL with no unknown columns', async () => {
    const { Store } = await import('../src/data/store');
    const { ORDER, TABLES, KEY, toRow } = await import('../src/data/supabase');
    localStorage.clear();
    const s = new Store();                       // local mode (tests pin VITE_SUPABASE_* to empty)
    s.switchUser('U-SA');
    const { loadSampleData } = await import('../src/data/sample');
    loadSampleData(s);                           // employees, assets, assignments, return, repair, incident, retirement
    const db = s.getSnapshot();
    // …and take the remaining steps so every table is populated
    const rp = s.getSnapshot().repairs[0];
    s.approveRepair(rp.id, true, 'Approved');
    s.completeRepair(rp.id, { actualCost: 1800, completionDate: '2026-09-22', workDone: 'Replaced screen', inspectionNotes: 'ok', outcome: 'Available', conditionAfter: 'Good', reason: 'Repair completed' });
    const inc = s.getSnapshot().incidents[0];
    s.investigateIncident(inc.id, { investigationNotes: 'Accidental', responsibility: 'None', recoveryAction: 'None', resolution: 'Repair', reason: 'Reviewed' });
    s.approveIncident(inc.id, true, 'Proceed');
    const dsp = s.getSnapshot().disposals[0];
    s.approveRetirement(dsp.id, true, 'Approved');
    s.recordDisposal(dsp.id, { dataErased: true, disposalMethod: 'Scrap', disposalDate: '2026-09-22', disposalValue: 500, disposalVendor: 'Scrap Traders', disposalProof: { name: 'r.pdf', type: 'application/pdf', size: 10 }, reason: 'Sold as scrap' });
    s.approveDisposal(dsp.id, true, 'Authorized');
    const asset = s.getSnapshot().assets.find(a => a.status === 'Available')!;
    s.requestTransfer({ assetId: asset.id, toDepartmentId: 'D-OPS', toLocationId: 'L-PM', reason: 'Moved to the depot', conditionAtTransfer: 'Good' });
    const tr = s.getSnapshot().transfers[0];
    s.approveTransfer(tr.id, true, 'Approved'); s.completeTransfer(tr.id, 'Handed over');
    s.uploadDocument({ assetId: asset.id, entityType: 'Asset', entityId: asset.id, documentType: 'Invoice', attachment: { name: 'i.pdf', type: 'application/pdf', size: 20, driveId: 'x', url: 'https://drive/x' } });

    const pg = new PGlite();
    await pg.exec(`create schema if not exists auth; create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$; create publication supabase_realtime;`);
    await pg.exec(readFileSync('supabase/schema.sql', 'utf8'));
    await pg.exec(`alter table audit_logs disable trigger audit_logs_immutable; delete from audit_logs; alter table audit_logs enable trigger audit_logs_immutable;
      delete from users; delete from asset_categories; delete from locations; delete from departments; delete from roles;`);

    const final = s.getSnapshot();
    let rows = 0;
    for (const c of ORDER) {
      const key = KEY[c] ?? 'id';
      for (const obj of final[c] as unknown as Record<string, unknown>[]) {
        const row = toRow(obj);
        const cols = Object.keys(row);
        const sql = `insert into ${TABLES[c]} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) on conflict do nothing`;
        const values = cols.map(k => (row[k] !== null && typeof row[k] === 'object' && !Array.isArray(row[k])) ? JSON.stringify(row[k]) : row[k]);
        await pg.query(sql, values).catch((e: Error) => { throw new Error(`${TABLES[c]} ${String(obj[key])}: ${e.message}`); });
        rows++;
      }
    }
    expect(rows).toBeGreaterThan(60);
    const assets = await pg.query<{ n: number }>(`select count(*)::int as n from assets`);
    expect(assets.rows[0].n).toBe(final.assets.length);
  }, 120_000);
});
