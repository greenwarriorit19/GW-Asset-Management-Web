import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './data/context';
import type { Permission } from './data/store';
import { Alert } from './components/ui';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { AssetInventory, AssetDetail, AssetRegister } from './pages/Assets';
import { HandoverList, HandoverNew, HandoverDetail } from './pages/Handovers';
import { Returns } from './pages/Returns';
import { Tracker } from './pages/Tracker';
import { Transfers } from './pages/Transfers';
import { Repairs } from './pages/Repairs';
import { Incidents } from './pages/Incidents';
import { Disposals } from './pages/Disposals';
import { Reports } from './pages/Reports';
import { AuditLogPage, DocumentsPage, UsersPage, SettingsPage } from './pages/Governance';
import { Login } from './pages/Login';

/** Route guard: the menu hides pages a role cannot use; this stops them being opened by URL as well. */
function Guard({ perm, children }: { perm: Permission | Permission[]; children: React.ReactElement }) {
  const { store } = useStore();
  const ok = (Array.isArray(perm) ? perm : [perm]).some(p => store.can(p));
  return ok ? children : <Alert kind="error">Your role does not have access to this page.</Alert>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// HashRouter so QR codes (…/#/assets/GW-AST-MOB-0001) resolve on any static host without rewrite rules.
/** Shows the loading / sign-in screens until the shared database is ready. */
function Gate({ children }: { children: React.ReactElement }) {
  const { session } = useStore();
  if (session.phase === 'loading') return <div className="login-wrap"><div className="login"><h2>Connecting to the database…</h2><p className="muted small">Loading asset records from Supabase.</p></div></div>;
  if (session.phase === 'login') return <Login />;
  return children;
}

export default function App() {
  return (
    <StoreProvider>
      <Gate>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/track" element={<Tracker />} />
            <Route path="/assets" element={<AssetInventory />} />
            <Route path="/assets/register" element={<Guard perm="asset.register"><AssetRegister /></Guard>} />
            <Route path="/assets/:id" element={<AssetDetail />} />
            <Route path="/handovers" element={<HandoverList />} />
            <Route path="/handovers/new" element={<Guard perm="handover.create"><HandoverNew /></Guard>} />
            <Route path="/handovers/:id" element={<HandoverDetail />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/repairs" element={<Repairs />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/disposals" element={<Guard perm={['disposal.request', 'disposal.approve', 'reports.view']}><Disposals /></Guard>} />
            <Route path="/reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
            <Route path="/documents" element={<Guard perm="documents.view"><DocumentsPage /></Guard>} />
            <Route path="/audit" element={<Guard perm="audit.view"><AuditLogPage /></Guard>} />
            <Route path="/users" element={<Guard perm="users.manage"><UsersPage /></Guard>} />
            <Route path="/settings" element={<Guard perm="settings.manage"><SettingsPage /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      </Gate>
    </StoreProvider>
  );
}
