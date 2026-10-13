/**
 * 2026 YONGAME'S PICK'EM
 * Front-end v3
 *
 * 참가팀/로고/선택 UI와 Apps Script 제출을 한 파일에서 관리합니다.
 */

const PICKEM_CONFIG = {
  WEB_APP_URL:
    "https://script.google.com/macros/s/AKfycbyghL8SVVsZJgmABTFIibWHM3daI_O_J-Dtjzg_nud4c0mv-a4f_PVrzr2gh1yRJhuY1Q/exec",

  CODE_PATTERN: /^YG26-\d{4}$/,
  REQUIRED_SWISS_TEAMS: 8,
};

const REGION_LABELS = {
  LCK: "Korea · LCK",
  LPL: "China · LPL",
  LEC: "EMEA · LEC",
  LCS: "North America · LCS",
  LCP: "Asia Pacific · LCP",
  CBLOL: "Brazil · CBLOL",
};

const REGION_ORDER = ["LCK", "LPL", "LEC", "LCS", "LCP", "CBLOL"];

const PLAYIN_TEAM_IDS = new Set(["KC", "C9", "MVK", "FUR"]);
const LCK_TEAM_IDS = new Set(["GEN", "HLE", "T1", "DK"]);

/**
 * logoFile은 Riot/LoL Esports 공식 참가팀 페이지에서 사용하는
 * static.lolesports.com 팀 로고 파일명을 기준으로 합니다.
 */
const WORLDS_TEAMS = [
  {
    id: "GEN",
    name: "Gen.G",
    region: "LCK",
    seed: 1,
    stage: "swiss",
    logoFile: "1773829250929_GENGLOGO_GOLD.png",
  },
  {
    id: "HLE",
    name: "Hanwha Life Esports",
    region: "LCK",
    seed: 2,
    stage: "swiss",
    logoFile: "1631819564399_hle-2021-worlds.png",
  },
  {
    id: "T1",
    name: "T1",
    region: "LCK",
    seed: 3,
    stage: "swiss",
    logoFile: "1726801573959_539px-T1_2019_full_allmode.png",
  },
  {
    id: "DK",
    name: "Dplus Kia",
    region: "LCK",
    seed: 4,
    stage: "swiss",
    logoFile: "1673260049703_DPlusKIALOGO11.png",
  },

  {
    id: "AL",
    name: "Anyone's Legend",
    region: "LPL",
    seed: 1,
    stage: "swiss",
    logoFile: "1641199582689_.png",
  },
  {
    id: "BLG",
    name: "Bilibili Gaming",
    region: "LPL",
    seed: 2,
    stage: "swiss",
    logoFile: "1682322954525_Bilibili_Gaming_logo_20211.png",
  },
  {
    id: "TES",
    name: "TOP Esports",
    region: "LPL",
    seed: 3,
    stage: "swiss",
    logoFile: "1592592064571_TopEsportsTES-01-FullonDark.png",
  },
  {
    id: "IG",
    name: "Shanghai Invictus Gaming Meituan",
    shortName: "Invictus Gaming",
    region: "LPL",
    seed: 4,
    stage: "swiss",
    logoFile: "1634762917340_300px-Invictus_Gaming_logo.png",
  },

  {
    id: "G2",
    name: "G2 Esports",
    region: "LEC",
    seed: 1,
    stage: "swiss",
    logoFile: "G2-FullonDark.png",
  },
  {
    id: "MKOI",
    name: "Movistar KOI",
    region: "LEC",
    seed: 2,
    stage: "swiss",
    logoFile: "1734012609283_MKOI_FullColor_Blue.png",
  },
  {
    id: "KC",
    name: "Karmine Corp",
    region: "LEC",
    seed: 3,
    stage: "playin",
    logoFile: "1704714951336_KC.png",
  },

  {
    id: "TLAW",
    name: "Team Liquid Alienware",
    region: "LCS",
    seed: 1,
    stage: "swiss",
    logoFile: "1769357207762_TLAlienware_Minimal_Bug-White.png",
  },
  {
    id: "LYON",
    name: "LYON",
    region: "LCS",
    seed: 2,
    stage: "swiss",
    logoFile: "1743717443673_isotypelyon-03.png",
  },
  {
    id: "C9",
    name: "Cloud9 Kia",
    region: "LCS",
    seed: 3,
    stage: "playin",
    logoFile: "1736924120254_C9Kia_IconBlue_Transparent_2000x2000.png",
  },

  {
    id: "TSW",
    name: "Team Secret Whales",
    region: "LCP",
    seed: 1,
    stage: "swiss",
    logoFile: "1774598000328_White_EyeText_600p.png",
  },
  {
    id: "CFO",
    name: "CTBC Flying Oyster",
    region: "LCP",
    seed: 2,
    stage: "swiss",
    logoFile: "1656307849320_CFO_Logo.png",
  },
  {
    id: "MVK",
    name: "MVK Esports",
    region: "LCP",
    seed: 3,
    stage: "playin",
    logoFile: "1767089709161_White_Logo.png",
  },

  {
    id: "LOS",
    name: "LOS",
    region: "CBLOL",
    seed: 1,
    stage: "swiss",
    logoFile: "1784013312149_LOS-OLaranja.png",
  },
  {
    id: "FUR",
    name: "FURIA",
    region: "CBLOL",
    seed: 2,
    stage: "playin",
    logoFile: "FURIA---black.png",
  },
];

