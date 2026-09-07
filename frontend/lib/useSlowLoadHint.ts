import { useEffect, useState } from "react";

/**
 * Returns true once `active` has been true for longer than `delayMs`. Used to show a "waking up
 * the server" hint once a request has been in flight long enough that it's likely a Render
 * free-tier cold start (~40s) rather than normal processing (everything's sub-1s once warm).
 */
export function useSlowLoadHint(active: boolean, delayMs = 4000): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return show;
}
