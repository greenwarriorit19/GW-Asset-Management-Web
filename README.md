# Green Warrior — Asset Management & Employee Handover System

Digital replacement for handwritten asset records. Tracks every company asset through its full lifecycle —
Purchase → Registration → Assignment → Handover → Transfer → Return → Repair → Retirement → Disposal —
with a permanent, append-only transaction history.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (static; deploy to Netlify / S3 / any web server)
npm test           # automated test suite (35 tests: every business rule, workflow and role)
```

This build runs entirely in the browser with data persisted to `localStorage`. It starts **empty (live)** with the
master lists and a Super Admin login; **Master Data → Data** can load a demonstration dataset for training and
clear it again, and has a JSON backup. Attachments upload to a shared Google Drive folder once
**Master Data → Google Drive** is configured (OAuth Client ID). Use the user selector in the top bar to switch roles.

For a multi-user deployment, apply `supabase/schema.sql` to a PostgreSQL/Supabase project and replace the
persistence in `src/data/store.ts` (`load()` / `commit()`) with API calls — the business rules, reference
numbering and document templates are independent of storage.

## Structure

| Path | Purpose |
|---|---|
| `src/data/types.ts` | Domain model (assets, transactions, handovers, returns, transfers, repairs, incidents, verifications, disposals, approvals, documents, audit log) |
| `src/data/store.ts` | Business rules, role permissions, reference numbering, append-only transactions & audit |
| `src/data/seed.ts` | Demonstration dataset |
| `src/pages/` | 14 modules (Dashboard, Asset Tracker, Registration, Inventory, Handover, Return, Transfer, Repair, Incidents, Disposal, Reports, Users, Audit Log, Documents) |
| `src/documents/` | A4 document templates — Registration, Handover, Return (with Inspection), Transfer, Repair, Lost/Damaged, Retirement & Disposal, Asset History, Employee Clearance |
| `src/components/A4Document.tsx` | Print / PDF / PNG export and QR generation |
| `src/lib/export.ts` | Excel / CSV / PDF report export |
| `supabase/schema.sql` | 16-table PostgreSQL schema with immutability triggers, reference sequences, RLS and reporting views |

## Business rules enforced (`src/data/store.ts`)

1. Unique Asset ID per category: `GW-AST-MOB-0001`
2. Serial / IMEI / SIM duplicate check on registration and edit
3. One active custodian per asset; assets are *Reserved* while a handover awaits approval
4. Only *Available* assets can be issued
5. Every issue / return / transfer / repair / incident / verification / retirement / disposal writes a separate transaction
6. Transactions and audit entries are never edited or deleted
7. The employee must sign the acknowledgement before status becomes *Assigned*
8. Returns go to *Under Inspection*; inspection decides Available / Under Repair / Damaged (auto-opens an incident)
9. Lost/damaged requires an incident report, investigation and approval
10. Disposal requires management authorization and an uploaded supporting document
11. Every action records user, role, date-time and reason
12. Documents print to A4 and export to PDF / PNG
13. QR codes open `#/assets/<Asset ID>`
14. Reports export to Excel, CSV and PDF

## Reference numbers

`GW-AST-<CAT>-0001` · `GW-HO-YYYYMM-0001` · `GW-RT-…` · `GW-TR-…` · `GW-RP-…` · `GW-INC-…` · `GW-DSP-…` · `GW-VF-…`

## Roles

Super Admin · Asset Administrator · Department Head (scoped to own department) · Employee (own assets, acknowledge, report, request) · Auditor / Management (read-only). The full permission matrix is on **Users & Permissions**.
