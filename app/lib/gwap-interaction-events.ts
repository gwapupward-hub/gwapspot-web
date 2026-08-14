type GwapPointerDownListener = (
  event: PointerEvent,
  element: HTMLElement,
) => void;

type GwapClickListener = (event: MouseEvent, element: HTMLElement) => void;

const pointerDownListeners = new Set<GwapPointerDownListener>();
const clickListeners = new Set<GwapClickListener>();

export function getGwapInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-gwap-interactive]");
}

export function isGwapInteractiveDisabled(element: HTMLElement) {
  return (
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function getEnabledInteractiveTarget(event: Event) {
  const element = getGwapInteractiveTarget(event.target);
  return element && !isGwapInteractiveDisabled(element) ? element : null;
}

function dispatchPointerDown(event: PointerEvent) {
  const element = getEnabledInteractiveTarget(event);
  if (!element) return;

  pointerDownListeners.forEach((listener) => listener(event, element));
}

function dispatchClick(event: MouseEvent) {
  const element = getEnabledInteractiveTarget(event);
  if (!element) return;

  clickListeners.forEach((listener) => listener(event, element));
}

export function subscribeGwapPointerDown(listener: GwapPointerDownListener) {
  if (typeof document === "undefined") return () => {};

  const shouldAttach = pointerDownListeners.size === 0;
  pointerDownListeners.add(listener);
  if (shouldAttach) {
    document.addEventListener("pointerdown", dispatchPointerDown, { capture: true });
  }

  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    pointerDownListeners.delete(listener);

    if (pointerDownListeners.size === 0) {
      document.removeEventListener("pointerdown", dispatchPointerDown, {
        capture: true,
      });
    }
  };
}

export function subscribeGwapClick(listener: GwapClickListener) {
  if (typeof document === "undefined") return () => {};

  const shouldAttach = clickListeners.size === 0;
  clickListeners.add(listener);
  if (shouldAttach) {
    document.addEventListener("click", dispatchClick, { capture: true });
  }

  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    clickListeners.delete(listener);

    if (clickListeners.size === 0) {
      document.removeEventListener("click", dispatchClick, { capture: true });
    }
  };
}
