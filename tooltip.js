// =========================
// CELL HOVER TOOLTIP SYSTEMS
// =========================

const cellHoverTooltip = document.createElement("div");
let hoverTooltipCell = null;
let hoverTooltipTimer = null;
const HOVER_TOOLTIP_DELAY = 400;
document.body.appendChild(cellHoverTooltip);

//----------
function getCellUsersForTooltip(cell) {
  if (!cell) return [];

  const dots = Array.from(cell.querySelectorAll(".dot"));
  if (!dots.length) return [];

  return dots
    .map(dot => {
      const name = (dot.dataset.name || dot.title || "—").trim() || "—";
      const color = dot.style.background || "#999";
      return { name, color };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

//----------
async function getGoldCellUsersForTooltip(cell) {
  if (!cell || !currentTable?.id) return [];

  const day = String(cell.dataset.day || "");
  const time = String(cell.dataset.time || "").trim();
  if (!day || !time) return [];

  const cacheKey = `${day}|${time}`;
  const cached = cellTooltipCache.get(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("availability_dev")
    .select("*")
    .eq("table_id", currentTable.id)
    .eq("day", parseInt(day, 10))
    .eq("time", time);

  if (error) {
    console.warn("getGoldCellUsersForTooltip failed:", error);
    return [];
  }

  if (!data || data.length === 0) {
    cellTooltipCache.set(cacheKey, []);
    return [];
  }

  const profilesMap = await fetchProfilesMap(data.map(d => d.user_id));
  profilesCache = { ...profilesCache, ...profilesMap };

  const localColorMap = await fetchBoardLocalColorMap(
    currentTable.id,
    data.map(d => d.user_id)
  );

  const users = data
    .map(entry => {
      const prof = entry.user_id ? profilesMap[entry.user_id] : null;
      const displayName = (prof?.name || entry.name || "—").trim() || "—";
      const displayColor =
        localColorMap[entry.user_id] ||
        prof?.color ||
        entry.color ||
        "#999";

      return { name: displayName, color: displayColor };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  cellTooltipCache.set(cacheKey, users);
  return users;
}

//----------
async function renderCellHoverTooltip(cell) {
  if (!cell) {
    hideCellHoverTooltip();
    return;
  }

  // On true touch / non-hover devices, only allow tooltip in inspect/view mode
  const isTouchLikeInput = window.matchMedia("(hover: none), (pointer: coarse)").matches;

  if (isTouchLikeInput) {
    const activeDay = String(window.mobileInspectDay || "");
    const cellDay = String(cell.dataset.day || "");

    if (!activeDay || cellDay !== activeDay) {
      hideCellHoverTooltip();
      return;
    }
  }

  let users = [];

  if (cell.classList.contains("gold-cell")) {
    users = await getGoldCellUsersForTooltip(cell);
  } else {
    users = getCellUsersForTooltip(cell);
  }

  if (!users.length) {
    hideCellHoverTooltip();
    return;
  }

  const rowsHtml = users.map(user => `
    <div class="cell-hover-tooltip__item">
      <span class="cell-hover-tooltip__dot" style="background:${user.color}"></span>
      <span class="cell-hover-tooltip__name">${escapeHtml(user.name)}</span>
    </div>
  `).join("");

  const isGold = cell.classList.contains("gold-cell");

  cellHoverTooltip.classList.toggle("cell-hover-tooltip--gold", isGold);

  cellHoverTooltip.innerHTML = `
    ${isGold ? `<div class="cell-hover-tooltip__heading">Availability Match!</div>` : ""}
    <div class="cell-hover-tooltip__list">
      ${rowsHtml}
    </div>
  `;

  cellHoverTooltip.hidden = false;
  cellHoverTooltip.classList.remove("is-opening");
  void cellHoverTooltip.offsetWidth;
  cellHoverTooltip.classList.add("is-opening");
  hoverTooltipCell = cell;
}

//----------
function positionCellHoverTooltip(cell) {
  if (cellHoverTooltip.hidden || !cell) return;

  const pad = 14;
  const rect = cell.getBoundingClientRect();
  const tooltipRect = cellHoverTooltip.getBoundingClientRect();

  let left = rect.right + 10;
  let top = rect.top;

  // Flip to left side if too close to screen edge
  if (left + tooltipRect.width > window.innerWidth - pad) {
    left = rect.left - tooltipRect.width - 10;
  }

  // Keep inside bottom viewport
  if (top + tooltipRect.height > window.innerHeight - pad) {
    top = window.innerHeight - tooltipRect.height - pad;
  }

  left = Math.max(pad, left);
  top = Math.max(pad, top);

  cellHoverTooltip.style.left = `${left}px`;
  cellHoverTooltip.style.top = `${top}px`;
}

//----------
function hideCellHoverTooltip() {
  clearTimeout(hoverTooltipTimer);
  cellHoverTooltip.hidden = true;
  cellHoverTooltip.innerHTML = "";
  cellHoverTooltip.classList.remove("is-opening");
  hoverTooltipCell = null;
}

//----------
function applyLocalColourUpdateInPlace(userId, newColor) {
  if (!userId || !newColor) return;

  // Update all visible dots for this user on the current board
  window.table
    ?.querySelectorAll(`.dot[data-user-id="${CSS.escape(String(userId))}"]`)
    .forEach(dot => {
      dot.style.background = newColor;
    });

  // Update legend row colour box
  const legendRow = legendList?.querySelector(
    `.legend-item[data-user-id="${CSS.escape(String(userId))}"] .color-box`
  );

  if (legendRow) {
    legendRow.style.background = newColor;
  }

  // If a tooltip is currently open, close it so it doesn't show stale colours
  hideCellHoverTooltip();
}




//---------- EVENT LISTENERS ----------//

const calendarEl = document.getElementById("calendar");

calendarEl?.addEventListener("mouseover", (e) => {
  const cell = e.target.closest('td[data-day][data-time], .whole-day-cell[data-day][data-time]');
  if (!cell || !calendarEl.contains(cell)) return;

  clearTimeout(hoverTooltipTimer);
  hoverTooltipCell = cell;

  hoverTooltipTimer = setTimeout(async () => {
    if (hoverTooltipCell !== cell) return;

    await renderCellHoverTooltip(cell);

    if (hoverTooltipCell !== cell || cellHoverTooltip.hidden) return;
    positionCellHoverTooltip(cell);
  }, HOVER_TOOLTIP_DELAY);
});

calendarEl?.addEventListener("mousemove", (e) => {
  if (cellHoverTooltip.hidden) return;

  const cell = e.target.closest('td[data-day][data-time], .whole-day-cell[data-day][data-time]');
  if (!cell || cell !== hoverTooltipCell) {
    hideCellHoverTooltip();
    return;
  }

  positionCellHoverTooltip(cell);
});

calendarEl?.addEventListener("mouseout", (e) => {
  const fromCell = e.target.closest('td[data-day][data-time], .whole-day-cell[data-day][data-time]');
  if (!fromCell) return;

  const toEl = e.relatedTarget;
  if (toEl && fromCell.contains(toEl)) return;

  hideCellHoverTooltip();
});

window.addEventListener("scroll", hideCellHoverTooltip, true);
window.addEventListener("resize", hideCellHoverTooltip);

window.getCellUsersForTooltip = getCellUsersForTooltip;
window.getGoldCellUsersForTooltip = getGoldCellUsersForTooltip;
window.renderCellHoverTooltip = renderCellHoverTooltip;
window.positionCellHoverTooltip = positionCellHoverTooltip;
window.hideCellHoverTooltip = hideCellHoverTooltip;
window.applyLocalColourUpdateInPlace = applyLocalColourUpdateInPlace;
window.cellHoverTooltip = cellHoverTooltip;
window.hoverTooltipTimer = hoverTooltipTimer;
