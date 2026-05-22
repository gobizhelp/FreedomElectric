/* ==========================================================================
   Freedom Electric — Tracking Engine
   Captures: page views, scroll depth, time, clicks, calls, texts, form
   interactions, FAQ opens, service card clicks, exit intent, UTMs.
   Pushes to window.dataLayer (GTM/GA4), stores locally for admin dashboard,
   and forwards to a configurable webhook endpoint if set.
   ========================================================================== */

(function () {
  "use strict";

  // ---------- Config helpers ------------------------------------------------
  var SETTINGS_KEY = "fe_settings_v1";
  var EVENT_LOG_KEY = "fe_event_log_v1";
  var LEAD_LOG_KEY = "fe_leads_v1";
  var SESSION_KEY = "fe_session_v1";
  var UTM_KEY = "fe_utm_v1";
  var MAX_EVENTS = 500;
  var MAX_LEADS = 200;

  function safeJSON(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }
  function storageGet(key, fallback) {
    try {
      var v = window.localStorage.getItem(key);
      return v ? safeJSON(v, fallback) : fallback;
    } catch (e) { return fallback; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function loadSettings() {
    return storageGet(SETTINGS_KEY, {});
  }

  function nowIso() { return new Date().toISOString(); }

  function uid() {
    return "fe_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function getOrCreateAnon() {
    var anonKey = "fe_anon_v1";
    try {
      var v = window.localStorage.getItem(anonKey);
      if (v) return v;
      var fresh = uid();
      window.localStorage.setItem(anonKey, fresh);
      return fresh;
    } catch (e) { return uid(); }
  }

  function deviceType() {
    var ua = navigator.userAgent || "";
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
      return /iPad|tablet|Tablet/.test(ua) ? "tablet" : "mobile";
    }
    return "desktop";
  }

  // ---------- UTM capture ---------------------------------------------------
  function captureUtm() {
    var existing = storageGet(UTM_KEY, null);
    if (existing && existing.locked) return existing;
    var qs = new URLSearchParams(window.location.search);
    var fields = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid"];
    var captured = existing || {};
    var found = false;
    fields.forEach(function (k) {
      var val = qs.get(k);
      if (val) { captured[k] = val; found = true; }
    });
    captured.first_landing_page = captured.first_landing_page || window.location.pathname;
    captured.first_referrer = captured.first_referrer || document.referrer || "(direct)";
    captured.first_seen_at = captured.first_seen_at || nowIso();
    if (found || !existing) {
      captured.locked = true;
      storageSet(UTM_KEY, captured);
    }
    return captured;
  }

  // ---------- Session -------------------------------------------------------
  function startSession(landingPage) {
    var session = storageGet(SESSION_KEY, null);
    var thirtyMin = 30 * 60 * 1000;
    var fresh = !session || (Date.now() - (session.last_active || 0) > thirtyMin);
    if (fresh) {
      session = {
        id: uid(),
        started_at: nowIso(),
        last_active: Date.now(),
        landing_page: landingPage,
        device: deviceType(),
        viewport: window.innerWidth + "x" + window.innerHeight,
        referrer: document.referrer || "(direct)"
      };
    } else {
      session.last_active = Date.now();
    }
    storageSet(SESSION_KEY, session);
    return session;
  }
  function touchSession() {
    var s = storageGet(SESSION_KEY, null);
    if (s) { s.last_active = Date.now(); storageSet(SESSION_KEY, s); }
  }

  // ---------- Event log -----------------------------------------------------
  function logEvent(name, params) {
    var settings = loadSettings();
    var session = storageGet(SESSION_KEY, {});
    var utm = storageGet(UTM_KEY, {});
    var payload = Object.assign({
      event: name,
      ts: nowIso(),
      ts_ms: Date.now(),
      page: window.location.pathname,
      page_title: document.title,
      url: window.location.href,
      session_id: session.id,
      anon_id: getOrCreateAnon(),
      device: deviceType()
    }, utm, params || {});

    // 1. Push to dataLayer for GTM/GA4
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);

    // 2. Direct GA4 if gtag present
    if (typeof window.gtag === "function") {
      try {
        var gaParams = {};
        Object.keys(payload).forEach(function (k) {
          if (k === "event") return;
          var val = payload[k];
          if (typeof val === "object") val = JSON.stringify(val);
          gaParams[k] = val;
        });
        window.gtag("event", name, gaParams);
      } catch (e) {}
    }

    // 3. Meta Pixel — map a few core conversions
    if (typeof window.fbq === "function") {
      try {
        var fbMap = {
          page_view: ["PageView"],
          form_submit: ["Lead"],
          click_to_call: ["Contact"],
          click_to_text: ["Contact"]
        };
        var mapping = fbMap[name];
        if (mapping) { window.fbq("track", mapping[0]); }
        else { window.fbq("trackCustom", name, params || {}); }
      } catch (e) {}
    }

    // 4. Forward to webhook if configured (form_submit only by default unless trackAll)
    var trackWebhook = settings.events_webhook;
    if (trackWebhook && (settings.events_webhook_all || name === "form_submit")) {
      try {
        navigator.sendBeacon
          ? navigator.sendBeacon(trackWebhook, new Blob([JSON.stringify(payload)], { type: "application/json" }))
          : fetch(trackWebhook, { method: "POST", body: JSON.stringify(payload), keepalive: true, headers: { "Content-Type": "application/json" }});
      } catch (e) {}
    }

    // 5. Store locally for admin dashboard
    var events = storageGet(EVENT_LOG_KEY, []);
    events.push(payload);
    if (events.length > MAX_EVENTS) events = events.slice(events.length - MAX_EVENTS);
    storageSet(EVENT_LOG_KEY, events);

    touchSession();
    return payload;
  }

  // ---------- Tracking script injection ------------------------------------
  function injectTrackingScripts() {
    var s = loadSettings();
    // GA4
    if (s.ga4_id && !window.__fe_ga4) {
      window.__fe_ga4 = true;
      var s1 = document.createElement("script");
      s1.async = true;
      s1.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(s.ga4_id);
      document.head.appendChild(s1);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", s.ga4_id, { send_page_view: true });
    }
    // GTM
    if (s.gtm_id && !window.__fe_gtm) {
      window.__fe_gtm = true;
      (function (w, d, s2, l, i) {
        w[l] = w[l] || [];
        w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
        var f = d.getElementsByTagName(s2)[0], j = d.createElement(s2), dl = l !== "dataLayer" ? "&l=" + l : "";
        j.async = true;
        j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
        f.parentNode.insertBefore(j, f);
      })(window, document, "script", "dataLayer", s.gtm_id);
    }
    // Meta Pixel
    if (s.meta_pixel_id && !window.__fe_fbq) {
      window.__fe_fbq = true;
      !function (f, b, e, v, n, t, s3) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s3 = b.getElementsByTagName(e)[0]; s3.parentNode.insertBefore(t, s3);
      }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", s.meta_pixel_id);
      window.fbq("track", "PageView");
    }
    // Microsoft Clarity (heatmaps + session recording)
    if (s.clarity_id && !window.__fe_clarity) {
      window.__fe_clarity = true;
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
      })(window, document, "clarity", "script", s.clarity_id);
    }
    // Hotjar
    if (s.hotjar_id && !window.__fe_hj) {
      window.__fe_hj = true;
      (function (h, o, t, j, a, r) {
        h.hj = h.hj || function () { (h.hj.q = h.hj.q || []).push(arguments); };
        h._hjSettings = { hjid: s.hotjar_id, hjsv: 6 };
        a = o.getElementsByTagName("head")[0];
        r = o.createElement("script"); r.async = 1;
        r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
        a.appendChild(r);
      })(window, document, "https://static.hotjar.com/c/hotjar-", ".js?sv=");
    }
  }

  // ---------- Scroll depth -------------------------------------------------
  function setupScrollDepth() {
    var milestones = [25, 50, 75, 100];
    var fired = {};
    function check() {
      var doc = document.documentElement;
      var top = window.pageYOffset || doc.scrollTop;
      var height = doc.scrollHeight - window.innerHeight;
      if (height <= 0) return;
      var pct = Math.min(100, Math.round((top / height) * 100));
      milestones.forEach(function (m) {
        if (pct >= m && !fired[m]) {
          fired[m] = true;
          logEvent("scroll_depth", { percent: m });
        }
      });
    }
    window.addEventListener("scroll", throttle(check, 250), { passive: true });
  }

  // ---------- Time on page -------------------------------------------------
  function setupTimeOnPage() {
    var stops = [10, 30, 60, 120, 240];
    var start = Date.now();
    stops.forEach(function (sec) {
      setTimeout(function () {
        if (document.visibilityState !== "hidden") {
          logEvent("time_on_page", { seconds: sec });
        }
      }, sec * 1000);
    });
    window.addEventListener("beforeunload", function () {
      var elapsed = Math.round((Date.now() - start) / 1000);
      logEvent("page_unload", { seconds_on_page: elapsed });
    });
  }

  // ---------- Click tracking -----------------------------------------------
  function setupClickTracking() {
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-event], a[href^='tel:'], a[href^='sms:'], a[href^='mailto:']");
      if (!el) return;
      var evName = el.getAttribute("data-event");
      var text = el.innerText || el.textContent || "";
      var label = el.getAttribute("data-label") || text.trim().slice(0, 80);
      var location = el.getAttribute("data-location") || nearestSectionId(el);

      // Auto-detect tel/sms/mailto
      var href = el.getAttribute("href") || "";
      if (!evName) {
        if (href.indexOf("tel:") === 0) evName = "click_to_call";
        else if (href.indexOf("sms:") === 0) evName = "click_to_text";
        else if (href.indexOf("mailto:") === 0) evName = "click_to_email";
        else evName = "cta_click";
      }
      var params = { label: label, location: location };
      if (href.indexOf("tel:") === 0) params.phone = href.slice(4);
      if (href.indexOf("sms:") === 0) params.phone = href.slice(4).split("?")[0];
      logEvent(evName, params);
    }, true);
  }

  function nearestSectionId(el) {
    var s = el.closest("section, header, footer, [data-section]");
    if (!s) return "unknown";
    return s.getAttribute("data-section") || s.id || s.tagName.toLowerCase();
  }

  // ---------- Form tracking -------------------------------------------------
  function setupFormTracking() {
    document.addEventListener("focusin", function (e) {
      var form = e.target.closest("form[data-form]");
      if (!form) return;
      if (!form.__fe_started) {
        form.__fe_started = true;
        logEvent("form_start", {
          form_id: form.getAttribute("data-form"),
          first_field: e.target.getAttribute("name") || e.target.type
        });
      }
      logEvent("form_field_focus", {
        form_id: form.getAttribute("data-form"),
        field: e.target.getAttribute("name") || e.target.type
      });
    });

    document.addEventListener("change", function (e) {
      var form = e.target.closest("form[data-form]");
      if (!form) return;
      logEvent("form_field_change", {
        form_id: form.getAttribute("data-form"),
        field: e.target.getAttribute("name") || e.target.type
      });
    });

    document.addEventListener("submit", function (e) {
      var form = e.target.closest("form[data-form]");
      if (!form) return;
      e.preventDefault();
      handleFormSubmit(form);
    });
  }

  function handleFormSubmit(form) {
    var settings = loadSettings();
    var formId = form.getAttribute("data-form");
    var fd = new FormData(form);
    var data = {};
    fd.forEach(function (v, k) { data[k] = v; });
    var utm = storageGet(UTM_KEY, {});
    var session = storageGet(SESSION_KEY, {});

    var lead = {
      id: uid(),
      form_id: formId,
      page: window.location.pathname,
      submitted_at: nowIso(),
      anon_id: getOrCreateAnon(),
      session_id: session.id,
      device: deviceType(),
      utm: utm,
      data: data
    };

    // Save locally for admin dashboard
    var leads = storageGet(LEAD_LOG_KEY, []);
    leads.push(lead);
    if (leads.length > MAX_LEADS) leads = leads.slice(leads.length - MAX_LEADS);
    storageSet(LEAD_LOG_KEY, leads);

    // Send to admin-configured webhook (Formspree / Netlify / Zapier / custom)
    var endpoint = settings.lead_webhook;
    var promise = Promise.resolve();
    if (endpoint) {
      promise = fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(lead)
      }).catch(function () { /* fail silent — lead is still saved locally */ });
    }

    // Email fallback via mailto only if explicitly enabled and no endpoint
    logEvent("form_submit", {
      form_id: formId,
      fields_count: Object.keys(data).length,
      service: data.service || ""
    });

    promise.finally(function () {
      var msg = form.querySelector(".fe-form__success");
      if (msg) msg.style.display = "block";
      form.querySelectorAll("input, select, textarea, button").forEach(function (el) { el.disabled = true; });
      var redirect = form.getAttribute("data-redirect");
      if (redirect) {
        setTimeout(function () {
          var params = new URLSearchParams({
            form: formId,
            page: window.location.pathname.replace(/\W/g, "_")
          });
          window.location.href = redirect + "?" + params.toString();
        }, 700);
      }
    });
  }

  // ---------- FAQ tracking --------------------------------------------------
  function setupFaqTracking() {
    document.querySelectorAll(".fe-faq__item").forEach(function (det) {
      det.addEventListener("toggle", function () {
        if (det.open) {
          var q = det.querySelector(".fe-faq__q");
          var qText = q ? (q.innerText || q.textContent || "") : "";
          logEvent("faq_open", { question: qText.trim().slice(0, 120) });
        }
      });
    });
  }

  // ---------- Service card clicks (delegated via data-event) ---------------
  // Already covered in setupClickTracking via [data-event="service_click"]

  // ---------- Exit intent (desktop only) -----------------------------------
  function setupExitIntent() {
    if (deviceType() !== "desktop") return;
    var fired = false;
    document.addEventListener("mouseout", function (e) {
      if (fired) return;
      if (!e.relatedTarget && e.clientY < 10) {
        fired = true;
        logEvent("exit_intent", {});
      }
    });
  }

  // ---------- Helpers -------------------------------------------------------
  function throttle(fn, wait) {
    var last = 0;
    return function () {
      var now = Date.now();
      if (now - last >= wait) { last = now; fn.apply(this, arguments); }
    };
  }

  // ---------- Public API ----------------------------------------------------
  window.FETracking = {
    log: logEvent,
    settings: loadSettings,
    saveSettings: function (next) { storageSet(SETTINGS_KEY, next); injectTrackingScripts(); },
    getEvents: function () { return storageGet(EVENT_LOG_KEY, []); },
    getLeads: function () { return storageGet(LEAD_LOG_KEY, []); },
    clearEvents: function () { storageSet(EVENT_LOG_KEY, []); },
    clearLeads: function () { storageSet(LEAD_LOG_KEY, []); },
    constants: { SETTINGS_KEY: SETTINGS_KEY, EVENT_LOG_KEY: EVENT_LOG_KEY, LEAD_LOG_KEY: LEAD_LOG_KEY }
  };

  // ---------- Init ----------------------------------------------------------
  function init() {
    captureUtm();
    var session = startSession(window.location.pathname);
    injectTrackingScripts();

    logEvent("page_view", {
      title: document.title,
      session_id: session.id,
      viewport: session.viewport
    });

    setupScrollDepth();
    setupTimeOnPage();
    setupClickTracking();
    setupFormTracking();
    setupFaqTracking();
    setupExitIntent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
