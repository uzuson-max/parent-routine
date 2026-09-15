
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { markInsightsSurfaced } from '@/lib/insightEngine';
import { PERSONALITY_PROMPT } from '@/lib/responseEngine';
import { filterConfirmedCommitments, markMemoriesReferenced } from '@/lib/memoryRetrieval';

// 홈 화면에서 "참견이가 나를 찾아왔다"고 보여줄 수 있는 진짜 참견 한 건을 골라주는 읽기 엔드포인트.
// 우선순위: 1) 단일 memory_unit 콜백(memoryCallbackEngine.ts와 같은 후보/판단 로직) →
// 2) memory_insight 콜백(insightCallbackEngine.ts와 같은 로직) → 3) 없으면 null(프론트가 최근
// 반응/기본 인사로 대체).
//
// memoryCallbackEngine.ts / insightEngine.ts / insightCallbackEngine.ts 파일 자체는 이번에도
// 전혀 수정하지 않았다. 아래 1번 섹션은 memoryCallbackEngine.ts의 fetchCallbackCandidates /
// synthesizeMemoryCallback 로직을 사용자 한 명 기준으로 그대로 미러링한 것이다 — 그 파일의
// sendDueMemoryCallbacks()를 직접 재사용하지 않은 이유는, 그 함수가 "전체 사용자를 한 배치로
// 도는" cron 전용 함수라서 이 라우트(요청 한 건 = 사용자 한 명)에서 그대로 부르면 홈 화면을
// 열 때마다 다른 사용자들 몫까지 전부 GPT를 호출하게 되기 때문이다. 후보 조건(나이/중요도/
// 상태/보존정책), 정렬, filterConfirmedCommitments 통과, GPT 프롬프트는 memoryCallbackEngine.ts와
// 완전히 동일하게 맞췄다.
//
// [중요한 조사 결과 — 구현 전에 확인한 것] memory_units 테이블 전체 컬럼(id, user_id,
// source_entry_id, source_channel, memory_type, subject_entity_id, content, raw_quote,
// emotion, importance, retention, event_time, created_at, last_referenced_at,
// reference_count, expected_relevance_until, decay_rate, status, embedding, temporal_context)
// 중 GPT가 만든 callback 문장을 넣을 만한 여유 필드가 없다. content/raw_quote는 원본 발화
// 텍스트(=GPT의 입력값)라 여기에 callback 결과를 덮어쓰면 원본 기억이 훼손되고, emotion은
// 감정 라벨용 짧은 값이라 문장을 담는 용도가 아니다. 그래서 이번에도 새 컬럼을 추가하지
// 않았고, memoryCallbackEngine.ts가 이미 쓰던 것과 똑같이 last_referenced_at만 "한 번
// 꺼낸 것"의 상태 저장소로 재사용한다 — 문장 자체는 저장하지 않고, 홈이 열릴 때 그 자리에서
// (딱 한 번만, 진짜 후보가 있을 때만) 만들어서 바로 보여주고 즉시 claim한다.
//
// 중복 방지: 아래에서 후보를 찾아 GPT가 "지금 꺼낼 만하다(found:true)"고 답하면, 그 즉시
// markMemoriesReferenced()를 호출해 claim한다. 이러면 (1) 이후 cron(send-due-memory-callbacks
// 방식의 배치)이 같은 memory_unit을 다시 후보로 보지 않아 SMS 중복 발송이 없고, (2) 다음 홈
// 방문에서도 같은 memory_unit을 다시 후보로 보지 않아 화면에 다시 뜨지 않는다 —
// memoryCallbackEngine.ts 자신이 SMS 발송 성공 시 하는 것과 정확히 같은 처리를, 여기서는
// "화면에 보여줌 = 한 번 꺼낸 것"으로 간주해서 그대로 적용한 것뿐이다.
// GPT가 found:false(꺼낼 만큼 흥미롭지 않음)로 답하면 claim하지 않는다 — 이것도
// memoryCallbackEngine.ts 원래 동작과 동일하다(원본도 이 경우 last_referenced_at을 그대로
// 둔다). 따라서 그 memory_unit은 다음 배치/다음 홈 방문에서 다시 후보가 될 수 있고, 그때
// 다시 판단된다 — 새로운 문제가 아니라 원래 엔진의 동작을 그대로 물려받은 것이다.
const MEM_MIN_AGE_DAYS = 3;
const MEM_MAX_AGE_DAYS = 10;
const MEM_IMPORTANCE_THRESHOLD = 0.6;

