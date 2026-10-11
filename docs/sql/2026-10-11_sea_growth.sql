-- docs/sql/2026-10-11_sea_growth.sql
-- 심해 성장 단계 저장 — user_memory에 칸 2개만 추가한다. 기존 데이터는 건드리지 않음.
--   sea_stage       도달한 최고 단계(0~5). 내려가지 않는다.
--   sea_stage_seen  사용자가 심해에서 확인한 단계. sea_stage보다 작으면 "아직 못 본 변화"가 있다.
-- 둘 다 비어 있으면(null) 앱이 처음 열릴 때 지금 단계로 채운다(가짜 성장 연출 없음).
-- 이 SQL을 안 돌려도 앱은 돌아간다 — 단계는 계산만 되고, "봤음"은 기기에만 기억된다.

alter table public.user_memory add column if not exists sea_stage smallint;
alter table public.user_memory add column if not exists sea_stage_seen smallint;

alter table public.user_memory drop constraint if exists user_memory_sea_stage_check;
alter table public.user_memory add constraint user_memory_sea_stage_check
  check ((sea_stage is null or sea_stage between 0 and 5) and (sea_stage_seen is null or sea_stage_seen between 0 and 5));

-- 되돌리기(필요할 때만):
-- alter table public.user_memory drop constraint if exists user_memory_sea_stage_check;
-- alter table public.user_memory drop column if exists sea_stage_seen;
-- alter table public.user_memory drop column if exists sea_stage;
