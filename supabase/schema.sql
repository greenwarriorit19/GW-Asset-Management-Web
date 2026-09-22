-- Green Warrior Solid Waste Management
-- Asset Management & Employee Handover System — PostgreSQL / Supabase schema
--
-- Design rule: `assets` stores the CURRENT state; `asset_transactions` stores the complete,
-- permanent history. Transactions and audit logs are append-only (UPDATE/DELETE are blocked by
-- trigger). Reference numbers follow GW-AST-CAT-0001 / GW-HO-YYYYMM-0001 etc.

create extension if not exists pgcrypto;

-- ---------- Enumerations ----------
create type asset_status as enum ('Available','Reserved','Assigned','Transferred','Returned','Under Inspection','Under Repair','Damaged','Lost','Retired','Disposed');
create type asset_condition as enum ('New','Good','Fair','Damaged','Not Working');
create type ownership_type as enum ('Company Owned','Leased','Rented','Project Funded','Client Provided');
create type approval_state as enum ('Pending Approval','Approved','Rejected');
create type transaction_type as enum ('REGISTRATION','HANDOVER','RETURN','INSPECTION','TRANSFER','REPAIR_SENT','REPAIR_COMPLETED','INCIDENT','VERIFICATION','RETIREMENT','DISPOSAL','STATUS_CHANGE','UPDATE');
create type role_code as enum ('super_admin','asset_admin','dept_head','employee','auditor');

-- ---------- Master data ----------
create table roles (
  code role_code primary key,
  name text not null,
  permissions text[] not null default '{}'
);
insert into roles (code, name) values
  ('super_admin','Super Admin'), ('asset_admin','Asset Administrator'), ('dept_head','Department Head'),
  ('employee','Employee'), ('auditor','Auditor / Management');

create table departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  head_employee_id uuid,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

create table asset_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2,4}$'),   -- used in the Asset ID: GW-AST-<CODE>-0001
  name text not null,
  description text,
  verification_interval_months int not null default 6,
  next_sequence int not null default 1
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,                           -- GW-EMP-0001 (shown as Employee ID)
  name text not null,
  designation text,
  department_id uuid references departments(id),
  date_of_joining date,
  work_location_id uuid references locations(id),
  mobile text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table departments add constraint departments_head_fk foreign key (head_employee_id) references employees(id);

