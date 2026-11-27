import { type PointerEvent, type RefObject, useRef } from 'react';

export function useMobileSheetDrag(
  panelRef: RefObject<HTMLElement | null>,
  isOpenMobile: boolean,
  onCloseMobile: () => void
) {
  const sheetDragRef = useRef<{
    pointerId: number;
    startY: number;
    startTime: number;
    lastDy: number;
  } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!isOpenMobile || sheetDragRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTime: performance.now(),
      lastDy: 0,
    };
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = sheetDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !panelRef.current) return;
    const rawDy = e.clientY - drag.startY;
    drag.lastDy = rawDy;
    // Apply smooth friction when dragging upward past top boundary; 1:1 downward
    const visualDy =
      rawDy < 0 ? -Math.pow(Math.abs(rawDy), 0.72) * 0.45 : rawDy;
    panelRef.current.style.transform = `translateY(${visualDy}px)`;
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const drag = sheetDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    sheetDragRef.current = null;
    const elapsed = Math.max(1, performance.now() - drag.startTime);
    const velocity = drag.lastDy / elapsed;

    if (panelRef.current) {
      panelRef.current.style.transition = '';
      panelRef.current.style.transform = '';
    }

    if (drag.lastDy >= 90 || velocity > 0.11) {
      onCloseMobile();
    }
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
  };
}
