// backend/jobs/retentionScheduler.js
// 참고: intensity/pro배너 판단 로직 자체는 memoryEngine.buildCallOpening()에서 실시간 계산됨.
// 이 잡은 "통화를 안 받거나 며칠째 접속 안 한 사용자"에게 리마인드 푸시/문자를 보내는 별도 배치용.

const db = require("../db");
const twilioClient = require("twilio")(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

async function nudgeInactiveUsers() {
  const { rows } = await db.query(`
    SELECT u.id, u.phone, m.entry_count, m.pattern_summary
    FROM users u
    JOIN user_memory m ON m.user_id = u.id
    WHERE m.updated_at < now() - interval '2 days'
  `);

  for (const user of rows) {
    const msg =
      user.entry_count >= 3
        ? `아직도 그 핑계 그대로야? 오늘도 한마디 해줄게.`
        : `오늘 머릿속에 있는 거, 한마디만 해봐.`;

    await twilioClient.messages.create({
      to: user.phone,
      from: process.env.TWILIO_FROM_NUMBER,
      body: msg,
    });
  }
}

module.exports = { nudgeInactiveUsers };
