-- docs/sql/2026-10-08_my_settings.sql
-- MY 화면 정비: 참견 받는 방법(서버에서 실제로 읽는 설정) + 의견 보내기
-- Supabase SQL Editor에서 한 번 실행. 여러 번 실행해도 안전하다(IF NOT EXISTS).

-- 1) 참견 받는 방법 — lib/userPrefs.ts
alter table public.user_memory
  add column if not exists outreach_enabled boolean not null default true,
  add column if not exists intervention_level text not null default 'medium',
  add column if not exists quiet_start_hour smallint not null default 22,
  add column if not exists quiet_end_hour smallint not null default 9;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_memory_intervention_level_check') then
    alter table public.user_memory
      add constraint user_memory_intervention_level_check check (intervention_level in ('low', 'medium', 'high'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_memory_quiet_hours_check') then
    alter table public.user_memory
      add constraint user_memory_quiet_hours_check
      check (quiet_start_hour between 21 and 24 and quiet_end_hour between 6 and 11);
  end if;
end $$;

-- 2) 의견 보내기 — app/api/user/feedback
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  message text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

-- 서버(service role)만 쓰고 읽는다. 앱에서 직접 읽을 일이 없으니 RLS만 켜고 정책은 두지 않는다.
alter table public.feedback enable row level security;
