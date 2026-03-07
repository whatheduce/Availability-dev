export function createAuthModule(deps) {
  
const {
  supabase,
  showConfirmPopup,
  loadBoards,
  loadTable,
  showDashboard,
  inviteToken,
  manageToken,
  setUser,
  getUser,
  getSetupSelectedColour,
  possessive,
} = deps;

let authMode = "signin";

function showAuthOverlay(msg = "", opts = {}) {
  document.body.style.visibility = "visible";
  const overlay = document.getElementById("auth-overlay");
  const message = document.getElementById("auth-msg");
  const toggle = document.getElementById("auth-toggle-mode");
  const subtitle = document.getElementById("auth-subtitle");
  const titleEl = document.getElementById("auth-title");

  if (!overlay || !toggle || !subtitle) return;

  const lockSignin = !!opts.lockSignin;

  // If locked, force signin
  if (lockSignin) {
    authMode = "signin";
  }

  // Always show overlay
  overlay.style.display = "block";
  document.body.classList.add("show-landing-bg");

  // Hide/show the toggle reliably
  toggle.hidden = lockSignin;

  // Title/subtitle for locked vs normal
  if (lockSignin) {
    if (titleEl) titleEl.textContent = "Sign in as the calendar owner";
    subtitle.textContent = "This link is owner-only. Sign in to continue.";
  } else {
    if (titleEl) titleEl.textContent = "Sign in to access your Hearth Account";
  }

  // Normal mode switching (only when NOT locked)
  if (!lockSignin) {
    if (authMode === "signin") {
      toggle.textContent = "Create account";
      subtitle.textContent = "Sign in to continue.";
    } else {
      toggle.textContent = "I already have an account";
      subtitle.textContent = "Create your account (you must confirm your email).";
    }
  }

  // Message block
  if (message) {
    if (msg) {
      message.style.display = "block";
      message.textContent = msg;
    } else {
      message.style.display = "none";
      message.textContent = "";
    }
  }
}

function hideAuthOverlay() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.style.display = "none";

  document.body.classList.remove("show-landing-bg");
}
  
function setAuthMode(mode /* "signin" | "recovery" */) {
  if (mode === "signin") {
    authMode = "signin";
  }
  const form = document.getElementById("auth-form");
  const toggleRow = document.getElementById("auth-toggle-mode")?.parentElement; // the flex row
  const recovery = document.getElementById("auth-recovery");
  const title = document.getElementById("auth-title");
  const subtitle = document.getElementById("auth-subtitle");

  if (!form || !recovery) return;

  const isRecovery = mode === "recovery";

  form.style.display = isRecovery ? "none" : "block";
  if (toggleRow) toggleRow.style.display = isRecovery ? "none" : "flex";
  recovery.style.display = isRecovery ? "block" : "none";

  if (title) title.textContent = isRecovery ? "Reset your password" : "Sign in to access your Hearth Account";
  if (subtitle) subtitle.textContent = isRecovery
    ? "Enter a new password to finish resetting your account."
    : "Create an account or sign in to continue.";
}

function resetAuthToFreshSignin() {
  // Clear fields
  const emailEl = document.getElementById("auth-email");
  const pwEl = document.getElementById("auth-password");
  if (emailEl) emailEl.value = "";
  if (pwEl) pwEl.value = "";

  // Clear recovery fields if present
  const p1 = document.getElementById("auth-new-password");
  const p2 = document.getElementById("auth-new-password-confirm");
  if (p1) p1.value = "";
  if (p2) p2.value = "";

  // Clear any inline message (if you still have it)
  const msg = document.getElementById("auth-msg");
  if (msg) {
    msg.textContent = "";
    msg.style.display = "none";
  }

  // Ensure sign-in mode
  if (typeof setAuthMode === "function") setAuthMode("signin");
}  

async function getAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user || null;
}

