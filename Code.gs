/**
 * 2026 YONGAME'S PICK'EM
 * Google Apps Script backend v4 - scoring
 *
 * Script Properties:
 * - WORLDS_PICKEM_BOT_SECRET : Discord bot과 공유하는 비밀키
 * - PICKEM_SPREADSHEET_ID    : 승부예측 데이터를 저장할 Google Spreadsheet ID
 *
 * setupSheets()를 한 번 실행한 뒤 웹 앱을 새 버전으로 배포하세요.
 */

const CONFIG = {
  CODES_SHEET: "Codes",
  PREDICTIONS_SHEET: "Predictions",
  SETTINGS_SHEET: "Settings",

  BOT_SECRET_PROPERTY: "WORLDS_PICKEM_BOT_SECRET",
  SPREADSHEET_ID_PROPERTY: "PICKEM_SPREADSHEET_ID",

  CODE_PATTERN: /^YG26-\d{4}$/,
  SWISS_TEAM_COUNT: 8,
  LOCK_TIMEOUT_MS: 10000,
};

const TEAM_IDS = [
  "GEN", "HLE", "T1", "DK",
  "AL", "BLG", "TES", "IG",
  "G2", "MKOI", "KC",
  "TLAW", "LYON", "C9",
  "TSW", "CFO", "MVK",
  "LOS", "FUR",
];

const PLAYIN_TEAM_IDS = ["KC", "C9", "MVK", "FUR"];
const LCK_TEAM_IDS = ["GEN", "HLE", "T1", "DK"];

const CODES_HEADERS = [
  "code",
  "discord_user_id",
  "issued_at",
  "used_at",
  "nickname",
  "discord_display_name",
  "discord_username",
];

const PREDICTION_HEADERS = [
  "server_submitted_at",
  "code",
  "nickname",
  "playin_team",
  "swiss_teams",
  "three_zero_team_1",
  "three_zero_team_2",
  "champion",
  "runner_up",
  "semifinal_loser_1",
  "semifinal_loser_2",
  "pentakill",
  "final_mvp",
  "final_score",
  "faker_ahri",
  "uzi_kaisa",
  "caps_tristana",
  "backdoor",
  "baron_steal",
  "elder_steal",
  "lck_champion",
  "best_lck",
  "client_submitted_at",
];

const REQUIRED_FIELDS = [
  "nickname",
  "submitCode",
  "playinTeam",
  "threeZeroTeam1",
  "threeZeroTeam2",
  "champion",
  "runnerUp",
  "semifinalLoser1",
  "semifinalLoser2",
  "pentakill",
  "finalMvp",
  "finalScore",
  "fakerAhri",
  "uziKaisa",
  "capsTristana",
  "backdoor",
  "baronSteal",
  "elderSteal",
  "lckChampion",
  "bestLck",
];

function doPost(e) {
  try {
    const payload = parsePayload_(e);

    switch (payload.action) {
      case "submit_prediction":
        return submitPrediction_(payload);

      case "issue_code":
        return issueDiscordCode_(payload);

      default:
        return json_({
          ok: false,
          code: "INVALID_ACTION",
          message: "지원하지 않는 요청입니다.",
        });
    }
  } catch (error) {
    console.error(error);

    if (error && error.stack) {
      console.error(error.stack);
    }

    return json_({
      ok: false,
      code: "SERVER_ERROR",
      message: String(error && error.message ? error.message : error),
    });
  }
}

function doGet(e) {
  try {
    const action = e && e.parameter ? String(e.parameter.action || "") : "";
    if (action === "public_results") return getPublicResults_();
    return json_({
      ok: true,
      service: "YONGAME Worlds 2026 Pick'em",
      version: "2026-10-13-v5",
      submissionOpen: isSubmissionOpen_(),
      teamCount: TEAM_IDS.length,
    });
  } catch (error) {
    console.error(error);
    if (error && error.stack) console.error(error.stack);
    return json_({
      ok: false,
      code: "SERVER_ERROR",
      message: "공개 결과를 조회할 수 없습니다. 운영진에게 문의해 주세요.",
    });
  }
}

/**
 * 최초 1회 실행.
 * 바운드 Spreadsheet에서 실행할 경우 현재 Spreadsheet ID를 자동 저장한다.
 */
function setupSheets() {
  const active = SpreadsheetApp.getActiveSpreadsheet();

  if (active) {
    PropertiesService.getScriptProperties().setProperty(
      CONFIG.SPREADSHEET_ID_PROPERTY,
      active.getId()
    );
  }

  const ss = getSpreadsheet_();

  ensureSheet_(ss, CONFIG.CODES_SHEET, CODES_HEADERS);
  ensureSheet_(ss, CONFIG.PREDICTIONS_SHEET, PREDICTION_HEADERS);

  const settings = ensureSheet_(
    ss,
    CONFIG.SETTINGS_SHEET,
    ["key", "value"]
  );

  const values = settings.getDataRange().getValues();

  const hasSubmissionOpen = values.some(
    (row) => String(row[0]).trim() === "submission_open"
  );

  if (!hasSubmissionOpen) {
    settings.appendRow(["submission_open", "TRUE"]);
  }

  SpreadsheetApp.flush();
}

function setSpreadsheetId(spreadsheetId) {
  const id = cleanText_(spreadsheetId);

  if (!id) {
    throw new Error("Spreadsheet ID가 비어 있습니다.");
  }

  SpreadsheetApp.openById(id);

  PropertiesService.getScriptProperties().setProperty(
    CONFIG.SPREADSHEET_ID_PROPERTY,
    id
  );
}

/**
 * 초기 운영용 미할당 코드 생성.
 * 예: generateSubmissionCodes(30)
 */
