// Depends on board-setup.js being loaded first
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAuthModule } from "./auth.js";

// =========================
// DEBUG HELPERS
// =========================

const DEBUG = false;
function log(...args) { if (DEBUG) console.log(...args); }
function warn(...args) { if (DEBUG) console.warn(...args); }



// =========================
// SUPABASE CREDENTIALS
// =========================

const SUPABASE_URL = "https://btuuowyvemesakjzkkzv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0dXVvd3l2ZW1lc2Franpra3p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0ODIwMDEsImV4cCI6MjA3NzA1ODAwMX0.QsDXg8AigiKUnpBUomprfbhx3RHzu-m12s2t4SKrhgM";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
window.supabase = supabase;



// =========================
// URL / GLOBAL CONSTANTS
// =========================

const params = new URLSearchParams(window.location.search);
const inviteToken = params.get("t");
const manageToken = params.get("m");
window.manageToken = manageToken;
const pendingAdds = new Set();   // prevent spam insert per user+cell
const inFlightCells = new Set(); // per-cell lock
const pendingDeleteCellByEntryId = new Map(); // entryId -> { day, time }
window.pendingDeleteCellByEntryId = pendingDeleteCellByEntryId;
const availabilityMetaByEntryId = new Map(); // entryId -> { day, time }
window.availabilityMetaByEntryId = availabilityMetaByEntryId; 
const IS_PRO = false;
const FREE_BOARD_MEMBER_LIMIT = 5;
const PRO_BOARD_MEMBER_LIMIT = 30;
const MAX_BOARD_NAME_LENGTH = 50;





// =========================
// STATIC CONFIG
// =========================

const PREBUILT_STRUCTURES = {
  am_pm: [
    { label: "AM" },
    { label: "PM" }
  ],

  meals: [
    { label: "Breakfast" },
    { label: "Lunch" },
    { label: "Dinner" }
  ],

  school_times: [
    { label: "Before School" },
    { label: "After School" },
    { label: "After Dinner" }
  ],

  workday: [
    { label: "Before Work" },
    { label: "Lunch Break" },
    { label: "After Work" }
  ],

  shifts: [
    { label: "Morning Shift" },
    { label: "Day Shift" },
    { label: "Afternoon Shift" },
    { label: "Night Shift" }
  ]
};

const COLOUR_PRESETS = [
  // Reds
  "#7F1D1D", "#B91C1C", "#DC2626", "#EF4444", "#F87171",
  // Rose / pinks
  "#9D174D", "#DB2777", "#EC4899", "#F472B6", "#F9A8D4",
  // Oranges / ember
  "#9A3412", "#C2410C", "#EA580C", "#F97316", "#FDBA74",
  // Gold / amber / yellow
  "#A16207", "#CA8A04", "#EAB308", "#FACC15", "#FDE68A",
  // Greens
  "#166534", "#16A34A", "#22C55E", "#4ADE80", "#86EFAC",
  // Teals
  "#115E59", "#0F766E", "#14B8A6", "#2DD4BF", "#99F6E4",
  // Blues
  "#1D4ED8", "#2563EB", "#3B82F6", "#60A5FA", "#93C5FD",
  // Purples
  "#6D28D9", "#7C3AED", "#8B5CF6", "#A78BFA", "#C4B5FD"
];



// =========================
// GLOBAL RUNTIME STATE
// =========================

let currentTable = null;
window.currentTable = currentTable;
let loadAvailabilityRunning = false;
let loadAvailabilityQueued = false;
let noteDraftBeforeEdit = "";
let setupSelectedColour = "#3b82f6";
let identitySelectedColour = "#2d7ff9";  
window.selectedStructure = null;
window.customStructureLabels = [];
window.populateHostTimezoneSelect = populateHostTimezoneSelect;
let isBoardOwner = false;
let profilesCache = {};
window.profilesCache = profilesCache;
let uiListenersBound = false;
let inviteContext = { inviteToken: null, boardName: "" };
let colourModalMode = "profile";   // "profile" | "local"
let colourModalBoardId = null;
let cellTooltipCache = new Map(); // key: "day|time" -> [{ name, color }]
window.cellTooltipCache = cellTooltipCache;
let mustChooseLocalBoardColour = false;



// =========================
// GLOBAL USER STATE
// =========================

let user = null;
window.user = user;

const getUser = () => user;
window.getUser = getUser;
const setUser = (nextUser) => {
  user = nextUser;
  window.user = user;
};
window.setUser = setUser;



// =========================
// NAVIGATION HELPERS
// =========================

window.openBoard = function (inviteToken) {
  window.location.href = `${window.location.pathname}?t=${encodeURIComponent(inviteToken)}`;
};

//----------
window.openManageBoard = function (manageToken) {
  window.location.href = `${window.location.pathname}?m=${encodeURIComponent(manageToken)}`;
};

//----------
function showDashboard() {
  document.body.style.visibility = "visible";
  document.body.classList.remove("show-landing-bg");
  
  const dash = document.getElementById("dashboard");
  if (dash) dash.style.display = "block";
}

//----------
async function showCreateBoard() {
  document.body.style.visibility = "visible";

  const au = await auth.getAuthUser();
  if (!au) {
    auth.showAuthOverlay("Please sign in before creating a calendar.");
    return;
  }

  const hostedCount = await getHostedBoardCount();
    if (!IS_PRO && hostedCount >= 2){
      showConfirmPopup(
        "The free version only allows up to 2 Hosted Calendars. Unlock up to 10 with Pro (Coming Soon!).",
        { title: "Hosted Calendar Limit" }
      );
      return;
    }

  const dash = document.getElementById("dashboard");
  if (dash) dash.style.display = "none";

  const create = document.getElementById("create-board");
  if (create) create.style.display = "block";

  if (typeof window.showBoardSetup === "function") {
    window.showBoardSetup();
  }
}

//----------
function showRouteError() {
  document.body.style.visibility = "visible";

  // Hide other screens
  const dash = document.getElementById("dashboard");
  if (dash) dash.style.display = "none";
  const setup = document.getElementById("profile-setup");
  if (setup) setup.style.display = "none";

  // Show error panel
  const err = document.getElementById("route-error");
  if (err) err.style.display = "block";
}

//----------
function showBoardView() {
  const dash = document.getElementById("dashboard");
  if (dash) dash.style.display = "none";

  const setup = document.getElementById("profile-setup");
  if (setup) setup.style.display = "none";

  document.body.style.visibility = "visible";
}



// =========================
// GENERAL UI HELPERS
// =========================

function showConfirmPopup(message, { title = "Notice", onOk, showOk = true } = {}) {
  const overlay = document.getElementById("notice-overlay");
  const msgEl = document.getElementById("notice-message");
  const titleEl = document.getElementById("notice-title");
  const okBtn = document.getElementById("notice-ok");
  const spinner = document.getElementById("notice-spinner");

  if (!overlay || !msgEl || !titleEl || !okBtn || !spinner) return;

  titleEl.textContent = title;
  msgEl.textContent = message;

  // Show spinner only while processing
  spinner.style.display = showOk ? "none" : "block";

  // Show OK only when finished
  okBtn.style.display = showOk ? "inline-flex" : "none";

  overlay.style.display = "flex";

  okBtn.onclick = null;
  okBtn.onclick = () => {
    overlay.style.display = "none";
    if (typeof onOk === "function") onOk();
  };
}

//----------
function confirmModal({ title = "Confirm", message = "Are you sure?", okText = "OK", cancelText = "Cancel" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirm-modal");
    const titleEl = document.getElementById("confirm-title");
    const msgEl = document.getElementById("confirm-message");
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    if (!overlay || !titleEl || !msgEl || !okBtn || !cancelBtn) {
      // Fallback if modal is missing
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    // Hide cancel button if no cancelText supplied
      if (!cancelText) {
        cancelBtn.style.display = "none";
      } else {
        cancelBtn.style.display = "";
      }

    const cleanup = () => {
      overlay.hidden = true;
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.removeEventListener("click", onOverlayClick, true);
      okBtn.removeEventListener("click", onOk, true);
      cancelBtn.removeEventListener("click", onCancel, true);
    };

    const onOk = (e) => { e.preventDefault(); cleanup(); resolve(true); };
    const onCancel = (e) => { e.preventDefault(); cleanup(); resolve(false); };

    const onOverlayClick = (e) => {
      // Clicking outside the card cancels
      const card = e.target.closest(".modal-card");
      if (!card) { cleanup(); resolve(false); }
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") { cleanup(); resolve(false); }
      if (e.key === "Enter") { cleanup(); resolve(true); }
    };

    overlay.hidden = false;

    document.addEventListener("keydown", onKeyDown, true);
    overlay.addEventListener("click", onOverlayClick, true);
    okBtn.addEventListener("click", onOk, true);
    cancelBtn.addEventListener("click", onCancel, true);

    // Focus the safe option
    cancelBtn.focus();
  });
}

//----------
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
window.escapeHtml = escapeHtml;

//----------
function possessive(name) {
  if (!name) return "";
  const trimmed = name.trim();

  // If the name already ends with "s" → James' Dashboard
  if (trimmed.toLowerCase().endsWith("s")) {
    return `${trimmed}'`;
  }

  return `${trimmed}'s`;
}

//----------
function addKey(tableId, day, time, userId) {
  return `${tableId}|${day}|${time}|${userId}`;
}

//----------
function generateToken() {
  return crypto.randomUUID() + crypto.randomUUID();
}

function getBoardMemberLimit() {
  return IS_PRO ? PRO_BOARD_MEMBER_LIMIT : FREE_BOARD_MEMBER_LIMIT;
}



// =========================
// CALENDAR TOPBAR / META HELPERS
// =========================

async function refreshBoardOwnerFlag() {
  isBoardOwner = false;

  const au = await auth.getAuthUser();
  if (!au || !currentTable?.id) return;

  // Primary: owner_id on tables row
  if (currentTable.owner_id && currentTable.owner_id === au.id) {
    isBoardOwner = true;
  } else {
    // Fallback: board_members role
    const { data, error } = await supabase
      .from("board_members")
      .select("role")
      .eq("board_id", currentTable.id)
      .eq("user_id", au.id)
      .maybeSingle();

    if (!error) isBoardOwner = data?.role === "owner";
  }

  const editBtn = document.getElementById("footer-edit-btn");
  if (editBtn) editBtn.style.display = isBoardOwner ? "inline-flex" : "none";
}

//----------
function renderCalendarNote() {
  const ta = document.getElementById("footer-note-input");
  if (!ta) return;

  ta.value = String(currentTable?.calendar_note || "");
}

//----------
function setCalendarNoteEditing(on) {
  const ta = document.getElementById("footer-note-input");
  const actions = document.getElementById("footer-note-actions");
  const editBtn = document.getElementById("footer-edit-btn");

  if (!ta || !actions || !editBtn) return;

  if (!isBoardOwner) {
    ta.readOnly = true;
    actions.style.display = "none";
    editBtn.style.display = "none";
    return;
  }

  if (on) {
    noteDraftBeforeEdit = ta.value;
    ta.readOnly = false;
    actions.style.display = "flex";
    editBtn.style.display = "none";
    ta.focus();
  } else {
    ta.readOnly = true;
    actions.style.display = "none";
    editBtn.style.display = "inline-flex";
  }
}

//----------
async function saveCalendarNote() {
  if (!isBoardOwner || !currentTable?.id) return;

  const ta = document.getElementById("footer-note-input");
  const newVal = String(ta?.value || "");

  const { error } = await supabase
    .from("tables")
    .update({ calendar_note: newVal })
    .eq("id", currentTable.id);

  if (error) {
    alert(error.message || "Failed to save note.");
    return;
  }

  currentTable = { ...currentTable, calendar_note: newVal };
  window.currentTable = currentTable;
  renderCalendarNote();
  setCalendarNoteEditing(false);
}

//----------
function renderGoldThreshold() {
  const wrap = document.getElementById("calendar-gold-threshold");
  const value = document.getElementById("calendar-gold-value");

  if (!wrap || !value || !currentTable) return;

  value.textContent = currentTable.gold_threshold || 0;
  wrap.style.display = "block";
}

//----------
function renderCalendarTimezone() {
  const wrap = document.getElementById("calendar-timezone");
  const value = document.getElementById("calendar-timezone-value");

  if (!wrap || !value || !currentTable) return;

  value.textContent = currentTable.host_tz
    ? formatTimeZoneLabel(currentTable.host_tz)
    : "—";

  wrap.style.display = "block";
}

//----------
function renderCalendarTitle() {
  const el = document.getElementById("calendar-title");
  if (!el || !currentTable) return;

  el.textContent = currentTable.name || "Calendar";
}

