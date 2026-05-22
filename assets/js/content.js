/* ==========================================================================
   Freedom Electric — Content Loader & Section Toggles
   Applies admin overrides (text, phone, email, service areas, section
   visibility) to elements with data-content / data-section attributes.
   Source of truth: assets/content/default-content.json (baked in below for
   offline use), with admin overrides stored in localStorage.
   ========================================================================== */

(function () {
  "use strict";

  var CONTENT_KEY = "fe_content_overrides_v1";
  var SECTION_KEY = "fe_section_visibility_v1";
  var GLOBAL_KEY = "fe_global_v1";

  // Default brand facts — used to backfill data-content tokens like {{phone}}
  var DEFAULTS = {
    brand: "Freedom Electric & Lighting",
    tagline: "The People's Electrician",
    phone: "(719) 437-7802",
    phone_raw: "+17194377802",
    sms_raw: "+17194377802",
    email: "freedom.electric2023@gmail.com",
    license: "ME.3000991",
    address_city: "Colorado Springs, CO",
    service_areas: "Colorado Springs · Fountain · Manitou Springs · Monument · Peyton · El Paso County · Front Range",
    website: "freedomelectriclighting.com",
    jobs_completed: "500+",
    rating: "4.9",
    logo_light: "https://freedomelectriclighting.com/wp-content/uploads/2026/03/Freedom_Electric_Logo_Header_Thin.png",
    logo_dark: "https://freedomelectriclighting.com/wp-content/uploads/2026/04/Freedom_Electric_Logo_Web_DarkBG_Shrunk.png"
  };

  function safeJSON(s, f) { try { return JSON.parse(s); } catch (e) { return f; } }
  function get(key, fallback) {
    try { var v = window.localStorage.getItem(key); return v ? safeJSON(v, fallback) : fallback; }
    catch (e) { return fallback; }
  }
  function set(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }

  function loadGlobals() {
    return Object.assign({}, DEFAULTS, get(GLOBAL_KEY, {}));
  }
  function saveGlobals(next) { set(GLOBAL_KEY, next); }

  function loadOverrides() { return get(CONTENT_KEY, {}); }
  function saveOverrides(next) { set(CONTENT_KEY, next); }

  function loadSectionVisibility() { return get(SECTION_KEY, {}); }
  function saveSectionVisibility(next) { set(SECTION_KEY, next); }

  // Apply global tokens to elements that include them
  function applyGlobalTokens(globals) {
    document.querySelectorAll("[data-token]").forEach(function (el) {
      var token = el.getAttribute("data-token");
      if (token && Object.prototype.hasOwnProperty.call(globals, token)) {
        el.textContent = globals[token];
      }
    });
    // tel: and sms: hrefs
    document.querySelectorAll("a[data-href-token]").forEach(function (el) {
      var t = el.getAttribute("data-href-token");
      var prefix = el.getAttribute("data-href-prefix") || "";
      if (Object.prototype.hasOwnProperty.call(globals, t)) {
        el.setAttribute("href", prefix + globals[t]);
      }
    });
    // <img src> swaps from globals (e.g. logo_light, logo_dark)
    document.querySelectorAll("img[data-src-token]").forEach(function (el) {
      var t = el.getAttribute("data-src-token");
      if (Object.prototype.hasOwnProperty.call(globals, t) && globals[t]) {
        el.setAttribute("src", globals[t]);
      }
    });
  }

  function pageKey() {
    var p = window.location.pathname.split("/").pop() || "index.html";
    return p.replace(/\.html?$/, "") || "index";
  }

  // Apply per-page content overrides to elements with data-content="key"
  function applyContentOverrides(overrides) {
    var key = pageKey();
    var pageOverrides = (overrides && overrides[key]) || {};
    Object.keys(pageOverrides).forEach(function (k) {
      var els = document.querySelectorAll('[data-content="' + cssEscape(k) + '"]');
      els.forEach(function (el) {
        var val = pageOverrides[k];
        if (el.hasAttribute("data-content-html")) el.innerHTML = val;
        else el.textContent = val;
      });
    });
  }

  // Apply section visibility (hide if admin toggled off)
  function applySectionVisibility(vis) {
    var key = pageKey();
    var pageVis = (vis && vis[key]) || {};
    document.querySelectorAll("[data-section]").forEach(function (el) {
      var name = el.getAttribute("data-section");
      if (pageVis[name] === false) {
        el.hidden = true;
      } else {
        el.hidden = false;
      }
    });
  }

  function cssEscape(s) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(s);
    return String(s).replace(/(["\\\]])/g, "\\$1");
  }

  // Public API for the admin to call
  window.FEContent = {
    DEFAULTS: DEFAULTS,
    pageKey: pageKey,
    loadGlobals: loadGlobals,
    saveGlobals: function (next) { saveGlobals(next); applyAll(); },
    loadOverrides: loadOverrides,
    saveOverrides: function (next) { saveOverrides(next); applyAll(); },
    loadSectionVisibility: loadSectionVisibility,
    saveSectionVisibility: function (next) { saveSectionVisibility(next); applyAll(); },
    resetAll: function () {
      try {
        localStorage.removeItem(CONTENT_KEY);
        localStorage.removeItem(SECTION_KEY);
        localStorage.removeItem(GLOBAL_KEY);
      } catch (e) {}
      applyAll();
    },
    constants: { CONTENT_KEY: CONTENT_KEY, SECTION_KEY: SECTION_KEY, GLOBAL_KEY: GLOBAL_KEY }
  };

  function applyAll() {
    applyGlobalTokens(loadGlobals());
    applyContentOverrides(loadOverrides());
    applySectionVisibility(loadSectionVisibility());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAll);
  } else {
    applyAll();
  }
})();
