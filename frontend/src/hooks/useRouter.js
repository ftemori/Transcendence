export function useRouter(routerInstance = null) {
  const navigate = (path) => {
    history.pushState(null, "", path);
    if (routerInstance) {
      routerInstance.currentPath = path;
      routerInstance.render();
    } else {
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  const getCurrentPath = () => {
    return window.location.pathname;
  };

  const attachNavigationListeners = () => {
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const href = e.target.getAttribute("href");
        if (href) {
          if (routerInstance) {
            routerInstance.navigate(href);
          } else {
            navigate(href);
          }
        }
      });
    });
  };

  return { navigate, getCurrentPath, attachNavigationListeners };
}
