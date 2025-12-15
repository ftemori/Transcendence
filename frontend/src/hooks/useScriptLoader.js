export function useScriptLoader() {
  const loadScript = (src, callback) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      if (callback) callback();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.type = "module";
    script.onload = () => {
      if (callback) callback();
    };
    script.onerror = () => {
      console.error(`Failed to load script: ${src}`);
    };
    document.head.appendChild(script);
  };

  return { loadScript };
}
