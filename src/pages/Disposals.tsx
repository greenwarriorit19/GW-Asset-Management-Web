import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/context';
import type { Disposal, Attachment } from '../data/types';
import { today } from '../data/store';
import { PageHead, Section, Status, DataTable, Input, Select, TextArea, ReadOnly, FileInput, Modal, useAction, fmtDate, fmtMoney, type Column } from '../components/ui';
import { DisposalDoc } from '../documents';
import { ApprovalBox } from './Approvals';

export function Disposals() {
  const { db, store } = useStore();
  const [sp, setSp] = useSearchParams();
  const { run, Messages } = useAction();
  const [open, setOpen] = useState<Disposal | null>(null);

  const [assetId, setAssetId] = useState(sp.get('asset') ?? '');
  const [rReason, setRReason] = useState('');
  const [tech, setTech] = useState('');
  const [reason, setReason] = useState('');
  const candidates = db.assets.filter(a => !['Retired', 'Disposed'].includes(a.status) && !db.disposals.some(d => d.assetId === a.id && d.status !== 'Rejected'));

  const [d, setD] = useState({ dataErased: false, disposalMethod: 'E-Waste Vendor' as Disposal['disposalMethod'], disposalDate: today(), disposalValue: '', disposalVendor: '', reason: '' });
  const [proof, setProof] = useState<Attachment>();
  const [cert, setCert] = useState<Attachment>();

  const rows = db.disposals.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const columns: Column<Disposal>[] = [
    { key: 'id', header: 'Reference', render: x => <span className="mono">{x.id}</span> },
    { key: 'asset', header: 'Asset', render: x => <><span className="mono">{x.assetId}</span> {store.asset(x.assetId)?.name}</> },
    { key: 'value', header: 'Purchase Cost', num: true, render: x => fmtMoney(store.asset(x.assetId)?.purchaseCost) },
    { key: 'reason', header: 'Retirement Reason', render: x => x.retirementReason },
    { key: 'ret', header: 'Retirement', render: x => <Status value={x.retirementApproval} /> },
    { key: 'method', header: 'Disposal', render: x => x.disposalMethod ? `${x.disposalMethod} · ${fmtDate(x.disposalDate)}` : '—' },
    { key: 'disp', header: 'Authorization', render: x => <Status value={x.disposalApproval} /> },
    { key: 'status', header: 'Status', render: x => <Status value={x.status} /> },
  ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const x = run(() => store.startRetirement({ assetId, retirementReason: rReason, technicalRecommendation: tech, reason }), 'Retirement recommended; awaiting management approval.');
    if (x) { setAssetId(''); setRReason(''); setTech(''); setReason(''); setSp({}); setOpen(x); }
  };
  const current = open ? db.disposals.find(x => x.id === open.id) ?? open : null;

  return (
    <>
      <PageHead crumbs="Lifecycle" title="Retirement and Disposal" />
      <Messages />
      {store.can('disposal.request') && (
        <form onSubmit={submit}>
          <Section title="Recommend Retirement">
            <div className="rule-note">Rule 10: retirement needs management approval; disposal needs authorization plus a supporting document (proof of sale/scrap/e-waste certificate). Data must be securely erased for devices holding data. The permanent history stays accessible after disposal.</div>
            <div className="form-grid cols-4">
              <Select label="Asset" required span={2} value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="Select asset…" options={candidates.map(a => ({ value: a.id, label: `${a.id} — ${a.name} · ${a.status}` }))} />
              <ReadOnly label="Reference" value={store.nextRef('DSP', db.disposals)} />
              <ReadOnly label="Purchase Cost / Date" value={assetId ? `${fmtMoney(store.asset(assetId)?.purchaseCost)} · ${fmtDate(store.asset(assetId)?.purchaseDate)}` : ''} />
              <TextArea label="Reason for Retirement" required span={2} value={rReason} onChange={e => setRReason(e.target.value)} />
              <TextArea label="Technical Recommendation" span={2} value={tech} onChange={e => setTech(e.target.value)} />
              <Input label="Remarks" required span={2} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" type="submit" disabled={!assetId}>Submit for Approval</button></div>
          </Section>
        </form>
      )}
      <Section title="Retirement & Disposal Register" compact><DataTable rows={rows} columns={columns} onRowClick={x => setOpen(x)} /></Section>

      {current && (
        <Modal title={`${current.id} — ${current.status}`} onClose={() => setOpen(null)} wide>
          {current.status === 'Retirement Pending' && store.can('disposal.approve_retirement') && <ApprovalBox title="Management Approval of Retirement" onDecide={(ok, c) => run(() => store.approveRetirement(current.id, ok, c), ok ? 'Asset retired.' : 'Retirement rejected.')} />}
          {current.status === 'Retired' && store.can('disposal.record') && (
            <Section title="Record Disposal">
              <div className="form-grid">
                <Select label="Disposal Method" required value={d.disposalMethod ?? ''} onChange={e => setD({ ...d, disposalMethod: e.target.value as Disposal['disposalMethod'] })} options={['Sale', 'Scrap', 'Donation', 'Return to Lessor', 'E-Waste Vendor', 'Write Off'].map(m => ({ value: m, label: m }))} />
                <Input label="Disposal Date" type="date" required value={d.disposalDate} onChange={e => setD({ ...d, disposalDate: e.target.value })} />
                <Input label="Realised Value (₹)" type="number" min={0} value={d.disposalValue} onChange={e => setD({ ...d, disposalValue: e.target.value })} />
                <Input label="Vendor / Recipient" value={d.disposalVendor} onChange={e => setD({ ...d, disposalVendor: e.target.value })} />
                <FileInput label="Proof of Disposal (required)" accept=".pdf,image/*" tag={current.assetId} kind="Disposal-Proof" onChange={setProof} required />
                <FileInput label="Data Erasure Certificate" accept=".pdf,image/*" tag={current.assetId} kind="Data-Erasure-Certificate" onChange={setCert} />
                <label className="checkbox field"><input type="checkbox" checked={d.dataErased} onChange={e => setD({ ...d, dataErased: e.target.checked })} /> Data securely erased (mandatory for phones, laptops, tablets, storage)</label>
                <Input label="Remarks" required span={2} value={d.reason} onChange={e => setD({ ...d, reason: e.target.value })} />
              </div>
              <div className="btn-row end" style={{ marginTop: 10 }}><button className="btn primary" onClick={() => run(() => store.recordDisposal(current.id, { ...d, disposalValue: d.disposalValue ? Number(d.disposalValue) : undefined, disposalProof: proof, dataErasureCertificate: cert }), 'Disposal recorded; awaiting authorization.')}>Submit Disposal for Authorization</button></div>
            </Section>
          )}
          {current.status === 'Disposal Pending' && store.can('disposal.approve') && <ApprovalBox title="Authorize Disposal (Management)" approveLabel="Authorize Disposal" onDecide={(ok, c) => run(() => store.approveDisposal(current.id, ok, c), ok ? 'Asset disposed. History retained.' : 'Disposal not authorized.')} />}
          <DisposalDoc disposal={current} />
        </Modal>
      )}
    </>
  );
}
