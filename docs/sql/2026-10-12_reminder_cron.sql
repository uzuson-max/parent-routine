-- docs/sql/2026-10-12_reminder_cron.sql
-- 알람 발송 스케줄러 — Supabase가 1분마다 /api/cron/send-reminders 를 부른다.
-- 먼저 docs/sql/2026-10-12_notes_reminders.sql 을 실행한 뒤에 실행할 것.
--
-- 왜 Supabase인가: Vercel Cron은 Hobby 요금제에서 하루 1번까지만 돌아서 "11시에 알려줘"를 지킬 수 없다.
-- pg_cron(스케줄) + pg_net(HTTP 호출)은 Supabase에 기본으로 들어 있는 확장이고 추가 비용이 없다.
--
-- ⚠️ 실행 전에 아래 두 값을 바꿀 것 (CRON_SECRET은 Vercel 환경변수의 그 값 그대로)
--   <APP_URL>      예: https://parent-routine.vercel.app   (끝에 / 없이)
--   <CRON_SECRET>  Vercel → Settings → Environment Variables → CRON_SECRET
-- 비밀값은 SQL 본문이 아니라 Vault에 넣어두고 꺼내 쓴다(크론 목록에 비밀이 그대로 보이지 않게).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 비밀값 보관 (이미 있으면 갱신)
do $$
begin
  if exists (select 1 from vault.secrets where name = 'chamgyeoni_app_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'chamgyeoni_app_url'), '<APP_URL>');
  else
    perform vault.create_secret('<APP_URL>', 'chamgyeoni_app_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'chamgyeoni_cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'chamgyeoni_cron_secret'), '<CRON_SECRET>');
  else
    perform vault.create_secret('<CRON_SECRET>', 'chamgyeoni_cron_secret');
  end if;
end $$;

-- 같은 이름의 작업이 있으면 지우고 다시 등록(여러 번 실행해도 하나만 남는다)
select cron.unschedule(jobid) from cron.job where jobname = 'chamgyeoni-send-reminders';

select cron.schedule(
  'chamgyeoni-send-reminders',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'chamgyeoni_app_url') || '/api/cron/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'chamgyeoni_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- 잘 도는지 확인:
--   select jobid, jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content::text, created from net._http_response order by created desc limit 5;
--
-- 끄기:
--   select cron.unschedule('chamgyeoni-send-reminders');
