/* ==========================================================================
   Freedom Electric — Landing page interactions
   FAQ details elements work natively. This file:
   - Adds a small phone-number formatter to the lead form.
   - Reveals the success message inline if no redirect attribute is set.
   ========================================================================== */

(function () {
  "use strict";

  function formatPhone(value) {
    var digits = (value || "").replace(/\D/g, "").slice(0, 10);
    if (digits.length === 0) return "";
    if (digits.length < 4) return "(" + digits;
    if (digits.length < 7) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function init() {
    document.querySelectorAll('input[type="tel"]').forEach(function (input) {
      input.addEventListener("input", function () {
        var pos = input.selectionStart;
        var before = input.value.length;
        input.value = formatPhone(input.value);
        var after = input.value.length;
        try { input.setSelectionRange(pos + (after - before), pos + (after - before)); } catch (e) {}
      });
    });

    // Mark current year in footer if present
    var yr = document.querySelector("[data-year]");
    if (yr) yr.textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
