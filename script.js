const PICKEM_CONFIG = {
    WEB_APP_URL: "https://script.google.com/macros/s/AKfycbyghL8SVVsZJgmABTFIibWHM3daI_O_J-Dtjzg_nud4c0mv-a4f_PVrzr2gh1yRJhuY1Q/exec.google.com/macros/s/AKfycbyghL8SVVsZJgmABTFIibWHM3daI_O_J-Dtjzg_nud4c0mv-a4f_PVrzr2gh1yRJhuY1Q/exec",
    CODE_PATTERN: /^YG26-\d{4}$/,
  
    REQUIRED_SWISS_TEAMS: 8,
  };
  
  document.addEventListener("DOMContentLoaded", () => {
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
        showValidationError(
          validation.message,
          validation.element
        );
        return;
      }
  
      if (
        !PICKEM_CONFIG.WEB_APP_URL ||
        PICKEM_CONFIG.WEB_APP_URL.includes("PASTE_YOUR")
      ) {
        alert(
          "Google Apps Script 웹 앱 URL이 아직 설정되지 않았습니다."
        );
        return;
      }
  
      const confirmed = window.confirm(
        "승부예측을 최종 제출하시겠습니까?\n\n" +
        "제출 이후에는 수정할 수 없습니다."
      );
  
      if (!confirmed) {
        return;
      }
  
      const payload = buildPayload(form);
  
      setSubmittingState(submitButton, true);
  
      try {
        const response = await fetch(
          PICKEM_CONFIG.WEB_APP_URL,
          {
            method: "POST",
            redirect: "follow",
            headers: {
              "Content-Type": "text/plain;charset=utf-8",
            },
  
            body: JSON.stringify(payload),
          }
        );
  
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }
  
        const result = await response.json();
  
        if (
          !result ||
          typeof result !== "object"
        ) {
          throw new Error(
            "서버 응답 형식이 올바르지 않습니다."
          );
        }
  
        if (result.ok) {
          handleSubmissionSuccess(
            form,
            submitButton,
            result
          );
  
          return;
        }
  
        handleServerError(
          result,
          codeInput
        );
  
        setSubmittingState(
          submitButton,
          false
        );
      } catch (error) {
        console.error(
          "Submission error:",
          error
        );
  
        alert(
          "제출 결과를 확인하지 못했습니다.\n\n" +
          "네트워크 오류가 발생했거나 " +
          "제출 서버 설정에 문제가 있을 수 있습니다. " +
          "운영진에게 문의해 주세요."
        );
  
        setSubmittingState(
          submitButton,
          false
        );
      }
    });
  });
  

  function setupSubmitCodeInput(codeInput) {
    if (!codeInput) {
      return;
    }

    codeInput.setAttribute(
      "maxlength",
      "9"
    );
  
    codeInput.setAttribute(
      "pattern",
      "YG26-[0-9]{4}"
    );
  
    codeInput.setAttribute(
      "title",
      "YG26-XXXX 형식으로 입력해 주세요. " +
      "XXXX는 숫자 4자리입니다."
    );
  
    codeInput.setAttribute(
      "autocomplete",
      "off"
    );
  
    codeInput.addEventListener(
      "input",
      () => {
        codeInput.value =
          codeInput.value
            .toUpperCase()
            .replace(/\s+/g, "")
            .slice(0, 9);
  
        codeInput.setCustomValidity("");
      }
    );
  

    codeInput.addEventListener(
      "blur",
      () => {
        const value =
          codeInput.value.trim();
  
        if (/^\d{4}$/.test(value)) {
          codeInput.value =
            `YG26-${value}`;
        }
      }
    );
  }
  

  function validateForm(
    form,
    codeInput
  ) {
    const code =
      normalizeCode(
        codeInput?.value || ""
      );

    if (
      !PICKEM_CONFIG.CODE_PATTERN.test(
        code
      )
    ) {
      return {
        ok: false,
  
        message:
          "제출 코드는 YG26-XXXX 형식이어야 합니다. " +
          "XXXX는 숫자 4자리입니다.",
  
        element: codeInput,
      };
    }
  

    const selectedSwissTeams =
      Array.from(
        form.querySelectorAll(
          'input[name="swissTeams"]:checked'
        )
      );
  
    if (
      selectedSwissTeams.length !==
      PICKEM_CONFIG.REQUIRED_SWISS_TEAMS
    ) {
      return {
        ok: false,
  
        message:
          `스위스 스테이지 진출팀은 정확히 ` +
          `${PICKEM_CONFIG.REQUIRED_SWISS_TEAMS}팀을 ` +
          `선택해야 합니다.`,
  
        element:
          form.querySelector(
            'input[name="swissTeams"]'
          ),
      };
    }
  
    return {
      ok: true,
    };
  }
  

  function buildPayload(form) {
    const formData =
      new FormData(form);
  
    return {
      action:
        "submit_prediction",
  
      nickname:
        cleanText(
          formData.get("nickname")
        ),
  
      submitCode:
        normalizeCode(
          formData.get("submitCode")
        ),
  
      playinTeam:
        cleanText(
          formData.get("playinTeam")
        ),
  
      swissTeams:
        formData
          .getAll("swissTeams")
          .map(cleanText),
  
      threeZeroTeam1:
        cleanText(
          formData.get(
            "threeZeroTeam1"
          )
        ),
  
      threeZeroTeam2:
        cleanText(
          formData.get(
            "threeZeroTeam2"
          )
        ),
  
      champion:
        cleanText(
          formData.get("champion")
        ),
  
      runnerUp:
        cleanText(
          formData.get("runnerUp")
        ),
  
      semifinalLoser1:
        cleanText(
          formData.get(
            "semifinalLoser1"
          )
        ),
  
      semifinalLoser2:
        cleanText(
          formData.get(
            "semifinalLoser2"
          )
        ),
  
      pentakill:
        cleanText(
          formData.get("pentakill")
        ),
  
      finalMvp:
        cleanText(
          formData.get("finalMvp")
        ),
  
      finalScore:
        cleanText(
          formData.get("finalScore")
        ),
  
      fakerAhri:
        cleanText(
          formData.get("fakerAhri")
        ),
  
      uziKaisa:
        cleanText(
          formData.get("uziKaisa")
        ),
  
      capsTristana:
        cleanText(
          formData.get(
            "capsTristana"
          )
        ),
  
      backdoor:
        cleanText(
          formData.get("backdoor")
        ),
  
      baronSteal:
        cleanText(
          formData.get(
            "baronSteal"
          )
        ),
  
      elderSteal:
        cleanText(
          formData.get(
            "elderSteal"
          )
        ),
  
      lckChampion:
        cleanText(
          formData.get(
            "lckChampion"
          )
        ),
  
      bestLck:
        cleanText(
          formData.get("bestLck")
        ),
  

      clientSubmittedAt:
        new Date().toISOString(),
    };
  }
  

  function handleSubmissionSuccess(
    form,
    submitButton,
    result
  ) {
    const nickname =
      result.nickname ||
      form
        .querySelector(
          '[name="nickname"]'
        )
        ?.value
        .trim() ||
      "참가자";
  

    form
      .querySelectorAll(
        "input, select, button"
      )
      .forEach((element) => {
        element.disabled = true;
      });
  
    if (submitButton) {
      submitButton.textContent =
        "제출 완료";
    }
  
    try {
      localStorage.setItem(
        "yongame-worlds-2026-submission",
  
        JSON.stringify({
          submitted: true,
  
          nickname,
  
          submittedAt:
            result.submittedAt ||
            new Date().toISOString(),
        })
      );
    } catch (error) {
      console.warn(
        "localStorage를 사용할 수 없습니다.",
        error
      );
    }
  
    alert(
      `${nickname}님의 승부예측이 제출되었습니다.\n\n` +
      `제출 이후에는 수정할 수 없습니다.`
    );
  }
  

  function handleServerError(
    result,
    codeInput
  ) {
    switch (result.code) {

      case "INVALID_CODE_FORMAT":
        showValidationError(
          "제출 코드 형식이 올바르지 않습니다. " +
          "YG26-XXXX 형식으로 입력해 주세요.",
  
          codeInput
        );
        break;

      case "INVALID_CODE":
        showValidationError(
          "유효하지 않은 제출 코드입니다. " +
          "디스코드 봇에서 본인의 코드를 다시 확인해 주세요.",
  
          codeInput
        );
        break;
  

      case "ALREADY_SUBMITTED":
        alert(
          "이 제출 코드는 이미 사용되었습니다.\n\n" +
          "한 사람당 승부예측은 한 번만 제출할 수 있습니다."
        );
        break;
  

      case "INVALID_SWISS_COUNT":
        alert(
          "스위스 스테이지 진출팀은 " +
          "정확히 8팀을 선택해야 합니다."
        );
  
        break;
  

      case "MISSING_FIELD":
        alert(
          result.message ||
          "응답하지 않은 항목이 있습니다. " +
          "모든 항목을 입력한 뒤 다시 제출해 주세요."
        );
  
        break;
  
  

      case "SUBMISSION_CLOSED":
        alert(
          "승부예측 제출이 마감되었습니다."
        );
  
        break;
  

      case "BUSY":
        alert(
          "현재 다른 제출을 처리하고 있습니다. " +
          "다시 제출해 주세요."
        );
  
        break;
  

      case "INVALID_VALUE":
        alert(
          result.message ||
          "일부 응답 값이 올바르지 않습니다. " +
          "페이지를 새로고침한 뒤 다시 시도해 주세요."
        );
  
        break;
  
  
      default:
        alert(
          result.message ||
          "제출을 처리하지 못했습니다. " +
          "운영진에게 문의해 주세요."
        );
    }
  }
  

  function setSubmittingState(
    button,
    submitting
  ) {
    if (!button) {
      return;
    }
  
    button.disabled =
      submitting;
  
    button.textContent =
      submitting
        ? "제출 중..."
        : "승부예측 제출하기";
  }
  
  

  function normalizeCode(value) {
    return String(
      value || ""
    )
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }
  

  function cleanText(value) {
    return String(
      value ?? ""
    ).trim();
  }
  
  
  function clearCustomValidity(form) {
    form
      .querySelectorAll(
        "input, select"
      )
      .forEach((element) => {
        element.setCustomValidity("");
      });
  }
  

  function showValidationError(
    message,
    element
  ) {
    if (!element) {
      alert(message);
      return;
    }
  
    element.setCustomValidity(
      message
    );
  
    element.reportValidity();
  
    element.focus();
  }