//----------
function getLastUpdatedLabel(isoString) {
  if (!isoString) return "—";

  const then = new Date(isoString).getTime();
  const now = Date.now();

  if (!Number.isFinite(then)) return "—";

  const diffMs = Math.max(0, now - then);
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin <= 0) return "Just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hour ago";
  if (diffHr < 24) return `${diffHr} hours ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "1 day ago";
  return `${diffDay} days ago`;
}

//----------
function renderCalendarLastUpdated() {
  const wrap = document.getElementById("calendar-last-updated");
  const value = document.getElementById("calendar-last-updated-value");

  if (!wrap || !value || !currentTable) return;

  value.textContent = getLastUpdatedLabel(currentTable.last_activity_at);
  wrap.style.display = "block";
}
window.renderCalendarLastUpdated = renderCalendarLastUpdated;

//----------
async function refreshCurrentTableMeta() {
  if (!currentTable?.id) return;

  const { data, error } = await supabase
    .from("tables")
    .select("id, last_activity_at, gold_threshold, host_tz, name, structure_type")
    .eq("id", currentTable.id)
    .single();

  if (error || !data) return;

  currentTable = { ...currentTable, ...data };
  window.currentTable = currentTable;
}
window.refreshCurrentTableMeta = refreshCurrentTableMeta;

//----------
async function renderCalendarInviteStats() {
  const wrap = document.getElementById("calendar-invite-stats");
  const joinedEl = document.getElementById("calendar-invite-joined");
  const totalEl = document.getElementById("calendar-invite-total");

  if (!wrap || !joinedEl || !totalEl || !currentTable?.id) return;

  const memberCount = await getBoardMemberCount(currentTable.id);
  const memberLimit = getBoardMemberLimit();

  joinedEl.textContent = String(memberCount);
  totalEl.textContent = String(memberLimit);
  wrap.style.display = "block";
}



// =========================
// PRESENCE / LEGEND HELPERS
// =========================

function renderPresence() {
  const wrap = document.getElementById("presence");
  const countEl = document.getElementById("presence-count");
  if (!wrap || !countEl || !presenceChannel) return;

  const state = presenceChannel.presenceState(); // { key: [metas...] }
  const metas = Object.values(state).flat();
  const uniqueUsers = new Map();

  metas.forEach(m => {
    // de-dupe by user_id (a user can have multiple metas if multiple tabs)
    if (m.user_id) uniqueUsers.set(m.user_id, m);
  });

  wrap.style.display = "block";
  countEl.textContent = String(uniqueUsers.size || 0);
}

//----------
function subscribePresence() {
  if (!currentTable) return;

  // Clean up if re-subscribing
  if (presenceChannel) supabase.removeChannel(presenceChannel);

  // Ensure we have some identity to track
  const safeUserId = user?.id;
  if (!safeUserId) return; // no auth user yet, don’t track presence
  if (!localStorage.getItem("globalUserId")) localStorage.setItem("globalUserId", safeUserId);

  const safeName = user?.name || localStorage.getItem("globalUserName") || "Guest";

  presenceChannel = supabase
    .channel(`presence:${currentTable.id}`, {
      config: { presence: { key: safeUserId } }
    })
    .on("presence", { event: "sync" }, () => {
      renderPresence();
    })
    .on("presence", { event: "join" }, () => {
      renderPresence();
    })
    .on("presence", { event: "leave" }, () => {
      renderPresence();
    })
    .subscribe(async (status) => {
      // helpful during dev
      log("presence channel:", status);

      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          user_id: safeUserId,
          name: safeName,
          at: new Date().toISOString()
        });
      }
    });
}

//----------
function ensureLegendUser(entry) {
  if (!entry) return;
  const key = entry.user_id || entry.name;
  if (!key) return;

  const existing = entry.user_id
    ? legendList.querySelector(`.legend-item[data-user-id="${entry.user_id}"]`)
    : (entry.name ? legendList.querySelector(`.legend-item[data-name="${CSS.escape(entry.name)}"]`) : null);

  const currentUserId = user?.id || null;
  const currentUserName = String(user?.name || "").trim().toLowerCase();
  const normalisedRowName = String(entry.name || "").trim().toLowerCase();

  const isCurrentUser =
    !!(
      (currentUserId && entry.user_id && entry.user_id === currentUserId) ||
      (currentUserName && normalisedRowName && normalisedRowName === currentUserName)
    );

  if (existing) {
    existing.innerHTML = buildLegendRowHtml({
      userId: entry.user_id,
      name: entry.name,
      color: entry.color,
      showLocalColourAction: isCurrentUser
    });
    return;
  }

  const div = document.createElement("div");
  div.className = "legend-item";

  if (entry.user_id) div.dataset.userId = entry.user_id;
  else div.dataset.name = entry.name;

  div.innerHTML = buildLegendRowHtml({
    userId: entry.user_id,
    name: entry.name,
    color: entry.color,
    showLocalColourAction: isCurrentUser
  });

  legendList.appendChild(div);
}
window.ensureLegendUser = ensureLegendUser;

//----------
function buildLegendRowHtml({ userId, name, color, showLocalColourAction = false } = {}) {
  const safeName = escapeHtml(name || "—");
  const safeColor = color || "#999";

  return `
    <div class="color-box" style="background:${safeColor}"></div>

    <div class="legend-user-row">
      <div class="legend-user-name">${safeName}</div>

      ${
        showLocalColourAction
          ? `
            <button
              type="button"
              class="legend-local-colour-btn"
              data-action="change-local-colour">
              Change local colour
            </button>
          `
          : ""
      }
    </div>
  `;
}



// =========================
// IDENTITY / PROFILE HELPERS
// =========================

function buildUserFromStorage() {
  const name = localStorage.getItem("globalUserName");
  const color = localStorage.getItem("globalUserColor");
  if (!name || !color) return null;

  return {
    id: getOrCreateUserId(),
    name,
    color
  };
}

//----------
function saveIdentity() {
const input = document.getElementById("identity-name");

const name = (input?.value || "").trim();
const color = (identitySelectedColour || "").trim();

  if (!name) {
    alert("Please enter your name");
    return;
  }
  if (!color) {
    alert("Please choose a dot colour");
    return;
  }

  localStorage.setItem("globalUserName", name);
  localStorage.setItem("globalUserColor", color);
  getOrCreateUserId();

  // If we're on a board link, load it now (no full reload needed)
  if (inviteToken || manageToken) {
    loadTable();
  } else {
    location.reload();
  }
}

//----------
function getOrCreateUserId() {
  let id = localStorage.getItem("globalUserId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("globalUserId", id);
  }
  return id;
}

//----------
async function fetchProfilesMap(userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, name, color")
    .in("user_id", ids);

  if (error) {
    console.warn("fetchProfilesMap failed:", error);
    return {};
  }

  const map = {};
  (data || []).forEach(p => { map[p.user_id] = p; });
  return map;
}
window.fetchProfilesMap = fetchProfilesMap;

//----------
async function getProfileCached(userId) {
  if (!userId) return null;
  if (profilesCache[userId]) return profilesCache[userId];

  const map = await fetchProfilesMap([userId]);
  profilesCache = { ...profilesCache, ...map };
  window.profilesCache = profilesCache;
  return profilesCache[userId] || null;
}  
window.getProfileCached = getProfileCached;

//----------
async function fetchBoardLocalColorMap(boardId, userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!boardId || ids.length === 0) return {};

  const { data, error } = await supabase
    .from("board_members")
    .select("user_id, local_color")
    .eq("board_id", boardId)
    .in("user_id", ids);

  if (error) {
    console.warn("fetchBoardLocalColorMap failed:", error);
    return {};
  }

  const map = {};
  (data || []).forEach(row => {
    if (row?.user_id && row?.local_color) map[row.user_id] = row.local_color;
  });
  return map;
}
window.fetchBoardLocalColorMap = fetchBoardLocalColorMap;

//----------
async function getBoardColourUsage(boardId) {
  if (!boardId) {
    return {
      members: [],
      usedByOthers: new Set(),
      myEffectiveColour: null,
      myLocalColour: null,
      hasConflict: false
    };
  }

  const au = await auth.getAuthUser();
  if (!au?.id) {
    return {
      members: [],
      usedByOthers: new Set(),
      myEffectiveColour: null,
      myLocalColour: null,
      hasConflict: false
    };
  }

  const { data: members, error } = await supabase
    .from("board_members")
    .select("user_id, local_color")
    .eq("board_id", boardId);

  if (error) {
    console.warn("getBoardColourUsage board_members failed:", error);
    return {
      members: [],
      usedByOthers: new Set(),
      myEffectiveColour: null,
      myLocalColour: null,
      hasConflict: false
    };
  }

  const userIds = (members || []).map(m => m.user_id).filter(Boolean);
  const profilesMap = await fetchProfilesMap(userIds);
  profilesCache = { ...profilesCache, ...profilesMap };
  window.profilesCache = profilesCache;

  const resolvedMembers = (members || []).map(m => {
    const prof = m.user_id ? profilesMap[m.user_id] : null;
    const effectiveColor = m.local_color || prof?.color || null;

    return {
      user_id: m.user_id,
      local_color: m.local_color || null,
      profile_color: prof?.color || null,
      effective_color: effectiveColor
    };
  });

  const me = resolvedMembers.find(m => m.user_id === au.id) || null;
  const myEffectiveColour = me?.effective_color || null;
  const myLocalColour = me?.local_color || null;

  const usedByOthers = new Set();
  const usedByOthersMap = new Map();

  resolvedMembers
    .filter(m => m.user_id !== au.id)
    .forEach(m => {
      if (!m.effective_color) return;

    usedByOthers.add(m.effective_color);

    const prof = m.user_id ? profilesMap[m.user_id] : null;
    const displayName = (prof?.name || "Someone").trim() || "Someone";

    if (!usedByOthersMap.has(m.effective_color)) {
      usedByOthersMap.set(m.effective_color, []);
    }

    usedByOthersMap.get(m.effective_color).push(displayName);
  });

const hasConflict = !!(myEffectiveColour && usedByOthers.has(myEffectiveColour));

return {
  members: resolvedMembers,
  usedByOthers,
  usedByOthersMap,
  myEffectiveColour,
  myLocalColour,
  hasConflict
};
}

//----------
async function enforceUniqueBoardColourIfNeeded(boardId) {
  if (!boardId) return;

  const usage = await getBoardColourUsage(boardId);
  if (!usage.hasConflict) return;

  mustChooseLocalBoardColour = true;
  colourModalMode = "local";
  colourModalBoardId = boardId;

  if (typeof openColourModal === "function") {
    await openColourModal({ mode: "local", boardId });
  }
}

//----------
async function ensureMembership(boardId) {
  const au = await auth.getAuthUser();
  if (!au || !boardId) return false;

  const memberLimit = getBoardMemberLimit();

  const { data, error } = await supabase.rpc("join_board_if_space", {
    p_board_id: boardId,
    p_max_members: memberLimit
  });

  if (error) {
    console.error("ensureMembership RPC failed:", error);
    return false;
  }

  if (!data?.ok) {
    if (data?.reason === "board_full") {
      await confirmModal({
        title: "Calendar full",
        message: `This calendar already has ${memberLimit} users, which is the ${IS_PRO ? "Pro" : "free"} limit.`,
        okText: "OK",
        showCancel: false
      });
      return false;
    }

    console.error("ensureMembership rejected:", data);
    return false;
  }

  if (au.email) {
    const { error: acceptErr } = await supabase
      .from("board_invites")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: au.id
      })
      .eq("board_id", boardId)
      .eq("email", au.email.toLowerCase().trim())
      .is("accepted_at", null);

    if (acceptErr) {
      console.warn("Failed to mark invite accepted:", acceptErr);
    }
  }

  return true;
}

//----------
async function getBoardColorMap(boardId) {
  // 1) Get member user_ids for this board
  const { data: members, error: memErr } = await supabase
    .from("board_members")
    .select("user_id")
    .eq("board_id", boardId);

  if (memErr) {
    console.error("getBoardColorMap members error:", memErr);
    return {};
  }

  const userIds = (members || []).map(m => m.user_id).filter(Boolean);
  if (userIds.length === 0) return {};

  // 2) Fetch their profile colours
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("user_id,color")
    .in("user_id", userIds);

  if (profErr) {
    console.error("getBoardColorMap profiles error:", profErr);
    return {};
  }

  // 3) Build map
  const map = {};
  (profiles || []).forEach(p => {
    if (p?.user_id) map[p.user_id] = p.color || null;
  });
  return map;
}



// =========================
// TIMEZONE / DATE HELPERS
// =========================

async function loadTimezonesIntoSelect(selectEl) {
  if (!selectEl) return;

  // Prevent double-load
  if (selectEl.dataset.loaded === "1") return;
  selectEl.dataset.loaded = "1";

  // Show loading state
  selectEl.innerHTML = `<option value="">Loading timezones…</option>`;
  selectEl.disabled = true;

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";

  try {
    let zones = [];

    // Best option (fast, offline, modern browsers)
    if (Intl.supportedValuesOf && typeof Intl.supportedValuesOf === "function") {
      zones = Intl.supportedValuesOf("timeZone");
    }

    // Fallback: fetch a list
    if (!zones || zones.length === 0) {
      const res = await fetch("https://worldtimeapi.org/api/timezone");
      if (!res.ok) throw new Error("Timezone fetch failed");
      zones = await res.json();
    }

    // Build options
    selectEl.innerHTML = `<option value="">Select timezone…</option>` +
      zones.map(z => `<option value="${z}">${z}</option>`).join("");

    // Auto-select user's timezone if present
    if (localTz && zones.includes(localTz)) {
      selectEl.value = localTz;
    } else if (localTz) {
      // If not in list, still set it (some APIs differ slightly)
      selectEl.value = localTz;
    }

    selectEl.disabled = false;

    // Let any "enable Create" logic react
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (err) {
    console.error("Failed to load timezones:", err);
    // Don’t strand the user
    selectEl.innerHTML = `<option value="${localTz}">${localTz || "UTC"}</option>`;
    selectEl.value = localTz || "UTC";
    selectEl.disabled = false;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

//----------
function getDetectedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

//----------
function yyyyMmDdInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

//----------
function getUtcOffsetLabel(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit"
    }).formatToParts(new Date());

    const tzName = parts.find(p => p.type === "timeZoneName")?.value || "GMT";

    if (tzName === "GMT" || tzName === "UTC") return "GMT+0";
    return tzName.replace("UTC", "GMT");
  } catch {
    return "GMT";
  }
}

//----------
function formatTimeZoneLabel(timeZone, { detected = false } = {}) {
  const city = timeZone.includes("/")
    ? timeZone.split("/").pop().replaceAll("_", " ")
    : timeZone;

  const offset = getUtcOffsetLabel(timeZone);

  return detected
    ? `${city} (${offset}) — Detected`
    : `${city} (${offset})`;
}

//----------
function getAllTimeZones() {
  const detected = getDetectedTimeZone();

  if (Intl.supportedValuesOf) {
    const all = Intl.supportedValuesOf("timeZone");
    return Array.from(new Set([detected, ...all]));
  }

  return Array.from(new Set([
    detected,
    "UTC",
    "Australia/Brisbane",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Australia/Adelaide",
    "Australia/Perth",
    "Pacific/Auckland",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Asia/Bangkok",
    "Asia/Dubai",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "America/Vancouver"
  ]));
}

//----------
function getTimeZoneListPinned() {
  const detected = getDetectedTimeZone();
  const curated = [
    "UTC",
    "Australia/Brisbane",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Australia/Adelaide",
    "Australia/Perth",
    "Pacific/Auckland",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Asia/Bangkok",
    "Asia/Dubai",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "America/Vancouver"
  ];

  return {
    detected,
    zones: Array.from(new Set([detected, ...curated]))
  };
}

//----------
function populateHostTimezoneSelect(selectedValue) {
  const select = document.getElementById("host-timezone");
  if (!select) return;

  const { detected, zones } = getTimeZoneListPinned();
  select.innerHTML = "";

  zones.forEach((tz) => {
    const opt = document.createElement("option");
    opt.value = tz;
    opt.textContent = formatTimeZoneLabel(tz, { detected: tz === detected });
    select.appendChild(opt);
  });

  const otherOpt = document.createElement("option");
  otherOpt.value = "__other__";
  otherOpt.textContent = "Other…";
  select.appendChild(otherOpt);

  const finalValue = selectedValue && zones.includes(selectedValue)
    ? selectedValue
    : detected;

  select.value = finalValue;
  select.dataset.lastRealTimezone = finalValue;

  if (!select.dataset.otherBound) {
    select.addEventListener("change", async () => {
      if (select.value !== "__other__") return;

      const previousValue =
        select.dataset.lastRealTimezone ||
        finalValue ||
        detected;

      const chosen = await openTimezonePicker({
        initialQuery: ""
      });

      if (!chosen) {
        select.value = previousValue;
        return;
      }

      ensureTimezoneOption(select, chosen);
      select.value = chosen;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    select.dataset.otherBound = "1";
  }

  if (!select.dataset.trackBound) {
    select.addEventListener("change", () => {
      if (select.value && select.value !== "__other__") {
        select.dataset.lastRealTimezone = select.value;
      }
    });

    select.dataset.trackBound = "1";
  }
}

//----------
function ensureTimezoneOption(select, timeZone) {
  if (!select || !timeZone) return;

  let existing = Array.from(select.options).find(opt => opt.value === timeZone);
  if (existing) return;

  const otherOpt = Array.from(select.options).find(opt => opt.value === "__other__");

  const opt = document.createElement("option");
  opt.value = timeZone;
  opt.textContent = formatTimeZoneLabel(timeZone);

  if (otherOpt) {
    select.insertBefore(opt, otherOpt);
  } else {
    select.appendChild(opt);
  }
}

//----------
function getTimeZoneSearchText(timeZone) {
  const parts = timeZone.split("/");
  const city = parts[parts.length - 1]?.replaceAll("_", " ") || timeZone;
  const region = parts[0] || "";
  const label = formatTimeZoneLabel(timeZone);

  return `${timeZone} ${city} ${region} ${label}`.toLowerCase();
}

//----------
function filterTimeZones(query, zones) {
  const q = (query || "").trim().toLowerCase();

  if (!q) {
    return zones.slice(0, 80);
  }

  const starts = [];
  const includes = [];

  zones.forEach((tz) => {
    const text = getTimeZoneSearchText(tz);

    if (text.startsWith(q)) starts.push(tz);
    else if (text.includes(q)) includes.push(tz);
  });

  return [...starts, ...includes].slice(0, 80);
}

//----------
function openTimezonePicker({ initialQuery = "" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("timezone-modal");
    const input = document.getElementById("timezone-search");
    const results = document.getElementById("timezone-results");
    const cancelBtn = document.getElementById("timezone-cancel");

    if (!overlay || !input || !results || !cancelBtn) {
      resolve(null);
      return;
    }

    const allZones = getAllTimeZones();

    const render = (query) => {
      const matches = filterTimeZones(query, allZones);

      if (!matches.length) {
        results.innerHTML = `<div class="timezone-empty">No matching timezones found.</div>`;
        return;
      }

      results.innerHTML = "";
      matches.forEach((tz) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "timezone-result-btn";

        const city = tz.includes("/") ? tz.split("/").pop().replaceAll("_", " ") : tz;
        const region = tz.includes("/") ? tz.split("/")[0].replaceAll("_", " ") : "Timezone";

        btn.innerHTML = `
          <div class="timezone-result-main">${city} (${getUtcOffsetLabel(tz)})</div>
          <div class="timezone-result-sub">${region} • ${tz}</div>
        `;

        btn.addEventListener("click", () => {
          cleanup();
          resolve(tz);
        });

        results.appendChild(btn);
      });
    };

    const onInput = () => render(input.value);

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
        resolve(null);
      }
    };

    const onOverlayClick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const cleanup = () => {
      overlay.hidden = true;
      input.removeEventListener("input", onInput);
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.removeEventListener("click", onOverlayClick, true);
      cancelBtn.removeEventListener("click", onCancel, true);
    };

    overlay.hidden = false;
    input.value = initialQuery;
    render(initialQuery);

    input.addEventListener("input", onInput);
    document.addEventListener("keydown", onKeyDown, true);
    overlay.addEventListener("click", onOverlayClick, true);
    cancelBtn.addEventListener("click", onCancel, true);

    requestAnimationFrame(() => input.focus());
  });
}

//----------
function parseYMD(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

//----------
function addDaysYMD(startYmd, offsetDays) {
  const { y, m, d } = parseYMD(startYmd);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
window.addDaysYMD = addDaysYMD;

//----------  
function formatHeaderLabel(ymd) {
  const { y, m, d } = parseYMD(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" });
  const month = dt.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });
  return { weekday, monthDay: `${d} ${month}` };
}

//----------
function getWeekdayLabels7(timeZone) {
  const base = new Date(); // "now"
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    timeZone: timeZone || undefined
  });

    const labels = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      labels.push(fmt.format(d));
    }
    return labels;
}



// =========================
// BOARD / TABLE DATA LOADING
// =========================


async function getBoardMemberCount(boardId) {
  if (!boardId) return 0;

  const { count, error } = await supabase
    .from("board_members")
    .select("user_id", { count: "exact", head: true })
    .eq("board_id", boardId);

  if (error) {
    console.warn("Failed to load board member count:", error);
    return 0;
  }

  return count || 0;
}

//----------  
async function rollForwardIfNeeded(tableId) {
  const { data, error } = await supabase.rpc("roll_board_if_needed_rpc", {
    p_table_id: tableId
  });

  if (error) {
    console.error("roll_board_if_needed failed:", error);
    return 0;
  }

  return data || 0;
}

//----------  
async function getHostedBoardCount() {
  const au = await auth.getAuthUser();
  if (!au) return 0;

  const { count, error } = await supabase
    .from("board_members")
    .select("board_id", { count: "exact", head: true })
    .eq("user_id", au.id)
    .eq("role", "owner");

  if (error) {
    console.error("Failed to count hosted boards:", error);
    return 0;
  }

  return count || 0;
}

//----------  
async function loadBoards() {
  const au = await auth.getAuthUser();

  const { data, error } = await supabase
    .from("board_members")
    .select(`
      role,
      board_id,
      tables (
        id,
        name,
        invite_token,
        owner_token,
        row_structure,
        structure_type,
        start_date,
        host_tz,
        gold_threshold
      )
    `)
    .eq("user_id", au.id);

  if (error) {
    console.error(error);
    return;
  }

  const owned = (data || []).filter(x => x.role === "owner");
  const joined = (data || []).filter(x => x.role !== "owner");

  const ownedEl = document.getElementById("owned-boards");
  const joinedEl = document.getElementById("joined-boards");

// Hosted
const maxHostedSlots = 10;
const openHostedSlots = IS_PRO ? 10 : 2;

const hostedSlotsHtml = [];

for (let i = 0; i < maxHostedSlots; i++) {
  const b = owned[i];

  if (b?.tables) {
    hostedSlotsHtml.push(`
      <div
        class="board-pill board-pill--square"
        data-kind="hosted"
        data-board-id="${b.tables.id}"
        data-invite-token="${b.tables.invite_token}"
        data-owner-token="${b.tables.owner_token}"
      >
        <button class="board-actions-btn" type="button" aria-label="Calendar actions">+</button>

        <div class="board-actions-menu" hidden>
          <button class="board-actions-item" type="button" data-action="add-user">Add user</button>
          <button class="board-actions-item" type="button" data-action="delete">Delete</button>
        </div>

        <div class="board-pill-title board-pill-title--top">${escapeHtml(b.tables.name)}</div>
        <div class="board-preview" data-board-id="${b.tables.id}"></div>
        <div class="board-pill-meta">Hosted</div>
      </div>
    `);
    continue;
  }

  if (i < openHostedSlots) {
    hostedSlotsHtml.push(`
  <div class="board-pill board-pill--square board-pill--slot board-pill--slot-open" data-kind="hosted-empty">
    <div class="board-pill-title board-pill-title--top board-slot-spacer" aria-hidden="true">&nbsp;</div>
    <div class="board-slot-shell">
      <div class="board-slot-well">
        <div class="board-slot-ghost"></div>
      </div>
    </div>
    <div class="board-pill-meta board-slot-spacer" aria-hidden="true">&nbsp;</div>
  </div>
