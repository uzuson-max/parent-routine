'use client';
import { useState, useEffect } from 'react';

interface Routine {
  id: string;
  parent_name: string;
  phone_number: string;
  routine_text: string;
  call_message: string;
  call_time: string;
  last_status: string;
}

export default function Dashboard() {
  const [form, setForm] = useState({
    parent_name: '',
    phone_number: '',
    routine_text: '',
    call_message: '',
    call_time: '09:00',
  });
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRoutines = async () => {
    const res = await fetch('/api/routines');
    const json = await res.json();
    if (json.success) setRoutines(json.data);
  };

  useEffect(() => {
    loadRoutines();
  }, []);

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
      setForm({ parent_name: '', phone_number: '', routine_text: '', call_message: '', call_time: '09:00' });
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

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>부모님 안부 케어 시스템</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        등록한 시간이 되면 서버가 자동으로 전화를 발신합니다.
      </p>

      <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <input
          placeholder="부모님 성함"
          value={form.parent_name}
          onChange={e => setForm({ ...form, parent_name: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="전화번호 (+8210...)"
          value={form.phone_number}
          onChange={e => setForm({ ...form, phone_number: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="오늘의 루틴 (예: 혈압약 복용 체크)"
          value={form.routine_text}
          onChange={e => setForm({ ...form, routine_text: e.target.value })}
          style={inputStyle}
        />
        <textarea
          placeholder="AI 안내 멘트 (예: 아버님, 오늘 아침 혈압약 챙기실 시간이에요!)"
          value={form.call_message}
          onChange={e => setForm({ ...form, call_message: e.target.value })}
          rows={2}
          style={{ ...inputStyle, resize: 'none' }}
        />
        <input
          type="time"
          value={form.call_time}
          onChange={e => setForm({ ...form, call_time: e.target.value })}
          style={inputStyle}
        />
        <button onClick={handleSave} disabled={loading} style={buttonStyle}>
          {loading ? '저장 중...' : '루틴 저장'}
        </button>
      </div>

      <h3 style={{ fontSize: 15, marginBottom: 8 }}>등록된 루틴 목록</h3>
      {routines.length === 0 && (
        <p style={{ fontSize: 13, color: '#999' }}>등록된 루틴이 없습니다.</p>
      )}
      {routines.map(r => (
        <div key={r.id} style={cardStyle}>
          <div style={{ fontWeight: 600 }}>{r.parent_name} 님 · {r.call_time}</div>
          <div style={{ fontSize: 13, color: '#666' }}>{r.phone_number}</div>
          <div style={{ fontSize: 13, color: '#444', marginTop: 4 }}>{r.routine_text}</div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>상태: {r.last_status}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => handleCallNow(r.id)} style={smallButtonStyle}>지금 발신 테스트</button>
            <button onClick={() => handleDelete(r.id)} style={{ ...smallButtonStyle, background: '#fee2e2', color: '#dc2626' }}>삭제</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  marginBottom: 8,
  border: '1px solid #ddd',
  borderRadius: 8,
  fontSize: 14,
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: 10,
  background: '#4f46e5',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  cursor: 'pointer',
};

const smallButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  background: '#eef2ff',
  color: '#4f46e5',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #eee',
  borderRadius: 10,
  padding: 12,
  marginBottom: 10,
};
