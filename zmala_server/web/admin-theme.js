// @llr LLR-SRV-UI-012
// Set the appearance before loading the stylesheet so the saved theme is painted first.
(() => {
  const root = document.documentElement;
  const key = 'zmala-admin-theme';
  try {
    if (localStorage.getItem(key) === 'light') root.dataset.theme = 'light';
  } catch {
    // Storage can be unavailable in a restricted browser session.
  }
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const label = () => {
      const action =
        root.dataset.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
      button.setAttribute('aria-label', action);
      button.title = action;
    };
    label();
    button.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      label();
      try {
        localStorage.setItem(key, root.dataset.theme);
      } catch {
        // The page theme still works without persistence.
      }
    });
  });
})();
