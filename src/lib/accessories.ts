/** "Charger - Moto 33W x2, Back case" → [{ name: 'Charger', model: 'Moto 33W', qty: 2 }, { name: 'Back case', model: '', qty: 1 }] */
export function parseAccessories(text?: string): { name: string; model: string; qty: number }[] {
  return (text ?? '').split(/[,\n;]+/).map(s => s.trim()).filter(Boolean).map(item => {
    let qty = 1;
    const m = item.match(/\s*[x×]\s*(\d+)\s*$/i);
    if (m) { qty = Number(m[1]); item = item.slice(0, m.index).trim(); }
    const parts = item.split(/\s+[-–:]\s+|\s*\(|\)\s*$/).map(p => p.trim()).filter(Boolean);
    return { name: parts[0] ?? item, model: parts.slice(1).join(' '), qty };
  });
}
export const roman = (n: number) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'][n - 1] ?? String(n);
