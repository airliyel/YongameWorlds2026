/**
 * 2026 YONGAME'S PICK'EM
 * Google Apps Script backend v2
 *
 * Script Properties:
 * - WORLDS_PICKEM_BOT_SECRET : Discord bot과 공유하는 비밀키
 * - PICKEM_SPREADSHEET_ID    : setupSheets()가 자동 저장 가능
 *
 * 권장 초기 설정:
 * 1. 승부예측용 Google Spreadsheet에서 확장 프로그램 > Apps Script를 연다.
 * 2. 이 파일을 붙여넣는다.
 * 3. Script Properties에 WORLDS_PICKEM_BOT_SECRET을 등록한다.
 * 4. setupSheets()를 한 번 직접 실행한다.
 *    - 이때 현재 Spreadsheet ID를 PICKEM_SPREADSHEET_ID에 저장한다.
 * 5. 웹 앱으로 새 버전을 배포한다.
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

function doGet() {
  try {
    return json_({
      ok: true,
      service: "YONGAME Worlds 2026 Pick'em",
      submissionOpen: isSubmissionOpen_(),
    });
  } catch (error) {
    return json_({
      ok: false,
      code: "SERVER_ERROR",
      message: String(error && error.message ? error.message : error),
    });
  }
}

/**
 * 최초 1회 실행.
 * 현재 바운드 Spreadsheet가 있으면 그 ID를 Script Properties에 저장한다.
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

/**
 * 필요할 경우 Spreadsheet ID를 직접 등록할 수 있다.
 */
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
 * 초기 운영용 미할당 제출코드 생성.
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
      "", // discord_user_id
      "", // issued_at
      "", // used_at
      "", // nickname
      "", // discord_display_name
      "", // discord_username
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
 * Discord /승부의신 명령용 코드 발급.
 * 동일 Discord 사용자에게 항상 동일한 코드를 반환한다.
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

  if (
    !Array.isArray(payload.swissTeams) ||
    payload.swissTeams.length !== CONFIG.SWISS_TEAM_COUNT
  ) {
    return json_({
      ok: false,
      code: "INVALID_SWISS_COUNT",
      message: "스위스 진출팀은 정확히 8팀이어야 합니다.",
    });
  }

  // 팀 간 논리적 관계 및 중복 예측은 의도적으로 검사하지 않는다.
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

    // 미발급 코드는 추측/직접 입력으로 사용할 수 없게 한다.
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
      safeCell_(payload.playinTeam),
      safeCell_(payload.swissTeams.map(cleanText_).join("|")),
      safeCell_(payload.threeZeroTeam1),
      safeCell_(payload.threeZeroTeam2),
      safeCell_(payload.champion),
      safeCell_(payload.runnerUp),
      safeCell_(payload.semifinalLoser1),
      safeCell_(payload.semifinalLoser2),
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
      safeCell_(payload.bestLck),
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
