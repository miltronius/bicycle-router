import { useEffect, useRef } from 'react';
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, Filler, Tooltip,
} from 'chart.js';
import type { ActiveElement, ChartEvent, Plugin } from 'chart.js';
import type { Route, HoverLatLng } from '../types';
import type { RiderSettings } from '../lib/physics';
import { powerAtGrade } from '../lib/physics';

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip);

interface Props {
  route:          Route | null;
  rider:          RiderSettings;
  /** Live mode: distance (m) already ridden — shaded on the chart. */
  progressDist:   number | null;
  onHoverChange:  (point: HoverLatLng | null) => void;
  onResizeStart:  (e: React.PointerEvent) => void;
}

export default function ElevationPanel({ route, rider, progressDist, onHoverChange, onResizeStart }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const chartRef     = useRef<Chart | null>(null);
  const onHoverRef   = useRef(onHoverChange);
  const riderRef     = useRef(rider);
  const progressRef  = useRef(progressDist);
  useEffect(() => { onHoverRef.current = onHoverChange; }, [onHoverChange]);
  useEffect(() => { riderRef.current = rider; }, [rider]);
  useEffect(() => {
    progressRef.current = progressDist;
    chartRef.current?.draw();
  }, [progressDist]);

  useEffect(() => {
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

    // Grade (%) at each point, from the previous point
    const grades = profile.map((p, i) => {
      if (i === 0) return 0;
      const d = p.distance - profile[i - 1].distance;
      return d > 0 ? ((p.elevation - profile[i - 1].elevation) / d) * 100 : 0;
    });

    // Shade the part already ridden in live mode
    const progressPlugin: Plugin<'line'> = {
      id: 'progress',
      afterDatasetsDraw(chart) {
        const d = progressRef.current;
        if (d === null || d === undefined) return;
        const { ctx: c, chartArea, scales } = chart;
        const x = scales.x.getPixelForValue(d / 1000);
        c.save();
        c.fillStyle = 'rgba(28,31,38,0.12)';
        c.fillRect(chartArea.left, chartArea.top, Math.max(0, x - chartArea.left), chartArea.bottom - chartArea.top);
        c.strokeStyle = '#1c1f26';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, chartArea.top);
        c.lineTo(x, chartArea.bottom);
        c.stroke();
        c.restore();
      },
    };

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
      plugins: [progressPlugin],
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
              label: c => {
                const g = grades[c.dataIndex] ?? 0;
                const w = Math.round(powerAtGrade(g / 100, riderRef.current));
                return [`${Math.round(c.parsed.y ?? 0)} m`, `${g >= 0 ? '+' : ''}${g.toFixed(1)} %`, `${w} W`];
              },
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

  const s = route.summary;

  return (
    <div className="area-elevation elevation-panel open bg-paper border-t border-line relative flex flex-col">
      <div className="resize-handle-y" onPointerDown={onResizeStart} />
      <div className="flex items-baseline justify-between px-6 pt-2.5 pb-1 shrink-0">
        <span className="font-display text-sm italic font-normal text-ink">
          Elevation along the{' '}
          <em style={{ color: route.color }}>
            {route.name.toLowerCase()} {route.emName}
          </em>
        </span>
        <div className="flex gap-4 shrink-0 ml-4">
          {[
            { v: (s.lengthM / 1000).toFixed(1), u: 'km' },
            { v: `↑ ${s.ascentM}`,  u: 'm' },
            { v: `↓ ${s.descentM}`, u: 'm' },
            { v: `${Math.round(s.minEle)}–${Math.round(s.maxEle)}`, u: 'm' },
          ].map(({ v, u }) => (
            <span key={u + v} className="font-mono text-[11px] text-ink-soft whitespace-nowrap">
              <span className="text-ink font-medium">{v}</span> {u}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 px-3 pb-2 relative">
        <canvas ref={canvasRef} aria-label="Elevation profile chart" role="img" />
      </div>
    </div>
  );
}