`);
  } else {
    hostedSlotsHtml.push(`
  <div class="board-pill board-pill--square board-pill--slot board-pill--slot-locked" data-kind="hosted-locked">
    <div class="board-pill-title board-pill-title--top board-slot-spacer" aria-hidden="true">&nbsp;</div>
    <div class="board-slot-shell">
      <div class="board-slot-well">
        <div class="board-slot-lock">🔒</div>
      </div>
    </div>
    <div class="board-pill-meta board-slot-spacer" aria-hidden="true">&nbsp;</div>
  </div>
`);
  }
}

ownedEl.innerHTML = hostedSlotsHtml.join("");

  // Joined (same look as hosted, no actions menu)
  if (!joined.length) {
    joinedEl.innerHTML = `<div class="empty-boards">No joined calendars</div>`;
  } else {
    joinedEl.innerHTML = joined.map(b => `
        <div 
        class="board-pill board-pill--square"
        data-kind="joined"
        data-board-id="${b.tables.id}"
        data-invite-token="${b.tables.invite_token}"
      >
    <button class="board-actions-btn" type="button" aria-label="Calendar actions">+</button>

    <div class="board-actions-menu" hidden>
      <button class="board-actions-item" type="button" data-action="remove">Remove calendar</button>
    </div>

    <div class="board-pill-title board-pill-title--top">${escapeHtml(b.tables.name)}</div>
    <div class="board-preview" data-board-id="${b.tables.id}"></div>
    <div class="board-pill-meta">Joined</div>
  </div>
