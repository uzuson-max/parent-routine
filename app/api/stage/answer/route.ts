// app/api/stage/answer/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase';
import { getUserIdFromRequest } from '@/lib/auth';
import { retrieveRelevantMemoriesWithTrace, markMemoriesReferenced } from '@/lib/memoryRetrieval';
import { STAGE_ID, STAGE_LENGTH, kstDate, stageDay, type ReturnSegment, type StageTone } from '@/lib/stage';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 강 — 오늘 돌 하나 건넜다.
// POST { day, part, entryId, tone }
//   1) 녹음은 이미 /api/voice/upload(강 모드)로 저장됐다 — 바다에 물고기로 들어가고, 엔진 기억에는 질문 맥락과 함께
//      앵커로 저장된다. 여기선 "몇 일차 대답"이었는지만 묶어 둔다.
//   2) 돌아오는 날(4·5·6·7일)이면 수달이 꺼낼 조각들을 만든다:
//        고정 문구 → 강 N일차 니 목소리 → (엔진이 찾은, 바다에 던져둔 자유 녹음이 딱 맞으면) 그 목소리 → 마지막 한마디
//      자유 녹음은 엔진 기억 검색(lib/memoryRetrieval) 후보 중 AI가 "오늘 대답과 직접 이어진다"고 고른 것만. 애매하면 안 꺼낸다.
export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: '인증 세션이 없습니다' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const day = Number(body?.day);
    const part = Number(body?.part ?? 1);
    const entryId = String(body?.entryId ?? '');
    const tone: StageTone = body?.tone === 'spicy' ? 'spicy' : 'mild';
    const cfg = stageDay(day);
    if (!cfg || !entryId || (part !== 1 && part !== 2) || (part === 2 && !cfg.followUp)) {
      return NextResponse.json({ success: false, error: '이상한 돌이야' }, { status: 400 });
    }

    // 지금 밟을 수 있는 돌인지 — 순서대로, 하루 하나.
    const { data: rows } = await supabase
      .from('stage_answers')
      .select('day, part, transcript, entry_id, created_at')
      .eq('user_id', userId)
      .eq('stage', STAGE_ID)
      .order('day', { ascending: true })
      .order('part', { ascending: true });
    const answered = rows ?? [];
    const last = answered[answered.length - 1];
    if (part === 1) {
      const nextDay = last ? last.day + 1 : 1;
      if (day !== nextDay || day > STAGE_LENGTH) {
        return NextResponse.json({ success: false, error: '그 돌은 아직이야' }, { status: 409 });
      }
      if (last && kstDate(last.created_at) >= kstDate(new Date())) {
        return NextResponse.json({ success: false, error: '오늘 돌은 이미 건넜어. 내일 또 와' }, { status: 409 });
      }
    } else if (!answered.some((r) => r.day === day && r.part === 1)) {
      return NextResponse.json({ success: false, error: '첫 질문부터야' }, { status: 409 });
    }

    // 본인 녹음인지 + 받아쓴 말
    const { data: entry } = await supabase
      .from('voice_entries')
      .select('id, user_id, transcript')
      .eq('id', entryId)
      .maybeSingle();
    if (!entry || entry.user_id !== userId) {
      return NextResponse.json({ success: false, error: '녹음을 못 찾았어' }, { status: 404 });
    }
    const transcript = String(entry.transcript ?? '').trim();

    const { error: insErr } = await supabase.from('stage_answers').upsert(
      { user_id: userId, stage: STAGE_ID, day, part, entry_id: entryId, transcript },
      { onConflict: 'user_id,stage,day,part' }
    );
    if (insErr) {
      console.error('[api/stage/answer] 저장 실패:', insErr.message);
      return NextResponse.json({ success: false, error: '돌에 못 새겼어. 다시 해볼래?' }, { status: 500 });
    }

    // 6일차 첫 질문 → 바로 두 번째 질문으로
    if (cfg.followUp && part === 1) {
      return NextResponse.json({ success: true, data: { followUp: cfg.followUp[tone] } });
    }

    if (!cfg.recall?.length || !cfg.intro) {
      return NextResponse.json({ success: true, data: { returnSegments: null } });
    }

    // 돌아오는 순간 — 그때 대답들 + 오늘 대답
    const pastText = (d: number) =>
      answered
        .filter((r) => r.day === d)
        .map((r) => r.transcript ?? '')
        .join(' / ');
    const todayText = [...answered.filter((r) => r.day === day && r.part !== part).map((r) => r.transcript ?? ''), transcript]
      .filter(Boolean)
      .join(' / ');

    // 엔진 기억 — 바다에 던져둔 자유 녹음 중 오늘 대답과 이어질 만한 후보(강 대답에서 나온 기억은 이미 위에서 쓰니 뺀다)
    const stageEntryIds = new Set([...answered.map((r) => String(r.entry_id ?? '')), entryId].filter(Boolean));
    const candidates = await findSeaMemories(userId, `${cfg.question.mild} ${todayText}`, stageEntryIds);

    const out = await makeOutro({
      tone,
      guide: cfg.outroGuide ?? '',
      past: cfg.recall.map((d) => ({ day: d, what: stageDay(d)?.what ?? '', text: pastText(d) })),
      todayWhat: cfg.what,
      todayText,
      candidates,
    });

    const intros = cfg.intro[tone];
    const segments: ReturnSegment[] = [];
    cfg.recall.forEach((d, i) => {
      if (intros[i]) segments.push({ kind: 'say', text: intros[i] });
      segments.push({ kind: 'voice', day: d, label: `${d}일차 니 목소리` });
    });
    const picked = out.memoryId != null ? candidates.find((c) => c.id === out.memoryId) : undefined;
    if (picked?.entryId) {
      segments.push({ kind: 'say', text: tone === 'spicy' ? '근데 이것도 있거든. 니가 바다에 던져둔 거.' : '그리고 이건 니가 바다에 던져둔 말이야.' });
      segments.push({ kind: 'voice', entryId: picked.entryId, label: `${agoLabel(picked.createdAt)}, 바다에서`, quote: picked.quote ?? undefined });
      markMemoriesReferenced([picked.id]).catch(() => {});
    }
    segments.push({ kind: 'say', text: out.line });

    await supabase
      .from('stage_answers')
      .update({ return_line: JSON.stringify(segments) })
      .eq('user_id', userId)
      .eq('stage', STAGE_ID)
      .eq('day', day)
      .eq('part', part);

    return NextResponse.json({ success: true, data: { returnSegments: segments } });
  } catch (err: any) {
    console.error('[api/stage/answer] 서버 에러:', err?.message);
    return NextResponse.json({ success: false, error: '잠깐 꼬였어. 다시 해볼래?' }, { status: 500 });
  }
}

