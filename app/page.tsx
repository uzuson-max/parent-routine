'use client';
import { useState, useEffect } from 'react';

interface Routine {
  id: string;
  parent_name: string;
  phone_number: string;
  routine_text: string;
  call_message: string;
  call_time: string;
  repeat_days: number[];
  is_one_time: boolean;
  schedule_date: string | null;
  last_status: string;
  call_state: string;
  history: { status: string; time: string; message: string }[];
}

const TEMPLATES = [
  '약 드실 시간이에요',
  '오늘 날씨가 쌀쌀해요',
  '따뜻한 옷 입으세요',
  '식사 챙겨 드셨나요?',
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const STATUS_LABEL: Record<string, string> = {
  pending: '대기중',
  success: '통화 성공',
  no_answer: '부재중',
  failed: '실패',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
  no_answer: 'bg-amber-100 text-amber-700',
  failed: 'bg-rose-100 text-rose-700',
};

export default function Dashboard() {
  const [form, setForm] = useState({
    parent_name: '',
    phone_number: '',
    routine_text: '',
    call_message: '',
    call_time: '09:00',
    repeat_days: [] as number[],
    is_one_time: false,
    schedule_date: new Date().toISOString().slice(0, 10),
  });
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRoutines = async () => {
    const res = await fetch('/api/routines');
    const json = await res.json();
    if (json.success) setRoutines(json.data);
  };

  useEffect(() => { loadRoutines(); }, []);

  const toggleDay = (day: number) => {
    setForm(prev => ({
      ...prev,
      repeat_days: prev.repeat_days.includes(day)
        ? prev.repeat_days.filter(d => d !== day)
        : [...prev.repeat_days, day].sort(),
    }));
  };

  const applyTemplate = (text: string) => {
    setForm(prev => ({ ...prev, call_message: text }));
  };

  const handleSave = async () => {
    if (!form.parent_name || !form.phone_number || !form.call_time) {
      alert('성함, 전화번호, 시간은 필수입니다.');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setLoading(false);
    if (json.success) {
      setForm({
        parent_name: '', phone_number: '', routine_text: '', call_message: '',
        call_time: '09:00', repeat_days: [], is_one_time: false,
        schedule_date: new Date().toISOString().slice(0, 10),
      });
      loadRoutines();
    } else {
      alert(json.error);
    }
  };

  const handleCallNow = async (id: string) => {
    const res = await fetch(`/api/routines/${id}/call`, { method: 'POST' });
    const json = await res.json();
    alert(json.success ? '발신 요청 완료' : `실패: ${json.error}`);
    loadRoutines();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/routines/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) loadRoutines();
  };

  const scheduleLabel = (r: Routine) => {
    if (r.is_one_time) return `${r.schedule_date} (한 번만)`;
    if (!r.repeat_days || r.repeat_days.length === 0) return '매일';
    return r.repeat_days.map(d => WEEKDAY_LABELS[d]).join(', ');
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="mb-6">
        <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full">
          제로 세팅 · 아날로그 안부 케어
        </span>
        <h1 className="text-xl font-bold text-slate-800 mt-2">부모님 안부 케어 시스템</h1>
        <p className="text-sm text-slate-500 mt-1">
          부모님은 아무것도 설치하지 않아도 돼요. 시간과 멘트만 정해두면 자동으로 전화가 갑니다.
        </p>
      </div>

      {/* 등록 폼 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="부모님 성함"
            value={form.parent_name}
            onChange={e => setForm({ ...form, parent_name: e.target.value })}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            placeholder="전화번호 (010...)"
            value={form.phone_number}
            onChange={e => setForm({ ...form, phone_number: e.target.value })}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <input
          placeholder="오늘의 루틴 (예: 혈압약 복용 체크)"
          value={form.routine_text}
          onChange={e => setForm({ ...form, routine_text: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        {/* 템플릿 칩 */}
        <div>
          <label className="text-xs text-slate-500 font-semibold block mb-1.5">자주 쓰는 멘트</label>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => applyTemplate(t)}
                className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <textarea
          placeholder="AI가 전화로 건넬 안내 멘트"
          value={form.call_message}
          onChange={e => setForm({ ...form, call_message: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
        />

        <input
          type="time"
          value={form.call_time}
          onChange={e => setForm({ ...form, call_time: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        {/* 반복 방식 선택 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm({ ...form, is_one_time: false })}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
              !form.is_one_time ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            요일 반복
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, is_one_time: true })}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
              form.is_one_time ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            한 번만
          </button>
        </div>

        {!form.is_one_time ? (
          <div className="flex gap-1.5 justify-between">
            {WEEKDAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={`w-9 h-9 rounded-full text-xs font-semibold border ${
                  form.repeat_days.includes(idx)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <input
            type="date"
            value={form.schedule_date}
            onChange={e => setForm({ ...form, schedule_date: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        )}
        {!form.is_one_time && form.repeat_days.length === 0 && (
          <p className="text-xs text-slate-400">요일을 선택하지 않으면 매일 반복됩니다.</p>
        )}

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition disabled:opacity-50"
        >
          {loading ? '저장 중...' : '루틴 저장'}
        </button>
      </div>

      {/* 루틴 카드 목록 */}
      <h3 className="text-sm font-bold text-slate-700 mb-2">등록된 루틴 목록</h3>
      {routines.length === 0 && <p className="text-sm text-slate-400">등록된 루틴이 없습니다.</p>}

      <div className="space-y-3">
        {routines.map(r => (
          <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-bold text-slate-800">{r.parent_name} 님</div>
                <div className="text-xs text-slate-400">{r.phone_number}</div>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                r.call_state === 'awaiting_result' ? 'bg-blue-100 text-blue-700' : STATUS_STYLE[r.last_status] || STATUS_STYLE.pending
              }`}>
                {r.call_state === 'awaiting_result' ? '응답 확인중' : (STATUS_LABEL[r.last_status] || '대기중')}
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 mb-2">
              <div className="text-sm font-semibold text-slate-700">{r.routine_text}</div>
              <div className="text-xs text-slate-500 mt-1">"{r.call_message}"</div>
              <div className="text-xs text-slate-400 mt-1.5">
                {r.call_time.slice(0, 5)} · {scheduleLabel(r)}
              </div>
            </div>

            {r.history && r.history.length > 0 && (
              <div className="mb-2 space-y-1">
                {r.history.slice(0, 2).map((h, i) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded ${STATUS_STYLE[h.status] || STATUS_STYLE.pending}`}>
                    {new Date(h.time).toLocaleString('ko-KR')} · {STATUS_LABEL[h.status] || h.status}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleCallNow(r.id)}
                className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-lg"
              >
                지금 발신 테스트
              </button>
              <button
                onClick={() => handleDelete(r.id)}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-500 text-xs font-semibold rounded-lg"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