function generateSubmissionCodes(count) {
  const numberOfCodes = Number(count);

  if (
    !Number.isInteger(numberOfCodes) ||
    numberOfCodes < 1 ||
    numberOfCodes > 1000
  ) {
    throw new Error("count는 1~1000 사이 정수여야 합니다.");
  }

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.CODES_SHEET);

  if (!sheet) {
    throw new Error("Codes 시트가 없습니다. setupSheets()를 먼저 실행해 주세요.");
  }

  const existingSet = getExistingCodeSet_(sheet);
  const generatedRows = [];
  let attempts = 0;

  while (generatedRows.length < numberOfCodes) {
    attempts += 1;

    if (attempts > 50000) {
      throw new Error("사용 가능한 제출코드를 충분히 생성하지 못했습니다.");
    }

    const code = createRandomCode_();

    if (existingSet.has(code)) {
      continue;
    }

    existingSet.add(code);

    generatedRows.push([
      code,
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  const startRow = sheet.getLastRow() + 1;

  sheet
    .getRange(startRow, 1, generatedRows.length, CODES_HEADERS.length)
    .setNumberFormat("@");

  sheet
    .getRange(startRow, 1, generatedRows.length, CODES_HEADERS.length)
    .setValues(generatedRows);

  SpreadsheetApp.flush();

  return generatedRows.map((row) => row[0]);
}

function setSubmissionOpen(open) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);

  if (!sheet) {
    throw new Error("Settings 시트가 없습니다. setupSheets()를 먼저 실행해 주세요.");
  }

  const data = sheet.getDataRange().getValues();

  for (let row = 1; row < data.length; row += 1) {
    if (String(data[row][0]).trim() === "submission_open") {
      sheet.getRange(row + 1, 2).setValue(open ? "TRUE" : "FALSE");
      SpreadsheetApp.flush();
      return;
    }
  }

  sheet.appendRow(["submission_open", open ? "TRUE" : "FALSE"]);
  SpreadsheetApp.flush();
}

/**
 * Discord /승부의신 명령에서 호출한다.
 * 동일 Discord 사용자에게는 기존 코드를 다시 반환한다.
 */
