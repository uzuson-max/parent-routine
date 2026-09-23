
"use client";

// 대화 루프(녹음 → 응답 → ＋ 더 이야기하기 → 녹음 …) 동안 마이크 스트림 하나를 계속 재사용한다.
//
// 예전 RecordingScreen은 녹음이 끝날 때마다 트랙을 stop()하고 다음 녹음에서 getUserMedia를 새로 불렀다.
// Chrome(Android)은 이래도 권한을 기억하지만, iOS Safari / 홈 화면 PWA(WebKit)는 스트림이 완전히
// 끊긴 뒤 getUserMedia를 다시 부르면 권한 팝업을 또 띄우는 경우가 많다. 그래서:
//   - 스트림은 여기 한 곳에서만 만든다 (getUserMedia 호출 지점 = 이 파일 하나).
//   - 아직 살아있는 트랙이 있으면 그대로 돌려준다 → 루프 안에서는 권한 요청이 다시 안 뜬다.
//   - 대화를 끝내고 홈으로 갈 때 / 앱이 백그라운드로 갈 때만 releaseMicStream()으로 해제한다
//     (마이크 사용 표시등이 계속 켜져 있지 않도록).

let stream: MediaStream | null = null;
let pending: Promise<MediaStream> | null = null;

function isLive(s: MediaStream | null): s is MediaStream {
  return !!s && s.getAudioTracks().some((t) => t.readyState === "live");
}

// 버튼 onClick 안에서 바로(await 없이) 불러도 된다 — 사용자 제스처 안에서 요청이 시작되도록.
// 동시에 여러 번 불려도 getUserMedia는 한 번만 호출된다.
export function acquireMicStream(): Promise<MediaStream> {
  if (isLive(stream)) return Promise.resolve(stream);
  if (pending) return pending;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("이 브라우저에선 마이크를 못 써."));
  }
  pending = navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((s) => {
      stream = s;
      return s;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function releaseMicStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

// 앱이 백그라운드로 가거나 닫히면 마이크를 놓아준다. 모듈이 처음 로드될 때 한 번만 등록.
if (typeof window !== "undefined") {
  const onHide = () => {
    if (document.visibilityState === "hidden") releaseMicStream();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", releaseMicStream);
}