interface MemoryCallbackCandidateRow {
  id: number;
  user_id: string;
  content: string;
  memory_type: string;
  temporal_context: string | null;
  source_entry_id: string | null;
}

async function fetchMemoryCallbackCandidate(userId: string): Promise<MemoryCallbackCandidateRow | null> {
  const now = Date.now();
  const oldestAllowed = new Date(now - MEM_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const newestAllowed = new Date(now - MEM_MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('memory_units')
    .select('id, user_id, content, memory_type, temporal_context, source_entry_id')
    .eq('user_id', userId)
    .neq('memory_type', 'commitment')
    .eq('status', 'open')
    .in('retention', ['permanent', 'temporary'])
    .is('last_referenced_at', null)
    .gte('importance', MEM_IMPORTANCE_THRESHOLD)
    .gte('created_at', oldestAllowed)
    .lte('created_at', newestAllowed)
    .order('importance', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[api/user/proactive-line] memory_unit 후보 조회 실패:', error.message);
    return null;
  }
  if (!data) return null;

  // commitment는 쿼리에서 이미 제외했지만, memoryCallbackEngine.ts와 동일하게 방어적으로
  // filterConfirmedCommitments를 그대로 통과시킨다(원래도 이 풀에는 사실상 no-op).
  const filtered = await filterConfirmedCommitments(userId, [data as MemoryCallbackCandidateRow]);
  return filtered[0] ?? null;
}

// memoryCallbackEngine.ts의 synthesizeMemoryCallback()과 프롬프트를 한 글자도 바꾸지 않고 그대로 미러링.
async function synthesizeMemoryCallback(memory: MemoryCallbackCandidateRow): Promise<string | null> {
  const systemPrompt = `${PERSONALITY_PROMPT}

지금 너는 대화 중이 아니다. 며칠 전(또는 그 이상 전) 사용자가 지나가듯 흘린 말 하나를 혼자 들여다보고 있다.
이 기억이 지금 먼저 문자로 다시 꺼낼 만큼 흥미로운지 판단해라.

기억: (${memory.memory_type}) "${memory.content}"${
    memory.temporal_context ? ` — 당시 시점 표현: "${memory.temporal_context}"` : ''
  }

할 일: 이 기억 하나만 가지고, 참견이가 "야, 근데 그거..." 하면서 먼저 문자를 보낼 만한 한마디를 만들 수
있는지 판단해라.

중요한 원칙:
- 이건 알림이나 요약이 아니다. "~하셨습니다", "~라고 기록되어 있습니다" 같은 데이터베이스/상담사/설문조사
  말투는 절대 쓰지 마라. "계획이 어떻게 되세요?", "지금 기분이 어떠세요?" 같은 정보수집형 질문도 금지.
- 목표는 사용자가 자기가 했던 생각을 다시 한번 스스로 들여다보게 만드는 것이다 — 참견이가 판단을 내려주거나
  조언하는 게 아니다.
- 가장 참견이다운 톤은 "근데?", "그래서?", "그건 어떻게 됐어?"처럼, 예전에 한 말을 근거로 지금은 어떤지
  가볍게 캐묻는 것이다. 하지만 모든 기억에 억지로 질문을 만들어 붙이지 마라 — 질문형이 어색하면 그냥
  "그 말 아직도 생각나네." 같은 담백한 되던짐도 괜찮다. 중요한 건 형식이 아니라 "진짜 다시 궁금해서
  꺼내는 느낌"이지, 정해진 어미를 쓰는 게 아니다.
- 위 기억 하나만으로 정말 흥미로운 지점이 없다면(그냥 일상적이고 다시 꺼낼 이유가 없는 내용이면) 억지로
  만들지 말고 found:false로 답해라. 애매하면 만들지 않는 쪽을 택해라. 참견이는 아무거나 붙잡고 늘어지는
  게 아니다 — 가끔은 정말 사소한 것도 물고 늘어질 수 있지만, 그건 목적이 "사용자가 자기 생각을 다시
  바라보게 하는 것"일 때만 그렇다.
- 위 기억에 없는 사실을 지어내지 마라(날짜, 결과, 다른 사람의 반응 등 새로운 디테일 추가 금지).
- 날짜/횟수 등 데이터베이스 냄새나는 표현 금지.
- 1~2문장, SMS라 짧게 써라. 이모지는 필요할 때만 0~1개.

반드시 아래 JSON으로만 답해:
{ "found": true or false, "message": "..." or null }`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!res.ok) throw new Error('memory callback synthesis 실패: ' + (await res.text()));
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');

    if (!parsed.found || typeof parsed.message !== 'string' || !parsed.message.trim()) return null;
    return parsed.message.trim();
  } catch (err: any) {
    console.error('[api/user/proactive-line] synthesizeMemoryCallback 실패:', err?.message);
    return null;
  }
}

