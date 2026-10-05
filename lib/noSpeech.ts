// ---------------------------------------------------------------------------
// 무음 녹음 거르기 — Whisper는 말소리가 없는(또는 잡음뿐인) 오디오를 받으면 학습 데이터(유튜브 자막)에
// 많던 문장을 지어낸다. 예) "시청해주셔서 감사합니다", "오늘 영상은 여기까지입니다. 댓글 많이 남겨주세요.
// 구독 좋아요 알림설정", "MBC 뉴스 ○○○입니다".
// 이 함수가 true면 upload route는 바로 저장하지 않고 사용자에게 "이렇게 말한 거 맞아?"를 묻는다
// (진짜로 그렇게 말한 사람도 있을 수 있어서 — 확인하면 그대로 저장된다).
//
// 판정 방법
//   1) Whisper가 직접 매긴 "말소리 없음 확률"(segments[].no_speech_prob)이 전체적으로 높으면 무음.
//   2) 유튜브/방송 마무리 멘트(아래 SPECIFIC)가 하나라도 있으면, 그 멘트와 흔한 인사말(GENERIC)을
//      전부 지우고 남는 글자를 본다. 거의 안 남으면(원래 글자의 20% 이하 또는 6자 이하) 무음.
//      → "유튜브 보다가 구독 눌렀어. 근데 그 채널 진짜 웃겨" 같은 진짜 말은 남는 글자가 많아서 통과한다.
//   GENERIC(감사합니다/알라뷰/안녕히 계세요…)은 SPECIFIC이 함께 있을 때만 지운다 — 사용자가 진짜로
//   "감사합니다"라고만 말한 경우까지 무음으로 보지 않기 위해.
// 클라이언트(lib/useTankRecorder.ts, RecordingScreen)도 음량으로 한 번 거르지만, 배경 소음이 있으면
// 통과할 수 있어서 여기서 한 번 더 막는다.
// ---------------------------------------------------------------------------

// 유튜브/방송 마무리 멘트 — 이게 있어야 "환각일 수 있다"로 본다.
export const WHISPER_HALLUCINATIONS: RegExp[] = [
  /(끝까지\s*)?(시청|봐)\s*(해\s*)?주셔서\s*(정말\s*)?(감사|고맙)[가-힣]*/g,
  /(오늘도\s*)?(영상\s*)?시청\s*감사[가-힣]*/g,
  /(오늘\s*)?(영상|방송|이야기)(은|는)\s*여기까지[가-힣]*/g,
  /(여러분(의|들)?\s*)?(댓글|의견)(도|은|을)?\s*(많이\s*)?(남겨|달아)\s*(주세요|줘|주시면)[가-힣]*/g,
  /구독(과|이랑|이나|하고)?\s*(좋아요|알림\s*설정)(\s*(와|과|이랑|하고)?\s*(좋아요|알림\s*설정))*(\s*(부탁|눌러|해)[가-힣]*)?/g,
  /좋아요(와|랑|하고)?\s*구독(\s*(부탁|눌러|해)[가-힣]*)?/g,
  /구독\s*(부탁|눌러|해\s*주)[가-힣]*/g,
  /알림\s*설정(\s*(부탁|까지|해)[가-힣]*)?/g,
  /다음\s*(영상|시간|방송)에서\s*(또\s*)?(만나요|뵙겠습니다|봬요|만나겠습니다)/g,
  /[A-Z]{2,4}\s*뉴스\s*[가-힣]{2,4}\s*(입니다|기자입니다)/g,
  /자막\s*(제공|제작)[^.!?]*/g,
  /(한국어\s*)?자막\s*by[^.!?]*/gi,
  /thank\s*you\s*for\s*watching[.!]*/gi,
  /^\s*thank\s*you[.!]*\s*$/gi, // 한국어 녹음에서 이 한마디만 나오는 건 거의 항상 무음 환각
];

// 흔한 마무리 인사 — SPECIFIC이 하나라도 있을 때만 같이 지운다.
const GENERIC_CLOSINGS: RegExp[] = [
  /(정말\s*)?(감사|고맙)(합니다|드립니다|습니다)/g,
  /알라뷰|아이\s*러브\s*유|사랑(합니다|해요)/g,
  /안녕히\s*(계세요|가세요)|안녕[~!]*/g,
  /(다음에\s*)?(또\s*)?만나요/g,
  /여러분/g,
  /바이\s*바이|빠이/g,
];

const PUNCT = /[\s.,!?~…·"'“”‘’()\-♡♥]/g;

export function looksLikeNoSpeech(text: string, segments: any[] | undefined): boolean {
  const clean = (text || '').trim();
  if (!clean) return true;

  if (Array.isArray(segments) && segments.length > 0) {
    // 길이로 가중한 평균 no_speech_prob
    let total = 0;
    let weighted = 0;
    for (const seg of segments) {
      const dur = Math.max(0.01, (Number(seg?.end) || 0) - (Number(seg?.start) || 0));
      const p = Number(seg?.no_speech_prob);
      if (!Number.isFinite(p)) continue;
      total += dur;
      weighted += p * dur;
    }
    if (total > 0 && weighted / total >= 0.6) return true;
  }

  const originalLen = clean.replace(PUNCT, '').length;
  let rest = clean;
  let hitSpecific = false;
  for (const re of WHISPER_HALLUCINATIONS) {
    const next = rest.replace(re, '');
    if (next !== rest) hitSpecific = true;
    rest = next;
  }
  if (!hitSpecific) return false;
  for (const re of GENERIC_CLOSINGS) rest = rest.replace(re, '');
  const restLen = rest.replace(PUNCT, '').length;
  return restLen <= 6 || restLen <= originalLen * 0.2;
}
