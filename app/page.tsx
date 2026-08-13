'use client';
import { useState, useRef } from 'react';

export default function RecordPage() {
  const [phone, setPhone] = useState('');
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = e => chunksRef.current.push(e.data);
    recorder.onstop = () => uploadRecording();

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
    setRecording(false);
  };

  const uploadRecording = async () => {
    setUploading(true);
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');
    formData.append('phone', phone);

    const res = await fetch('/api/voice/upload', { method: 'POST', body: formData });
    const json = await res.json();
    setUploading(false);

    if (json.success) {
      setDone(true);
    } else {
      alert('업로드 실패: ' + json.error);
    }
  };

  if (!phoneConfirmed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-slate-950 text-white">
        <p className="text-sm text-slate-400 mb-3">전화받을 번호를 입력하세요</p>
        <input
          type="tel"
          placeholder="010-1234-5678"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="w-full max-w-xs px-4 py-3 rounded-xl bg-slate-800 text-white text-center mb-4"
        />
        <button
          onClick={() => phone && setPhoneConfirmed(true)}
          className="px-6 py-3 bg-white text-slate-900 font-bold rounded-full"
        >
          시작하기
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white px-6 text-center">
        <div className="text-5xl mb-4">🎙️</div>
        <p className="text-lg font-bold mb-2">녹음이 저장됐어요</p>
        <p className="text-sm text-slate-400">(Day 1 단계 — 아직 전화는 연결 전이에요)</p>
        <button
          onClick={() => setDone(false)}
          className="mt-8 text-xs text-slate-500 underline"
        >
          다시 녹음하기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white">
      <p className="text-sm text-slate-400 mb-10">
        {recording ? '듣고 있어요...' : uploading ? '저장 중...' : '눌러서 아무 말이나 해보세요'}
      </p>
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={uploading}
        className={`w-40 h-40 rounded-full text-5xl flex items-center justify-center transition ${
          recording ? 'bg-rose-600 animate-pulse' : 'bg-indigo-600'
        } ${uploading ? 'opacity-50' : ''}`}
      >
        🎙️
      </button>
      {recording && (
        <button onClick={stopRecording} className="mt-8 text-sm text-slate-400 underline">
          녹음 끝내기
        </button>
      )}
    </div>
  );
}
