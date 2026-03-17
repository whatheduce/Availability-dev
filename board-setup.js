

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
  selectedStructure = null;
  customStructureLabels = [];
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
  if (typeof populateHostTimezoneSelect === "function") {
    populateHostTimezoneSelect();
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

  select.innerHTML = `<option value="" selected disabled>Select a number…</option>`;

  const freeGroup = document.createElement("optgroup");
  freeGroup.label = "Free";

  for (let i = 1; i <= 5; i++) {
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

  if (customStructureLabels && customStructureLabels.length) {
    subtitle.textContent = customStructureLabels.join(" • ");
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

    if (customStructureLabels[i]) {
      input.value = customStructureLabels[i];
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

  if (customStructureLabels.length >= 1 && customStructureLabels.length <= 5) {
    countSelect.value = String(customStructureLabels.length);
    renderCustomRowInputs(customStructureLabels.length);
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
