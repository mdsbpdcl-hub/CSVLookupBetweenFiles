import { useEffect, useState } from 'react';
import type { AnalysisStats, FileMeta, MatchConfig, OutputConfig, Progress } from '../engine/types';
import { caps, downloadText, storageEstimate } from '../lib/files';
import { buildOfflineScript } from '../engine/sql';
import { csvNameFor, fmtBytes, fmtMs, fmtNum } from '../lib/format';
import { Icon, Note, ProgressPanel } from './ui';

interface Props {
  files: FileMeta[];
  cfg: MatchConfig;
  out: OutputConfig;
  mode: 'A' | 'B';
  setMode: (m: 'A' | 'B') => void;
  chunkMB: number;
  setChunkMB: (n: number) => void;
  errors: string[];
  busy: string | null;
  progress: Progress | null;
  stats: AnalysisStats | null;
  issues: number;
  error: string | null;
  onAnalyze: () => void;
  onCancel: () => void;
  onNext: () => void;
}

const SQL_LIMIT_MB = 1200; // projected in-memory size above which Mode B is not recommended

function estimate(files: FileMeta[], cfg: MatchConfig, out: OutputConfig) {
  const A = files.filter((f) => f.group === 'A');
  const B = files.filter((f) => f.group === 'B');
  const rows = (fs: FileMeta[]) => fs.reduce((s, f) => s + (f.rows ?? Math.round(f.size / 80)), 0);
  const aRows = rows(A), bRows = rows(B);
  const avgRow = (fs: FileMeta[]) => (fs.reduce((s, f) => s + f.size, 0) / Math.max(1, rows(fs))) || 80;
  const bCols = out.columns.filter((c) => c.kind === 'field' && c.group === 'B').length;
  const bShare = Math.min(1, (bCols + 1) / Math.max(1, Math.max(...B.map((f) => f.headers.length), 1)));
  // Mode A: key map (~90 bytes + 2 bytes/char per unique key) + kept B projections
  const keyLen = 14;
  const keptB = cfg.operation === 'b_not_a' ? 0 : Math.min(aRows, bRows) * (cfg.dupB === 'all' ? 1.5 : 1);
  const modeA = aRows * (90 + keyLen * 2) + keptB * (avgRow(B) * bShare * 2 + 60) + (cfg.operation === 'b_not_a' ? bRows * (90 + keyLen * 2) : 0);
  // Mode B: projected tables for both groups held in DuckDB memory
  const aCols = out.columns.filter((c) => c.kind === 'field' && c.group === 'A').length;
  const aShare = Math.min(1, (aCols + 2) / Math.max(1, Math.max(...A.map((f) => f.headers.length), 1)));
  const modeB = aRows * (avgRow(A) * aShare + 40) * 1.6 + bRows * (avgRow(B) * Math.min(1, bShare + 0.1) + 40) * 1.6;
  return { aRows, bRows, modeA: modeA / 1048576, modeB: modeB / 1048576 };
}