const TEAM_BY_ID = new Map(WORLDS_TEAMS.map((team) => [team.id, team]));

document.addEventListener("DOMContentLoaded", () => {
  renderQualifiedTeams();
  renderPlayInChoices();
  renderSwissChoices();
  populateTeamSelects();
  setupLogoFallbacks();
  setupSwissLimit();

  const form = document.getElementById("prediction-form");

  if (!form) {
    console.error("prediction-form을 찾을 수 없습니다.");
    return;
  }

  const codeInput = document.getElementById("submitCode");
  const submitButton = form.querySelector('button[type="submit"]');

  setupSubmitCodeInput(codeInput);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearCustomValidity(form);

    if (!form.reportValidity()) {
      return;
    }

    const validation = validateForm(form, codeInput);

    if (!validation.ok) {
      showValidationError(validation.message, validation.element);
      return;
    }

    if (!isValidWebAppUrl(PICKEM_CONFIG.WEB_APP_URL)) {
      alert(
        "Google Apps Script 웹 앱 URL이 올바르지 않습니다.\n" +
          "script.js의 PICKEM_CONFIG.WEB_APP_URL을 확인해 주세요."
      );
      return;
    }

    const confirmed = window.confirm(
      "승부예측을 최종 제출하시겠습니까?\n\n제출 이후에는 수정할 수 없습니다."
    );

    if (!confirmed) {
      return;
    }

    const payload = buildPayload(form);
    setSubmittingState(submitButton, true);

    try {
      const response = await fetch(PICKEM_CONFIG.WEB_APP_URL, {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}${
            responseText ? `: ${responseText.slice(0, 240)}` : ""
          }`
        );
      }

      let result;

      try {
        result = JSON.parse(responseText);
      } catch (_) {
        throw new Error(
          `서버가 JSON이 아닌 응답을 반환했습니다: ${responseText.slice(0, 240)}`
        );
      }

      if (!result || typeof result !== "object") {
        throw new Error("서버 응답 형식이 올바르지 않습니다.");
      }

      if (result.ok) {
        handleSubmissionSuccess(form, submitButton, result);
        return;
      }

      handleServerError(result, codeInput);
      setSubmittingState(submitButton, false);
    } catch (error) {
      console.error("Submission error:", error);

      alert(
        "제출 결과를 확인하지 못했습니다.\n\n" +
          `${error.message || error}\n\n` +
          "계속 문제가 발생하면 운영진에게 문의해 주세요."
      );

      setSubmittingState(submitButton, false);
    }
  });
});

function logoUrl(team, size = 128) {
  const originalUrl = `http://static.lolesports.com/teams/${team.logoFile}`;

  return (
    "https://am-a.akamaihd.net/image?f=" +
    encodeURIComponent(originalUrl) +
    `&resize=${size}%3A`
  );
}

function displayName(team) {
  return team.shortName || team.name;
}

function logoMarkup(team, size = 128) {
  return `
    <span class="team-logo-shell">
      <img
        class="team-logo-img"
        src="${escapeAttribute(logoUrl(team, size))}"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
      />
      <span class="team-logo-fallback" aria-hidden="true">${escapeHtml(team.id)}</span>
    </span>
  `;
}

function renderQualifiedTeams() {
  const root = document.getElementById("team-roster");

  if (!root) {
    return;
  }

  root.innerHTML = REGION_ORDER.map((region) => {
    const teams = WORLDS_TEAMS.filter((team) => team.region === region);

    const cards = teams
      .map(
        (team) => `
          <article class="roster-card">
            ${logoMarkup(team)}
            <div class="roster-copy">
              <span class="roster-code">${escapeHtml(team.id)}</span>
              <span class="roster-name" title="${escapeAttribute(team.name)}">
                ${escapeHtml(displayName(team))}
              </span>
              <span class="roster-meta">
                <span>${escapeHtml(team.region)} ${team.seed}번 시드</span>
                <span
                  class="stage-badge ${team.stage === "playin" ? "playin" : ""}"
                >
                  ${team.stage === "playin" ? "PLAY-IN" : "SWISS"}
                </span>
              </span>
            </div>
          </article>
        `
      )
      .join("");

    return `
      <section class="region-group">
        <div class="region-heading">
          <h3>${escapeHtml(REGION_LABELS[region])}</h3>
          <span>${teams.length} TEAMS</span>
        </div>
        <div class="roster-grid">${cards}</div>
      </section>
    `;
  }).join("");
}

function renderPlayInChoices() {
  const root = document.getElementById("playin-team-grid");

  if (!root) {
    return;
  }

  const teams = WORLDS_TEAMS.filter((team) => PLAYIN_TEAM_IDS.has(team.id));

  root.innerHTML = teams
    .map(
      (team, index) => `
        <label class="team-radio-card">
          <input
            type="radio"
            name="playinTeam"
            value="${escapeAttribute(team.id)}"
            ${index === 0 ? "required" : ""}
          />
          <span class="team-card-body">
            ${logoMarkup(team)}
            <span class="team-card-copy">
              <span class="team-card-code">${escapeHtml(team.id)}</span>
              <span class="team-card-name">${escapeHtml(displayName(team))}</span>
              <span class="team-card-meta">${escapeHtml(team.region)} ${team.seed}번 시드</span>
            </span>
          </span>
        </label>
      `
    )
    .join("");
}

function renderSwissChoices() {
  const root = document.getElementById("swiss-team-grid");

  if (!root) {
    return;
  }

  root.innerHTML = WORLDS_TEAMS.map(
    (team) => `
      <label class="team-check-card">
        <input
          type="checkbox"
          name="swissTeams"
          value="${escapeAttribute(team.id)}"
        />
        <span class="team-card-body">
          ${logoMarkup(team)}
          <span class="team-card-copy">
            <span class="team-card-code">${escapeHtml(team.id)}</span>
            <span class="team-card-name">${escapeHtml(displayName(team))}</span>
            <span class="team-card-meta">
              ${escapeHtml(team.region)} ·
              ${team.stage === "playin" ? "PLAY-IN" : "SWISS 직행"}
            </span>
          </span>
        </span>
      </label>
    `
  ).join("");
}

function populateTeamSelects() {
  const selects = document.querySelectorAll("select[data-team-source]");

  selects.forEach((select) => {
    const source = select.dataset.teamSource;

    const teams =
      source === "lck"
        ? WORLDS_TEAMS.filter((team) => LCK_TEAM_IDS.has(team.id))
        : WORLDS_TEAMS;

    select.innerHTML = [
      '<option value="">팀을 선택하세요</option>',
      ...REGION_ORDER.flatMap((region) => {
        const regionTeams = teams.filter((team) => team.region === region);

        if (regionTeams.length === 0) {
          return [];
        }

        const options = regionTeams
          .map(
            (team) =>
              `<option value="${escapeAttribute(team.id)}">${escapeHtml(
                `${team.id} · ${displayName(team)} (${team.region} ${team.seed})`
              )}</option>`
          )
          .join("");

        return [
          `<optgroup label="${escapeAttribute(REGION_LABELS[region])}">${options}</optgroup>`,
        ];
      }),
    ].join("");

    select.addEventListener("change", () => {
      updateTeamSelectPreview(select);
    });

    updateTeamSelectPreview(select);
  });
}

function updateTeamSelectPreview(select) {
  const preview = document.querySelector(
    `[data-preview-for="${CSS.escape(select.id)}"]`
  );

  if (!preview) {
    return;
  }

  const team = TEAM_BY_ID.get(select.value);

  if (!team) {
    preview.classList.add("is-empty");
    preview.innerHTML = "팀을 선택하면 로고와 시드가 표시됩니다.";
    return;
  }

  preview.classList.remove("is-empty");
  preview.innerHTML = `
    ${logoMarkup(team)}
    <span class="team-preview-copy">
      <strong class="team-preview-name">${escapeHtml(team.id)} · ${escapeHtml(
        displayName(team)
      )}</strong>
      <span class="team-preview-meta">
        ${escapeHtml(REGION_LABELS[team.region])} · ${team.seed}번 시드 ·
        ${team.stage === "playin" ? "PLAY-IN" : "SWISS 직행"}
      </span>
    </span>
  `;

  setupLogoFallbacks(preview);
}

function setupLogoFallbacks(root = document) {
  root.querySelectorAll(".team-logo-img").forEach((image) => {
    if (image.dataset.fallbackBound === "true") {
      return;
    }

    image.dataset.fallbackBound = "true";

    image.addEventListener("error", () => {
      image.closest(".team-logo-shell")?.classList.add("logo-failed");
    });
  });
}

function setupSwissLimit() {
  const checkboxes = Array.from(
    document.querySelectorAll('input[name="swissTeams"]')
  );

  const counter = document.getElementById("swiss-selection-count");

  const refresh = () => {
    const checked = checkboxes.filter((checkbox) => checkbox.checked);
    const reachedLimit =
      checked.length >= PICKEM_CONFIG.REQUIRED_SWISS_TEAMS;

    if (counter) {
      counter.textContent = String(checked.length);
    }

    checkboxes.forEach((checkbox) => {
      checkbox.disabled = reachedLimit && !checkbox.checked;
    });
  };

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", refresh);
  });

  refresh();
}

function setupSubmitCodeInput(codeInput) {
  if (!codeInput) {
    return;
  }

  codeInput.setAttribute("maxlength", "9");
  codeInput.setAttribute("pattern", "YG26-[0-9]{4}");
  codeInput.setAttribute(
    "title",
    "YG26-XXXX 형식으로 입력해 주세요. XXXX는 숫자 4자리입니다."
  );
  codeInput.setAttribute("autocomplete", "off");

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value
      .toUpperCase()
      .replace(/\s+/g, "")
      .slice(0, 9);

    codeInput.setCustomValidity("");
  });

  codeInput.addEventListener("blur", () => {
    const value = codeInput.value.trim();

    if (/^\d{4}$/.test(value)) {
      codeInput.value = `YG26-${value}`;
    }
  });
}