// ---- 2순위: memory_insight 콜백 (insightCallbackEngine.ts를 미러링, 기존 로직 그대로 유지) ----
const INSIGHT_CONFIDENCE_THRESHOLD = 0.6;
const MAX_INSIGHT_AGE_DAYS = 14;

async function fetchInsightCallback(userId: string): Promise<{ id: number; content: string } | null> {
  const cutoff = new Date(Date.now() - MAX_INSIGHT_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('memory_insights')
    .select('id, content, confidence, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('last_surfaced_at', null)
    .gte('confidence', INSIGHT_CONFIDENCE_THRESHOLD)
    .gte('created_at', cutoff)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[api/user/proactive-line] insight 후보 조회 실패:', error.message);
    return null;
  }
  if (!data) return null;

  try {
    await markInsightsSurfaced([data.id]);
  } catch (markErr: any) {
    console.error('[api/user/proactive-line] insight surfaced 처리 실패(무시):', markErr?.message);
  }

  return { id: data.id as number, content: data.content as string };
}

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: '인증 세션이 없습니다.' }, { status: 401 });
    }

    // 1순위: 단일 memory_unit 콜백
    const memCandidate = await fetchMemoryCallbackCandidate(userId);
    if (memCandidate) {
      const message = await synthesizeMemoryCallback(memCandidate);
      if (message) {
        // 화면에 보여주는 순간 곧바로 claim — 실패해도 사용자에게는 이미 응답이 나간 뒤이므로
        // 화면을 막지 않고 조용히 로그만 남긴다(memoryCallbackEngine.ts가 발송 성공 시 하는 것과 동일).
        try {
          await markMemoriesReferenced([memCandidate.id]);
        } catch (markErr: any) {
          console.error('[api/user/proactive-line] memory_unit referenced 처리 실패(무시):', markErr?.message);
        }
        return NextResponse.json({
          success: true,
          data: { id: memCandidate.id, content: message },
        });
      }
      // found:false — claim하지 않고 2순위로 넘어간다(원본 엔진과 동일하게, 다음에 다시 판단될 수 있음).
    }

    // 2순위: memory_insight 콜백 (기존 동작 그대로)
    const insightCandidate = await fetchInsightCallback(userId);
    if (insightCandidate) {
      return NextResponse.json({ success: true, data: insightCandidate });
    }

    // 둘 다 없음 — 프론트가 최근 반응/기본 인사로 대체한다.
    return NextResponse.json({ success: true, data: null });
  } catch (err: any) {
    console.error('[api/user/proactive-line] 서버 에러:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
