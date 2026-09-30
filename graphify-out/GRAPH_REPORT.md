# Graph Report - C:\Users\Jhuniel\OneDrive - SY3 Energy Maintenance Services Corporation\Desktop\COSTING APP\Automating Costing tool  (2026-07-14)

## Corpus Check
- Corpus is ~45,829 words - fits in a single context window. You may not need a graph.

## Summary
- 265 nodes · 394 edges · 15 communities (14 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Shell & Cloud Integrations|App Shell & Cloud Integrations]]
- [[_COMMUNITY_AIML Cost Intelligence|AI/ML Cost Intelligence]]
- [[_COMMUNITY_SharePoint DB & Auth Persistence|SharePoint DB & Auth Persistence]]
- [[_COMMUNITY_Core App & CE Workflow|Core App & CE Workflow]]
- [[_COMMUNITY_Brand Identity & CE Concept|Brand Identity & CE Concept]]
- [[_COMMUNITY_SharePoint API Layer|SharePoint API Layer]]
- [[_COMMUNITY_Helpers & Data Factories|Helpers & Data Factories]]
- [[_COMMUNITY_Automated Test Suite|Automated Test Suite]]
- [[_COMMUNITY_PWA Manifest|PWA Manifest]]
- [[_COMMUNITY_AI Provider Integration|AI Provider Integration]]
- [[_COMMUNITY_MSAL Auth & Audit Log|MSAL Auth & Audit Log]]
- [[_COMMUNITY_UI Constants & Tokens|UI Constants & Tokens]]
- [[_COMMUNITY_Admin & Setup Panels|Admin & Setup Panels]]
- [[_COMMUNITY_Service Worker Cache|Service Worker Cache]]

## God Nodes (most connected - your core abstractions)
1. `SHIC Cost Estimator` - 40 edges
2. `SOW Library (Inline Data)` - 15 edges
3. `assert()` - 13 edges
4. `LS` - 12 edges
5. `run()` - 12 edges
6. `getSiteURL()` - 11 edges
7. `App()` - 8 edges
8. `scanFolder()` - 8 edges
9. `spDigest()` - 8 edges
10. `assertEqual()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `SHIC Cost Estimator` --uses_as_icon--> `icon.svg (App Icon)`  [EXTRACTED]
  index.html → icon.svg
- `CE Text Mark (Black on Orange)` --symbolizes--> `Cost Estimate (CE)`  [EXTRACTED]
  icon.svg → index.html
- `Orange Rounded Rectangle Background` --uses--> `Brand Color #F0A429 (Orange)`  [EXTRACTED]
  icon.svg → index.html
- `SHIC Brand Label` --contributes_to--> `App Brand Identity`  [EXTRACTED]
  index.html → icon.svg
- `App()` --indirect_call--> `AdminPanel()`  [INFERRED]
  src/App.js → src/components/AdminPanel.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **** — project_file_analyzer, xlsx_js, pdf_js, mammoth_js [INFERRED]
- **** — shic_cost_estimator, react18, react_dom18, comp_app, root_div [EXTRACTED]
- **** — msal_browser, microsoft_identity, sharepoint, onedrive [EXTRACTED]

## Communities (15 total, 1 thin omitted)

### Community 0 - "App Shell & Cloud Integrations"
Cohesion: 0.06
Nodes (36): Local Files Analyzer Tab, OneDrive Analyzer Tab, Azure App Registration (Client ID), cdnjs CDN, AdminPanel Component, App Component (src/App.js), CompanyDBPanel Component, FbSetupPanel Component (+28 more)

### Community 1 - "AI/ML Cost Intelligence"
Cohesion: 0.10
Nodes (33): Anomaly Detection (ML), Cost Predictor (ML), ML Insights Panel, Rate Suggester (ML), Scope Matcher (ML), ML Training Data (from project files), analyzeLocalFiles(), cleanNum() (+25 more)

