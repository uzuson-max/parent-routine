'use client';
import { useState, useEffect } from 'react';

interface Entry {
  id: string;
  user_phone: string;
  transcript: string;
  analysis: { type: string; summary: string; call_line: string } | null;
  call_state: string;
  call_status: string | null;
  created_at: string;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    fetch('/api/voice/history')
      .then(res => res.json())
      .then(json => { if (json.success) setEntries(json.data); });
  }, []);

  const dayLabel = (dateStr: string) => new Date(dateStr).toLocaleDateString('ko-KR');

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-8">
      <h1 className="text-lg font-bold mb-4">기록</h1>
      <div className="space-y-3">
        {entries.map(e => (
          <div key={e.id} className="bg-slate-900 rounded-xl p-4">
            <div className="text-xs text-slate-500 mb-1">{dayLabel(e.created_at)}</div>
            <div className="text-sm text-slate-300 mb-2">"{e.transcript || '분석 중...'}"</div>
            {e.analysis && (
              <div className="text-sm font-semibold text-indigo-400 mb-1">
                💬 {e.analysis.call_line}
              </div>
            )}
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-0.5 bg-slate-800 rounded">{e.call_state}</span>
              {e.call_status && <span className="px-2 py-0.5 bg-slate-800 rounded">{e.call_status}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
