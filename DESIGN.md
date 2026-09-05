# DESIGN SYSTEM SPECIFICATION: Synercore Cost Estimator v3.8
# File: DESIGN.md (Target: Claude Code / Repository Root)

## 1. Executive Summary & Design Principles
- **Product**: Synercore Cost Estimator (Industrial Engineering & EPC Quotation Platform).
- **Aesthetic**: Mission-critical precision software, high information density, tabular ergonomics, and institutional reliability.
- **Dual Theme Support**: 
  - `Dark Slate Mode`: High-contrast, reduced eye-strain for engineering and long-hour cost estimation.
  - `Executive Light Mode`: Crisp, high-clarity layout optimized for executive reviews, client presentations, and PDF/print exports.
- **Form Factor**: Desktop workstation (1920x1080 / 1440x900 viewport baseline) with persistent financial summary rail.

---

## 2. Dual-Theme CSS Variables Architecture

Use `data-theme="dark"` (default) and `data-theme="light"` on the root `<html>` or wrapper element:

```css
:root, [data-theme="dark"] {
  /* Surfaces & Backgrounds */
  --bg-canvas: #060e20;
  --bg-surface: #0b1326;
  --bg-surface-elevated: #131b2e;
  --bg-surface-card: #172036;
  --bg-input: #060e20;
  --border-subtle: #1e293b;
  --border-strong: #334155;

  /* Typography */
  --text-primary: #ffffff;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  /* Accents & States */
  --brand-primary: #4f46e5;
  --brand-primary-hover: #4338ca;
  --brand-accent: #f59e0b; /* Amber warning / highlight */
  --accent-cyan: #38bdf8;
  --status-success: #10b981;
  --status-warning: #f59e0b;
  --status-danger: #ef4444;

  /* Shadows & Highlights */
  --card-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.4);
  --highlight-gradient: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
}

[data-theme="light"] {
  /* Surfaces & Backgrounds */
  --bg-canvas: #f8fafc;
  --bg-surface: #ffffff;
  --bg-surface-elevated: #f1f5f9;
  --bg-surface-card: #ffffff;
  --bg-input: #f8fafc;
  --border-subtle: #e2e8f0;
  --border-strong: #cbd5e1;

  /* Typography */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;

  /* Accents & States */
  --brand-primary: #4f46e5;
  --brand-primary-hover: #4338ca;
  --brand-accent: #d97706;
  --accent-cyan: #0284c7;
  --status-success: #059669;
  --status-warning: #d97706;
  --status-danger: #dc2626;

  /* Shadows & Highlights */
  --card-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03);
  --highlight-gradient: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
}
3. Typography & Spacing Hierarchy
Font Family: Plus Jakarta Sans, system sans-serif.
Monospace / Financial Digits: JetBrains Mono, ui-monospace for tabular numeric values (₱, currency, multipliers, document codes).
Type Scale:
Grand Total Display: 28px - 32px | Extra Bold (800) | Tabular numbers
H1 / Section Titles: 16px - 18px | Bold (700)
Card Header / Group Label: 13px - 14px | Semi-bold (600) | Uppercase tracking 0.05em
Form Input / Table Row: 13px | Regular (400) / Medium (500)
Captions, Chips & Badges: 11px | Medium (500) | Tracking 0.02em
Border Radii:
Buttons, pills, inputs: rounded-md (6px)
Cards, audit strips, tables: rounded-xl (10px / 12px)
4. Master Layout Architecture
The application layout follows a 2-tier fixed header + asymmetric 2-column workspace:

+-----------------------------------------------------------------------------------------------+
| TOP BAR: [Logo v3.8] [Execution Mode: Onsite | ShopWorks | Supply] [+New] [Save] [Export] [Theme Toggle] [User] |
+-----------------------------------------------------------------------------------------------+
| SUB-NAV TABS: Project Info | SOW | SOW Breakdown | Manpower | Tools | Materials | PPE | Misc | Summary | Masterlist |
+-----------------------------------------------------------------------+-----------------------+
| MAIN CONTENT WORKSPACE (~72% width)                                   | RIGHT FINANCIAL RAIL  |
|                                                                       | (~28% width - Sticky) |
| [Audit Strip / Pre-Flight Validation Bar]                             |                       |
|                                                                       | [Live Cost Totals]    |
| [Dynamic Tab Views]:                                                  |  - Mobilization       |
|  - Tab 1: Project Info & Document Ingestion & Scope Builder          |  - Demobilization     |
|  - Tab 2: Manpower Shift Groups & Philippine Statutory Loading (C.7)  |  - Manpower Subtotal  |
|  - Tab 3: Summary Commercial Matrix & Multi-Tier Signatories         |  - Tools & Equipment  |
|                                                                       |  - Materials / PPE    |
|                                                                       | [Grand Total Card]    |
|                                                                       | [Quick Labor Rates]   |
|                                                                       | [AI Engine Status]    |
+-----------------------------------------------------------------------+-----------------------+
| FOOTER STATUS BAR: Database Sync | Engine Build | Doc Security Level                         |
+-----------------------------------------------------------------------------------------------+
5. Screen & Tab Component Specifications
1. Header & Navigation Component
Mode Selector: Segmented pill group (Onsite, ShopWorks, Supply). Active item highlighted with brand accent.
Actions:
Primary button: + New Project / + New Estimation (bg-primary text-white).
Secondary buttons: Save [Ctrl+S], Export CE / PDF.
Theme Switcher: Segmented toggle containing Executive Light (Sun icon) and Dark Slate (Moon icon).
User & Environment: Operator name (Jhuniel Ubana / OWNER), status pip (online #10b981), and quick actions (Password, Sign Out).
2. Tab: Manpower & Shift Costing (Dark Slate Reference)
Operational Shift Groups:
Shifts: Regular Day Shift (1x), Regular Night Shift (1.25x), Sunday Day (1.3x), Sunday Night (1.625x), Legal Holiday Day (2.0x), Legal Holiday Night (2.5x).
Shift Bar Controls: Shift title, multiplier pill, active worker count, subtotal display, + Add Role, Sync Rates with Masterlist, and Consolidate Crew.
Shift Table Columns: Role / Position (dropdown from Masterlist), Pax (qty), Days, OT Hrs/Day, Day Rate (₱), Scope Task Link, Row Total, Action (delete).
Philippine Statutory DOLE Loading Matrix (C.7):
Table computing standard mandated labor costs: Monthly Rate, 13th Month Pay, SSS, HDMF & PHIC, SIL & ECC, and Incentive.
Subtotal footer calculating statutory overhead markup (standard 20% - 26%).
3. Tab: Commercial Summary & Approval Matrix (Executive Light Reference)
Pre-Flight Audit Bar:
Alert banner showing flagged items (2 Items to Fix, 2 to Review).
Itemized pills (e.g. Missing project scope summary Fix →, Client name is blank Fix →, Margin is 0% Adjust →).
Action button: Run AI Auto-Fill & Suggestion.
Executive Review Card:
Project meta header: Project Type (ONSITE TURBINE REPAIR), Date Issued, Client (APRI - ABOITIZ POWER RENEWABLE INC.), Material Class, Duration.
Commercial Summary Matrix:
Cost center rows: Mobilization, Demobilization, Direct Manpower, Tools & Equipment, Materials & Consumables, PPE & Safety, Miscellaneous Buffer.
Columns: Cost Group, Internal Verification Notes, Computed Cost (₱), % Total Share.
Margin & Selling Price Row: Editable input for Target Profit Margin % with real-time computed Selling Price (VAT Excl.).
Corporate Signatories & Authority Routing Grid:
4-column signature hierarchy:
Prepared By (Cost Estimator) - Status: Signed with timestamp & e-sign hash.
Checked By (Cost Supervisor) - Status: Signed.
Noted By (TSG Head) - Status: Interactive button (Sign as TSG Head).
Executive Approval (Operations Director) - Status: Awaiting Final Review.
4. Right Sticky Financial Rail
Live Totals Breakdown: Synchronized list of all cost buckets in Philippine Peso format (₱#,##0.00).
Grand Total Estimate Highlight Card:
Dark mode: Illuminated deep violet gradient (from-indigo-950 to-slate-900) with high-contrast amber/white currency text.
Light mode: Deep navy card (#0b1326 text-white) with high-contrast amber grand total (#f59e0b).
Sub-indicator: Selling Target: ₱#,##0.00 or Within Target Margin.
Standard Quick Labor Rates Reference: Quick-lookup list (Lead Electrical ₱1,200, Electrician ₱900, Instrumentation ₱1,000, Mechanical ₱1,300, Welder ₱1,100).
Telemetry & Engine Status: AI provider status, saved database estimates count (988), and build index.