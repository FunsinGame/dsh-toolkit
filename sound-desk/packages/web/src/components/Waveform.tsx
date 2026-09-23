/**
 * Waveform surface: draws the peak pyramid, supports click-to-seek and
 * drag-to-select. Selection is the input to "seek within a range" and later to
 * slice search / export.
 */

import { useEffect, useRef, useState } from 'react';

import { drawWaveform, parsePeaks, type PeakPyramid } from '../audio/peaks.ts';

export interface WaveformProps {
  peaksUrl: string | null;
  /** 0..1 playhead */
  playhead: number | null;
  /** seconds */
  duration: number;
  selection: { start: number; end: number } | null;
  onSeek(seconds: number): void;
  onSelectionChange(selection: { start: number; end: number } | null): void;
  color: string;
  /** cache key, e.g. the asset id, so peaks are not refetched per render */
  assetKey: string | number | null;
}

export function Waveform(props: WaveformProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pyramidRef = useRef<PeakPyramid | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle');
  const [buckets, setBuckets] = useState(0);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  // fetch the pyramid when the asset changes
  useEffect(() => {
    pyramidRef.current = null;
    setBuckets(0);
    if (!props.peaksUrl) {
      setLoadState('idle');
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    fetch(props.peaksUrl)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setLoadState('missing');
          return;
        }
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const parsed = parsePeaks(buf);
        pyramidRef.current = parsed;
        setBuckets(parsed.levels[0]?.buckets ?? 0);
        setLoadState('ready');
        redraw();
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.peaksUrl, props.assetKey]);

  // track available width
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    setWidth(Math.floor(element.clientWidth));
    return () => observer.disconnect();
  }, []);

  // redraw on any visual change
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, props.playhead, props.selection, props.color, loadState]);

  function redraw(): void {
    const canvas = canvasRef.current;
    const pyramid = pyramidRef.current;
    if (!canvas) return;
    const height = 54;

    if (!pyramid) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const duration = props.duration > 0 ? props.duration : 1;
    drawWaveform(canvas, pyramid, {
      width: width || canvas.clientWidth || 300,
      height,
      waveColor: props.color,
      mirrorColor: props.color,
      axisColor: 'rgba(139, 148, 158, 0.35)',
      selection: props.selection
        ? { start: props.selection.start / duration, end: props.selection.end / duration }
        : drag
          ? { start: Math.min(drag.from, drag.to) / duration, end: Math.max(drag.from, drag.to) / duration }
          : null,
      playhead: props.playhead,
    });
  }

  function secondsAt(clientX: number): number {
    const element = wrapRef.current;
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    return ratio * (props.duration || 0);
  }

  return (
    <div
      className="wave"
      ref={wrapRef}
      data-load-state={loadState}
      data-buckets={buckets}
      onPointerDown={(ev) => {
        if (ev.button !== 0) return;
        (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
        const seconds = secondsAt(ev.clientX);
        setDrag({ from: seconds, to: seconds });
      }}
      onPointerMove={(ev) => {
        if (!drag) return;
        setDrag({ from: drag.from, to: secondsAt(ev.clientX) });
      }}
      onPointerUp={(ev) => {
        if (!drag) return;
        const seconds = secondsAt(ev.clientX);
        const start = Math.min(drag.from, seconds);
        const end = Math.max(drag.from, seconds);
        setDrag(null);
        // a click (not a drag) seeks; a drag selects
        if (Math.abs(end - start) < 0.05) {
          props.onSelectionChange(null);
          props.onSeek(seconds);
        } else {
          props.onSelectionChange({ start, end });
          props.onSeek(start);
        }
      }}
      title={
        props.selection
          ? `已选 ${props.selection.start.toFixed(2)}s – ${props.selection.end.toFixed(2)}s（点击波形可重新选择，Esc 取消）`
          : '点击跳转播放位置；拖动框选一段'
      }
    >
      <canvas ref={canvasRef} />
      {loadState === 'missing' && <div className="hint">该格式暂不支持波形（需要 ffmpeg 解码）</div>}
      {loadState === 'error' && <div className="hint">波形加载失败</div>}
      {loadState === 'loading' && <div className="hint">正在生成波形…</div>}
    </div>
  );
}
