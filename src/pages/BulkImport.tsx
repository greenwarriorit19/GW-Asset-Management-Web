import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/context';
import { PageHead, Section, Status, Input, useAction, fmtMoney } from '../components/ui';
import { ASSET_COLUMNS, EMPLOYEE_COLUMNS, downloadTemplate, readSheet, validateAssets, validateEmployees, type Parsed, type AssetRow, type EmployeeRow } from '../lib/bulk';

type Kind = 'assets' | 'employees';

/** Bulk Import — Excel template download, upload, validated preview and one-shot import. */
export function BulkImport() {
  const { db, store } = useStore();
  const { run, Messages } = useAction();
  const [kind, setKind] = useState<Kind>('assets');
  const [file, setFile] = useState<File | null>(null);
  const [assets, setAssets] = useState<Parsed<AssetRow>[] | null>(null);
  const [emps, setEmps] = useState<Parsed<EmployeeRow>[] | null>(null);
  const [reason, setReason] = useState('Bulk registration from Excel');
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const canAssets = store.can('asset.register'), canEmps = store.can('settings.manage');

  const parse = async (f: File, k: Kind) => {
    setParseErr(null); setDone(null); setAssets(null); setEmps(null);
    try {
      const { rows } = await readSheet(f, k === 'assets' ? 'Assets' : 'Employees');
      if (!rows.length) { setParseErr('The sheet has no data rows (keep the header row, delete the example row, add your records).'); return; }
      if (k === 'assets') setAssets(validateAssets(rows, db)); else setEmps(validateEmployees(rows, db));
    } catch (e) { setParseErr(e instanceof Error ? e.message : String(e)); }
  };
  const rows = kind === 'assets' ? assets : emps;
  const valid = rows?.filter(r => r.errors.length === 0) ?? [];
  const invalid = rows?.filter(r => r.errors.length > 0) ?? [];

  const doImport = () => {
    if (kind === 'assets') {
      const ids = run(() => store.importAssets(valid.map(r => (r as Parsed<AssetRow>).data), reason), undefined);
      if (ids) { setDone(ids); setAssets(null); setFile(null); }
    } else {
      const ids = run(() => store.importEmployees(valid.map(r => (r as Parsed<EmployeeRow>).data), reason), undefined);
      if (ids) { setDone(ids); setEmps(null); setFile(null); }
    }
  };

  return (
    <>
      <PageHead crumbs="Assets" title="Bulk Import (Excel)" actions={<button className="btn" onClick={() => downloadTemplate(db)}>Download Excel Template</button>} />
      <Messages />
      {done && <div className="alert success">{done.length} {kind === 'assets' ? 'asset(s) registered' : 'employee(s) added'}.{kind === 'assets' && <> First: <Link to={`/assets/${done[0]}`} className="mono">{done[0]}</Link>{done.length > 1 && <> · last: <Link to={`/assets/${done[done.length - 1]}`} className="mono">{done[done.length - 1]}</Link></>}. <Link to="/assets">Open inventory</Link></>}</div>}

      <div className="tabs">
        {canAssets && <button className={kind === 'assets' ? 'active' : ''} onClick={() => { setKind('assets'); setAssets(null); setEmps(null); setFile(null); }}>Assets</button>}
        {canEmps && <button className={kind === 'employees' ? 'active' : ''} onClick={() => { setKind('employees'); setAssets(null); setEmps(null); setFile(null); }}>Employees</button>}
      </div>

      <div className="grid cols-2">
        <Section title="1. Prepare the file">
          <ol className="small" style={{ lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
            <li><b>Download Excel Template</b> (top right). It has an <b>Assets</b> sheet, an <b>Employees</b> sheet and an <b>Instructions</b> sheet listing every column and the valid categories, departments and locations.</li>
            <li>Fill one record per row under the headers. Delete the example row. Categories, departments and locations can be entered by code (<span className="mono">MOB</span>) or name (<span className="mono">Mobile Phone</span>).</li>
            <li>Dates as <span className="mono">YYYY-MM-DD</span> or Excel date cells; cost as a plain number.</li>
            <li>Upload here. Every row is checked (required fields, duplicate serial / IMEI / SIM against the register and within the file, unknown codes). Only valid rows are imported; errors are listed per row so you can fix and re-upload the rest.</li>
          </ol>
        </Section>
        <Section title={`2. Upload — ${kind === 'assets' ? 'Assets' : 'Employees'} sheet`}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="field"><label>Excel file (.xlsx / .xls / .csv)</label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) parse(f, kind); }} /></div>
            <Input label="Reason (recorded on every imported record)" required value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          {parseErr && <div className="alert error" style={{ marginTop: 10 }}>{parseErr}</div>}
          {rows && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <span><b>{rows.length}</b> row(s) read from {file?.name}: <Status value={`${valid.length} valid`} /> {invalid.length > 0 && <Status value={`${invalid.length} with errors`} />}</span>
              <button className="btn primary" disabled={valid.length === 0 || reason.trim().length < 3} onClick={doImport}>Import {valid.length} valid row(s)</button>
            </div>
          )}
        </Section>
      </div>

      {rows && (
        <Section title="3. Preview" compact right={<span className="muted small">Rows with errors are skipped; fix them in Excel and upload again.</span>}>
          <div className="table-wrap"><table className="data">
            {kind === 'assets' ? (
              <>
                <thead><tr><th>Row</th><th>Status</th><th>Asset</th><th>Category</th><th>Serial / IMEI / SIM</th><th>Supplier / Invoice</th><th>Cost</th><th>Department / Location</th><th>Condition</th><th>Errors</th></tr></thead>
                <tbody>{(rows as Parsed<AssetRow>[]).map(r => (
                  <tr key={r.line} style={r.errors.length ? { background: 'var(--danger-bg)' } : undefined}>
                    <td>{r.line}</td><td><Status value={r.errors.length ? 'Error' : 'Valid'} /></td>
                    <td>{r.data.name}<div className="muted small">{r.data.manufacturer} {r.data.model}</div></td><td>{store.catName(r.data.categoryId) === '—' ? <span className="muted">?</span> : store.catName(r.data.categoryId)}</td>
                    <td className="mono">{[r.data.serialNumber, r.data.imei, r.data.sim].filter(Boolean).join(' / ')}</td><td>{r.data.supplierName}<div className="muted small">{r.data.invoiceNumber}</div></td>
                    <td className="num">{fmtMoney(r.data.purchaseCost)}</td><td>{store.deptName(r.data.departmentId)} / {store.locName(r.data.locationId)}</td><td>{r.data.condition}</td>
                    <td style={{ color: 'var(--danger)' }}>{r.errors.join('; ')}</td>
                  </tr>))}</tbody>
              </>
            ) : (
              <>
                <thead><tr><th>Row</th><th>Status</th><th>Employee ID</th><th>Name</th><th>Designation</th><th>Department / Location</th><th>Joined</th><th>Contact</th><th>Errors</th></tr></thead>
                <tbody>{(rows as Parsed<EmployeeRow>[]).map(r => (
                  <tr key={r.line} style={r.errors.length ? { background: 'var(--danger-bg)' } : undefined}>
                    <td>{r.line}</td><td><Status value={r.errors.length ? 'Error' : 'Valid'} /></td><td className="mono">{r.data.employeeCode ?? <span className="muted">auto</span>}</td>
                    <td>{r.data.name}</td><td>{r.data.designation}</td><td>{store.deptName(r.data.departmentId)} / {store.locName(r.data.workLocationId)}</td><td>{r.data.dateOfJoining}</td><td>{[r.data.mobile, r.data.email].filter(Boolean).join(' · ')}</td>
                    <td style={{ color: 'var(--danger)' }}>{r.errors.join('; ')}</td>
                  </tr>))}</tbody>
              </>
            )}
          </table></div>
        </Section>
      )}

      <Section title="Columns in the template" compact>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>#</th><th>Column</th><th>Rule</th></tr></thead>
          <tbody>{(kind === 'assets' ? ASSET_COLUMNS : EMPLOYEE_COLUMNS).map((c, i) => <tr key={c[0]}><td>{i + 1}</td><td>{c[0]}</td><td className="muted">{c[1]}</td></tr>)}</tbody>
        </table></div>
      </Section>
    </>
  );
}
