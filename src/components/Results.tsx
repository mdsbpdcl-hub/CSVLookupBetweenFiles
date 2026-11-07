import { useState } from 'react';
import type { AnalysisStats, ExportOptions, MatchConfig, Progress } from '../engine/types';
import type { ExportRecord } from '../App';
import { caps } from '../lib/files';
import { DELIMS, fmtBytes, fmtMs, fmtNum } from '../lib/format';
import { XLSX_MAX_ROWS } from '../engine/writer';
import { Donut, Icon, Note, ProgressPanel } from './ui';

interface Props {
  stats: AnalysisStats;
  cfg: MatchConfig;
  preview: { header: string[]; rows: string[][] } | null;
  opts: ExportOptions;
  setOpts: (o: ExportOptions) => void;
  busy: string | null;
  progress: Progress | null;
  error: string | null;
  exports: ExportRecord[];
  issues: number;
  mode: 'A' | 'B';
  onExport: () => void;
  onReport: (r: 'duplicates' | 'issues') => void;
  onSummary: () => void;
  onCancel: () => void;
  onClear: () => void;
}

const PAGE = 50;

export default function Results(p: Props) {
  const { stats, opts, setOpts } = p;
  const [page, setPage] = useState(0);
  const rows = p.preview?.rows ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const xlsxTooBig = opts.format === 'xlsx' && stats.expectedOutputRows > XLSX_MAX_ROWS - 1 && !opts.splitRows;
  const blocked = stats.cartesianKeys > 0 && !p.cfg.allowCartesian;
  const unmatched = p.cfg.operation === 'b_not_a' ? stats.unmatchedBKeys : stats.unmatchedAKeys;

  return (
    <>
      <div className="grid3">
        <div className="card">
          <h2>Match overview</h2>
          <div style={{ marginTop: 10 }}>
            <Donut parts={[
              { label: 'Matched keys', value: stats.matchedKeys, color: '#12a150' },
              { label: p.cfg.operation === 'b_not_a' ? 'B keys not in A' : 'A keys not in B', value: Math.max(0, unmatched), color: '#e8a10c' },
              { label: 'Blank-key rows', value: p.cfg.operation === 'b_not_a' ? stats.bBlankKeys : stats.aBlankKeys, color: '#98a2b3' },
            ]} />
          </div>
        </div>
        <div className="card">
          <h2>Rows vs. consumers</h2>
          <div className="stat-grid" style={{ marginTop: 10, gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat"><div className="k">Group A rows</div><div className="v">{fmtNum(stats.aRows)}</div></div>
            <div className="stat"><div className="k">Unique A consumers</div><div className="v">{fmtNum(stats.aUniqueKeys)}</div></div>
            <div className="stat"><div className="k">Group B rows</div><div className="v">{fmtNum(stats.bRows)}</div></div>
            <div className="stat"><div className="k">Result rows</div><div className="v">{fmtNum(stats.expectedOutputRows)}</div></div>
          </div>
        </div>
        <div className="card">
          <h2>Duplicates</h2>
          <div className="stat-grid" style={{ marginTop: 10, gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat"><div className="k">Repeated keys in A</div><div className="v">{fmtNum(stats.aDuplicateKeys)}</div></div>
            <div className="stat"><div className="k">Extra rows in A</div><div className="v">{fmtNum(stats.aDuplicateRows)}</div></div>
            <div className="stat"><div className="k">Repeated keys in B{p.cfg.operation === 'b_not_a' ? '' : ' (matched)'}</div><div className="v">{fmtNum(stats.bDuplicateKeys)}</div></div>
            <div className="stat"><div className="k">Extra rows in B</div><div className="v">{fmtNum(stats.bDuplicateRows)}</div></div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Preview <span className="tag none">first {fmtNum(rows.length)} of {fmtNum(stats.expectedOutputRows)} rows</span></h2>
        {!p.preview && <Note kind="info">Loading</Note>}
        {p.preview && rows.length === 0 && <Note kind="warn">No data yet — the result has no rows for the chosen settings.</Note>}
        {p.preview && rows.length > 0 && (
          <>
            <div className="tbl-wrap preview">
              <table>
                <thead><tr><th className="num">#</th>{p.preview.header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(page * PAGE, page * PAGE + PAGE).map((r, i) => (
                    <tr key={i}><td className="num muted">{page * PAGE + i + 1}</td>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page + 1} / {pages}</span>
              <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </>
        )}
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Export result</h2>
          <div className="grid2" style={{ gap: 10, marginTop: 10 }}>
            <label className="field"><span>File name</span>
              <input type="text" value={opts.fileName} onChange={(e) => setOpts({ ...opts, fileName: e.target.value.replace(/[\\/:*?"<>|]/g, '_') })} />
            </label>
            <label className="field"><span>Format</span>
              <select value={opts.format} onChange={(e) => setOpts({ ...opts, format: e.target.value as ExportOptions['format'] })}>
                <option value="csv">CSV (recommended)</option>
                <option value="xlsx">Excel XLSX (up to 10,48,575 rows per file)</option>
              </select>
            </label>
            <label className="field"><span>Save to</span>
              <select value={opts.target} onChange={(e) => setOpts({ ...opts, target: e.target.value as ExportOptions['target'] })}>
                {caps.saveAs && <option value="file">Save As… (choose file)</option>}
                {caps.folder && <option value="directory">Choose output folder…</option>}
                <option value="download">Browser download</option>
              </select>
            </label>
            <label className="field"><span>Split into files of</span>
              <select value={opts.splitRows} onChange={(e) => setOpts({ ...opts, splitRows: +e.target.value })}>
                <option value={0}>Do not split</option>
                {[100000, 500000, 1000000, 1048575].map((n) => <option key={n} value={n}>{fmtNum(n)} rows</option>)}
              </select>
            </label>
            {opts.format === 'csv' && (
              <label className="field"><span>Delimiter</span>
                <select value={opts.delimiter} onChange={(e) => setOpts({ ...opts, delimiter: e.target.value })}>
                  {DELIMS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
                </select>
              </label>
            )}
          </div>
          {opts.format === 'csv' && (
            <div className="row" style={{ gap: 18, marginTop: 10 }}>
              <label className="check"><input type="checkbox" checked={opts.bom} onChange={(e) => setOpts({ ...opts, bom: e.target.checked })} />UTF-8 BOM (Excel shows Hindi correctly)</label>
              <label className="check"><input type="checkbox" checked={opts.formulaGuard} onChange={(e) => setOpts({ ...opts, formulaGuard: e.target.checked })} />Protect against spreadsheet formulas</label>
            </div>
          )}
          {opts.target === 'file' && opts.splitRows > 0 && <Note kind="warn">Splitting writes several files: choose “output folder” or “browser download”.</Note>}
          {xlsxTooBig && <Note kind="err">The result has {fmtNum(stats.expectedOutputRows)} rows, more than one Excel sheet holds. Choose CSV or split the output.</Note>}
          {opts.format === 'csv' && <p className="small muted">Tip: opening a CSV in Excel may still show long IDs in scientific notation — that is Excel's display. Use XLSX, or Excel's Data → From Text/CSV with the ID column set to Text.</p>}
          {blocked && <Note kind="err">Export is blocked: rows would multiply. Allow one-to-many multiplication on the Matching step.</Note>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!!p.busy || xlsxTooBig || blocked || (opts.target === 'file' && opts.splitRows > 0)} onClick={p.onExport}>
              <Icon name="download" size={16} /> Export {fmtNum(stats.expectedOutputRows)} rows
            </button>
          </div>
          {p.busy === 'export' && p.progress && <ProgressPanel p={p.progress} onCancel={p.onCancel} />}
          {p.error && <Note kind="err"><b>Export did not complete.</b> {p.error}</Note>}
        </div>
        <div className="card">
          <h2>Reports</h2>
          <p className="lead">Separate files for review and audit.</p>
          <div className="row">
            <button className="btn" disabled={!!p.busy} onClick={p.onSummary}><Icon name="file" size={15} /> Matching summary</button>
            <button className="btn" disabled={!!p.busy} onClick={() => p.onReport('duplicates')}><Icon name="file" size={15} /> Duplicate report</button>
            <button className="btn" disabled={!!p.busy || p.mode === 'B'} title={p.mode === 'B' ? 'Available with Mode A' : ''} onClick={() => p.onReport('issues')}>
              <Icon name="file" size={15} /> Data issue report{p.issues ? ` (${fmtNum(p.issues)})` : ''}
            </button>
          </div>
          <h3>Completed exports</h3>
          {p.exports.length === 0 && <p className="small muted">No data yet</p>}
          {p.exports.map((x, i) => (
            <Note key={i} kind={x.result.warnings.length ? 'warn' : 'ok'}>
              <b>{x.label} — {fmtNum(x.result.rows)} rows exported</b> <span className="muted">({x.at}, {fmtMs(x.result.ms)})</span>
              <ul>{x.result.files.map((f) => <li key={f.name}>{f.name} · {fmtNum(f.rows)} rows · {fmtBytes(f.bytes)}</li>)}</ul>
              {x.result.warnings.map((w) => <div key={w}>⚠ {w}</div>)}
              {x.sink === 'opfs' && <div className="small">Saved through the browser's downloads.</div>}
            </Note>
          ))}
          <h3>Temporary data</h3>
          <p className="small muted">Clears the in-browser index, SQL tables and temporary export copies kept in browser storage.</p>
          <button className="btn danger" disabled={!!p.busy} onClick={p.onClear}><Icon name="trash" size={15} /> Clear temporary data</button>
        </div>
      </div>
    </>
  );
}
