// =========================
// BOARD SETUP / CREATE CALENDAR
// =========================

const MAX_BOARD_NAME_LENGTH = 50;




function showBoardSetup() {
  const startBtn = document.getElementById("start-create");
  if (startBtn) startBtn.style.display = "none";

  const setup = document.getElementById("board-setup");
  if (setup) setup.style.display = "block";

  // Reset pages
  const nameStep = document.getElementById("name-step");
  const detailsStep = document.getElementById("details-step");
  const rowBuilder = document.getElementById("row-builder");
  const createActions = document.getElementById("create-actions");
  const goBtn = document.getElementById("go-create");

  const boardNameInput = document.getElementById("board-name");
  const tzSelect = document.getElementById("host-timezone");
  const goldSel = document.getElementById("gold-threshold");

  if (nameStep) nameStep.style.display = "block";
  if (detailsStep) detailsStep.style.display = "none";
  if (rowBuilder) rowBuilder.style.display = "none";
  if (createActions) createActions.style.display = "none";
  if (goBtn) goBtn.style.display = "none";

  // Reset field values
  if (boardNameInput) {
    boardNameInput.value = "";
    boardNameInput.defaultValue = "";
  }
  if (tzSelect) tzSelect.value = "";
  if (goldSel) goldSel.value = "";

  // Reset invalid styles
  if (boardNameInput) boardNameInput.classList.remove("is-invalid");
  if (tzSelect) tzSelect.classList.remove("is-invalid");
  if (goldSel) goldSel.classList.remove("is-invalid");

  [
    "whole-day-card",
    "am-pm-card",
    "meals-card",
    "school-times-card",
    "workday-card",
    "shifts-card",
    "custom-card"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("is-invalid");
  });

  // Clear structure selection highlight + require click
  window.selectedStructure = null;
  window.customStructureLabels = [];
  updateCustomCardPreview();
  [
    "whole-day-card",
    "am-pm-card",
    "meals-card",
    "school-times-card",
    "workday-card",
    "shifts-card",
    "custom-card",
    "hours-card",
    "extended-custom-card"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  });

  // Populate selects after reset
  if (typeof window.populateHostTimezoneSelect === "function") {
    window.populateHostTimezoneSelect();
  }

  if (typeof populateGoldThresholdSelect === "function") {
    const isPro = false; // TEMP: until you implement real Pro accounts
    populateGoldThresholdSelect(isPro);
  }

  // Final validation pass
  updateGoCreateVisibility();
}

