-- Run on an existing database (Supabase → SQL Editor). Safe to run more than once.
-- Lets a mis-registered asset be deleted: its transactions and documents go with it,
-- while history stays append-only for every asset that still exists.

alter table asset_transactions drop constraint if exists asset_transactions_asset_id_fkey;
alter table asset_transactions add constraint asset_transactions_asset_id_fkey
  foreign key (asset_id) references assets(id) on delete cascade;

alter table asset_documents drop constraint if exists asset_documents_asset_id_fkey;
alter table asset_documents add constraint asset_documents_asset_id_fkey
  foreign key (asset_id) references assets(id) on delete cascade;

create or replace function forbid_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and tg_table_name = 'asset_transactions' then
    if not exists (select 1 from assets a where a.id = old.asset_id) then return old; end if;
  end if;
  raise exception 'Table % is append-only; rows cannot be updated or deleted', tg_table_name;
end $$;
