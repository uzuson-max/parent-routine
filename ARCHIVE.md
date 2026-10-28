# 보관 중인 기능 (2026-10-28 내레이터 버전 전환)

참견이를 "주인공을 해설하는 수달 내레이터"로 재포장하면서, 아래 기능은 화면 흐름에서 뺐다.
**파일은 지우지 않았다.** 나중에 다른 서비스에서 다시 쓸 수 있게 그대로 둔다.

## 화면 흐름에서 뺀 것
| 기능 | 주요 파일 |
|---|---|
| 어항 홈(물고기 쌓이기, 심해, 지나가는 생물) | `app/screens/TimelineScreen.tsx`, `components/FishTank.tsx`, `components/DeepSea.tsx`, `components/Sea*.tsx`, `lib/seaGrowth.ts`, `lib/seaSound.ts` |
| 소라 징검다리 (30일 질문 여행, 나를 알아가기) | `app/screens/RiverScreen.tsx`, `components/SoraTalk.tsx`, `components/SoraNim.tsx`, `lib/stage.ts`, `lib/stageServer.ts`, `app/api/stage/*` |
| 참견이 편지 탭 | `app/screens/LettersScreen.tsx`, `lib/letters.ts` |
| 걱정 병 | `app/screens/WorriesScreen.tsx`, `lib/worryBottles.ts` |
| 지난 어항 / 캘린더 / 발견 | `app/screens/ArchiveScreen.tsx`, `CalendarScreen.tsx`, `DiscoveryScreen.tsx` |
| 옛 디자인 녹음·확인·전화 화면 | `RecordingScreen`, `TankRecordingScreen`, `ConfirmScreen`, `MessageScreen`, `CallingScreen`, `ResultScreen` 등 |
| 예전 응답 엔진 (반말 참견) | `lib/responseEngine.ts`, `lib/response/*` |

## 새로 쓰는 것
- `app/page.tsx` — 온보딩 → 체크리스트 → 참견이 / 지난 이야기 두 탭
- `app/screens/HeroScreen.tsx` — 큰 수달 + 게임 대화창, 수달 꾹 눌러 말하기
- `app/screens/ChronicleScreen.tsx` — 지난 해설을 장(날짜)별로 모아보기
- `lib/narrator.ts` — 3인칭 무협 내레이션 엔진 + 다짐 장부(voice_entries.response jsonb 안, 스키마 변경 없음)
- `app/api/narrator/opening/route.ts` — 앱을 켰을 때 참견이가 먼저 하는 해설

## 되돌리기
`app/api/voice/upload/route.ts` 7번째 줄 import를 `import { generateResponse } from '@/lib/responseEngine';`로 바꾸면 예전 엔진으로 돌아간다.