function validateForm(form, codeInput) {
  const code = normalizeCode(codeInput?.value || "");

  if (!PICKEM_CONFIG.CODE_PATTERN.test(code)) {
    return {
      ok: false,
      message:
        "제출 코드는 YG26-XXXX 형식이어야 합니다. XXXX는 숫자 4자리입니다.",
      element: codeInput,
    };
  }

  const selectedSwissTeams = Array.from(
    form.querySelectorAll('input[name="swissTeams"]:checked')
  );

  if (selectedSwissTeams.length !== PICKEM_CONFIG.REQUIRED_SWISS_TEAMS) {
    return {
      ok: false,
      message: `스위스 스테이지 진출팀은 정확히 ${PICKEM_CONFIG.REQUIRED_SWISS_TEAMS}팀을 선택해야 합니다.`,
      element: form.querySelector('input[name="swissTeams"]'),
    };
  }

  // 문항 간 논리 관계 및 같은 팀의 반복 선택은 의도적으로 검사하지 않습니다.
  return { ok: true };
}

function buildPayload(form) {
  const formData = new FormData(form);

  return {
    action: "submit_prediction",

    nickname: cleanText(formData.get("nickname")),
    submitCode: normalizeCode(formData.get("submitCode")),

    playinTeam: normalizeTeamId(formData.get("playinTeam")),
    swissTeams: formData.getAll("swissTeams").map(normalizeTeamId),

    threeZeroTeam1: normalizeTeamId(formData.get("threeZeroTeam1")),
    threeZeroTeam2: normalizeTeamId(formData.get("threeZeroTeam2")),

    champion: normalizeTeamId(formData.get("champion")),
    runnerUp: normalizeTeamId(formData.get("runnerUp")),

    semifinalLoser1: normalizeTeamId(formData.get("semifinalLoser1")),
    semifinalLoser2: normalizeTeamId(formData.get("semifinalLoser2")),

    pentakill: cleanText(formData.get("pentakill")),
    finalMvp: cleanText(formData.get("finalMvp")),
    finalScore: cleanText(formData.get("finalScore")),

    fakerAhri: cleanText(formData.get("fakerAhri")),
    uziKaisa: cleanText(formData.get("uziKaisa")),
    capsTristana: cleanText(formData.get("capsTristana")),

    backdoor: cleanText(formData.get("backdoor")),
    baronSteal: cleanText(formData.get("baronSteal")),
    elderSteal: cleanText(formData.get("elderSteal")),

    lckChampion: cleanText(formData.get("lckChampion")),
    bestLck: normalizeTeamId(formData.get("bestLck")),

    clientSubmittedAt: new Date().toISOString(),
  };
}