export default function Process(p: Props) {
  const { files, cfg, out, mode, setMode, stats } = p;
  const est = estimate(files, cfg, out);
  const [store, setStore] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => { storageEstimate().then(setStore); }, []);
  const recommended: 'A' | 'B' = 'A'; // Mode A has the lowest memory use for every workload
  const ramGB = caps.deviceMemoryGB;
  const inputBytes = files.reduce((s, f) => s + f.size, 0);
  const running = p.busy === 'analyze' || p.busy === 'preview';

  return (
    <>
      <div className="grid2">
        <div className="card">
          <h2>Processing engine</h2>
          <div className="opts" style={{ marginTop: 10 }}>
            <label className={`opt ${mode === 'A' ? 'on' : ''}`}>
              <input type="radio" checked={mode === 'A'} onChange={() => setMode('A')} disabled={running} />
              <span><b>Mode A · Streaming key index {recommended === 'A' && <span className="tag good">Recommended</span>}</b>
                <small>Reads files in chunks; keeps only the key index and the matched fields in memory. Handles the largest files.</small></span>
            </label>
            <label className={`opt ${mode === 'B' ? 'on' : ''}`}>
              <input type="radio" checked={mode === 'B'} onChange={() => setMode('B')} disabled={running} />
              <span><b>Mode B · DuckDB SQL engine</b>
                <small>Loads the needed columns into an in-browser SQL database. Useful to cross-check results on small and medium data.</small></span>
            </label>
          </div>
          {mode === 'B' && est.modeB > SQL_LIMIT_MB && (
            <Note kind="warn">Estimated SQL memory need is about {fmtNum(est.modeB)} MB, beyond what browsers reliably allow. Use Mode A for this workload.</Note>
          )}
          {mode === 'B' && <Note kind="info">The SQL engine (about 35 MB) is part of this app and loads from the same site the first time it is used. No data is sent anywhere.</Note>}
          <div className="row" style={{ marginTop: 12 }}>
            <label className="field"><span>Read batch size</span>
              <select value={p.chunkMB} onChange={(e) => p.setChunkMB(+e.target.value)} disabled={mode === 'B' || running}>
                {[2, 4, 8, 16, 32].map((n) => <option key={n} value={n}>{n} MB per chunk</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="card">
          <h2>Resources</h2>
          <div className="stat-grid" style={{ marginTop: 10 }}>
            <div className="stat"><div className="k">Input size</div><div className="v">{fmtBytes(inputBytes)}</div></div>
            <div className="stat"><div className="k">Estimated memory ({mode === 'A' ? 'Mode A' : 'Mode B'})</div><div className="v">~{fmtNum(mode === 'A' ? est.modeA : est.modeB)} MB</div></div>
            <div className="stat"><div className="k">Device memory</div><div className="v">{ramGB ? `${ramGB} GB+` : 'Not reported'}</div></div>
            <div className="stat"><div className="k">Browser storage free</div><div className="v">{store ? fmtBytes(Math.max(0, store.quota - store.usage)) : 'Not reported'}</div></div>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Estimates are approximate. If a workload is too large for this browser, the tab may stop responding or reload; reduce output columns, use “keep first”, split Group A, or download the offline job.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Run analysis</h2>
        <p className="lead">Matches the files, counts duplicates and calculates the exact number of result rows before anything is exported.</p>
        {p.errors.length > 0 && <Note kind="warn"><ul>{p.errors.map((e) => <li key={e}>{e}</li>)}</ul></Note>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={p.errors.length > 0 || !!p.busy} onClick={p.onAnalyze}>
            <Icon name="play" size={16} /> {stats ? 'Run again' : 'Start analysis'}
          </button>
          {stats && !p.busy && <button className="btn" onClick={p.onNext}>Go to results & export →</button>}
          <button className="btn" disabled={p.errors.length > 0 || !!p.busy} title="For workloads larger than the browser can handle"
            onClick={() =>
              downloadText(
                buildOfflineScript(files, cfg, out, 'matched_consumers.csv', ',', Object.fromEntries(files.map((f) => [f.id, csvNameFor(f)]))),
                'matcher_job.sql',
                'text/plain',
              )
            }>
            Download offline job (Python/DuckDB)
          </button>
        </div>
        {files.some((f) => f.source) && !running && (
          <p className="small muted">The offline job reads CSV files: for Excel sheets, save their CSV copies with the “CSV” button on the Upload step into the same folder.</p>
        )}
        {running && p.progress && <ProgressPanel p={p.progress} onCancel={p.onCancel} />}
        {p.busy === 'preview' && <Note kind="info">Analysis complete — building preview…</Note>}
        {p.error && <Note kind="err"><b>Could not finish.</b> {p.error}</Note>}
        {stats && !running && (
          <>
            <h3>Analysis result</h3>
            <div className="stat-grid">
              <div className="stat"><div className="k">Group A rows</div><div className="v">{fmtNum(stats.aRows)}</div></div>
              <div className="stat"><div className="k">Group B rows</div><div className="v">{fmtNum(stats.bRows)}</div></div>
              <div className="stat"><div className="k">Unique Group A keys</div><div className="v">{fmtNum(stats.aUniqueKeys)}</div></div>
              <div className="stat"><div className="k">Matched consumers (unique)</div><div className="v" style={{ color: 'var(--good)' }}>{fmtNum(stats.matchedKeys)}</div></div>
              <div className="stat"><div className="k">Duplicate keys A · extra rows</div><div className="v">{fmtNum(stats.aDuplicateKeys)} · {fmtNum(stats.aDuplicateRows)}</div></div>
              <div className="stat"><div className="k">Duplicate keys B · extra rows</div><div className="v">{fmtNum(stats.bDuplicateKeys)} · {fmtNum(stats.bDuplicateRows)}</div></div>
              <div className="stat"><div className="k">Blank keys A · B</div><div className="v">{fmtNum(stats.aBlankKeys)} · {fmtNum(stats.bBlankKeys)}</div></div>
              <div className="stat"><div className="k">Result rows to export</div><div className="v" style={{ color: 'var(--g1)' }}>{fmtNum(stats.expectedOutputRows)}</div></div>
              <div className="stat"><div className="k">Analysis time</div><div className="v">{fmtMs(stats.analyzeMs)}</div></div>
              {stats.peakHeapMB !== undefined && <div className="stat"><div className="k">Peak memory (worker)</div><div className="v">{fmtNum(stats.peakHeapMB)} MB</div></div>}
            </div>
            {stats.cartesianKeys > 0 && (
              <Note kind={cfg.allowCartesian ? 'info' : 'err'}>
                {fmtNum(stats.cartesianKeys)} key(s) repeat in both groups with “keep all” on both sides, so rows multiply (result: {fmtNum(stats.expectedOutputRows)} rows).
                {!cfg.allowCartesian && ' Export is blocked until you allow one-to-many multiplication on the Matching step or change a duplicate rule.'}
              </Note>
            )}
            {(stats.aFiltered > 0 || stats.bFiltered > 0) && <Note kind="info">Filters excluded {fmtNum(stats.aFiltered)} Group A and {fmtNum(stats.bFiltered)} Group B rows.</Note>}
            {stats.malformedRows > 0 && <Note kind="warn">{fmtNum(stats.malformedRows)} row(s) had a different number of columns than the heading. They were processed (missing cells treated as blank); see the data issue report.</Note>}
            {stats.badDates > 0 && <Note kind="warn">{fmtNum(stats.badDates)} date value(s) could not be read; those rows are treated as oldest for “keep newest”.</Note>}
            {stats.missingFieldWarnings.length > 0 && (
              <Note kind="warn">Missing fields:<ul>{stats.missingFieldWarnings.slice(0, 6).map((w) => <li key={w}>{w}</li>)}</ul></Note>
            )}
            {stats.aBlankKeys + stats.bBlankKeys > 0 && (
              <Note kind="info">Rows with blank keys are never matched. {cfg.operation === 'a_not_b' || cfg.operation === 'a_with_status' || cfg.operation === 'b_not_a' ? 'They are included in the output with status BLANK KEY.' : 'They are not part of a common-consumers result.'}</Note>
            )}
            {p.issues > 0 && <Note kind="info">{fmtNum(p.issues)} data issue(s) were recorded — download the data issue report on the next step.</Note>}
          </>
        )}
      </div>
    </>
  );
}
