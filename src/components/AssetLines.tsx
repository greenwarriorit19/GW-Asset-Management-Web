import { Fragment, useState, type ReactNode } from 'react';
import { useStore } from '../data/context';
import { CONDITIONS, type Condition, type HandoverItem } from '../data/types';
import { SearchSelect } from './ui';
import { parseAccessories, serializeAccessories, roman } from '../lib/accessories';

type Acc = { name: string; model: string; qty: number };

interface Props {
  items: HandoverItem[];
  setItems: (items: HandoverItem[]) => void;
  /** Shows a Remove button on each asset row (assets can only be dropped while the assignment is being raised). */
  allowRemove?: boolean;
  empty?: ReactNode;
}

/**
 * The asset lines of an assignment: one row per asset with its accessories as indented sub-rows.
 * Shared by the assignment form and the edit dialog.
 */
export function AssetLines({ items, setItems, allowRemove, empty }: Props) {
  const { store } = useStore();
  // Accessory rows are held here so a blank row can exist before it is named.
  const [accRows, setAccRows] = useState<Record<string, Acc[]>>(() => Object.fromEntries(items.map(it => [it.assetId, parseAccessories(it.accessories)])));
  const upd = (i: number, p: Partial<HandoverItem>) => setItems(items.map((it, j) => j === i ? { ...it, ...p } : it));
  const rowsFor = (assetId: string, fallback: string) => accRows[assetId] ?? parseAccessories(fallback);
  const setRows = (i: number, assetId: string, list: Acc[]) => { setAccRows(r => ({ ...r, [assetId]: list })); upd(i, { accessories: serializeAccessories(list) }); };

  return (
    <div className="table-wrap">
      <table className="data assign">
        <thead><tr><th className="ix">#</th><th>Asset ID / Accessories</th><th>Asset Type</th><th>Make and Model</th><th>Serial / IMEI / SIM</th><th>Condition</th><th>Qty</th><th>Remarks</th><th /></tr></thead>
        <tbody>
          {items.length === 0 && empty !== undefined && <tr><td className="empty" colSpan={9}>{empty}</td></tr>}
          {items.map((it, i) => { const a = store.asset(it.assetId); const acc = rowsFor(it.assetId, it.accessories);
            const setAcc = (list: Acc[]) => setRows(i, it.assetId, list);
            return (
            <Fragment key={it.assetId}>
              <tr className="assign-main">
                <td className="ix"><span className="ix-dot">{i + 1}</span></td>
                <td><span className="asset-chip mono">{it.assetId}</span><div className="muted small">{a?.name}</div></td>
                <td>{store.catName(a?.categoryId)}</td>
                <td>{a ? `${a.manufacturer} ${a.model}` : '—'}</td>
                <td className="mono">{a && [a.serialNumber, a.imei, a.sim].filter(Boolean).join(' / ') || <span className="muted">—</span>}</td>
                <td><SearchSelect className="tb" style={{ minWidth: 118 }} value={it.condition} onChange={e => upd(i, { condition: e.target.value as Condition })} options={CONDITIONS.map(c => ({ value: c, label: c }))} /></td>
                <td><input className="ai qty" type="number" min={1} value={it.quantity} onChange={e => upd(i, { quantity: Number(e.target.value) })} /></td>
                <td><input className="ai" value={it.remarks} placeholder="Optional note" onChange={e => upd(i, { remarks: e.target.value })} /></td>
                <td className="act">{allowRemove && <button type="button" className="btn sm rm" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>}</td>
              </tr>
              {acc.map((x, j) => (
                <tr key={j} className="assign-acc">
                  <td className="ix"><span className="ix-sub">{roman(j + 1)}</span></td>
                  <td><span className="acc-tag">Accessory</span></td>
                  <td><input className="ai" value={x.name} placeholder="e.g. Charger" onChange={e => setAcc(acc.map((y, k) => k === j ? { ...y, name: e.target.value } : y))} /></td>
                  <td><input className="ai" value={x.model} placeholder="Model / details" onChange={e => setAcc(acc.map((y, k) => k === j ? { ...y, model: e.target.value } : y))} /></td>
                  <td className="dash">—</td><td className="dash">—</td>
                  <td><input className="ai qty" type="number" min={1} value={x.qty} onChange={e => setAcc(acc.map((y, k) => k === j ? { ...y, qty: Math.max(1, Number(e.target.value) || 1) } : y))} /></td>
                  <td />
                  <td className="act"><button type="button" className="btn sm rm" onClick={() => setAcc(acc.filter((_, k) => k !== j))}>Remove</button></td>
                </tr>
              ))}
              <tr className="assign-add"><td /><td colSpan={8}><button type="button" className="btn sm add-acc" onClick={() => setAcc([...acc, { name: '', model: '', qty: 1 }])}>+ Add accessory</button></td></tr>
            </Fragment>); })}
        </tbody>
      </table>
    </div>
  );
}