function handleSubmissionSuccess(form, submitButton, result) {
  const nickname =
    result.nickname ||
    form.querySelector('[name="nickname"]')?.value.trim() ||
    "참가자";

  form.querySelectorAll("input, select, button").forEach((element) => {
    element.disabled = true;
  });

  if (submitButton) {
    submitButton.textContent = "제출 완료";
  }

  try {
    localStorage.setItem(
      "yongame-worlds-2026-submission",
      JSON.stringify({
        submitted: true,
        nickname,
        submittedAt: result.submittedAt || new Date().toISOString(),
      })
    );
  } catch (error) {
    console.warn("localStorage를 사용할 수 없습니다.", error);
  }

  alert(
    `${nickname}님의 승부예측이 제출되었습니다.\n\n제출 이후에는 수정할 수 없습니다.`
  );
}

function handleServerError(result, codeInput) {
  switch (result.code) {
    case "INVALID_CODE_FORMAT":
      showValidationError(
        "제출 코드 형식이 올바르지 않습니다. YG26-XXXX 형식으로 입력해 주세요.",
        codeInput
      );
      break;

    case "INVALID_CODE":
    case "CODE_NOT_ISSUED":
      showValidationError(
        "유효한 제출 코드가 아닙니다. Discord에서 `/승부의신` 명령으로 본인의 코드를 확인해 주세요.",
        codeInput
      );
      break;

    case "ALREADY_SUBMITTED":
      alert(
        "이 제출 코드는 이미 사용되었습니다.\n\n한 사람당 승부예측은 한 번만 제출할 수 있습니다."
      );
      break;

    case "INVALID_SWISS_COUNT":
    case "INVALID_SWISS_TEAMS":
      alert(
        result.message ||
          "스위스 스테이지 진출팀은 서로 다른 8팀을 정확히 선택해야 합니다."
      );
      break;

    case "INVALID_TEAM":
    case "INVALID_PLAYIN_TEAM":
    case "INVALID_LCK_TEAM":
      alert(
        result.message ||
          "유효하지 않은 팀 값이 포함되어 있습니다. 페이지를 새로고침해 주세요."
      );
      break;

    case "MISSING_FIELD":
      alert(
        result.message ||
          "응답하지 않은 항목이 있습니다. 모든 항목을 입력한 뒤 다시 제출해 주세요."
      );
      break;

    case "SUBMISSION_CLOSED":
      alert("승부예측 제출이 마감되었습니다.");
      break;

    case "BUSY":
      alert("현재 다른 요청을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.");
      break;

    case "INVALID_VALUE":
      alert(
        result.message ||
          "일부 응답 값이 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."
      );
      break;

    default:
      alert(
        `${result.code || "SERVER_ERROR"}\n` +
          (result.message || "제출을 처리하지 못했습니다.")
      );
  }
}

