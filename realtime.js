// =========================
// REALTIME / REFRESH
// =========================

let availabilityChannel = null;
let tableChannel = null; 
let membershipChannel = null;
let presenceChannel = null;
let fullRefreshTimer = null;



//----------
function scheduleFullRefreshIdle(ms = 15000) {
  clearTimeout(fullRefreshTimer);
  fullRefreshTimer = setTimeout(async () => {
    if (!currentTable) return;

    await loadAvailability();
    await refreshCurrentTableMeta();
    renderCalendarLastUpdated();
  }, ms);
}

//----------
function getWholeDayCellFromEntry(entry) {
  if (!entry || !currentTable?.start_date) return null;

  const dayNum = Number(entry.day);
  if (!Number.isFinite(dayNum) || dayNum < 1) return null;

  const dateKey = addDaysYMD(currentTable.start_date, dayNum - 1);
  return document.querySelector(`.whole-day-cell[data-date-key="${dateKey}"]`);
}

//----------
function getAvailabilityCellFromEntry(entry) {
  if (isWholeDayBoard()) {
    return getWholeDayCellFromEntry(entry);
  }

  return table.querySelector(
    `td[data-day="${entry.day}"][data-time="${entry.time}"]`
  );
}

//----------
async function handleAvailabilityChange(payload) {
  const entry = payload.eventType === "DELETE" ? payload.old : payload.new;

  if (!entry) return;
  cellTooltipCache.clear();
  if (payload.eventType !== "DELETE" && entry?.id != null) {
  availabilityMetaByEntryId.set(String(entry.id), {
    day: String(entry.day),
    time: String(entry.time)
  });
}

  // DELETE: remove exact dot by DB row id, even if payload only contains { id }
  if (payload.eventType === "DELETE") {
    const entryId = entry?.id;
    if (entryId == null) {
      await loadAvailability();
      scheduleFullRefreshIdle(15000);
      return;
    }

    const dot = table.querySelector(`.dot[data-entry-id="${String(entryId)}"]`);
if (!dot) {
  const pendingCell = pendingDeleteCellByEntryId.get(String(entryId));
  const knownCell = pendingCell || availabilityMetaByEntryId.get(String(entryId));

  if (pendingCell) {
    pendingDeleteCellByEntryId.delete(String(entryId));
  }

  if (knownCell) {
    const cell = isWholeDayBoard()
  ? getWholeDayCellFromEntry({ day: knownCell.day, time: knownCell.time })
  : table.querySelector(`td[data-day="${knownCell.day}"][data-time="${knownCell.time}"]`);

    if (cell) {
      await rebuildDotsForCell(cell);
      await applyGoldStateForCell(cell, knownCell.day);
      availabilityMetaByEntryId.delete(String(entryId));
      return;
    }
  }

  await loadAvailability();
  scheduleFullRefreshIdle(15000);
  return;
}

    const cell = isWholeDayBoard()
      ? dot.closest(".whole-day-cell[data-day][data-time]")
      : dot.closest('td[data-day][data-time]');
    if (!cell) {
      await loadAvailability();
      scheduleFullRefreshIdle(15000);
      return;
    }

    dot.remove();
    refreshDotLayout(cell);

    const dc = cell.querySelector(".dot-container");
    if (dc && dc.querySelectorAll(".dot").length === 0) dc.remove();

    await applyGoldStateForCell(cell, cell.dataset.day);
    availabilityMetaByEntryId.delete(String(entryId));
    scheduleFullRefreshIdle(15000);
    return;
  }
  
  const cell = getAvailabilityCellFromEntry(entry);

  if (!cell) {
    if (payload.eventType === "DELETE") await loadAvailability();
    return;
  }

  // Helper: remove a dot for this entry
  function removeDot(entryObj) {
    let selector = null;

    if (entryObj.user_id) {
      selector = `.dot[data-user-id="${entryObj.user_id}"]`;
    } else if (entryObj.name) {
      selector = `.dot[data-name="${CSS.escape(entryObj.name)}"]`;
    } else {
      return;
    }

    const dot = cell.querySelector(selector);
    if (dot) dot.remove();

    refreshDotLayout(cell);

    const dc = cell.querySelector(".dot-container");
    if (dc && dc.querySelectorAll(".dot").length === 0) dc.remove();
  }

  // DELETE: remove dot then re-evaluate gold state
  if (payload.eventType === "DELETE") {
    removeDot(entry);
    await applyGoldStateForCell(cell, entry.day);
    scheduleFullRefreshIdle(15000);
    return;
  }

  // INSERT/UPDATE should never override gold visuals by adding dots
  // If it IS gold, dots are intentionally hidden.
  if (cell.classList.contains("gold-cell")) {
    const prof = entry.user_id ? await getProfileCached(entry.user_id) : null;
    const displayName = prof?.name || entry.name || "—";
    const localColorMap = await fetchBoardLocalColorMap(currentTable.id, [entry.user_id]);
    const displayColor = localColorMap[entry.user_id] || prof?.color || entry.color || "#999";

  ensureLegendUser({ ...entry, name: displayName, color: displayColor });

  await applyGoldStateForCell(cell, entry.day);
  scheduleFullRefreshIdle(15000);
  return;
}

  // Ensure dot container exists (only for non-gold cells)
  let dotContainer = cell.querySelector(".dot-container");

if (!dotContainer) {
  dotContainer = document.createElement("div");
  dotContainer.className = "dot-container";

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
}

  // For UPDATE: easiest is remove then add back (rare)
  if (payload.eventType === "UPDATE") {
    removeDot(entry);
  }

  // If dot already exists (often from optimistic UI), do NOT add another.
  const alreadyHasDot =
    (entry.user_id && cell.querySelector(`.dot[data-user-id="${entry.user_id}"]`)) ||
    (!entry.user_id && entry.name && cell.querySelector(`.dot[data-name="${CSS.escape(entry.name)}"]`));

  // Prefer latest profile name/color
  const prof = entry.user_id ? await getProfileCached(entry.user_id) : null;
  const displayName = prof?.name || entry.name || "—";
  const localColorMap = await fetchBoardLocalColorMap(currentTable.id, [entry.user_id]);
  const displayColor = localColorMap[entry.user_id] || prof?.color || entry.color || "#999";

    if (!alreadyHasDot) {
    const dot = document.createElement("div");
    dot.className = "dot";

    if (entry?.id != null) dot.dataset.entryId = String(entry.id);

    dot.style.background = displayColor;

    if (entry.user_id) dot.dataset.userId = entry.user_id;
    dot.dataset.name = displayName;

    dotContainer.appendChild(dot);
  } else {
    // If it exists (optimistic), update its displayed values just in case
    const existing = entry.user_id
      ? cell.querySelector(`.dot[data-user-id="${entry.user_id}"]`)
      : (entry.name ? cell.querySelector(`.dot[data-name="${CSS.escape(entry.name)}"]`) : null);

      if (existing) {
      if (entry?.id != null) existing.dataset.entryId = String(entry.id);

      existing.style.background = displayColor;
      existing.dataset.name = displayName;
      delete existing.dataset.pending;
    }
  }

  refreshDotLayout(cell);
  ensureLegendUser({ ...entry, name: displayName, color: displayColor });
  
  // Now that dot is present, see if we should flip to gold (this will remove dots container if needed)
  await applyGoldStateForCell(cell, entry.day);

  scheduleFullRefreshIdle(15000);
}