`).join("");
  }

  // Render previews for both hosted + joined
  const allBoards = [...owned, ...joined];
  if (allBoards.length) renderBoardPreviews(allBoards);
}

//----------  
async function loadTable() {
  if (!inviteToken && !manageToken) return;

  const queryField = inviteToken ? "invite_token" : "owner_token";
  const tokenValue = inviteToken || manageToken;

  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .eq(queryField, tokenValue)
    .maybeSingle();

  if (error) {
  console.error("Error loading table:", error);
}

if (!data) {
  // No board exists for this token (e.g., DB wiped or invalid link)
  document.getElementById("create-board").style.display = "none";
  document.getElementById("calendar").style.display = "none";
    const topbar = document.getElementById("calendar-topbar");
      if (topbar) topbar.style.display = "none";
  legendDiv.style.display = "none";

  // optional: clear stale remembered board
  localStorage.removeItem("lastBoardToken");

  showRouteError();
  return;
}

currentTable = data;
window.currentTable = currentTable;
  
  // ⭐ remember this board for next time
if (inviteToken) {
  localStorage.setItem("lastBoardToken", inviteToken);
}

  // Roll board forward based on host timezone + start_date (any visitor can trigger)
await rollForwardIfNeeded(currentTable.id);

// Always refetch so the UI always uses the DB's current start_date/host_tz
const { data: refreshed, error: refreshErr } = await supabase
  .from("tables")
  .select("*")
  .eq("id", currentTable.id)
  .single();

if (!refreshErr && refreshed) {
  currentTable = refreshed;
  window.currentTable = currentTable;
}
  // Always hide board creation when viewing a board
document.getElementById("create-board").style.display = "none";

// Use Supabase Auth identity (not localStorage UUID)
const au = await auth.getAuthUser();
if (!au) {
  // Not signed in → show blurred auth overlay and stop interactions
  auth.showAuthOverlay();

  document.getElementById("identity-section").style.display = "none";
  document.getElementById("create-board").style.display = "none";

  // Show the calendar BEHIND the blur, but build it so there's something there
  document.getElementById("calendar").style.display = "block";
  document.getElementById("calendar-topbar").style.display = "flex";
  document.getElementById("dashboard").style.display = "none";
  const side = document.getElementById("calendar-side");
    if (side) side.style.display = "none";
  const footer = document.getElementById("board-footer");
    if (footer) footer.style.display = "none";

  await refreshBoardOwnerFlag();
    renderCalendarNote();
    setCalendarNoteEditing(false);

  // ✅ Build grid so cells exist (clicks will still do nothing because user is null)
  buildCalendar();

  // Optional: try loadAvailability (if RLS blocks selects while logged out, it’ll just stay empty)
  await loadAvailability();

  return;
}

const hydrated = await auth.hydrateUserFromAuth();
if (!hydrated) {
  auth.showProfileSetup();
  return;
}

const membershipOk = await ensureMembership(currentTable.id);
  if (!membershipOk) {
    document.getElementById("calendar").style.display = "none";
    document.getElementById("calendar-topbar").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    return;
  }

await enforceUniqueBoardColourIfNeeded(currentTable.id);

// User exists → show the calendar UI
document.getElementById("identity-section").style.display = "none";
document.getElementById("calendar").style.display = "block";
document.getElementById("calendar-topbar").style.display = "flex";
document.getElementById("dashboard").style.display = "none";
const side = document.getElementById("calendar-side");
  if (side) side.style.display = "flex";
const footer = document.getElementById("board-footer");
  if (footer) footer.style.display = "block";

// Now that UI is visible, start realtime + render
subscribeRealtime();
subscribePresence();

buildCalendar();
await loadAvailability();

await refreshBoardOwnerFlag();
renderCalendarNote();
setCalendarNoteEditing(false);
await renderCalendarInviteStats();
renderGoldThreshold();
renderCalendarTimezone();
renderCalendarTitle(); 
renderCalendarLastUpdated();
}

//----------  
async function loadAvailability() {
  // ✅ prevent overlapping renders that duplicate rows/cells
  if (loadAvailabilityRunning) {
    loadAvailabilityQueued = true;
    return;
  }

  loadAvailabilityRunning = true;

  try {
    if (!currentTable) return;

    cellTooltipCache.clear();

    if (isWholeDayBoard()) {
      // WHOLE DAY BRANCH
      await prunePastWholeDayAvailability();

      const { data: rows, error } = await supabase
        .from("availability_dev")
        .select("*")
        .eq("table_id", currentTable.id);

      if (error) {
        console.error("loadAvailability failed:", error);
        return;
      }

      renderWholeDayCalendar();
      renderWholeDayAvailability(rows || []);
      bindWholeDayCells();
      scheduleWholeDayMidnightRefresh();
      return;
    }
    
    const { data: rows, error } = await supabase
      .from("availability_dev")
      .select("*")
      .eq("table_id", currentTable.id);

    if (error) {
      console.error("loadAvailability failed:", error);
      return;
    }

    // Clear existing cells
    const cells = table.querySelectorAll('td[data-day]');
    cells.forEach(cell => {
      cell.innerHTML = "";
      cell.classList.remove("gold-cell");
    });

    if (!rows) return;

    const authUser = await auth.getAuthUser();
    const currentUserId = authUser?.id || user?.id || null;
    const currentUserName = String(user?.name || "").trim().toLowerCase();
    
    // Profiles map for latest name/color
    const profilesMap = await fetchProfilesMap(rows.map(r => r.user_id));
    profilesCache = { ...profilesCache, ...profilesMap };
    const localColorMap = await fetchBoardLocalColorMap(currentTable.id, rows.map(r => r.user_id));

    /* Legend */
    const users = {};
      rows.forEach(r => {
        const prof = r.user_id ? profilesMap[r.user_id] : null;

        const displayName = prof?.name || r.name || "—";
        const displayColor = localColorMap[r.user_id] || prof?.color || r.color || "#999";

        const key = r.user_id || displayName; // fallback for old rows without user_id

  if (!users[key]) {
    users[key] = {
      userId: r.user_id || null,
      name: displayName,
      color: displayColor
    };
  }
});

    legendList.innerHTML = "";
Object.values(users).forEach(({ userId, name, color }) => {
  const div = document.createElement("div");
  div.className = "legend-item";

  if (userId) div.dataset.userId = userId;
  else div.dataset.name = name;

  const normalisedRowName = String(name || "").trim().toLowerCase();
  const isCurrentUser =
    !!(
      (currentUserId && userId && userId === currentUserId) ||
      (currentUserName && normalisedRowName && normalisedRowName === currentUserName)
    );
  
  div.innerHTML = buildLegendRowHtml({
    userId,
    name,
    color,
    showLocalColourAction: isCurrentUser
  });

  legendList.appendChild(div);
});

    /* Group by cell */
    const map = {};
    rows.forEach(entry => {
      const key = `${entry.day}-${entry.time}`;
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    });

    const goldDays = new Set();
    const goldThreshold = Number(currentTable?.gold_threshold);
    const enableGold = Number.isFinite(goldThreshold);

    /* Render cells */
    table.querySelectorAll('td[data-day]').forEach(cell => {
      const day = cell.dataset.day;
      const time = cell.dataset.time;
      const key = `${day}-${time}`;
      const entries = map[key] || [];

      if (enableGold && entries.length >= goldThreshold) {
        cell.classList.add("gold-cell");
        goldDays.add(parseInt(day, 10));
        return;
      }

      if (entries.length > 0) {
        const dotContainer = document.createElement("div");
        dotContainer.className = "dot-container";

  entries.forEach(entry => {
    const dot = document.createElement("div");
    dot.className = "dot";

    if (entry?.id != null) {
      availabilityMetaByEntryId.set(String(entry.id), {
        day: String(entry.day),
        time: String(entry.time)
      });
    }
    if (entry?.id != null) dot.dataset.entryId = String(entry.id);
    if (entry.user_id) dot.dataset.userId = entry.user_id;

    const prof = entry.user_id ? profilesMap[entry.user_id] : null;
    const displayName = prof?.name || entry.name || "—";
    const displayColor = localColorMap[entry.user_id] || prof?.color || entry.color || "#999";

    dot.style.background = displayColor;
    dot.dataset.name = displayName;

    if (user && entry.user_id === user.id) {
      dot.classList.add("pop-in");
    }

    dotContainer.appendChild(dot);
  });

  cell.appendChild(dotContainer);
  window.refreshDotLayout(cell);
}
    });

    // Gold header highlighting
    const headerCells = table.querySelectorAll("th.day-header");
    headerCells.forEach(th => {
      const dayNum = parseInt(th.dataset.day, 10);
      if (goldDays.has(dayNum)) th.classList.add("gold-header");
      else th.classList.remove("gold-header");
    });

  } finally {
    loadAvailabilityRunning = false;

    if (loadAvailabilityQueued) {
      loadAvailabilityQueued = false;
      loadAvailability(); // run once more
    }
  }
}
window.loadAvailability = loadAvailability;

//----------  
function getBoardStartDate() {
  return currentTable?.start_date ? new Date(currentTable.start_date + "T00:00:00") : null;
}
window.getBoardStartDate = getBoardStartDate;

//----------  
function addDaysLocal(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
window.addDaysLocal = addDaysLocal;

//----------  
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
window.formatDateKey = formatDateKey;



// =========================
// BOARD CREATION / CONFIG
// =========================

function addRowInput(name = "") {
  const container = document.getElementById("rows-container");

    if (!container) return; // Prevent crash

    if (container.children.length >= 4) {
      alert("Free version allows up to 4 time blocks.");
      return;
    }

  const input = document.createElement("input");
  input.placeholder = "Time block (e.g. Dinner)";
  input.value = name;

  container.appendChild(input);
}

//----------  
async function createBoard() {
    // Gold threshold (now selected on the Name Your Calendar screen)
  const goldSelect =
    document.getElementById("gold-threshold") ||
    document.getElementById("gold-threshold-select") ||
    document.getElementById("goldThreshold") ||
    document.querySelector('select[data-gold-threshold]');

  const goldThreshold = parseInt(goldSelect?.value || "", 10);
  const au = await auth.getAuthUser();
    if (!au) {
      auth.showAuthOverlay("Please sign in before creating a calendar.");
      return;
    }
  
  const hostedCount = await getHostedBoardCount();

  if (!IS_PRO && hostedCount >= 2) {
    alert("The free version only allows up to 2 Hosted Calendars. Unlock up to 10 with Pro.");
    return;
  }
  
  const nameInput = document.getElementById("board-name");
  const name = nameInput.value.trim();

  if (!name) {
    alert("Please enter a board name");
    return;
  }

  if (name.length > MAX_BOARD_NAME_LENGTH) {
  alert(`Calendar name must be ${MAX_BOARD_NAME_LENGTH} characters or less.`);
  return;
}

  let timeBlocks = [];

const structureChoice = window.selectedStructure;

if (!structureChoice) {
  alert("Please choose a calendar structure");
  return;
}

if (structureChoice === "whole_day") {
  timeBlocks = [{ label: "All Day" }];
} else if (structureChoice === "custom") {
  timeBlocks = (window.customStructureLabels || [])
    .map(label => String(label || "").trim())
    .filter(Boolean)
    .map(label => ({ label }));

  if (timeBlocks.length === 0) {
    alert("Please define your custom rows first.");
    return;
  }
} else {
  timeBlocks = PREBUILT_STRUCTURES[structureChoice];
}

  if (timeBlocks.length === 0) {
    alert("Please add at least one time block");
    return;
  }

  const inviteToken = generateToken();
  const ownerToken = generateToken();
  const tzSelect = document.getElementById("host-timezone");
  const tz = tzSelect?.value || "";

if (!tz || tz === "__other__") {
  alert("Please choose a timezone");
  return;
}

const startDate = yyyyMmDdInTimeZone(new Date(), tz);
  
  // --- Gold threshold (required) ---
  if (!Number.isFinite(goldThreshold)) {
    alert("Please choose a gold threshold");
    return;
  }

    if (!Number.isFinite(goldThreshold) || goldThreshold < 2 || goldThreshold > 30) {
      alert("Gold threshold must be between 1 and 30.");
      return;
    }
  
    if (!IS_PRO && goldThreshold >= 6) {
      alert("Free version allows gold threshold up to 5.");
      return;
    }

  const { error } = await supabase
    .from("tables")
    .insert([{
      name,
      invite_token: inviteToken,
      owner_token: ownerToken,
      owner_id: au.id,
      row_structure: timeBlocks,
      structure_type: structureChoice,
      host_tz: tz,
      start_date: startDate,
      gold_threshold: goldThreshold
    }])

  if (error) {
    console.error("Error creating board:", error);
    return;
  }

  const { data: created, error: fetchErr } = await supabase
  .from("tables")
  .select("id")
  .eq("invite_token", inviteToken)
  .single();

if (fetchErr || !created) {
  console.error("Board insert succeeded but could not fetch id. Check SELECT RLS on tables.", fetchErr);
  return;
}

  const { error: bmErr } = await supabase
  .from("board_members")
  .upsert(
    {
      board_id: created.id,
      user_id: au.id,
      role: "owner"
    },
    { onConflict: "board_id,user_id" }
  );

if (bmErr) {
  console.warn("board_members owner upsert failed:", bmErr);
}

  // keep invite token for “share link” / last joined link if you want
localStorage.setItem("lastBoardToken", inviteToken);

// add this so “last opened as owner” is possible later
localStorage.setItem("lastBoardManageToken", ownerToken);

// ✅ open as owner after create
window.location.href = `/?m=${encodeURIComponent(ownerToken)}`;
}



// =========================
// CALENDAR BUILD / INTERACTION
// =========================

function buildCalendar() {
  const table = document.getElementById("availabilityTable");
  table.innerHTML = "";

  if (!currentTable) return;

  const times = currentTable.row_structure || [];
  const days = 30;

  // --- Header row (ONE time only) ---
  const headerRow = document.createElement("tr");
  headerRow.appendChild(document.createElement("th")); // top-left blank corner

  const startYmd =
    currentTable.start_date ||
    yyyyMmDdInTimeZone(new Date(), currentTable.host_tz || getDetectedTimeZone());

  for (let dayNum = 1; dayNum <= days; dayNum++) {
    const ymd = addDaysYMD(startYmd, dayNum - 1);
    const { weekday, monthDay } = formatHeaderLabel(ymd);
    const { d, m } = parseYMD(ymd);

    const isMonthBreak = dayNum !== 1 && d === 1;
    const monthLabel = new Date(Date.UTC(parseYMD(ymd).y, m - 1, d))
      .toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });

    const th = document.createElement("th");
    th.classList.add("day-header");
    if (isMonthBreak) th.classList.add("month-break");
    th.dataset.day = String(dayNum);

  th.innerHTML = `
  <div style="font-weight:700;">${weekday}</div>
  <span class="monthday">${monthDay}</span>
