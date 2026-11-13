import { useSyncExternalStore } from "react";

/** Matches the CSS breakpoint where the layout switches to the phone arrangement. */
const QUERY = "(max-width: 820px)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True on phones and narrow tablets. */
export function useIsCompact(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
}
