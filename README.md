# YONGAME WORLDS 2026 — 결과 공개 페이지 v5

기존에 정상 운영 중인 **승부예측 제출(v3)** 과 **Google Sheets 자동 채점(v4)** 기능을 유지한 채, 결과 공개 전용 페이지와 안전한 읽기 전용 API를 추가한 버전입니다.

## 구성

| 파일 | 설치 장소 | 역할 |
|---|---|---|
| `index.html` | GitHub 저장소 루트 | 기존 제출 페이지 + `results.html` 링크 + 제출 상태 표시 |
| `styles.css` | GitHub 저장소 루트 | 기존 제출 페이지 스타일 + 마감 알림 |
| `script.js` | GitHub 저장소 루트 | 기존 제출 JS + 공개 상태에 따른 제출 화면 상태 |
| `results.html` | GitHub 저장소 루트 | **신규** 결과 공개 페이지 |
| `results.css` | GitHub 저장소 루트 | **신규** 결과 페이지 스타일 |
| `results.js` | GitHub 저장소 루트 | **신규** 순위표, 결과지, 상위 3명 비교 UI |
| `Code.gs` | **운영 중인 Apps Script 편집기** | 기존 제출/발급/채점 + 공개 API 및 공개 설정 |
| `test_public_api.cjs` | 로컬 테스트 전용 | Node.js 모의 Google Sheet 회귀 테스트; 배포 불필요 |

원본 `Codes`, `Predictions`, `Settings`, `Results`, `Scores`, `ScoreDetails`의 **열 구성과 기존 데이터는 변경하지 않습니다.**

## 적용 순서

1. 운영 중인 Google Apps Script `Code.gs`를 복사하여 **백업**합니다.
2. 제공된 `Code.gs` 전체를 현재 Apps Script에 붙여넣어 교체합니다. **서로 다른 버전의 코드를 이어붙이지 않습니다.**
3. Apps Script 함수 선택 메뉴에서 `setupPublicResultsSettings`를 **1회 실행**합니다.
4. `Settings`에 아래 키가 없었다면 생성되어 모두 **FALSE**로 설정됩니다. 이미 값이 있다면 보존합니다.
   ```text
   submission_open       TRUE    # 기존 설정 (현재 접수 중이라면)
   predictions_visible   FALSE   # 새로운 설정
   leaderboard_visible   FALSE   # 새로운 설정
   ```
5. **배포 → 배포 관리 → 기존 웹앱 편집 → 새 버전 → 배포**합니다. 새 배포를 따로 만들지 않고 기존 배포를 업데이트하면 기존 `/exec` URL을 유지하므로 Discord 봇/제출 페이지를 변경할 필요가 없습니다.
6. GitHub 저장소의 루트에 `index.html`, `styles.css`, `script.js`, `results.html`, `results.css`, `results.js`를 올립니다.
7. `https://airliyel.github.io/YongameWorlds2026/results.html`에서 **결과 공개 전** 안내 메시지를 확인합니다. 접수가 열려 있는 동안에는 데이터를 반환하지 않습니다.

> **URL 확인:** 제공된 `script.js`와 `results.js`에는 이전에 사용한 Apps Script `/exec` URL이 기입되어 있습니다. 웹앱 주소가 달라졌다면 두 파일의 `WEB_APP_URL`을 각각 교체해야 합니다. Google Sheet ID 또는 Shared Secret 값은 공개 GitHub JS에 넣지 마세요.

## 대회 개막 후 결과 공개

1. 아직 데이터가 접수 중일 때는 **공개 설정을 켜지 않습니다.**
2. 마감 시 운영 중인 Apps Script에서 `closeSubmissionsAndPublishResults` 함수를 직접 **1회 실행**합니다.
3. 이 함수는 순서대로 다음 작업을 수행합니다.
   - `submission_open = FALSE`로 전환
   - `recalculateScores()` 실행 (최신 점수 반영)
   - `predictions_visible = TRUE`로 전환
   - `leaderboard_visible = TRUE`로 전환
4. `results.html`을 새로고침하면 순위와 참가자별 결과지가 나타납니다.
5. 공개를 즉시 중단하려면 `hidePublishedResults()`를 Apps Script에서 실행합니다. 이 함수는 제출 상태를 바꾸지 않습니다.

