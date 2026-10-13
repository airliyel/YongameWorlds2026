/*
 * YONGAME WORLDS 2026 · public results dashboard
 * 서버는 제출 마감 + 예측 공개 + 순위 공개 모두 TRUE일 때만
 * 참가자 정보를 반환합니다. 이 파일에는 secret, Sheet ID, 제출코드가 없습니다.
 */
"use strict";

const RESULTS_CONFIG = {
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbyghL8SVVsZJgmABTFIibWHM3daI_O_J-Dtjzg_nud4c0mv-a4f_PVrzr2gh1yRJhuY1Q/exec",
  MY_PUBLIC_ID_KEY: "yongame-worlds-2026-public-id",
};

const TEAM_NAMES = {
  GEN:"Gen.G", HLE:"Hanwha Life Esports", T1:"T1", DK:"Dplus Kia",
  AL:"Anyone's Legend", BLG:"Bilibili Gaming", TES:"TOP Esports", IG:"Invictus Gaming",
  G2:"G2 Esports", MKOI:"Movistar KOI", KC:"Karmine Corp",
  TLAW:"Team Liquid", LYON:"LYON", C9:"Cloud9 Kia",
  TSW:"Team Secret Whales", CFO:"CTBC Flying Oyster", MVK:"MVK Esports",
  LOS:"LOS", FUR:"FURIA",
};

const TEAM_LOGO_FILES = {
  GEN:"1773829250929_GENGLOGO_GOLD.png", HLE:"1631819564399_hle-2021-worlds.png",
  T1:"1726801573959_539px-T1_2019_full_allmode.png", DK:"1673260049703_DPlusKIALOGO11.png",
  AL:"1641199582689_.png", BLG:"1682322954525_Bilibili_Gaming_logo_20211.png",
  TES:"1592592064571_TopEsportsTES-01-FullonDark.png", IG:"1634762917340_300px-Invictus_Gaming_logo.png",
  G2:"G2-FullonDark.png", MKOI:"1734012609283_MKOI_FullColor_Blue.png",
  KC:"1704714951336_KC.png", TLAW:"1769357207762_TLAlienware_Minimal_Bug-White.png",
  LYON:"1743717443673_isotypelyon-03.png", C9:"1736924120254_C9Kia_IconBlue_Transparent_2000x2000.png",
  TSW:"1774598000328_White_EyeText_600p.png", CFO:"1656307849320_CFO_Logo.png",
  MVK:"1767089709161_White_Logo.png", LOS:"1784013312149_LOS-OLaranja.png",
  FUR:"FURIA---black.png",
};

const view = {
  data: null,
  selectedId: null,
  mineId: null,
  loading: false,
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refresh-button").addEventListener("click", loadPublicResults);
  document.getElementById("player-search").addEventListener("input", renderLeaderboard);
  document.getElementById("compare-player").addEventListener("change", (event) => {
    view.mineId = event.target.value || null;
    try {
      if (view.mineId) localStorage.setItem(RESULTS_CONFIG.MY_PUBLIC_ID_KEY, view.mineId);
      else localStorage.removeItem(RESULTS_CONFIG.MY_PUBLIC_ID_KEY);
    } catch (_) { /* storage가 막혀도 페이지는 정상 동작 */ }
    renderComparison();
  });
  loadPublicResults();
});

