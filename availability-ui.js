// =========================
// CALENDAR CELL / DOT HELPERS
// =========================


//----------
function ensureDotContainer(cell) {
  let dc = cell.querySelector(".dot-container");
  if (!dc) {
    dc = document.createElement("div");
    dc.className = "dot-container";

    if (isWholeDayBoard()) {
      const dotsHost = cell.querySelector(".whole-day-cell__dots");
      if (dotsHost) {
        dotsHost.appendChild(dc);
      } else {
        cell.appendChild(dc);
      }
    } else {
      cell.appendChild(dc);
    }
  }

  refreshDotLayout(cell);
  return dc;
}

//----------
function refreshDotLayout(cell) {
  if (!cell) return;

  const dc = cell.querySelector(".dot-container");
  if (!dc) return;

  // clear previous layout classes / overflow badge
  dc.classList.remove(
    "dots-1-3",
    "dots-4-6",
    "dots-7-8",
    "dots-9plus"
  );

  dc.querySelector(".dot-overflow-badge")?.remove();

  const dots = Array.from(dc.querySelectorAll(".dot"));
  const count = dots.length;

  // nothing left -> remove container
  if (count === 0) {
    dc.remove();
    return;
  }

  // always make sure all dots are visible before re-deciding
  dots.forEach(dot => {
    dot.style.display = "";
  });

  if (count <= 3) {
    dc.classList.add("dots-1-3");
    return;
  }

  if (count <= 6) {
    dc.classList.add("dots-4-6");
    return;
  }

  if (count <= 8) {
    dc.classList.add("dots-7-8");
    return;
  }

  // 9+ dots
  dc.classList.add("dots-9plus");

  dots.slice(8).forEach(dot => {
    dot.style.display = "none";
  });

  const badge = document.createElement("div");
  badge.className = "dot-overflow-badge";
  badge.textContent = `+${count - 8}`;
  badge.title = `${count} users in this cell`;
  dc.appendChild(badge);
}
window.refreshDotLayout = refreshDotLayout;

//----------
async function rebuildDotsForCell(cell) {
  if (!window.currentTable) return;

  cell.querySelector(".dot-container")?.remove();

  const dayNum = parseInt(cell.dataset.day, 10);
  const timeKey = String(cell.dataset.time || "").trim();

  const { data, error } = await window.supabase
    .from("availability_dev")
    .select("*")
    .eq("table_id", window.currentTable.id)
    .eq("day", dayNum)
    .eq("time", timeKey);

  if (error) {
    console.warn("rebuildDotsForCell failed:", error);
    return;
  }

  if (!data || data.length === 0) return;

  // ✅ Fetch profiles ONCE
  const profilesMap = await window.fetchProfilesMap(data.map(d => d.user_id));
  window.profilesCache = { ...(window.profilesCache || {}), ...profilesMap };
  const localColorMap = await window.fetchBoardLocalColorMap(window.currentTable.id, data.map(d => d.user_id));

  const dotContainer = document.createElement("div");
  dotContainer.className = "dot-container";

  data.forEach(entry => {
    const prof = entry.user_id ? profilesMap[entry.user_id] : null;
    const displayName = prof?.name || entry.name || "—";
    const displayColor = localColorMap[entry.user_id] || prof?.color || entry.color || "#999";

    const dot = document.createElement("div");
    dot.className = "dot";

    if (entry?.id != null) {
      window.availabilityMetaByEntryId.set(String(entry.id), {
        day: String(entry.day),
        time: String(entry.time)
      });
    }
    if (entry?.id != null) dot.dataset.entryId = String(entry.id);

    dot.style.background = displayColor;
    dot.title = "";

    if (entry.user_id) dot.dataset.userId = entry.user_id;
    dot.dataset.name = displayName;

    dotContainer.appendChild(dot);
  });

  if (isWholeDayBoard()) {
    const dotsHost = cell.querySelector(".whole-day-cell__dots");
  if (dotsHost) {
    dotsHost.appendChild(dotContainer);
  } else {
    cell.appendChild(dotContainer);
  }
} else {
  cell.appendChild(dotContainer);
}

refreshDotLayout(cell);
}

