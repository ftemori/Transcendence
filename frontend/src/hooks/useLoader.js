// Simple DOM-based loader overlay control
export function useLoader() {
  const ensureLoader = () => {
    let el = document.getElementById("global-loader");
    if (!el) {
      el = document.createElement("div");
      el.id = "global-loader";
      el.className = "loader-overlay";
      const spinner = document.createElement("div");
      spinner.className = "loader-spinner";
      el.appendChild(spinner);
      document.body.appendChild(el);
    }
    return el;
  };

  const showLoader = () => {
    const el = ensureLoader();
    el.style.display = "flex";
  };

  const hideLoader = () => {
    const el = document.getElementById("global-loader");
    if (el) el.style.display = "none";
  };

  const withLoader = async (fn) => {
    showLoader();
    try {
      return await fn();
    } finally {
      hideLoader();
    }
  };

  return { showLoader, hideLoader, withLoader };
}