설정을 수동으로 변경할 수도 있습니다. 결과 공개에는 **`submission_open=FALSE` AND `predictions_visible=TRUE` AND `leaderboard_visible=TRUE` 세 조건이 모두 필요**합니다.

> 공개 후 브라우저에 이미 수신된 데이터는 되돌릴 수 없으므로 운영 시점을 결정한 후에 공개하세요.

## 공개 페이지 기능

- 현재 상위 3명 점수 표시. 동점 순위는 v4 `Scores` 계산 결과를 그대로 이용.
- 전체 참가자 닉네임 검색/순위 확인; 참가자를 클릭하면 문항별 예측 결과지 표시.
- 현재까지 **확정된 배점**(예: 17/21)과 17문항 각 정답·부분점수·오답·미확정 구분.
- 상위 3명과 **선택한 참가자**(‘나’)의 예측을 표로 비교.
- 같은 닉네임이 여럿인 경우 공개 참가자 ID (`P-00001` 등)로 구분.
- 기존 `localStorage`에 제출 닉네임이 있고 참가자 목록 중 **해당 닉네임이 유일하면** 기본 비교 대상으로 사용; 그렇지 않으면 사용자가 선택. **이 동작은 로그인/소유 확인 기능이 아닙니다.**
- 팀 로고는 기존 LoL Esports CDN을 이용하며 이미지 로딩에 실패하면 팀 약칭으로 대체.

## 공개 API

```text
GET https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?action=public_results
```

### 비공개 상태

```json
{
  "ok": false,
  "code": "NOT_PUBLIC",
  "message": "아직 예측 제출 기간입니다. 제출 마감 이후 결과가 공개됩니다.",
  "submissionOpen": true,
  "predictionsVisible": false,
  "leaderboardVisible": false
}
```

### 공개 상태

```json
{
  "ok": true,
  "version": "2026-10-13-v5",
  "confirmedPoints": 3,
  "confirmedQuestions": 1,
  "questions": [{"key":"playinTeam","label":"플레이인 진출팀","kind":"PLAYIN","points":3,"confirmed":true,"answer":"KC"}],
  "players": [{"id":"P-00001","nickname":"Player A","rank":1,"score":3,"fullCorrect":1,"predictions":{"playinTeam":"KC"},"points":{"playinTeam":3}}]
}
```

위 JSON은 **응답 구조를 보여주는 축약 예시**입니다. 실제 반환 데이터에는 17문항 전체가 포함됩니다. 제출 코드, Discord ID, 비밀키, 서버 제출 시각, Google Sheet ID는 응답에 포함되지 않습니다.

## 운영 중 정답 수정 및 오류 대응

- `Results`의 C열 정답을 수정하면 기존 v4 설치형 `handleScoringEdit` 트리거가 `Scores`/`ScoreDetails`를 갱신합니다.
- `SCORES_STALE`가 반환되면 Apps Script 편집기에서 **`recalculateScores()`를 직접 실행**한 뒤 다시 확인하세요. 정답 변경은 감지되었지만 점수가 재계산되지 않은 경우, 오래된 점수를 공개하지 않도록 한 보호 동작입니다.
- 브라우저에서 `TypeError: Failed to fetch` 등이 발생하면 `/exec` 배포 URL, 웹앱 접근 권한(`모든 사용자`), 브라우저 개발자 도구의 Network/Console을 확인하세요. Google Apps Script Content Service의 리디렉션 및 CORS 처리는 실서비스 브라우저에서 별도 확인이 필요합니다.
- `P-00001` 공개 ID는 v4와 호환성을 위해 `Predictions` 행 순서에서 만들어지므로, 참가자 모집 후 **Predictions 시트의 행을 수동으로 정렬/삭제하지 마세요.**
- 참가자 수가 매우 많아지면 전체 데이터를 한 번에 가져오는 현재 API를 페이지네이션/캐시 방식으로 확장하는 것이 좋습니다.

## 테스트

```bash
node test_public_api.cjs
```

테스트 내용: 17개 문항과 80점 채점, 비공개 차단, 공개 시 닉네임·점수·정답 반환, 제출코드/Secret 비노출, 점수 변경 시 API 갱신, 채점 불일치 차단. **실제 Google Sheets를 변경하지 않는 모의 테스트**이며, 실제 서비스 공개 전 브라우저 테스트는 별도로 필요합니다.
