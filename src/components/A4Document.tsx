import { useEffect, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { fmtDate } from './ui';

export const COMPANY = 'Green Warrior Solid Waste Management';
export const COMPANY_SUB = 'Asset Management System';

/** Exports a DOM element as PDF (A4) or PNG using html2canvas + jsPDF, loaded on demand. */
export async function exportElement(el: HTMLElement, filename: string, kind: 'pdf' | 'png') {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  if (kind === 'png') {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png'); a.download = `${filename}.png`; a.click();
    return;
  }
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  const imgH = (canvas.height * pageW) / canvas.width;
  let y = 0;
  const img = canvas.toDataURL('image/jpeg', 0.95);
  // Slice tall documents across pages.
  while (y < imgH) {
    if (y > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, -y, pageW, imgH);
    y += pageH;
  }
  pdf.save(`${filename}.pdf`);
}

export function useQr(text: string | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!text) return;
    QRCode.toDataURL(text, { margin: 0, width: 160, color: { dark: '#0B1F3A', light: '#FFFFFF' } }).then(setUrl).catch(() => setUrl(undefined));
  }, [text]);
  return url;
}

export function assetUrl(assetId: string) {
  return `${window.location.origin}${window.location.pathname}#/assets/${assetId}`;
}

interface Props {
  title: string;
  reference: string;
  date: string;
  qrText?: string;
  children: ReactNode;
  signatures?: { label: string; value?: string; date?: string; sub?: string }[];
  acknowledgement?: string;
  filename?: string;
}

/** A4 corporate document with print / PDF / image export. */
export function A4Document({ title, reference, date, qrText, children, signatures, acknowledgement, filename }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const qr = useQr(qrText);
  const [busy, setBusy] = useState(false);
  const name = filename ?? reference;
  const doExport = async (kind: 'pdf' | 'png') => {
    if (!ref.current) return;
    setBusy(true);
    try { await exportElement(ref.current, name, kind); } finally { setBusy(false); }
  };
  return (
    <div className="print-only-doc">
      <div className="doc-toolbar no-print">
        <button className="btn" onClick={() => window.print()}>Print</button>
        <button className="btn" disabled={busy} onClick={() => doExport('pdf')}>{busy ? 'Working…' : 'Download PDF'}</button>
        <button className="btn" disabled={busy} onClick={() => doExport('png')}>Export Image</button>
      </div>
      <div className="a4" ref={ref}>
        <div className="doc-header">
          <div>
            <div className="company">{COMPANY}<small>{COMPANY_SUB}</small></div>
          </div>
          <div>
            <div className="doc-title">{title}</div>
            <div className="doc-meta">Reference No: <b>{reference}</b><br />Document Date: <b>{fmtDate(date)}</b></div>
            {qr && <div className="qr"><img src={qr} alt="QR" /></div>}
          </div>
        </div>
        <div className="doc-body">{children}</div>
        {(acknowledgement || signatures) && (
          <div className="doc-bottom">
            {acknowledgement && <div className="ack">{acknowledgement}</div>}
            {signatures && (
              <div className={`signatures ${signatures.length === 3 ? 'cols-3' : ''}`}>
                {signatures.map((s, i) => (
                  <div className="sig" key={i}>
                    <div className="val">{s.value ?? ''}</div>
                    <div className="name">{s.label}</div>
                    {s.sub && <div className="muted">{s.sub}</div>}
                    <div>Date: {s.date ? fmtDate(s.date) : '____________'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="doc-footer">
          <span>{COMPANY} — Controlled document; retain per records policy.</span>
          <span>{reference} · Generated {new Date().toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  );
}

/** Simple key/value grid used inside documents. */
export function Fields({ rows, cols = 2 }: { rows: [string, ReactNode][]; cols?: 1 | 2 }) {
  const chunks: [string, ReactNode][][] = [];
  for (let i = 0; i < rows.length; i += cols) chunks.push(rows.slice(i, i + cols));
  return (
    <table className="fields"><tbody>
      {chunks.map((c, i) => (
        <tr key={i}>
          {c.map(([k, v], j) => <FieldPair key={j} k={k} v={v} />)}
          {c.length < cols && <><td className="k" /><td /></>}
        </tr>
      ))}
    </tbody></table>
  );
}
function FieldPair({ k, v }: { k: string; v: ReactNode }) {
  return <><td className="k">{k}</td><td>{v === undefined || v === null || v === '' ? <span className="blank" /> : v}</td></>;
}