`;
  headerRow.appendChild(th);
}

  table.appendChild(headerRow);

  // --- Body rows (time blocks) ---
  times.forEach(timeObj => {
    const row = document.createElement("tr");

    const labelCell = document.createElement("td");
    labelCell.textContent = timeObj.label;
    labelCell.classList.add("time-label");
    row.appendChild(labelCell);

    for (let dayNum = 1; dayNum <= days; dayNum++) {
      const ymd = addDaysYMD(startYmd, dayNum - 1);
      const { d } = parseYMD(ymd);
      const isMonthBreak = dayNum !== 1 && d === 1;

      const cell = document.createElement("td");
      if (isMonthBreak) cell.classList.add("month-break");
        cell.dataset.day = String(dayNum);
        cell.dataset.time = timeObj.label;
        row.appendChild(cell);
    }

    table.appendChild(row);
  });

  bindCalendarClickDelegation();
}

//----------  
function removeMyDotFromCell(cell, userId) {
  if (!cell || !userId) return null;

  const dot = cell.querySelector(`.dot[data-user-id="${userId}"]`);
  if (!dot) return null;

  const snapshot = {
    userId,
    name: dot.getAttribute("title") || "",
    color: dot.style.background || "",
    pending: dot.getAttribute("data-pending") || ""
  };

  dot.remove();

  const dc = cell.querySelector(".dot-container");
  if (dc && dc.children.length === 0) dc.remove();

  return snapshot;
}

function restoreDotToCell(cell, snapshot) {
  if (!cell || !snapshot) return;
  addOptimisticDot(cell, snapshot.userId, snapshot.name, snapshot.color || "#999");

  const dot = cell.querySelector(`.dot[data-user-id="${snapshot.userId}"]`);
  if (dot && snapshot.pending) {
    dot.setAttribute("data-pending", snapshot.pending);
  }
}

//----------  
async function toggleCell(e) {
  const cell = e.currentTarget;

  const kickedOut = await kickOutIfNoBoardAccess();
  if (kickedOut) return;
  if (!currentTable || !cell) return;

  let k;

  try {
    const locked = isWholeDayBoard() && isWholeDayCellLocked(cell);
    if (locked) return;

    const dayNum = parseInt(cell.dataset.day, 10);
    const timeKey = String(cell.dataset.time || "").trim();
    if (!Number.isFinite(dayNum) || !timeKey) return;

    const au = await auth.getAuthUser();
    if (!au) return;

    const myUid = au.id;

    if (!user) {
      await auth.hydrateUserFromAuth();
    }

    const prof = user || await getProfileCached(myUid);
    if (!prof) return;

    k = addKey(currentTable.id, dayNum, timeKey, myUid);
    if (inFlightCells.has(k)) return;
    inFlightCells.add(k);

    const displayName = prof?.name || "—";
    const activeColor =
      (typeof getLocalBoardColor === "function" && getLocalBoardColor(currentTable.id, myUid)) ||
      prof?.color ||
      "#999";

    const { data: existingRow, error: existingErr } = await supabase
      .from("availability_dev")
      .select("id")
      .eq("table_id", currentTable.id)
      .eq("day", dayNum)
      .eq("time", timeKey)
      .eq("user_id", myUid)
      .maybeSingle();

if (existingErr) {
  console.warn("Existing row check failed:", existingErr);
  return;
}

const isTogglingOff = !!existingRow;
    
    if (isTogglingOff) {
      // optimistic remove first
      const removedSnapshot = removeOptimisticDot(cell, myUid);
      maybeApplyGoldForCell(cell);

      const { data: deletedRows, error: delErr } = await supabase
      .from("availability_dev")
      .delete()
      .eq("id", existingRow.id)
      .select("id");

      const deletedCount = deletedRows?.length || 0;

      if (delErr) {
        console.warn("Delete failed:", delErr);
        restoreOptimisticDot(cell, removedSnapshot);
        maybeApplyGoldForCell(cell);
        return;
      }

      let legacyDeletedCount = 0;
      let legacyDeletedRows = [];

      if (deletedCount === 0) {
        const { data, error: legacyErr } = await supabase
          .from("availability_dev")
          .delete()
          .eq("table_id", currentTable.id)
          .eq("day", dayNum)
          .eq("time", timeKey)
          .is("user_id", null)
          .eq("name", prof.name)
          .eq("color", prof.color)
          .select("id");

        if (legacyErr) {
          console.warn("Legacy delete failed:", legacyErr);
          restoreOptimisticDot(cell, removedSnapshot);
          maybeApplyGoldForCell(cell);
          return;
        }

        legacyDeletedRows = data || [];
        legacyDeletedCount = legacyDeletedRows.length;
      }

      // if nothing deleted, revert
      if (deletedCount === 0 && legacyDeletedCount === 0) {
        restoreOptimisticDot(cell, removedSnapshot);
        maybeApplyGoldForCell(cell);
        return;
      }

      const allDeletedRows = [
        ...(deletedRows || []),
        ...legacyDeletedRows
      ];

      for (const row of allDeletedRows) {
        if (row?.id != null) {
          pendingDeleteCellByEntryId.set(String(row.id), {
            day: String(dayNum),
            time: timeKey
          });
        }
      }

      return;
    }

    // optimistic add first
    if (pendingAdds.has(k)) return;
    pendingAdds.add(k);

    addOptimisticDot(cell, myUid, displayName, activeColor);
    maybeApplyGoldForCell(cell);

    // let browser paint before network work
    await new Promise(requestAnimationFrame);

    const insertPayload = {
      table_id: currentTable.id,
      day: dayNum,
      time: timeKey,
      user_id: myUid,
      name: displayName,
      color: activeColor
    };

    const { error: insErr } = await supabase
      .from("availability_dev")
      .insert(insertPayload);

    if (insErr) {
  // Already exists in DB -> UI was just slightly behind. Re-sync instead of treating as a real failure.
    if (insErr.code === "23505") {
      console.warn("Insert skipped: slot already exists, re-syncing cell.");

      cell.querySelector(`.dot[data-user-id="${myUid}"][data-pending="1"]`)
        ?.removeAttribute("data-pending");

    maybeApplyGoldForCell(cell);
    pendingAdds.delete(k);

    // Optional: reload to ensure UI matches DB
    await loadAvailability();
    return;
  }

  console.warn("Insert failed:", insErr);

  cell.querySelector(`.dot[data-user-id="${myUid}"][data-pending="1"]`)?.remove();

  const dc = cell.querySelector(".dot-container");
  if (dc && dc.children.length === 0) dc.remove();

  maybeApplyGoldForCell(cell);
  pendingAdds.delete(k);
  return;
}

    cell.querySelector(`.dot[data-user-id="${myUid}"][data-pending="1"]`)
      ?.removeAttribute("data-pending");

    maybeApplyGoldForCell(cell);
    pendingAdds.delete(k);

  } finally {
    if (k) {
      inFlightCells.delete(k);
      pendingAdds.delete(k);
    }
  }
}
window.toggleCell = toggleCell;

//----------  
function bindCalendarClickDelegation() {
  const table = document.getElementById("availabilityTable");
  window.table = table;
  if (!table || table.dataset.bound === "1") return;

  table.dataset.bound = "1";

  table.addEventListener("click", (e) => {
    const cell = e.target.closest("td[data-day][data-time]");
    if (!cell) return;
    toggleCell({ currentTarget: cell }); // reuse your existing toggleCell
  });
}



// =========================
// ACCOUNT / DASHBOARD PANELS
// =========================

function showAccountPanel() {
  document.body.classList.add("account-view");   // 👈 add this

  const dashBody = document.getElementById("dash-body");
  const acct = document.getElementById("dash-account");

  if (dashBody) dashBody.style.display = "none";
  if (acct) acct.style.display = "block";
}

//----------  
function showDashboardPanel() {
  document.body.classList.remove("account-view");  // 👈 add this

  const dashBody = document.getElementById("dash-body");
  const acct = document.getElementById("dash-account");

  if (acct) acct.style.display = "none";
  if (dashBody) dashBody.style.display = "block";
}

//----------  
async function hydrateAccountPanel() {
  try {
    const au = await auth.getAuthUser();

    // Email
    const emailEl = document.getElementById("acct-email");
    if (emailEl) emailEl.textContent = au?.email || "—";

    // Name
    const nameEl = document.getElementById("acct-name");
    if (nameEl) nameEl.textContent = user?.name || "—";

    // Colour
    const colour = user?.color || "";
    const dot = document.getElementById("acct-colour-dot");
    const txt = document.getElementById("acct-colour-text");
    if (dot) dot.style.background = colour || "transparent";
    if (txt) txt.textContent = colour ? colour.toUpperCase() : "—";
  } catch (e) {
    console.error("hydrateAccountPanel failed", e);
  }
}



// =========================
// ACCOUNT DELETE FLOW
// =========================

function showDeleteAccountOverlay(msg = "") {
  const ov = document.getElementById("delete-account-overlay");
  const m = document.getElementById("delete-account-msg");
  if (!ov) return;

  ov.style.display = "block";

  if (m) {
    if (msg) { m.style.display = "block"; m.textContent = msg; }
    else { m.style.display = "none"; m.textContent = ""; }
  }
}

//---------- 
function hideDeleteAccountOverlay() {
  const ov = document.getElementById("delete-account-overlay");
  if (ov) ov.style.display = "none";
}

//---------- 
async function deleteAccountFlow() {
  const au = await auth.getAuthUser();
  if (!au) {
    showDeleteAccountOverlay("You must be signed in.");
    return;
  }

  const email = (document.getElementById("acct-email")?.textContent || "").trim();
  const pass = (document.getElementById("delete-account-password")?.value || "").trim();
  const conf = (document.getElementById("delete-account-confirm")?.value || "").trim();

  if (!pass) return showDeleteAccountOverlay("Please enter your password.");
  if (conf !== "DELETE") return showDeleteAccountOverlay('Type DELETE to confirm.');

  // 1) Re-authenticate (proves password)
  const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (reauthErr) return showDeleteAccountOverlay(reauthErr.message || "Password incorrect.");

  // 2) Call Edge Function that performs deletions + auth user delete (service role)
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return showDeleteAccountOverlay("Session error. Please sign in again.");

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({ confirm: "DELETE" })
    });

    const out = await res.json().catch(() => ({}));

    if (!res.ok) {
      return showDeleteAccountOverlay(out?.error || "Delete failed.");
    }

    // 3) Sign out + reset UI
    await supabase.auth.signOut();
    hideDeleteAccountOverlay();

    // clear your local remembered stuff
    localStorage.removeItem("lastBoardToken");
    localStorage.removeItem("lastBoardManageToken");
    localStorage.removeItem("globalUserId");
    localStorage.removeItem("globalUserName");
    localStorage.removeItem("globalUserColor");

    window.location.href = window.location.pathname; // fresh state
  } catch (err) {
    console.error(err);
    showDeleteAccountOverlay("Network error while deleting account.");
  }
}



// =========================
// NAME / COLOUR / PASSWORD MODALS
// =========================

const nameModal = document.getElementById("name-modal");
const nameInput = document.getElementById("name-input");
const nameErr = document.getElementById("name-error");
const nameCancel = document.getElementById("name-cancel");
const nameSave = document.getElementById("name-save");
const nameCount = document.getElementById("name-count");

const colourModal = document.getElementById("colour-modal");
const colourGrid = document.getElementById("colour-grid");
const colourErr = document.getElementById("colour-error");
const colourCancel = document.getElementById("colour-cancel");
const colourSave = document.getElementById("colour-save");
const colourModalTitle = document.getElementById("colour-modal-title");
const colourModalBody = document.getElementById("colour-modal-body");

let selectedColour = null;

const pwModal = document.getElementById("password-modal");
const pwCurrent = document.getElementById("pw-current");
const pwNew = document.getElementById("pw-new");
const pwConfirm = document.getElementById("pw-confirm");
const pwErr = document.getElementById("pw-error");
const pwCancel = document.getElementById("pw-cancel");
const pwSave = document.getElementById("pw-save");

//----------
function openNameModal() {
  if (!nameModal || !nameInput || !nameErr) return;

  nameErr.style.display = "none";
  nameErr.textContent = "";
  nameInput.value = (user?.name || "").trim();
  updateNameCount();

  nameModal.hidden = false;
  nameInput.focus();
  nameInput.select();
}

//----------  
function closeNameModal() {
  if (!nameModal) return;
  nameModal.hidden = true;
}

//---------- 
function setNameError(msg) {
  if (!nameErr) return;
  nameErr.textContent = msg;
  nameErr.style.display = msg ? "block" : "none";
}

//----------  
function setColourError(msg){
  if (!colourErr) return;
  colourErr.textContent = msg || "";
  colourErr.style.display = msg ? "block" : "none";
}

//----------  
function normaliseHex(input){
  if (!input) return "";
  let v = input.trim().toUpperCase();
  if (v && !v.startsWith("#")) v = "#" + v;
  return v;
}

//----------  
function isValidHex(v){
  return /^#[0-9A-F]{6}$/.test(v);
}

//----------
function renderColourGrid(current, disabledSet = new Set(), usedByMap = new Map()) {
  if (!colourGrid) return;
  colourGrid.innerHTML = "";

  COLOUR_PRESETS.forEach(hex => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "colour-swatch";
    b.style.background = hex;
    b.setAttribute("aria-label", hex);
    b.dataset.hex = hex;

    const isSelected = !!(current && hex === current);
    const isDisabled = disabledSet.has(hex) && !isSelected;

    if (isSelected) b.classList.add("selected");

    if (isDisabled) {
      b.disabled = true;
      b.classList.add("disabled");
      b.setAttribute("aria-disabled", "true");

      const owners = usedByMap.get(hex) || [];
      const label =
        owners.length === 1
          ? `Used by ${owners[0]}`
          : owners.length > 1
            ? `Used by ${owners.join(", ")}`
            : "Already in use on this calendar";

      b.title = label;
    }

    b.addEventListener("click", () => {
      if (isDisabled) return;

      selectedColour = hex;

      [...colourGrid.querySelectorAll(".colour-swatch")].forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");

      setColourError("");
    });

    colourGrid.appendChild(b);
  });
}

//----------
async function openColourModal({ mode = "profile", boardId = null } = {}) {
  if (!colourModal) return;

  colourModalMode = mode;
  colourModalBoardId = boardId;
  if (colourCancel) {
    colourCancel.hidden = mustChooseLocalBoardColour && mode === "local";
  }

  setColourError("");

  let disabledSet = new Set();

  let usedByMap = new Map();

  if (mode === "local" && boardId) {
    const usage = await getBoardColourUsage(boardId);

    selectedColour = usage.myLocalColour
      ? normaliseHex(usage.myLocalColour)
      : "";

    disabledSet = usage.usedByOthers;
    usedByMap = usage.usedByOthersMap || new Map();
  } else {
    selectedColour = normaliseHex(user?.color || "");
  }

  if (colourModalTitle) {
    colourModalTitle.textContent =
      mode === "local" ? "Change local calendar colour" : "Change colour";
  }

  if (colourModalBody) {
    colourModalBody.textContent =
      mode === "local"
        ? "This changes your colour for this calendar only. Your profile colour stays the same."
        : "Pick a colour for your dots and legend.";
  }

  renderColourGrid(selectedColour, disabledSet, usedByMap);
  colourModal.hidden = false;
}

//----------  
function closeColourModal() {
  if (!colourModal) return;

  if (mustChooseLocalBoardColour && colourModalMode === "local") {
    return;
  }

  colourModal.hidden = true;
  if (colourCancel) {
    colourCancel.hidden = false;
  }
  colourModalMode = "profile";
  colourModalBoardId = null;
}

//----------   
function setPwError(msg) {
  if (!pwErr) return;
  pwErr.textContent = msg || "";
  pwErr.style.display = msg ? "block" : "none";
}

//----------   
function openPwModal() {
  if (!pwModal) return;

  setPwError("");
  if (pwCurrent) pwCurrent.value = "";
  if (pwNew) pwNew.value = "";
  if (pwConfirm) pwConfirm.value = "";

  pwModal.hidden = false;
  pwCurrent?.focus();
}

//----------   
function closePwModal() {
  if (!pwModal) return;
  pwModal.hidden = true;
}

//----------    
function updateNameCount() {
  if (!nameInput || !nameCount) return;

  const len = nameInput.value.length;
  nameCount.textContent = `${len} / 15`;

  // turn red at the limit
  if (len >= 15) {
    nameCount.style.color = "#d11a2a";
    nameCount.style.fontWeight = "700";
  } else {
    nameCount.style.color = "";
    nameCount.style.fontWeight = "";
  }
};
  
//----------  
function renderSwatchGrid(containerEl, currentHex, onPick){
  if (!containerEl) return;

  containerEl.innerHTML = "";

  COLOUR_PRESETS.forEach(hex => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "colour-swatch";
    b.style.background = hex;
    b.setAttribute("aria-label", hex);
    b.dataset.hex = hex;

    if (currentHex && hex === currentHex) b.classList.add("selected");

    b.addEventListener("click", () => {
      // update selected state in this grid
      [...containerEl.querySelectorAll(".colour-swatch")].forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      onPick(hex);
    });

    containerEl.appendChild(b);
  });
}



// =========================
// INVITES
// =========================

function buildInviteLink(inviteToken) {
  return `${window.location.origin}${window.location.pathname}?t=${encodeURIComponent(inviteToken)}`;
}

//----------   
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

//----------   
function openInviteModal({ inviteToken, boardName, boardId }) {
  const overlay = document.getElementById("invite-modal");
  const emailEl = document.getElementById("invite-email");
  const sendBtn = document.getElementById("invite-send");
  const cancelBtn = document.getElementById("invite-cancel");
  const errEl = document.getElementById("invite-error");

  if (!overlay || !emailEl || !sendBtn || !cancelBtn || !errEl) return;

inviteContext = { boardId, inviteToken, boardName: boardName || "" };

  // reset UI
  errEl.style.display = "none";
  errEl.textContent = "";
  emailEl.value = "";

  overlay.hidden = false;

  const close = () => {
    overlay.hidden = true;
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.removeEventListener("click", onOverlayClick, true);
  };

  const onOverlayClick = (e) => {
    const card = e.target.closest(".modal-card");
    if (!card) close();
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") close();
  };

  const onSend = async (e) => {
  const email = (emailEl.value || "").trim();

    if (!email) {
      errEl.style.display = "block";
      errEl.textContent = "Please enter an email address.";
      return;
    }

if (!isValidEmail(email)) {
  errEl.style.display = "block";
  errEl.textContent = "Please enter a valid email address.";
  return;
}

errEl.style.display = "none";

const originalSendHtml = sendBtn.innerHTML;

try {
  sendBtn.disabled = true;
  sendBtn.innerHTML = `<span class="notice-spinner" style="display:inline-block; width:14px; height:14px; top:0; margin-right:8px; vertical-align:middle;"></span><span>Sending...</span>`;

  await new Promise(requestAnimationFrame);

  const boardId = inviteContext?.boardId;
  if (!boardId) {
    alert("Could not determine which calendar to invite to. Please refresh and try again.");
    return;
  }

  const inviteToken = inviteContext?.inviteToken;
  if (!inviteToken) {
    errEl.style.display = "block";
    errEl.textContent = "Invite token is missing for this calendar. Please refresh and try again.";
    return;
  }

  const memberLimit = getBoardMemberLimit();
  const memberCount = await getBoardMemberCount(boardId);

  if (memberCount >= memberLimit) {
    errEl.style.display = "block";
    errEl.textContent = `This calendar is full. The ${IS_PRO ? "Pro" : "free"} version allows up to ${memberLimit} total users.`;
    return;
  }
  
  const inviteLink = buildInviteLink(inviteToken);
  const boardName = inviteContext?.boardName || "Availability Calendar";

  const { data, error } = await supabase.functions.invoke("send-invite", {
    body: {
      toEmail: email,
      boardId,
      boardName,
      inviteToken,
      inviteLink
    }
  });

  if (error) throw error;

  const au = await auth.getAuthUser();
  console.log("invite save auth user:", au);
  console.log("invite save boardId/email:", boardId, email);

  if (!au) {
    console.warn("Invite save skipped: auth.getAuthUser() returned null");
  } else {
    const payload = {
      board_id: boardId,
      email: email.toLowerCase().trim(),
      role: "member",
      created_by: au.id
    };

    console.log("board_invites payload:", payload);

    const { data: inviteSaveData, error: inviteSaveErr } = await supabase
      .from("board_invites")
      .insert(payload)
      .select();

    console.log("board_invites insert result:", inviteSaveData);
    console.log("board_invites insert error full:", inviteSaveErr);
    console.log("board_invites insert error json:", JSON.stringify(inviteSaveErr, null, 2));

    if (inviteSaveErr) {
      console.warn("Failed to save invite record code:", inviteSaveErr.code);
      console.warn("Failed to save invite record message:", inviteSaveErr.message);
      console.warn("Failed to save invite record details:", inviteSaveErr.details);
      console.warn("Failed to save invite record hint:", inviteSaveErr.hint);
    }
  }

  await renderCalendarInviteStats();

  close();

  await confirmModal({
    title: "Invite sent",
    message: `Invite email sent to ${email}.`,
    okText: "Close",
    cancelText: ""
  });
} catch (err) {
  console.error("Invite send failed:", err);

  errEl.style.display = "block";
  errEl.textContent =
    (err && (err.message || err.error_description)) ||
    "Invite failed (unknown error).";
} finally {
  sendBtn.disabled = false;
  sendBtn.innerHTML = originalSendHtml;
}
  };

  // IMPORTANT: overwrite handlers so they don't stack
  sendBtn.onclick = onSend;
  cancelBtn.onclick = (e) => { e.preventDefault(); close(); };

  document.addEventListener("keydown", onKeyDown, true);
  overlay.addEventListener("click", onOverlayClick, true);

  // focus the email field
  setTimeout(() => emailEl.focus(), 0);
}



// =========================
// DASHBOARD PREVIEWS
// =========================

function getPreviewBoardTodayParts(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || undefined,
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
function getMiniMonthDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

//----------   
function getMiniMonthFirstWeekdayIndex(year, monthIndex) {
  const jsDay = new Date(year, monthIndex, 1).getDay();
  return (jsDay + 6) % 7; // Monday-first
}

//----------   
async function renderBoardPreviews(owned) {
  try {
    if (!owned || owned.length === 0) return;

    // Board ids
    const boards = owned
      .map(b => b.tables)
      .filter(t => t && t.id);

    const boardIds = boards.map(t => t.id);
    if (boardIds.length === 0) return;

    // Normalize row_structure into array of labels (strings)
    const rowsByBoard = new Map(); // boardId -> [rowLabel...]
    const startDateByBoard = new Map(); // boardId -> start_date
    const tzByBoard = new Map(); // boardId -> host_tz
    const goldByBoard = new Map(); // boardId -> threshold number
    const structureByBoard = new Map(); // boardId -> structure_type

    for (const t of boards) {
      let rows = t.row_structure;

      if (typeof rows === "string") {
        try { rows = JSON.parse(rows); } catch { /* ignore */ }
      }
      if (!Array.isArray(rows)) rows = [];

  const normalized = rows
    .map(r => (typeof r === "string" ? r : (r?.key || r?.name || r?.label || "")))
    .filter(Boolean);

  rowsByBoard.set(String(t.id), normalized);
  startDateByBoard.set(String(t.id), t.start_date || null);
  tzByBoard.set(String(t.id), t.host_tz || null);
  goldByBoard.set(String(t.id), Number(t.gold_threshold || 2));
  structureByBoard.set(String(t.id), t.structure_type || "");
}

    // Pull availability for 7 days (0..6) for all hosted boards
    const { data: avail, error: availErr } = await supabase
      .from("availability_dev")
      .select("table_id, day, time, user_id, name, color")
      .in("table_id", boardIds)
      .gte("day", 1)
      .lte("day", 7);

    if (availErr) throw availErr;

    const wholeDayBoardIds = boards
  .filter(t => (t.structure_type || "") === "whole_day")
  .map(t => t.id);

let wholeDayAvail = [];

if (wholeDayBoardIds.length) {
  const { data: wholeDayData, error: wholeDayErr } = await supabase
    .from("availability_dev")
    .select("table_id, day, user_id, name, color")
    .in("table_id", wholeDayBoardIds)
    .gte("day", 1)
    .lte("day", 30);

  if (wholeDayErr) throw wholeDayErr;
  wholeDayAvail = wholeDayData || [];
}

    // Extra availability fallback for legend (not limited to first 7 days)
    const { data: legendAvail, error: legendAvailErr } = await supabase
      .from("availability_dev")
      .select("table_id, user_id, name, color")
      .in("table_id", boardIds)
      .gte("day", 1)
      .lte("day", 30); // match your board window

    if (legendAvailErr) throw legendAvailErr;

    // Fallback by board+user (so legend can show members even if not in first 7 days)
    const fallbackByBoardUser = new Map(); // `${boardId}|${userId}` -> {name,color}

    for (const r of (legendAvail || [])) {
      if (!r.table_id || !r.user_id) continue;
      const key = `${String(r.table_id)}|${String(r.user_id)}`;

      if (!fallbackByBoardUser.has(key)) {
        fallbackByBoardUser.set(key, {
          name: (r.name || "").trim(),
          color: r.color || ""
        });
      }
    }

    // Fallback (important if profiles RLS blocks reading other users)
    const fallbackByUser = new Map(); // user_id -> { name, color }
    for (const r of ([...(avail || []), ...(wholeDayAvail || [])])) {
      const uid = r.user_id ? String(r.user_id) : null;
      if (!uid) continue;

      if (!fallbackByUser.has(uid)) {
        fallbackByUser.set(uid, {
          name: (r.name || "").trim(),
          color: r.color || ""
        });
      }
    }
    
    // Collect user_ids from membership (more reliable than "who has dots this week")
    const { data: members, error: memErr } = await supabase
      .from("board_members")
      .select("board_id, user_id")
      .in("board_id", boardIds);

    if (memErr) throw memErr;

        const { data: memberColours, error: memberColoursErr } = await supabase
          .from("board_members")
          .select("board_id, user_id, local_color")
          .in("board_id", boardIds);

        if (memberColoursErr) throw memberColoursErr;

        const localColorByBoardUser = new Map(); // `${boardId}|${userId}` -> local_color

        for (const row of (memberColours || [])) {
          if (!row?.board_id || !row?.user_id || !row?.local_color) continue;
          localColorByBoardUser.set(
            `${String(row.board_id)}|${String(row.user_id)}`,
            row.local_color
          );
        }

    const memberUserIds = Array.from(new Set(
      (legendAvail || [])
        .map(r => r.user_id)
        .filter(Boolean)
        .map(String)
    ));

let profilesByUser = new Map(); // user_id -> {name,color}
if (memberUserIds.length > 0) {
  const { data: profs, error: profErr } = await supabase
    .from("profiles")
    .select("user_id, name, color")
    .in("user_id", memberUserIds);

  if (profErr) {
    console.warn("profiles lookup blocked or failed (preview will use fallback):", profErr);
  } else {
    profilesByUser = new Map((profs || []).map(p => [String(p.user_id), p]));
  }
}

    // Build a map: (board|day|time) -> [user_id...]
    const byCell = new Map();
    for (const r of (avail || [])) {
      const key = `${r.table_id}|${r.day}|${r.time}`;
        if (!byCell.has(key)) byCell.set(key, []);
        const arr = byCell.get(key);

        if (!r.user_id) continue;               // ✅ guard
        const uid = String(r.user_id);
        if (!arr.includes(uid)) arr.push(uid);
        }

    const byDate = new Map(); // `${boardId}|${dateKey}` -> [userId...]

    for (const r of wholeDayAvail) {
      const boardId = String(r.table_id);
      const startYmd = startDateByBoard.get(boardId);
      if (!startYmd || !r.user_id) continue;

      const offset = Number(r.day);
      if (!Number.isFinite(offset)) continue;

      const start = new Date(`${startYmd}T00:00:00`);
      const actualDate = addDaysLocal(start, offset - 1);
      const dateKey = formatDateKey(actualDate);

      const key = `${boardId}|${dateKey}`;
      if (!byDate.has(key)) byDate.set(key, []);

      const arr = byDate.get(key);
      const uid = String(r.user_id);
      if (!arr.includes(uid)) arr.push(uid);
    }
    
// Render each preview
for (const t of boards) {
  const boardId = String(t.id);
  const previewEl = document.querySelector(`.board-preview[data-board-id="${boardId}"]`);
  if (!previewEl) continue;

  const rows = rowsByBoard.get(boardId) || [];
  const days = 7;
  const structureType = structureByBoard.get(boardId) || "";

  let previewHtml = "";

  if (structureType === "whole_day") {
    const tz = tzByBoard.get(boardId);
    const todayInfo = getPreviewBoardTodayParts(tz);
    const { year, month } = todayInfo;
    const monthIndex = month - 1;

    const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const daysInMonth = getMiniMonthDaysInMonth(year, monthIndex);
    const firstOffset = getMiniMonthFirstWeekdayIndex(year, monthIndex);

    const monthCells = [];

    for (let i = 0; i < firstOffset; i++) {
      monthCells.push(`<div class="mini-whole-day-cell mini-whole-day-cell--empty"></div>`);
    }

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateObj = new Date(year, monthIndex, dayNum);
      const dateKey = formatDateKey(dateObj);
      const users = byDate.get(`${boardId}|${dateKey}`) || [];
      const threshold = goldByBoard.get(boardId) || 2;
      const isGold = users.length >= threshold;

      const isPast =
        year < todayInfo.year ||
        (year === todayInfo.year && monthIndex + 1 < todayInfo.month) ||
        (
          year === todayInfo.year &&
          monthIndex + 1 === todayInfo.month &&
          dayNum < todayInfo.day
        );

      const isToday =
        year === todayInfo.year &&
        monthIndex + 1 === todayInfo.month &&
        dayNum === todayInfo.day;

      let dotsHtml = "";

      if (!isGold && users.length) {
        const visible = users.slice(0, 4);

        dotsHtml = `
          <div class="mini-whole-day-dots ${visible.length <= 2 ? "mini-whole-day-dots--1-2" : "mini-whole-day-dots--3-4"}">
            ${visible.map(uid => {
              const key = `${boardId}|${String(uid)}`;
              const p = profilesByUser.get(String(uid));
              const f = fallbackByUser.get(String(uid));

              const col =
                localColorByBoardUser.get(key) ||
                p?.color ||
                f?.color ||
                "rgba(0,0,0,0.35)";

              const name = (p?.name || f?.name || "").trim();

              return `<span class="mini-whole-day-dot" style="background:${col}" title="${escapeHtml(name)}"></span>`;
            }).join("")}
          </div>
        `;
      }

      monthCells.push(`
        <div class="mini-whole-day-cell
              ${isGold ? "mini-whole-day-cell--gold" : ""}
              ${isPast ? "mini-whole-day-cell--past" : ""}
              ${isToday ? "mini-whole-day-cell--today" : ""}">
          <div class="mini-whole-day-number">${dayNum}</div>
        <div class="mini-whole-day-dots-wrap">${dotsHtml}</div>
        </div>
      `);
    }

    previewEl.style.setProperty("--mini-scale", "1");

    previewHtml = `
      <div class="mini-whole-day">
        <div class="mini-whole-day-title">
          ${new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(new Date(year, monthIndex, 1))}
        </div>
        <div class="mini-whole-day-weekdays">
          ${weekdayLabels.map(label => `<div class="mini-whole-day-weekday">${label}</div>`).join("")}
        </div>
        <div class="mini-whole-day-grid">
          ${monthCells.join("")}
        </div>
      </div>
    `;
  } else {
    // Day labels must match the board (day 0 = today, in the board's host_tz)
    const dayNames = getWeekdayLabels7(tzByBoard.get(boardId));

    // Build header row
    const headerCells = [`<div class="mini-corner"></div>`]
      .concat(dayNames.slice(0, days).map(d => `<div class="mini-colhead">${d}</div>`))
      .join("");

    // Build body rows
    const bodyRows = rows.map((rowLabel) => {
      const rowHead = `<div class="mini-rowhead">${escapeHtml(rowLabel)}</div>`;

      const cells = [];
      for (let d = 0; d < days; d++) {
        const dayValue = d + 1;
        const users = byCell.get(`${boardId}|${dayValue}|${rowLabel}`) || [];
        const threshold = goldByBoard.get(boardId) || 2;
        const isGold = users.length >= threshold;

        let dotsHtml = "";
        let extraHtml = "";
        let miniDotsClass = "mini-dots mini-dots--1-2";

        if (!isGold) {
          const maxDots = 4;
          const visible = users.slice(0, maxDots);
          const extra = Math.max(0, users.length - maxDots);

          if (users.length <= 2) {
            miniDotsClass = "mini-dots mini-dots--1-2";
          } else {
            miniDotsClass = "mini-dots mini-dots--3-4";
          }

          dotsHtml = visible.map(uid => {
            const key = `${boardId}|${String(uid)}`;
            const p = profilesByUser.get(String(uid));
            const f = fallbackByUser.get(String(uid));

            const col =
              localColorByBoardUser.get(key) ||
              p?.color ||
              f?.color ||
              "rgba(0,0,0,0.35)";

            const name = (p?.name || f?.name || "").trim();
            return `<span class="mini-dot" style="background:${col}" title="${escapeHtml(name)}"></span>`;
          }).join("");

          extraHtml = extra > 0 ? `<span class="mini-more">+${extra}</span>` : "";
        }

        cells.push(`
          <div class="mini-cell ${isGold ? "mini-gold" : ""}">
            <div class="${miniDotsClass}">${dotsHtml}${extraHtml}</div>
          </div>
        `);
      }

      return `<div class="mini-row">${rowHead}${cells.join("")}</div>`;
    }).join("");

    // Auto-scale: fewer rows = bigger preview; more rows = smaller
    const rowCount = Math.max(rows.length, 1);
    const scale = Math.max(0.55, Math.min(1.05, 10 / (rowCount + 2)));
    previewEl.style.setProperty("--mini-scale", String(scale));

    previewHtml = `
      <div class="mini-board">
        <div class="mini-head">${headerCells}</div>
        <div class="mini-body">${bodyRows}</div>
      </div>
    `;
  }

  // Legend: show EVERY user who has availability on this board (across the full window)
  const legendUserIds = Array.from(new Set(
    (legendAvail || [])
      .filter(r => String(r.table_id) === boardId && r.user_id)
      .map(r => String(r.user_id))
  ));
  
  const MAX_LEGEND = 9;
  const totalUsers = legendUserIds.length;

  let shown = legendUserIds.slice(0, MAX_LEGEND);
  let overflow = 0;

  // If more than 9 users, reserve the 9th slot for "+N"
  if (totalUsers > MAX_LEGEND) {
    shown = legendUserIds.slice(0, 8);
    overflow = totalUsers - 8;
  }

  const n = shown.length + (overflow ? 1 : 0);

  // Presets (your requested behaviour)
  let legendRows = 1;
  let legendCols = 2;
  let font = 13;
  let dot = 9;

  // Keep HEIGHT fixed always
  const legendHeight = 34;

  // Control how wide each name can be before ellipsis (keeps legend from getting too wide)
  let itemMax = 120;

  if (n <= 2) {
    legendRows = 1; legendCols = 2; font = 11; dot = 9; itemMax = 130;
  } else if (n <= 4) {
    legendRows = 2; legendCols = 2; font = 10; dot = 8; itemMax = 110;
  } else if (n <= 6) {
    legendRows = 2; legendCols = 3; font = 8; dot = 7; itemMax = 85;
  } else {
    legendRows = 3; legendCols = 3; font = 6; dot = 5; itemMax = 75;
  }

  const legendHtml = shown.length
    ? `
