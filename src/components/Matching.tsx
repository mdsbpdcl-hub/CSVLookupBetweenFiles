import { useState } from 'react';
import type { DupPolicy, FilterRule, MatchConfig, Operation, OutputConfig } from '../engine/types';
import type { Entry } from '../App';
import { uid } from '../lib/format';
import { applyTemplate, deleteTemplate, listTemplates, saveTemplate } from '../lib/templates';
import { Note } from './ui';

interface Props {
  entries: Entry[];
  cfg: MatchConfig;
  setCfg: (c: MatchConfig) => void;
  out: OutputConfig;
  setOut: (o: OutputConfig) => void;
}

const OPS: { v: Operation; t: string; d: string }[] = [
  { v: 'common', t: 'Common consumers only', d: 'Consumers present in both groups' },
  { v: 'a_not_b', t: 'Group A not found in B', d: 'Target consumers with no master record' },
  { v: 'b_not_a', t: 'Group B not found in A', d: 'Additional consumers only in master data' },
  { v: 'a_with_status', t: 'All Group A with match status', d: 'Every target consumer, matched or not' },
];

const POLICIES: { v: DupPolicy; t: string }[] = [
  { v: 'first', t: 'Keep first occurrence' },
  { v: 'last', t: 'Keep last occurrence' },
  { v: 'all', t: 'Keep all matching rows' },
  { v: 'newest', t: 'Keep newest (by a date column)' },
  { v: 'unique', t: 'One record per unique consumer' },
];