//----------
async function applyGoldStateForCell(cell, day) {
  const goldThreshold = Number(window.currentTable?.gold_threshold);
  if (!Number.isFinite(goldThreshold)) return;

  const wasGold = cell.classList.contains("gold-cell");

  let dotContainer = cell.querySelector(".dot-container");
  let dotCount = dotContainer ? dotContainer.children.length : null;

  // If dots are hidden (gold state), DOM can't tell us the real count.
  // In that specific case, ask the DB for the real count for this cell.
  if (dotCount === null && wasGold) {
    const dayNum = parseInt(cell.dataset.day, 10);
    const timeKey = String(cell.dataset.time || "").trim();

    const { count, error } = await window.supabase
      .from("availability_dev")
      .select("id", { count: "exact", head: true })
      .eq("table_id", window.currentTable.id)
      .eq("day", dayNum)
      .eq("time", timeKey);

    if (error) {
      console.warn("gold count check failed:", error);
      return;
    }

    dotCount = count || 0;
  }

  // If still null, treat as 0
  dotCount = dotCount ?? 0;

  const shouldBeGold = dotCount >= goldThreshold;

  if (shouldBeGold) {
    cell.classList.add("gold-cell");
    // hide dots while gold
    cell.querySelector(".dot-container")?.remove();
  } else {
    cell.classList.remove("gold-cell");

    // If we just transitioned gold -> normal, rebuild visible dots from DB
    if (wasGold) {
      await rebuildDotsForCell(cell);
    }
  }
  
if (isWholeDayBoard()) {
  return;
}
  
  // Update day header gold state
  const dayNum = parseInt(day, 10);
  const th = window.table.querySelector(`th.day-header[data-day="${dayNum}"]`);
  if (!th) return;

  const anyGoldInDay = !!window.table.querySelector(`td[data-day="${dayNum}"].gold-cell`);
  if (anyGoldInDay) th.classList.add("gold-header");
  else th.classList.remove("gold-header");
}

//----------
function maybeApplyGoldForCell(cell) {
  const th = Number(window.currentTable?.gold_threshold || 0);
  if (!th || th <= 0) return;

  // If already gold, nothing to do
  if (cell.classList.contains("gold-cell")) return;

  const dc = cell.querySelector(".dot-container");
  const count = dc ? dc.querySelectorAll(".dot").length : 0;

  if (count >= th) {
    cell.classList.add("gold-cell");

    // Gold cells hide dots in your UI
    dc?.remove();

    // immediately reflect gold state in the day header too
    const dayNum = parseInt(cell.dataset.day, 10);
    const thEl = window.table.querySelector(`th.day-header[data-day="${dayNum}"]`);
    if (thEl) thEl.classList.add("gold-header");
  }
}

function addOptimisticDot(cell, userId, name, color) {
  const dc = ensureDotContainer(cell);
  if (!dc) return;

  if (dc.querySelector(`.dot[data-user-id="${userId}"]`)) return;

  const dot = document.createElement("div");
  dot.className = "dot";
  dot.dataset.userId = String(userId);
  dot.dataset.name = name || "—";
  dot.dataset.pending = "1";
  dot.title = "";
  dot.style.background = color || "#999";

  dc.appendChild(dot);

  requestAnimationFrame(() => {
    if (cell.isConnected) {
      refreshDotLayout(cell);
    }
  });
}


window.ensureDotContainer = ensureDotContainer;
window.rebuildDotsForCell = rebuildDotsForCell;
window.applyGoldStateForCell = applyGoldStateForCell;
window.maybeApplyGoldForCell = maybeApplyGoldForCell;
window.addOptimisticDot = addOptimisticDot;
