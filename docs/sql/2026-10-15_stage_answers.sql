-- docs/sql/2026-10-15_stage_answers.sql
-- 강 탭(니를 찾아가는 돌다리) — 며칠째 돌에서 무슨 대답을 했는지.
-- 녹음 원본·받아쓰기는 voice_entries에 그대로 있고, 여기선 "몇 일차 대답"인지만 묶는다.
-- 서버(service role)만 쓰고, 사용자 본인은 자기 것만 읽을 수 있다.

create table if not exists public.stage_answers (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null default 'river1',
  day smallint not null,
  part smallint not null default 1,          -- 6일차처럼 한 돌에 질문이 두 개면 2
  entry_id uuid references public.voice_entries(id) on delete set null,
  transcript text,
  return_line text,                          -- 돌아온 순간(말풍선+목소리 순서) JSON
  created_at timestamptz not null default now(),
  unique (user_id, stage, day, part)
);

create index if not exists stage_answers_user_idx on public.stage_answers (user_id, stage, day);

alter table public.stage_answers enable row level security;

drop policy if exists "stage_answers_own_read" on public.stage_answers;
create policy "stage_answers_own_read" on public.stage_answers
  for select using (user_id = auth.uid());
