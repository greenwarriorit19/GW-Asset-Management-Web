// Excel / PDF export of tabular report data.
export type Row = Record<string, string | number | undefined | null>;

export async function exportRows(name: string, rows: Row[], kind: 'xlsx' | 'pdf' | 'csv', title?: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${name}-${stamp}`;
  if (kind === 'xlsx' || kind === 'csv') {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    // Column widths from content.
    const keys = rows.length ? Object.keys(rows[0]) : [];
    ws['!cols'] = keys.map(k => ({ wch: Math.min(48, Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    XLSX.writeFile(wb, `${filename}.${kind}`);
    return;
  }
  const { jsPDF } = await import('jspdf');
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const landscape = keys.length > 6;
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageW = landscape ? 297 : 210, pageH = landscape ? 210 : 297, margin = 12;
  const colW = (pageW - margin * 2) / Math.max(1, keys.length);
  let y = margin;
  const header = () => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(11, 31, 58);
    pdf.text('GREEN WARRIOR SOLID WASTE MANAGEMENT', margin, y); y += 5;
    pdf.setFontSize(9); pdf.text(title ?? name, margin, y);
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(90, 100, 112);
    pdf.text(`Generated ${new Date().toLocaleString('en-IN')} · ${rows.length} rows · Internal use only`, pageW - margin, y, { align: 'right' }); y += 3;
    pdf.setDrawColor(11, 31, 58); pdf.line(margin, y, pageW - margin, y); y += 5;
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(40, 40, 40);
    keys.forEach((k, i) => pdf.text(k.toUpperCase(), margin + i * colW + 1, y, { maxWidth: colW - 2 }));
    y += 2; pdf.setDrawColor(200, 205, 215); pdf.line(margin, y, pageW - margin, y); y += 4;
    pdf.setFont('helvetica', 'normal');
  };
  header();
  for (const r of rows) {
    const cells = keys.map(k => String(r[k] ?? ''));
    const lines = Math.max(1, ...cells.map(c => pdf.splitTextToSize(c, colW - 2).length));
    const h = lines * 3.2 + 1.5;
    if (y + h > pageH - margin) { pdf.addPage(); y = margin; header(); }
    cells.forEach((c, i) => pdf.text(pdf.splitTextToSize(c, colW - 2), margin + i * colW + 1, y));
    y += h;
    pdf.setDrawColor(225, 228, 233); pdf.line(margin, y - 1, pageW - margin, y - 1);
  }
  pdf.save(`${filename}.pdf`);
}
