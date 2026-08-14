'use client';
import { useState, useRef } from 'react';

const PERSONAS = [
  { id: 'boss', label: '팩폭형 꼰대 상사', emoji: '💼' },
  { id: 'coach', label: '냉정한 행동경제학 코치', emoji: '📊' },
  { id: 'mom', label: '잔소리 폭발하는 엄마', emoji: '👵' },
  { id: 'friend', label: '다정한데 뼈 때리는 친구', emoji: '🫂' },
];

export default function OnboardingPage() {
  const [step, setStep] = useState<'setup' | 'record' | 'done'>('setup');
  const [phone, setPhone] = useState('');
  const [targetGoal, setTargetGoal] = useState('');
  const [persona, setPersona] = useState('coach');
  const [penaltyEnabled, setPenaltyEnabled] = useState(false);
  const [penaltyPhone, setPenaltyPhone] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('09:00');

  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const canProceed = phone.trim() && targetGoal.trim();

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
    formData.append('target_goal', targetGoal);
    formData.append('persona', persona);
    if (penaltyEnabled && penaltyPhone.trim()) {
      formData.append('penalty_phone', penaltyPhone);
      formData.append('deadline_time', deadlineTime);
    }

    const res = await fetch('/api/voice/upload', { method: 'POST', body: formData });
    const json = await res.json();
    setUploading(false);

    if (json.success) {
      setStep('done');
    } else {
      alert('업로드 실패: ' + json.error);
    }
  };

  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-slate-950 text-white px-5 py-10">
        <h1 className="text-xl font-bold mb-1">미라클 모닝 세팅</h1>
        <p className="text-sm text-slate-400 mb-6">오늘 아침 지킬 걸 딱 하나만 정해두세요.</p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">전화 받을 번호</label>
            <input
              type="tel"
              placeholder="010-1234-5678"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">내일 아침 지킬 단 하나의 목표</label>
            <input
              type="text"
              placeholder="예: 7시에 일어나서 운동 30분"
              value={targetGoal}
              onChange={e => setTargetGoal(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-2">참견해줄 AI 페르소나</label>
            <div className="grid grid-cols-2 gap-2">
              {PERSONAS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPersona(p.id)}
                  className={`p-3 rounded-xl text-sm text-left border ${
                    persona === p.id
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="text-lg mb-1">{p.emoji}</div>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-semibold">소셜 페널티</div>
                <div className="text-xs text-slate-500">Pro 전용 · 못 지키면 지인에게 문자가 갑니다</div>
              </div>
              <button
                onClick={() => setPenaltyEnabled(!penaltyEnabled)}
                className={`w-11 h-6 rounded-full transition ${penaltyEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition ${penaltyEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {penaltyEnabled && (
              <div className="space-y-2 mt-3">
                <input
                  type="tel"
                  placeholder="지인 연락처 (여친/남친/절친)"
                  value={penaltyPhone}
                  onChange={e => setPenaltyPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 text-white text-sm"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">이 시각까지 응답 없으면 발송</span>
                  <input
                    type="time"
                    value={deadlineTime}
                    onChange={e => setDeadlineTime(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm"
                  />
                </div>
                <p className="text-xs text-slate-600">
                  문자 내용: "[긴급] {phone || '사용자'}님이 오늘도 핑계를 대며 기상에 실패했습니다. 벌칙 수행을 독려해 주세요."
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => canProceed && setStep('record')}
          disabled={!canProceed}
          className="w-full py-3.5 bg-white text-slate-900 font-bold rounded-full disabled:opacity-30"
        >
          다음: 오늘 아침 녹음하기
        </button>
      </div>
    );
  }

  if (step === 'record') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white px-6">
        <p className="text-sm text-slate-400 mb-2">목표: {targetGoal}</p>
        <p className="text-xs text-slate-600 mb-10">지금 상태나 핑계, 아무 말이나 해보세요</p>
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={uploading}
          className={`w-40 h-40 rounded-full text-5xl flex items-center justify-center transition ${
            recording ? 'bg-rose-600 animate-pulse' : 'bg-indigo-600'
          } ${uploading ? 'opacity-50' : ''}`}
        >
          🎙️
        </button>
        <p className="mt-6 text-sm text-slate-400">
          {recording ? '듣고 있어요...' : uploading ? '분석 중...' : '눌러서 녹음 시작'}
        </p>
        {recording && (
          <button onClick={stopRecording} className="mt-4 text-sm text-slate-500 underline">
            녹음 끝내기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white px-6 text-center">
      <div className="text-5xl mb-4">📞</div>
      <p className="text-lg font-bold mb-2">잠시 후 전화가 울립니다</p>
      <p className="text-sm text-slate-400">1~5분 사이에 전화가 갈 거예요.</p>
      {penaltyEnabled && (
        <p className="text-xs text-rose-400 mt-3">
          ⚠️ {deadlineTime}까지 응답 없으면 지인에게 알림이 갑니다
        </p>
      )}
    </div>
  );
}
