// backend/routes/journal.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const twilioClient = require("twilio")(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
const { analyzeTranscript } = require("../services/aiAnalysis");
const { transcribeAudio } = require("../services/stt"); // 기존 STT 인프라 재사용

// 1) 녹음 업로드 → STT → 분석 → 저장
router.post("/journal", async (req, res) => {
  const { userId, audioUrl } = req.body;

  const transcript = await transcribeAudio(audioUrl);
  const analysis = await analyzeTranscript(transcript);

  const { rows } = await db.query(
    `INSERT INTO journal_entries
       (user_id, audio_url, transcript, excuses, intentions, contradictions, ai_callout)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      userId,
      audioUrl,
      transcript,
      analysis.excuses,
      analysis.intentions,
      analysis.contradictions,
      analysis.ai_callout_seed,
    ]
  );

  // "방금 네 얘기를 듣고, 할 말이 생겼어" 화면에서 바로 이 id를 들고 다음 단계(전화번호 입력)로 이동
  res.json({ entryId: rows[0].id, hookReady: true });
});

// 2) 전화번호 입력 후 실제 발신
router.post("/journal/:id/call", async (req, res) => {
  const { id } = req.params;
  const { phoneNumber } = req.body;

  const call = await twilioClient.calls.create({
    to: phoneNumber,
    from: process.env.TWILIO_FROM_NUMBER,
    url: `${process.env.BASE_URL}/webhook/twilio/voice?entryId=${id}`,
    statusCallback: `${process.env.BASE_URL}/webhook/twilio/status?entryId=${id}`,
    statusCallbackEvent: ["completed"],
  });

  await db.query(
    `UPDATE journal_entries SET call_status = 'ringing', call_sid = $1 WHERE id = $2`,
    [call.sid, id]
  );

  res.json({ callStatus: "ringing", callSid: call.sid });
});

// 3) 결과 & 히스토리 조회
router.get("/journal", async (req, res) => {
  const { userId } = req.query;
  const { rows } = await db.query(
    `SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [userId]
  );
  res.json(rows);
});

module.exports = router;
