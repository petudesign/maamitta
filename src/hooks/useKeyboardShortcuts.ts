import { useEffect } from 'react';
import type { DrawTool } from '../engine/types';

interface KeyboardShortcutsOptions {
  showCrosshair: boolean;
  onSelectTool: (tool: DrawTool) => void;
  onUndo: () => void;
  onToggleCrosshair: () => void;
  onPlaceCrosshairPoint: () => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts({
  showCrosshair,
  onSelectTool,
  onUndo,
  onToggleCrosshair,
  onPlaceCrosshairPoint,
  onEscape,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === 'h') {
        onSelectTool('pan');
      } else if (key === 'p') {
        onSelectTool('pick');
      } else if (key === 'a') {
        onSelectTool('area');
      } else if (key === 'v' || key === 'c') {
        onSelectTool('cutout');
      } else if (key === 'l') {
        onSelectTool('line');
      } else if (key === 'x') {
        onToggleCrosshair();
      } else if ((key === ' ' || key === 'enter') && showCrosshair) {
        e.preventDefault();
        onPlaceCrosshairPoint();
      } else if (key === 'escape') {
        onEscape();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    onEscape,
    onPlaceCrosshairPoint,
    onSelectTool,
    onToggleCrosshair,
    onUndo,
    showCrosshair,
  ]);
}
