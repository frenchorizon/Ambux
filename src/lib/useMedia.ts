import { useEffect, useState } from "react";

export function useNarrow(): boolean {
  const query = "(max-width: 1024px)";
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setNarrow(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