function issueDiscordCode_(payload) {
  const configuredSecret = PropertiesService
    .getScriptProperties()
    .getProperty(CONFIG.BOT_SECRET_PROPERTY);

  if (!configuredSecret) {
    return json_({
      ok: false,
      code: "BOT_SECRET_NOT_CONFIGURED",
      message: `${CONFIG.BOT_SECRET_PROPERTY}이 설정되지 않았습니다.`,
    });
  }

  if (String(payload.botSecret || "") !== configuredSecret) {
    return json_({
      ok: false,
      code: "UNAUTHORIZED",
      message: "승부예측 코드 발급 권한이 없습니다.",
    });
  }

  const discordUserId = cleanText_(payload.discordUserId);
  const discordDisplayName = cleanText_(payload.discordDisplayName);
  const discordUsername = cleanText_(payload.discordUsername);

  if (!/^\d{15,25}$/.test(discordUserId)) {
    return json_({
      ok: false,
      code: "INVALID_DISCORD_USER_ID",
      message: "Discord 사용자 ID 형식이 올바르지 않습니다.",
    });
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  } catch (_) {
    return json_({
      ok: false,
      code: "BUSY",
      message: "현재 다른 코드 발급 요청을 처리하고 있습니다.",
    });
  }

  try {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(CONFIG.CODES_SHEET);

    if (!sheet) {
      throw new Error("Codes 시트가 없습니다. setupSheets()를 실행해 주세요.");
    }

    const existingRow = findDiscordUserRow_(sheet, discordUserId);

    if (existingRow) {
      const existingCode = normalizeCode_(
        sheet.getRange(existingRow, 1).getDisplayValue()
      );

      if (!CONFIG.CODE_PATTERN.test(existingCode)) {
        throw new Error("기존 Discord 사용자 행의 제출코드 형식이 올바르지 않습니다.");
      }

      sheet.getRange(existingRow, 6).setValue(safeCell_(discordDisplayName));
      sheet.getRange(existingRow, 7).setValue(safeCell_(discordUsername));
      SpreadsheetApp.flush();

      return json_({
        ok: true,
        code: "CODE_EXISTS",
        submitCode: existingCode,
        existing: true,
      });
    }

    let targetRow = findAvailableCodeRow_(sheet);
    let submitCode = "";

    if (targetRow) {
      submitCode = normalizeCode_(
        sheet.getRange(targetRow, 1).getDisplayValue()
      );
    } else {
      submitCode = generateUniqueCode_(sheet);
      targetRow = sheet.getLastRow() + 1;

      sheet
        .getRange(targetRow, 1, 1, CODES_HEADERS.length)
        .setNumberFormat("@");

      sheet
        .getRange(targetRow, 1, 1, CODES_HEADERS.length)
        .setValues([[submitCode, "", "", "", "", "", ""]]);
    }

    const issuedAt = new Date();

    sheet.getRange(targetRow, 1).setNumberFormat("@");
    sheet.getRange(targetRow, 2).setNumberFormat("@");

    sheet.getRange(targetRow, 1).setValue(submitCode);
    sheet.getRange(targetRow, 2).setValue(discordUserId);
    sheet.getRange(targetRow, 3).setValue(issuedAt);
    sheet.getRange(targetRow, 6).setValue(safeCell_(discordDisplayName));
    sheet.getRange(targetRow, 7).setValue(safeCell_(discordUsername));

    SpreadsheetApp.flush();

    return json_({
      ok: true,
      code: "CODE_ISSUED",
      submitCode,
      existing: false,
      issuedAt: issuedAt.toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function submitPrediction_(payload) {
  if (!isSubmissionOpen_()) {
    return json_({
      ok: false,
      code: "SUBMISSION_CLOSED",
      message: "승부예측 제출이 마감되었습니다.",
    });
  }

  const missingField = findMissingField_(payload);

  if (missingField) {
    return json_({
      ok: false,
      code: "MISSING_FIELD",
      message: `필수 응답이 누락되었습니다: ${missingField}`,
    });
  }

  const code = normalizeCode_(payload.submitCode);

  if (!CONFIG.CODE_PATTERN.test(code)) {
    return json_({
      ok: false,
      code: "INVALID_CODE_FORMAT",
      message: "제출 코드 형식이 올바르지 않습니다.",
    });
  }

  const normalized = normalizeTeamPayload_(payload);
  const teamValidation = validateTeamPayload_(normalized);

  if (teamValidation) {
    return teamValidation;
  }

  if (!["yes", "no"].includes(String(payload.pentakill))) {
    return invalidValue_("pentakill");
  }

  if (!["3-0", "3-1", "3-2"].includes(String(payload.finalScore))) {
    return invalidValue_("finalScore");
  }

  for (const key of [
    "fakerAhri",
    "uziKaisa",
    "capsTristana",
    "backdoor",
    "baronSteal",
    "elderSteal",
    "lckChampion",
  ]) {
    if (!["yes", "no"].includes(String(payload[key]))) {
      return invalidValue_(key);
    }
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  } catch (_) {
    return json_({
      ok: false,
      code: "BUSY",
      message: "현재 다른 제출을 처리하고 있습니다.",
    });
  }

  try {
    const ss = getSpreadsheet_();
    const codesSheet = ss.getSheetByName(CONFIG.CODES_SHEET);
    const predictionsSheet = ss.getSheetByName(CONFIG.PREDICTIONS_SHEET);

    if (!codesSheet || !predictionsSheet) {
      throw new Error("필수 시트가 없습니다. setupSheets()를 실행해 주세요.");
    }

    const codeRow = findCodeRow_(codesSheet, code);

    if (!codeRow) {
      return json_({
        ok: false,
        code: "INVALID_CODE",
        message: "등록되지 않은 제출 코드입니다.",
      });
    }

    const assignedDiscordUserId = cleanText_(
      codesSheet.getRange(codeRow, 2).getDisplayValue()
    );

    if (!assignedDiscordUserId) {
      return json_({
        ok: false,
        code: "CODE_NOT_ISSUED",
        message: "Discord 봇을 통해 발급되지 않은 제출 코드입니다.",
      });
    }

    const usedAt = codesSheet.getRange(codeRow, 4).getValue();

    if (usedAt) {
      return json_({
        ok: false,
        code: "ALREADY_SUBMITTED",
        message: "이미 사용된 제출 코드입니다.",
      });
    }

    if (predictionExists_(predictionsSheet, code)) {
      codesSheet.getRange(codeRow, 4).setValue(new Date());

      return json_({
        ok: false,
        code: "ALREADY_SUBMITTED",
        message: "이미 사용된 제출 코드입니다.",
      });
    }

    const serverSubmittedAt = new Date();
    const nickname = cleanText_(payload.nickname);

    const row = [
      serverSubmittedAt,
      safeCell_(code),
      safeCell_(nickname),

      safeCell_(normalized.playinTeam),
      safeCell_(normalized.swissTeams.join("|")),

      safeCell_(normalized.threeZeroTeam1),
      safeCell_(normalized.threeZeroTeam2),

      safeCell_(normalized.champion),
      safeCell_(normalized.runnerUp),

      safeCell_(normalized.semifinalLoser1),
      safeCell_(normalized.semifinalLoser2),

      safeCell_(payload.pentakill),
      safeCell_(payload.finalMvp),
      safeCell_(payload.finalScore),

      safeCell_(payload.fakerAhri),
      safeCell_(payload.uziKaisa),
      safeCell_(payload.capsTristana),

      safeCell_(payload.backdoor),
      safeCell_(payload.baronSteal),
      safeCell_(payload.elderSteal),

      safeCell_(payload.lckChampion),
      safeCell_(normalized.bestLck),

      safeCell_(payload.clientSubmittedAt || ""),
    ];

    predictionsSheet.appendRow(row);

    codesSheet.getRange(codeRow, 4).setValue(serverSubmittedAt);
    codesSheet.getRange(codeRow, 5).setValue(safeCell_(nickname));

    SpreadsheetApp.flush();

    return json_({
      ok: true,
      code: "SUBMITTED",
      nickname,
      submittedAt: serverSubmittedAt.toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 팀 값은 실제 2026 Worlds 참가팀 ID인지 검사한다.
 * 단, 문항 간 논리 관계는 검사하지 않는다.
 * 예: champion과 runnerUp이 같아도 서버는 허용한다.
 */
function normalizeTeamPayload_(payload) {
  return {
    playinTeam: normalizeTeamId_(payload.playinTeam),

    swissTeams: Array.isArray(payload.swissTeams)
      ? payload.swissTeams.map(normalizeTeamId_)
      : [],

    threeZeroTeam1: normalizeTeamId_(payload.threeZeroTeam1),
    threeZeroTeam2: normalizeTeamId_(payload.threeZeroTeam2),

    champion: normalizeTeamId_(payload.champion),
    runnerUp: normalizeTeamId_(payload.runnerUp),

    semifinalLoser1: normalizeTeamId_(payload.semifinalLoser1),
    semifinalLoser2: normalizeTeamId_(payload.semifinalLoser2),

    bestLck: normalizeTeamId_(payload.bestLck),
  };
}

function validateTeamPayload_(payload) {
  if (!PLAYIN_TEAM_IDS.includes(payload.playinTeam)) {
    return json_({
      ok: false,
      code: "INVALID_PLAYIN_TEAM",
      message: "플레이-인 진출팀 값이 올바르지 않습니다.",
    });
  }

  if (
    !Array.isArray(payload.swissTeams) ||
    payload.swissTeams.length !== CONFIG.SWISS_TEAM_COUNT
  ) {
    return json_({
      ok: false,
      code: "INVALID_SWISS_COUNT",
      message: "스위스 → 녹아웃 진출팀은 정확히 8팀이어야 합니다.",
    });
  }

  if (
    payload.swissTeams.some((team) => !TEAM_IDS.includes(team)) ||
    new Set(payload.swissTeams).size !== CONFIG.SWISS_TEAM_COUNT
  ) {
    return json_({
      ok: false,
      code: "INVALID_SWISS_TEAMS",
      message: "스위스 → 녹아웃 진출팀은 실제 참가팀 중 서로 다른 8팀이어야 합니다.",
    });
  }

  for (const key of [
    "threeZeroTeam1",
    "threeZeroTeam2",
    "champion",
    "runnerUp",
    "semifinalLoser1",
    "semifinalLoser2",
  ]) {
    if (!TEAM_IDS.includes(payload[key])) {
      return json_({
        ok: false,
        code: "INVALID_TEAM",
        message: `유효하지 않은 팀 값입니다: ${key}`,
      });
    }
  }

  if (!LCK_TEAM_IDS.includes(payload.bestLck)) {
    return json_({
      ok: false,
      code: "INVALID_LCK_TEAM",
      message: "LCK 최강 예측은 GEN, HLE, T1, DK 중 하나여야 합니다.",
    });
  }

  return null;
}

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();

  let spreadsheetId = cleanText_(
    properties.getProperty(CONFIG.SPREADSHEET_ID_PROPERTY)
  );

  if (!spreadsheetId) {
    const active = SpreadsheetApp.getActiveSpreadsheet();

    if (active) {
      spreadsheetId = active.getId();
      properties.setProperty(CONFIG.SPREADSHEET_ID_PROPERTY, spreadsheetId);
    }
  }

  if (!spreadsheetId) {
    throw new Error(
      `${CONFIG.SPREADSHEET_ID_PROPERTY}이 설정되지 않았습니다. ` +
        "Spreadsheet에서 setupSheets()를 한 번 실행하거나 Script Properties에 직접 등록해 주세요."
    );
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function parsePayload_(e) {
  if (!e) {
    throw new Error(
      "HTTP 이벤트 객체가 없습니다. doPost()를 Apps Script 편집기에서 직접 실행하지 마세요."
    );
  }

  if (!e.postData) {
    throw new Error("POST 요청에 postData가 없습니다.");
  }

  if (!e.postData.contents) {
    throw new Error("POST body가 비어 있습니다.");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    throw new Error("POST body가 올바른 JSON이 아닙니다.");
  }
}

function findMissingField_(payload) {
  for (const key of REQUIRED_FIELDS) {
    if (cleanText_(payload[key]) === "") {
      return key;
    }
  }

  if (!Array.isArray(payload.swissTeams) || payload.swissTeams.length === 0) {
    return "swissTeams";
  }

  for (const team of payload.swissTeams) {
    if (cleanText_(team) === "") {
      return "swissTeams";
    }
  }

  return "";
}

function findDiscordUserRow_(sheet, discordUserId) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const userIds = sheet
    .getRange(2, 2, lastRow - 1, 1)
    .getDisplayValues()
    .flat();

  for (let index = 0; index < userIds.length; index += 1) {
    if (cleanText_(userIds[index]) === discordUserId) {
      return index + 2;
    }
  }

  return 0;
}

function findAvailableCodeRow_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const rows = sheet
    .getRange(2, 1, lastRow - 1, 4)
    .getDisplayValues();

  for (let index = 0; index < rows.length; index += 1) {
    const code = normalizeCode_(rows[index][0]);
    const discordUserId = cleanText_(rows[index][1]);
    const usedAt = cleanText_(rows[index][3]);

    if (
      CONFIG.CODE_PATTERN.test(code) &&
      discordUserId === "" &&
      usedAt === ""
    ) {
      return index + 2;
    }
  }

  return 0;
}

function generateUniqueCode_(sheet) {
  const existingSet = getExistingCodeSet_(sheet);

  for (let attempt = 0; attempt < 50000; attempt += 1) {
    const code = createRandomCode_();

    if (!existingSet.has(code)) {
      return code;
    }
  }

  throw new Error("사용 가능한 YG26-XXXX 제출코드를 생성하지 못했습니다.");
}

function createRandomCode_() {
  const suffix = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");

  return `YG26-${suffix}`;
}

function getExistingCodeSet_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return new Set();
  }

  const codes = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getDisplayValues()
    .flat()
    .map((value) => normalizeCode_(value))
    .filter(Boolean);

  return new Set(codes);
}

function findCodeRow_(sheet, code) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const codes = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getDisplayValues()
    .flat();

  for (let index = 0; index < codes.length; index += 1) {
    if (normalizeCode_(codes[index]) === code) {
      return index + 2;
    }
  }

  return 0;
}

function predictionExists_(sheet, code) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const codes = sheet
    .getRange(2, 2, lastRow - 1, 1)
    .getDisplayValues()
    .flat();

  return codes.some((value) => normalizeCode_(value) === code);
}

function isSubmissionOpen_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }

  const data = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 2)
    .getDisplayValues();

  for (const row of data) {
    if (String(row[0]).trim() === "submission_open") {
      return String(row[1]).trim().toUpperCase() === "TRUE";
    }
  }

  return false;
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  return sheet;
}