export default function Matching({ entries, cfg, setCfg, out, setOut }: Props) {
  const [tplName, setTplName] = useState('');
  const [tpls, setTpls] = useState(listTemplates());
  const [tplMsg, setTplMsg] = useState('');
  const parts = Math.max(1, ...entries.map((e) => (cfg.keyColumns[e.meta.id] ?? []).length));
  const metas = entries.map((e) => e.meta);

  const setKey = (fileId: string, part: number, col: string) => {
    const keyColumns = { ...cfg.keyColumns };
    const cur = [...(keyColumns[fileId] ?? [])];
    while (cur.length < parts) cur.push('');
    cur[part] = col;
    keyColumns[fileId] = cur;
    // apply the same heading to other files of the group that have it and are unset
    const g = metas.find((m) => m.id === fileId)!.group;
    for (const m of metas) {
      if (m.id === fileId || m.group !== g || !m.headers.includes(col)) continue;
      const other = [...(keyColumns[m.id] ?? [])];
      while (other.length < parts) other.push('');
      if (!other[part]) {
        other[part] = col;
        keyColumns[m.id] = other;
      }
    }
    setCfg({ ...cfg, keyColumns });
  };

  const setParts = (n: number) => {
    const keyColumns: Record<string, string[]> = {};
    for (const m of metas) {
      const cur = [...(cfg.keyColumns[m.id] ?? [])].slice(0, n);
      while (cur.length < n) cur.push('');
      keyColumns[m.id] = cur;
    }
    setCfg({ ...cfg, keyColumns });
  };

  const needDate = (g: 'A' | 'B') => (g === 'A' ? cfg.dupA : cfg.dupB) === 'newest';
  const cartesian = cfg.dupA === 'all' && cfg.dupB === 'all' && cfg.bCombine === 'union';
  const groupLabel = (g: 'A' | 'B') => (g === 'A' ? 'a' : 'b');

  const addFilter = () =>
    setCfg({ ...cfg, filters: [...cfg.filters, { id: uid(), group: 'B', column: metas.find((m) => m.group === 'B')?.headers[0] ?? '', op: 'not_blank', value: '' }] });
  const setFilter = (id: string, patch: Partial<FilterRule>) =>
    setCfg({ ...cfg, filters: cfg.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const groupHeaders = (g: 'A' | 'B') => Array.from(new Set(metas.filter((m) => m.group === g).flatMap((m) => m.headers)));

  return (
    <>
      <div className="card">
        <h2>Matching columns</h2>
        <p className="lead">Choose the column(s) that identify the same consumer in each file. Headings may differ between files.</p>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="field">
            <span>Columns forming the key</span>
            <select value={parts} onChange={(e) => setParts(+e.target.value)}>
              <option value={1}>Single column</option>
              <option value={2}>Composite – 2 columns</option>
              <option value={3}>Composite – 3 columns</option>
              <option value={4}>Composite – 4 columns</option>
            </select>
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th><th>File</th>
                {Array.from({ length: parts }, (_, i) => <th key={i}>Key column {parts > 1 ? i + 1 : ''}</th>)}
                {(needDate('A') || needDate('B')) && <th>Date column (newest)</th>}
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => (
                <tr key={m.id}>
                  <td><span className={`tag ${groupLabel(m.group)}`}>{m.group}</span></td>
                  <td><div className="fname" title={m.name}>{m.name}</div></td>
                  {Array.from({ length: parts }, (_, i) => (
                    <td key={i}>
                      <select value={cfg.keyColumns[m.id]?.[i] ?? ''} onChange={(e) => setKey(m.id, i, e.target.value)}>
                        <option value="">— choose —</option>
                        {m.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                  ))}
                  {(needDate('A') || needDate('B')) && (
                    <td>
                      {needDate(m.group) ? (
                        <select value={cfg.dateColumns[m.id] ?? ''} onChange={(e) => setCfg({ ...cfg, dateColumns: { ...cfg.dateColumns, [m.id]: e.target.value } })}>
                          <option value="">— choose —</option>
                          {m.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      ) : <span className="muted small">not needed</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Key normalisation</h3>
        <div className="row" style={{ gap: 18 }}>
          {([
            ['trim', 'Ignore leading/trailing spaces'],
            ['collapseSpaces', 'Treat repeated spaces as one'],
            ['ignoreCase', 'Ignore upper/lower case'],
            ['stripLeadingZeros', 'Ignore leading zeros (0012 = 12)'],
          ] as const).map(([k, t]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={cfg.normalize[k]} onChange={(e) => setCfg({ ...cfg, normalize: { ...cfg.normalize, [k]: e.target.checked } })} />
              {t}
            </label>
          ))}
        </div>
        {(() => {
          const numericKeys = metas.flatMap((m) =>
            (cfg.keyColumns[m.id] ?? []).filter((c) => c && m.numericColumns?.includes(c)).map((c) => `“${c}” in ${m.name}`),
          );
          return numericKeys.length > 0 ? (
            <Note kind="warn">
              {numericKeys.join(', ')} {numericKeys.length > 1 ? 'are' : 'is'} stored as numbers in Excel, not as text. Leading zeros exist there only
              if the cells use a zero-padded number format (such as 000000000000). If the same IDs have leading zeros in other files, tick
              “Ignore leading zeros”.
            </Note>
          ) : null;
        })()}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Identifiers are always compared as text — never converted to numbers or scientific notation. Blank keys (or a composite key with a blank part) never match anything.
        </p>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>What to extract</h2>
          <div className="opts" style={{ marginTop: 10 }}>
            {OPS.map((o) => (
              <label key={o.v} className={`opt ${cfg.operation === o.v ? 'on' : ''}`}>
                <input type="radio" name="op" checked={cfg.operation === o.v} onChange={() => setCfg({ ...cfg, operation: o.v })} />
                <span><b>{o.t}</b><small>{o.d}</small></span>
              </label>
            ))}
          </div>
          <h3>Multiple Group B files</h3>
          <div className="opts">
            <label className={`opt ${cfg.bCombine === 'union' ? 'on' : ''}`}>
              <input type="radio" name="comb" checked={cfg.bCombine === 'union'} onChange={() => setCfg({ ...cfg, bCombine: 'union' })} />
              <span><b>Combine as one dataset</b><small>Files are stacked; a consumer is found in whichever file has them</small></span>
            </label>
            <label className={`opt ${cfg.bCombine === 'join' ? 'on' : ''}`}>
              <input type="radio" name="comb" checked={cfg.bCombine === 'join'}
                onChange={() => setCfg({ ...cfg, bCombine: 'join', dupB: cfg.dupB === 'all' ? 'first' : cfg.dupB })} />
              <span><b>Join side by side</b><small>Each file contributes its own fields to the same output row</small></span>
            </label>
          </div>
        </div>
        <div className="card">
          <h2>Duplicate handling</h2>
          <div className="grid2" style={{ marginTop: 10, gap: 10 }}>
            <label className="field"><span>When a key repeats in Group A</span>
              <select value={cfg.dupA} onChange={(e) => setCfg({ ...cfg, dupA: e.target.value as DupPolicy })}>
                {POLICIES.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
              </select>
            </label>
            <label className="field"><span>When a key repeats in Group B</span>
              <select value={cfg.dupB} onChange={(e) => setCfg({ ...cfg, dupB: e.target.value as DupPolicy })}>
                {POLICIES.filter((p) => cfg.bCombine === 'union' || p.v !== 'all').map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
              </select>
            </label>
          </div>
          {(needDate('A') || needDate('B')) && (
            <label className="field" style={{ marginTop: 10, maxWidth: 260 }}><span>Date format in files</span>
              <select value={cfg.dateOrder} onChange={(e) => setCfg({ ...cfg, dateOrder: e.target.value as MatchConfig['dateOrder'] })}>
                <option value="DMY">Day-Month-Year (31-12-2024)</option>
                <option value="MDY">Month-Day-Year (12-31-2024)</option>
                <option value="YMD">Year-Month-Day only (2024-12-31)</option>
              </select>
            </label>
          )}
          <Note kind="info">
            {cfg.dupB === 'all' && cfg.bCombine === 'union'
              ? 'One output row per matching Group B row: a consumer found 3 times in Group B produces 3 rows.'
              : 'Each selected Group A row produces at most one output row.'}{' '}
            {cfg.dupA === 'all' ? 'Every Group A row is kept, including repeats.' : 'Repeated Group A keys are reduced to one row.'} Duplicate counts are shown after analysis.
          </Note>
          {cartesian && (
            <Note kind="warn">
              <b>Possible multiplication.</b> With “keep all” on both sides, a consumer appearing 2× in A and 3× in B yields 6 rows.
              <label className="check" style={{ marginTop: 6 }}>
                <input type="checkbox" checked={cfg.allowCartesian} onChange={(e) => setCfg({ ...cfg, allowCartesian: e.target.checked })} />
                Allow one-to-many multiplication
              </label>
            </Note>
          )}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Row filters <span className="tag none">optional</span></h2>
          <p className="lead">Rows failing a filter are ignored before matching (case-insensitive, spaces trimmed).</p>
          {cfg.filters.map((f) => (
            <div key={f.id} className="row" style={{ marginBottom: 8 }}>
              <select value={f.group} onChange={(e) => setFilter(f.id, { group: e.target.value as 'A' | 'B', column: groupHeaders(e.target.value as 'A' | 'B')[0] ?? '' })}>
                <option value="A">Group A</option><option value="B">Group B</option>
              </select>
              <select value={f.column} onChange={(e) => setFilter(f.id, { column: e.target.value })}>
                {groupHeaders(f.group).map((h) => <option key={h}>{h}</option>)}
              </select>
              <select value={f.op} onChange={(e) => setFilter(f.id, { op: e.target.value as FilterRule['op'] })}>
                <option value="equals">equals</option><option value="not_equals">does not equal</option>
                <option value="contains">contains</option><option value="starts_with">starts with</option>
                <option value="blank">is blank</option><option value="not_blank">is not blank</option>
              </select>
              {!['blank', 'not_blank'].includes(f.op) && <input type="text" value={f.value} onChange={(e) => setFilter(f.id, { value: e.target.value })} style={{ width: 140 }} />}
              <button className="btn sm" onClick={() => setCfg({ ...cfg, filters: cfg.filters.filter((x) => x.id !== f.id) })}>Remove</button>
            </div>
          ))}
          <button className="btn sm" onClick={addFilter}>+ Add filter</button>
        </div>
        <div className="card">
          <h2>Templates</h2>
          <p className="lead">Save this matching and output setup for reuse. Only settings are saved, never data.</p>
          <div className="row">
            <input type="text" placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <button className="btn sm" disabled={!tplName.trim()} onClick={() => { saveTemplate(tplName.trim(), metas, cfg, out); setTpls(listTemplates()); setTplMsg(`Saved "${tplName.trim()}".`); }}>Save</button>
          </div>
          {tpls.length > 0 && (
            <div className="tbl-wrap">
              <table><tbody>
                {tpls.map((t) => (
                  <tr key={t.name}>
                    <td><b>{t.name}</b><div className="small muted">{new Date(t.savedAt).toLocaleString('en-IN')}</div></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => {
                        const r = applyTemplate(t, metas);
                        setCfg(r.cfg);
                        setOut(r.out);
                        setTplMsg(r.unmatched.length ? `Applied. Choose key columns manually for: ${r.unmatched.join(', ')}` : `Applied "${t.name}".`);
                      }}>Apply</button>{' '}
                      <button className="btn sm danger" onClick={() => { deleteTemplate(t.name); setTpls(listTemplates()); }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
          {tplMsg && <Note kind="ok">{tplMsg}</Note>}
        </div>
      </div>
    </>
  );
}
