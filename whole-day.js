let wholeDayMidnightTimer = null;
let mobileInspectWeekday = null;
let mobileInspectMonthKey = null;




//----------
function getCurrentStructureType() {
  return window.currentTable?.structure_type || "";
}

//----------
function isWholeDayBoard() {
  return getCurrentStructureType() === "whole_day";
}

//----------
function getBoardTimeZone() {
  return (
    window.currentTable?.host_tz ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"
  );
}

//----------
function getBoardTodayParts() {
  const tz = getBoardTimeZone();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day)
  };
}

//----------
function getTodayBoardDay() {
  const todayParts = getBoardTodayParts();
  const todayKey = window.formatDateKey(
    new Date(todayParts.year, todayParts.month - 1, todayParts.day)
  );
  return getBoardDayFromDateKey(todayKey);
}

//----------
async function prunePastWholeDayAvailability() {
  if (!isWholeDayBoard() || !window.currentTable?.id) return;

  const todayBoardDay = getTodayBoardDay();
  if (!Number.isFinite(todayBoardDay) || todayBoardDay <= 1) return;

  const { error } = await window.supabase
    .from("availability_dev")
    .delete()
    .eq("table_id", window.currentTable.id)
    .lt("day", todayBoardDay)
    .eq("time", "All Day");

  if (error) {
    console.error("prunePastWholeDayAvailability failed:", error);
  }
}

//----------
function scheduleWholeDayMidnightRefresh() {
  if (wholeDayMidnightTimer) {
    clearTimeout(wholeDayMidnightTimer);
    wholeDayMidnightTimer = null;
  }

  if (!isWholeDayBoard()) return;

  const tz =
    window.currentTable?.host_tz ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));

  const boardNow = new Date(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  const nextMidnight = new Date(boardNow);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 2, 0);

  const delay = Math.max(1000, nextMidnight.getTime() - boardNow.getTime());

  wholeDayMidnightTimer = setTimeout(async () => {
    try {
      await prunePastWholeDayAvailability();
      await window.loadAvailability();
    } finally {
      scheduleWholeDayMidnightRefresh();
    }
  }, delay);
}

//----------
function getBoardDayFromDateKey(dateKey) {
  const startYmd = window.currentTable?.start_date;
  if (!startYmd || !dateKey) return null;

  const start = new Date(`${startYmd}T00:00:00`);
  const target = new Date(`${dateKey}T00:00:00`);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target - start) / msPerDay) + 1;
}

//----------
function getMonthName(year, monthIndex) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, monthIndex, 1));
}

//----------
function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

//----------
function getFirstWeekdayIndex(year, monthIndex) {
  const jsDay = new Date(year, monthIndex, 1).getDay();
  return (jsDay + 6) % 7;
}

//----------
function getNextMonth(year, monthIndex) {
  if (monthIndex === 11) return { year: year + 1, monthIndex: 0 };
  return { year, monthIndex: monthIndex + 1 };
}

