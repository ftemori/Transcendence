export function useEventListener() {
  const addEventListener = (selector, event, handler, delay = 100) => {
    setTimeout(() => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        element.addEventListener(event, handler);
      });
    }, delay);
  };

  const addSingleEventListener = (selector, event, handler, delay = 100) => {
    setTimeout(() => {
      const element = document.querySelector(selector);
      if (element) {
        element.addEventListener(event, handler);
      }
    }, delay);
  };

  const removeEventListener = (selector, event, handler) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element) => {
      element.removeEventListener(event, handler);
    });
  };

  return {
    addEventListener,
    addSingleEventListener,
    removeEventListener,
  };
}