function normalizeCode_(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeTeamId_(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanText_(value) {
  return String(value ?? "").trim();
}

function safeCell_(value) {
  const text = cleanText_(value);

  if (/^[=+\-@]/.test(text)) {
    return `'${text}`;
  }

  return text;
}

function invalidValue_(field) {
  return json_({
    ok: false,
    code: "INVALID_VALUE",
    message: `허용되지 않은 값입니다: ${field}`,
  });
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * v4 - 운영자용 정답 입력 및 자동 채점
 *
 * 기존 Codes / Predictions / Settings는 변경하지 않습니다.
 * Results 정답 칸(C열)을 편집하면 onEdit 설치형 트리거가
 * Scores와 ScoreDetails를 현재 확정된 정답 기준으로 전면 재계산합니다.
 */
const SCORING_CONFIG = {
  RESULTS_SHEET: "Results",
  SCORES_SHEET: "Scores",
  DETAILS_SHEET: "ScoreDetails",
  ANSWER_COL: 3,
  STATUS_COL: 4,
  VALIDATION_COL: 7,
  ANSWER_CONFIRMED: "CONFIRMED",
  ANSWER_PENDING: "PENDING",
};

// 배점 합계 = 80. 기존 Predictions 시트의 컬럼과 순서를 변경하지 않습니다.
const SCORING_QUESTIONS = [
  { key: "playinTeam",      label: "플레이인 진출팀",           points: 3,  kind: "PLAYIN",    source: [3],     help: "KC / C9 / MVK / FUR 중 한 팀" },
  { key: "swissTeams",      label: "스위스 진출 8팀",          points: 16, kind: "TEAMS_8",   source: [4],     help: "서로 다른 8팀의 ID를 | 또는 , 로 구분. 예: GEN|HLE|T1|DK|AL|BLG|TES|IG" },
  { key: "threeZeroTeams",  label: "스위스 3-0 진출 2팀",      points: 6,  kind: "TEAMS_2",   source: [5, 6],  help: "서로 다른 2팀의 ID를 | 로 구분. 예: GEN|BLG" },
  { key: "champion",        label: "우승팀",                 points: 15, kind: "TEAM",      source: [7],     help: "참가팀 ID 하나. 예: GEN" },
  { key: "runnerUp",        label: "준우승팀",               points: 10, kind: "TEAM",      source: [8],     help: "참가팀 ID 하나. 예: T1" },
  { key: "semifinalLosers", label: "4강 탈락 2팀",            points: 8,  kind: "TEAMS_2",   source: [9, 10], help: "서로 다른 2팀의 ID를 | 로 구분. 예: BLG|HLE" },
  { key: "pentakill",       label: "펜타킬 발생",            points: 2,  kind: "YESNO",     source: [11],    help: "yes 또는 no. no는 대회 종료 후 확정 권장" },
  { key: "finalMvp",        label: "파이널 MVP",             points: 5,  kind: "PLAYER",    source: [12],    help: "선수명. 대소문자와 공백은 채점 시 무시" },
  { key: "finalScore",      label: "결승전 세트 점수",        points: 2,  kind: "SCORE",     source: [13],    help: "3-0 / 3-1 / 3-2 중 하나" },
  { key: "fakerAhri",       label: "Faker 아리 사용",         points: 1,  kind: "YESNO",     source: [14],    help: "yes 또는 no" },
  { key: "uziKaisa",       label: "Uzi 카이사 사용",         points: 1,  kind: "YESNO",     source: [15],    help: "yes 또는 no" },
  { key: "capsTristana",    label: "Caps 트리스타나 사용",    points: 1,  kind: "YESNO",     source: [16],    help: "yes 또는 no" },
  { key: "backdoor",        label: "백도어 승리",            points: 1,  kind: "YESNO",     source: [17],    help: "yes 또는 no. no는 대회 종료 후 확정 권장" },
  { key: "baronSteal",      label: "바론 스틸",              points: 1,  kind: "YESNO",     source: [18],    help: "yes 또는 no. no는 대회 종료 후 확정 권장" },
  { key: "elderSteal",      label: "장로 스틸",              points: 1,  kind: "YESNO",     source: [19],    help: "yes 또는 no. no는 대회 종료 후 확정 권장" },
  { key: "lckChampion",     label: "LCK 우승",              points: 3,  kind: "YESNO",     source: [20],    help: "yes 또는 no" },
  { key: "bestLck",         label: "LCK 최고 성적팀",         points: 4,  kind: "LCK",       source: [21],    help: "GEN / HLE / T1 / DK 중 하나. 동률의 경우 운영 기준에 따라 확정" },
];

const SCORING_RESULT_HEADERS = [
  "key", "문항", "정답 입력", "상태", "배점", "입력 안내", "검증 결과",
];
const SCORING_SCORE_HEADERS = [
  "순위", "참가자 ID", "닉네임", "현재 점수", "확정 배점 합계", "정답률", "전부 맞힌 문항", "집계 시각",
];
const SCORING_DETAIL_HEADERS = [
  "참가자 ID", "닉네임", "현재 점수",
].concat(SCORING_QUESTIONS.map((q) => `${q.label} (${q.points})`));

/**
 * 최초 1회 실행. 기존 제출 데이터는 수정하지 않습니다.
 * 이미 정답을 입력한 상태에서 재실행하더라도 해당 값들을 보존합니다.
 */
function setupScoringSheets() {
  const ss = getSpreadsheet_();
  // 같은 이름의 기존 탭이 다른 목적으로 쓰이고 있다면 중단합니다.
  // 기존 Codes/Predictions/Settings는 수정하지 않습니다.
  const sheetSpecs = [
    [SCORING_CONFIG.RESULTS_SHEET, SCORING_RESULT_HEADERS],
    [SCORING_CONFIG.SCORES_SHEET, SCORING_SCORE_HEADERS],
    [SCORING_CONFIG.DETAILS_SHEET, SCORING_DETAIL_HEADERS],
  ];
  for (const spec of sheetSpecs) {
    assertScoringSheetCompatible_(ss.getSheetByName(spec[0]), spec[1]);
  }

  const resultSheet = ensureSheet_(ss, SCORING_CONFIG.RESULTS_SHEET, SCORING_RESULT_HEADERS);
  const scoresSheet = ensureSheet_(ss, SCORING_CONFIG.SCORES_SHEET, SCORING_SCORE_HEADERS);
  const detailSheet = ensureSheet_(ss, SCORING_CONFIG.DETAILS_SHEET, SCORING_DETAIL_HEADERS);

  const prevRows = resultSheet.getLastRow() >= 2
    ? resultSheet.getRange(2, 1, resultSheet.getLastRow() - 1, 7).getValues()
    : [];
  const prevByKey = new Map(prevRows.map((r) => [String(r[0]).trim(), r]));

  const rows = SCORING_QUESTIONS.map((q) => {
    const prev = prevByKey.get(q.key);
    return [
      q.key,
      q.label,
      prev ? prev[2] : "",
      prev && prev[3] === SCORING_CONFIG.ANSWER_CONFIRMED
        ? SCORING_CONFIG.ANSWER_CONFIRMED
        : SCORING_CONFIG.ANSWER_PENDING,
      q.points,
      q.help,
      prev ? prev[6] : "대기",
    ];
  });

  const endRow = SCORING_QUESTIONS.length + 1;
  resultSheet.getRange(`C2:C${endRow}`).setNumberFormat("@");
  resultSheet.getRange(2, 1, rows.length, 7).setValues(rows);
  resultSheet.getRange(`D2:D${endRow}`).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([SCORING_CONFIG.ANSWER_PENDING, SCORING_CONFIG.ANSWER_CONFIRMED], true)
      .setAllowInvalid(false)
      .build()
  );
  // YES/NO, TEAM, SCORE 단일값의 경우 데이터 입력 실수 감소를 위해 드롭다운을 둡니다.
  for (let i = 0; i < SCORING_QUESTIONS.length; i += 1) {
    const q = SCORING_QUESTIONS[i];
    const row = i + 2;
    let choices = null;
    if (q.kind === "YESNO") choices = ["yes", "no"];
    if (q.kind === "SCORE") choices = ["3-0", "3-1", "3-2"];
    if (q.kind === "LCK") choices = LCK_TEAM_IDS;
    if (q.kind === "PLAYIN") choices = PLAYIN_TEAM_IDS;
    if (q.kind === "TEAM") choices = TEAM_IDS;
    if (choices) {
      resultSheet.getRange(row, 3).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(choices, true).setAllowInvalid(false).build()
      );
    }
    resultSheet.getRange(row, 3).setNote(q.help);
  }

  styleScoringSheet_(resultSheet, 7, [120, 230, 370, 120, 75, 550, 230]);
  styleScoringSheet_(scoresSheet, 8, [75, 115, 190, 105, 125, 95, 130, 175]);
  styleScoringSheet_(detailSheet, SCORING_DETAIL_HEADERS.length, null);

  resultSheet.getRange(`C2:C${endRow}`).setBackground("#fff6dc");
  resultSheet.getRange(`D2:D${endRow}`).setBackground("#fff6dc");
  scoresSheet.getRange("D2:E1000").setNumberFormat("0");
  scoresSheet.getRange("F2:F1000").setNumberFormat("0.0%");

  SpreadsheetApp.flush();
  const summary = recalculateScores();
  installScoringTrigger();
  return summary;
}

/** 같은 이름의 비관련 탭에 쓰지 않도록 헤더를 확인합니다. */
function assertScoringSheetCompatible_(sheet, headers) {
  if (!sheet || sheet.getLastRow() === 0) return;
  const old = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (old.some((v, i) => String(v) !== headers[i])) {
    throw new Error(
      `기존 ${sheet.getName()} 탭의 헤더가 채점용 형식과 다릅니다. ` +
      "기존 자료를 백업하고 해당 탭을 확인한 뒤 다시 실행해 주세요."
    );
  }
}

function styleScoringSheet_(sheet, headerColumns, widths) {
  const header = sheet.getRange(1, 1, 1, headerColumns);
  header.setFontWeight("bold");
  header.setFontColor("#ffffff");
  header.setBackground("#152b46");
  header.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 35);
  if (widths) widths.forEach((width, index) => sheet.setColumnWidth(index + 1, width));
  sheet.setFrozenRows(1);
}

