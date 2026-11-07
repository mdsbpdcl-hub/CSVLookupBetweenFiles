import type { ReactNode } from 'react';
import type { Progress } from '../engine/types';
import { fmtBytes, fmtMs, fmtNum } from '../lib/format';

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
    upload: <><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>,
    link: <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
    columns: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>,
    play: <path d="M7 4v16l13-8z" />,
    download: <><path d="M12 4v12" /><path d="m6 10 6 6 6-6" /><path d="M4 20h16" /></>,
    shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
    x: <><path d="M6 6l12 12M18 6 6 18" /></>,
    up: <path d="m6 15 6-6 6 6" />,
    down: <path d="m6 9 6 6 6-6" />,
    trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
    file: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}

export function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="kpi" style={{ ['--c' as any]: color }}>
      <div className="k" title={label}>{label}</div>
      <div className="v">{value}</div>
      {hint && <div className="h">{hint}</div>}
    </div>
  );
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'err' | 'ok'; children: ReactNode }) {
  return <div className={`note ${kind}`}>{children}</div>;
}

export function Donut({ parts, size = 132 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f2f4f7" strokeWidth={16} />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={16}
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            );
            off += len;
            return el;
          })}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontWeight={700} fontSize={16}>
          {total ? `${Math.round(((parts[0]?.value ?? 0) / total) * 100)}%` : '—'}
        </text>
      </svg>
      <div className="legend">
        {parts.map((p) => (
          <div key={p.label}><i style={{ background: p.color }} />{p.label}: <b>{fmtNum(p.value)}</b></div>
        ))}
      </div>
    </div>
  );
}

export function ProgressPanel({ p, onCancel }: { p: Progress; onCancel?: () => void }) {
  const pct = p.percent;
  return (
    <div className="prog">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{p.stage}{p.file ? ` — ${p.file}` : ''}</b>
        {onCancel && <button className="btn sm danger" onClick={onCancel}><Icon name="x" size={14} /> Cancel</button>}
      </div>
      <div className={`bar ${pct === undefined ? 'indet' : ''}`} style={{ marginTop: 8 }}>
        <div style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
      </div>
      <div className="prog-grid">
        <div>Progress<b>{pct === undefined ? 'Not measurable' : `${pct.toFixed(1)}%`}</b></div>
        <div>Rows processed<b>{fmtNum(p.rowsDone)}</b></div>
        <div>Total rows<b>{p.rowsTotal === undefined ? 'Not yet counted' : fmtNum(p.rowsTotal)}</b></div>
        {p.bytesTotal !== undefined && <div>Data read<b>{fmtBytes(p.bytesDone ?? 0)} / {fmtBytes(p.bytesTotal)}</b></div>}
        <div>Elapsed<b>{fmtMs(p.elapsedMs)}</b></div>
      </div>
    </div>
  );
}
