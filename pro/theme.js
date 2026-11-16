/* Presentation preference only. Loaded before styles for the first paint.
   It never reads, rewrites or migrates the job-data namespace. */
(function () {
  'use strict';
  const KEY = 'dvi_dev_df1a251_20261102_theme';
  let current = 'dark';
  try { if (localStorage.getItem(KEY) === 'light') current = 'light'; } catch (_) { /* Session theme still works. */ }
  function renderTheme() {
    document.documentElement.setAttribute('data-theme', current);
    document.documentElement.style.colorScheme = current;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', current === 'light' ? '#bcbcbc' : '#252525');
    const button = document.getElementById('themeToggle');
    if (button) {
      button.setAttribute('aria-pressed', String(current === 'light'));
      button.title = current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    }
    const label = document.getElementById('themeLabel');
    if (label) label.textContent = current === 'dark' ? 'Dark' : 'Light';
  }
  window.setWorkspaceTheme = function (theme) {
    if (theme !== 'light' && theme !== 'dark') return false;
    current = theme;
    renderTheme();
    try { localStorage.setItem(KEY, theme); } catch (_) {
      // A failed preference write must not prevent switching or disturb job data.
      const button = document.getElementById('themeToggle');
      if (button) button.title += ' · Preference cannot be saved in this browser';
    }
    return true;
  };
  window.toggleTheme = function () { return window.setWorkspaceTheme(current === 'dark' ? 'light' : 'dark'); };
  renderTheme();
  document.addEventListener('DOMContentLoaded', renderTheme, {once:true});
}());