interface SeaMemory {
  id: number;
  content: string;
  quote: string | null;
  createdAt: string;
  entryId: string | null;
}

async function findSeaMemories(userId: string, query: string, exclude: Set<string>): Promise<SeaMemory[]> {
  try {
    const { units } = await retrieveRelevantMemoriesWithTrace(userId, query, undefined, 8);
    const pool = units.filter((u) => u.source_entry_id && !exclude.has(String(u.source_entry_id))).slice(0, 4);
    if (pool.length === 0) return [];
    // 그 녹음에 실제 목소리가 남아 있는 것만(글로 남긴 건 들려줄 수 없다)
    const { data: withAudio } = await supabase
      .from('voice_entries')
      .select('id')
      .eq('user_id', userId)
      .in('id', pool.map((u) => String(u.source_entry_id)))
      .not('audio_url', 'is', null);
    const audible = new Set((withAudio ?? []).map((r) => String(r.id)));
    return pool
      .filter((u) => audible.has(String(u.source_entry_id)))
      .map((u) => ({
        id: u.id,
        content: u.content,
        quote: u.raw_quote ?? null,
        createdAt: u.created_at,
        entryId: u.source_entry_id ? String(u.source_entry_id) : null,
      }));
  } catch (err: any) {
    console.error('[api/stage/answer] 엔진 기억 검색 실패(강 대답만으로 계속):', err?.message);
    return [];
  }
}

function agoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}달 전`;
}

const FALLBACK: Record<StageTone, string> = {
  mild: '들어보니까 어때, 그때랑 지금 같아?',
  spicy: '들어보니까 어때? 그때 니랑 지금 니, 같은 사람 맞아?',
};

async function makeOutro(input: {
  tone: StageTone;
  guide: string;
  past: { day: number; what: string; text: string }[];
  todayWhat: string;
  todayText: string;
  candidates: SeaMemory[];
}): Promise<{ line: string; memoryId: number | null }> {
  const system = `너는 '참견이'라는 수달 캐릭터야. 사용자의 지난 대답(목소리)을 방금 들려준 직후, 마지막 한마디를 한다.
말투 규칙:
- 반말. 사용자는 항상 "니"/"니가"로 부른다. 참견이 자신은 "나" 대신 주어를 생략한다.
- 명령형 금지("해", "말해봐", "골라 봐", "~해야 해" 금지). 과공손체 금지.
- 1~2문장, 70자 이내. 마지막은 한 번에 답할 수 있는 질문 하나로 끝낸다.
- 사용자가 실제로 한 말만 근거로 쓴다. 안 한 말·감정을 지어내지 않는다. 남들의 실제 생각을 아는 척하지 않는다.
- 상담사 말투, "~구나" 재진술, 감성적인 시 같은 문장 금지.
톤: ${
    input.tone === 'spicy'
      ? '매운맛 — 오래 본 친구가 놀리듯 짓궂게. 웃긴 초딩 욕은 써도 된다(바보, 멍청이, 쫄보, 똥멍청이, 뭐래, 킹받네, 어이없어 수준까지). 진짜 비속어·혐오 표현은 절대 금지. 욕은 사람이 아니라 행동(미룬 것, 말과 행동의 틈, 허세, 예측 실패)에만 붙인다. 외모·가족·건강·돈 사정·마음의 상처는 절대 놀리지 않는다. 예: "헬스 회원권 기부했냐 이 바보야ㅋㅋ 이번 주 몇 번 갔는데"'
      : '순한맛 — 궁금해하는 친구처럼 담백하게. 틈은 보여주되 판단하지 않고 묻기만 한다.'
  }
대답에 힘든 상황(우울, 불안, 상실, 위기)이 보이면 장난을 멈추고 짧고 따뜻하게 묻는다.
이번 한마디의 목적: ${input.guide}

[바다 기억] 사용자가 평소에 바다(자유 녹음)에 던져둔 말 후보가 주어질 수 있다.
- 오늘 대답이나 지난 대답과 "직접" 이어지는 게 있을 때만 하나 고른다(같은 대상·같은 행동·정반대의 말 등). 주제만 비슷하면 고르지 않는다. 애매하면 null.
- 고르면 그 목소리를 한마디 직전에 들려준다. 한마디에 그 내용을 자연스럽게 엮는다(날짜나 "기록에 따르면" 같은 말 금지).
JSON으로만 답한다: {"line": "마지막 한마디", "memory_id": 숫자 또는 null}`;

  const user = [
    ...input.past.map((p) => `[${p.day}일차 · ${p.what}] ${p.text || '(대답 없음)'}`),
    `[오늘 · ${input.todayWhat}] ${input.todayText || '(대답 없음)'}`,
    '',
    '[바다 기억 후보]',
    ...(input.candidates.length
      ? input.candidates.map((c) => `- id=${c.id} (${agoLabel(c.createdAt)}) ${c.content}${c.quote ? ` / 원문: "${c.quote}"` : ''}`)
      : ['(없음)']),
  ].join('\n');

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.8,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
    const line = String(parsed?.line ?? '')
      .trim()
      .replace(/^["'“”]+|["'“”]+$/g, '');
    const id = typeof parsed?.memory_id === 'number' && input.candidates.some((c) => c.id === parsed.memory_id) ? parsed.memory_id : null;
    return { line: line && line.length <= 120 ? line : FALLBACK[input.tone], memoryId: id };
  } catch (err: any) {
    console.error('[api/stage/answer] 한마디 생성 실패:', err?.message);
    return { line: FALLBACK[input.tone], memoryId: null };
  }
}
