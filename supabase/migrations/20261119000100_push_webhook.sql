-- =====================================================================
-- OSNO — call the send-push Edge Function when a message or call is created.
-- Run in the Supabase SQL editor AFTER deploying the send-push function.
--
-- Before running, replace the two placeholders below:
--   <project-ref>     your project ref (Project Settings -> General, or the xxxx in https://xxxx.supabase.co)
--   <webhook-secret>  any long random string; set the SAME value with
--                     npx supabase secrets set PUSH_WEBHOOK_SECRET=<webhook-secret>
-- Don't commit the file with the real values filled in.
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://gezfjhmyradxejwrulve.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', 'Zxrstj6zmQY_0TpG-_AOboSJqcqtko1hHmJpU-9sFJE'),
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
