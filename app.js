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





// =========================
// URL / GLOBAL CONSTANTS
// =========================

const params = new URLSearchParams(window.location.search);
const inviteToken = params.get("t");
const manageToken = params.get("m");
const pendingAdds = new Set();   // prevent spam insert per user+cell
const inFlightCells = new Set(); // per-cell lock





// =========================
// STATIC CONFIG
// =========================

const PREBUILT_STRUCTURES = {
  meals: [
    { label: "Breakfast" },
    { label: "Lunch" },
    { label: "Dinner" }
  ],
  quick_meetup: [
    { label: "Morning" },
    { label: "Afternoon" },
    { label: "Evening" }
  ],
  dinner_plan: [
    { label: "Early Dinner" },
    { label: "Dinner" },
    { label: "Late Dinner" }
  ]};

const COLOUR_PRESETS = [
  // Reds / Pinks
  "#DC2626", "#FF3B30", "#FF2D55", "#E11D48", "#DB2777", "#C026D3", "#A855F7", "#FF8DA1",
  // Purples / Blues
  "#7C3AED", "#5856D6", "#4F46E5", "#2563EB", "#007AFF", "#0A84FF", "#0284C7",
  "#06B6D4", "#0891B2", "#00C7BE",
  // Greens
  "#34C759", "#22C55E", "#16A34A", "#2D7D46", "#0F766E", "#059669",
  // Yellows / Oranges
  "#FFD60A", "#FFCC00", "#F59E0B", "#FF9500", "#F97316", "#EA580C",
  // Neutrals / Earthy
  "#8E8E93", "#6B7280", "#374151", "#1C1C1E",
  "#A2845E", "#8B5E34", "#6D4C41", "#4E342E",
  // Extra tasteful accents
  "#14B8A6", "#84CC16"
];





// =========================
// GLOBAL RUNTIME STATE
// =========================

let currentTable = null;
let availabilityChannel = null;
let tableChannel = null; 
let membershipChannel = null;
let fullRefreshTimer = null;
let loadAvailabilityRunning = false;
let loadAvailabilityQueued = false;
let noteDraftBeforeEdit = "";
let setupSelectedColour = "#3b82f6";
let identitySelectedColour = "#2d7ff9";  
let selectedStructure = "custom"; // dev-only selectable for now
let presenceChannel = null;
let isBoardOwner = false;
let profilesCache = {};
let uiListenersBound = false;
let inviteContext = { inviteToken: null, boardName: "" };
let localColourEditMode = false;
let localColourBoardId = null;





// =========================
// GLOBAL USER STATE
// =========================

let user = null;

