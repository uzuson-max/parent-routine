//
// MY 화면 — 원래는 전화번호 인증 카드 하나만 있던 화면을 "참견이 기본 설정 + 내 정보"로 확장한다.
//
// 확장 원칙(이번 작업 범위):
// - 기존 전화번호 인증/변경 로직(requestPhoneLink/confirmPhoneCode/syncVerifiedPhoneToBackend)은
//   그대로 두고, 화면에서의 위치만 "전화번호" row 하나로 옮긴다.
// - 닉네임/기록 수는 기존 /api/user/me(lib/userClient.fetchMe)를 그대로 재사용한다 — 새 API 없음.
// - "내가 남긴 기억"은 새로운 memory 열람 화면을 만들지 않고, 이미 있는 CalendarScreen(기존
//   "기록" 네비게이션 목적지, entries 기반)으로 그대로 연결한다.
// - 효과음/알림/참견 정도는 이 앱에 아직 전역 상태/DB 컬럼이 전혀 없어서(레포 전체 검색으로 확인),
//   localStorage에 값만 저장하는 설정 UI로 우선 구현한다. 알림 토글은 실제 OS notification
//   permission을 다시 요청하지 않는다(그 로직 자체가 없으므로 충돌할 것도 없음) — 순수 사용자
//   선호값이고, 실제 알림 발송/참견 강도 로직과의 연결은 추후 백엔드 작업이 필요하다.
// - 의견 보내기/이용약관/개인정보처리방침은 연결할 기존 기능이나 URL이 없어서(레포 전체 검색으로
//   확인), 임의로 새 URL을 만들지 않고 클릭 가능한 placeholder(짧은 안내 토스트)까지만 만든다.
// - 회원탈퇴는 안전하게 구현된 삭제 API가 없어서(레포 전체 검색으로 확인) 실제 계정 삭제를
//   구현하지 않고, 확인 시트 + 안내 메시지까지만 만든다.
// - 로그아웃은 기존 supabaseClient.auth(anonymous sign-in에도 이미 쓰는 그 인스턴스)의
//   표준 signOut()을 그대로 사용한다.
//
"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { requestPhoneLink, confirmPhoneCode, syncVerifiedPhoneToBackend, type PhoneLinkVerifyType } from "@/lib/phoneAuthClient";
import { fetchMe } from "@/lib/userClient";
import { BRAND, inkAlpha, pageBackground, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";

function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "등록된 번호 없음";
  const digits = e164.replace(/\D/g, "").replace(/^82/, "0");
  if (digits.length < 7) return digits;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

type PhoneMode = "view" | "edit_phone" | "edit_code";

// --- 참견 정도 -----------------------------------------------------------
// 실제 intervention_stage(commitment_memory)는 "약속 하나가 지금 몇 번째 재촉 단계인지"를
// 나타내는 값이라 이 설정과 의미가 다르다(사용자 전역 선호 vs 개별 약속의 진행 상태) — 그대로
// 재사용할 수 없어서, 이번 작업에서는 로컬에 선호값만 저장해둔다.
type InterventionLevel = "low" | "medium" | "high";
const INTERVENTION_KEY = "ganseobi_intervention_level";
const SOUND_KEY = "ganseobi_sound_enabled";
const NOTIFICATION_KEY = "ganseobi_notifications_enabled";

const INTERVENTION_OPTIONS: { level: InterventionLevel; label: string; desc: string }[] = [
  { level: "low", label: "살짝", desc: "앱 안에서 조용히 참견해요." },
  { level: "medium", label: "적당히", desc: "필요할 때 먼저 말을 걸어요." },
  { level: "high", label: "많이", desc: "조금 더 적극적으로 참견해요." },
];

function readBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}

function readIntervention(): InterventionLevel {
  if (typeof window === "undefined") return "medium";
  const raw = window.localStorage.getItem(INTERVENTION_KEY);
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return "medium";
}

type SheetKind = "intervention" | "delete_confirm" | nul
