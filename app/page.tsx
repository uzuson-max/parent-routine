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
    parent_name: '', phone_number: '', routine_text: '', call_message: '', call_time: '09:00',
  });
  const [routines, setRoutines] = useState<Routine[]>([]);

  const loadRoutines = async () => {
    const res = await fetch('/api/routines');
    const json = await res.json();
    if (json.success) setRoutines(json.data);
  };

  useEffect(() => { loadRoutines(); }, []);

  const handleSave = async () => {
    const res = await fetch('/api/routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
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

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>부모님 안부 케어 시스템</h1>

      <input placeholder="부모님 성함" value={form.parent_name}
        onChange={e => setForm({ ...form, parent_name: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }} />
      <input placeholder="전화번호 (+8210...)" value={form.phone_number}
        onChange={e => setForm({ ...form, phone_number: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }} />
      <input placeholder="오늘의 루틴" value={form.routine_text}
        onChange={e => setForm({ ...form, routine_text: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }} />
      <textarea placeholder="AI 안내 멘트" value={form.call_message}
        onChange={e => setForm({ ...form, call_message: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }} />
      <input type="time" value={form.call_time}
        onChange={e => setForm({ ...form, call_time: e.target.value })} style={{ display: 'block', width: '100%', marginBottom: 8 }} />

      <button onClick={handleSave} style={{ width: '100%', padding: 10 }}>루틴 저장</button>

      <h3 style={{ marginTop: 32 }}>등록된 루틴 목록</h3>
      {routines.map(r => (
        <div key={r.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div><strong>{r.parent_name}</strong> · {r.phone_number} · {r.call_time}</div>
          <div style={{ fontSize: 13, color: '#666' }}>{r.routine_text} — 상태: {r.last_status}</div>
          <button onClick={() => handleCallNow(r.id)} style={{ marginTop: 8 }}>지금 발신 테스트</button>
        </div>
      ))}
    </div>
  );
}