//----------  
async function userStillHasBoardAccess() {
  if (!currentTable?.id) return false;

  // Owner ?m= view always has access through owner token flow
  if (manageToken) return true;

  const au = getUser?.();
  if (!au?.id) return false;

  const { data, error } = await supabase
    .from("board_members")
    .select("user_id")
    .eq("board_id", currentTable.id)
    .eq("user_id", au.id)
    .maybeSingle();

  if (error) {
    console.warn("Access check failed:", error);
    return false;
  }

  return !!data;
}

//----------  
async function kickOutIfNoBoardAccess() {
  const hasAccess = await userStillHasBoardAccess();
  if (hasAccess) return false;

  alert("You have been removed from this calendar.");
  window.location.href = "/";
  return true;
}

//----------  
function subscribeRealtime() {
  if (!currentTable) return;

  // Clean up existing channels (important if loadTable runs again)
  if (availabilityChannel) supabase.removeChannel(availabilityChannel);
  if (tableChannel) supabase.removeChannel(tableChannel);
  if (membershipChannel) supabase.removeChannel(membershipChannel);

  // Availability changes for this board
  availabilityChannel = supabase
    .channel(`availability:${currentTable.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "availability_dev",
        filter: `table_id=eq.${currentTable.id}`
      },
      async (payload) => {
        await handleAvailabilityChange(payload);
      }
    )
    .subscribe((status) => {
      log("availability channel:", status);
    });

    const auId = getUser()?.id;

if (auId && currentTable?.id) {
  membershipChannel = supabase
    .channel(`membership:${currentTable.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "board_members",
        filter: `board_id=eq.${currentTable.id}`
      },
async (payload) => {      
  const before = payload.old || {};
  const after = payload.new || {};

  const localColourOnlyChange =
    payload.eventType === "UPDATE" &&
    before.user_id === after.user_id &&
    before.board_id === after.board_id &&
    before.role === after.role &&
    before.local_color !== after.local_color;

  const relevantMembershipChange =
    payload.eventType === "INSERT" ||
    payload.eventType === "DELETE" ||
    before.user_id !== after.user_id ||
    before.board_id !== after.board_id ||
    before.role !== after.role ||
    before.local_color !== after.local_color;

  if (!relevantMembershipChange) return;

  // Non-owner views still need access checking
  if (!manageToken) {
    const kicked = await kickOutIfNoBoardAccess();
    if (kicked) return;
  }

// Local colour changes only need a visual availability/legend refresh.
// They do not need table meta refresh or "last updated" churn.
if (localColourOnlyChange) {
  const changedUserId = after.user_id;
  const changedColour = after.local_color || null;

  if (changedUserId && changedColour) {
    applyLocalColourUpdateInPlace(changedUserId, changedColour);
  }

  return;
}

await loadAvailability();
await refreshCurrentTableMeta();
renderCalendarLastUpdated();
      }
    )
    .subscribe((status) => {
      log("membership channel:", status);
    });
}
  
  // Board changes (start_date / row_structure / gold_threshold updates)
  tableChannel = supabase
    .channel(`table:${currentTable.id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "tables",
        filter: `id=eq.${currentTable.id}`
      },
      async (payload) => {
        const prevTable = currentTable;
        currentTable = { ...currentTable, ...payload.new };
        window.currentTable = currentTable;

        const structureChanged =
          prevTable?.start_date !== currentTable?.start_date ||
          JSON.stringify(prevTable?.row_structure) !== JSON.stringify(currentTable?.row_structure) ||
          prevTable?.gold_threshold !== currentTable?.gold_threshold;

        if (structureChanged) {
          buildCalendar();
          await loadAvailability();
          renderGoldThreshold();
        }
      }
      )
    .subscribe((status) => {
      log("table channel:", status);
    });
}


window.scheduleFullRefreshIdle = scheduleFullRefreshIdle;
window.getWholeDayCellFromEntry = getWholeDayCellFromEntry;
window.getAvailabilityCellFromEntry = getAvailabilityCellFromEntry;
window.handleAvailabilityChange = handleAvailabilityChange;
window.userStillHasBoardAccess = userStillHasBoardAccess;
window.kickOutIfNoBoardAccess = kickOutIfNoBoardAccess;
window.subscribeRealtime = subscribeRealtime;
