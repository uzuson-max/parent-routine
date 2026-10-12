-- docs/sql/2026-10-12_notes_reminders.sql
-- 바다 위 메모(sea_notes) + 알람(reminders). Supabase SQL Editor에서 한 번 실행.
-- 여러 번 실행해도 안전하다(IF NOT EXISTS / DROP POLICY IF EXISTS). 기존 테이블은 건드리지 않는다.
--
-- 앱 서버(API)는 service role로 접근하고 매 요청마다 user_id를 직접 확인한다(lib/auth.ts).
-- RLS는 "앱에서 anon 키로 직접 읽는 일이 생겨도 남의 것은 안 보이게" 하는 두 번째 잠금이다.

-- ---------------------------------------------------------------------------
-- 1) 바다 위 메모 — 짧은 글. 기억 엔진/인사이트/SMS 대상이 아니다.
-- ---------------------------------------------------------------------------
create table if not exists public.sea_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz -- 메모를 다시 열어본 마지막 시각(수달이 "오랜만이네" 할 근거)
);
create index if not exists sea_notes_user_created_idx on public.sea_notes (user_id, created_at desc);

alter table public.sea_notes enable row level security;
drop policy if exists sea_notes_owner on public.sea_notes;
create policy sea_notes_owner on public.sea_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) 알람 — 사용자가 직접 정한 시각에 한 번 알려준다.
--    status 흐름: scheduled → sending → sent | failed   (취소하면 canceled)
--    sending은 발송 크론이 "내가 보낼게"라고 잡아둔 상태 — 두 번 보내지 않기 위한 잠금이다.
-- ---------------------------------------------------------------------------
create table if not exists public.reminders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 40),
  remind_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sending', 'sent', 'failed', 'canceled')),
  source text not null default 'manual' check (source in ('manual', 'voice', 'note')),
  source_entry_id uuid,                 -- 음성 일정에서 만든 알람이면 그 voice_entries.id
  note_id bigint references public.sea_notes(id) on delete set null, -- 메모에서 만든 알람이면 그 메모
  channel text check (channel in ('push', 'sms')), -- 실제로 전달된 수단
  attempts smallint not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 발송 크론이 "지금 보낼 것"을 빨리 찾게
create index if not exists reminders_due_idx on public.reminders (remind_at) where status = 'scheduled';
create index if not exists reminders_user_idx on public.reminders (user_id, remind_at desc);
-- 같은 녹음에서 알람이 두 번 만들어지지 않게(버튼 두 번 누름 등)
create unique index if not exists reminders_one_per_entry on public.reminders (user_id, source_entry_id)
  where source_entry_id is not null and status <> 'canceled';

alter table public.reminders enable row level security;
drop policy if exists reminders_owner on public.reminders;
create policy reminders_owner on public.reminders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 되돌리기(필요할 때만):
-- drop table if exists public.reminders;
-- drop table if exists public.sea_notes;
