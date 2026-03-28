/**
 * bamadi Partner-Portal — Supabase Auth (Magic Link), Routing, Demo-Modus.
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEMO_SESSION_KEY = "bamadi_partner_session";

const ROUTES = {
  dashboard: { hash: "#/dashboard", title: "Dashboard" },
  gruppen: { hash: "#/gruppen", title: "Gruppen & Studenten" },
  codes: { hash: "#/codes", title: "Codes" },
  abrechnung: { hash: "#/abrechnung", title: "Abrechnung" },
  einstellungen: { hash: "#/einstellungen", title: "Einstellungen" },
};

const DEFAULT_ROUTE = "dashboard";

let supabase = null;

async function loadSupabaseConfig() {
  const response = await fetch("../supabase.config.json");
  if (!response.ok) throw new Error("Supabase-Konfiguration nicht geladen (supabase.config.json).");
  const raw = await response.json();
  const url = String(raw.url || "").replace(/\/$/, "");
  const anonKey = raw.anonKey || raw.key || "";
  if (!url || !anonKey) throw new Error("supabase.config.json: url und anonKey erforderlich.");
  return { url, anonKey };
}

function getDemoSession() {
  try {
    const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function setDemoSession(payload) {
  sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(payload));
}

function clearDemoSession() {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
}

function formatAuthEmailError(error) {
  if (!error) return "";
  const raw = String(error.message || error);
  const m = raw.toLowerCase();
  if (m.includes("rate limit") || m.includes("email rate") || m.includes("too many")) {
    return (
      "E-Mail-Versand ist gerade begrenzt (Limit von Supabase für Test-E-Mails). " +
      "Bitte eine Weile warten und nicht mehrfach hintereinander auf „Anmeldelink senden“ klicken. " +
      "Für höhere Limits später: eigenes SMTP unter Authentication → E-Mail. " +
      "Zum UI-Test ohne Mail: unten „Oberfläche ansehen“."
    );
  }
  return raw;
}

function showDeploymentHints() {
  const el = document.getElementById("authDeployHint");
  if (!el) return;
  const { protocol, hostname, href } = window.location;
  if (protocol === "file:") {
    el.hidden = false;
    el.className = "deploy-hint";
    el.textContent =
      "Diese Seite läuft als lokale Datei (file://). Magic Links funktionieren damit nicht. Seite über http://localhost (z. B. „npx serve“ im Projektordner) oder die echte https-URL öffnen.";
    return;
  }
  if (/vercel\.app$|\.netlify\.app$|\.pages\.dev$/i.test(hostname)) {
    el.hidden = false;
    el.className = "deploy-hint deploy-hint--info";
    el.textContent =
      "Preview-URL: In Supabase → Authentication → URL configuration diese genaue Basis-URL (inkl. https und ggf. Pfad /partner/) unter Redirect URLs eintragen. Ohne Eintrag verweigert Supabase den Rücksprung aus der E-Mail.";
  }
}

function normalizeRoute(hash) {
  const h = (hash || "").replace(/^#/, "").replace(/^\//, "");
  const name = h.split("/")[0] || DEFAULT_ROUTE;
  return ROUTES[name] ? name : DEFAULT_ROUTE;
}

function showAuth() {
  const auth = document.getElementById("authView");
  const app = document.getElementById("appView");
  if (auth) auth.hidden = false;
  if (app) app.hidden = true;
}

function showApp() {
  const auth = document.getElementById("authView");
  const app = document.getElementById("appView");
  if (auth) auth.hidden = true;
  if (app) app.hidden = false;
}

function setActiveNav(route) {
  document.querySelectorAll(".sidebar-nav .nav-item").forEach((el) => {
    const r = el.getAttribute("data-route");
    el.classList.toggle("is-active", r === route);
  });
}

function showView(route) {
  const name = normalizeRoute(route);
  document.querySelectorAll(".view").forEach((v) => {
    const id = v.getAttribute("data-view");
    v.hidden = id !== name;
  });
  const cfg = ROUTES[name];
  const titleEl = document.getElementById("pageTitle");
  if (titleEl && cfg) titleEl.textContent = cfg.title;
  setActiveNav(name);
  if (window.location.hash !== cfg.hash) {
    window.history.replaceState(null, "", cfg.hash);
  }
}

function applyRouteFromHash() {
  if (/access_token|refresh_token|type=recovery/i.test(window.location.hash)) {
    return;
  }
  const name = normalizeRoute(window.location.hash);
  showView(name);
}

function initRouting() {
  window.addEventListener("hashchange", applyRouteFromHash);
  if (!window.location.hash || window.location.hash === "#") {
    window.location.hash = "#/dashboard";
  }
  applyRouteFromHash();
}

function initKpiPlaceholder() {
  const set = (id, val) => {
    const n = document.getElementById(id);
    if (n) n.textContent = val;
  };
  set("kpiCodesTotal", "0");
  set("kpiCodesRedeemed", "0");
  set("kpiMonthCost", "0,00 €");
  set("kpiInvoiceHint", "Keine offenen Posten");
}

function fillSettingsFromDemo(s) {
  const label = document.getElementById("sidebarAccountLabel");
  const company = document.getElementById("setCompany");
  const email = document.getElementById("setEmail");
  if (label) {
    if (s?.company) label.textContent = s.company;
    else if (s?.email) label.textContent = s.email;
    else label.textContent = "—";
  }
  if (company) company.value = s?.company || "—";
  if (email) email.value = s?.email || "—";
}

async function fillSettingsFromB2b() {
  const label = document.getElementById("sidebarAccountLabel");
  const company = document.getElementById("setCompany");
  const email = document.getElementById("setEmail");
  if (!supabase) return;
  const { data, error } = await supabase.from("b2b_accounts").select("company_name, contact_email, active").maybeSingle();
  if (error) {
    console.warn("[partner] b2b_accounts:", error.message);
    if (label) label.textContent = "Konto nicht geladen";
    return;
  }
  if (!data) {
    if (label) label.textContent = "Noch kein Partnerkonto";
    if (company) company.value = "—";
    if (email) email.value = "—";
    return;
  }
  if (label) label.textContent = data.company_name || data.contact_email || "—";
  if (company) company.value = data.company_name || "—";
  if (email) email.value = data.contact_email || "—";
}

function bindLogout() {
  const btn = document.getElementById("btnLogout");
  if (btn) {
    btn.addEventListener("click", async () => {
      clearDemoSession();
      if (supabase) await supabase.auth.signOut();
      showAuth();
      window.location.hash = "";
    });
  }
}

function bindAuthForms() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const loginMsg = document.getElementById("loginMessage");
  const registerMsg = document.getElementById("registerMessage");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const email = String(fd.get("email") || "").trim();
      if (!email) return;
      if (window.location.protocol === "file:") {
        if (loginMsg) {
          loginMsg.hidden = false;
          loginMsg.className = "form-message is-error";
          loginMsg.textContent =
            "Magic Link ist bei file:// nicht möglich. Bitte http://localhost oder eine https-URL nutzen.";
        }
        return;
      }
      if (!supabase) {
        if (loginMsg) {
          loginMsg.hidden = false;
          loginMsg.className = "form-message is-error";
          loginMsg.textContent = "Supabase ist nicht konfiguriert (supabase.config.json).";
        }
        return;
      }
      // Ohne Query/Hash: gleiche URL wie in Supabase „Redirect URLs“ (z. B. ohne ?serverWindowId=…)
      const u = new URL(window.location.href);
      const redirectTo = `${u.origin}${u.pathname}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (loginMsg) {
        loginMsg.hidden = false;
        loginMsg.className = "form-message " + (error ? "is-error" : "is-success");
        loginMsg.textContent = error
          ? formatAuthEmailError(error)
          : "Link wurde gesendet. Bitte Posteingang prüfen (und ggf. Spam-Ordner).";
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (registerMsg) {
        registerMsg.hidden = false;
        registerMsg.className = "form-message";
        registerMsg.textContent =
          "Die Registrierung wird manuell geprüft. Bitte wenden Sie sich an bamadi oder nutzen Sie die Anmeldung, sobald Sie eine Freischaltung erhalten haben.";
      }
    });
  }

  const demo = document.getElementById("btnDemoPreview");
  if (demo) {
    demo.addEventListener("click", () => {
      setDemoSession({
        email: "demo@partner.bamadi.local",
        company: "Demo-Unternehmen",
        demo: true,
      });
      fillSettingsFromDemo(getDemoSession());
      initKpiPlaceholder();
      showApp();
      window.location.hash = ROUTES[DEFAULT_ROUTE].hash;
      applyRouteFromHash();
    });
  }
}

async function boot() {
  showDeploymentHints();
  bindLogout();
  bindAuthForms();

  try {
    const cfg = await loadSupabaseConfig();
    supabase = createClient(cfg.url, cfg.anonKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !getDemoSession()?.demo) {
        showApp();
        fillSettingsFromB2b();
      }
    });
  } catch (err) {
    console.warn("[partner] Supabase:", err?.message || err);
  }

  if (getDemoSession()?.demo) {
    fillSettingsFromDemo(getDemoSession());
    initKpiPlaceholder();
    showApp();
    initRouting();
    return;
  }

  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      showApp();
      initKpiPlaceholder();
      await fillSettingsFromB2b();
      initRouting();
      return;
    }
  }

  showAuth();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    boot();
  });
} else {
  boot();
}
