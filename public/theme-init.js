// Set the theme before first paint so dark-mode users never see a white flash (same rules as src/theme/theme.tsx).
(function () {
  try {
    var hc = localStorage.getItem("archres-high-contrast") === "true";
    var t = localStorage.getItem("archres-theme");
    var dark = hc || t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.highContrast = hc ? "true" : "false";
  } catch (e) {}
})();
