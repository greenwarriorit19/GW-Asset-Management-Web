import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { SearchSelect } from './SearchSelect';
import { useStore } from '../data/context';
import type { Permission } from '../data/store';

interface NavItem { to: string; label: string; perm?: Permission | Permission[]; badge?: number }

export function Layout() {
  const { db, store, session } = useStore();
  const [open, setOpen] = useState(false);
  const u = store.currentUser;
  const has = (p?: Permission | Permission[]) => !p || (Array.isArray(p) ? p.some(x => store.can(x)) : store.can(p));

  const pendingFor = (type: string) => db.approvals.filter(a => a.decision === 'Pending Approval' && a.entityType === type).length;
  const myAck = db.handovers.filter(h => h.status === 'Awaiting Acknowledgement' && h.employeeId === u.employeeId).length;

  const groups: { title: string; items: NavItem[] }[] = [
    { title: 'Overview', items: [
      { to: '/', label: 'Dashboard' },
    ] },
    { title: 'Assets', items: [
      { to: '/track', label: 'Asset Tracker' },
      { to: '/assets', label: 'Asset Inventory' },
      { to: '/assets/register', label: 'Asset Registration', perm: 'asset.register' },
      { to: '/assets/import', label: 'Bulk Import (Excel)', perm: ['asset.register', 'settings.manage'] },
    ] },
    { title: 'Custody', items: [
      { to: '/handovers', label: 'Asset Assigned to Employee', badge: myAck || pendingFor('Handover') || undefined },
      { to: '/returns', label: 'Asset Return' },
      { to: '/transfers', label: 'Asset Transfer', badge: pendingFor('Transfer') || undefined },
    ] },
    { title: 'Lifecycle', items: [
      { to: '/repairs', label: 'Repair & Maintenance' },
      { to: '/incidents', label: 'Lost or Damaged', badge: pendingFor('Incident') || undefined },
      { to: '/disposals', label: 'Retirement & Disposal', perm: ['disposal.request', 'disposal.approve', 'reports.view'] },
    ] },
    { title: 'Governance', items: [
      { to: '/reports', label: 'Reports & Export', perm: 'reports.view' },
      { to: '/documents', label: 'Document Management', perm: 'documents.view' },
      { to: '/audit', label: 'Audit Log', perm: 'audit.view' },
      { to: '/users', label: 'Users & Permissions', perm: 'users.manage' },
      { to: '/settings', label: 'Master Data', perm: 'settings.manage' },
    ] },
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setOpen(o => !o)} aria-label="Menu">☰</button>
        <div className="brand">Green Warrior<small>Asset Management System</small></div>
        <div className="spacer" />
        <div className="user">
          {session.mode === 'supabase' && <span className={`sync sync-${session.sync.state}`} title={session.sync.message ?? ''}>{{ idle: 'Live', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[session.sync.state]}</span>}
          <span>{u.name} · {store.roleName(u.role)}</span>
          {session.mode === 'local'
            ? <SearchSelect className="topbar-ss" value={u.id} onChange={e => store.switchUser(e.target.value)} title="Switch signed-in user (browser-local mode)"
                options={db.users.filter(x => x.active).map(x => ({ value: x.id, label: `${x.name} — ${store.roleName(x.role)}` }))} />
            : <button className="btn sm signout" onClick={() => store.logout()}>Sign out</button>}
        </div>
      </header>
      <nav className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        {groups.map(g => {
          const items = g.items.filter(i => has(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.title}>
              <div className="group">{g.title}</div>
              {items.map(i => (
                <NavLink key={i.to} to={i.to} end={i.to === '/' || i.to === '/assets'} className={({ isActive }) => isActive ? 'active' : ''}>
                  {i.label}{i.badge ? <span className="badge">{i.badge}</span> : null}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <main className="main">{session.mode === 'supabase' && session.sync.state === 'error' && <div className="alert error">{session.sync.message} — the change is still on screen; check the connection and retry the action.</div>}<Outlet /></main>
    </div>
  );
}
