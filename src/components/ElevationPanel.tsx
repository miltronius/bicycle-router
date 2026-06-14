import { useEffect, useRef } from 'react';
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, Filler, Tooltip,
} from 'chart.js';
import type { ActiveElement, ChartEvent } from 'chart.js';
import type { Route, HoverLatLng } from '../types';

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip);

interface Props {
  route:          Route | null;
  onHoverChange:  (point: HoverLatLng | null) => void;
  onResizeStart:  (e: React.MouseEvent) => void;
}

export default function ElevationPanel({ route, onHoverChange, onResizeStart }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const chartRef     = useRef<Chart | null>(null);
  const onHoverRef   = useRef(onHoverChange);
  useEffect(() => { onHoverRef.current = onHoverChange; }, [onHoverChange]);

  useEffect(() => {
    // Destroy previous chart and clear hover marker
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    onHoverRef.current(null);

    if (!route || !route.profilePoints || route.profilePoints.length < 2) return;
    if (!canvasRef.current) return;

    const profile  = route.profilePoints;
    const totalKm  = profile[profile.length - 1].distance / 1000;
    const ctx = canvasRef.current.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 0, 400);
    grad.addColorStop(0, route.color + 'cc');
    grad.addColorStop(1, route.color + '10');

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: profile.map(p => p.distance / 1000),
        datasets: [{
          data:                    profile.map(p => p.elevation),
          borderColor:             route.color,
          backgroundColor:         grad,
          borderWidth:             2,
          fill:                    true,
          tension:                 0.35,
          pointRadius:             0,
          pointHoverRadius:        5,
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor:   route.color,
          pointHoverBorderWidth:   2,
        }],
      },
      options: {
        responsive:         true,
        maintainAspectRatio: false,
        animation:          { duration: 600 },
        interaction:        { mode: 'index', intersect: false },
        onHover: (_evt: ChartEvent, els: ActiveElement[]) => {
          if (els.length > 0) {
            const p = profile[els[0].index];
            if (p?.lat && p?.lon) onHoverRef.current({ lat: p.lat, lon: p.lon });
          } else {
            onHoverRef.current(null);
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1f26',
            titleColor:      '#f4efe6',
            bodyColor:       '#f4efe6',
            titleFont:       { family: 'IBM Plex Mono', size: 11 },
            bodyFont:        { family: 'IBM Plex Mono', size: 11 },
            displayColors:   false,
            padding:         8,
            cornerRadius:    4,
            callbacks: {
              title: items => `${parseFloat(items[0].label).toFixed(2)} km`,
              label: ctx   => `${Math.round(ctx.parsed.y ?? 0)} m`,
            },
          },
        },
        layout: { padding: { left: 0, right: 0, top: 4, bottom: 0 } },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: totalKm,
            ticks: {
              color: '#8a8775',
              font:  { family: 'IBM Plex Mono', size: 10 },
              callback: v => `${(v as number).toFixed(1)} km`,
              maxTicksLimit: 8,
            },
            grid:   { color: 'rgba(201,184,150,0.3)' },
            border: { color: '#c9b896' },
          },
          y: {
            ticks: {
              color: '#8a8775',
              font:  { family: 'IBM Plex Mono', size: 10 },
              callback: v => `${Math.round(v as number)} m`,
              maxTicksLimit: 5,
            },
            grid:   { color: 'rgba(201,184,150,0.3)' },
            border: { color: '#c9b896' },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [route]);

  if (!route?.profilePoints?.length) {
    return <div className="area-elevation elevation-panel" />;
  }

  const props   = route.data.features[0].properties;
  const ascend  = parseInt(props['filtered ascend'] ?? props['plain-ascend'] ?? '0');
  const len     = parseInt(props['track-length'] ?? '0');
  const elevs   = route.profilePoints.map(p => p.elevation);
  const minE    = Math.min(...elevs);
  const maxE    = Math.max(...elevs);
  const descend = Math.round(
    route.profilePoints.reduce((acc, p, i, arr) => {
      if (i === 0) return acc;
      const diff = p.elevation - arr[i - 1].elevation;
      return diff < 0 ? acc - diff : acc;
    }, 0)
  );

  return (
    <div className="area-elevation elevation-panel open bg-paper border-t border-line relative flex flex-col">
      <div className="resize-handle-y" onMouseDown={onResizeStart} />
      {/* Stats header */}
      <div className="flex items-baseline justify-between px-6 pt-2.5 pb-1 shrink-0">
        <span className="font-display text-sm italic font-normal text-ink">
          Elevation along the{' '}
          <em style={{ color: route.color }}>
            {route.name.toLowerCase()} {route.emName}
          </em>
        </span>
        <div className="flex gap-4 shrink-0 ml-4">
          {[
            { v: (len / 1000).toFixed(1), u: 'km'        },
            { v: `↑ ${ascend}`,           u: 'm'         },
            { v: `↓ ${descend}`,          u: 'm'         },
            { v: `${Math.round(minE)}–${Math.round(maxE)}`, u: 'm' },
          ].map(({ v, u }) => (
            <span key={u + v} className="font-mono text-[11px] text-ink-soft whitespace-nowrap">
              <span className="text-ink font-medium">{v}</span> {u}
            </span>
          ))}
        </div>
      </div>

      {/* Chart — flex-1 so it fills whatever height remains after the header */}
      <div className="flex-1 min-h-0 px-3 pb-2 relative">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
