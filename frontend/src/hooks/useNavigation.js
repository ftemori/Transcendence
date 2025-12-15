import { useEventListener } from "./useEventListener.js";
import { useRouter } from "./useRouter.js";

export function useNavigation() {
  const { addEventListener } = useEventListener();
  const { navigate } = useRouter();

  const setupHeroNavigation = () => {
    addEventListener(".hero-buttons a", "click", (e) => {
      e.preventDefault();
      const href = e.target.getAttribute("href");
      if (href) {
        navigate(href);
      }
    });
  };

  const setupGeneralNavigation = (selector = "a[href]") => {
    addEventListener(selector, "click", (e) => {
      const href = e.target.getAttribute("href");
      if (href && href.startsWith("/")) {
        e.preventDefault();
        navigate(href);
      }
    });
  };

  const navigateTo = (path) => {
    navigate(path);
  };

  return {
    setupHeroNavigation,
    setupGeneralNavigation,
    navigateTo,
  };
}
