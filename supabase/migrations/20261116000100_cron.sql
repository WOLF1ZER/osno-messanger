-- Deletes expired private-mode messages every 10 minutes.
-- Requires the pg_cron extension: Dashboard -> Database -> Extensions -> enable "pg_cron".
-- (Expired messages are already hidden by RLS; this just frees the space.)
create extension if not exists pg_cron;

select cron.schedule('osno-purge-expired-messages', '*/10 * * * *', $$ select public.purge_expired_messages(); $$);
