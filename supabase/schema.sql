-- Green Warrior Solid Waste Management
-- Asset Management & Employee Handover System — Supabase / PostgreSQL schema (v2)
--
-- One table per application entity, columns = snake_case of the app model, so the web app syncs
-- rows directly. `assets` holds the CURRENT state; `asset_transactions` and `audit_logs` are the
-- permanent history and are append-only (UPDATE/DELETE blocked by trigger).
-- Run this once in the Supabase SQL editor. Safe to re-run: everything is "if not exists".

-- ---------- Enumerations ----------
do $$ begin
  create type asset_status as enum ('Available','Reserved','Assigned','Transferred','Returned','Under Inspection','Under Repair','Damaged','Lost','Retired','Disposed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type asset_condition as enum ('New','Good','Fair','Damaged','Not Working');
exception when duplicate_object then null; end $$;
do $$ begin
  create type approval_state as enum ('Pending Approval','Approved','Rejected');
exception when duplicate_object then null; end $$;

-- ---------- Roles & users ----------
create table if not exists roles (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text,
  permissions text[] not null default '{}',
  built_in boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into roles (code, name, description, built_in, permissions) values
  ('super_admin','Super Admin','Complete system access; manages users, roles, categories and settings', true, array['asset.register','asset.edit','asset.view_all','asset.view_department','asset.view_own','handover.create','handover.approve','handover.acknowledge','return.create','return.inspect','return.request','transfer.request','transfer.approve','transfer.complete','repair.create','repair.approve','repair.complete','incident.report','incident.investigate','incident.approve','disposal.request','disposal.approve_retirement','disposal.record','disposal.approve','reports.view','reports.export','audit.view','documents.upload','documents.view','users.manage','settings.manage']),
  ('asset_admin','Asset Administrator','Registers, issues, transfers, receives, repairs, retires and disposes of assets; generates reports', true, array['asset.register','asset.edit','asset.view_all','handover.create','return.create','return.inspect','transfer.request','transfer.complete','repair.create','repair.complete','incident.report','incident.investigate','disposal.request','disposal.record','reports.view','reports.export','audit.view','documents.upload','documents.view']),
  ('dept_head','Department Head','Approves handovers, transfers, damage reports and returns; views department assets', true, array['asset.view_department','handover.approve','transfer.approve','transfer.request','incident.approve','incident.investigate','repair.approve','reports.view','reports.export','documents.view','incident.report','return.request']),
  ('employee','Employee','Views assigned assets, accepts handovers, reports damage or loss, requests return or transfer', true, array['asset.view_own','handover.acknowledge','incident.report','return.request','transfer.request','documents.view']),
  ('auditor','Auditor / Management','Read-only access to dashboards, history, documents and reports', true, array['asset.view_all','reports.view','reports.export','audit.view','documents.view'])
on conflict (code) do nothing;

create table if not exists departments (
  id text primary key, code text not null, name text not null, head_employee_id text,
  updated_at timestamptz not null default now()
);
create unique index if not exists departments_code_uq on departments (upper(code));

create table if not exists locations (
  id text primary key, code text not null, name text not null, address text,
  updated_at timestamptz not null default now()
);
create unique index if not exists locations_code_uq on locations (upper(code));

create table if not exists asset_categories (
  id text primary key, code text not null check (code ~ '^[A-Z]{2,4}$'), name text not null, description text,
  verification_interval_months int not null default 6,
  updated_at timestamptz not null default now()
);
create unique index if not exists asset_categories_code_uq on asset_categories (code);

create table if not exists employees (
  id text primary key, employee_code text not null unique, name text not null, designation text,
  department_id text references departments(id), date_of_joining text, work_location_id text references locations(id),
  mobile text, email text, active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key, name text not null, email text not null, role text not null references roles(code),
  employee_id text references employees(id), department_id text references departments(id), active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_uq on users (lower(email));

-- ---------- Assets (current state) ----------
create table if not exists assets (
  id text primary key check (id ~ '^GW-AST-[A-Z]{2,4}-[0-9]{4}$'),   -- Rule 1
  category_id text not null references asset_categories(id),
  name text not null, manufacturer text, model text,
  serial_number text not null, imei text, sim text, barcode text,
  ownership_type text not null default 'Company Owned',
  supplier_name text, invoice_number text, po_number text, purchase_date text, purchase_cost numeric(12,2) not null default 0,
  warranty_start text, warranty_expiry text, funding text,
  status asset_status not null default 'Available', condition asset_condition not null default 'New',
  department_id text references departments(id), location_id text references locations(id), custodian_employee_id text references employees(id),
  last_verification_date text, next_verification_date text,
  specification text, accessories text, maintenance_notes text, remarks text,
  invoice_attachment jsonb, warranty_attachment jsonb, photo jsonb,
  registered_by text, registered_at text not null, registration_approved_by text,
  updated_at timestamptz not null default now()
);
-- Rule 2: unique serial / IMEI / SIM (case-insensitive, blanks ignored)
create unique index if not exists assets_serial_uq on assets (upper(serial_number));
create unique index if not exists assets_imei_uq on assets (upper(imei)) where imei is not null and imei <> '';
create unique index if not exists assets_sim_uq on assets (upper(sim)) where sim is not null and sim <> '';
create index if not exists assets_status_idx on assets (status);
create index if not exists assets_custodian_idx on assets (custodian_employee_id);

-- ---------- Permanent history ----------
create table if not exists asset_transactions (
  id text primary key, type text not null, asset_id text not null references assets(id), date text not null, reference text,
  from_employee_id text, to_employee_id text, from_department_id text, to_department_id text, from_location_id text, to_location_id text,
  status_before asset_status not null, status_after asset_status not null, condition_before asset_condition, condition_after asset_condition,
  performed_by_user_id text not null, performed_by_name text not null, reason text not null, remarks text,
  updated_at timestamptz not null default now()
);
create index if not exists asset_transactions_asset_idx on asset_transactions (asset_id, date desc);

create table if not exists audit_logs (
  id text primary key, at text not null, user_id text, user_name text not null, role text, action text not null,
  entity_type text not null, entity_id text not null, reason text not null, details text,
  updated_at timestamptz not null default now()
);

-- ---------- Workflow records ----------
create table if not exists handovers (
  id text primary key check (id ~ '^GW-HO-[0-9]{6}-[0-9]{4}$'),
  date text not null, employee_id text not null references employees(id), issued_by_user_id text not null, expected_return_date text,
  purpose text, location_of_use text, items jsonb not null default '[]',
  approval approval_state not null default 'Pending Approval', approved_by_user_id text, approved_at text, approval_comments text,
  acknowledged boolean not null default false, acknowledged_at text, employee_signature text, authorized_signatory_user_id text,
  status text not null, created_by_user_id text not null, created_at text not null, transfer_id text,
  updated_at timestamptz not null default now()
);
create table if not exists asset_returns (
  id text primary key check (id ~ '^GW-RT-[0-9]{6}-[0-9]{4}$'),
  date text not null, asset_id text not null references assets(id), employee_id text not null, handover_id text, received_by_user_id text not null,
  condition_reported asset_condition not null, accessories_returned text, employee_remarks text,
  inspected boolean not null default false, inspected_by_user_id text, inspection_date text, inspection_condition asset_condition, inspection_outcome text, inspection_notes text,
  employee_signature text, receiver_signature text, status text not null, created_by_user_id text not null, created_at text not null,
  updated_at timestamptz not null default now()
);
create table if not exists asset_transfers (
  id text primary key check (id ~ '^GW-TR-[0-9]{6}-[0-9]{4}$'),
  date text not null, asset_id text not null references assets(id), from_employee_id text, to_employee_id text,
  from_department_id text not null, to_department_id text not null, from_location_id text not null, to_location_id text not null,
  reason text not null, condition_at_transfer asset_condition not null, requested_by_user_id text not null,
  approval approval_state not null default 'Pending Approval', approved_by_user_id text, approved_at text, approval_comments text,
  status text not null, completed_at text, new_handover_id text, created_at text not null,
  updated_at timestamptz not null default now()
);
create table if not exists asset_repairs (
  id text primary key check (id ~ '^GW-RP-[0-9]{6}-[0-9]{4}$'),
  asset_id text not null references assets(id), reported_date text not null, reported_by_user_id text not null, fault_description text not null,
  vendor text, estimated_cost numeric(12,2), expected_return_date text, quotation jsonb, service_report jsonb,
  actual_cost numeric(12,2), completion_date text, work_done text, inspection_notes text, inspected_by_user_id text, outcome text,
  approval approval_state not null default 'Pending Approval', approved_by_user_id text, status text not null,
  status_before_repair asset_status, custodian_before_repair text, created_at text not null,
  updated_at timestamptz not null default now()
);
create table if not exists asset_incidents (
  id text primary key check (id ~ '^GW-INC-[0-9]{6}-[0-9]{4}$'),
  asset_id text not null references assets(id), type text not null check (type in ('Lost','Damaged')), incident_date text not null,
  reported_by_employee_id text not null, reported_by_user_id text not null, location text, description text not null, police_report_no text,
  investigated_by_user_id text, investigation_notes text, responsibility text, recovery_action text, recovery_amount numeric(12,2), resolution text,
  approval approval_state not null default 'Pending Approval', approved_by_user_id text, approved_at text, status text not null, created_at text not null,
  updated_at timestamptz not null default now()
);
create table if not exists asset_disposals (
  id text primary key check (id ~ '^GW-DSP-[0-9]{6}-[0-9]{4}$'),
  asset_id text not null references assets(id), retirement_requested_by_user_id text not null, retirement_requested_at text not null,
  retirement_reason text not null, technical_recommendation text,
  retirement_approval approval_state not null default 'Pending Approval', retirement_approved_by_user_id text, retirement_approved_at text,
  data_erased boolean, data_erasure_certificate jsonb, disposal_method text, disposal_date text, disposal_value numeric(12,2), disposal_vendor text, disposal_proof jsonb,
  disposal_approval approval_state not null default 'Pending Approval', disposal_approved_by_user_id text, disposal_approved_at text,
  status text not null, created_at text not null,
  updated_at timestamptz not null default now()
);
create table if not exists asset_approvals (
  id text primary key, entity_type text not null, entity_id text not null, requested_by_user_id text not null, requested_at text not null,
  approver_role text not null, decision approval_state not null default 'Pending Approval', decided_by_user_id text, decided_at text, comments text,
  updated_at timestamptz not null default now()
);
create table if not exists asset_documents (
  id text primary key, asset_id text references assets(id), entity_type text not null, entity_id text not null, document_type text not null,
  attachment jsonb not null, uploaded_by_user_id text not null, uploaded_at text not null, remarks text,
  updated_at timestamptz not null default now()
);

-- ---------- Rule 6: history is append-only ----------
create or replace function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'Table % is append-only; rows cannot be updated or deleted', tg_table_name; end $$;
drop trigger if exists asset_transactions_immutable on asset_transactions;
create trigger asset_transactions_immutable before update or delete on asset_transactions for each row execute function forbid_change();
drop trigger if exists audit_logs_immutable on audit_logs;
create trigger audit_logs_immutable before update or delete on audit_logs for each row execute function forbid_change();

-- ---------- updated_at maintenance ----------
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['roles','departments','locations','asset_categories','employees','users','assets','handovers','asset_returns','asset_transfers','asset_repairs','asset_incidents','asset_disposals','asset_approvals','asset_documents'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop; end $$;

-- ---------- Access control ----------
-- Signed-in staff (Supabase Auth) whose email exists in `users` may read and write; the application
-- enforces role permissions and business rules, the database enforces uniqueness and immutability.
create or replace function app_user_id() returns text language sql stable security definer as $$
  select id from users where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and active limit 1
$$;
do $$ declare t text; begin
  foreach t in array array['roles','departments','locations','asset_categories','employees','users','assets','asset_transactions','audit_logs','handovers','asset_returns','asset_transfers','asset_repairs','asset_incidents','asset_disposals','asset_approvals','asset_documents'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_staff on %I', t, t);
    execute format('create policy %I_staff on %I for all to authenticated using (app_user_id() is not null) with check (app_user_id() is not null)', t, t);
  end loop; end $$;

-- ---------- Realtime (live updates between users) ----------
do $$ declare t text; begin
  foreach t in array array['roles','departments','locations','asset_categories','employees','users','assets','asset_transactions','audit_logs','handovers','asset_returns','asset_transfers','asset_repairs','asset_incidents','asset_disposals','asset_approvals','asset_documents'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; when undefined_object then null; end;
  end loop; end $$;

-- ---------- Starting master data (only when empty) ----------
insert into departments (id, code, name) values ('D-ADM','ADM','Administration'), ('D-OPS','OPS','Operations'), ('D-IT','IT','Information Technology'), ('D-FIN','FIN','Finance & Accounts'), ('D-HR','HR','Human Resources') on conflict (id) do nothing;
insert into locations (id, code, name, address) values ('L-HO','HO','Head Office – Puducherry','Puducherry'), ('L-PM','PM','PM Zone Depot',null), ('L-OM','OM','OM Zone Depot',null), ('L-WS','WS','Vehicle Workshop',null) on conflict (id) do nothing;
insert into asset_categories (id, code, name, verification_interval_months) values ('C-MOB','MOB','Mobile Phone',6), ('C-LAP','LAP','Laptop',6), ('C-TAB','TAB','Tablet',6), ('C-GPS','GPS','GPS Tracker',3), ('C-CAM','CAM','Camera / Body Camera',6), ('C-SIM','SIM','SIM Card',12), ('C-FUR','FUR','Furniture & Fixtures',12) on conflict (id) do nothing;
-- The first login. Create the same email in Authentication → Users, then sign in with it.
insert into users (id, name, email, role) values ('U-SA', 'System Administrator', 'greenwarriorit19@gmail.com', 'super_admin') on conflict (id) do nothing;
insert into audit_logs (id, at, user_id, user_name, role, action, entity_type, entity_id, reason)
  values ('AL-000001', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'U-SA', 'System Administrator', 'super_admin', 'DATABASE_INITIALISED', 'System', 'DB', 'Supabase database created')
  on conflict (id) do nothing;

-- ---------- Reporting views ----------
create or replace view v_asset_register as
select a.id, c.name as category, a.name, a.manufacturer, a.model, a.serial_number, a.imei, a.sim, a.status, a.condition,
       e.name as custodian, e.employee_code, d.name as department, l.name as location, a.purchase_date, a.purchase_cost, a.warranty_expiry
from assets a
join asset_categories c on c.id = a.category_id
left join employees e on e.id = a.custodian_employee_id
left join departments d on d.id = a.department_id
left join locations l on l.id = a.location_id;

create or replace view v_dashboard_metrics as
select count(*) as total_assets,
  count(*) filter (where status = 'Available') as available,
  count(*) filter (where status in ('Assigned','Transferred')) as assigned,
  count(*) filter (where status = 'Under Repair') as under_repair,
  count(*) filter (where status = 'Damaged') as damaged,
  count(*) filter (where status = 'Lost') as lost,
  count(*) filter (where status = 'Retired') as retired,
  count(*) filter (where status = 'Disposed') as disposed,
  coalesce(sum(purchase_cost) filter (where status <> 'Disposed'), 0) as total_purchase_value
from assets;