create table users (
  id uuid primary key default gen_random_uuid(),               -- = auth.users.id when using Supabase Auth
  name text not null,
  email text not null unique,
  role role_code not null references roles(code),
  employee_id uuid references employees(id),
  department_id uuid references departments(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Assets (current state) ----------
create table assets (
  id text primary key check (id ~ '^GW-AST-[A-Z]{2,4}-[0-9]{4}$'),  -- Rule 1: permanent unique Asset ID
  category_id uuid not null references asset_categories(id),
  name text not null,
  manufacturer text,
  model text,
  serial_number text not null,
  imei text,
  sim text,
  barcode text,
  ownership_type ownership_type not null default 'Company Owned',
  supplier_name text,
  invoice_number text,
  po_number text,
  purchase_date date,
  purchase_cost numeric(12,2) not null default 0,
  warranty_start date,
  warranty_expiry date,
  funding text,
  status asset_status not null default 'Available',
  condition asset_condition not null default 'New',
  department_id uuid references departments(id),
  location_id uuid references locations(id),
  custodian_employee_id uuid references employees(id),
  last_verification_date date,
  next_verification_date date,
  specification text,
  accessories text,
  maintenance_notes text,
  remarks text,
  registered_by uuid references users(id),
  registered_at timestamptz not null default now(),
  registration_approved_by uuid references users(id),
  updated_at timestamptz not null default now()
);
-- Rule 2: serial / IMEI / SIM must be unique (case-insensitive, blanks ignored).
create unique index assets_serial_uq on assets (upper(serial_number));
create unique index assets_imei_uq on assets (upper(imei)) where imei is not null and imei <> '';
create unique index assets_sim_uq on assets (upper(sim)) where sim is not null and sim <> '';
create index assets_status_idx on assets (status);
create index assets_custodian_idx on assets (custodian_employee_id);
create index assets_department_idx on assets (department_id);
-- Rule 3: an asset cannot have a custodian unless it is Assigned/Transferred/Under Repair (repair keeps custody).
alter table assets add constraint assets_custodian_status_chk
  check (custodian_employee_id is null or status in ('Assigned','Transferred','Under Repair','Damaged','Lost'));

-- ---------- Transactions (permanent history) ----------
create table asset_transactions (
  id bigserial primary key,
  type transaction_type not null,
  asset_id text not null references assets(id),
  occurred_at timestamptz not null default now(),
  reference text,                                   -- GW-HO-…, GW-RT-…, etc.
  from_employee_id uuid references employees(id),
  to_employee_id uuid references employees(id),
  from_department_id uuid references departments(id),
  to_department_id uuid references departments(id),
  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id),
  status_before asset_status not null,
  status_after asset_status not null,
  condition_before asset_condition,
  condition_after asset_condition,
  performed_by uuid not null references users(id),
  performed_by_name text not null,
  reason text not null,
  remarks text
);
create index asset_transactions_asset_idx on asset_transactions (asset_id, occurred_at desc);

-- ---------- Handover / assignment ----------
create table asset_assignments (            -- one row per handover document (GW-HO-YYYYMM-0001)
  id text primary key check (id ~ '^GW-HO-[0-9]{6}-[0-9]{4}$'),
  handover_date date not null default current_date,
  employee_id uuid not null references employees(id),
  issued_by uuid not null references users(id),
  expected_return_date date,
  purpose text,
  location_of_use text,
  approval approval_state not null default 'Pending Approval',
  approved_by uuid references users(id),
  approved_at timestamptz,
  approval_comments text,
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  employee_signature text,
  authorized_signatory uuid references users(id),
  status text not null default 'Awaiting Approval' check (status in ('Draft','Awaiting Approval','Awaiting Acknowledgement','Active','Closed','Rejected')),
  transfer_id text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create table asset_assignment_items (
  id bigserial primary key,
  assignment_id text not null references asset_assignments(id) on delete restrict,
  asset_id text not null references assets(id),
  condition asset_condition not null,
  quantity int not null default 1,
  accessories text,
  remarks text
);
-- Rule 3: an asset can be on only one open handover at a time. Enforced by the
-- assignment_items_issuable trigger below (insert requires status Available, which flips to Reserved).

create table asset_returns (
  id text primary key check (id ~ '^GW-RT-[0-9]{6}-[0-9]{4}$'),
  return_date date not null default current_date,
  asset_id text not null references assets(id),
  employee_id uuid not null references employees(id),
  assignment_id text references asset_assignments(id),
  received_by uuid not null references users(id),
  condition_reported asset_condition not null,
  accessories_returned text,
  employee_remarks text,
  employee_signature text,
  receiver_signature text,
  status text not null default 'Pending Inspection' check (status in ('Pending Inspection','Completed')),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table asset_inspections (              -- Rule 8: inspection after return or during verification
  id bigserial primary key,
  asset_id text not null references assets(id),
  return_id text references asset_returns(id),
  inspected_by uuid not null references users(id),
  inspection_date date not null default current_date,
  condition asset_condition not null,
  outcome text not null check (outcome in ('Acceptable','Faulty','Damaged')),
  resulting_status asset_status not null,
  notes text,
  created_at timestamptz not null default now()
);

create table asset_transfers (
  id text primary key check (id ~ '^GW-TR-[0-9]{6}-[0-9]{4}$'),
  transfer_date date not null default current_date,
  asset_id text not null references assets(id),
  from_employee_id uuid references employees(id),
  to_employee_id uuid references employees(id),
  from_department_id uuid references departments(id),
  to_department_id uuid references departments(id),
  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id),
  reason text not null,
  condition_at_transfer asset_condition not null,
  requested_by uuid not null references users(id),
  approval approval_state not null default 'Pending Approval',
  approved_by uuid references users(id),
  approved_at timestamptz,
  approval_comments text,
  status text not null default 'Awaiting Approval' check (status in ('Awaiting Approval','Approved','Completed','Rejected')),
  completed_at timestamptz,
  new_assignment_id text references asset_assignments(id),
  created_at timestamptz not null default now()
);

create table asset_repairs (
  id text primary key check (id ~ '^GW-RP-[0-9]{6}-[0-9]{4}$'),
  asset_id text not null references assets(id),
  reported_date date not null default current_date,
  reported_by uuid not null references users(id),
  fault_description text not null,
  vendor text,
  estimated_cost numeric(12,2),
  expected_return_date date,
  actual_cost numeric(12,2),
  completion_date date,
  work_done text,
  inspection_notes text,
  inspected_by uuid references users(id),
  outcome text check (outcome in ('Available','Assigned','Retired')),
  approval approval_state not null default 'Pending Approval',
  approved_by uuid references users(id),
  status text not null default 'Open' check (status in ('Open','In Progress','Completed')),
  status_before_repair asset_status,
  custodian_before_repair uuid references employees(id),
  created_at timestamptz not null default now()
);

create table asset_incidents (               -- Rule 9: lost / damaged
  id text primary key check (id ~ '^GW-INC-[0-9]{6}-[0-9]{4}$'),
  asset_id text not null references assets(id),
  incident_type text not null check (incident_type in ('Lost','Damaged')),
  incident_date date not null,
  reported_by_employee_id uuid not null references employees(id),
  reported_by uuid not null references users(id),
  location text,
  description text not null,
  police_report_no text,
  investigated_by uuid references users(id),
  investigation_notes text,
  responsibility text,
  recovery_action text,
  recovery_amount numeric(12,2),
  resolution text check (resolution in ('Repair','Recovered','Written Off','Retired')),
  approval approval_state not null default 'Pending Approval',
  approved_by uuid references users(id),
  approved_at timestamptz,
  status text not null default 'Reported' check (status in ('Reported','Under Investigation','Awaiting Approval','Closed')),
  created_at timestamptz not null default now()
);

create table asset_verifications (
  id text primary key check (id ~ '^GW-VF-[0-9]{6}-[0-9]{4}$'),
  asset_id text not null references assets(id),
  verification_date date not null default current_date,
  verified_by uuid not null references users(id),
  expected_custodian_id uuid references employees(id),
  found_custodian_id uuid references employees(id),
  expected_location_id uuid references locations(id),
  found_location_id uuid references locations(id),
  expected_status asset_status,
  found_condition asset_condition,
  result text not null check (result in ('Verified','Mismatch','Missing')),
  notes text,
  next_verification_date date not null,
  created_at timestamptz not null default now()
);

create table asset_disposals (               -- Rule 10: retirement + disposal with authorization and proof
  id text primary key check (id ~ '^GW-DSP-[0-9]{6}-[0-9]{4}$'),
  asset_id text not null references assets(id),
  retirement_requested_by uuid not null references users(id),
  retirement_requested_at timestamptz not null default now(),
  retirement_reason text not null,
  technical_recommendation text,
  retirement_approval approval_state not null default 'Pending Approval',
  retirement_approved_by uuid references users(id),
  retirement_approved_at timestamptz,
  data_erased boolean,
  disposal_method text check (disposal_method in ('Sale','Scrap','Donation','Return to Lessor','E-Waste Vendor','Write Off')),
  disposal_date date,
  disposal_value numeric(12,2),
  disposal_vendor text,
  disposal_approval approval_state not null default 'Pending Approval',
  disposal_approved_by uuid references users(id),
  disposal_approved_at timestamptz,
  status text not null default 'Retirement Pending' check (status in ('Retirement Pending','Retired','Disposal Pending','Disposed','Rejected')),
  created_at timestamptz not null default now()
);

create table asset_approvals (
  id bigserial primary key,
  entity_type text not null check (entity_type in ('Registration','Handover','Transfer','Repair','Incident','Retirement','Disposal','Return')),
  entity_id text not null,
  requested_by uuid not null references users(id),
  requested_at timestamptz not null default now(),
  approver_role role_code not null,
  decision approval_state not null default 'Pending Approval',
  decided_by uuid references users(id),
  decided_at timestamptz,
  comments text
);
create index asset_approvals_pending_idx on asset_approvals (decision, approver_role);

create table asset_documents (
  id bigserial primary key,
  asset_id text references assets(id),
  entity_type text not null,
  entity_id text not null,
  document_type text not null,               -- Invoice, Warranty, Photograph, Quotation, Service Report, Proof of Disposal, Signed Form, ...
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text,                          -- Supabase Storage object path (bucket: asset-documents)
  uploaded_by uuid not null references users(id),
  uploaded_at timestamptz not null default now(),
  remarks text
);
create index asset_documents_asset_idx on asset_documents (asset_id);

create table audit_logs (                     -- Rule 11
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid references users(id),
  user_name text not null,
  role role_code,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  reason text not null,
  details text
);
create index audit_logs_at_idx on audit_logs (at desc);

-- ---------- Immutability (Rule 6) ----------
create or replace function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'Table % is append-only; rows cannot be updated or deleted', tg_table_name;
end $$;
create trigger asset_transactions_immutable before update or delete on asset_transactions for each row execute function forbid_change();
create trigger audit_logs_immutable before update or delete on audit_logs for each row execute function forbid_change();

-- ---------- Reference number generation ----------
create table reference_counters (
  kind text not null,                         -- HO, RT, TR, RP, INC, DSP, VF
  period text not null,                       -- YYYYMM
  last_value int not null default 0,
  primary key (kind, period)
);
create or replace function next_reference(p_kind text) returns text language plpgsql as $$
declare v int; p text := to_char(now(), 'YYYYMM');
begin
  insert into reference_counters (kind, period, last_value) values (p_kind, p, 1)
    on conflict (kind, period) do update set last_value = reference_counters.last_value + 1
    returning last_value into v;
  return format('GW-%s-%s-%s', p_kind, p, lpad(v::text, 4, '0'));
end $$;
create or replace function next_asset_id(p_category uuid) returns text language plpgsql as $$
declare v int; c text;
begin
  update asset_categories set next_sequence = next_sequence + 1 where id = p_category returning next_sequence - 1, code into v, c;
  return format('GW-AST-%s-%s', c, lpad(v::text, 4, '0'));
end $$;

-- ---------- Guard: only Available assets can be placed on a handover (Rule 4) ----------
create or replace function check_asset_issuable() returns trigger language plpgsql as $$
declare s asset_status;
begin
  select status into s from assets where id = new.asset_id;
  if s <> 'Available' then raise exception 'Rule 4: asset % is % — only Available assets can be issued', new.asset_id, s; end if;
  update assets set status = 'Reserved', updated_at = now() where id = new.asset_id;
  return new;
end $$;
create trigger assignment_items_issuable before insert on asset_assignment_items for each row execute function check_asset_issuable();

-- ---------- Row Level Security (Supabase) ----------
alter table assets enable row level security;
alter table asset_transactions enable row level security;
alter table asset_assignments enable row level security;
alter table audit_logs enable row level security;

create or replace function current_role_code() returns role_code language sql stable as $$
  select role from users where id = auth.uid()
$$;
create or replace function current_employee_id() returns uuid language sql stable as $$
  select employee_id from users where id = auth.uid()
$$;
create or replace function current_department_id() returns uuid language sql stable as $$
  select department_id from users where id = auth.uid()
$$;

-- Everyone with a role can read according to scope; writes go through the API / edge functions using the service role.
create policy assets_read on assets for select using (
  current_role_code() in ('super_admin','asset_admin','auditor')
  or (current_role_code() = 'dept_head' and department_id = current_department_id())
  or (current_role_code() = 'employee' and custodian_employee_id = current_employee_id())
);
create policy transactions_read on asset_transactions for select using (
  current_role_code() in ('super_admin','asset_admin','auditor','dept_head')
  or from_employee_id = current_employee_id() or to_employee_id = current_employee_id()
);
create policy assignments_read on asset_assignments for select using (
  current_role_code() in ('super_admin','asset_admin','auditor')
  or (current_role_code() = 'dept_head' and employee_id in (select id from employees where department_id = current_department_id()))
  or employee_id = current_employee_id()
);
create policy audit_read on audit_logs for select using (current_role_code() in ('super_admin','asset_admin','auditor'));

-- ---------- Reporting views ----------
create view v_asset_register as
select a.id, c.name as category, a.name, a.manufacturer, a.model, a.serial_number, a.imei, a.sim, a.status, a.condition,
       e.name as custodian, e.employee_code, d.name as department, l.name as location,
       a.purchase_date, a.purchase_cost, a.warranty_expiry, a.next_verification_date
from assets a
join asset_categories c on c.id = a.category_id
left join employees e on e.id = a.custodian_employee_id
left join departments d on d.id = a.department_id
left join locations l on l.id = a.location_id;

create view v_dashboard_metrics as
select
  count(*) as total_assets,
  count(*) filter (where status = 'Available') as available,
  count(*) filter (where status in ('Assigned','Transferred')) as assigned,
  count(*) filter (where status = 'Under Repair') as under_repair,
  count(*) filter (where status = 'Damaged') as damaged,
  count(*) filter (where status = 'Lost') as lost,
  count(*) filter (where status = 'Retired') as retired,
  count(*) filter (where status = 'Disposed') as disposed,
  coalesce(sum(purchase_cost) filter (where status <> 'Disposed'), 0) as total_purchase_value,
  count(*) filter (where warranty_expiry between current_date and current_date + 30 and status not in ('Retired','Disposed')) as warranty_expiring_30d,
  count(*) filter (where next_verification_date < current_date and status not in ('Retired','Disposed','Lost')) as verification_overdue
from assets;
