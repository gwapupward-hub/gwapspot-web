type PointerSample = {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  button: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
};

// Touch activation must not depend on Safari's hover-to-click synthesis.
// Keep the gesture state outside React so pointerup + click opens only once.
export function createGwapMojisLauncher() {
  let candidate: PointerSample | null = null;
  let suppressPointerClick = false;
  let open = false;

  const activate = () => {
    if (open) return false;
    open = true;
    return true;
  };

  const distance = (event: PointerSample, start: PointerSample) =>
    Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);

  return {
    pointerDown(event: PointerSample) {
      candidate = null;
      suppressPointerClick = event.pointerType !== "mouse";
      if (event.pointerType === "mouse" || !event.isPrimary || event.button !== 0) return;
      candidate = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
      };
    },
    pointerMove(event: PointerSample) {
      if (candidate?.pointerId === event.pointerId && distance(event, candidate) > 10) {
        candidate = null;
      }
    },
    pointerCancel() {
      candidate = null;
    },
    pointerUp(event: PointerSample) {
      const start = candidate;
      if (!start || start.pointerId !== event.pointerId) return false;
      candidate = null;
      if (distance(event, start) > 10 || event.timeStamp - start.timeStamp > 700) return false;
      return activate();
    },
    click(detail: number) {
      // Keyboard and assistive activation have detail=0 and always remain usable.
      if (detail > 0 && suppressPointerClick) {
        suppressPointerClick = false;
        return false;
      }
      suppressPointerClick = false;
      return activate();
    },
    close() {
      open = false;
      candidate = null;
    },
  };
}
