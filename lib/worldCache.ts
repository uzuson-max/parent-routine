// ============================================================================
// 어항 세계(홈 어항 / 지난 어항) 데이터 캐시.
// ----------------------------------------------------------------------------
// 탭을 오갈 때마다 화면 컴포넌트가 새로 만들어져서, 예전엔 매번 서버가 계보를 다시 묶을 때까지
// (2~3초) 빈 어항이 보였다. 이제는:
//   1) 메모리 캐시 — 앱을 켜둔 동안은 탭을 오가도 바로 그 자리 그대로 보인다(첫 그림부터).
//   2) localStorage — 앱을 새로 켜도 지난번 어항을 먼저 띄운다.
//   3) 서버 — 뒤에서 조용히 최신으로 맞춘다. 같은 요청이 동시에 두 번 나가지 않게 묶는다.
// ============================================================================
import { supabaseClient } from "@/lib/supabaseClient";

export type WorldKey = "tank" | "archive";

const URLS: Record<WorldKey, string> = {
  tank: "/api/user/tank",
  archive: "/api/user/archive",
};
const storageKey = (k: WorldKey) => `ganseobi_world_${k}_v1`;

interface Cached {
  uid: string;
  data: unknown;
}

const memory: Partial<Record<WorldKey, Cached>> = {};
const inflight: Partial<Record<WorldKey, Promise<unknown>>> = {};

// 메모리에 있는 것만 — useState 초기값으로 써도 서버 렌더와 어긋나지 않는다(서버/첫 로드엔 늘 비어 있음).
export function peekMemory<T>(key: WorldKey): T | null {
  return (memory[key]?.data as T | undefined) ?? null;
}

// 기기에 저장해둔 지난번 데이터 — useEffect 안에서만 부를 것.
export function peekStored<T>(key: WorldKey): T | null {
  if (memory[key]) return memory[key]!.data as T;
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    memory[key] = parsed;
    return parsed.data as T;
  } catch {
    return null;
  }
}

// 서버에서 최신으로. 실패하면 throw(지난 어항은 실패 화면을 보여줘야 해서). 세션이 없으면 null.
export function loadFresh<T>(key: WorldKey): Promise<T | null> {
  const running = inflight[key];
  if (running) return running as Promise<T | null>;
  const p = (async () => {
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) return null;
      const res = await fetch(URLS[key], { headers: { Authorization: `Bearer ${session.access_token}` } });
      const body = await res.json();
      if (!body.success) throw new Error(body.error || "불러오기 실패");
      const entry: Cached = { uid: session.user.id, data: body.data };
      memory[key] = entry;
      try {
        localStorage.setItem(storageKey(key), JSON.stringify(entry));
      } catch {
        /* 용량이 넘치거나 막혀 있으면 메모리 캐시만 쓴다 */
      }
      return body.data as T;
    } finally {
      delete inflight[key];
    }
  })();
  inflight[key] = p;
  return p;
}

// 홈에 있는 동안 지난 어항을 미리 받아둔다 — 내려갔을 때 "잠깐만." 없이 바로 보이게.
export function prefetchWorld(key: WorldKey) {
  if (memory[key]) return;
  loadFresh(key).catch(() => {
    /* 미리 받기는 실패해도 조용히 — 실제로 열 때 다시 시도한다 */
  });
}
