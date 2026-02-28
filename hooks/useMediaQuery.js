import { useState, useEffect } from "react";

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia(query);
    const update = () => setMatches(!!m.matches);
    update();
    m.addEventListener ? m.addEventListener("change", update) : m.addListener(update);
    return () => m.removeEventListener ? m.removeEventListener("change", update) : m.removeListener(update);
  }, [query]);
  return matches;
}
