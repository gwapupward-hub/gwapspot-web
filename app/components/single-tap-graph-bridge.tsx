"use client";

import { useEffect } from "react";

/**
 * Mobile Safari can treat the first tap on an interactive, hover-capable graph
 * node as hover/focus acquisition. Activate the node on pointer-down for touch
 * and pen input so one physical tap always changes the graph selection.
 *
 * The native click that follows is harmless because graph selection is
 * idempotent; mouse input keeps the normal click/hover behavior.
 */
export function SingleTapGraphBridge() {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.button > 0) return;
      if (!(event.target instanceof Element)) return;

      const node = event.target.closest<HTMLButtonElement>(".gwap-graph-node");
      if (!node || node.disabled) return;

      node.click();
    };

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return null;
}