<div class="mini-legend" style="
  height:${legendHeight}px;
  overflow:hidden;
  margin-top:0;
  padding:0 10px 0 8px;
  box-sizing:border-box;
">
  <div class="mini-legend-wrap" style="
    display:inline-block;
    width:fit-content;
    max-width:100%;
  ">
    <div class="mini-legend-grid" style="
      height:${legendHeight}px;
      display:inline-grid;
      grid-template-columns: repeat(${legendCols}, auto);
      grid-template-rows: repeat(${legendRows}, auto);
      column-gap:8px;
      row-gap:2px;
      align-content:center;
      justify-content:start;
      justify-items:start;
    ">
      ${[
        ...shown.map(uid => {
          const key = `${boardId}|${String(uid)}`;
          const p = profilesByUser.get(String(uid));
          const f = fallbackByBoardUser.get(key);

          const col =
            localColorByBoardUser.get(key) ||
            p?.color ||
            f?.color ||
            "rgba(0,0,0,0.35)";

          const nm = (p?.name || f?.name || "").trim() || "User";

          return `
            <div class="mini-legend-item" title="${escapeHtml(nm)}" style="
              display:flex;
              align-items:center;
              gap:4px;
              font-size:${font}px;
              line-height:1;
              max-width:${itemMax}px;
              min-width:0;
              overflow:hidden;
              white-space:nowrap;
              text-overflow:ellipsis;
            ">
              <span style="
                width:${dot}px;
                height:${dot}px;
                border-radius:999px;
                background:${col};
                flex:0 0 auto;
              "></span>
              <span style="
                opacity:0.85;
                min-width:0;
                overflow:hidden;
                text-overflow:ellipsis;
              ">${escapeHtml(nm)}</span>
            </div>
          `;
        }),
        ...(overflow ? [`
          <div class="mini-legend-item" title="${overflow} more" style="
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:${font}px;
            line-height:0.5;
            opacity:0.8;
            border:1px solid rgba(0,0,0,0.10);
            border-radius:999px;
            padding:2px 6px;
            white-space:nowrap;
          ">+${overflow}</div>
        `] : [])
      ].join("")}
    </div>
  </div>