/**
 * 동일 프로젝트에 설치형 트리거 하나만 유지.
 * 프로그램/Apps Script에 의한 값 수정은 Google Sheets onEdit을 호출하지 않으므로,
 * 그 경우에는 recalculateScores()를 수동 실행할 수 있습니다.
 */
function installScoringTrigger() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === "handleScoringEdit") {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  return ScriptApp.newTrigger("handleScoringEdit")
    .forSpreadsheet(getSpreadsheet_())
    .onEdit()
    .create();
}

function handleScoringEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== SCORING_CONFIG.RESULTS_SHEET) {
    return;
  }
  const range = e.range;
  const firstRow = Math.max(2, range.getRow());
  const lastRow = Math.min(SCORING_QUESTIONS.length + 1, range.getLastRow());
  if (firstRow > lastRow) return;

  const firstCol = range.getColumn();
  const lastCol = range.getLastColumn();
  const touchesAnswer = firstCol <= 3 && lastCol >= 3;
  const touchesStatus = firstCol <= 4 && lastCol >= 4;
  if (!touchesAnswer && !touchesStatus) return;

  const sheet = range.getSheet();
  if (touchesAnswer) {
    for (let row = firstRow; row <= lastRow; row += 1) {
      const key = sheet.getRange(row, 1).getDisplayValue();
      const q = SCORING_QUESTIONS.find((item) => item.key === key);
      if (!q) continue;
      const answer = sheet.getRange(row, 3).getDisplayValue();
      const check = validateScoringAnswer_(q, answer);
      sheet.getRange(row, 4).setValue(check.ok ? "CONFIRMED" : "PENDING");
    }
  }

  recalculateScores();
}

