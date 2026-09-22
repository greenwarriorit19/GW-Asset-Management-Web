import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../data/context';
import { PageHead, Section, Status, fmtDateTime, fmtMoney } from '../components/ui';
import { today, addMonths } from '../data/store';

function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="bars">
      {data.map(d => (
        <div className="row" key={d.label}>
          <span title={d.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
          <div className="track"><div className="fill" style={{ width: `${(d.value / max) * 100}%` }} /></div>
          <span className="num">{d.value}</span>
        </div>
      ))}
      {data.length === 0 && <span className="muted">No data.</span>}
    </div>
  );
}

export function Dashboard() {
  const { db, store } = useStore();
  const nav = useNavigate();
  const m = store.metrics();
  const in30 = addMonths(today(), 1);
  const warranty = db.assets.filter(a => a.warrantyExpiry && a.warrantyExpiry >= today() && a.warrantyExpiry <= in30 && !['Disposed', 'Retired'].includes(a.status));
  const scope = store.can('asset.view_all') ? 'Organisation-wide' : store.can('asset.view_department') ? `Department: ${store.deptName(store.currentUser.departmentId)}` : 'My assets';
  const mine = store.visibleAssets();

  return (
    <>
      <PageHead crumbs="Overview" title="Asset Dashboard" actions={<span className="muted small">{scope} · {fmtDateTime(new Date().toISOString())}</span>} />

      {store.currentUser.role === 'employee' ? (
        <Section title="Assets assigned to me" compact>
          <table className="data"><thead><tr><th>Asset ID</th><th>Asset</th><th>Serial / IMEI</th><th>Condition</th><th>Status</th></tr></thead>
            <tbody>{mine.length === 0 && <tr><td className="empty" colSpan={5}>No assets are currently assigned to you.</td></tr>}
              {mine.map(a => <tr key={a.id} className="clickable" onClick={() => nav(`/assets/${a.id}`)}><td className="mono">{a.id}</td><td>{a.name}</td><td>{[a.serialNumber, a.imei].filter(Boolean).join(' / ')}</td><td>{a.condition}</td><td><Status value={a.status} /></td></tr>)}
            </tbody></table>
        </Section>
      ) : null}

      <div className="grid cols-6" style={{ marginBottom: 18 }}>
        <div className="metric"><div className="label">Total Assets</div><div className="value">{m.total}</div><div className="sub">{fmtMoney(m.totalValue)} purchase value</div></div>
        <div className="metric"><div className="label">Available</div><div className="value">{m.available}</div><div className="sub">Ready to issue</div></div>
        <div className="metric"><div className="label">Assigned</div><div className="value">{m.assigned}</div><div className="sub">With custodians</div></div>
        <div className="metric warn"><div className="label">Under Repair</div><div className="value">{m.underRepair}</div><div className="sub">{db.repairs.filter(r => r.status !== 'Completed').length} open repair jobs</div></div>
        <div className="metric alert"><div className="label">Damaged</div><div className="value">{m.damaged}</div><div className="sub">Incident reports required</div></div>
        <div className="metric alert"><div className="label">Lost</div><div className="value">{m.lost}</div><div className="sub">Under investigation</div></div>
        <div className="metric"><div className="label">Retired</div><div className="value">{m.retired}</div><div className="sub">Awaiting disposal</div></div>
        <div className="metric"><div className="label">Disposed</div><div className="value">{m.disposed}</div><div className="sub">History retained</div></div>
        <div className="metric"><div className="label">Total Purchase Value</div><div className="value" style={{ fontSize: 18 }}>{fmtMoney(m.totalValue)}</div><div className="sub">Excluding disposed</div></div>
        <div className="metric warn"><div className="label">Warranty Expiring</div><div className="value">{m.warrantyExpiring}</div><div className="sub">Within 30 days</div></div>
        <div className="metric"><div className="label">Pending Approvals</div><div className="value">{m.pendingApprovals.length}</div><div className="sub"><Link to="/approvals">Open approvals queue</Link></div></div>
      </div>

      <div className="grid cols-3">
        <Section title="Assets by Category"><Bars data={m.byCategory} /></Section>
        <Section title="Assets by Department"><Bars data={m.byDepartment} /></Section>
        <Section title="Assets by Location"><Bars data={m.byLocation} /></Section>
      </div>

      <div className="grid cols-2">
        <Section title="Recent Transactions" compact right={<Link to="/reports?r=history" className="small">Full history</Link>}>
          <table className="data">
            <thead><tr><th>Date</th><th>Type</th><th>Asset</th><th>Status</th><th>By</th></tr></thead>
            <tbody>{m.recent.map(t => (
              <tr key={t.id} className="clickable" onClick={() => nav(`/assets/${t.assetId}`)}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(t.date)}</td><td>{t.type.replace('_', ' ')}</td><td className="mono">{t.assetId}</td><td><Status value={t.statusAfter} /></td><td>{t.performedByName}</td>
              </tr>))}</tbody>
          </table>
        </Section>
        <div>
          <Section title="Warranty Expiring Soon" compact>
            <table className="data"><thead><tr><th>Asset</th><th>Expiry</th><th>Custodian</th></tr></thead>
              <tbody>{warranty.length === 0 && <tr><td className="empty" colSpan={3}>No warranties expire in the next 30 days.</td></tr>}
                {warranty.map(a => <tr key={a.id} className="clickable" onClick={() => nav(`/assets/${a.id}`)}><td><span className="mono">{a.id}</span> {a.name}</td><td>{a.warrantyExpiry}</td><td>{store.employeeName(a.custodianEmployeeId)}</td></tr>)}
              </tbody></table>
          </Section>
        </div>
      </div>
    </>
  );
}
