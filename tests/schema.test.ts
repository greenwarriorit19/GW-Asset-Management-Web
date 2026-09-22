import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Runs supabase/schema.sql against an in-process PostgreSQL so the migration is proven to apply
// and the key database-side rules behave, before it is pasted into the Supabase SQL editor.
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // Supabase provides auth.uid(); emulate it so the RLS helper functions compile.
  await db.exec(`create schema if not exists auth; create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  // PGlite has no pgcrypto; gen_random_uuid() is built into PostgreSQL 13+, so the extension line is not needed here.
  const sql = readFileSync('supabase/schema.sql', 'utf8').replace('create extension if not exists pgcrypto;', '');
  await db.exec(sql);
}, 60_000);

describe('supabase/schema.sql', () => {
  it('creates all 15 application tables', async () => {
    const r = await db.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`);
    const names = r.rows.map(x => x.table_name);
    for (const t of ['roles', 'departments', 'locations', 'asset_categories', 'employees', 'users', 'assets', 'asset_transactions', 'asset_assignments', 'asset_assignment_items', 'asset_returns', 'asset_inspections', 'asset_transfers', 'asset_repairs', 'asset_incidents', 'asset_disposals', 'asset_approvals', 'asset_documents', 'audit_logs', 'reference_counters']) {
      expect(names, `missing table ${t}`).toContain(t);
    }
    expect(names).not.toContain('asset_verifications');
  });

  it('seeds the five built-in roles with permissions', async () => {
    const r = await db.query<{ code: string; n: number }>(`select code, cardinality(permissions) as n from roles order by code`);
    expect(r.rows.map(x => x.code).sort()).toEqual(['asset_admin', 'auditor', 'dept_head', 'employee', 'super_admin']);
    expect(r.rows.find(x => x.code === 'super_admin')!.n).toBe(31);
  });

  it('generates Asset IDs and document references in the required formats', async () => {
    await db.exec(`insert into asset_categories (id, code, name) values ('00000000-0000-0000-0000-000000000001', 'MOB', 'Mobile Phone')`);
    const a = await db.query<{ id: string }>(`select next_asset_id('00000000-0000-0000-0000-000000000001') as id`);
    const b = await db.query<{ id: string }>(`select next_asset_id('00000000-0000-0000-0000-000000000001') as id`);
    expect(a.rows[0].id).toBe('GW-AST-MOB-0001'); expect(b.rows[0].id).toBe('GW-AST-MOB-0002');
    const h = await db.query<{ r: string }>(`select next_reference('HO') as r`);
    const h2 = await db.query<{ r: string }>(`select next_reference('HO') as r`);
    expect(h.rows[0].r).toMatch(/^GW-HO-\d{6}-0001$/); expect(h2.rows[0].r).toMatch(/^GW-HO-\d{6}-0002$/);
  });

  it('enforces unique serial / IMEI (Rule 2) and append-only history (Rule 6)', async () => {
    await db.exec(`insert into users (id, name, email, role) values ('00000000-0000-0000-0000-0000000000aa', 'Admin', 'a@gw.in', 'super_admin')`);
    await db.exec(`insert into assets (id, category_id, name, serial_number, imei, registered_by) values ('GW-AST-MOB-0001', '00000000-0000-0000-0000-000000000001', 'Phone', 'SN-1', '111', '00000000-0000-0000-0000-0000000000aa')`);
    await expect(db.exec(`insert into assets (id, category_id, name, serial_number, registered_by) values ('GW-AST-MOB-0002', '00000000-0000-0000-0000-000000000001', 'Phone', 'sn-1', '00000000-0000-0000-0000-0000000000aa')`)).rejects.toThrow(/assets_serial_uq/);
    await db.exec(`insert into asset_transactions (type, asset_id, status_before, status_after, performed_by, performed_by_name, reason) values ('REGISTRATION', 'GW-AST-MOB-0001', 'Available', 'Available', '00000000-0000-0000-0000-0000000000aa', 'Admin', 'New asset')`);
    await expect(db.exec(`update asset_transactions set reason = 'edited'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`delete from asset_transactions`)).rejects.toThrow(/append-only/);
  });

  it('only Available assets can be placed on a handover (Rule 4)', async () => {
    await db.exec(`insert into departments (id, code, name) values ('00000000-0000-0000-0000-0000000000d1', 'OPS', 'Operations');
      insert into locations (id, code, name) values ('00000000-0000-0000-0000-0000000000e1', 'HO', 'Head Office');
      insert into employees (id, employee_code, name, department_id, work_location_id) values ('00000000-0000-0000-0000-0000000000e2', 'GW-EMP-0001', 'Arun', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1');
      insert into asset_assignments (id, employee_id, issued_by) values ('GW-HO-202609-0001', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000aa');`);
    await db.exec(`insert into asset_assignment_items (assignment_id, asset_id, condition) values ('GW-HO-202609-0001', 'GW-AST-MOB-0001', 'New')`);
    const st = await db.query<{ status: string }>(`select status from assets where id = 'GW-AST-MOB-0001'`);
    expect(st.rows[0].status).toBe('Reserved');
    await expect(db.exec(`insert into asset_assignment_items (assignment_id, asset_id, condition) values ('GW-HO-202609-0001', 'GW-AST-MOB-0001', 'New')`)).rejects.toThrow(/Rule 4/);
  });

  it('reporting views work', async () => {
    const m = await db.query<{ total_assets: number }>(`select total_assets from v_dashboard_metrics`);
    expect(Number(m.rows[0].total_assets)).toBe(1);
    const reg = await db.query(`select * from v_asset_register`);
    expect(reg.rows.length).toBe(1);
  });
});
