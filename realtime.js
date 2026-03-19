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
    if (!window.currentTable) return;

    await window.loadAvailability();
    await window.refreshCurrentTableMeta();
    window.renderCalendarLastUpdated();
  }, ms);
}

//----------
function getWholeDayCellFromEntry(entry) {
  if (!entry || !window.currentTable?.start_date) return null;

  const dayNum = Number(entry.day);
  if (!Number.isFinite(dayNum) || dayNum < 1) return null;

  const dateKey = window.addDaysYMD(window.currentTable.start_date, dayNum - 1);
  return document.querySelector(`.whole-day-cell[data-date-key="${dateKey}"]`);
}

//----------
function getAvailabilityCellFromEntry(entry) {
  if (window.isWholeDayBoard()) {
    return getWholeDayCellFromEntry(entry);
  }

  return window.table.querySelector(
    `td[data-day="${entry.day}"][data-time="${entry.time}"]`
  );
}

//----------
async function handleAvailabilityChange(payload) {
  const entry = payload.eventType === "DELETE" ? payload.old : payload.new;
  if (!entry) return;

  window.cellTooltipCache.clear();

  if (payload.eventType !== "DELETE" && entry?.id != null) {
    window.availabilityMetaByEntryId.set(String(entry.id), {
      day: String(entry.day),
      time: String(entry.time)
    });
  }

  // DELETE: remove exact dot by DB row id, even if payload only contains { id }
  if (payload.eventType === "DELETE") {
    const entryId = entry?.id;

    if (entryId == null) {
      await window.loadAvailability();
      scheduleFullRefreshIdle(15000);
      return;
    }

    const dot = window.table.querySelector(`.dot[data-entry-id="${String(entryId)}"]`);

    if (!dot) {
      const pendingCell = window.pendingDeleteCellByEntryId.get(String(entryId));
      const knownCell = pendingCell || window.availabilityMetaByEntryId.get(String(entryId));

      if (pendingCell) {
        window.pendingDeleteCellByEntryId.delete(String(entryId));
      }

      if (knownCell) {
        const cell = window.isWholeDayBoard()
          ? getWholeDayCellFromEntry({ day: knownCell.day, time: knownCell.time })
          : window.table.querySelector(
              `td[data-day="${knownCell.day}"][data-time="${knownCell.time}"]`
            );

        if (cell) {
          await window.rebuildDotsForCell(cell);
          await window.applyGoldStateForCell(cell, knownCell.day);
          window.availabilityMetaByEntryId.delete(String(entryId));
          return;
        }
      }

      await window.loadAvailability();
      scheduleFullRefreshIdle(15000);
      return;
    }

    const cell = window.isWholeDayBoard()
      ? dot.closest(".whole-day-cell[data-day][data-time]")
      : dot.closest('td[data-day][data-time]');

    if (!cell) {
      await window.loadAvailability();
      scheduleFullRefreshIdle(15000);
      return;
    }

    dot.remove();
    window.refreshDotLayout(cell);

    const dc = cell.querySelector(".dot-container");
    if (dc && dc.querySelectorAll(".dot").length === 0) dc.remove();

    await window.applyGoldStateForCell(cell, cell.dataset.day);
    window.availabilityMetaByEntryId.delete(String(entryId));
    scheduleFullRefreshIdle(15000);
    return;
  }

  const cell = getAvailabilityCellFromEntry(entry);

  if (!cell) {
    if (payload.eventType === "DELETE") await window.loadAvailability();
    return;
  }

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

    window.refreshDotLayout(cell);

    const dc = cell.querySelector(".dot-container");
    if (dc && dc.querySelectorAll(".dot").length === 0) dc.remove();
  }

  if (payload.eventType === "DELETE") {
    removeDot(entry);
    await window.applyGoldStateForCell(cell, entry.day);
    scheduleFullRefreshIdle(15000);
    return;
  }

  if (cell.classList.contains("gold-cell")) {
    const prof = entry.user_id ? await window.getProfileCached(entry.user_id) : null;
    const displayName = prof?.name || entry.name || "—";
    const localColorMap = await window.fetchBoardLocalColorMap(window.currentTable.id, [entry.user_id]);
    const displayColor = localColorMap[entry.user_id] || prof?.color || entry.color || "#999";

    window.ensureLegendUser({ ...entry, name: displayName, color: displayColor });

    await window.applyGoldStateForCell(cell, entry.day);
    scheduleFullRefreshIdle(15000);
    return;
  }

  let dotContainer = cell.querySelector(".dot-container");

  if (!dotContainer) {
    dotContainer = document.createElement("div");
    dotContainer.className = "dot-container";

    if (window.isWholeDayBoard()) {
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

  if (payload.eventType === "UPDATE") {
    removeDot(entry);
  }

  const alreadyHasDot =
    (entry.user_id && cell.querySelector(`.dot[data-user-id="${entry.user_id}"]`)) ||
    (!entry.user_id &&
      entry.name &&
      cell.querySelector(`.dot[data-name="${CSS.escape(entry.name)}"]`));

  const prof = entry.user_id ? await window.getProfileCached(entry.user_id) : null;
  const displayName = prof?.name || entry.name || "—";
  const localColorMap = await window.fetchBoardLocalColorMap(window.currentTable.id, [entry.user_id]);
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

  window.refreshDotLayout(cell);
  window.ensureLegendUser({ ...entry, name: displayName, color: displayColor });

  await window.applyGoldStateForCell(cell, entry.day);

  scheduleFullRefreshIdle(15000);
}

//----------
async function userStillHasBoardAccess() {
  if (!window.currentTable?.id) return false;

  if (window.manageToken) return true;

  const au = window.getUser?.();
  if (!au?.id) return false;

  const { data, error } = await window.supabase
    .from("board_members")
    .select("user_id")
    .eq("board_id", window.currentTable.id)
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
  if (!window.currentTable) return;

  if (availabilityChannel) window.supabase.removeChannel(availabilityChannel);
  if (tableChannel) window.supabase.removeChannel(tableChannel);
  if (membershipChannel) window.supabase.removeChannel(membershipChannel);

  availabilityChannel = window.supabase
    .channel(`availability:${window.currentTable.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "availability_dev",
        filter: `table_id=eq.${window.currentTable.id}`
      },
      async (payload) => {
        await handleAvailabilityChange(payload);
      }
    )
    .subscribe();

  const auId = window.getUser?.()?.id;

  if (auId && window.currentTable?.id) {
    membershipChannel = window.supabase
      .channel(`membership:${window.currentTable.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "board_members",
          filter: `board_id=eq.${window.currentTable.id}`
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

          if (!window.manageToken) {
            const kicked = await kickOutIfNoBoardAccess();
            if (kicked) return;
          }

          if (localColourOnlyChange) {
            const changedUserId = after.user_id;
            const changedColour = after.local_color || null;

            if (changedUserId && changedColour) {
              window.applyLocalColourUpdateInPlace(changedUserId, changedColour);
            }

            return;
          }

          await window.loadAvailability();
          await window.refreshCurrentTableMeta();
          window.renderCalendarLastUpdated();
        }
      )
      .subscribe();
  }

  tableChannel = window.supabase
    .channel(`table:${window.currentTable.id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "tables",
        filter: `id=eq.${window.currentTable.id}`
      },
      async (payload) => {
        const prevTable = window.currentTable;
        window.currentTable = { ...window.currentTable, ...payload.new };

        const structureChanged =
          prevTable?.start_date !== window.currentTable?.start_date ||
          JSON.stringify(prevTable?.row_structure) !== JSON.stringify(window.currentTable?.row_structure) ||
          prevTable?.gold_threshold !== window.currentTable?.gold_threshold;

        if (structureChanged) {
          buildCalendar();
          await window.loadAvailability();
          renderGoldThreshold();
        }
      }
    )
    .subscribe();
}

window.scheduleFullRefreshIdle = scheduleFullRefreshIdle;
window.getWholeDayCellFromEntry = getWholeDayCellFromEntry;
window.getAvailabilityCellFromEntry = getAvailabilityCellFromEntry;
window.handleAvailabilityChange = handleAvailabilityChange;
window.userStillHasBoardAccess = userStillHasBoardAccess;
window.kickOutIfNoBoardAccess = kickOutIfNoBoardAccess;
window.subscribeRealtime = subscribeRealtime;
