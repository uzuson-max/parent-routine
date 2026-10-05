// ---------------------------------------------------------------------------
// 무음 녹음 거르기 — Whisper는 말소리가 없는 오디오를 받으면 학습 데이터(유튜브 자막)에 많던
// 문장을 지어낸다("시청해주셔서 감사합니다", "구독과 좋아요" 등). 이런 녹음은 아무것도 저장하지 않는다.
//   1) Whisper가 직접 매긴 "말소리 없음 확률"(segments[].no_speech_prob)이 전체적으로 높으면 무음.
//   2) 결과 문장이 알려진 환각 문구뿐이면(그 문구를 빼고 남는 게 거의 없으면) 무음.
// 클라이언트(lib/useTankRecorder.ts, RecordingScreen)도 음량으로 한 번 거르지만, 배경 소음이 있으면
// 통과할 수 있어서 여기서 한 번 더 막는다.
// ---------------------------------------------------------------------------
export const WHISPER_HALLUCINATIONS: RegExp[] = [
  /시청\s*해\s*주셔서\s*감사(합니다|드립니다)?/g,
  /구독(과|이랑|이나)?\s*좋아요(\s*(부탁|눌러)[가-힣]*)?/g,
  /좋아요(와|랑)?\s*구독(\s*(부탁|눌러)[가-힣]*)?/g,
  /알림\s*설정(\s*(부탁|까지)[가-힣]*)?/g,
  /다음\s*(영상|시간)에서\s*(만나요|뵙겠습니다|봬요)/g,
  /[A-Z]{2,4}\s*뉴스\s*[가-힣]{2,4}\s*(입니다|기자입니다)/g,
  /자막\s*(제공|제작)[^.!?]*/g,
  /(한국어\s*)?자막\s*by[^.!?]*/gi,
  /끝까지\s*(시청|봐)\s*주셔서\s*감사(합니다)?/g,
  /오늘도\s*(영상\s*)?시청\s*감사(합니다)?/g,
];

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

  let rest = clean;
  for (const re of WHISPER_HALLUCINATIONS) rest = rest.replace(re, '');
  rest = rest.replace(/[\s.,!?~…·"'“”‘’()\-]/g, '');
  const removedSomething = rest.length < clean.replace(/[\s.,!?~…·"'“”‘’()\-]/g, '').length;
  return removedSomething && rest.length <= 3;
}
