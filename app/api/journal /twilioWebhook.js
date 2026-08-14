// backend/routes/twilioWebhook.js
const express = require("express");
const router = express.Router();
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const db = require("../db");
const { buildCallOpening } = require("../services/memoryEngine");
const { generateCallout } = require("../services/aiAnalysis"); // 아래 turn2용 함수 추가 필요

// 턴 1: 전화 연결되자마자 - 오프닝 멘트 + 질문 던지고 답변(Gather speech) 대기
router.post("/webhook/twilio/voice", async (req, res) => {
  const entryId = req.query.entryId;
  const { rows } = await db.query(`SELECT * FROM journal_entries WHERE id = $1`, [entryId]);
  const entry = rows[0];

  const { opening_line, intensity } = await buildCallOpening(entry.user_id, entry);

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    action: `/webhook/twilio/voice/turn2?entryId=${entryId}&intensity=${intensity}`,
    speechTimeout: "auto",
    language: "ko-KR",
  });
  gather.say({ language: "ko-KR" }, `${opening_line} 왜 그랬는지 한번 말해봐.`);

  // 응답 없으면 그냥 마무리 멘트로 종료
  twiml.say({ language: "ko-KR" }, "말 안 하는 것도 답이네. 다음엔 진짜로 해보자.");
  res.type("text/xml").send(twiml.toString());
});

// 턴 2: 사용자 답변(변명) 받아서 → 과거 기억과 연결한 팩폭 → 통화 종료
router.post("/webhook/twilio/voice/turn2", async (req, res) => {
  const { entryId, intensity } = req.query;
  const userSpeech = req.body.SpeechResult ?? "";

  const { rows } = await db.query(`SELECT * FROM journal_entries WHERE id = $1`, [entryId]);
  const entry = rows[0];

  const callout = await generateCallout({
    userSpeech,
    contradictions: entry.contradictions,
    intensity,
  });

  await db.query(`UPDATE journal_entries SET ai_callout = $1 WHERE id = $2`, [callout, entryId]);

  const twiml = new VoiceResponse();
  twiml.say({ language: "ko-KR" }, callout);
  twiml.say({ language: "ko-KR" }, "오늘 얘기는 여기까지. 결과는 앱에서 확인해.");
  res.type("text/xml").send(twiml.toString());
});

// 통화 종료 상태 콜백 (duration, status 기록 + UserMemory 갱신 트리거)
router.post("/webhook/twilio/status", async (req, res) => {
  const { entryId } = req.query;
  const { CallStatus, CallDuration } = req.body;

  const { rows } = await db.query(
    `UPDATE journal_entries SET call_status = $1, call_duration = $2 WHERE id = $3 RETURNING *`,
    [CallStatus, CallDuration, entryId]
  );

  const entry = rows[0];
  if (entry && CallStatus === "completed") {
    const { updateUserMemory } = require("../services/memoryEngine");
    await updateUserMemory(entry.user_id, entry); // 비동기 fire-and-forget 해도 무방
  }

  res.sendStatus(200);
});

module.exports = router;
