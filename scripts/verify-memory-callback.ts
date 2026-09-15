
import { sendDueMemoryCallbacks } from "../lib/memoryCallbackEngine";

async function main() {
  console.log("[verify] sendDueMemoryCallbacks(true) 실행 시작...");
  const results = await sendDueMemoryCallbacks(true);
  console.log("[verify] ==== dryRun 결과 (원본 JSON, 가공 없음) ====");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error("[verify] 실행 중 예외:", e);
  process.exit(1);
});