async function loadProfile() {
  const au = await getAuthUser();
  if (!au) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", au.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  if (!data) return null;

  setUser({
    id: au.id,
    name: data.name,
    color: data.color
  });

  return data;
}  
  
async function hydrateUserFromAuth() {
  const prof = await loadProfile();
  if (!prof || !prof.name || !prof.color) return null;
  return prof;
}

async function handleAuthSubmit() {
  const emailEl = document.getElementById("auth-email");
  const passEl = document.getElementById("auth-password");
  const msgEl = document.getElementById("auth-msg");
  const email = (emailEl?.value || "").trim();
  const password = (passEl?.value || "").trim();

  if (!email || !password) {
    showAuthOverlay("Please enter email and password.");
    return;
  }

  if (msgEl) { msgEl.style.display = "none"; msgEl.textContent = ""; }

  if (authMode === "signup") {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      showAuthOverlay(error.message || "Sign up failed.");
      return;
    }
    // Confirm email is ON: user must confirm before sign-in session works reliably
    showAuthOverlay("Account created. Please check your email to confirm, then come back and sign in.");
    authMode = "signin";
    return;
  }

  // signin
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showAuthOverlay(error.message || "Sign in failed.");
    return;
  }

  const hydrated = await hydrateUserFromAuth();
  setDashboardSubtitle();
  hideAuthOverlay();

    if (!hydrated) {
      showProfileSetup();
      return;
    }

  document.body.classList.add("logged-in");

    // Now proceed to board or create screen
    if (inviteToken || manageToken) {
      await loadTable();
    } else {
      showDashboard();
      await loadBoards();
    }
}

async function saveProfileSetup() {
  const au = await getAuthUser();
  if (!au) return;

  const name = document.getElementById("setup-name")?.value?.trim();
  const color = getSetupSelectedColour();

  if (!name) return alert("Please choose a username.");

  const { error } = await supabase.from("profiles").upsert({
    user_id: au.id,
    name,
    color
  });

  if (error) return alert(error.message);

  // update in-memory user immediately
  setUser({ id: au.id, name, color });

  hideProfileSetup();

    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("t");
    const manageToken = params.get("m"); // if you use this

    if (inviteToken || manageToken) {
      await loadTable();
      return;
    }

showDashboard();
await loadBoards();
}  
  
function showProfileSetup() {
  document.body.style.visibility = "visible";

  const dash = document.getElementById("dashboard");
  if (dash) dash.style.display = "none";

  const setup = document.getElementById("profile-setup");
  if (setup) setup.style.display = "block";
}

function hideProfileSetup() {
  const setup = document.getElementById("profile-setup");
  if (setup) setup.style.display = "none";
}
  



  
// CHECK IF WE NEED THIS
async function getOrCreateProfile({ name, color }) {
  const user = await getAuthUser();
  if (!user) return null;

  // try fetch
  const { data: existing } = await supabase
    .from("profiles")
    .select("user_id, name, color")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return existing;

  // create
  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ user_id: user.id, name, color })
    .select()
    .single();

  if (error) {
    console.error("Profile create failed:", error);
    return null;
  }
  return created;
}
// CHECK IF WE NEED THIS




function setDashboardSubtitle() {
  const dashUser = document.getElementById("dash-username");
  const user = getUser();

  if (dashUser && user?.name) {
    dashUser.textContent = possessive(user.name).toUpperCase();
  }
}


function bindAuthUi() {
    const authForm = document.getElementById("auth-form");
      if (authForm) {
        authForm.addEventListener("submit", (e) => {
          e.preventDefault();
          handleAuthSubmit();
        });
      }

document.getElementById("auth-password")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const btn = document.getElementById("auth-submit");
        if (!btn) return;

        btn.classList.add("is-pressed");
        setTimeout(() => {
          btn.classList.remove("is-pressed");
        }, 120);
      }
    });

