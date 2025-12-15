import { useLoader } from "../hooks/useLoader.js";

export async function fetchWithLoader(input, init) {
  const { showLoader, hideLoader } = useLoader();
  showLoader();
  try {
    const res = await fetch(input, init);
    return res;
  } finally {
    hideLoader();
  }
}
