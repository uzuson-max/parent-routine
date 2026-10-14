// lib/season.ts
// ============================================================================
// 바다의 계절 — 실제 달력(한국 시간)과 같이 흐른다(동물의숲처럼).
// ----------------------------------------------------------------------------
//   autumn  9/15 ~ 11/20  단풍잎이 수면에 떠다니고, 심해까지 천천히 가라앉는다. 참견이가 잎을 주워 논다.
//   null    그 밖 — 아직 다른 계절 연출은 없다(초겨울 눈은 다음 단계).
// 화면에서 쓸 땐 useSeason() — 서버/브라우저 날짜 차이로 화면이 어긋나지 않게 그린 뒤에 정한다.
// 확인용: localStorage "ganseobi_season" 에 "autumn"/"none" 을 넣으면 그걸 쓴다.
// ============================================================================

import { useEffect, useState } from "react";

export type Season = "autumn" | null;

export function seasonAt(now: Date = new Date()): Season {
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const md = (kst.getMonth() + 1) * 100 + kst.getDate();
  if (md >= 915 && md <= 1120) return "autumn";
  return null;
}

export function useSeason(): Season {
  const [s, setS] = useState<Season>(null);
  useEffect(() => {
    let forced: string | null = null;
    try {
      forced = localStorage.getItem("ganseobi_season");
    } catch {
      /* 그대로 */
    }
    if (forced === "autumn") setS("autumn");
    else if (forced === "none") setS(null);
    else setS(seasonAt());
  }, []);
  return s;
}