/**
 * 운영자가 직접 실행 가능. 확정된 답만 점수에 반영함.
 * 매 실행마다 전체 점수를 처음부터 계산하여 중복 합산을 방지.
 */
function recalculateScores() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return recalculateScoresUnlocked_();
  } finally {
    lock.releaseLock();
  }
}

function recalculateScoresUnlocked_() {
  const ss = getSpreadsheet_();
  const resultsSheet = ss.getSheetByName(SCORING_CONFIG.RESULTS_SHEET);
  const scoresSheet = ss.getSheetByName(SCORING_CONFIG.SCORES_SHEET);
  const detailSheet = ss.getSheetByName(SCORING_CONFIG.DETAILS_SHEET);
  const predictionsSheet = ss.getSheetByName(CONFIG.PREDICTIONS_SHEET);
  if (!resultsSheet || !scoresSheet || !detailSheet || !predictionsSheet) {
    throw new Error("채점 시트가 없습니다. setupScoringSheets()를 실행해 주세요.");
  }

  const rawResults = resultsSheet.getRange(2, 1, SCORING_QUESTIONS.length, 7).getDisplayValues();
  const resultByKey = new Map(rawResults.map((row) => [String(row[0]).trim(), row]));
  const confirmedByKey = new Map();
  const validationCells = [];
  let maxConfirmed = 0;

  for (let i = 0; i < SCORING_QUESTIONS.length; i += 1) {
    const q = SCORING_QUESTIONS[i];
    const sheetRow = resultByKey.get(q.key) || ["", "", "", "PENDING"];
    const typedAnswer = String(sheetRow[2] || "").trim();
    const status = String(sheetRow[3] || "").trim().toUpperCase();
    const check = validateScoringAnswer_(q, typedAnswer);
    if (typedAnswer && !check.ok) {
      validationCells.push([`입력 오류: ${check.message}`]);
    } else if (status === "CONFIRMED" && check.ok) {
      validationCells.push(["확정 · 채점 반영"]);
      confirmedByKey.set(q.key, check.normalized);
      maxConfirmed += q.points;
    } else if (status === "CONFIRMED" && !check.ok) {
      validationCells.push([`미반영: ${check.message}`]);
    } else {
      validationCells.push(["대기 · 채점 제외"]);
    }
  }
  const validationsByKey = new Map(SCORING_QUESTIONS.map((q, i) => [q.key, validationCells[i][0]]));
  resultsSheet.getRange(2, 7, rawResults.length, 1).setValues(
    rawResults.map((row) => [validationsByKey.get(String(row[0]).trim()) || "미등록 문항"])
  );

  const lastRow = predictionsSheet.getLastRow();
  const predictions = lastRow >= 2
    ? predictionsSheet.getRange(2, 1, lastRow - 1, PREDICTION_HEADERS.length).getDisplayValues()
    : [];

  const now = new Date();
  const detailRows = [];
  const summaries = [];

  for (let i = 0; i < predictions.length; i += 1) {
    const record = predictions[i];
    const code = cleanText_(record[1]);
    if (!CONFIG.CODE_PATTERN.test(normalizeCode_(code))) continue;
    const participantId = `P-${String(i + 1).padStart(5, "0")}`;
    const nickname = cleanText_(record[2]);
    let score = 0;
    let fullCorrect = 0;
    const detail = [];

    for (const q of SCORING_QUESTIONS) {
      if (!confirmedByKey.has(q.key)) {
        detail.push("");
        continue;
      }
      const answer = confirmedByKey.get(q.key);
      const earned = scoreSingleQuestion_(q, record, answer);
      score += earned;
      detail.push(earned);
      if (earned === q.points) fullCorrect += 1;
    }

    detailRows.push([participantId, nickname, score].concat(detail));
    summaries.push({participantId, nickname, score, fullCorrect, originalIndex:i});
  }

  summaries.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
  const scoresRows = summaries.map((s, i) => {
    const rank = i > 0 && s.score === summaries[i - 1].score
      ? (summaries[i - 1].rank || 1) : i + 1;
    s.rank = rank;
    return [
      maxConfirmed ? rank : "",
      s.participantId,
      s.nickname,
      s.score,
      maxConfirmed,
      maxConfirmed ? s.score / maxConfirmed : "",
      s.fullCorrect,
      now,
    ];
  });

  replaceScoringBody_(scoresSheet, scoresRows, SCORING_SCORE_HEADERS.length);
  replaceScoringBody_(detailSheet, detailRows, SCORING_DETAIL_HEADERS.length);
  SpreadsheetApp.flush();
  return { participantCount: summaries.length, confirmedPoints: maxConfirmed, confirmedQuestions: confirmedByKey.size };
}

function replaceScoringBody_(sheet, rows, columnCount) {
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, columnCount).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, columnCount).setValues(rows);
  }
}

