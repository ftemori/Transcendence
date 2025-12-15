// Simple DOM-based toast notifications
export function useToast() {
  const ensureContainer = () => {
    let container = document.getElementById("global-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "global-toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    return container;
  };

  const showToast = (message, type = "info", duration = 3500) => {
    const container = ensureContainer();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // animate in
    requestAnimationFrame(() => {
      toast.classList.add("visible");
    });

    const hide = () => {
      toast.classList.remove("visible");
      toast.classList.add("hiding");
      toast.addEventListener(
        "transitionend",
        () => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        },
        { once: true }
      );
    };

    const timeoutId = setTimeout(hide, duration);
    // allow click to dismiss earlier
    toast.addEventListener("click", () => {
      clearTimeout(timeoutId);
      hide();
    });

    return { hide };
  };

  return { showToast };
}