//----------  
function populateGoldThresholdSelect() {
  const select = document.getElementById("gold-threshold");
  if (!select) return;

  select.innerHTML = `<option value="" selected disabled>Select an option…</option>`;

  const offOption = document.createElement("option");
  offOption.value = "off";
  offOption.textContent = "No gold threshold feature";
  select.appendChild(offOption);

  const freeGroup = document.createElement("optgroup");
  freeGroup.label = "Free";

  for (let i = 2; i <= 5; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    freeGroup.appendChild(opt);
  }

  const proGroup = document.createElement("optgroup");
  proGroup.label = "Pro Version";

  for (let i = 6; i <= 30; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${i} (Pro)`;
    opt.disabled = true;
    proGroup.appendChild(opt);
  }

  select.appendChild(freeGroup);
  select.appendChild(proGroup);
}

//----------
function updateGoCreateVisibility({ showErrors = false } = {}) {
  const btn = document.getElementById("go-create");
  if (!btn) return;

  const { isReady } = getCreateCalendarRequirements();

  setCreateFieldErrors({ showErrors });

  btn.style.display = isReady ? "inline-block" : "none";
}

//----------
function updateCustomCardPreview() {
  const customCard = document.getElementById("custom-card");
  if (!customCard) return;

  const subtitle = customCard.querySelector(".structure-subtitle");
  if (!subtitle) return;

  if (window.customStructureLabels && window.customStructureLabels.length) {
    subtitle.textContent = window.customStructureLabels.join(" • ");
  } else {
    subtitle.textContent = "Create up to 5 custom row labels";
  }
}

//----------
function renderCustomRowInputs(count) {
  const wrap = document.getElementById("custom-rows-fields");
  if (!wrap) return;

  wrap.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "custom-row-input";
    input.placeholder = `Row ${i + 1} name`;
    input.maxLength = 24;

    if (window.customStructureLabels[i]) {
      input.value = window.customStructureLabels[i];
    }

    input.addEventListener("input", updateCustomStructureSaveState);
    wrap.appendChild(input);
  }

  updateCustomStructureSaveState();
}

//----------
function updateCustomStructureSaveState() {
  const saveBtn = document.getElementById("custom-structure-save");
  const inputs = Array.from(document.querySelectorAll("#custom-rows-fields .custom-row-input"));

  if (!saveBtn) return;

  if (!inputs.length) {
    saveBtn.disabled = true;
    return;
  }

  const allFilled = inputs.every(input => !!input.value.trim());
  saveBtn.disabled = !allFilled;
}

//----------
function openCustomStructureModal() {
  const overlay = document.getElementById("custom-structure-modal");
  const countSelect = document.getElementById("custom-row-count");
  const fieldsWrap = document.getElementById("custom-rows-fields");

  if (!overlay || !countSelect || !fieldsWrap) return;

  fieldsWrap.innerHTML = "";

  if (window.customStructureLabels.length >= 1 && window.customStructureLabels.length <= 5) {
    countSelect.value = String(window.customStructureLabels.length);
    renderCustomRowInputs(window.customStructureLabels.length);
  } else {
    countSelect.value = "";
  }

  overlay.hidden = false;
}

//----------
function closeCustomStructureModal() {
  const overlay = document.getElementById("custom-structure-modal");
  if (overlay) overlay.hidden = true;
}

//----------  
function setActiveStructureCard(activeId) {
  [
    "whole-day-card",
    "am-pm-card",
    "meals-card",
    "school-times-card",
    "workday-card",
    "shifts-card",
    "custom-card",
    "hours-card",
    "extended-custom-card"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("active", id === activeId);
  });
}

//---------- 
function getCreateCalendarRequirements() {
  const nameInput = document.getElementById("board-name");
  const tzSelect = document.getElementById("host-timezone");
  const goldSelect = document.getElementById("gold-threshold");

  const hasName = !!nameInput?.value.trim();
  const hasTimezone = !!tzSelect?.value && tzSelect.value !== "__other__";
  const hasGold = !!goldSelect?.value;
  const hasStructure = !!window.selectedStructure;

  return {
    nameInput,
    tzSelect,
    goldSelect,
    hasName,
    hasTimezone,
    hasGold,
    hasStructure,
    isReady: hasName && hasTimezone && hasGold && hasStructure
  };
}

//----------
function setCreateFieldErrors({ showErrors = false } = {}) {
  const {
    nameInput,
    tzSelect,
    goldSelect,
    hasName,
    hasTimezone,
    hasGold,
    hasStructure
  } = getCreateCalendarRequirements();

  if (nameInput) {
    nameInput.classList.toggle("is-invalid", showErrors && !hasName);
  }

  if (tzSelect) {
    tzSelect.classList.toggle("is-invalid", showErrors && !hasTimezone);
  }

  if (goldSelect) {
    goldSelect.classList.toggle("is-invalid", showErrors && !hasGold);
  }

  const structureIds = [
    "whole-day-card",
    "am-pm-card",
    "meals-card",
    "school-times-card",
    "workday-card",
    "shifts-card",
    "custom-card"
  ];

structureIds.forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("is-invalid");
});

if (showErrors && !hasStructure) {
  structureIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("is-invalid");
  });
  }
}

function bindBoardSetupUi() {
  const boardNameInput = document.getElementById("board-name");

  if (boardNameInput) {
    boardNameInput.maxLength = MAX_BOARD_NAME_LENGTH;
    boardNameInput.addEventListener("input", () => {
      updateGoCreateVisibility();
    });
  }

  const timezoneSelect = document.getElementById("host-timezone");
  if (timezoneSelect) {
    timezoneSelect.addEventListener("change", () => {
      updateGoCreateVisibility();
    });
  }

  const goldThresholdSelect = document.getElementById("gold-threshold");
  if (goldThresholdSelect) {
    goldThresholdSelect.addEventListener("change", () => {
      updateGoCreateVisibility();
    });
  }

  const structureCards = [
    { id: "whole-day-card", value: "whole_day" },
    { id: "am-pm-card", value: "am_pm" },
    { id: "meals-card", value: "meals" },
    { id: "school-times-card", value: "school_times" },
    { id: "workday-card", value: "workday" },
    { id: "shifts-card", value: "shifts" },
    { id: "custom-card", value: "custom" }
  ];

  structureCards.forEach(({ id, value }) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("click", () => {
      if (value === "custom") {
        openCustomStructureModal();
        return;
      }

      window.selectedStructure = value;
      setActiveStructureCard(id);
      updateGoCreateVisibility({ showErrors: true });
    });
  });

  const customRowCount = document.getElementById("custom-row-count");
  if (customRowCount) {
    customRowCount.addEventListener("change", () => {
      const count = parseInt(customRowCount.value || "", 10);
      if (!Number.isFinite(count) || count < 1 || count > 5) return;
      renderCustomRowInputs(count);
    });
  }

  document.getElementById("custom-structure-cancel")?.addEventListener("click", () => {
    closeCustomStructureModal();
  });

  document.getElementById("custom-structure-save")?.addEventListener("click", () => {
    const inputs = Array.from(document.querySelectorAll("#custom-rows-fields .custom-row-input"));
    const labels = inputs.map(input => input.value.trim()).filter(Boolean);

    if (!labels.length || labels.length !== inputs.length) {
      updateCustomStructureSaveState();
      return;
    }

    window.customStructureLabels = labels;
    updateCustomCardPreview();
    closeCustomStructureModal();

    window.selectedStructure = "custom";
    setActiveStructureCard("custom-card");
    updateGoCreateVisibility({ showErrors: true });
  });

  document.getElementById("custom-structure-modal")?.addEventListener("click", (e) => {
    if (!e.target.closest(".modal-card")) {
      closeCustomStructureModal();
    }
  });
}

bindBoardSetupUi();
window.showBoardSetup = showBoardSetup;
