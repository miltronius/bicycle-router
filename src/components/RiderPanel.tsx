import { BIKES, PACE_PRESETS, ASSIST_FACTOR, flatSpeedKmh } from '../lib/physics';
import type { RiderSettings, BikeType, AssistLevel } from '../lib/physics';

interface Props {
  rider: RiderSettings;
  onChange: (r: RiderSettings) => void;
}

const label = 'block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted mb-1';

export default function RiderPanel({ rider, onChange }: Props) {
  const set = <K extends keyof RiderSettings>(k: K, v: RiderSettings[K]) => onChange({ ...rider, [k]: v });
  const isE = BIKES[rider.bike].motorW > 0;
  const flat = flatSpeedKmh(rider);

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div>
        <span className={label}>Bike</span>
        <div className="grid grid-cols-3 gap-1">
          {(Object.keys(BIKES) as BikeType[]).map(b => (
            <button
              key={b}
              onClick={() => set('bike', b)}
              className={`py-1.5 rounded text-[11.5px] border cursor-pointer ${rider.bike === b ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:border-ink-soft'}`}
            >
              {BIKES[b].label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={label}>Effort · {rider.riderW} W ≈ {flat.toFixed(0)} km/h on the flat</span>
        <div className="flex gap-1 mb-1.5">
          {PACE_PRESETS.map(p => (
            <button key={p.label} onClick={() => set('riderW', p.riderW)}
              className={`flex-1 py-1 rounded text-[11px] border cursor-pointer ${rider.riderW === p.riderW ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <input type="range" min={40} max={350} step={5} value={rider.riderW}
               onChange={e => set('riderW', Number(e.target.value))} className="w-full accent-[#c83737]" aria-label="Rider power in watts" />
      </div>

      <div>
        <span className={label}>Rider weight · {rider.riderKg} kg (+ {BIKES[rider.bike].massKg} kg bike)</span>
        <input type="range" min={30} max={140} step={1} value={rider.riderKg}
               onChange={e => set('riderKg', Number(e.target.value))} className="w-full accent-[#c83737]" aria-label="Rider weight in kg" />
      </div>

      {isE && (
        <>
          <div>
            <span className={label}>Assist level</span>
            <div className="flex gap-1">
              {(Object.keys(ASSIST_FACTOR) as AssistLevel[]).map(a => (
                <button key={a} onClick={() => set('assist', a)}
                  className={`flex-1 py-1 rounded text-[11px] border capitalize cursor-pointer ${rider.assist === a ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft'}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>Battery · {rider.batteryWh} Wh</span>
            <input type="range" min={200} max={1000} step={25} value={rider.batteryWh}
                   onChange={e => set('batteryWh', Number(e.target.value))} className="w-full accent-[#c83737]" aria-label="Battery capacity in watt-hours" />
          </div>
          {rider.bike === 'speed-pedelec' && (
            <p className="text-[11.5px] leading-snug text-ink-soft bg-paper-2 rounded p-2">
              ⚖️ In Switzerland, S-pedelecs (up to 45 km/h) need a yellow plate and a helmet. On many paths signed
              “no mopeds” you must ride with the motor off. Check the signs — routing doesn't know your plate.
            </p>
          )}
        </>
      )}
      <p className="text-[11px] text-ink-muted leading-snug">
        Times, watts and battery use come from a physics model using the route's gradient, your weight, bike
        type, and air and rolling resistance. Treat them as estimates.
      </p>
    </div>
  );
}