### Community 2 - "SharePoint DB & Auth Persistence"
Cohesion: 0.08
Nodes (21): _checkAutoBackup(), _d(), dbCreateUser(), dbDeleteHistory(), dbGetHistory(), dbGetML(), dbGetUsers(), dbSaveHistory() (+13 more)

### Community 3 - "Core App & CE Workflow"
Cohesion: 0.08
Nodes (23): App(), AppBoundary, LoginPage(), autoSetupSP(), RegisterPage(), spAddField(), spCreateList(), ResTab() (+15 more)

### Community 4 - "Brand Identity & CE Concept"
Cohesion: 0.10
Nodes (21): Brand Color #F0A429 (Orange), Cost Estimate (CE), App Brand Identity, CE Text Mark (Black on Orange), Orange Rounded Rectangle Background, icon.svg (App Icon), SHIC Brand Label, SOW: Boiler Protection (+13 more)

### Community 5 - "SharePoint API Layer"
Cohesion: 0.27
Nodes (14): getSiteURL(), getSPConfig(), getSPToken(), _loadMSAL(), SITE_URL, spAddAttachment(), spDelete(), spDeleteAttachment() (+6 more)

### Community 6 - "Helpers & Data Factories"
Cohesion: 0.19
Nodes (13): BLANK_INFO, BLANK_MISC, hashPassword(), _hex(), mkMiscRow(), mkMP(), mkRes(), mkVeh() (+5 more)

### Community 7 - "Automated Test Suite"
Cohesion: 0.37
Nodes (15): assert(), assertApprox(), assertEqual(), run(), testBlankInfo(), testCeCfg(), testCeTabs(), testFactories() (+7 more)

### Community 8 - "PWA Manifest"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, scope, short_name (+2 more)

### Community 9 - "AI Provider Integration"
Cohesion: 0.24
Nodes (5): callAI(), getApiKey(), getAzureEndpoint(), getProvider(), PROVIDERS

### Community 10 - "MSAL Auth & Audit Log"
Cohesion: 0.31
Nodes (7): Microsoft Identity Platform, MSAL Browser (Microsoft Auth), auditLog(), checkLoginRate(), clearLoginRate(), _lrKey(), recordLoginFail()

### Community 11 - "UI Constants & Tokens"
Cohesion: 0.22
Nodes (7): AppContext, CS, INP, LBL, MONO, TDS, THS

### Community 12 - "Admin & Setup Panels"
Cohesion: 0.33
Nodes (3): AdminPanel(), CompanyDBPanel(), FbSetupPanel()

## Knowledge Gaps
- **71 isolated node(s):** `name`, `short_name`, `description`, `start_url`, `scope` (+66 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SHIC Cost Estimator` connect `App Shell & Cloud Integrations` to `AI/ML Cost Intelligence`, `SharePoint DB & Auth Persistence`, `Core App & CE Workflow`, `Brand Identity & CE Concept`, `SharePoint API Layer`, `Helpers & Data Factories`, `Automated Test Suite`, `AI Provider Integration`, `MSAL Auth & Audit Log`, `UI Constants & Tokens`?**
  _High betweenness centrality (0.776) - this node is a cross-community bridge._
- **Why does `SOW Library (Inline Data)` connect `Brand Identity & CE Concept` to `App Shell & Cloud Integrations`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `LS` connect `SharePoint DB & Auth Persistence` to `MSAL Auth & Audit Log`, `Core App & CE Workflow`, `Admin & Setup Panels`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **What connects `name`, `short_name`, `description` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Cloud Integrations` be split into smaller, more focused modules?**
  _Cohesion score 0.06258890469416785 - nodes in this community are weakly interconnected._
- **Should `AI/ML Cost Intelligence` be split into smaller, more focused modules?**
  _Cohesion score 0.0990990990990991 - nodes in this community are weakly interconnected._
- **Should `SharePoint DB & Auth Persistence` be split into smaller, more focused modules?**
  _Cohesion score 0.07507507507507508 - nodes in this community are weakly interconnected._