async function loadPublicResults() {
  if (view.loading) return;
  view.loading = true;
  document.getElementById("refresh-button").disabled = true;
  setPublicationStatus("데이터 불러오는 중", true);

  try {
    const url = new URL(RESULTS_CONFIG.WEB_APP_URL);
    url.searchParams.set("action", "public_results");
    url.searchParams.set("_", String(Date.now()));

    const response = await fetch(url.toString(), { method: "GET", redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();

    if (payload?.ok !== true) {
      view.data = null;
      document.getElementById("public-content").hidden = true;
      const title = payload?.code === "NOT_PUBLIC" ? "아직 결과 공개 전입니다" : "결과를 불러올 수 없습니다";
      const fallback = payload?.code === "NOT_PUBLIC"
        ? "제출이 마감되고 운영자가 결과 공개를 활성화하면, 참가자별 예측과 순위가 이곳에 표시됩니다."
        : "Apps Script 배포 버전과 공개 설정을 확인해 주세요.";
      showNotice(title, payload?.message || fallback);
      setPublicationStatus("결과 비공개", true);
      return;
    }

    validatePublicData(payload);
    view.data = payload;
    document.getElementById("notice-panel").hidden = true;
    document.getElementById("public-content").hidden = false;
    setPublicationStatus("결과 공개 중", false);
    document.getElementById("last-updated").textContent = `조회 ${new Date().toLocaleString("ko-KR")}`;

    const total = payload.players.length;
    document.getElementById("stat-players").textContent = `${total}명`;
    document.getElementById("stat-confirmed").textContent = `${payload.confirmedPoints} / 80`;
    document.getElementById("stat-questions").textContent = `${payload.confirmedQuestions} / 17`;

    // 기존 선택을 유지하되, 더 이상 없는 참가자는 초기화합니다.
    const ids = new Set(payload.players.map(p => p.id));
    if (!ids.has(view.selectedId)) view.selectedId = null;
    if (!ids.has(view.mineId)) view.mineId = readSavedParticipantId(payload.players);

    renderPodium();
    renderLeaderboard();
    renderParticipantChoices();
    renderDetail();
    renderComparison();
  } catch (error) {
    console.error("결과 API 조회 오류:", error);
    showNotice(
      "서버에 연결하지 못했습니다",
      `요청 또는 응답 처리에 문제가 발생했습니다. (${error.message || "네트워크 오류"}) ` +
      "Apps Script의 배포 URL과 실행 권한, 브라우저 개발자 도구의 네트워크 오류를 확인해 주세요."
    );
    setPublicationStatus("연결 오류", true);
    // 기존 데이터가 있더라도 새로고침 실패 시 화면을 숨겨야 공개 해제 직후 유출을 줄일 수 있습니다.
    document.getElementById("public-content").hidden = true;
  } finally {
    view.loading = false;
    document.getElementById("refresh-button").disabled = false;
  }
}

function validatePublicData(data) {
  if (!Array.isArray(data.players) || !Array.isArray(data.questions)) {
    throw new Error("공개 API 응답에 players/questions 배열이 없습니다.");
  }
  if (data.questions.length !== 17) throw new Error("문항 개수가 예상과 다릅니다.");
}

function setPublicationStatus(text, pending) {
  const status = document.getElementById("publication-status");
  status.textContent = text;
  status.classList.toggle("pending", !!pending);
}

function showNotice(title, description) {
  const notice = document.getElementById("notice-panel");
  notice.hidden = false;
  document.getElementById("notice-title").textContent = title;
  document.getElementById("notice-description").textContent = description;
}

function orderedPlayers() {
  return [...(view.data?.players || [])].sort((a, b) => {
    return Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id);
  });
}

function renderPodium() {
  const target = document.getElementById("top-three");
  const players = orderedPlayers().slice(0, 3);
  if (!players.length) {
    target.innerHTML = `<p class="empty-info">아직 공개할 참가자가 없습니다.</p>`;
    return;
  }
  target.innerHTML = players.map((player, index) => `
    <button type="button" class="podium-card" data-public-id="${esc(player.id)}">
      <span class="podium-rank">${player.rank ? `RANK ${esc(player.rank)}` : `TOP ${index+1} · 집계 전`}</span>
      <span class="podium-name">${esc(player.nickname)}</span>
      <span class="participant-id">${esc(player.id)}</span>
      <span class="podium-score">${esc(player.score)} <small>/ ${esc(view.data.confirmedPoints)}점</small></span>
    </button>
  `).join("");
  target.querySelectorAll("[data-public-id]").forEach(button => {
    button.addEventListener("click", () => selectParticipant(button.dataset.publicId, true));
  });
}

function renderLeaderboard() {
  if (!view.data) return;
  const needle = document.getElementById("player-search").value.trim().toLocaleLowerCase();
  const players = orderedPlayers().filter(p => String(p.nickname).toLocaleLowerCase().includes(needle));
  document.getElementById("search-count").textContent = `검색 결과 ${players.length}명`;
  const body = document.getElementById("leaderboard-body");

  if (!players.length) {
    body.innerHTML = `<tr><td colspan="5">일치하는 참가자가 없습니다.</td></tr>`;
    return;
  }
  body.innerHTML = players.map((p) => `
    <tr data-id="${esc(p.id)}" class="${view.selectedId===p.id ? "active" : ""}">
      <td>${p.rank === null ? "—" : esc(p.rank)}</td>
      <td><button type="button" class="leaderboard-name" data-open="${esc(p.id)}">${esc(p.nickname)}</button><small class="participant-id">${esc(p.id)}</small></td>
      <td><span class="earned-value">${esc(p.score)}</span> / ${esc(view.data.confirmedPoints)}</td>
      <td>${esc(p.fullCorrect || 0)} / ${esc(view.data.confirmedQuestions)}</td>
      <td><button type="button" class="row-action" data-open="${esc(p.id)}">결과지</button></td>
    </tr>`).join("");
  body.querySelectorAll("button[data-open]").forEach(button => {
    button.addEventListener("click", () => selectParticipant(button.dataset.open, true));
  });
}

function selectParticipant(id, scroll) {
  if (!view.data?.players.find(p => p.id === id)) return;
  view.selectedId = id;
  renderLeaderboard();
  renderDetail();
  if (scroll) document.getElementById("participant-sheet").scrollIntoView({behavior:"smooth", block:"start"});
}

function readSavedParticipantId(players) {
  try {
    const saved = localStorage.getItem(RESULTS_CONFIG.MY_PUBLIC_ID_KEY);
    if (saved && players.some(p => p.id === saved)) return saved;
    const old = JSON.parse(localStorage.getItem("yongame-worlds-2026-submission") || "{}");
    if (old.nickname) {
      const matches = players.filter(p => p.nickname === old.nickname);
      if (matches.length === 1) return matches[0].id;
    }
  } catch (_) { /* 사용자 식별은 선택적으로만 저장 */ }
  return null;
}

function renderParticipantChoices() {
  const select = document.getElementById("compare-player");
  const ordered = [...view.data.players].sort((a,b) => a.nickname.localeCompare(b.nickname, "ko") || a.id.localeCompare(b.id));
  select.innerHTML = `<option value="">비교할 참가자를 선택하세요</option>` +
    ordered.map(p => `<option value="${esc(p.id)}">${esc(p.nickname)} (${esc(p.id)})</option>`).join("");
  select.value = view.mineId || "";
}

function getParticipantById(id) {
  return view.data?.players.find(p => p.id === id) || null;
}

function renderDetail() {
  const root = document.getElementById("participant-detail");
  const participant = getParticipantById(view.selectedId);
  document.getElementById("selected-player-chip").textContent = participant ? participant.id : "참가자를 선택해 주세요";
  if (!participant) {
    root.innerHTML = `<p class="empty-info">위 순위표에서 참가자의 닉네임을 선택해 주세요.</p>`;
    return;
  }
  root.innerHTML = `
    <div class="detail-summary">
      <div><strong>${esc(participant.nickname)}</strong><p>${esc(participant.id)} · ${participant.rank ? `현재 ${esc(participant.rank)}위` : "순위 집계 전"}</p></div>
      <div class="detail-total">${esc(participant.score)} <small>/ ${esc(view.data.confirmedPoints)}점</small></div>
    </div>
    <div class="question-grid">
      ${view.data.questions.map((q, index) => renderQuestionCard(q, participant, index)).join("")}
    </div>`;
  applyLogoFallbacks(root);
}

function renderQuestionCard(q, participant, index) {
  const earned = participant.points[q.key];
  return `
    <article class="question-card">
      <div class="question-card-header">
        <h3>${String(index+1).padStart(2,"0")}. ${esc(q.label)}</h3>
        <span>최대 ${esc(q.points)}점</span>
      </div>
      <div class="result-line"><span class="result-label">예측</span><div class="result-value">${renderAnswer(q, participant.predictions[q.key])}</div></div>
      <div class="result-line"><span class="result-label">정답</span><div class="result-value">${q.confirmed ? renderAnswer(q,q.answer) : `<span class="answer-placeholder">아직 확정되지 않았습니다.</span>`}</div></div>
      <div class="result-line"><span class="result-label">획득</span><div>${renderEarned(q, earned)}</div></div>
    </article>`;
}

function renderEarned(q, earned) {
  if (!q.confirmed || earned === null || earned === undefined) return `<span class="earned-pill">미확정 · 채점 대기</span>`;
  const value = Number(earned);
  const kind = value >= q.points ? "correct" : value > 0 ? "partial" : "wrong";
  const label = kind === "correct" ? "정답" : kind === "partial" ? "부분 정답" : "오답";
  return `<span class="earned-pill ${kind}">${label} · ${esc(value)} / ${esc(q.points)}점</span>`;
}

function renderAnswer(q, value) {
  if (value === null || value === undefined || value === "") return `<span class="answer-placeholder">—</span>`;
  const ids = Array.isArray(value) ? value : [value];
  if (q.kind === "TEAMS_8" || q.kind === "TEAMS_2" || q.kind === "TEAM" || q.kind === "PLAYIN" || q.kind === "LCK") {
    return ids.map(teamMarkup).join("");
  }
  const text = String(Array.isArray(value) ? value.join(", ") : value);
  let display = text;
  if (q.kind === "YESNO") display = text.toLowerCase() === "yes" ? "YES · 발생 / 사용" : "NO · 미발생 / 미사용";
  return `<span class="answer-text">${esc(display)}</span>`;
}

function teamMarkup(code) {
  const id = String(code || "").trim().toUpperCase();
  const file = TEAM_LOGO_FILES[id];
  const name = TEAM_NAMES[id] || id;
  const f = file ? `https://am-a.akamaihd.net/image?f=${encodeURIComponent("http://static.lolesports.com/teams/" + file)}&resize=64%3A` : "";
  return `<span class="team-pill" title="${esc(name)}">${file ? `<img src="${esc(f)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}<span class="logo-text">${esc(id)}</span></span>`;
}

function applyLogoFallbacks(root) {
  root.querySelectorAll(".team-pill img").forEach(img => {
    img.addEventListener("error", () => {img.style.display = "none";}, {once:true});
    if (img.complete && img.naturalWidth === 0) img.style.display = "none";
  });
}

function renderComparison() {
  const root = document.getElementById("comparison-result");
  if (!view.data) return;
  const top = orderedPlayers().slice(0,3);
  const mine = getParticipantById(view.mineId);
  const columns = top.map((p,index) => ({...p, label:`TOP ${index+1}`, mine: mine?.id === p.id}));
  if (mine && !columns.some(p => p.id === mine.id)) columns.push({...mine, label:"나", mine:true});
  if (!mine) columns.push({id:"", nickname:"나의 참가자를 선택해 주세요", score:"—", rank:null, predictions:{}, points:{}, label:"나", mine:true});

  root.innerHTML = `
    <div class="comparison-scroll">
      <table class="compare-table">
        <thead><tr>
          <th>비교 항목</th>
          ${columns.map(p => `<th class="${p.mine ? "is-mine" : ""}"><span class="results-section-kicker">${esc(p.label)}${p.mine && p.label!=="나" ? " · 나" : ""}</span><span class="compare-name">${esc(p.nickname)}</span><span class="compare-extra">${esc(p.id || "선택 전")}</span></th>`).join("")}
        </tr></thead>
        <tbody>
          <tr><td>현재 점수</td>${columns.map(p=> `<td class="${p.mine ? "is-mine" : ""}"><strong>${esc(p.score)}</strong> / ${esc(view.data.confirmedPoints)}점</td>`).join("")}</tr>
          ${view.data.questions.map((q) => `
            <tr><td>${esc(q.label)}<span class="compare-extra">${esc(q.points)}점 · ${q.confirmed?"정답 확정":"미확정"}</span></td>
              ${columns.map(p=> `<td class="${p.mine ? "is-mine" : ""}">${p.id ? renderAnswer(q, p.predictions[q.key]) : `<span class="answer-placeholder">—</span>`}${renderCompareScore(q, p)}</td>`).join("")}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  applyLogoFallbacks(root);
}

function renderCompareScore(q, p) {
  if (!p.id) return "";
  const value = p.points[q.key];
  if (!q.confirmed || value === null || value === undefined) return `<small class="compare-cell-score pending">결과 대기</small>`;
  const kind = value >= q.points ? "correct" : value > 0 ? "partial" : "wrong";
  return `<small class="compare-cell-score ${kind}">+${esc(value)} / ${esc(q.points)}점</small>`;
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