const getUser = () => user;
const setUser = (nextUser) => { user = nextUser; };




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
function showCreateBoard() {
  document.body.style.visibility = "visible";

  const dash = document.getElementById("dashboard");
  if (dash) dash.style.display = "none";

  const create = document.getElementById("create-board");
  if (create) create.style.display = "block";

  // Initialize the create flow (resets, hides/reveals buttons, timezones, etc.)
  if (typeof showBoardSetup === "function") {
    showBoardSetup();
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

  value.textContent = currentTable.host_tz || "—";
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

  if (diffMin <= 0) return "just now";
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

//----------
async function refreshCurrentTableMeta() {
  if (!currentTable?.id) return;

  const { data, error } = await supabase
    .from("tables")
    .select("id, last_activity_at, gold_threshold, host_tz, name")
    .eq("id", currentTable.id)
    .single();

  if (error || !data) return;

  currentTable = { ...currentTable, ...data };
}

//----------
async function renderCalendarInviteStats() {
  const wrap = document.getElementById("calendar-invite-stats");
  const joinedEl = document.getElementById("calendar-invite-joined");
  const totalEl = document.getElementById("calendar-invite-total");

  if (!wrap || !joinedEl || !totalEl || !currentTable?.id) return;

// x = accepted invites + owner
const { count: acceptedCount, error: memberErr } = await supabase
  .from("board_invites")
  .select("id", { count: "exact", head: true })
  .eq("board_id", currentTable.id)
  .not("accepted_at", "is", null);

if (memberErr) {
  console.warn("Failed to load current member count:", memberErr);
  wrap.style.display = "none";
  return;
}

  // y = emails invited + owner
  const { count: inviteCount, error: inviteErr } = await supabase
    .from("board_invites")
    .select("id", { count: "exact", head: true })
    .eq("board_id", currentTable.id);

  if (inviteErr) {
    console.warn("Failed to load invite count:", inviteErr);
    wrap.style.display = "none";
    return;
  }

  const joined = (acceptedCount || 0) + 1;
  const total = (inviteCount || 0) + 1;

  joinedEl.textContent = String(joined);
  totalEl.textContent = String(total);
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

//----------
async function getProfileCached(userId) {
  if (!userId) return null;
  if (profilesCache[userId]) return profilesCache[userId];

  const map = await fetchProfilesMap([userId]);
  profilesCache = { ...profilesCache, ...map };
  return profilesCache[userId] || null;
}  

//----------
async function ensureMembership(boardId) {
  const au = await auth.getAuthUser();

  if (!au || !boardId) return;

  const payload = {
    board_id: boardId,
    user_id: au.id
  };

  const { error } = await supabase
    .from("board_members")
    .upsert(payload, { onConflict: "board_id,user_id" })
    .select();

  if (error) {
    console.error("ensureMembership failed:", error);
    return;
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
function getTimeZoneListPinned() {
  const detected = getDetectedTimeZone();

  // Best case: browser can list all IANA time zones
  if (Intl.supportedValuesOf) {
    const all = Intl.supportedValuesOf("timeZone");
    // Put detected first, then the rest alphabetically
    return [detected, ...all.filter(tz => tz !== detected).sort()];
  }

  // Fallback: small curated list + detected pinned
  const fallback = [
    "UTC",
    "Australia/Brisbane",
    "Australia/Sydney",
    "Australia/Melbourne",
    "Australia/Perth",
    "Pacific/Auckland",
    "America/Los_Angeles",
    "America/New_York",
    "Europe/London",
    "Europe/Paris",
    "Asia/Singapore",
    "Asia/Tokyo"
  ];

  const unique = Array.from(new Set([detected, ...fallback]));
  return [detected, ...unique.filter(tz => tz !== detected)];
}

//----------
function populateHostTimezoneSelect() {
  const select = document.getElementById("host-timezone");
  if (!select) return;

  const tzs = getTimeZoneListPinned();
  select.innerHTML = "";

  tzs.forEach((tz, idx) => {
    const opt = document.createElement("option");
    opt.value = tz;
    opt.textContent = idx === 0 ? `${tz} (Detected)` : tz;
    select.appendChild(opt);
  });

  select.value = tzs[0];
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
// CALENDAR CELL / DOT HELPERS
// =========================

function ensureDotContainer(cell) {
  let dc = cell.querySelector(".dot-container");
  if (!dc) {
    dc = document.createElement("div");
    dc.className = "dot-container";
    cell.appendChild(dc);
  }
  return dc;
}

//----------
function addOptimisticDot(cell, userId, name, color) {
  const dc = ensureDotContainer(cell);

  if (dc.querySelector(`.dot[data-user-id="${userId}"]`)) return;

  const dot = document.createElement("div");
  dot.className = "dot";
  dot.dataset.userId = userId;
  dot.dataset.name = name || "—";
  dot.title = name || "—";
  dot.style.background = color || "#999";

  // mark as pending so we can remove if DB fails
  dot.dataset.pending = "1";

  dc.appendChild(dot);
}  

//----------
function maybeApplyGoldForCell(cell) {
  const th = Number(currentTable?.gold_threshold || 0);
  if (!th || th <= 0) return;

  // If already gold, nothing to do
  if (cell.classList.contains("gold-cell")) return;

  const dc = cell.querySelector(".dot-container");
  const count = dc ? dc.querySelectorAll(".dot").length : 0;

  if (count >= th) {
    cell.classList.add("gold-cell");

    // Gold cells hide dots in your UI
    dc?.remove();
  }
}  

//----------
async function rebuildDotsForCell(cell) {
  if (!currentTable) return;

  cell.querySelector(".dot-container")?.remove();

  const dayNum = parseInt(cell.dataset.day, 10);
  const timeKey = String(cell.dataset.time || "").trim();

  const { data, error } = await supabase
    .from("availability_dev")
    .select("*")
    .eq("table_id", currentTable.id)
    .eq("day", dayNum)
    .eq("time", timeKey);

  if (error) {
    console.warn("rebuildDotsForCell failed:", error);
    return;
  }

  if (!data || data.length === 0) return;

  // ✅ Fetch profiles ONCE
  const profilesMap = await fetchProfilesMap(data.map(d => d.user_id));
  profilesCache = { ...profilesCache, ...profilesMap };

  const dotContainer = document.createElement("div");
  dotContainer.className = "dot-container";

  data.forEach(entry => {
    const prof = entry.user_id ? profilesMap[entry.user_id] : null;
    const displayName = prof?.name || entry.name || "—";
    const displayColor = prof?.color || entry.color || "#999";

    const dot = document.createElement("div");
    dot.className = "dot";

    dot.style.background = displayColor;
    dot.title = displayName;

    if (entry.user_id) dot.dataset.userId = entry.user_id;
    dot.dataset.name = displayName;

    dotContainer.appendChild(dot);
  });

  cell.appendChild(dotContainer);
}

//----------
async function applyGoldStateForCell(cell, day) {
  const goldThreshold = Number(currentTable?.gold_threshold);
  if (!Number.isFinite(goldThreshold)) return;

  const wasGold = cell.classList.contains("gold-cell");

  let dotContainer = cell.querySelector(".dot-container");
  let dotCount = dotContainer ? dotContainer.children.length : null;

  // If dots are hidden (gold state), DOM can't tell us the real count.
  // In that specific case, ask the DB for the real count for this cell.
  if (dotCount === null && wasGold) {
    const dayNum = parseInt(cell.dataset.day, 10);
    const timeKey = String(cell.dataset.time || "").trim();

    const { count, error } = await supabase
      .from("availability_dev")
      .select("id", { count: "exact", head: true })
      .eq("table_id", currentTable.id)
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

  // Update day header gold state
  const dayNum = parseInt(day, 10);
  const th = table.querySelector(`th.day-header[data-day="${dayNum}"]`);
  if (!th) return;

  const anyGoldInDay = !!table.querySelector(`td[data-day="${dayNum}"].gold-cell`);
  if (anyGoldInDay) th.classList.add("gold-header");
  else th.classList.remove("gold-header");
}





// =========================
// REALTIME / REFRESH
// =========================

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
async function handleAvailabilityChange(payload) {
  const entry =
    payload.eventType === "DELETE"
      ? payload.old
      : (payload.new && Object.keys(payload.new).length ? payload.new : payload.old);

  if (!entry) return;

  // If DELETE is missing fields we need, safest refresh
  if (payload.eventType === "DELETE") {
    if (entry.day == null || entry.time == null) {
      await loadAvailability();
      scheduleFullRefreshIdle(15000);
      return;
    }
  }

  const cell = table.querySelector(
    `td[data-day="${entry.day}"][data-time="${entry.time}"]`
  );

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

    const dc = cell.querySelector(".dot-container");
    if (dc && dc.children.length === 0) dc.remove();
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
    // Still keep legend/gold state correct in case thresholds changed
    await applyGoldStateForCell(cell, entry.day);
    scheduleFullRefreshIdle(15000);
    return;
  }

  // Ensure dot container exists (only for non-gold cells)
  let dotContainer = cell.querySelector(".dot-container");
  if (!dotContainer) {
    dotContainer = document.createElement("div");
    dotContainer.className = "dot-container";
    cell.appendChild(dotContainer);
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
  const displayColor = prof?.color || entry.color || "#999";

  if (!alreadyHasDot) {
    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.background = displayColor;
    dot.title = displayName;

    if (entry.user_id) dot.dataset.userId = entry.user_id;
    dot.dataset.name = displayName;

    dotContainer.appendChild(dot);
  } else {
    // If it exists (optimistic), update its displayed values just in case
    const existing = entry.user_id
      ? cell.querySelector(`.dot[data-user-id="${entry.user_id}"]`)
      : (entry.name ? cell.querySelector(`.dot[data-name="${CSS.escape(entry.name)}"]`) : null);

    if (existing) {
      existing.style.background = displayColor;
      existing.title = displayName;
      existing.dataset.name = displayName;
    }
  }

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

  if (auId && currentTable?.id && !manageToken) {
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
    async () => {
      if (manageToken) return;
      await kickOutIfNoBoardAccess();
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





// =========================
// BOARD / TABLE DATA LOADING
// =========================

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
  if (!owned.length) {
    ownedEl.innerHTML = `<div class="empty-boards">No hosted calendars</div>`;
  } else {
    ownedEl.innerHTML = owned.map(b => `
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
    `).join("");
  }

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

if (!refreshErr && refreshed) currentTable = refreshed;
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

  await ensureMembership(currentTable.id);

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

    /* Legend */
    const users = {};
      rows.forEach(r => {
        const prof = r.user_id ? profilesMap[r.user_id] : null;

        const displayName = prof?.name || r.name || "—";
        const displayColor = prof?.color || r.color || "#999";

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

          if (entry.user_id) dot.dataset.userId = entry.user_id;

          const prof = entry.user_id ? profilesMap[entry.user_id] : null;
          const displayName = prof?.name || entry.name || "—";
          const displayColor = prof?.color || entry.color || "#999";

          dot.style.background = displayColor;
          dot.title = displayName;
          dot.dataset.name = displayName;

          // Animate only the current user's dot
          if (user && entry.user_id === user.id) {
            dot.classList.add("pop-in");
          }

          dotContainer.appendChild(dot);
        });

        cell.appendChild(dotContainer);
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





// =========================
// BOARD CREATION / CONFIG
// =========================

function showBoardSetup() {
  const startBtn = document.getElementById("start-create");
    if (startBtn) startBtn.style.display = "none";

     const setup = document.getElementById("board-setup");
    if (setup) setup.style.display = "block";

     // Populate timezone dropdown when entering setup
    if (typeof populateHostTimezoneSelect === "function") {
      populateHostTimezoneSelect();
         // TEMP: until you implement real Pro accounts
       const isPro = false;
       populateGoldThresholdSelect(isPro);
      }

  // Reset pages
  const nameStep = document.getElementById("name-step");
  const detailsStep = document.getElementById("details-step");
  const rowBuilder = document.getElementById("row-builder");
  const createActions = document.getElementById("create-actions");
  const goldSel = document.getElementById("gold-threshold");
  
  if (goldSel) goldSel.value = "";

  if (nameStep) nameStep.style.display = "block";
  if (detailsStep) detailsStep.style.display = "none";
  if (rowBuilder) rowBuilder.style.display = "none";
  if (createActions) createActions.style.display = "none";

  // Hide the page-2 create button until a structure is clicked
  const goBtn = document.getElementById("go-create");
  if (goBtn) goBtn.style.display = "none";

  // Clear structure selection highlight + require click
  selectedStructure = null;
  ["dev-custom-card", "meals-card"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  });
}

//----------  
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
function populateGoldThresholdSelect(isPro) {
  const sel = document.getElementById("gold-threshold");
  if (!sel) return;

  // clear existing (keep the placeholder)
  sel.innerHTML = `<option value="" selected disabled>Select a number…</option>`;

  for (let n = 1; n <= 30; n++) {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = `${n}`;

    // Free: 1–5 enabled, 6–30 disabled
    if (!isPro && n >= 6) opt.disabled = true;

    sel.appendChild(opt);
  }
}

//----------  
function setActiveStructureCard(activeId) {
  ["dev-custom-card", "meals-card"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("active", id === activeId);
  });
}

//---------- 
function showGoCreate() {
  const btn = document.getElementById("go-create");
  if (btn) btn.style.display = "inline-block";
}  

//----------  
async function createBoard() {
    // Gold threshold (now selected on the Name Your Calendar screen)
  const goldSelect =
    document.getElementById("gold-threshold") ||
    document.getElementById("gold-threshold-select") ||
    document.getElementById("goldThreshold") ||
    document.querySelector('select[data-gold-threshold]');

  const goldThreshold = parseInt(goldSelect?.value || "", 10) || 2;
  const au = await auth.getAuthUser();
    if (!au) {
      auth.showAuthOverlay("Please sign in before creating a calendar.");
      return;
    }
  const nameInput = document.getElementById("board-name");
  const name = nameInput.value.trim();

  if (!name) {
    alert("Please enter a board name");
    return;
  }

  let timeBlocks = [];

const structureChoice = selectedStructure || "custom";

if (structureChoice === "custom") {
  const rowInputs = document.querySelectorAll("#rows-container input");

  rowInputs.forEach(input => {
    const value = input.value.trim();
    if (value) {
      timeBlocks.push({ label: value });
    }
  });

  if (timeBlocks.length === 0) {
    alert("Please add at least one time block");
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
  const tz = document.getElementById("host-timezone")?.value || getDetectedTimeZone();
  const startDate = yyyyMmDdInTimeZone(new Date(), tz);
  
  // --- Gold threshold (required) ---
  const goldRaw = document.getElementById("gold-threshold")?.value || "";
    if (!goldRaw) {
      alert("Please choose a gold threshold");
      return;
    }

    // TEMP: until you implement real Pro accounts
    const isPro = false;

    if (!Number.isFinite(goldThreshold) || goldThreshold < 1 || goldThreshold > 30) {
      alert("Gold threshold must be between 1 and 30.");
      return;
    }
if (!isPro && goldThreshold >= 6) {
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

    const th = document.createElement("th");
    th.classList.add("day-header");
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
      const cell = document.createElement("td");
      cell.dataset.day = String(dayNum);
      cell.dataset.time = timeObj.label;
      row.appendChild(cell);
    }

    table.appendChild(row);
  });

  bindCalendarClickDelegation();
}

//----------  
async function toggleCell(e) {
  if (await kickOutIfNoBoardAccess()) return;
  if (!user || !currentTable) return;

  let k; // ✅ so finally can always see it

  try {
    const cell = e.currentTarget;
    if (!cell) return;

    // normalize values
    const dayNum = parseInt(cell.dataset.day, 10);
    const timeKey = String(cell.dataset.time || "").trim();
    if (!Number.isFinite(dayNum) || !timeKey) return;

    const au = await auth.getAuthUser();
    if (!au) return;
    const myUid = au.id;

    k = addKey(currentTable.id, dayNum, timeKey, myUid);
    if (inFlightCells.has(k)) return;
    inFlightCells.add(k);

    await ensureMembership(currentTable.id);

    // DELETE FIRST (toggle off)
    const { error: delErr, count: deletedCount } = await supabase
      .from("availability_dev")
      .delete({ count: "exact" })
      .eq("table_id", currentTable.id)
      .eq("day", dayNum)
      .eq("time", timeKey)
      .eq("user_id", myUid);

    if (delErr) {
      console.warn("Delete failed:", delErr);
      await loadAvailability();
      return;
    }

    // legacy delete if needed
    let legacyDeletedCount = 0;
    if ((deletedCount || 0) === 0) {
      const { error: legacyErr, count: legacyCount } = await supabase
        .from("availability_dev")
        .delete({ count: "exact" })
        .eq("table_id", currentTable.id)
        .eq("day", dayNum)
        .eq("time", timeKey)
        .is("user_id", null)
        .eq("name", user.name)
        .eq("color", user.color);

      if (legacyErr) {
        console.warn("Legacy delete failed:", legacyErr);
        await loadAvailability();
        return;
      }

      legacyDeletedCount = legacyCount || 0;
    }

    if ((deletedCount || 0) > 0 || legacyDeletedCount > 0) {
      if (cell.classList.contains("gold-cell")) {
        await loadAvailability();
        return;
      }

      const myDot = cell.querySelector(`.dot[data-user-id="${myUid}"]`);
      if (myDot) myDot.remove();

      const legacyDot = cell.querySelector(`.dot[data-name="${CSS.escape(user.name)}"]`);
      if (legacyDot) legacyDot.remove();

      const container = cell.querySelector(".dot-container");
      if (container && container.children.length === 0) container.remove();

      return;
    }

    // INSERT (toggle on) — optimistic first
    const key = addKey(currentTable.id, dayNum, timeKey, myUid);
    if (pendingAdds.has(key)) return;
    pendingAdds.add(key);

    addOptimisticDot(cell, myUid, user.name, user.color);
    maybeApplyGoldForCell(cell);

    const { error: insErr } = await supabase
      .from("availability_dev")
      .insert({
        table_id: currentTable.id,
        day: dayNum,
        time: timeKey,
        user_id: myUid,
        name: user.name,
        color: user.color
      });

    if (insErr) {
      console.warn("Insert failed:", insErr);

      cell.querySelector(`.dot[data-user-id="${myUid}"][data-pending="1"]`)?.remove();

      const dc = cell.querySelector(".dot-container");
      if (dc && dc.children.length === 0) dc.remove();

      pendingAdds.delete(key);
      await loadAvailability();
      return;
    }

    // success: mark pending dot as real
    cell.querySelector(`.dot[data-user-id="${myUid}"][data-pending="1"]`)
      ?.removeAttribute("data-pending");
      maybeApplyGoldForCell(cell);

    pendingAdds.delete(key);

  } finally {
    if (k) inFlightCells.delete(k);
  }
}

//----------  
function bindCalendarClickDelegation() {
  const table = document.getElementById("availabilityTable");
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
let colourModalMode = "profile";   // "profile" | "local"
let colourModalBoardId = null;

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
function renderColourGrid(current){
  if (!colourGrid) return;
  colourGrid.innerHTML = "";

  COLOUR_PRESETS.forEach(hex => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "colour-swatch";
    b.style.background = hex;
    b.setAttribute("aria-label", hex);
    b.dataset.hex = hex;

    if (current && hex === current) b.classList.add("selected");

    b.addEventListener("click", () => {
      selectedColour = hex;

      // update UI selected state
      [...colourGrid.querySelectorAll(".colour-swatch")].forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");

      setColourError("");
    });

    colourGrid.appendChild(b);
  });
}

//----------  
function openColourModal({ mode = "profile", boardId = null } = {}) {
  if (!colourModal) return;

  colourModalMode = mode;
  colourModalBoardId = boardId;

  setColourError("");
  selectedColour = normaliseHex(user?.color || "");

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

  renderColourGrid(selectedColour);
  colourModal.hidden = false;
}

//----------  
function closeColourModal(){
  if (!colourModal) return;
  colourModal.hidden = true;
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
    }

    // Pull availability for 7 days (0..6) for all hosted boards
    const { data: avail, error: availErr } = await supabase
      .from("availability_dev")
      .select("table_id, day, time, user_id, name, color")
      .in("table_id", boardIds)
      .gte("day", 1)
      .lte("day", 7);

    if (availErr) throw availErr;

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
    for (const r of (avail || [])) {
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

    // Render each preview
    for (const t of boards) {
      const boardId = String(t.id);
      const previewEl = document.querySelector(`.board-preview[data-board-id="${boardId}"]`);
      if (!previewEl) continue;

      const rows = rowsByBoard.get(boardId) || [];
      const days = 7;

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
          const dayValue = d + 1; // ✅ your DB uses 1-based days (today = 1)
          const users = byCell.get(`${boardId}|${dayValue}|${rowLabel}`) || [];
          const threshold = goldByBoard.get(boardId) || 2;
          const isGold = users.length >= threshold;

        // If the cell is gold, we hide dots entirely (match main board behavior)
        let dotsHtml = "";
        let extraHtml = "";

        if (!isGold) {
          // Build dot stack (cap visible dots to keep it clean)
          const maxDots = 8;
          const visible = users.slice(0, maxDots);
          const extra = users.length - visible.length;

          dotsHtml = visible.map(uid => {
            const p = profilesByUser.get(String(uid));
            const f = fallbackByUser.get(String(uid));

            const col = p?.color || f?.color || "rgba(0,0,0,0.35)";
            const name = (p?.name || f?.name || "").trim();
            return `<span class="mini-dot" style="background:${col}" title="${escapeHtml(name)}"></span>`;
          }).join("");

          extraHtml = extra > 0 ? `<span class="mini-more">+${extra}</span>` : "";
        }

          cells.push(`
            <div class="mini-cell ${isGold ? "mini-gold" : ""}">
              <div class="mini-dots">${dotsHtml}${extraHtml}</div>
            </div>
          `);
        }

        return `<div class="mini-row">${rowHead}${cells.join("")}</div>`;
      }).join("");

      // Auto-scale: fewer rows = bigger preview; more rows = smaller
      const rowCount = Math.max(rows.length, 1);
      const scale = Math.max(0.55, Math.min(1.05, 10 / (rowCount + 2)));
      previewEl.style.setProperty("--mini-scale", String(scale));

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
  margin-top:6px;
  padding:0 10px 0 8px;
  box-sizing:border-box;
">
  <!-- This wrapper SHRINKS to content width -->
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
    const p = profilesByUser.get(String(uid));
    const f = fallbackByBoardUser.get(`${boardId}|${String(uid)}`);

    const col = p?.color || f?.color || "rgba(0,0,0,0.35)";
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
        <div class="mini-board">
          <div class="mini-head">${headerCells}</div>
          <div class="mini-body">${bodyRows}</div>
        </div>
        ${legendHtml}
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

  // Structure selection (Dev Custom + Meals)
  const devCard = document.getElementById("dev-custom-card");
  if (devCard) {
    devCard.addEventListener("click", () => {
      selectedStructure = "custom";
      setActiveStructureCard("dev-custom-card");
      showGoCreate();
    });
  }

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

colourSave?.addEventListener("click", async () => {
  try {
   const v = selectedColour;
      if (!v) return setColourError("Please choose a colour.");
      if (!COLOUR_PRESETS.includes(v)) return setColourError("Please choose a colour from the list.");

    // no change
    if (user?.color && v === user.color.toUpperCase()) {
      closeColourModal();
      return;
    }

    colourSave.disabled = true;
    setColourError("");

    const au = await auth.getAuthUser();
    if (!au) {
      setColourError("You’re not signed in.");
      return;
    }

    // Update profile colour
    const { error } = await supabase
      .from("profiles")
      .update({ color: v })
      .eq("user_id", au.id);

    if (error) throw error;
    
    // Update in-memory + cache (important for realtime)
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

    // Refresh dashboard previews (legend/dots)
    await loadBoards();

    // Refresh open calendar (legend/dots)
    if (currentTable) {
      await loadAvailability();
    }

  } catch (err) {
    console.error("Change colour failed:", err);
    setColourError("Could not update your colour. Please try again.");
  } finally {
    if (colourSave) colourSave.disabled = false;
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
  
document.getElementById("acct-upgrade-pro")?.addEventListener("click", async () => {
  await confirmModal({
    title: "Pro (later)",
    message: "This will eventually show pricing and upgrade options.",
    okText: "Close",
    cancelText: ""
  });
});

document.getElementById("remove-user-cancel")?.addEventListener("click", () => {
  closeRemoveUserModal();
});

document.getElementById("remove-user-modal")?.addEventListener("click", (e) => {
  if (!e.target.closest(".modal-card")) {
    closeRemoveUserModal();
  }
});
  
  const mealsCard = document.getElementById("meals-card");
  if (mealsCard) {
    mealsCard.addEventListener("click", () => {
      selectedStructure = "meals";
      setActiveStructureCard("meals-card");
      showGoCreate();
    });
  }

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
      const boardName = card.querySelector(".board-pill-title")?.textContent?.trim() || "Availability Calendar";

      if (!inviteTok) {
        console.error("No invite token found on hosted board card.");
        return;
      }

      openInviteModal({
        boardId: card.dataset.boardId,
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
  addUsersBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!manageToken) return;
    if (!currentTable?.invite_token) {
      console.error("Invite token missing on currentTable");
      return;
    }

    openInviteModal({
      boardId: currentTable.id,
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

  const { data: invites, error: inviteErr } = await supabase
    .from("board_invites")
    .select("id, email, accepted_at, accepted_by_user_id")
    .eq("board_id", currentTable.id)
    .not("accepted_at", "is", null);

  if (inviteErr) throw inviteErr;

  const rows = invites || [];
  if (!rows.length) return [];

  const acceptedUserIds = [...new Set(
    rows
      .map(row => row.accepted_by_user_id ? String(row.accepted_by_user_id) : null)
      .filter(Boolean)
      .filter(id => String(id) !== String(currentTable.owner_id))
  )];

  const profiles = acceptedUserIds.length
    ? await fetchProfilesMap(acceptedUserIds)
    : {};

  const seen = new Set();
  const removable = [];

  rows.forEach((row) => {
    const acceptedUserId = row.accepted_by_user_id
      ? String(row.accepted_by_user_id)
      : null;

    if (acceptedUserId && acceptedUserId === String(currentTable.owner_id)) return;

    const key = acceptedUserId || `email:${(row.email || "").toLowerCase().trim()}`;
    if (!key || seen.has(key)) return;
    seen.add(key);

    const profile = acceptedUserId ? (profiles[acceptedUserId] || {}) : {};

    removable.push({
      invite_id: row.id,
      user_id: acceptedUserId,
      email: (row.email || "").trim(),
      name:
        (profile.name || "").trim() ||
        (row.email || "").trim() ||
        "Unknown user",
      color: profile.color || "#8E8E93"
    });
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
const legendDiv = document.getElementById("legend");
const legendList = document.getElementById("legendList");



document.addEventListener("DOMContentLoaded", startApp);