function validateScoringAnswer_(question, value) {
  const clean = cleanText_(value);
  if (!clean) return {ok:false, message:"정답이 비어 있습니다."};
  const kind = question.kind;
  if (kind === "PLAYER") {
    return {ok:true, normalized:normalizeScoringPlayer_(clean)};
  }
  if (kind === "YESNO") {
    const normalized = clean.toLowerCase();
    if (!['yes','no'].includes(normalized)) return {ok:false, message:"yes 또는 no를 입력하세요."};
    return {ok:true, normalized};
  }
  if (kind === "SCORE") {
    const normalized = clean.replace(/\s/g, "").replace(/:/g, "-");
    if (!["3-0","3-1","3-2"].includes(normalized)) return {ok:false, message:"3-0, 3-1, 3-2 중 하나만 입력하세요."};
    return {ok:true, normalized};
  }
  if (["TEAM", "PLAYIN", "LCK"].includes(kind)) {
    const normalized = normalizeTeamId_(clean);
    const allowed = kind === "PLAYIN" ? PLAYIN_TEAM_IDS : kind === "LCK" ? LCK_TEAM_IDS : TEAM_IDS;
    if (!allowed.includes(normalized)) return {ok:false, message:"허용되지 않은 팀 ID입니다."};
    return {ok:true, normalized};
  }
  if (["TEAMS_8", "TEAMS_2"].includes(kind)) {
    const normalized = clean.split(/[|,;\n\/]+/).map(normalizeTeamId_).filter(Boolean);
    const count = kind === "TEAMS_8" ? 8 : 2;
    if (normalized.length !== count) return {ok:false, message:`서로 다른 ${count}팀을 입력하세요.`};
    if (new Set(normalized).size !== count) return {ok:false, message:"팀 ID가 중복되어 있습니다."};
    if (normalized.some((team) => !TEAM_IDS.includes(team))) return {ok:false, message:"허용되지 않은 팀 ID입니다."};
    return {ok:true, normalized};
  }
  return {ok:false, message:"지원되지 않는 결과 형식입니다."};
}

function normalizeScoringPlayer_(value) {
  return cleanText_(value).toLocaleLowerCase().replace(/\s+/g, "");
}

function scoreSingleQuestion_(question, predictionRow, answer) {
  if (["TEAMS_8", "TEAMS_2"].includes(question.kind)) {
    const predicted = question.source.length === 1
      ? String(predictionRow[question.source[0]] || "").split(/[|,;\n\/]+/)
      : question.source.map((index) => String(predictionRow[index] || ""));
    const unique = [...new Set(predicted.map(normalizeTeamId_).filter(Boolean))];
    const correct = unique.filter((team) => answer.includes(team)).length;
    const each = question.kind === "TEAMS_8" ? 2 : question.points / 2;
    return correct * each;
  }
  const predicted = predictionRow[question.source[0]];
  if (question.kind === "PLAYER") {
    return normalizeScoringPlayer_(predicted) === answer ? question.points : 0;
  }
  if (["TEAM", "PLAYIN", "LCK"].includes(question.kind)) {
    return normalizeTeamId_(predicted) === answer ? question.points : 0;
  }
  if (question.kind === "SCORE") {
    return String(predicted || "").replace(/\s/g, "").replace(/:/g, "-") === answer ? question.points : 0;
  }
  return cleanText_(predicted).toLowerCase() === answer ? question.points : 0;
}

/**
 * v5 · 공개 결과 조회 API
 *
 * 참가자 정보는 submission_open=FALSE 및
 * predictions_visible=TRUE / leaderboard_visible=TRUE일 때에만 노출.
 * 공개 응답에 제출코드, Discord 사용자 ID, 비밀키는 절대 포함하지 않습니다.
 * 기존 Codes, Predictions, Results, Scores, ScoreDetails는 그대로 유지합니다.
 */
const PUBLIC_RESULTS_SETTINGS = {
  PREDICTIONS_VISIBLE: "predictions_visible",
  LEADERBOARD_VISIBLE: "leaderboard_visible",
};

/**
 * 1회 실행: Settings에 새 키를 기본 FALSE로 추가.
 * 기존 키/값은 변경하지 않습니다.
 */
function setupPublicResultsSettings() {
  const ss = getSpreadsheet_();
  const settings = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!settings) throw new Error("Settings 시트가 없습니다. setupSheets()를 실행해 주세요.");
  const values = settings.getDataRange().getDisplayValues();
  const keys = new Set(values.slice(1).map(row => cleanText_(row[0])));
  for (const key of [PUBLIC_RESULTS_SETTINGS.PREDICTIONS_VISIBLE, PUBLIC_RESULTS_SETTINGS.LEADERBOARD_VISIBLE]) {
    if (!keys.has(key)) settings.appendRow([key, "FALSE"]);
  }
  SpreadsheetApp.flush();
  return readPublicSettings_(ss);
}

/**
 * 운영자가 대회 개막 이후 1회 수동 실행.
 * 우선 제출을 닫고 최신 점수를 재계산한 뒤, 공개 스위치를 켭니다.
 * 실수로 실행하면 참가자 예측이 공개되므로 반드시 시점 확인.
 */
function closeSubmissionsAndPublishResults() {
  setupPublicResultsSettings();
  setSubmissionOpen(false);
  recalculateScores();
  const settings = getSpreadsheet_().getSheetByName(CONFIG.SETTINGS_SHEET);
  setPublicSetting_(settings, PUBLIC_RESULTS_SETTINGS.PREDICTIONS_VISIBLE, true);
  setPublicSetting_(settings, PUBLIC_RESULTS_SETTINGS.LEADERBOARD_VISIBLE, true);
  SpreadsheetApp.flush();
  return { ok: true, message: "제출 마감 및 결과 공개가 활성화되었습니다." };
}

/** 운영 중 긴급 비공개 전환. 제출 상태는 변경하지 않습니다. */
function hidePublishedResults() {
  const settings = getSpreadsheet_().getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!settings) throw new Error("Settings 시트가 없습니다.");
  setPublicSetting_(settings, PUBLIC_RESULTS_SETTINGS.PREDICTIONS_VISIBLE, false);
  setPublicSetting_(settings, PUBLIC_RESULTS_SETTINGS.LEADERBOARD_VISIBLE, false);
  SpreadsheetApp.flush();
}

function setPublicSetting_(sheet, key, on) {
  const last = sheet.getLastRow();
  if (last >= 2) {
    const values = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (let i = 0; i < values.length; i++) {
      if (cleanText_(values[i][0]) === key) {
        sheet.getRange(i + 2, 2).setValue(on ? "TRUE" : "FALSE");
        return;
      }
    }
  }
  sheet.appendRow([key, on ? "TRUE" : "FALSE"]);
}

