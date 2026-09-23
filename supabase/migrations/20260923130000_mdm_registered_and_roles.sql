-- Run this on an existing database (Supabase → SQL Editor). Safe to run more than once.

-- 1. Mobile Device Management flag on assets (phones, tablets, GPS units, cameras).
alter table assets add column if not exists mdm_registered boolean;

-- 2. Only Super Admin and Asset Administrator remain; drop the retired roles where nobody holds one.
delete from roles
 where code in ('dept_head', 'employee', 'auditor')
   and not exists (select 1 from users u where u.role = roles.code);
