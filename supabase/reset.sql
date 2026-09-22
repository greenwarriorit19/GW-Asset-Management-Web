-- DANGER: removes every application table, view, function and type in the public schema.
-- Use only on an empty / test project (e.g. to replace the v1 schema with schema.sql v2).
-- Run this, then run schema.sql.

drop view if exists v_asset_register cascade;
drop view if exists v_dashboard_metrics cascade;

drop table if exists
  asset_documents, asset_approvals, asset_disposals, asset_incidents, asset_repairs, asset_transfers,
  asset_inspections, asset_returns, asset_assignment_items, asset_assignments, handovers, asset_verifications,
  audit_logs, asset_transactions, assets, users, employees, asset_categories, locations, departments, roles,
  reference_counters
cascade;

drop function if exists forbid_change() cascade;
drop function if exists touch_updated_at() cascade;
drop function if exists app_user_id() cascade;
drop function if exists next_reference(text) cascade;
drop function if exists next_asset_id(uuid) cascade;
drop function if exists check_asset_issuable() cascade;
drop function if exists current_role_code() cascade;
drop function if exists current_employee_id() cascade;
drop function if exists current_department_id() cascade;

drop type if exists asset_status cascade;
drop type if exists asset_condition cascade;
drop type if exists ownership_type cascade;
drop type if exists approval_state cascade;
drop type if exists transaction_type cascade;
drop type if exists role_code cascade;