</div>
`
    : "";
    
  previewEl.innerHTML = `
  <div class="mini-preview-main">
    ${previewHtml}
  </div>
  <div class="mini-preview-legend">
    ${legendHtml}
  </div>
`;
}
  } catch (err) {
    console.error("Preview render failed:", err);
  }
}



// =========================
// MODULE INITIALISATION
// =========================

const auth = createAuthModule({
  supabase,
  showConfirmPopup,
  loadBoards,
  loadTable,
  showDashboard,
  inviteToken,
  manageToken,
  setUser,
  getUser,
  getSetupSelectedColour: () => setupSelectedColour,
  possessive,
});



// =========================
// APP INITIALISATION
// =========================

function bindUiListenersOnce() {
  if (uiListenersBound) return;
  uiListenersBound = true;

  // Delete account overlay controls
const deleteAccountPasswordInput = document.getElementById("delete-account-password");
const deleteAccountConfirmInput = document.getElementById("delete-account-confirm");
  
  document.getElementById("acct-delete-account")?.addEventListener("click", () => {
    if (deleteAccountPasswordInput) deleteAccountPasswordInput.value = "";
    if (deleteAccountConfirmInput) deleteAccountConfirmInput.value = "";
    showDeleteAccountOverlay("");
  });

  document.getElementById("delete-account-cancel")?.addEventListener("click", () => {
    hideDeleteAccountOverlay();
  });

  document.getElementById("delete-account-confirm-btn")?.addEventListener("click", async () => {
    await deleteAccountFlow();
  });

  auth.bindAuthUi();
  
  // Dashboard: Create New Calendar (your dashboard button)
  const dashCreate = document.getElementById("create-board-btn");
  if (dashCreate) dashCreate.addEventListener("click", showCreateBoard);

  // Back to dashboard from board view
  const backToDashBtn = document.getElementById("back-to-dashboard");
  if (backToDashBtn) {
    backToDashBtn.addEventListener("click", () => {
      window.location.href = "/";
    });
  }

  // Create screen: Continue/Create after structure selection
  const goCreateBtn = document.getElementById("go-create");
  if (goCreateBtn) {
    goCreateBtn.addEventListener("click", createBoard);
  }

  // Create page → Return to Dashboard
  const returnBtn = document.getElementById("return-dashboard-btn");
  if (returnBtn) {
    returnBtn.addEventListener("click", showDashboard);
  }

  const setupGrid = document.getElementById("setup-colour-grid");
  renderSwatchGrid(setupGrid, setupSelectedColour, (hex) => {
    setupSelectedColour = hex;
  });

  const identityGrid = document.getElementById("identity-colour-grid");
  renderSwatchGrid(identityGrid, identitySelectedColour, (hex) => {
    identitySelectedColour = hex;
  });
  
  // Profile setup save
  const setupSaveBtn = document.getElementById("setup-save");
  if (setupSaveBtn) setupSaveBtn.addEventListener("click", auth.saveProfileSetup);

  // Dashboard: Settings drawer
  const settingsBtn = document.getElementById("dash-settings");
  const drawer = document.getElementById("settings-drawer");
  const backdrop = document.getElementById("settings-backdrop");
  const closeBtn = document.getElementById("settings-close");

  function openDrawer() {
    document.body.classList.add("drawer-open");
    drawer?.setAttribute("aria-hidden", "false");
    backdrop?.setAttribute("aria-hidden", "false");
    closeBtn?.focus();
  }

  function closeDrawer() {
    document.body.classList.remove("drawer-open");
    document.body.classList.remove("settings-split");
    document.body.classList.remove("account-view");
    showDashboardPanel();

    drawer?.setAttribute("aria-hidden", "true");
    backdrop?.setAttribute("aria-hidden", "true");
    settingsBtn?.focus();
  }

  settingsBtn?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  backdrop?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("drawer-open")) {
      closeDrawer();
    }
  });
 
const signOutBtn = document.getElementById("drawer-signout");

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    // Close drawer so the modal is the only focus
    document.body.classList.remove("drawer-open");

    // Make OK button look dangerous for this one modal instance
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");
    okBtn?.classList.add("modal-btn-danger");
    cancelBtn?.classList.remove("modal-btn-danger");

    const ok = await confirmModal({
      title: "Sign out?",
      message: "You’ll need to sign in again to access your calendars.",
      okText: "Sign Out",
      cancelText: "Cancel"
    });

    // Reset styling so other confirms aren't red
    okBtn?.classList.remove("modal-btn-danger");

    if (!ok) return;

    try {
      await supabase.auth.signOut();
      location.reload(); // startApp will show auth overlay
    } catch (err) {
      console.error("Sign out failed", err);
      alert("Could not sign out. Please try again.");
    }
  });
}

const feedbackBtn = document.getElementById("drawer-feedback");
const feedbackModal = document.getElementById("feedback-modal");
const feedbackCancel = document.getElementById("feedback-cancel");
const feedbackSend = document.getElementById("feedback-send");
const feedbackText = document.getElementById("feedback-text");

if (feedbackBtn && feedbackModal) {
  feedbackBtn.addEventListener("click", () => {
    document.body.classList.remove("drawer-open");
    feedbackText.value = "";
    feedbackModal.hidden = false;
    feedbackText.focus();
  });
}

feedbackCancel?.addEventListener("click", () => {
  feedbackModal.hidden = true;
});

feedbackSend?.addEventListener("click", async () => {
  const text = feedbackText.value.trim();

  if (!text) {
    feedbackText.focus();
    return;
  }

try {
  feedbackSend.disabled = true;

  const { error } = await supabase.functions.invoke("send-feedback", {
    body: { message: text }
  });

  if (error) throw error;

  feedbackModal.hidden = true;
  feedbackText.value = "";

  await confirmModal({
    title: "Thank you!",
    message: "Your feedback has been sent.",
    okText: "Close",
    cancelText: ""
  });

} catch (err) {
  console.error("Feedback send failed:", err);
  alert("Could not send feedback. Please try again.");
} finally {
  feedbackSend.disabled = false;
}
});

// Drawer item routing (delegated so it works even if drawer DOM is rebuilt)
drawer?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.id === "drawer-account") {
    // Keep drawer open, but make right side usable
    document.body.classList.add("drawer-open");
    document.body.classList.add("settings-split");

    // On wide screens, CSS kills pointer-events; aria-hidden alone doesn't
    drawer?.setAttribute("aria-hidden", "false");
    backdrop?.setAttribute("aria-hidden", "true");

    showAccountPanel();
    await hydrateAccountPanel();
    return;
  }

  // (optional later) handle other drawer buttons here:
  // if (btn.id === "drawer-notifications") ...
});

document.getElementById("acct-back-dashboard")?.addEventListener("click", () => {
  closeDrawer(); // ✅ same behavior as clicking the ✕
});

nameInput?.addEventListener("input", updateNameCount);

document.getElementById("acct-change-name")?.addEventListener("click", () => {
  openNameModal();
});

nameCancel?.addEventListener("click", closeNameModal);

document.getElementById("acct-change-colour")?.addEventListener("click", () => {
  openColourModal({ mode: "profile" });
});

  legendList?.addEventListener("click", (e) => {
  const btn = e.target.closest(".legend-local-colour-btn");
  if (!btn) return;

  const row = btn.closest(".legend-item");
  const rowUserId = row?.dataset.userId || null;

  if (!user?.id || !rowUserId || rowUserId !== user.id) return;
  if (!currentTable?.id) return;

  openColourModal({
    mode: "local",
    boardId: currentTable.id
  });
});
  
colourCancel?.addEventListener("click", closeColourModal);

// click outside card closes
colourModal?.addEventListener("click", (e) => {
  const card = e.target.closest(".modal-card");
  if (!card) closeColourModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!colourModal || colourModal.hidden) return;

  closeColourModal();
});

colourSave?.addEventListener("click", async () => {
  const v = selectedColour;
  if (!v) return setColourError("Please choose a colour.");
  if (!COLOUR_PRESETS.includes(v)) return setColourError("Please choose a colour from the list.");

  colourSave.disabled = true;
  setColourError("");

  try {
    const au = await auth.getAuthUser();
    if (!au) {
      setColourError("You’re not signed in.");
      return;
    }

    if (colourModalMode === "local") {
  if (!colourModalBoardId) {
    setColourError("No calendar selected.");
    return;
  }

  const usage = await getBoardColourUsage(colourModalBoardId);
  if (usage.usedByOthers.has(v)) {
    setColourError("That colour is already in use on this calendar.");
    return;
  }

  const { error } = await supabase
    .from("board_members")
    .update({ local_color: v })
    .eq("board_id", colourModalBoardId)
    .eq("user_id", au.id);

  if (error) throw error;

  const targetBoardId = colourModalBoardId;

  mustChooseLocalBoardColour = false;
  closeColourModal();

  await loadBoards();

  if (currentTable?.id === targetBoardId) {
    applyLocalColourUpdateInPlace(au.id, v);
  }

  return;
}

    // profile mode
    if (user?.color && v === user.color.toUpperCase()) {
      closeColourModal();
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ color: v })
      .eq("user_id", au.id);

    if (error) throw error;

    // Update in-memory + cache
    if (user) user.color = v;
    profilesCache[au.id] = { user_id: au.id, name: user?.name || "", color: v };

    // Update account panel immediately
    const dot = document.getElementById("acct-colour-dot");
    const txt = document.getElementById("acct-colour-text");
    if (dot) dot.style.background = v;
    if (txt) txt.textContent = v;

    closeColourModal();

    await confirmModal({
      title: "Colour updated",
      message: "Your colour has been changed successfully.",
      okText: "Close",
      cancelText: ""
    });

    await loadBoards();

    if (currentTable) {
      await loadAvailability();
    }
  } catch (err) {
    console.error("save colour failed", err);
    setColourError(err?.message || "Failed to save colour.");
  } finally {
    colourSave.disabled = false;
  }
});

document.getElementById("acct-change-password")?.addEventListener("click", () => {
  openPwModal();
});

pwCancel?.addEventListener("click", closePwModal);

// click outside card closes
pwModal?.addEventListener("click", (e) => {
  const card = e.target.closest(".modal-card");
  if (!card) closePwModal();
});

// Esc closes, Enter submits (from any field)
[pwCurrent, pwNew, pwConfirm].forEach(el => {
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePwModal();
    if (e.key === "Enter") pwSave?.click();
  });
});

pwSave?.addEventListener("click", async () => {
  try {
    const au = await auth.getAuthUser();
    if (!au?.email) {
      setPwError("You’re not signed in.");
      return;
    }

    const current = (pwCurrent?.value || "").trim();
    const next = (pwNew?.value || "").trim();
    const confirm = (pwConfirm?.value || "").trim();

    // validation
    if (!current) return setPwError("Please enter your current password.");
    if (!next) return setPwError("Please enter a new password.");
    if (next.length < 8) return setPwError("New password must be at least 8 characters.");
    if (next.length > 72) return setPwError("New password must be 72 characters or less.");
    if (next !== confirm) return setPwError("New passwords do not match.");
    if (next === current) return setPwError("New password must be different from the current password.");

    pwSave.disabled = true;
    setPwError("");

    // 1) Re-authenticate (security step)
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: au.email,
      password: current
    });
    if (signInErr) {
      setPwError("Current password is incorrect.");
      return;
    }

    // 2) Update password
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    if (updErr) {
      console.error("updateUser password failed:", updErr);
      setPwError("Could not update password. Please try again.");
      return;
    }

    closePwModal();

    await confirmModal({
      title: "Password updated",
      message: "Your password has been changed successfully.",
      okText: "Close",
      cancelText: ""
    });

  } catch (err) {
    console.error("Change password failed:", err);
    setPwError("Could not update password. Please try again.");
  } finally {
    if (pwSave) pwSave.disabled = false;
  }
});
  
// close on clicking outside the card
nameModal?.addEventListener("click", (e) => {
  const card = e.target.closest(".modal-card");
  if (!card) closeNameModal();
});

// Enter = save, Esc = close
nameInput?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNameModal();
  if (e.key === "Enter") nameSave?.click();
});

nameSave?.addEventListener("click", async () => {
  try {
    if (!nameInput) return;

    const newName = nameInput.value.trim();

    // Basic validation
    if (!newName) return setNameError("Please enter a name.");
    if (newName.length < 2) return setNameError("Name must be at least 2 characters.");
    if (newName.length > 15) return setNameError("Name must be 15 characters or fewer.");

    // No change
    if (user?.name && newName === user.name) {
      closeNameModal();
      return;
    }

    nameSave.disabled = true;
    setNameError("");

    // Update DB
    const au = await auth.getAuthUser();
    if (!au) {
      setNameError("You’re not signed in.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ name: newName })
      .eq("user_id", au.id);

    if (error) throw error;
      // Keep legacy snapshot columns in sync so other users (who may not be allowed to read profiles)
      // still see the updated name in legends / previews.
      const { error: snapErr } = await supabase
        .from("availability_dev")
        .update({ name: newName })
        .eq("user_id", au.id);

      if (snapErr) console.warn("availability_dev snapshot name update failed:", snapErr);

    const { error: availErr } = await supabase
      .from("availability_dev")
      .update({ name: newName })
      .eq("user_id", au.id);

    if (availErr) throw availErr;
    
     await supabase
      .from("availability_dev")
      .update({ name: newName })
      .eq("user_id", au.id);
    
    // Update in-memory + UI
    if (user) user.name = newName;

    // refresh UI
    await loadBoards(true);

    if (currentTable) {
      await loadAvailability();
    }
    
    const acctNameEl = document.getElementById("acct-name");
    if (acctNameEl) acctNameEl.textContent = newName;

    const dashUser = document.getElementById("dash-username");
    if (dashUser && user?.name) {
      dashUser.textContent = possessive(user.name).toUpperCase();
    }

    closeNameModal();

    await confirmModal({
      title: "Username updated",
      message: "Your display name has been changed successfully.",
      okText: "Close",
      cancelText: ""
    });

    // Refresh dashboard previews/legend with fresh profile data
    await loadBoards();
      if (currentTable) {
          await loadAvailability();
      }

  } catch (err) {
    console.error("Change name failed:", err);
    setNameError("Could not update your name. Please try again.");
  } finally {
    if (nameSave) nameSave.disabled = false;
  }
});

document.getElementById("footer-edit-btn")?.addEventListener("click", () => {
  if (!isBoardOwner) return;
  setCalendarNoteEditing(true);
});

document.getElementById("footer-note-cancel")?.addEventListener("click", () => {
  const ta = document.getElementById("footer-note-input");
  if (ta) ta.value = noteDraftBeforeEdit;
  setCalendarNoteEditing(false);
});

document.getElementById("footer-note-save")?.addEventListener("click", async () => {
  await saveCalendarNote();
});
  
document.getElementById("acct-upgrade-pro")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.getElementById("remove-user-cancel")?.addEventListener("click", () => {
  closeRemoveUserModal();
});

document.getElementById("remove-user-modal")?.addEventListener("click", (e) => {
  if (!e.target.closest(".modal-card")) {
    closeRemoveUserModal();
  }
});
  
    // Enter key on password field = show button press + submit
  document.getElementById("auth-password")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const btn = document.getElementById("auth-submit");
      if (!btn) return;

      btn.classList.add("is-pressed");

      setTimeout(() => {
        btn.classList.remove("is-pressed");
        btn.click();
      }, 120);
    }
});
  
window.addEventListener("focus", async () => {
  if (!currentTable?.id || manageToken) return;
  await kickOutIfNoBoardAccess();
});
  
document.addEventListener("pointerdown", (e) => {
  const actionsBtn = e.target.closest(".board-actions-btn");
  if (!actionsBtn) return;

  e.preventDefault();
  e.stopPropagation();
}, true);
    
    // Dashboard hosted card actions (+ menu)
document.addEventListener("click", async (e) => {
  // Toggle menu when clicking +
  const actionsBtn = e.target.closest(".board-actions-btn");
  if (actionsBtn) {
    e.preventDefault();
    e.stopPropagation();

    const card = actionsBtn.closest(".board-pill[data-kind]");
    if (!card) return;

    // Close any other open menus
    document.querySelectorAll(".board-actions-menu:not([hidden])")
      .forEach(m => m.hidden = true);

    const menu = card.querySelector(".board-actions-menu");
    if (!menu) return;

    menu.hidden = !menu.hidden;
    return;
  }

  // Handle menu item click
  const item = e.target.closest(".board-actions-item");
  if (item) {
    e.preventDefault();
    e.stopPropagation();

    const card = item.closest(".board-pill[data-kind]");
    if (!card) return;

    // Close menu
    const menu = card.querySelector(".board-actions-menu");
    if (menu) menu.hidden = true;

    const action = item.dataset.action;
    const boardId = card.dataset.boardId;

    const kind = card.dataset.kind;

// Joined: remove calendar (stub for now)
if (kind === "joined" && action === "remove") {
  const boardName = card.querySelector(".board-pill-title")?.textContent?.trim() || "this calendar";

  const ok = await confirmModal({
    title: "Remove calendar?",
    message: `Remove "${boardName}"? You and all your logged times will be removed from this calendar.`,
    okText: "Remove",
    cancelText: "Cancel"
  });

  if (!ok) return;

  // Actually remove current user from this board
try {
  const au = await auth.getAuthUser();
  if (!au?.id) throw new Error("Not signed in");

  // 1) delete availability rows for this user on this board
  const { error: availDelErr } = await supabase
    .from("availability_dev")
    .delete()
    .eq("table_id", boardId)
    .eq("user_id", au.id);

  if (availDelErr) throw availDelErr;

  // 2) delete membership row
  const { error: memDelErr } = await supabase
    .from("board_members")
    .delete()
    .eq("board_id", boardId)
    .eq("user_id", au.id);

  if (memDelErr) throw memDelErr;

  // 3) refresh dashboard lists + previews
  await loadBoards();

} catch (err) {
  console.error("Remove calendar failed:", err);
  alert("Could not remove you from this calendar. Please try again.");
}
return;

  return;
}

if (action === "add-user") {
  const inviteTok = card.dataset.inviteToken;
  const boardId = card.dataset.boardId;
  const boardName = card.querySelector(".board-pill-title")?.textContent?.trim() || "Availability Calendar";

  if (!inviteTok || !boardId) {
    console.error("Missing invite token or boardId on hosted board card.");
    return;
  }

  const memberCount = await getBoardMemberCount(boardId);
  const memberLimit = getBoardMemberLimit();

  if (memberCount >= memberLimit) {
    await confirmModal({
      title: "Calendar full",
      message: `This calendar already has ${memberLimit} users, which is the ${IS_PRO ? "Pro" : "free"} limit.`,
      okText: "OK",
      showCancel: false
    });
    return;
  }

  openInviteModal({
    boardId,
    inviteToken: inviteTok,
    boardName
  });
  return;
}
    
    if (action === "delete") {
      // Confirm (no alert UI yet — we can swap to a custom modal next)
      const boardName = card.querySelector(".board-pill-title")?.textContent?.trim() || "this calendar";
      const ok = await confirmModal({
        title: "Delete calendar?",
        message: `Delete "${boardName}"? This cannot be undone.`,
        okText: "Delete",
        cancelText: "Cancel"
      });
      if (!ok) return;

      try {
        // Disable the menu item to prevent double-clicks
        item.disabled = true;
        item.textContent = "Deleting…";

        const { error } = await supabase.rpc("delete_calendar", { p_board_id: boardId });
        if (error) throw error;

        // Remove from dashboard immediately
        card.remove();

        // Optional: refresh lists in case you show counts etc.
        if (typeof loadBoards === "function") await loadBoards();
      } catch (err) {
        console.error("Delete calendar failed:", err);
        // Revert UI
        item.disabled = false;
        item.textContent = "Delete";
      }
    }
    
    return;
  }

  // Handle normal card click
  const card = e.target.closest(".board-pill[data-kind]");
  if (card) {
    if (
      e.target.closest(".board-actions-btn") ||
      e.target.closest(".board-actions-menu")
    ) {
      return;
    }

    const kind = card.dataset.kind;

    if (kind === "hosted") {
      const ownerToken = card.dataset.ownerToken;
      if (ownerToken) openManageBoard(ownerToken);
      return;
    }

    if (kind === "joined") {
      const inviteToken = card.dataset.inviteToken;
      if (inviteToken) openBoard(inviteToken);
      return;
    }
  }
  
  // Click outside closes any open menus
  document.querySelectorAll(".board-actions-menu:not([hidden])")
    .forEach(m => m.hidden = true);
}, true);
  }

//----------    
async function startApp() {
  document.body.classList.remove("show-landing-bg");
  document.body.style.visibility = "visible";
  bindUiListenersOnce();

  // Password recovery handling
  const hash = window.location.hash || "";
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type") || "";

  // If Supabase uses PKCE recovery links, exchange code for session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      auth.showAuthOverlay("This reset link is invalid or expired. Please request a new one.");
      return;
    }

    url.searchParams.delete("code");
    window.history.replaceState({}, document.title, url.toString());
  }

  const isRecovery = hash.includes("type=recovery") || type === "recovery";

  // If this is a recovery link, mark recovery mode in session storage
  if (isRecovery) {
    localStorage.setItem("pw_recovery_in_progress", "1");
    auth.showAuthOverlay("");
    auth.setAuthMode("recovery");
    return;
  }

  const recoveryInProgress = localStorage.getItem("pw_recovery_in_progress") === "1";

  const { data: { session } } = await supabase.auth.getSession();

  // If a recovery session exists but user is no longer on the recovery page,
  // force sign-out so they cannot land straight in the dashboard
  if (recoveryInProgress && session) {
    await supabase.auth.signOut();
    localStorage.removeItem("pw_recovery_in_progress");
    auth.showAuthOverlay("Please sign in again.");
    return;
  }

  if (!session) {
    const lockSignin = !!manageToken;
    auth.showAuthOverlay("", { lockSignin });
    return;
  }

  // Homepage → dashboard flow
  if (!inviteToken && !manageToken) {
    const prof = await auth.loadProfile();

    if (!prof || !prof.name || !prof.color) {
      auth.showProfileSetup();
      return;
    }

    showDashboard();
    auth.setDashboardSubtitle();
    await loadBoards();
    return;
  }

  // Invite/manage-token board flow
  try {
    populateHostTimezoneSelect();

    const addRowBtn = document.getElementById("add-row");
    if (addRowBtn) {
      addRowBtn.addEventListener("click", () => addRowInput());
    }

    const backBtn = document.getElementById("route-error-back");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        window.location.href = "/";
      });
    }

const topbarLeft = document.querySelector(".calendar-topbar-left");

let addUsersBtn = document.getElementById("add-users-btn");
let removeUserBtn = document.getElementById("remove-user-btn");

if (manageToken && topbarLeft) {
  if (!addUsersBtn) {
    addUsersBtn = document.createElement("button");
    addUsersBtn.id = "add-users-btn";
    addUsersBtn.className = "topbar-btn";
    addUsersBtn.type = "button";
    addUsersBtn.textContent = "Add Users";

    topbarLeft.appendChild(addUsersBtn);
  }

  if (!removeUserBtn) {
    removeUserBtn = document.createElement("button");
    removeUserBtn.id = "remove-user-btn";
    removeUserBtn.className = "topbar-btn";
    removeUserBtn.type = "button";
    removeUserBtn.textContent = "Remove User";

    addUsersBtn.insertAdjacentElement("afterend", removeUserBtn);
  }
}

if (addUsersBtn) {
  addUsersBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!manageToken) return;

    const boardId = currentTable?.id;
    if (!boardId || !currentTable?.invite_token) {
      console.error("Invite token or boardId missing on currentTable");
      return;
    }

    const memberCount = await getBoardMemberCount(boardId);
    const memberLimit = getBoardMemberLimit();

    if (memberCount >= memberLimit) {
      await confirmModal({
        title: "Calendar full",
        message: `This calendar already has ${memberLimit} users, which is the ${IS_PRO ? "Pro" : "free"} limit.`,
        okText: "OK",
        showCancel: false
      });
      return;
    }

    openInviteModal({
      boardId,
      inviteToken: currentTable.invite_token,
      boardName: currentTable.name || "Availability Calendar"
    });
  });
}

if (removeUserBtn) {
  removeUserBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!manageToken) return;
    if (!currentTable?.id) return;

    await refreshBoardOwnerFlag();
    if (!isBoardOwner) return;

    await openRemoveUserModal();
  });
}

await loadTable();
} finally {
  document.body.style.visibility = "visible";
}
}


  
// =========================
// BOARD ACTIONS
// =========================

function closeRemoveUserModal() {
  const overlay = document.getElementById("remove-user-modal");
  const list = document.getElementById("remove-user-list");

  if (overlay) overlay.hidden = true;
  if (list) list.innerHTML = "";
}

//----------
async function getCurrentBoardMembersForRemoval() {
  if (!currentTable?.id) return [];

  const { data: members, error: memberErr } = await supabase
    .from("board_members")
    .select("user_id, role, local_color")
    .eq("board_id", currentTable.id);

  if (memberErr) throw memberErr;

  const rows = (members || []).filter(row => {
    if (!row?.user_id) return false;
    if (String(row.user_id) === String(currentTable.owner_id)) return false;
    if (row.role === "owner") return false;
    return true;
  });

  if (!rows.length) return [];

  const userIds = [...new Set(rows.map(row => String(row.user_id)).filter(Boolean))];
  const profiles = userIds.length ? await fetchProfilesMap(userIds) : {};

  const removable = rows.map((row) => {
    const uid = String(row.user_id);
    const profile = profiles[uid] || {};

    return {
      user_id: uid,
      role: row.role || "member",
      name: (profile.name || "").trim() || "Unknown user",
      color: row.local_color || profile.color || "#8E8E93"
    };
  });

  return removable.sort((a, b) => a.name.localeCompare(b.name));
}

//----------
async function removeUserFromCurrentBoard(member) {
  if (!manageToken || !isBoardOwner || !currentTable?.id || !member) return;

  showConfirmPopup(`Removing ${member.name}…`, {
    title: "Remove user",
    showOk: false
  });

  try {
    if (!member.user_id) {
      throw new Error("Missing user id for board member removal.");
    }

    const { error: removeErr } = await supabase.rpc("remove_board_member", {
      p_board_id: currentTable.id,
      p_user_id: member.user_id,
      p_invite_id: member.invite_id || null
    });

    if (removeErr) throw removeErr;

    closeRemoveUserModal();
    await loadTable();

    showConfirmPopup(`${member.name} has been removed from this calendar.`, {
      title: "User removed"
    });
  } catch (err) {
    console.error("Remove user failed:", err);

    showConfirmPopup("Could not remove that user from this calendar.", {
      title: "Remove user"
    });
  }
}

//----------
async function openRemoveUserModal() {
  if (!manageToken || !isBoardOwner || !currentTable?.id) return;

  const overlay = document.getElementById("remove-user-modal");
  const list = document.getElementById("remove-user-list");

  if (!overlay || !list) return;

  overlay.hidden = false;
  list.innerHTML = `<div style="opacity:0.7; padding:8px 2px;">Loading users…</div>`;

  try {
    const members = await getCurrentBoardMembersForRemoval();

    list.innerHTML = "";

    if (!members.length) {
      list.innerHTML = `<div style="opacity:0.7; padding:8px 2px;">No removable users on this calendar.</div>`;
      return;
    }

    members.forEach((member) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "modal-btn";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "space-between";
      btn.style.gap = "12px";
      btn.style.width = "100%";
      btn.style.textAlign = "left";

      const left = document.createElement("span");
      left.style.display = "inline-flex";
      left.style.alignItems = "center";
      left.style.gap = "10px";

      const dot = document.createElement("span");
      dot.className = "colour-dot";
      dot.style.background = member.color;

      const name = document.createElement("span");
      name.textContent = member.name;

      const right = document.createElement("span");
      right.textContent = "Remove";
      right.style.opacity = "0.7";
      right.style.fontWeight = "700";

      left.appendChild(dot);
      left.appendChild(name);
      btn.appendChild(left);
      btn.appendChild(right);

      btn.addEventListener("click", async () => {
        const ok = await confirmModal({
          title: "Remove user?",
          message: `Remove "${member.name}" from "${currentTable.name || "this calendar"}"? Their logged times on this calendar will also be removed.`,
          okText: "Remove",
          cancelText: "Cancel"
        });

        if (!ok) return;

        await removeUserFromCurrentBoard(member);
      });

      list.appendChild(btn);
    });
  } catch (err) {
    console.error("Failed to load removable users:", err);
    list.innerHTML = `<div style="opacity:0.7; padding:8px 2px;">Could not load current users.</div>`;
  }
}

//----------
async function deleteBoard() {
  if (!currentTable) return;

  if (!confirm("Are you sure you want to permanently delete this board?")) return;
  await supabase
    .from("availability_dev")
    .delete()
    .eq("table_id", currentTable.id);

  await supabase
    .from("tables")
    .delete()
    .eq("id", currentTable.id);

  window.location.href = "/";
}

//----------  
async function resetBoard() {
  if (!currentTable) return;

  await supabase
    .from("availability_dev")
    .delete()
    .eq("table_id", currentTable.id);

  await loadAvailability();
}



// =========================
// SHARED DOM REFERENCES / APP STATE
// =========================
const table = document.getElementById("availabilityTable");
window.table = table;
const legendDiv = document.getElementById("legend");
const legendList = document.getElementById("legendList");
window.legendList = legendList;
const calendarEl = document.getElementById("calendar");

cellHoverTooltip.className = "cell-hover-tooltip";
cellHoverTooltip.hidden = true;

document.addEventListener("DOMContentLoaded", startApp);
