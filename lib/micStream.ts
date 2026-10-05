
"use client";

// 앱이 열려 있는 동안 마이크 스트림 하나를 계속 재사용한다.
//
// [왜 이렇게 바꿨나]
// 예전엔 대화가 끝날 때마다(홈 말풍선 닫기 / 다른 탭 이동 / 앱 백그라운드) 트랙을 stop()해서 스트림을 완전히 버렸다.
// 그러면 다음 녹음에서 getUserMedia를 새로 불러야 하는데, iOS Safari / 홈 화면 PWA(WebKit)는
// 스트림이 완전히 끊긴 뒤 getUserMedia를 다시 부르면 권한 팝업을 또 띄운다 → "녹음할 때마다 권한 물어봄".
//
// [지금 규칙]
//   - getUserMedia 호출 지점은 이 파일 하나. 앱을 켜고 처음 녹음할 때 딱 한 번만 부른다.
//   - releaseMicStream()은 이제 스트림을 버리지 않고 트랙만 잠깐 꺼둔다(track.enabled = false).
//     → 소리는 안 들어가고, 브라우저의 마이크 사용 표시도 대부분 꺼지거나 "일시정지"로 바뀐다.
//     → 다음 acquireMicStream()은 같은 트랙을 다시 켜기만 하므로 권한 팝업이 안 뜬다.
//   - 진짜로 스트림을 버리는 건 페이지가 닫힐 때(pagehide)뿐이다.
//   - OS가 트랙을 강제로 끊은 경우(백그라운드 전환, 전화 수신 등)엔 어쩔 수 없이 새로 받는다.
//
// 기존 호출부(page.tsx 등의 releaseMicStream())는 이름·사용법 그대로 두면 된다.

let stream: MediaStream | null = null;
let pending: Promise<MediaStream> | null = null;

function isLive(s: MediaStream | null): s is MediaStream {
  return !!s && s.getAudioTracks().some((t) => t.readyState === "live");
}

function setEnabled(s: MediaStream, on: boolean) {
  s.getAudioTracks().forEach((t) => {
    t.enabled = on;
  });
}

// 버튼 onClick 안에서 바로(await 없이) 불러도 된다 — 사용자 제스처 안에서 요청이 시작되도록.
// 동시에 여러 번 불려도 getUserMedia는 한 번만 호출된다.
export function acquireMicStream(): Promise<MediaStream> {
  if (isLive(stream)) {
    setEnabled(stream, true); // 꺼뒀던 트랙을 다시 켜기만 — 권한 요청 없음
    return Promise.resolve(stream);
  }
  if (pending) return pending;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("이 브라우저에선 마이크를 못 써."));
  }
  pending = navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((s) => {
      // 혹시 이전 스트림 찌꺼기가 남아 있으면 정리
      if (stream && stream !== s) stream.getTracks().forEach((t) => t.stop());
      stream = s;
      return s;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

// 대화가 끝났을 때 부른다. 스트림은 버리지 않고 트랙만 꺼둔다(다음 녹음 때 권한 팝업 방지).
export function releaseMicStream() {
  if (stream) setEnabled(stream, false);
}

// 스트림을 완전히 버린다. 페이지가 닫힐 때만 쓴다.
export function destroyMicStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

// 앱이 백그라운드로 가면 트랙만 꺼두고, 페이지가 진짜 닫힐 때만 스트림을 버린다.
// 모듈이 처음 로드될 때 한 번만 등록.
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") releaseMicStream();
  });
  window.addEventListener("pagehide", (e) => {
    // bfcache로 잠깐 숨겨지는 경우(persisted)는 살려둔다
    if (!(e as PageTransitionEvent).persisted) destroyMicStream();
  });
}