function readPublicSettings_(ss) {
  const sheet = ss.getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!sheet) return { submissionOpen: false, predictionsVisible: false, leaderboardVisible: false };
  const rows = sheet.getDataRange().getDisplayValues();
  const flags = new Map(rows.slice(1).map(row => [cleanText_(row[0]), cleanText_(row[1]).toUpperCase()]));
  return {
    submissionOpen: flags.get("submission_open") === "TRUE",
    predictionsVisible: flags.get(PUBLIC_RESULTS_SETTINGS.PREDICTIONS_VISIBLE) === "TRUE",
    leaderboardVisible: flags.get(PUBLIC_RESULTS_SETTINGS.LEADERBOARD_VISIBLE) === "TRUE",
  };
}

/** GET ?action=public_results */
function getPublicResults_() {
  const ss = getSpreadsheet_();
  const access = readPublicSettings_(ss);

  // 중요: 어떤 참가자 시트도 읽기 전에 공개 조건부터 검사.
  if (access.submissionOpen || !access.predictionsVisible || !access.leaderboardVisible) {
    return json_({
      ok: false,
      code: "NOT_PUBLIC",
      message: access.submissionOpen
        ? "아직 예측 제출 기간입니다. 제출 마감 이후 결과가 공개됩니다."
        : "운영자가 결과 공개를 준비하고 있습니다.",
      submissionOpen: access.submissionOpen,
      predictionsVisible: access.predictionsVisible,
      leaderboardVisible: access.leaderboardVisible,
    });
  }

  const predictionsSheet = ss.getSheetByName(CONFIG.PREDICTIONS_SHEET);
  const resultsSheet = ss.getSheetByName(SCORING_CONFIG.RESULTS_SHEET);
  const scoresSheet = ss.getSheetByName(SCORING_CONFIG.SCORES_SHEET);
  const detailsSheet = ss.getSheetByName(SCORING_CONFIG.DETAILS_SHEET);

  if (!predictionsSheet || !resultsSheet || !scoresSheet || !detailsSheet) {
    return json_({ok: false, code: "NOT_READY", message: "채점 결과 시트가 준비되지 않았습니다."});
  }

  const resultRows = resultsSheet.getRange(2, 1, SCORING_QUESTIONS.length, 7).getDisplayValues();
  const resultsByKey = new Map(resultRows.map(row => [cleanText_(row[0]), row]));
  const publicQuestions = [];
  let maxConfirmed = 0;
  let confirmedQuestions = 0;

  for (const q of SCORING_QUESTIONS) {
    const row = resultsByKey.get(q.key);
    const typed = row ? cleanText_(row[2]) : "";
    const status = row ? cleanText_(row[3]).toUpperCase() : "PENDING";
    const checked = validateScoringAnswer_(q, typed);
    const confirmed = status === "CONFIRMED" && checked.ok;
    if (confirmed) {
      confirmedQuestions += 1;
      maxConfirmed += q.points;
    }
    publicQuestions.push({
      key: q.key,
      label: q.label,
      kind: q.kind,
      points: q.points,
      confirmed,
      answer: confirmed ? checked.normalized : null,
    });
  }

  const scoreRows = readPublicSheetBody_(scoresSheet, SCORING_SCORE_HEADERS.length);
  const detailRows = readPublicSheetBody_(detailsSheet, SCORING_DETAIL_HEADERS.length);
  const predictionRows = readPublicSheetBody_(predictionsSheet, PREDICTION_HEADERS.length);

  // Scores는 순위순 정렬, ScoreDetails는 Predictions 원본순으로 생성됨.
  const scoresById = new Map(scoreRows.map(row => [cleanText_(row[1]), row]));
  const detailsById = new Map(detailRows.map(row => [cleanText_(row[0]), row]));
  const players = [];

  for (let i = 0; i < predictionRows.length; i++) {
    const raw = predictionRows[i];
    if (!CONFIG.CODE_PATTERN.test(normalizeCode_(raw[1]))) continue;

    const publicId = `P-${String(i + 1).padStart(5, "0")}`;
    const scoreRecord = scoresById.get(publicId);
    const detailRecord = detailsById.get(publicId);
    if (!scoreRecord || !detailRecord || Number(scoreRecord[4]) !== maxConfirmed) {
      return json_({
        ok: false,
        code: "SCORES_STALE",
        message: "점수 데이터가 예측 및 정답과 일치하지 않습니다. 운영자가 recalculateScores()를 실행해야 합니다.",
      });
    }

    const predictions = {};
    const points = {};
    for (let j = 0; j < SCORING_QUESTIONS.length; j++) {
      const q = SCORING_QUESTIONS[j];
      const confirmed = publicQuestions[j].confirmed;
      predictions[q.key] = publicPredictedValue_(q, raw);
      const scoreText = cleanText_(detailRecord[j + 3]);
      if (confirmed && scoreText === "") {
        return json_({ok:false, code:"SCORES_STALE", message:"문항별 채점 데이터가 최신이 아닙니다."});
      }
      // 트리거 오류로 Results의 정답만 바뀌었을 경우 오래된 점수를 노출하지 않음.
      if (confirmed) {
        const expected = scoreSingleQuestion_(q, raw, publicQuestions[j].answer);
        if (Number(scoreText) !== expected) {
          return json_({
            ok: false,
            code: "SCORES_STALE",
            message: "정답 변경 후 점수 재계산이 필요합니다. 운영자가 recalculateScores()를 실행해 주세요.",
          });
        }
      }
      points[q.key] = confirmed ? Number(scoreText) : null;
    }

    const rankText = cleanText_(scoreRecord[0]);
    players.push({
      id: publicId,
      nickname: cleanText_(raw[2]),
      rank: rankText ? Number(rankText) : null,
      score: Number(scoreRecord[3]) || 0,
      fullCorrect: Number(scoreRecord[6]) || 0,
      predictions,
      points,
    });
  }

  return json_({
    ok: true,
    version: "2026-10-13-v5",
    confirmedPoints: maxConfirmed,
    confirmedQuestions,
    questions: publicQuestions,
    players,
  });
}

function readPublicSheetBody_(sheet, cols) {
  const last = sheet.getLastRow();
  return last < 2 ? [] : sheet.getRange(2, 1, last - 1, cols).getDisplayValues();
}

function publicPredictedValue_(q, record) {
  if (q.kind === "TEAMS_8" || q.kind === "TEAMS_2") {
    const items = q.source.length === 1
      ? String(record[q.source[0]] || "").split(/[|,;\n\/]+/)
      : q.source.map(index => String(record[index] || ""));
    return items.map(normalizeTeamId_).filter(Boolean);
  }
  const raw = cleanText_(record[q.source[0]]);
  if (["TEAM", "PLAYIN", "LCK"].includes(q.kind)) return normalizeTeamId_(raw);
  return raw;
}