document.getElementById("auth-submit")?.addEventListener("click", handleAuthSubmit);

  document.getElementById("auth-toggle-mode")?.addEventListener("click", () => {
    // If button is hidden (locked), do nothing
    const btn = document.getElementById("auth-toggle-mode");
    if (btn && btn.style.display === "none") return;

    authMode = (authMode === "signin") ? "signup" : "signin";
    showAuthOverlay();
    });

document.getElementById("auth-forgot")?.addEventListener("click", async () => {
  const forgotBtn = document.getElementById("auth-forgot");
  const email = (document.getElementById("auth-email")?.value || "").trim();

  if (!email) {
    showConfirmPopup("Enter your email first, then click Forgot password.", {
      title: "Forgot password",
    });
    return;
  }

  if (forgotBtn) {
    forgotBtn.disabled = true;
    forgotBtn.dataset.originalText = forgotBtn.textContent;
    forgotBtn.textContent = "Sending...";
  }

  // show immediate feedback modal
  showConfirmPopup("Sending password reset email...", {
  title: "Forgot password",
  showOk: false
});

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });

    if (error) {
      showConfirmPopup(error.message || "Failed to send reset email.", {
        title: "Forgot password",
      });
      return;
    }

    showConfirmPopup("Password reset email sent. Check your inbox.", {
      title: "Forgot password",
      onOk: () => {
        resetAuthToFreshSignin();
      },
    });
  } finally {
    if (forgotBtn) {
      forgotBtn.disabled = false;
      forgotBtn.textContent = forgotBtn.dataset.originalText || "Forgot password";
    }
  }
});

document.getElementById("auth-set-password")?.addEventListener("click", async () => {
  const setBtn = document.getElementById("auth-set-password");

  const p1 = (document.getElementById("auth-new-password")?.value || "").trim();
  const p2 = (document.getElementById("auth-new-password-confirm")?.value || "").trim();

  if (!p1 || p1.length < 8) {
    showConfirmPopup("Password must be at least 8 characters.", { title: "Reset password" });
    setAuthMode("recovery");
    return;
  }
  if (p1 !== p2) {
    showConfirmPopup("Passwords do not match.", { title: "Reset password" });
    setAuthMode("recovery");
    return;
  }

  // ✅ Tiny UX polish: disable button + show immediate feedback
  if (setBtn) {
    setBtn.disabled = true;
    setBtn.dataset.originalText = setBtn.textContent;
    setBtn.textContent = "Updating...";
  }

  showConfirmPopup("Updating your password...", {
  title: "Reset password",
  showOk: false
});

  try {
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) {
      showConfirmPopup(error.message || "Failed to update password.", {
        title: "Reset password",
        onOk: () => setAuthMode("recovery"),
      });
      return;
    }

    // Clean URL/hash so refresh doesn't re-trigger recovery mode
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

    localStorage.removeItem("pw_recovery_in_progress");
    await supabase.auth.signOut();

    showConfirmPopup("Password updated. Please sign in with your new password.", {
      title: "Reset password",
      onOk: () => {
        resetAuthToFreshSignin();
        showAuthOverlay("");
      },
    });

    setAuthMode("signin");
  } finally {
    // ✅ re-enable button
    if (setBtn) {
      setBtn.disabled = false;
      setBtn.textContent = setBtn.dataset.originalText || "Update password";
    }
  }
});

  document.getElementById("auth-recovery-cancel")?.addEventListener("click", async () => {
    localStorage.removeItem("pw_recovery_in_progress");
    await supabase.auth.signOut();
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    setAuthMode("signin");
    resetAuthToFreshSignin();
  });

document.getElementById("auth-new-password-confirm")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("auth-set-password")?.click();
  }
});
}
  
  return {
    showAuthOverlay,
    hideAuthOverlay,
    setAuthMode,
    resetAuthToFreshSignin,
    getAuthUser,
    loadProfile,
    hydrateUserFromAuth,
    handleAuthSubmit,
    showProfileSetup,
    hideProfileSetup,
    saveProfileSetup,
    bindAuthUi,
    setDashboardSubtitle,
  };
}
