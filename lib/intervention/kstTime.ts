
// 한국 시간(KST, UTC+9, 서머타임 없음) 계산 헬퍼. 서버(Vercel)는 UTC로 돌기 때문에
// getHours()/getDay()를 그대로 쓰면 9시간 어긋난다 — 개입 관련 시간 판단은 전부 이 파일을 거친다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface KstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=일
}

export function kstParts(date: Date): KstParts {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    weekday: k.getUTCDay(),
  };
}

// KST 기준 특정 날짜/시각을 UTC Date로 만든다.
export function kstDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS);
}

export function startOfKstDay(date: Date): Date {
  const p = kstParts(date);
  return kstDate(p.year, p.month, p.day);
}

// "2026-09-24T20:30:00+09:00 (목요일)" — GPT에게 현재 시각을 알려줄 때 쓰는 형식.
export function kstIsoWithWeekday(date: Date): string {
  const p = kstParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00+09:00 (${WEEKDAYS[p.weekday]}요일)`;
}

// "9월 26일(토) 오전 9시" / "오후 2시 30분" — 사람에게 보여주는 자연어 형식.
export function kstHuman(date: Date): string {
  const p = kstParts(date);
  const ampm = p.hour < 12 ? '오전' : '오후';
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const min = p.minute ? ` ${p.minute}분` : '';
  return `${p.month}월 ${p.day}일(${WEEKDAYS[p.weekday]}) ${ampm} ${h12}시${min}`;
}

// "1시간 뒤", "30분 뒤", "어제" 같은 상대 표현 (GPT 프롬프트용 사실 정보).
export function relativeFromNow(target: Date, now: Date): string {
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60000);
  const abs = Math.abs(diffMin);
  const suffix = diffMin >= 0 ? '뒤' : '전';
  if (abs < 60) return `${abs}분 ${suffix}`;
  const hours = Math.round(abs / 60);
  if (hours < 48) return `약 ${hours}시간 ${suffix}`;
  return `약 ${Math.round(hours / 24)}일 ${suffix}`;
}
