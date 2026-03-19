

function getCurrentStructureType() {
  return currentTable?.structure_type || "";
}

//----------
function isWholeDayBoard() {
  return getCurrentStructureType() === "whole_day";
}

//----------
function getBoardTimeZone() {
  return currentTable?.host_tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
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
  const todayParts = getBoardTodayParts(); // board timezone
  const todayKey = formatDateKey(new Date(
    todayParts.year,
    todayParts.month - 1,
    todayParts.day
  ));
  return getBoardDayFromDateKey(todayKey);
}

//----------
async function prunePastWholeDayAvailability() {
  if (!isWholeDayBoard() || !currentTable?.id) return;

  const todayBoardDay = getTodayBoardDay();
  if (!Number.isFinite(todayBoardDay) || todayBoardDay <= 1) return;

  const { error } = await supabase
    .from("availability_dev")
    .delete()
    .eq("table_id", currentTable.id)
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

  const tz = currentTable?.host_tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
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
  nextMidnight.setHours(0, 0, 2, 0); // tiny buffer

  const delay = Math.max(1000, nextMidnight.getTime() - boardNow.getTime());

  wholeDayMidnightTimer = setTimeout(async () => {
    try {
      await prunePastWholeDayAvailability();
      await loadAvailability();
    } finally {
      scheduleWholeDayMidnightRefresh();
    }
  }, delay);
}

//----------
function getBoardDayFromDateKey(dateKey) {
  const startYmd = currentTable?.start_date;
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
  const jsDay = new Date(year, monthIndex, 1).getDay(); // 0=Sun
  return (jsDay + 6) % 7; // convert to Mon-first
}

//----------
function getNextMonth(year, monthIndex) {
  if (monthIndex === 11) return { year: year + 1, monthIndex: 0 };
  return { year, monthIndex: monthIndex + 1 };
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
      ${renderWholeDayMonth(monthA.year, monthA.monthIndex, { todayYear: year, todayMonth: month, todayDay: day })}
      ${renderWholeDayMonth(monthB.year, monthB.monthIndex, { todayYear: year, todayMonth: month, todayDay: day })}
    </div>
  `;
}

//----------
function bindWholeDayCells() {
  const cells = document.querySelectorAll(".whole-day-cell[data-date-key][data-day][data-time]");
  cells.forEach(cell => {
    // Never bind empty placeholders
    if (cell.classList.contains("whole-day-cell--empty")) return;

    // Avoid stacking duplicate listeners on repeated renders
    if (cell.dataset.boundClick === "1") return;

    cell.dataset.boundClick = "1";

    cell.addEventListener("click", (e) => {
      toggleCell(e);
    });
  });
}

//----------
function renderWholeDayMonth(year, monthIndex, todayInfo) {
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const firstOffset = getFirstWeekdayIndex(year, monthIndex);
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const cells = [];

  for (let i = 0; i < firstOffset; i++) {
    cells.push(`<div class="whole-day-cell whole-day-cell--empty" aria-hidden="true"></div>`);
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

    const dateKey = formatDateKey(new Date(year, monthIndex, dayNum));
    const boardDay = getBoardDayFromDateKey(dateKey);

    cells.push(`
    <div
      class="${classNames}"
      data-month-year="${year}"
      data-month-index="${monthIndex}"
      data-month-day="${dayNum}"
      data-date-key="${dateKey}"
      data-day="${boardDay ?? ""}"
      data-time="All Day"
    >
      <div class="whole-day-cell__number">${dayNum}</div>
      <div class="whole-day-cell__dots"></div>
    </div>
  `);
  }

  return `
    <section class="whole-day-month-card">
      <div class="whole-day-month-card__title">${getMonthName(year, monthIndex)}</div>
      <div class="whole-day-weekdays">
        ${weekdayLabels.map(label => `<div class="whole-day-weekday">${label}</div>`).join("")}
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
  const threshold = Number(currentTable?.gold_threshold || 0);

  // Clear previous Whole Day visuals
  document.querySelectorAll(".whole-day-cell").forEach(cell => {
    cell.classList.remove("gold-cell");
    cell.querySelector(".dot-container")?.remove();
  });

  if (!rows || !rows.length) return;

  const countsByDate = new Map();

  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  const profilesMap = await fetchProfilesMap(userIds);
  const localColorMap = await fetchBoardLocalColorMap(currentTable.id, userIds);

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
      availabilityMetaByEntryId.set(String(row.id), {
        day: String(row.day),
        time: String(row.time)
      });
    }

    if (row.user_id) dot.dataset.userId = row.user_id;
    dot.dataset.name = displayName;
    dot.style.background = displayColor;

    dotContainer.appendChild(dot);

    countsByDate.set(dateKey, (countsByDate.get(dateKey) || 0) + 1);

    ensureLegendUser({ ...row, name: displayName, color: displayColor });
  });

  document.querySelectorAll(".whole-day-cell").forEach(cell => {
    refreshDotLayout(cell);
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
  const start = getBoardStartDate();
  if (!start) return null;

  const offset = Number(row.day);
  if (!Number.isFinite(offset)) return null;

  const actualDate = addDaysLocal(start, offset - 1);
  return formatDateKey(actualDate);
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
