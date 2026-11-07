import { useRef, useState } from 'react';
import type { Encoding, Group } from '../engine/types';
import type { Entry } from '../App';
import { DELIMS, fmtBytes, fmtNum } from '../lib/format';
import { Icon, Note } from './ui';

interface Props {
  entries: Entry[];
  onAdd: (g: Group, files: File[]) => void;
  onRemove: (id: string) => void;
  onChange: (id: string, patch: { delimiter?: string; encoding?: Encoding }) => void;
  onSheet: (id: string, sheetPath: string) => void;
  onOtherSheets: (id: string) => void;
  onSaveCsv: (id: string) => void;
}

const ENCODINGS: { v: Encoding; label: string }[] = [
  { v: 'utf-8', label: 'UTF-8' },
  { v: 'windows-1252', label: 'Windows-1252 / ANSI' },
  { v: 'utf-16le', label: 'UTF-16 LE' },
  { v: 'utf-16be', label: 'UTF-16 BE' },
];

function Zone({ group, entries, onAdd, onRemove, onChange, onSheet, onOtherSheets, onSaveCsv }: Props & { group: Group }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const list = entries.filter((e) => e.meta.group === group);
  const totalRows = list.every((e) => e.meta.rows !== undefined) ? list.reduce((s, e) => s + (e.meta.rows ?? 0), 0) : undefined;
  const totalSize = list.reduce((s, e) => s + e.meta.size, 0);
  return (
    <div className="card">
      <h2>
        <span className={`tag ${group === 'A' ? 'a' : 'b'}`}>Group {group}</span>
        {group === 'A' ? 'Target Consumers' : 'Master Consumers'}
      </h2>
      <p className="lead">
        {group === 'A' ? 'Consumers for whom information is required.' : 'Source files holding the detailed consumer information.'}
      </p>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = Array.from(e.dataTransfer.files).filter((f) => /\.(csv|txt|tsv|xlsx|xlsm|xls|xlsb|ods)$/i.test(f.name) || f.type.includes('csv') || f.type === 'text/plain');
          if (files.length) onAdd(group, files);
        }}
      >
        <Icon name="upload" size={22} />
        <b>Drop CSV or Excel files here or click to choose</b>
        <span>Multiple files allowed · CSV (comma, semicolon, tab, pipe) · Excel .xlsx / .xlsm</span>
        <input ref={input} type="file" multiple accept=".csv,.txt,.tsv,text/csv,.xlsx,.xlsm,.xls,.xlsb,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
          onChange={(e) => { if (e.target.files?.length) onAdd(group, Array.from(e.target.files)); e.target.value = ''; }} />
      </div>
      {list.length > 0 && (
        <>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>File</th><th className="num">Size</th><th className="num">Rows</th><th className="num">Columns</th><th>Delimiter / Sheet</th><th>Encoding</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const xl = !!e.meta.source || !!e.sheets;
                  const otherSheets = e.sheets
                    ? e.sheets.filter((sh) => !sh.hidden && !entries.some((x) => x.file === e.file && x.meta.source?.sheetPath === sh.path)).length
                    : 0;
                  return (
                  <tr key={e.meta.id}>
                    <td className="wrap">
                      <div className="fname" title={e.meta.name}>{e.meta.name}</div>
                      {e.meta.warnings.length > 0 && <ul className="warn-list">{e.meta.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                      {e.meta.error && <div className="warn-list" style={{ color: 'var(--bad)' }}>{e.meta.error}</div>}
                    </td>
                    <td className="num" title={e.csv ? `CSV copy: ${fmtBytes(e.csv.size)}` : undefined}>{fmtBytes(e.file.size)}</td>
                    <td className="num">
                      {e.meta.rows !== undefined
                        ? fmtNum(e.meta.rows)
                        : e.meta.status === 'converting'
                          ? `${e.convStage ?? 'converting'}${e.countPct !== undefined ? ` ${e.countPct.toFixed(0)}%` : ''}`
                          : e.countPct !== undefined ? `counting ${e.countPct.toFixed(0)}%` : '—'}
                    </td>
                    <td className="num">{e.meta.headers.length || '—'}</td>
                    {xl ? (
                      <>
                        <td>
                          {e.sheets ? (
                            <select value={e.meta.source?.sheetPath ?? ''} onChange={(ev) => onSheet(e.meta.id, ev.target.value)} disabled={e.meta.status === 'converting'} title="Worksheet">
                              {e.sheets.map((sh) => <option key={sh.path} value={sh.path}>{sh.name}{sh.hidden ? ' (hidden)' : ''}</option>)}
                            </select>
                          ) : '—'}
                          {otherSheets > 0 && e.meta.status !== 'converting' && (
                            <div><button className="btn sm" style={{ marginTop: 4 }} onClick={() => onOtherSheets(e.meta.id)}>+ add {otherSheets} more sheet{otherSheets > 1 ? 's' : ''}</button></div>
                          )}
                        </td>
                        <td><span className="tag a">Excel</span></td>
                      </>
                    ) : (
                      <>
                        <td>
                          <select value={e.meta.delimiter} onChange={(ev) => onChange(e.meta.id, { delimiter: ev.target.value })} disabled={e.meta.status === 'reading'}>
                            {DELIMS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={e.meta.encoding} onChange={(ev) => onChange(e.meta.id, { encoding: ev.target.value as Encoding })} disabled={e.meta.status === 'reading'}>
                            {ENCODINGS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
                          </select>
                        </td>
                      </>
                    )}
                    <td>
                      {e.meta.status === 'ready' && <span className="tag good">Ready</span>}
                      {e.meta.status === 'reading' && <span className="tag none">Reading</span>}
                      {e.meta.status === 'converting' && <span className="tag watch">Converting</span>}
                      {e.meta.status === 'counting' && <span className="tag watch">Counting</span>}
                      {e.meta.status === 'error' && <span className="tag bad">Error</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {e.csv && <button className="btn sm" title="Save this sheet as a CSV file (e.g. for the offline tool)" onClick={() => onSaveCsv(e.meta.id)}>CSV</button>}{' '}
                      <button className="btn icon sm" title="Remove" onClick={() => onRemove(e.meta.id)} disabled={e.meta.status === 'converting'}><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row small muted" style={{ marginTop: 8, justifyContent: 'space-between' }}>
            <span>{list.length} file(s) · {fmtBytes(totalSize)}</span>
            <span>Total rows: <b>{totalRows === undefined ? 'counting…' : fmtNum(totalRows)}</b></span>
          </div>
        </>
      )}
    </div>
  );
}

export default function Upload(p: Props) {
  return (
    <>
      <div className="grid2">
        <Zone {...p} group="A" />
        <Zone {...p} group="B" />
      </div>
      <Note kind="ok">
        <b>Your files never leave this computer.</b> They are read directly from disk by this page; nothing is uploaded to GitHub or any
        server. Rows are counted in the background. Excel sheets are converted to a temporary CSV copy inside the browser (deleted when you
        remove the file, clear temporary data or reopen the app); dates become YYYY-MM-DD and numbers are written without thousands separators.
      </Note>
    </>
  );
}