//----------
function setWholeDayInspectWeekday(weekdayIndex, monthKey = null) {
  mobileInspectWeekday =
    Number.isInteger(weekdayIndex) && weekdayIndex >= 0 && weekdayIndex <= 6
      ? weekdayIndex
      : null;

  mobileInspectMonthKey =
    mobileInspectWeekday !== null && monthKey
      ? String(monthKey)
      : null;

  const wrap = document.querySelector(".whole-day-wrap");
  if (!wrap) return;

  wrap.classList.toggle("inspect-column-mode", mobileInspectWeekday !== null);

  wrap.querySelectorAll(".whole-day-month-card").forEach(card => {
    const cardMonthKey = String(card.dataset.monthKey || "");
    const isActiveMonth =
      mobileInspectWeekday !== null &&
      mobileInspectMonthKey !== null &&
      cardMonthKey === mobileInspectMonthKey;

    card.classList.toggle("inspect-month-active", isActiveMonth);
  });

  wrap.querySelectorAll(".whole-day-weekday").forEach(header => {
    const idx = Number(header.dataset.weekday);
    const headerMonthKey = String(header.dataset.monthKey || "");
    const isActive =
      mobileInspectWeekday !== null &&
      idx === mobileInspectWeekday &&
      headerMonthKey === mobileInspectMonthKey;

    header.classList.toggle("inspect-column-active", isActive);
    header.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  wrap.querySelectorAll(".whole-day-cell[data-weekday]").forEach(cell => {
    const idx = Number(cell.dataset.weekday);
    const cellMonthKey = String(cell.dataset.monthKey || "");
    const isActive =
      mobileInspectWeekday !== null &&
      idx === mobileInspectWeekday &&
      cellMonthKey === mobileInspectMonthKey;

    cell.classList.toggle("inspect-column-cell", isActive);
  });
}

//----------
function toggleWholeDayInspectWeekday(weekdayIndex, monthKey) {
  const sameWeekday = mobileInspectWeekday === weekdayIndex;
  const sameMonth = String(mobileInspectMonthKey || "") === String(monthKey || "");

  if (sameWeekday && sameMonth) {
    setWholeDayInspectWeekday(null, null);
  } else {
    setWholeDayInspectWeekday(weekdayIndex, monthKey);
  }
}

//----------
function clearWholeDayInspectWeekday() {
  setWholeDayInspectWeekday(null, null);
}

function bindWholeDayWeekdayHeaders() {
  const headers = document.querySelectorAll(".whole-day-weekday");

  headers.forEach(header => {
    if (header.dataset.boundInspect === "1") return;
    header.dataset.boundInspect = "1";

    header.addEventListener("click", (e) => {
      if (!window.isMobileLikeViewport?.()) return;

      e.preventDefault();
      e.stopPropagation();

      const idx = Number(header.dataset.weekday);
      const monthKey = String(header.dataset.monthKey || "");
      toggleWholeDayInspectWeekday(idx, monthKey);
    });

    header.addEventListener("keydown", (e) => {
      if (!window.isMobileLikeViewport?.()) return;
      if (e.key !== "Enter" && e.key !== " ") return;

      e.preventDefault();
      e.stopPropagation();

      const idx = Number(header.dataset.weekday);
      const monthKey = String(header.dataset.monthKey || "");
      toggleWholeDayInspectWeekday(idx, monthKey);
    });
  });
}

//----------
function renderWholeDayCalendar() {
  const calendar = document.getElementById("calendar");
  if (!calendar) return;

  const { year, month, day } = getBoardTodayParts();
  const monthA = { year, monthIndex: month - 1 };
  const monthB = getNextMonth(monthA.year, monthA.monthIndex);

  calendar.innerHTML = `
    <div class="whole-day-wrap">
      ${renderWholeDayMonth(monthA.year, monthA.monthIndex, {
        todayYear: year,
        todayMonth: month,
        todayDay: day
      })}
      ${renderWholeDayMonth(monthB.year, monthB.monthIndex, {
        todayYear: year,
        todayMonth: month,
        todayDay: day
      })}
    </div>
  `;
  
  setWholeDayInspectWeekday(mobileInspectWeekday);
  bindWholeDayWeekdayHeaders();
}

//----------
function bindWholeDayCells() {
  const cells = document.querySelectorAll(
    ".whole-day-cell[data-date-key][data-day][data-time]"
  );

  cells.forEach(cell => {
    if (cell.classList.contains("whole-day-cell--empty")) return;
    if (cell.dataset.boundClick === "1") return;

    cell.dataset.boundClick = "1";
    cell.addEventListener("click", (e) => {
      if (window.isMobileLikeViewport?.()) {
        const cellWeekday = Number(cell.dataset.weekday);
        const cellMonthKey = String(cell.dataset.monthKey || "");
        const inspecting = mobileInspectWeekday !== null && !!mobileInspectMonthKey;
        const isActiveCell =
          inspecting &&
          cellWeekday === mobileInspectWeekday &&
          cellMonthKey === mobileInspectMonthKey;

        if (isActiveCell) {
          e.preventDefault();
          e.stopPropagation();

          window.hideCellHoverTooltip?.();

          Promise.resolve(window.renderCellHoverTooltip?.(cell)).then(() => {
            window.positionCellHoverTooltip?.(cell);
          });

          return;
        }
      }

      window.toggleCell(e);
    });
  });
}

//----------
function renderWholeDayMonth(year, monthIndex, todayInfo) {
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const firstOffset = getFirstWeekdayIndex(year, monthIndex);
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  const cells = [];

  for (let i = 0; i < firstOffset; i++) {
    cells.push(
      `<div class="whole-day-cell whole-day-cell--empty" aria-hidden="true"></div>`
    );
  }

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const isPast =
      year < todayInfo.todayYear ||
      (year === todayInfo.todayYear && monthIndex + 1 < todayInfo.todayMonth) ||
      (
        year === todayInfo.todayYear &&
        monthIndex + 1 === todayInfo.todayMonth &&
        dayNum < todayInfo.todayDay
      );

    const isToday =
      year === todayInfo.todayYear &&
      monthIndex + 1 === todayInfo.todayMonth &&
      dayNum === todayInfo.todayDay;

    const classNames = [
      "whole-day-cell",
      isPast ? "whole-day-cell--past" : "",
      isToday ? "whole-day-cell--today" : ""
    ].filter(Boolean).join(" ");

    const dateKey = window.formatDateKey(new Date(year, monthIndex, dayNum));
    const boardDay = getBoardDayFromDateKey(dateKey);

    const jsDay = new Date(year, monthIndex, dayNum).getDay();
    const weekdayIndex = (jsDay + 6) % 7; // Mon=0 ... Sun=6
    
    cells.push(`
      <div
        class="${classNames}"
        data-month-year="${year}"
        data-month-index="${monthIndex}"
        data-month-day="${dayNum}"
        data-month-key="${monthKey}"
        data-date-key="${dateKey}"
        data-day="${boardDay ?? ""}"
        data-time="All Day"
        data-weekday="${weekdayIndex}"
      >
        <div class="whole-day-cell__number">${dayNum}</div>
        <div class="whole-day-cell__dots"></div>
      </div>
    `);
  }

  return `
    <section class="whole-day-month-card" data-month-key="${monthKey}">
      <div class="whole-day-month-card__title">${getMonthName(year, monthIndex)}</div>
      <div class="whole-day-weekdays">
        ${weekdayLabels
          .map((label, idx) => `
            <div
              class="whole-day-weekday"
              data-weekday="${idx}"
              data-month-key="${monthKey}"
              role="button"
              tabindex="0"
              aria-pressed="false"
            >
              ${label}
            </div>
          `)
          .join("")}
      </div>
      <div class="whole-day-grid">
        ${cells.join("")}
      </div>
    </section>
  `;
}

//----------
function isWholeDayCellLocked(cell) {
  if (!cell) return true;
  return cell.classList.contains("whole-day-cell--past");
}

//----------
async function renderWholeDayAvailability(rows) {
  const threshold = Number(window.currentTable?.gold_threshold || 0);

  document.querySelectorAll(".whole-day-cell").forEach(cell => {
    cell.classList.remove("gold-cell");
    cell.querySelector(".dot-container")?.remove();
  });

  if (!rows || !rows.length) return;

  const countsByDate = new Map();

  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  const profilesMap = await window.fetchProfilesMap(userIds);
  const localColorMap = await window.fetchBoardLocalColorMap(window.currentTable.id, userIds);

  rows.forEach(row => {
    const dateKey = getWholeDayDateKeyFromRow(row);
    if (!dateKey) return;

    const cell = document.querySelector(`.whole-day-cell[data-date-key="${dateKey}"]`);
    if (!cell) return;

    let dotContainer = cell.querySelector(".dot-container");
    if (!dotContainer) {
      dotContainer = document.createElement("div");
      dotContainer.className = "dot-container";

      const dotsHost = cell.querySelector(".whole-day-cell__dots");
      if (dotsHost) {
        dotsHost.appendChild(dotContainer);
      } else {
        cell.appendChild(dotContainer);
      }
    }

    const prof = row.user_id ? profilesMap[row.user_id] : null;
    const displayName = prof?.name || row.name || "—";
    const displayColor =
      localColorMap[row.user_id] || prof?.color || row.color || "#999";

    const dot = document.createElement("div");
    dot.className = "dot";

    if (row?.id != null) {
      dot.dataset.entryId = String(row.id);
      window.availabilityMetaByEntryId.set(String(row.id), {
        day: String(row.day),
        time: String(row.time)
      });
    }

    if (row.user_id) dot.dataset.userId = row.user_id;
    dot.dataset.name = displayName;
    dot.style.background = displayColor;

    dotContainer.appendChild(dot);

    countsByDate.set(dateKey, (countsByDate.get(dateKey) || 0) + 1);

    window.ensureLegendUser({ ...row, name: displayName, color: displayColor });
  });

  document.querySelectorAll(".whole-day-cell").forEach(cell => {
    window.refreshDotLayout(cell);
  });

  countsByDate.forEach((count, dateKey) => {
    if (threshold > 0 && count >= threshold) {
      const cell = document.querySelector(`.whole-day-cell[data-date-key="${dateKey}"]`);
      if (!cell) return;

      cell.classList.add("gold-cell");
      cell.querySelector(".dot-container")?.remove();
    }
  });
}

//----------
function getWholeDayDateKeyFromRow(row) {
  const start = window.getBoardStartDate();
  if (!start) return null;

  const offset = Number(row.day);
  if (!Number.isFinite(offset)) return null;

  const actualDate = window.addDaysLocal(start, offset - 1);
  return window.formatDateKey(actualDate);
}

window.getCurrentStructureType = getCurrentStructureType;
window.isWholeDayBoard = isWholeDayBoard;
window.getBoardTimeZone = getBoardTimeZone;
window.getBoardTodayParts = getBoardTodayParts;
window.getTodayBoardDay = getTodayBoardDay;
window.prunePastWholeDayAvailability = prunePastWholeDayAvailability;
window.scheduleWholeDayMidnightRefresh = scheduleWholeDayMidnightRefresh;
window.getBoardDayFromDateKey = getBoardDayFromDateKey;
window.getMonthName = getMonthName;
window.getDaysInMonth = getDaysInMonth;
window.getFirstWeekdayIndex = getFirstWeekdayIndex;
window.getNextMonth = getNextMonth;
window.renderWholeDayCalendar = renderWholeDayCalendar;
window.bindWholeDayCells = bindWholeDayCells;
window.renderWholeDayMonth = renderWholeDayMonth;
window.isWholeDayCellLocked = isWholeDayCellLocked;
window.renderWholeDayAvailability = renderWholeDayAvailability;
window.getWholeDayDateKeyFromRow = getWholeDayDateKeyFromRow;
window.setWholeDayInspectWeekday = setWholeDayInspectWeekday;
window.clearWholeDayInspectWeekday = clearWholeDayInspectWeekday;
window.bindWholeDayWeekdayHeaders = bindWholeDayWeekdayHeaders;
