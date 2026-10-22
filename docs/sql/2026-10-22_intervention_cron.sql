-- docs/sql/2026-10-22_intervention_cron.sql
-- 약속 확인 참견(COMMITMENT_CHECK / 일정 "오늘이지?" / "어땠어?") 발송 스케줄러.
-- Supabase가 10분마다 /api/cron/process-interventions 를 부른다.
--
-- 알람 크론(2026-10-12_reminder_cron.sql)이 만든 Vault 비밀값
-- (chamgyeoni_app_url, chamgyeoni_cron_secret)을 그대로 같이 쓴다 — 여기서 따로 넣을 값 없음.
-- ⚠️ CRON_SECRET을 바꿨다면 Vault 값도 같이 바꿔야 두 크론 다 산다:
--   select vault.update_secret((select id from vault.secrets where name = 'chamgyeoni_cron_secret'), '새_시크릿');
--
-- ⚠️ cron-job.org 같은 외부 서비스로 이 주소를 이미 부르고 있다면 그건 꺼둘 것 (두 군데서 부르면 중복 발송 위험).

-- 같은 이름의 작업이 있으면 지우고 다시 등록(여러 번 실행해도 하나만 남는다)
select cron.unschedule(jobid) from cron.job where jobname = 'chamgyeoni-process-interventions';

select cron.schedule(
  'chamgyeoni-process-interventions',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'chamgyeoni_app_url') || '/api/cron/process-interventions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'chamgyeoni_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- 잘 도는지 확인 (10분 뒤):
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, left(content::text, 200), created from net._http_response order by created desc limit 10;
--   → process-interventions 응답은 {"success":true,"dryRun":false,"count":...} 형태. 401이면 Vault 시크릿이 Vercel 값과 다름.
--
-- 끄기:
--   select cron.unschedule('chamgyeoni-process-interventions');
