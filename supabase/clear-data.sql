-- Clears the records entered so far and leaves a fresh, working system.
-- DELETES: assets and their history, employees, assignments, returns, transfers,
--          repairs, incidents, retirements/disposals, documents, approvals, audit log,
--          leaving numbering to restart at 0001 (it is derived from the records themselves).
-- KEEPS:   roles, departments, locations, asset categories and the user logins.
--
-- THIS CANNOT BE UNDONE. Take a JSON backup first: in the app, Master Data → Data →
-- "Download JSON backup". Run the whole block in Supabase → SQL Editor.

begin;

-- History first: the trigger allows deleting a transaction only once its asset is gone,
-- so assets are removed first and the rows cascade.
delete from asset_documents;
delete from asset_approvals;
delete from asset_disposals;
delete from asset_incidents;
delete from asset_repairs;
delete from asset_transfers;
delete from asset_returns;
delete from handovers;
delete from assets;                 -- asset_transactions cascade with them

alter table audit_logs disable trigger audit_logs_immutable;
delete from audit_logs;
alter table audit_logs enable trigger audit_logs_immutable;

-- Staff records. Any user login linked to an employee is unlinked, never deleted.
update users set employee_id = null where employee_id is not null;
delete from employees;

commit;
