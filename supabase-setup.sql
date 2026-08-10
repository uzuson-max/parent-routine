-- Supabase SQL Editor에 이 파일 내용을 그대로 붙여넣고 실행하세요.

drop table if exists routines;

create table routines (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  phone_number text not null,
  routine_text text not null default '루틴 확인',
  call_message text not null default '오늘 루틴을 확인할 시간이에요.',
  call_time time not null,
  call_state text not null default 'idle',       -- 'idle' | 'awaiting_result'
  last_status text not null default 'pending',   -- 'pending' | 'success' | 'failed'
  last_run_date date,
  last_call_sid text,
  created_at timestamptz default now()
);

create index idx_routines_phone on routines(phone_number);

-- 서버(API 라우트)만 service_role 키로 접근하므로 RLS는 기본 차단 상태로 둡니다.
alter table routines enable row level security;
