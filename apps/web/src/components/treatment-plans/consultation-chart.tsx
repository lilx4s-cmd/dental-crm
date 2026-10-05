'use client';
import { useEffect, useState } from 'react';
import {
  unassignedConsultationUnits,
  consultationChart,
  consultationToothGeometry,
  consultationToothLayers,
  consultationBridgeConnectors,
  procedureDescription,
  consultationCopy,
  procedureSteps,
  UPPER_TEETH,
  LOWER_TEETH,
  type Consultation,
  type ConsultationTooth,
  type DrawOp,
  type Procedure,
} from '@dental-crm/shared';
function Ops({ list }: { list: DrawOp[] }) {
  return (
    <>
      {list.map((op, i) => {
        const { kind, ...props } = op;
        switch (kind) {
          case 'path':
            return <path key={i} {...props} />;
          case 'circle':
            return <circle key={i} {...props} />;
          case 'rect':
            return <rect key={i} {...props} />;
          default:
            return <line key={i} {...props} />;
        }
      })}
    </>
  );
}
export function ConsultationChart({
  plan,
  visit,
  selected = [],
  onSelect,
}: {
  plan: Consultation;
  visit: number;
  selected?: string[];
  onSelect?: (fdi: string) => void;
}) {
  const t = consultationCopy(plan.language),
    state = consultationChart(plan, visit);
  return (
    <div dir="ltr">
      <svg
        viewBox="0 0 640 265"
        role="img"
        aria-label={`${t.visit} ${visit} · FDI`}
        className="w-full"
      >
        <rect width="640" height="66" rx="15" fill="#f4e3c3" />
        <rect y="190" width="640" height="65" rx="15" fill="#f4e3c3" />
        {[UPPER_TEETH, LOWER_TEETH].map((arch, a) =>
          arch.map((fdi, i) => {
            const layer = consultationToothLayers(plan, visit, fdi),
              x = 20 + i * 39 + (i >= 8 ? 8 : 0),
              y = a === 0 ? 66 : 190;
            return (
              <g
                key={fdi}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={`FDI ${fdi}: ${t[(state[fdi] === 'bridgePontic' ? 'bridge' : (state[fdi] ?? 'unknown')) as keyof typeof t]}`}
                aria-pressed={selected.includes(fdi)}
                onClick={() => onSelect?.(fdi)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect?.(fdi);
                  }
                }}
                className={onSelect ? 'cursor-pointer' : ''}
              >
                <rect x={x - 18} y={a === 0 ? 7 : 149} width="36" height="100" fill="transparent" />
                <title>{`${t.visit} ${visit} · FDI ${fdi} · ${t[(state[fdi] === 'bridgePontic' ? 'bridge' : (state[fdi] ?? 'unknown')) as keyof typeof t]}`}</title>
                {selected.includes(fdi) && (
                  <rect
                    x={x - 18}
                    y={a === 0 ? 7 : 149}
                    width="36"
                    height="100"
                    rx="8"
                    fill="#e2f0ed"
                    stroke="#16796e"
                  />
                )}
                <g
                  transform={`translate(${x},${y}) scale(0.7,${a === 0 ? -0.7 : 0.7})`}
                  opacity={state[fdi] ? 1 : 0.4}
                >
                  <Ops list={layer.subgingival} />
                  <Ops list={layer.supragingival} />
                </g>
                <text x={x - 6} y={a === 0 ? 115 : 145} fontSize="9" fill="#253d51">
                  {fdi}
                </text>
              </g>
            );
          }),
        )}
        {consultationBridgeConnectors(plan, visit).map((segment, key) => (
          <line
            key={key}
            x1={segment.x1}
            x2={segment.x2}
            y1={segment.y}
            y2={segment.y}
            stroke="#9eb8bf"
            strokeWidth="4"
          />
        ))}
        <line x1="8" y1="66" x2="632" y2="66" stroke="#d5a1a4" strokeWidth="4" />
        <line x1="8" y1="190" x2="632" y2="190" stroke="#d5a1a4" strokeWidth="4" />
      </svg>
      <p className="text-center text-xs text-muted-foreground">
        {t.upper} / {t.lower} · FDI · {t.unknown}
      </p>
      {unassignedConsultationUnits(plan, visit).map((line) => {
        const layer = consultationToothGeometry('11', line.type);
        return (
          <div key={line.id} className="mt-3 rounded-lg border border-dashed p-3">
            <p className="text-xs">
              {t[line.type]} · {line.count} · {line.jaw ? t[line.jaw] : t.unassigned}
            </p>
            <svg
              viewBox={`0 0 600 ${Math.ceil(line.count / 12) * 68}`}
              className="w-full"
              aria-label={`${line.count} ${t[line.type]}`}
            >
              {Array.from({ length: line.count }, (_, i) => (
                <g
                  key={i}
                  transform={`translate(${25 + (i % 12) * 50},${25 + Math.floor(i / 12) * 68}) scale(0.45)`}
                >
                  <rect x="-35" y="0" width="70" height="58" fill="#f4e3c3" />
                  <Ops list={layer.subgingival} />
                  <Ops list={layer.supragingival} />
                </g>
              ))}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
export function TreatmentProcess({ plan, type }: { plan: Consultation; type: Procedure }) {
  const t = consultationCopy(plan.language),
    steps = procedureSteps(
      type,
      plan.lines.some((l) => l.type === 'extraction'),
      plan.lines.some((l) => l.type === 'temporary'),
      plan.lines.some((l) => ['crown', 'implantCrown', 'bridge'].includes(l.type)),
    );
  const [active, setActive] = useState(0),
    [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % steps.length), 2800);
    return () => clearInterval(timer);
  }, [playing, steps.length]);
  const step = steps[active] ?? steps[0];
  const state: ConsultationTooth =
    step === 'implant'
      ? 'implant'
      : step === 'healing'
        ? type === 'implant' || type === 'implantCrown'
          ? 'implant'
          : type
        : step === 'review'
          ? type === 'extraction'
            ? 'missing'
            : type
          : step === 'implantCrown'
            ? 'implantCrown'
            : step === 'extraction'
              ? 'missing'
              : step === 'fitting' || ['sinus', 'graft', 'rootCanal'].includes(step)
                ? type
                : 'unknown';
  const layer = consultationToothGeometry('11', state);
  return (
    <div className="rounded-xl border bg-slate-50 p-4 text-slate-800">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{t[type]}</h4>
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? t.pause : t.play}
        >
          {playing ? 'Ⅱ' : '▷'}
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{procedureDescription(plan.language, type)}</p>
      <svg viewBox="-65 -60 130 135" className="mx-auto h-36" aria-label={t[step]}>
        <rect x="-65" y="0" width="130" height="70" rx="10" fill="#f4e3c3" />
        <line x1="-65" y1="0" x2="65" y2="0" stroke="#d5a1a4" strokeWidth="5" />
        <g
          key={active}
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700"
        >
          <Ops list={layer.subgingival} />
          <Ops list={layer.supragingival} />
        </g>
      </svg>
      <div className="flex flex-wrap justify-center gap-2">
        {steps.map((s, i) => (
          <button
            key={`${s}-${i}`}
            type="button"
            onClick={() => {
              setActive(i);
              setPlaying(false);
            }}
            className={`rounded-lg px-2 py-1 text-xs ${active === i ? 'bg-teal-800 text-white' : 'border bg-white'}`}
          >
            {i + 1}. {t[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