function setSubmittingState(button, submitting) {
  if (!button) {
    return;
  }

  button.disabled = submitting;
  button.textContent = submitting ? "제출 중..." : "승부예측 제출하기";
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeTeamId(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function clearCustomValidity(form) {
  form.querySelectorAll("input, select").forEach((element) => {
    element.setCustomValidity("");
  });
}

function showValidationError(message, element) {
  if (!element) {
    alert(message);
    return;
  }

  element.setCustomValidity(message);
  element.reportValidity();
  element.focus();
}

function isValidWebAppUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(
    String(url || "").trim()
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}


/**
 * 결과 공개용 v5: 운영 중인 제출 상태만 안전하게 반영합니다.
 * 상태 조회가 실패해도 기존 제출 POST 흐름은 변경하지 않습니다.
 */
document.addEventListener("DOMContentLoaded", refreshSubmissionStatus);

async function refreshSubmissionStatus() {
  const statusNode = document.getElementById("submission-status-display");
  const titleNode = document.getElementById("submission-status-title");
  const descNode = document.getElementById("submission-status-description");
  const closedNotice = document.getElementById("submission-closed-message");
  const form = document.getElementById("prediction-form");
  if (!form) return;

  try {
    const url = new URL(PICKEM_CONFIG.WEB_APP_URL);
    url.searchParams.set("action", "status");
    url.searchParams.set("_", String(Date.now()));
    const response = await fetch(url.toString(), {method: "GET", redirect: "follow", cache: "no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.ok !== true || typeof payload.submissionOpen !== "boolean") {
      throw new Error("제출 상태 응답을 확인할 수 없습니다.");
    }

    if (payload.submissionOpen) {
      if (statusNode) statusNode.textContent = "SUBMISSION OPEN";
      if (titleNode) titleNode.textContent = "접수 중";
      if (descNode) descNode.textContent = "마감 전까지 발급받은 개인 제출 코드로 한 번 제출할 수 있습니다.";
      if (closedNotice) closedNotice.hidden = true;
    } else {
      if (statusNode) {
        statusNode.textContent = "SUBMISSION CLOSED";
        statusNode.classList.add("status-closed");
      }
      if (titleNode) titleNode.textContent = "접수 마감";
      if (descNode) descNode.textContent = "새로운 제출은 종료되었습니다. 결과 공개 여부는 결과 페이지에서 확인할 수 있습니다.";
      if (closedNotice) closedNotice.hidden = false;
      form.querySelectorAll("input, select, button").forEach(element => {element.disabled = true;});
    }
  } catch (error) {
    console.warn("제출 상태 조회에 실패했습니다. 실제 제출 허용 여부는 서버에서 최종 확인합니다.", error);
    if (statusNode) statusNode.textContent = "상태 확인 불가";
    if (titleNode) titleNode.textContent = "서버 확인 필요";
    if (descNode) descNode.textContent = "제출은 서버에서 최종 검증됩니다. 이미 마감된 경우 제출이 거부됩니다.";
  }
}
