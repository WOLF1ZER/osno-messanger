-- =====================================================================
-- OSNO — call the send-push Edge Function when a message or call is created.
-- Run in the Supabase SQL editor AFTER deploying the send-push function.
--
-- The secret below must equal the PUSH_WEBHOOK_SECRET you set with
--   npx supabase secrets set PUSH_WEBHOOK_SECRET=...
-- (it was generated for you; keep this file private / out of public repos).
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://aatuibyumidoerqojxuq.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', 'jkuREYZrefv3_sfACXYffSR4qtyYbLdmrOgWLnvFnrU'),
    body    := jsonb_build_object('table', TG_TABLE_NAME, 'record', jsonb_build_object('id', new.id)),
    timeout_milliseconds := 5000
  );
  return new;
end $$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages
  for each row when (new.type <> 'system') execute function public.notify_push();

drop trigger if exists calls_push on public.calls;
create trigger calls_push after insert on public.calls
  for each row execute function public.notify_push();
