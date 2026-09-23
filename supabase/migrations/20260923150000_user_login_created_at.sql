-- Run on an existing database (Supabase → SQL Editor). Safe to run more than once.
-- Records when a user's sign-in was created, so Users & Permissions can show who can actually sign in.
alter table users add column if not exists login_created_at text;
