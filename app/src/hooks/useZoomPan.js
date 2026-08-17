import { useState, useCallback, useEffect, useRef } from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;
const PAN_STEP = 50; // px per arrow key press

/**
 * Zoom & Pan hook for the video element.
 * Useful for zooming into small text in lecture slides.
 *
 * Controls:
 * - Z / Shift+Z: zoom in / zoom out
 * - Ctrl+0: reset zoom
 * - Arrow keys (when zoomed): pan
 * - Pinch gesture on touch devices
 * - Scroll wheel with Ctrl held
 */
export function useZoomPan() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });

  const isZoomed = zoom > 1;

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(MIN_ZOOM, prev - ZOOM_STEP);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const setZoomLevel = useCallback((level) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }, []);

  const panBy = useCallback(
    (dx, dy) => {
      if (zoom <= 1) return;
      setPan((prev) => {
        const maxPan = ((zoom - 1) / zoom) * 50; // percentage
        return {
          x: Math.max(-maxPan, Math.min(maxPan, prev.x + dx)),
          y: Math.max(-maxPan, Math.min(maxPan, prev.y + dy)),
        };
      });
    },
    [zoom]
  );

  const panLeft = useCallback(() => panBy(-PAN_STEP / zoom / 5, 0), [panBy, zoom]);
  const panRight = useCallback(() => panBy(PAN_STEP / zoom / 5, 0), [panBy, zoom]);
  const panUp = useCallback(() => panBy(0, -PAN_STEP / zoom / 5), [panBy, zoom]);
  const panDown = useCallback(() => panBy(0, PAN_STEP / zoom / 5), [panBy, zoom]);

  // Mouse drag panning
  const startPan = useCallback(
    (e) => {
      if (zoom <= 1) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { ...pan };
    },
    [zoom, pan]
  );

  const onPanMove = useCallback(
    (e) => {
      if (!isPanning.current || zoom <= 1) return;
      const dx = (e.clientX - panStart.current.x) / 10;
      const dy = (e.clientY - panStart.current.y) / 10;
      const maxPan = ((zoom - 1) / zoom) * 50;
      setPan({
        x: Math.max(-maxPan, Math.min(maxPan, panOffset.current.x + dx)),
        y: Math.max(-maxPan, Math.min(maxPan, panOffset.current.y + dy)),
      });
    },
    [zoom]
  );

  const endPan = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Reset pan when zoom goes back to 1
  useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  const videoStyle = zoom > 1
    ? {
        transform: `scale(${zoom}) translate(${pan.x}%, ${pan.y}%)`,
        transformOrigin: 'center center',
        cursor: isPanning.current ? 'grabbing' : 'grab',
      }
    : undefined;

  return {
    zoom,
    pan,
    isZoomed,
    videoStyle,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoomLevel,
    panLeft,
    panRight,
    panUp,
    panDown,
    panBy,
    startPan,
    onPanMove,
    endPan,
  };
}
