/* ==========================================================================
   Freedom Electric — Admin Dashboard
   Pure-client admin (no backend). Manages:
   - Content overrides (per-page text, FAQs, service text)
   - Section visibility toggles
   - Globals (phone, email, license, areas)
   - Tracking IDs (GA4, GTM, Meta Pixel, Clarity, Hotjar)
   - Webhooks (form submissions + event forwarding)
   - View leads, events, simple charts
   - Export everything as CSV/JSON
   ========================================================================== */

(function () {
  "use strict";

  // ---------- Auth (simple client-side gate) -------------------------------
  // NOTE: This is a client-side gate. In production, put the admin behind
  // proper server auth (Cloudflare Access, Netlify Identity, basic auth).
  var AUTH_KEY = "fe_admin_auth_v1";
  var DEFAULT_PIN = "freedom2026"; // editable in Settings → Admin PIN
  var PIN_KEY = "fe_admin_pin_v1";

  function getPin() {
    try { return localStorage.getItem(PIN_KEY) || DEFAULT_PIN; } catch (e) { return DEFAULT_PIN; }
  }
  function setPin(p) { try { localStorage.setItem(PIN_KEY, p); } catch (e) {} }
  function isAuthed() {
    try { return localStorage.getItem(AUTH_KEY) === "1"; } catch (e) { return false; }
  }
  function signIn() { try { localStorage.setItem(AUTH_KEY, "1"); } catch (e) {} }
  function signOut() { try { localStorage.removeItem(AUTH_KEY); } catch (e) {} location.reload(); }

  // ---------- Constants -----------------------------------------------------
  var PAGES = [
    { key: "residential", label: "Residential" },
    { key: "panel-upgrade", label: "Panel Upgrade" },
    { key: "commercial", label: "Commercial" }
  ];
  var SECTIONS = [
    "topbar", "header", "hero", "trust_strip", "problem", "services", "benefits",
    "process", "why_us", "faq", "final_cta", "footer"
  ];

  // ---------- Helpers -------------------------------------------------------
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function safeJSON(s, f) { try { return JSON.parse(s); } catch (e) { return f; } }
  function lsGet(k, f) {
    try { var v = localStorage.getItem(k); return v ? safeJSON(v, f) : f; } catch (e) { return f; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function toast(msg, kind) {
    var el = $("#adToast");
    if (!el) return;
    el.textContent = msg;
    el.className = "ad-toast is-visible" + (kind ? " ad-toast--" + kind : "");
    setTimeout(function () { el.className = "ad-toast"; }, 2200);
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  function csvEscape(v) {
    if (v == null) return "";
    var s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // ---------- State accessors (talk to FEContent / FETracking) -------------
  function getGlobals() {
    return window.FEContent ? window.FEContent.loadGlobals() : {};
  }
  function saveGlobals(next) {
    if (window.FEContent) window.FEContent.saveGlobals(next);
    else lsSet("fe_global_v1", next);
  }
  function getOverrides() { return window.FEContent ? window.FEContent.loadOverrides() : {}; }
  function saveOverrides(next) {
    if (window.FEContent) window.FEContent.saveOverrides(next);
    else lsSet("fe_content_overrides_v1", next);
  }
  function getSectionVis() { return window.FEContent ? window.FEContent.loadSectionVisibility() : {}; }
  function saveSectionVis(next) {
    if (window.FEContent) window.FEContent.saveSectionVisibility(next);
    else lsSet("fe_section_visibility_v1", next);
  }
  function getSettings() { return window.FETracking ? window.FETracking.settings() : lsGet("fe_settings_v1", {}); }
  function saveSettings(next) {
    if (window.FETracking) window.FETracking.saveSettings(next);
    else lsSet("fe_settings_v1", next);
  }
  function getEvents() { return window.FETracking ? window.FETracking.getEvents() : lsGet("fe_event_log_v1", []); }
  function getLeads() { return window.FETracking ? window.FETracking.getLeads() : lsGet("fe_leads_v1", []); }

  // ---------- Views ---------------------------------------------------------
  function renderApp() {
    if (!isAuthed()) { renderLogin(); return; }
    var globals = (window.FEContent && window.FEContent.loadGlobals()) || {};
    var logoDark = globals.logo_dark || "https://freedomelectriclighting.com/wp-content/uploads/2026/04/Freedom_Electric_Logo_Web_DarkBG_Shrunk.png";
    document.body.innerHTML =
      '<div class="ad-app">' +
        '<aside class="ad-side">' +
          '<div class="ad-side__brand">' +
            '<img class="ad-side__logo" src="' + logoDark + '" alt="Freedom Electric & Lighting" />' +
            '<div class="ad-side__sub" style="margin-top:8px;">Admin Dashboard</div>' +
          '</div>' +
          '<ul class="ad-nav" id="adNav">' +
            navItem("dashboard", "Dashboard") +
            navItem("leads", "Leads") +
            navItem("analytics", "Analytics") +
            navItem("heatmaps", "Heatmaps") +
            navItem("content", "Content") +
            navItem("sections", "Page Sections") +
            navItem("testimonials", "Testimonials") +
            navItem("settings", "Settings") +
          '</ul>' +
          '<div class="ad-side__foot">' +
            '<div>Local-only admin. See <a href="#" id="adLogout">sign out</a>.</div>' +
          '</div>' +
        '</aside>' +
        '<main class="ad-main" id="adMain"></main>' +
      '</div>' +
      '<div class="ad-toast" id="adToast"></div>';

    $$("#adNav button").forEach(function (b) {
      b.addEventListener("click", function () { selectView(b.dataset.view); });
    });
    $("#adLogout").addEventListener("click", function (e) { e.preventDefault(); signOut(); });

    selectView(location.hash.replace("#", "") || "dashboard");
  }

  function navItem(key, label) {
    return '<li><button data-view="' + key + '"><span class="ad-nav__icon">' + iconFor(key) + '</span>' + label + '</button></li>';
  }

  function iconFor(key) {
    var m = {
      dashboard: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>',
      leads: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
      analytics: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17h2v-7H3v7zm4 0h2V7H7v10zm4 0h2v-4h-2v4zm4 0h2V4h-2v13zm4 0h2v-8h-2v8z"/></svg>',
      heatmaps: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>',
      content: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
      sections: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v4H3V5zm0 6h18v8H3v-8z"/></svg>',
      testimonials: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
      settings: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94a7.49 7.49 0 000-1.88l2.03-1.58a.5.5 0 00.12-.61l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.4 7.4 0 00-1.62-.94l-.36-2.54a.5.5 0 00-.5-.41h-3.84a.5.5 0 00-.5.41l-.36 2.54a7.4 7.4 0 00-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.7 8.87a.5.5 0 00.12.61l2.03 1.58a7.49 7.49 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.61l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.26.41.5.41h3.84a.5.5 0 00.5-.41l.36-2.54a7.4 7.4 0 001.62-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.61l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/></svg>'
    };
    return m[key] || "";
  }

  function selectView(view) {
    location.hash = view;
    $$("#adNav button").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.view === view);
    });
    var main = $("#adMain");
    switch (view) {
      case "leads": renderLeads(main); break;
      case "analytics": renderAnalytics(main); break;
      case "heatmaps": renderHeatmaps(main); break;
      case "content": renderContent(main); break;
      case "sections": renderSections(main); break;
      case "testimonials": renderTestimonials(main); break;
      case "settings": renderSettings(main); break;
      case "dashboard":
      default: renderDashboard(main);
    }
  }

  // ---------- Login ---------------------------------------------------------
  function renderLogin() {
    document.body.innerHTML =
      '<div class="ad-login">' +
        '<div class="ad-login__card">' +
          '<h1>Admin Sign-In</h1>' +
          '<p>Local admin dashboard for Freedom Electric &amp; Lighting.</p>' +
          '<div class="ad-field"><label>Admin PIN</label><input id="adPin" type="password" placeholder="Enter PIN" autofocus/></div>' +
          '<button class="ad-btn" id="adSign" style="width:100%; justify-content:center;">Sign In</button>' +
          '<p style="font-size:11px; color: var(--ad-muted); margin-top: 18px;">Default PIN: <strong>freedom2026</strong> — change it under Settings → Admin after signing in.</p>' +
        '</div>' +
      '</div>';

    var input = $("#adPin");
    function attempt() {
      if (input.value === getPin()) { signIn(); renderApp(); }
      else { input.style.borderColor = "#d42d3e"; input.focus(); input.select(); }
    }
    $("#adSign").addEventListener("click", attempt);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") attempt(); });
  }

  // ---------- Dashboard ----------------------------------------------------
  function renderDashboard(main) {
    var events = getEvents();
    var leads = getLeads();
    var pageViews = events.filter(function (e) { return e.event === "page_view"; }).length;
    var calls = events.filter(function (e) { return e.event === "click_to_call"; }).length;
    var texts = events.filter(function (e) { return e.event === "click_to_text"; }).length;
    var formStarts = events.filter(function (e) { return e.event === "form_start"; }).length;
    var formSubmits = events.filter(function (e) { return e.event === "form_submit"; }).length;
    var convRate = pageViews ? ((leads.length / pageViews) * 100).toFixed(1) + "%" : "—";
    var lastLead = leads.length ? new Date(leads[leads.length - 1].submitted_at).toLocaleString() : "—";

    main.innerHTML =
      head("Dashboard", '<button class="ad-btn ad-btn--ghost" id="exportAll">Export All Data</button>') +
      '<div class="ad-stats">' +
        stat("Page Views", pageViews) +
        stat("Leads", leads.length, "good") +
        stat("Calls Tracked", calls, "alt") +
        stat("Text Clicks", texts, "alt") +
        stat("Form Starts", formStarts) +
        stat("Form Submits", formSubmits, "good") +
        stat("Conv. Rate", convRate, "warn") +
        stat("Last Lead", lastLead) +
      '</div>' +
      '<div class="ad-card">' +
        '<h2>Leads by landing page</h2>' +
        '<div class="ad-card__sub">Where your form submissions are coming from.</div>' +
        leadsByPage(leads) +
      '</div>' +
      '<div class="ad-card">' +
        '<h2>Recent activity</h2>' +
        '<div class="ad-card__sub">Last 15 tracked events from your visitors.</div>' +
        recentEvents(events) +
      '</div>';

    $("#exportAll").addEventListener("click", exportAll);
  }

  function head(title, actions) {
    return '<div class="ad-head"><h1>' + escapeHtml(title) + '</h1><div class="ad-head__actions">' + (actions || "") + '</div></div>';
  }
  function stat(label, value, kind) {
    return '<div class="ad-stat ' + (kind ? "ad-stat--" + kind : "") + '">' +
      '<div class="ad-stat__label">' + escapeHtml(label) + '</div>' +
      '<div class="ad-stat__value">' + escapeHtml(String(value)) + '</div></div>';
  }

  function leadsByPage(leads) {
    var groups = {};
    PAGES.forEach(function (p) { groups[p.key] = 0; });
    leads.forEach(function (l) {
      var key = (l.page || "").replace(/^\//, "").replace(/\.html$/, "") || "index";
      if (groups[key] == null) groups[key] = 0;
      groups[key] += 1;
    });
    var max = Math.max.apply(null, Object.keys(groups).map(function (k) { return groups[k]; })) || 1;
    return Object.keys(groups).map(function (key) {
      var p = PAGES.find(function (x) { return x.key === key; });
      var label = p ? p.label : key;
      var count = groups[key];
      var pct = max ? Math.round((count / max) * 100) : 0;
      return '<div class="ad-chart">' +
        '<div class="ad-chart__label">' + escapeHtml(label) + '</div>' +
        '<div class="ad-chart__bar"><div class="ad-chart__fill" style="width:' + pct + '%"></div></div>' +
        '<div class="ad-chart__val">' + count + '</div></div>';
    }).join("");
  }

  function recentEvents(events) {
    var recent = events.slice(-15).reverse();
    if (!recent.length) return emptyState("No events tracked yet. Visit a landing page to start collecting data.");
    return '<div>' + recent.map(function (e) {
      var time = e.ts ? new Date(e.ts).toLocaleTimeString() : "";
      return '<div class="ad-event">' +
        '<span class="ad-event__time">' + escapeHtml(time) + '</span>' +
        '<span class="ad-event__name"><span class="ad-tag ad-tag--blue">' + escapeHtml(e.event) + '</span></span>' +
        '<span>' + escapeHtml(e.page || "") + '</span>' +
        '<span>' + escapeHtml(e.label || e.service || e.utm_campaign || "") + '</span>' +
        '<span>' + escapeHtml(e.device || "") + '</span>' +
        '</div>';
    }).join("") + '</div>';
  }

  // ---------- Leads --------------------------------------------------------
  function renderLeads(main) {
    var leads = getLeads().slice().reverse();
    main.innerHTML =
      head("Leads",
        '<button class="ad-btn ad-btn--ghost" id="exLeads">Export CSV</button>' +
        '<button class="ad-btn ad-btn--danger" id="clearLeads">Clear All</button>') +
      '<div class="ad-card">' +
        '<div class="ad-table-wrap">' +
          '<table class="ad-table">' +
            '<thead><tr><th>When</th><th>Form</th><th>Name</th><th>Phone</th><th>Email</th><th>Service</th><th>Page</th><th>Source</th></tr></thead>' +
            '<tbody>' + (leads.length ? leads.map(leadRow).join("") : '<tr><td colspan="8" class="ad-table__empty">No leads yet.</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    $("#exLeads").addEventListener("click", exportLeadsCsv);
    $("#clearLeads").addEventListener("click", function () {
      if (confirm("Delete all stored leads from this browser? (Webhook-delivered leads are unaffected.)")) {
        if (window.FETracking) window.FETracking.clearLeads();
        toast("Leads cleared", "success");
        renderLeads(main);
      }
    });
  }

  function leadRow(l) {
    var d = l.data || {};
    var utm = l.utm || {};
    var source = utm.utm_source || utm.utm_campaign || (l.first_referrer || "(direct)");
    return '<tr>' +
      '<td>' + escapeHtml(new Date(l.submitted_at).toLocaleString()) + '</td>' +
      '<td><span class="ad-tag ad-tag--blue">' + escapeHtml(l.form_id || "") + '</span></td>' +
      '<td>' + escapeHtml(d.name || "") + '</td>' +
      '<td>' + escapeHtml(d.phone || "") + '</td>' +
      '<td>' + escapeHtml(d.email || "") + '</td>' +
      '<td>' + escapeHtml(d.service || d.reason || "") + '</td>' +
      '<td>' + escapeHtml(l.page || "") + '</td>' +
      '<td>' + escapeHtml(source) + '</td>' +
    '</tr>';
  }

  function exportLeadsCsv() {
    var leads = getLeads();
    if (!leads.length) { toast("No leads to export"); return; }
    var headers = [
      "submitted_at", "form_id", "page", "name", "phone", "email", "company", "service",
      "reason", "details", "zip", "current_panel", "target_size",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "first_referrer", "device", "anon_id"
    ];
    var rows = leads.map(function (l) {
      var d = l.data || {}; var u = l.utm || {};
      return headers.map(function (h) {
        if (h in d) return csvEscape(d[h]);
        if (h in u) return csvEscape(u[h]);
        if (h === "first_referrer") return csvEscape(u.first_referrer);
        if (h === "device") return csvEscape(l.device);
        if (h === "anon_id") return csvEscape(l.anon_id);
        return csvEscape(l[h]);
      }).join(",");
    });
    var csv = headers.join(",") + "\n" + rows.join("\n");
    downloadFile("freedom-electric-leads-" + new Date().toISOString().slice(0, 10) + ".csv", csv, "text/csv");
  }

  // ---------- Analytics ----------------------------------------------------
  function renderAnalytics(main) {
    var events = getEvents();
    var byEvent = group(events, "event");
    var byPage = group(events.filter(function (e) { return e.event === "page_view"; }), "page");
    var bySource = group(events.filter(function (e) { return e.event === "page_view"; }), function (e) {
      return e.utm_source || e.utm_campaign || (e.first_referrer || "(direct)");
    });
    var byDevice = group(events.filter(function (e) { return e.event === "page_view"; }), "device");

    main.innerHTML =
      head("Analytics",
        '<button class="ad-btn ad-btn--ghost" id="exEvents">Export Events CSV</button>' +
        '<button class="ad-btn ad-btn--danger" id="clearEvents">Clear Events</button>') +

      '<div class="ad-grid-2">' +
        '<div class="ad-card"><h2>Event volumes</h2>' + renderBars(byEvent) + '</div>' +
        '<div class="ad-card"><h2>Top pages</h2>' + renderBars(byPage) + '</div>' +
      '</div>' +

      '<div class="ad-grid-2">' +
        '<div class="ad-card"><h2>Traffic sources</h2><div class="ad-card__sub">From UTM parameters and document referrer.</div>' + renderBars(bySource) + '</div>' +
        '<div class="ad-card"><h2>Device mix</h2>' + renderBars(byDevice) + '</div>' +
      '</div>' +

      '<div class="ad-card"><h2>Conversion funnel</h2>' + renderFunnel(events) + '</div>' +
      '<div class="ad-card"><h2>Scroll depth</h2>' + renderScrollMap(events) + '</div>' +
      '<div class="ad-card"><h2>Last 50 events</h2>' + recentEvents(events.slice(-50)) + '</div>';

    $("#exEvents").addEventListener("click", exportEventsCsv);
    $("#clearEvents").addEventListener("click", function () {
      if (confirm("Clear all locally-stored events? (External GA4/GTM data is unaffected.)")) {
        if (window.FETracking) window.FETracking.clearEvents();
        toast("Events cleared", "success");
        renderAnalytics(main);
      }
    });
  }

  function group(arr, keyFn) {
    var fn = typeof keyFn === "function" ? keyFn : function (x) { return x[keyFn]; };
    var out = {};
    arr.forEach(function (item) {
      var k = fn(item) || "(unknown)";
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }

  function renderBars(obj) {
    var keys = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
    if (!keys.length) return emptyState("No data yet.");
    var max = obj[keys[0]];
    return keys.map(function (k) {
      var v = obj[k];
      var pct = max ? Math.round((v / max) * 100) : 0;
      return '<div class="ad-chart">' +
        '<div class="ad-chart__label" title="' + escapeHtml(k) + '">' + escapeHtml(truncate(k, 26)) + '</div>' +
        '<div class="ad-chart__bar"><div class="ad-chart__fill" style="width:' + pct + '%"></div></div>' +
        '<div class="ad-chart__val">' + v + '</div></div>';
    }).join("");
  }

  function renderFunnel(events) {
    var pv = events.filter(function (e) { return e.event === "page_view"; }).length;
    var sc = events.filter(function (e) { return e.event === "scroll_depth" && e.percent >= 50; }).length;
    var fs = events.filter(function (e) { return e.event === "form_start"; }).length;
    var fsub = events.filter(function (e) { return e.event === "form_submit"; }).length;
    var call = events.filter(function (e) { return e.event === "click_to_call"; }).length;
    var txt = events.filter(function (e) { return e.event === "click_to_text"; }).length;

    var data = {
      "Page View": pv,
      "Scrolled 50%+": sc,
      "Form Started": fs,
      "Form Submitted": fsub,
      "Clicked Call": call,
      "Clicked Text": txt
    };
    return renderBars(data);
  }

  function renderScrollMap(events) {
    var milestones = [25, 50, 75, 100];
    var counts = milestones.map(function (m) {
      return events.filter(function (e) { return e.event === "scroll_depth" && e.percent === m; }).length;
    });
    var max = Math.max.apply(null, counts) || 1;
    return '<div class="ad-scrollmap">' +
      milestones.map(function (m, i) {
        var pct = max ? Math.round((counts[i] / max) * 100) : 0;
        return '<div class="ad-scrollmap__row">' +
          '<div>' + m + '%</div>' +
          '<div class="ad-scrollmap__bar"><div class="ad-scrollmap__fill" style="width:' + pct + '%"></div></div>' +
          '<div style="text-align:right; font-variant-numeric: tabular-nums;">' + counts[i] + '</div>' +
        '</div>';
      }).join("") +
    '</div>';
  }

  function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function exportEventsCsv() {
    var events = getEvents();
    if (!events.length) { toast("No events to export"); return; }
    var headers = [
      "ts", "event", "page", "url", "label", "location", "service", "phone",
      "percent", "seconds", "session_id", "anon_id", "device",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "first_referrer"
    ];
    var rows = events.map(function (e) {
      return headers.map(function (h) { return csvEscape(e[h]); }).join(",");
    });
    downloadFile("freedom-electric-events-" + new Date().toISOString().slice(0, 10) + ".csv",
      headers.join(",") + "\n" + rows.join("\n"), "text/csv");
  }

  // ---------- Heatmaps -----------------------------------------------------
  function renderHeatmaps(main) {
    var events = getEvents();
    var clicks = events.filter(function (e) { return e.event === "cta_click" || e.event === "click_to_call" || e.event === "click_to_text" || e.event === "service_click"; });
    var byLocation = group(clicks, "location");

    main.innerHTML =
      head("Heatmaps &amp; Click Maps") +
      '<div class="ad-card">' +
        '<h2>Click hotspots by section</h2>' +
        '<div class="ad-card__sub">Where visitors are clicking on each landing page. For pixel-perfect visual heatmaps, connect Microsoft Clarity or Hotjar in Settings.</div>' +
        '<div class="ad-grid-2">' +
          '<div>' +
            '<h3 style="font-family:Oswald,sans-serif; font-size:14px; text-transform:uppercase; letter-spacing:0.1em; color: var(--ad-muted); margin: 0 0 10px;">Click distribution</h3>' +
            renderBars(byLocation) +
          '</div>' +
          '<div>' + heatmapMock(byLocation) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="ad-card">' +
        '<h2>Connect a heatmap provider</h2>' +
        '<div class="ad-card__sub">Microsoft Clarity is free and ships pixel heatmaps + session recordings. Hotjar adds quantitative session analysis.</div>' +
        '<div class="ad-grid-2">' +
          '<div>' +
            '<p style="font-weight:600;">Microsoft Clarity (free)</p>' +
            '<p style="color: var(--ad-muted); font-size:13px;">Pixel heatmaps, scroll maps, click maps, session recordings. Paste your project ID under Settings → Tracking → Clarity.</p>' +
          '</div>' +
          '<div>' +
            '<p style="font-weight:600;">Hotjar</p>' +
            '<p style="color: var(--ad-muted); font-size:13px;">Surveys, recordings, funnels. Paste your Hotjar site ID under Settings → Tracking → Hotjar.</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function heatmapMock(byLocation) {
    var max = Math.max(1, Math.max.apply(null, Object.values(byLocation)));
    function hot(section, top, left) {
      var v = byLocation[section] || 0;
      if (!v) return "";
      var size = 40 + Math.round((v / max) * 80);
      return '<div class="ad-heat__hot" style="top:' + top + '%; left:' + left + '%; width:' + size + 'px; height:' + size + 'px;"></div>';
    }
    return '<div class="ad-heat"><div class="ad-heat__page">' +
      '<div class="ad-heat__block">' + hot("header", 50, 80) + '</div>' +
      '<div class="ad-heat__block">' + hot("hero", 50, 25) + hot("hero", 70, 30) + '</div>' +
      '<div class="ad-heat__block">' + hot("services", 50, 50) + '</div>' +
      '<div class="ad-heat__block">' + hot("process", 50, 50) + '</div>' +
      '<div class="ad-heat__block">' + hot("why_us", 50, 50) + '</div>' +
      '<div class="ad-heat__block">' + hot("faq", 50, 50) + '</div>' +
      '<div class="ad-heat__block">' + hot("final_cta", 50, 50) + hot("mobile_bar", 90, 50) + '</div>' +
    '</div></div>';
  }

  // ---------- Content editor -----------------------------------------------
  var CONTENT_KEYS_PER_PAGE = [
    { key: "meta_title", label: "Page title (<title> + browser tab)", textarea: false },
    { key: "meta_description", label: "Meta description (Google snippet)", textarea: true },
    { key: "hero_eyebrow", label: "Hero eyebrow (badge above headline)", textarea: false },
    { key: "hero_h1", label: "Hero headline (H1) — HTML allowed", textarea: true },
    { key: "hero_sub", label: "Hero subheadline", textarea: true },
    { key: "hero_card_h", label: "Hero form card heading", textarea: false },
    { key: "hero_card_sub", label: "Hero form card subhead", textarea: false }
  ];

  function renderContent(main) {
    var current = $("#contentPage") ? $("#contentPage").value : PAGES[0].key;
    main.innerHTML =
      head("Content Editor",
        '<button class="ad-btn ad-btn--ghost" id="dlContent">Download JSON</button>' +
        '<button class="ad-btn ad-btn--danger" id="resetContent">Reset Page</button>') +
      '<div class="ad-card">' +
        '<div class="ad-field"><label>Page</label><select id="contentPage">' +
          PAGES.map(function (p) { return '<option value="' + p.key + '"' + (p.key === current ? " selected" : "") + '>' + p.label + '</option>'; }).join("") +
        '</select></div>' +
        '<div id="contentForm"></div>' +
        '<div class="ad-divider"></div>' +
        '<button class="ad-btn ad-btn--success" id="saveContent">Save Changes</button>' +
        '<a class="ad-btn ad-btn--ghost" id="previewLink" target="_blank" rel="noopener" style="margin-left:8px;">Open landing page →</a>' +
      '</div>';

    function renderForm() {
      var key = $("#contentPage").value;
      var overrides = getOverrides();
      var pageOverrides = overrides[key] || {};
      $("#contentForm").innerHTML = CONTENT_KEYS_PER_PAGE.map(function (f) {
        var val = pageOverrides[f.key] != null ? pageOverrides[f.key] : "";
        var input = f.textarea
          ? '<textarea data-key="' + f.key + '" rows="3">' + escapeHtml(val) + '</textarea>'
          : '<input data-key="' + f.key + '" value="' + escapeHtml(val) + '" />';
        return '<div class="ad-field"><label>' + escapeHtml(f.label) + '</label>' + input +
          (pageOverrides[f.key] != null ? '<p class="ad-field__help" style="color: var(--ad-warning);">Override active (page no longer shows the default).</p>' : '<p class="ad-field__help">Empty = use the built-in default on the page.</p>') +
          '</div>';
      }).join("");
      $("#previewLink").href = key + ".html";
    }
    renderForm();
    $("#contentPage").addEventListener("change", renderForm);
    $("#saveContent").addEventListener("click", function () {
      var key = $("#contentPage").value;
      var overrides = getOverrides();
      overrides[key] = overrides[key] || {};
      $$('#contentForm [data-key]').forEach(function (el) {
        var k = el.getAttribute("data-key");
        var v = el.value;
        if (v === "") delete overrides[key][k];
        else overrides[key][k] = v;
      });
      saveOverrides(overrides);
      toast("Content saved", "success");
    });
    $("#resetContent").addEventListener("click", function () {
      if (!confirm("Clear all overrides for this page? The page will fall back to its built-in copy.")) return;
      var key = $("#contentPage").value;
      var overrides = getOverrides();
      delete overrides[key];
      saveOverrides(overrides);
      renderForm();
      toast("Page reset to defaults");
    });
    $("#dlContent").addEventListener("click", function () {
      downloadFile("freedom-electric-content.json", JSON.stringify({
        globals: getGlobals(),
        overrides: getOverrides(),
        section_visibility: getSectionVis(),
        testimonials: lsGet("fe_testimonials_v1", [])
      }, null, 2), "application/json");
    });
  }

  // ---------- Section toggles ----------------------------------------------
  function renderSections(main) {
    var current = $("#secPage") ? $("#secPage").value : PAGES[0].key;
    main.innerHTML =
      head("Page Sections") +
      '<div class="ad-card">' +
        '<div class="ad-card__sub">Toggle entire sections on or off without touching code. Useful for A/B tests or temporary changes.</div>' +
        '<div class="ad-field"><label>Page</label><select id="secPage">' +
          PAGES.map(function (p) { return '<option value="' + p.key + '"' + (p.key === current ? " selected" : "") + '>' + p.label + '</option>'; }).join("") +
        '</select></div>' +
        '<div id="secList"></div>' +
        '<a class="ad-btn ad-btn--ghost" id="secPreview" target="_blank" rel="noopener" style="margin-top: 10px;">Open landing page →</a>' +
      '</div>';

    function renderList() {
      var key = $("#secPage").value;
      var vis = getSectionVis();
      var pageVis = vis[key] || {};
      $("#secList").innerHTML =
        '<table class="ad-table"><thead><tr><th>Section</th><th style="width:120px;">Visible</th></tr></thead><tbody>' +
          SECTIONS.map(function (s) {
            var on = pageVis[s] !== false;
            return '<tr><td><strong>' + escapeHtml(s) + '</strong></td><td><label class="ad-toggle"><input type="checkbox" data-sec="' + s + '"' + (on ? " checked" : "") + '/></label></td></tr>';
          }).join("") +
        '</tbody></table>';
      $("#secPreview").href = key + ".html";

      $$('#secList input[data-sec]').forEach(function (cb) {
        cb.addEventListener("change", function () {
          var pageKey = $("#secPage").value;
          var vis = getSectionVis();
          vis[pageKey] = vis[pageKey] || {};
          vis[pageKey][cb.getAttribute("data-sec")] = cb.checked;
          saveSectionVis(vis);
          toast(cb.checked ? "Section shown" : "Section hidden");
        });
      });
    }
    renderList();
    $("#secPage").addEventListener("change", renderList);
  }

  // ---------- Testimonials -------------------------------------------------
  function renderTestimonials(main) {
    var items = lsGet("fe_testimonials_v1", [
      { name: "Daniel R.", location: "Briargate · Colorado Springs", quote: "Joe came out same day, gave me a flat price for the panel and EV charger, and the whole thing was done clean the next week. First electrician I've actually trusted in this town." }
    ]);
    main.innerHTML =
      head("Testimonials &amp; Reviews", '<button class="ad-btn" id="addT">Add Testimonial</button>') +
      '<div class="ad-card">' +
        '<div class="ad-card__sub">Add or edit customer reviews. Drop them in any landing page using the <code>data-content="testimonial_quote"</code> attributes once you wire them.</div>' +
        '<div id="tList"></div>' +
      '</div>';
    renderList();

    function renderList() {
      $("#tList").innerHTML = items.length ? items.map(function (t, i) {
        return '<div class="ad-card" style="border-left:4px solid var(--ad-accent); margin-bottom:12px;">' +
          '<div class="ad-grid-2"><div class="ad-field"><label>Name</label><input data-i="' + i + '" data-k="name" value="' + escapeHtml(t.name) + '"/></div>' +
          '<div class="ad-field"><label>Location</label><input data-i="' + i + '" data-k="location" value="' + escapeHtml(t.location) + '"/></div></div>' +
          '<div class="ad-field"><label>Quote</label><textarea data-i="' + i + '" data-k="quote" rows="3">' + escapeHtml(t.quote) + '</textarea></div>' +
          '<button class="ad-btn ad-btn--danger" data-del="' + i + '">Delete</button></div>';
      }).join("") : emptyState("No testimonials yet. Click 'Add Testimonial' to create one.");

      $$('#tList input, #tList textarea').forEach(function (el) {
        el.addEventListener("input", function () {
          items[+el.dataset.i][el.dataset.k] = el.value;
          lsSet("fe_testimonials_v1", items);
        });
      });
      $$('#tList [data-del]').forEach(function (b) {
        b.addEventListener("click", function () {
          items.splice(+b.dataset.del, 1);
          lsSet("fe_testimonials_v1", items);
          renderList();
          toast("Testimonial removed");
        });
      });
    }
    $("#addT").addEventListener("click", function () {
      items.push({ name: "", location: "", quote: "" });
      lsSet("fe_testimonials_v1", items);
      renderList();
    });
  }

  // ---------- Settings -----------------------------------------------------
  function renderSettings(main) {
    var g = getGlobals();
    var s = getSettings();
    main.innerHTML =
      head("Settings") +
      '<div class="ad-tabs">' +
        '<button class="ad-tab is-active" data-tab="business">Business</button>' +
        '<button class="ad-tab" data-tab="tracking">Tracking</button>' +
        '<button class="ad-tab" data-tab="webhooks">Webhooks</button>' +
        '<button class="ad-tab" data-tab="admin">Admin</button>' +
        '<button class="ad-tab" data-tab="danger">Danger Zone</button>' +
      '</div>' +
      '<div id="tabBody"></div>';

    var tabs = {
      business: businessTab(g),
      tracking: trackingTab(s),
      webhooks: webhooksTab(s),
      admin: adminTab(),
      danger: dangerTab()
    };
    function show(name) {
      $$('.ad-tab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === name); });
      $("#tabBody").innerHTML = tabs[name];
      attachTabHandlers(name);
    }
    show("business");
    $$('.ad-tab').forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.tab); }); });
  }

  function businessTab(g) {
    return '<div class="ad-card"><h2>Business info</h2>' +
      '<div class="ad-card__sub">These values are injected wherever you see <code>{{token}}</code> on the landing pages.</div>' +
      '<div class="ad-grid-2">' +
        field("Brand name", "brand", g.brand) +
        field("Tagline", "tagline", g.tagline) +
        field("Phone (display)", "phone", g.phone) +
        field("Phone (raw, E.164)", "phone_raw", g.phone_raw, "Used in tel: links. Example: +17194377802") +
        field("SMS number (raw)", "sms_raw", g.sms_raw) +
        field("Email", "email", g.email) +
        field("Master License", "license", g.license) +
        field("City", "address_city", g.address_city) +
      '</div>' +
      '<div class="ad-field"><label>Service areas (display)</label><textarea data-g="service_areas" rows="2">' + escapeHtml(g.service_areas) + '</textarea></div>' +
      '<div class="ad-grid-3">' +
        field("Jobs completed", "jobs_completed", g.jobs_completed) +
        field("Rating", "rating", g.rating) +
        field("Website", "website", g.website) +
      '</div>' +
      '</div>' +

      '<div class="ad-card"><h2>Logos</h2>' +
      '<div class="ad-card__sub">Swap logos without editing code. Paste a URL — landing pages, footer, and admin sidebar will all update on next page load.</div>' +
      '<div class="ad-grid-2">' +
        '<div>' +
          field("Light-background logo URL", "logo_light", g.logo_light, "Used in page headers and on white sections") +
          (g.logo_light ? '<div style="background:#fff; border:1px solid var(--ad-border); border-radius:8px; padding:14px; display:grid; place-items:center; min-height:80px;"><img src="' + escapeHtml(g.logo_light) + '" alt="Light logo preview" style="max-height:60px; max-width:100%;"/></div>' : '') +
        '</div>' +
        '<div>' +
          field("Dark-background logo URL", "logo_dark", g.logo_dark, "Used in footers, hero sections, admin sidebar") +
          (g.logo_dark ? '<div style="background:#000; border:1px solid var(--ad-border); border-radius:8px; padding:14px; display:grid; place-items:center; min-height:80px;"><img src="' + escapeHtml(g.logo_dark) + '" alt="Dark logo preview" style="max-height:60px; max-width:100%;"/></div>' : '') +
        '</div>' +
      '</div>' +
      '<button class="ad-btn ad-btn--success" id="saveBiz" style="margin-top: 16px;">Save Business Info &amp; Logos</button>' +
      '</div>';
  }

  function field(label, key, val, help) {
    return '<div class="ad-field"><label>' + escapeHtml(label) + '</label>' +
      '<input data-g="' + key + '" value="' + escapeHtml(val == null ? "" : val) + '" />' +
      (help ? '<p class="ad-field__help">' + escapeHtml(help) + '</p>' : "") + '</div>';
  }

  function trackingTab(s) {
    return '<div class="ad-card"><h2>Tracking pixels</h2>' +
      '<div class="ad-card__sub">Add any of these IDs and the landing pages will inject the tracker automatically on next page load.</div>' +
      '<div class="ad-grid-2">' +
        field("Google Analytics 4 — Measurement ID", "ga4_id", s.ga4_id, "Example: G-XXXXXXXXXX") +
        field("Google Tag Manager — Container ID", "gtm_id", s.gtm_id, "Example: GTM-XXXXXX") +
        field("Meta (Facebook) Pixel ID", "meta_pixel_id", s.meta_pixel_id) +
        field("Microsoft Clarity — Project ID", "clarity_id", s.clarity_id, "Free heatmaps + recordings") +
        field("Hotjar — Site ID", "hotjar_id", s.hotjar_id) +
        field("Google Ads Conversion ID", "google_ads_id", s.google_ads_id, "Optional, for click ID tracking") +
      '</div>' +
      '<button class="ad-btn ad-btn--success" id="saveTrk">Save Tracking IDs</button>' +
      '</div>';
  }

  function webhooksTab(s) {
    return '<div class="ad-card"><h2>Lead delivery</h2>' +
      '<div class="ad-card__sub">Forward every form submission to a webhook. Works with Formspree, Zapier, Make, n8n, Slack, or your own endpoint. Leads are also saved locally for the Leads tab.</div>' +
      field("Lead webhook URL", "lead_webhook", s.lead_webhook, "POST receives JSON: { id, form_id, page, data, utm, ... }") +
      '<button class="ad-btn ad-btn--success" id="saveWh">Save Webhook</button>' +
      '</div>' +

      '<div class="ad-card"><h2>Event forwarding</h2>' +
      '<div class="ad-card__sub">Optionally forward tracking events (page views, clicks, form starts, scroll depth, etc.) to an analytics endpoint of your own. Use sparingly — high volume.</div>' +
      field("Events webhook URL", "events_webhook", s.events_webhook, "Defaults to form_submit only") +
      '<div class="ad-field"><label class="ad-toggle"><input type="checkbox" id="ewAll"' + (s.events_webhook_all ? " checked" : "") + '/> Forward <strong>all</strong> events (not just form submits)</label></div>' +
      '<button class="ad-btn ad-btn--success" id="saveWh2">Save Forwarding</button>' +
      '</div>' +

      '<div class="ad-card"><h2>Integration examples</h2>' +
        '<ul style="margin:0; padding-left:18px; color: var(--ad-muted); font-size:13px; line-height: 1.7;">' +
          '<li><strong>Formspree:</strong> create a form, paste the endpoint URL above. You receive every lead in your inbox + the Formspree dashboard.</li>' +
          '<li><strong>Zapier / Make / n8n:</strong> create a "Catch hook" trigger, paste the URL. Pipe leads into Google Sheets, CRMs, Slack, etc.</li>' +
          '<li><strong>Slack:</strong> use an incoming webhook on your <code>#leads</code> channel. Real-time alerts.</li>' +
          '<li><strong>HubSpot / Pipedrive / Jobber:</strong> wire the webhook to a Zap and map fields to a contact/deal.</li>' +
        '</ul>' +
      '</div>';
  }

  function adminTab() {
    return '<div class="ad-card"><h2>Admin access</h2>' +
      '<div class="ad-card__sub">Change the PIN that protects this dashboard. <strong>This is a client-side gate</strong> — for stronger protection, put the page behind Cloudflare Access, Netlify Identity, or basic auth.</div>' +
      '<div class="ad-field"><label>New PIN</label><input id="newPin" type="password" placeholder="At least 6 characters"/></div>' +
      '<button class="ad-btn ad-btn--success" id="savePin">Update PIN</button>' +
      '</div>';
  }

  function dangerTab() {
    return '<div class="ad-card"><h2>Danger zone</h2>' +
      '<div class="ad-card__sub">Irreversible actions. Be careful.</div>' +
      '<div style="display: flex; flex-direction: column; gap: 10px; max-width: 320px;">' +
        '<button class="ad-btn ad-btn--danger" id="dzContent">Reset all content overrides</button>' +
        '<button class="ad-btn ad-btn--danger" id="dzSections">Reset all section toggles</button>' +
        '<button class="ad-btn ad-btn--danger" id="dzLeads">Delete all stored leads</button>' +
        '<button class="ad-btn ad-btn--danger" id="dzEvents">Delete all stored events</button>' +
        '<button class="ad-btn ad-btn--danger" id="dzAll">Reset EVERYTHING to defaults</button>' +
      '</div></div>';
  }

  function attachTabHandlers(name) {
    if (name === "business") {
      $("#saveBiz").addEventListener("click", function () {
        var g = getGlobals();
        $$('[data-g]').forEach(function (el) { g[el.dataset.g] = el.value; });
        saveGlobals(g);
        toast("Business info saved", "success");
      });
    }
    if (name === "tracking") {
      $("#saveTrk").addEventListener("click", function () {
        var s = getSettings();
        $$('[data-g]').forEach(function (el) { s[el.dataset.g] = el.value.trim(); });
        saveSettings(s);
        toast("Tracking IDs saved (active on next page load)", "success");
      });
    }
    if (name === "webhooks") {
      function save() {
        var s = getSettings();
        $$('[data-g]').forEach(function (el) { s[el.dataset.g] = el.value.trim(); });
        s.events_webhook_all = $("#ewAll").checked;
        saveSettings(s);
        toast("Webhooks saved", "success");
      }
      $("#saveWh").addEventListener("click", save);
      $("#saveWh2").addEventListener("click", save);
    }
    if (name === "admin") {
      $("#savePin").addEventListener("click", function () {
        var p = $("#newPin").value;
        if (p.length < 6) { toast("PIN must be at least 6 characters"); return; }
        setPin(p);
        $("#newPin").value = "";
        toast("PIN updated", "success");
      });
    }
    if (name === "danger") {
      $("#dzContent").addEventListener("click", function () {
        if (!confirm("Delete all content overrides?")) return;
        saveOverrides({}); toast("Content overrides cleared", "success");
      });
      $("#dzSections").addEventListener("click", function () {
        if (!confirm("Reset all section toggles?")) return;
        saveSectionVis({}); toast("Section toggles reset", "success");
      });
      $("#dzLeads").addEventListener("click", function () {
        if (!confirm("Permanently delete all locally-stored leads?")) return;
        if (window.FETracking) window.FETracking.clearLeads();
        toast("Leads deleted", "success");
      });
      $("#dzEvents").addEventListener("click", function () {
        if (!confirm("Permanently delete all locally-stored events?")) return;
        if (window.FETracking) window.FETracking.clearEvents();
        toast("Events deleted", "success");
      });
      $("#dzAll").addEventListener("click", function () {
        if (!confirm("Reset EVERYTHING (content, sections, settings, leads, events) to defaults? Cannot be undone.")) return;
        if (window.FEContent) window.FEContent.resetAll();
        if (window.FETracking) { window.FETracking.clearLeads(); window.FETracking.clearEvents(); }
        try { localStorage.removeItem("fe_settings_v1"); localStorage.removeItem("fe_testimonials_v1"); } catch (e) {}
        toast("Reset complete", "success");
        setTimeout(function () { location.reload(); }, 500);
      });
    }
  }

  function exportAll() {
    downloadFile("freedom-electric-export-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify({
      exported_at: new Date().toISOString(),
      globals: getGlobals(),
      content_overrides: getOverrides(),
      section_visibility: getSectionVis(),
      settings: getSettings(),
      testimonials: lsGet("fe_testimonials_v1", []),
      leads: getLeads(),
      events: getEvents()
    }, null, 2), "application/json");
  }

  function emptyState(msg) {
    return '<div class="ad-empty">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1z"/></svg>' +
      '<div>' + escapeHtml(msg) + '</div></div>';
  }

  // ---------- Boot ----------------------------------------------------------
  document.addEventListener("DOMContentLoaded", renderApp);
})();
