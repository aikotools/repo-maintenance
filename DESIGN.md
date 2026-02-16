# Repo Maintenance Tool - Design Document

## Vision

Ein **Web-basiertes Dashboard** zur Verwaltung von Multi-Repo-Strukturen. Inspiriert von VS Code's Explorer-Sidebar, aber spezialisiert auf die Orchestrierung von Dutzenden zusammenhängender Repositories.

**Name**: `@xhubio-saas/repo-maintenance` (Arbeitstitel: **RepoHub**)

---

## Tech-Stack

| Komponente | Technologie | Begründung |
|-----------|-------------|------------|
| **Backend** | Node.js + Express + tRPC | Konsistent mit Kernel-Stack, tRPC für Type-Safety |
| **Frontend** | React + Tailwind CSS 4 | Konsistent mit Frontend-Stack |
| **Echtzeit** | WebSocket (Socket.io) | Live-Updates für CI-Status, Git-Operationen, Logs |
| **Graph-Visualisierung** | D3.js oder React Flow | Interaktive Dependency-Graphs |
| **Diff-Viewer** | react-diff-viewer-continued | Git-Diff-Darstellung |
| **Terminal-Output** | xterm.js | Für Live-Logs von Build/Test-Prozessen |
| **Persistenz** | JSON-Dateien in `.repoMaintenance/` | Kein DB nötig, alles im Dateisystem |
| **Git-Operationen** | simple-git (npm) | Programmatischer Git-Zugriff |
| **GitHub API** | Octokit / `gh` CLI | CI-Status, PR-Management |

---

## Projekt-Konfiguration

### `.repoMaintenance/project.json`

```jsonc
{
  "name": "saas-coding-kernel",
  "rootFolder": "/Users/.../saas-coding-kernel",
  "npmOrganizations": ["@xhubio-saas"],
  "githubOrganizations": ["xhubio"],
  "parallelTasks": 6,
  "defaultBranch": "main",

  // Automatisch generiert/aktualisiert durch "Refresh"
  "lastRefresh": "2026-02-15T10:30:00Z",

  // Optionale Einstellungen
  "settings": {
    "autoRefreshInterval": 300,          // Sekunden, 0 = deaktiviert
    "ciPollInterval": 15,                // Sekunden für CI-Status-Polling
    "ciTimeout": 600,                    // Max. Wartezeit auf CI in Sekunden
    "commitMessagePrefix": "",           // z.B. "chore: " für alle Auto-Commits
    "notifications": {
      "ciFailure": true,
      "ciSuccess": false,
      "uncommittedWarning": true
    }
  }
}
```

### `.repoMaintenance/repos.json` (Auto-generiert)

```jsonc
{
  "repos": {
    "kernel": {
      "path": "repo/core/kernel",
      "domain": "core",
      "type": "kernel",                // kernel | kernel-plugin | frontend-plugin | lib | app | tool | mock
      "npmPackage": "@xhubio-saas/kernel",
      "githubRepo": "xhubio/kernel",
      "currentVersion": "2.3.2",
      "branch": "main",
      "lastCommit": "abc1234",
      "dependencies": ["kernel-plugin-interface"],    // Interne Dependencies
      "dependents": ["saas-invoice-backend", "..."],  // Wer hängt von mir ab
      "hasUncommittedChanges": false,
      "ciStatus": "success"            // success | failure | pending | unknown
    }
    // ... alle weiteren Repos
  },
  "domains": {
    "core": { "path": "repo/core/", "repoCount": 11 },
    "invoice": { "path": "repo/invoice/", "repoCount": 53 },
    // ...
  }
}
```

### `.repoMaintenance/dependency-graph.json` (Auto-generiert)

```jsonc
{
  "generatedAt": "2026-02-15T10:30:00Z",
  "nodes": [
    { "id": "lib-invoice-interface", "domain": "invoice", "type": "lib", "layer": 0 },
    { "id": "lib-invoice-common", "domain": "invoice", "type": "lib", "layer": 1 },
    // ...
  ],
  "edges": [
    { "from": "lib-invoice-common", "to": "lib-invoice-interface", "version": "^1.0.0" },
    // ...
  ],
  "layers": {
    "0": ["lib-invoice-interface", "lib-accounting-core"],  // Keine internen Deps
    "1": ["lib-invoice-common", "lib-invoice-inbound-interface"],
    "2": ["lib-invoice-outbound-de", "lib-invoice-outbound-at", "..."],
    // ...
  }
}
```

### `.repoMaintenance/history/` (Operation Logs)

```
.repoMaintenance/
├── project.json
├── repos.json
├── dependency-graph.json
└── history/
    ├── 2026-02-15T10-30-00_cascade_lib-invoice-interface.json
    ├── 2026-02-15T11-00-00_bulk-commit.json
    └── ...
```

---

## UI-Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  RepoHub    [Refresh] [Settings]                         user@org      │
├──────────┬──────────────────────────────────────────────────────────────┤
│          │                                                              │
│ SIDEBAR  │  MAIN CONTENT AREA                                          │
│          │                                                              │
│ ▼ core/  │  (wechselt je nach Kontext)                                 │
│   kernel │                                                              │
│   kern.. │  - Dashboard (Übersicht)                                    │
│   front. │  - Repo-Detail (Changes, Diff, Actions)                    │
│   ...    │  - Dependency Graph (interaktiv)                            │
│          │  - Cascade Planner                                          │
│ ▼ invoi. │  - Bulk Operations                                         │
│   lib-i. │  - CI Monitor                                               │
│   lib-i. │  - Operation History                                        │
│   ...    │                                                              │
│          │                                                              │
│ ▶ custo. │                                                              │
│ ▶ produ. │                                                              │
│ ▶ accou. │                                                              │
│          │──────────────────────────────────────────────────────────────│
│          │  BOTTOM PANEL (toggle)                                      │
│          │  - Live-Log-Output (xterm.js)                               │
│          │  - Running Operations                                       │
│          │  - CI Status Feed                                           │
├──────────┴──────────────────────────────────────────────────────────────┤
│  STATUS BAR: 137 repos | 3 uncommitted | 2 CI running | Last: 10:30   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Sidebar - Repo-Tree

### Darstellung

```
REPOSITORIES                    [↻] [⊕] [≡]
─────────────────────────────────
▼ core/ (11)                    ●   ← grün = alles clean
  ├── kernel                    2.3.2
  ├── kernel-plugin-interface   1.0.1
  ├── frontend-kernel           ◆   ← gelb = uncommitted changes
  ├── frontend-ui-components    ◆
  └── ...
▼ invoice/ (53)                 ◆   ← gelb wenn mind. 1 Kind dirty
  ├── kernel-plugin-invoice     1.2.0
  ├── lib-invoice-interface     ◆   ← uncommitted
  │   └── ⚡ 12 dependents affected
  ├── outbound/ (14)
  │   ├── lib-invoice-outbound-de  ◆
  │   ├── lib-invoice-outbound-at
  │   └── ...
  ├── inbound/ (14)
  │   └── ...
  └── validators/ (12)
      └── ...
▶ customer/ (2)                 ●
▶ product/ (2)                  ●
▶ accounting/ (30)              ◆
▶ apps/ (7)                     ●
```

### Features

- **Farbige Statusanzeige**: Grün (clean), Gelb (uncommitted), Rot (CI failed), Grau (nicht geklont)
- **Domain-Gruppierung**: Collapsible Domains als Top-Level-Nodes
- **Sub-Gruppierung**: `outbound/`, `inbound/`, `validators/`, `gov-api/` als Unter-Gruppen
- **Versions-Anzeige**: Aktuelle npm-Version neben dem Repo-Namen
- **Impact-Badge**: Bei uncommitted Changes Anzahl betroffener Dependents
- **Kontextmenü** (Rechtsklick):
  - Open in Terminal
  - Open in VS Code
  - Show Dependencies
  - Show Dependents
  - Commit & Push
  - Run Tests
  - View CI Status
- **Filter**:
  - Nur uncommitted
  - Nur CI-failed
  - Nach Typ (lib / kernel-plugin / frontend-plugin / app)
  - Textsuche

---

## Hauptansichten

### 1. Dashboard (Startseite)

```
┌────────────────────────────────────────────────────────────────┐
│  DASHBOARD                                                      │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   137    │  │    5     │  │    2     │  │    1     │       │
│  │  Repos   │  │ Changed  │  │ CI Run   │  │ CI Fail  │       │
│  │  total   │  │  repos   │  │  ning    │  │  ed      │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
│  UNCOMMITTED CHANGES                              [Commit All]  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Repo                  │ Branch │ Files │ Impact │ Action  │  │
│  ├───────────────────────┼────────┼───────┼────────┼─────────│  │
│  │ ◆ lib-invoice-interf. │ main   │ 3     │ 12 ↓   │ [▶][📋]│  │
│  │ ◆ frontend-kernel     │ feat/x │ 1     │ 0 ↓    │ [▶][📋]│  │
│  │ ◆ lib-accounting-core │ main   │ 5     │ 8 ↓    │ [▶][📋]│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  RECENT OPERATIONS                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 10:30  Cascade: lib-invoice-interface → 12 repos  ✓ Done │  │
│  │ 09:15  Bulk test: accounting/* → 30 repos         ✓ Done │  │
│  │ 08:00  Sync all repos                             ✓ Done │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  DEPENDENCY OVERVIEW (Mini-Graph)                               │
│  [Klick für Vollansicht]                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         ┌─────┐                                           │  │
│  │    ┌────│ IF  │────┐                                      │  │
│  │    │    └─────┘    │                                      │  │
│  │  ┌─┴──┐         ┌──┴─┐                                   │  │
│  │  │ CM │         │ IB │                                    │  │
│  │  └─┬──┘         └──┬─┘                                   │  │
│  │    │    ...         │                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 2. Repo-Detail-Ansicht

Wird angezeigt wenn man ein Repo im Sidebar anklickt.

```
┌────────────────────────────────────────────────────────────────┐
│  lib-invoice-interface                              v1.0.1     │
│  repo/invoice/lib-invoice-interface                            │
│                                                                  │
│  [Commit & Push]  [Run Tests]  [Open in VS Code]  [Terminal]  │
│                                                                  │
│  ┌─ Info ──────────────────────────────────────────────────┐   │
│  │ Branch: main  │  npm: @xhubio-saas/lib-invoice-interface│   │
│  │ CI: ✓ passing │  Last Release: 2026-02-14              │   │
│  │ Dependents: 12 repos                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  TABS: [Changes] [Dependencies] [Dependents] [CI History]     │
│                                                                  │
│  ── Changes Tab ──────────────────────────────────────────     │
│                                                                  │
│  Modified Files (3):                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ [✓] M  src/types.ts                              [Diff] │  │
│  │ [✓] M  src/validators/invoice-validator.ts       [Diff] │  │
│  │ [✓] A  src/utils/format-helpers.ts               [Diff] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ── Inline Diff ──────────────────────────────────────────     │
│  src/types.ts                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  10  │ export interface Invoice {                         │  │
│  │  11  │   id: string                                       │  │
│  │- 12  │   amount: number                                   │  │
│  │+ 12  │   amount: Decimal                                  │  │
│  │+ 13  │   currency: CurrencyCode                           │  │
│  │  14  │   customer: CustomerRef                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ── Dependencies Tab ─────────────────────────────────────     │
│  (keine internen Dependencies)                                  │
│                                                                  │
│  ── Dependents Tab ───────────────────────────────────────     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Layer 1 (direkt):                                         │  │
│  │   lib-invoice-common (^1.0.0)                             │  │
│  │   lib-invoice-inbound-interface (^1.0.0)                  │  │
│  │                                                           │  │
│  │ Layer 2 (transitiv):                                      │  │
│  │   lib-invoice-outbound-de, -at, -ch, ... (14 repos)      │  │
│  │   lib-invoice-inbound-de, -at, -ch, ... (14 repos)       │  │
│  │                                                           │  │
│  │ Layer 3:                                                  │  │
│  │   kernel-plugin-invoice-outbound                          │  │
│  │   kernel-plugin-invoice-inbound                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 3. Dependency Graph (Interaktiv)

```
┌────────────────────────────────────────────────────────────────┐
│  DEPENDENCY GRAPH                                               │
│                                                                  │
│  Filter: [All ▼]  Focus: [___________]  Depth: [3 ▼]          │
│  View:   (●) Full  ( ) Affected Only  ( ) Domain: [____▼]     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │   ┌─── core ──────────────────────────────────────┐      │  │
│  │   │                                                │      │  │
│  │   │  ┌──────────┐     ┌─────────────────┐         │      │  │
│  │   │  │  kernel   │◄────│ kernel-plugin-* │         │      │  │
│  │   │  └──────────┘     └────────┬────────┘         │      │  │
│  │   │                            │                   │      │  │
│  │   └────────────────────────────┼───────────────────┘      │  │
│  │                                │                           │  │
│  │   ┌─── invoice ────────────────┼───────────────────┐      │  │
│  │   │                            │                   │      │  │
│  │   │  ┌────────────────┐   ┌────┴─────────────┐    │      │  │
│  │   │  │ lib-inv-interf │──►│ kp-inv-outbound  │    │      │  │
│  │   │  └───────┬────────┘   └──────────────────┘    │      │  │
│  │   │          │                                     │      │  │
│  │   │  ┌───────┴────────┐                           │      │  │
│  │   │  │ lib-inv-common │                           │      │  │
│  │   │  └───────┬────────┘                           │      │  │
│  │   │          │                                     │      │  │
│  │   │  ┌───────┴──────────────────────────────┐     │      │  │
│  │   │  │ outbound-de  outbound-at  outb-ch ..│     │      │  │
│  │   │  └──────────────────────────────────────┘     │      │  │
│  │   │                                                │      │  │
│  │   └────────────────────────────────────────────────┘      │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Legende: ◆ uncommitted  ● clean  ✗ CI failed                 │
│  [Export PNG]  [Export JSON]                                     │
└────────────────────────────────────────────────────────────────┘
```

**Interaktions-Features:**
- **Klick auf Node**: Zeigt Repo-Details als Tooltip/Sidebar
- **Hover auf Edge**: Zeigt Versions-Constraint
- **Focus-Mode**: Ein Repo auswählen → nur dessen Dependencies/Dependents zeigen
- **Affected-Mode**: Uncommitted Repos hervorheben + alle betroffenen Downstream-Repos einfärben
- **Domain-Gruppierung**: Repos gleicher Domain werden visuell gruppiert (wie Nx composite nodes)
- **Zoom/Pan**: Standard-Graphinteraktion
- **Drag-to-rearrange**: Nodes verschieben für bessere Übersicht

### 4. Cascade Planner

Die **Killer-Feature**-Ansicht. Zeigt den Plan für eine kaskadierende Aktualisierung.

```
┌────────────────────────────────────────────────────────────────┐
│  CASCADE PLANNER                                                │
│                                                                  │
│  Source: lib-invoice-interface (uncommitted changes)            │
│  Estimated time: ~25 min  │  Total repos: 13                   │
│                                                                  │
│  [Start Cascade]  [Dry Run]  [Edit Plan]                       │
│                                                                  │
│  ── Execution Plan (topologisch sortiert) ────────────────     │
│                                                                  │
│  Step 1: Source                                      Sequential │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ○ lib-invoice-interface                                   │  │
│  │   Actions: test → commit → push → wait CI                │  │
│  │   Commit msg: [feat: update invoice types          ]      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 2: Direct dependents                           Sequential │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ○ lib-invoice-common                                      │  │
│  │ ○ lib-invoice-inbound-interface                           │  │
│  │   Actions: update dep → test → commit → push → wait CI   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 3: Outbound libs                                Parallel │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ○ lib-invoice-outbound-de     ┐                           │  │
│  │ ○ lib-invoice-outbound-at     │ max 6 parallel            │  │
│  │ ○ lib-invoice-outbound-ch     │                           │  │
│  │ ○ lib-invoice-outbound-fr     │                           │  │
│  │ ○ ... (10 more)               ┘                           │  │
│  │   Actions: update dep → test → commit → push → wait CI   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 4: Kernel plugins                              Sequential │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ○ kernel-plugin-invoice-outbound                          │  │
│  │ ○ kernel-plugin-invoice-inbound                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ── Live Progress (nach Start) ───────────────────────────     │
│                                                                  │
│  ✓ lib-invoice-interface      committed + pushed    CI: ✓      │
│  ✓ lib-invoice-common         committed + pushed    CI: ✓      │
│  ⟳ lib-invoice-outbound-de   waiting for CI...     CI: ⟳     │
│  ⟳ lib-invoice-outbound-at   pushing...            CI: -      │
│  ○ lib-invoice-outbound-ch   queued                 CI: -      │
│  ○ ...                                                          │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

### 5. Bulk Operations

```
┌────────────────────────────────────────────────────────────────┐
│  BULK OPERATIONS                                                │
│                                                                  │
│  Scope: [All repos ▼]  Domain: [invoice ▼]  Type: [lib ▼]     │
│                                                                  │
│  Quick Actions:                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐ │
│  │ pnpm install│ │  pnpm test │ │  pnpm build│ │ git pull    │ │
│  └────────────┘ └────────────┘ └────────────┘ └─────────────┘ │
│                                                                  │
│  Custom Command:                                                │
│  ┌─────────────────────────────────────┐  [Run]                │
│  │ npx ncu -u "@xhubio-saas/*"        │                        │
│  └─────────────────────────────────────┘                        │
│                                                                  │
│  ── Results ──────────────────────────────────────────────     │
│                                                                  │
│  Running "pnpm test" on 14 repos (6 parallel)                  │
│                                                                  │
│  ✓ lib-invoice-outbound-de    12.3s  [Coverage: 94%] [Log]    │
│  ✓ lib-invoice-outbound-at     8.1s  [Coverage: 91%] [Log]    │
│  ✗ lib-invoice-outbound-fr    15.2s  [FAILED]        [Log]    │
│  ⟳ lib-invoice-outbound-ch    running...                       │
│  ○ lib-invoice-outbound-es    queued                            │
│  ○ ...                                                          │
│                                                                  │
│  ── Expanded Log (lib-invoice-outbound-fr) ───────────────     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ FAIL  tests/converter.test.ts                             │  │
│  │   ✗ should convert FR-specific fields (12ms)              │  │
│  │     Expected: "TVA"                                       │  │
│  │     Received: "VAT"                                       │  │
│  │                                                           │  │
│  │ Tests: 1 failed, 23 passed, 24 total                     │  │
│  │ Coverage: 87%                                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 6. CI Monitor

```
┌────────────────────────────────────────────────────────────────┐
│  CI MONITOR                                      Auto-refresh ⟳│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Repo                    │ Branch │ Status  │ Duration    │  │
│  ├─────────────────────────┼────────┼─────────┼─────────────│  │
│  │ lib-invoice-outbound-de │ main   │ ✓ pass  │ 2m 14s      │  │
│  │ lib-invoice-outbound-at │ main   │ ⟳ run   │ 1m 30s...   │  │
│  │ lib-invoice-common      │ main   │ ✗ fail  │ 3m 01s      │  │
│  │ frontend-kernel         │ feat/x │ ✓ pass  │ 4m 22s      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Retry Failed]  [Cancel Running]                               │
│                                                                  │
│  ── Failed Build Details ──────────────────────────────────    │
│  lib-invoice-common @ main                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Run: test (#142)                                          │  │
│  │ Error: Type 'number' is not assignable to type 'Decimal'  │  │
│  │ File: src/calculators/tax-calculator.ts:45                │  │
│  │                                                           │  │
│  │ [View on GitHub]  [View Full Log]                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Aktionen im Detail

### A. Refresh Repo Structure

1. Scannt `repo/` Verzeichnisbaum rekursiv
2. Findet alle `package.json` Dateien
3. Liest Dependencies aus jeder `package.json`
4. Filtert nach `npmOrganizations` (nur `@xhubio-saas/*` Dependencies)
5. Baut Dependency-Graph auf (Nodes + Edges)
6. Berechnet topologische Schichten (Layer)
7. Schreibt `repos.json` und `dependency-graph.json`
8. Vergleicht mit GitHub Org → erkennt fehlende Repos

### B. Refresh Uncommitted Changes

1. `git status --porcelain` für jedes Repo (parallel, max N)
2. `git log origin/main..HEAD` für unpushed commits
3. Aktualisiert `hasUncommittedChanges` in `repos.json`
4. Berechnet Impact: Für jedes dirty Repo → alle transitiven Dependents finden
5. WebSocket-Push an Frontend

### C. Pull/Clone All Repos

1. `gh repo list <org> --json name,url` für alle GitHub Orgs
2. Vergleicht mit lokalen Repos
3. Fehlende: `git clone` ins richtige Domain-Verzeichnis (aus Mapping)
4. Existierende: `git pull --ff-only` (parallel, max N)
5. Progress-Bar mit Status pro Repo
6. Fehler-Sammlung und Bericht am Ende

### D. Commit & Push Workflow

Für ein einzelnes oder mehrere Repos:

```
1. Staged Files prüfen (was wird committed)
2. Commit-Message eingeben (oder auto-generate)
3. Commit erstellen
4. Push to remote
5. CI-Status überwachen (Polling alle 15s)
6. Bei Erfolg: ✓ markieren, ggf. nächstes Repo
7. Bei Fehler: ✗ markieren, Fehler-Log anzeigen, Option: Retry / Skip / Abort
```

### E. Cascade Update (automatisiert)

```
Input: 1 oder mehrere geänderte Repos
Output: Vollständiger Update-Plan

1. Dependency-Graph laden
2. Betroffene Repos berechnen (transitive Dependents)
3. Topologisch sortieren
4. Parallelisierungs-Batches bilden (gleiche Layer = parallel)
5. Für jedes Repo im Plan:
   a. file: URLs → npm Versionen ersetzen
   b. pnpm install (aktualisiert lock file)
   c. pnpm test
   d. Bei Testfehler: STOP oder Skip (User-Entscheidung)
   e. Commit mit Nachricht: "chore: update @xhubio-saas/lib-invoice-interface to vX.Y.Z"
   f. Push
   g. CI abwarten
   h. Bei CI-Fehler: Retry (max 3) oder STOP
6. Abschluss-Bericht
```

---

## Eigene Ideen & Erweiterungen

### 1. Smart Commit Messages

Auto-generierte Commit-Messages basierend auf den geänderten Dateien:
- `src/types.ts` geändert → `feat: update type definitions`
- `tests/` geändert → `test: update test cases`
- `package.json` Dependencies → `chore: update dependencies`
- Conventional Commits Format automatisch

### 2. Health Score pro Repo

```
┌──────────────────────────────┐
│  lib-invoice-outbound-de     │
│  Health: ████████░░ 82%      │
│                              │
│  ✓ Tests passing             │
│  ✓ CI green                  │
│  ◆ 2 uncommitted files       │
│  ✗ Coverage < 90% (87%)      │
│  ✓ Dependencies up-to-date   │
│  ✓ No security advisories    │
└──────────────────────────────┘
```

### 3. Version Matrix

Zeigt welche Version jedes Pakets von welchem anderen Paket verwendet wird:

```
                    lib-inv-interface  lib-inv-common  kernel
lib-inv-common       ^1.0.0             -              -
lib-outbound-de      ^1.0.0             ^1.2.0         -
kp-invoice-outbound  ^1.0.0             ^1.2.0         ^2.3.0
kernel               -                  -              -
```

Highlighting bei Version-Mismatches!

### 4. Change Impact Preview

Bevor man committed: "Was passiert wenn ich das committe?"

```
┌──────────────────────────────────────────────┐
│  IMPACT PREVIEW                               │
│                                                │
│  Wenn lib-invoice-interface released:         │
│                                                │
│  Direkt betroffen (2):                        │
│    lib-invoice-common                         │
│    lib-invoice-inbound-interface              │
│                                                │
│  Transitiv betroffen (28):                    │
│    14x outbound libs                          │
│    14x inbound libs                           │
│                                                │
│  Kernel-Plugins (2):                          │
│    kernel-plugin-invoice-outbound             │
│    kernel-plugin-invoice-inbound              │
│                                                │
│  Apps (2):                                    │
│    saas-invoice-backend                       │
│    saas-invoice-api-backend                   │
│                                                │
│  Geschätzte Cascade-Zeit: ~35 min             │
│  CI-Runs: 32                                  │
│                                                │
│  [Start Cascade]  [Nur Commit (kein Cascade)] │
└──────────────────────────────────────────────┘
```

### 5. Repo Comparison View

Zwei Repos nebeneinander vergleichen (z.B. `outbound-de` vs `outbound-at`):
- Dateistruktur vergleichen
- Fehlende Dateien erkennen
- Unterschiede in gleichen Dateien zeigen
- Nützlich bei länderspezifischen Implementierungen

### 6. Template Sync

Erkennt wenn Konfigurationsdateien (eslint, tsconfig, vitest, prettier) von einer Vorlage abweichen:

```
CONFIG DRIFT DETECTION

  lib-invoice-outbound-de:
    ✓ tsconfig.json      matches template
    ✗ eslint.config.js   differs (2 lines)     [Sync] [Diff]
    ✓ vitest.config.ts   matches template
    ✗ .prettierrc        missing trailingComma  [Sync] [Diff]
```

### 7. Batch Release Orchestrator

```
RELEASE PLAN

  Phase 1 (sequential):           Status
  ├── lib-invoice-interface       ✓ v1.1.0 released
  └── lib-invoice-common          ⟳ releasing...

  Phase 2 (parallel, max 6):
  ├── lib-invoice-outbound-de     ○ queued
  ├── lib-invoice-outbound-at     ○ queued
  ├── lib-invoice-outbound-ch     ○ queued
  └── ... (11 more)               ○ queued

  Phase 3 (sequential):
  ├── kernel-plugin-invoice-out   ○ queued
  └── kernel-plugin-invoice-in    ○ queued

  [Pause]  [Skip Failed]  [Abort]
```

### 8. Notifications / Webhooks

- Desktop-Notifications bei CI-Completion
- Slack-Integration für Team-Visibility
- Sound bei Fehler/Erfolg (konfigurierbar)

### 9. Bookmarks & Quick Actions

User kann häufig genutzte Repo-Gruppen als Bookmarks speichern:
- "Invoice Outbound" = alle 14 outbound libs
- "Core Stack" = kernel + frontend-kernel + ui-components
- Quick Actions: "Test Invoice Outbound", "Update Core Stack"

### 10. History & Undo

Alle Operationen werden protokolliert:
- Wann wurde was committed/pushed
- Welche Cascades liefen
- Rollback-Info: "Um diesen Cascade rückgängig zu machen: ..."

---

## Projekt-Struktur

```
repo_maintenance/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
│
├── src/
│   ├── server/                     # Backend
│   │   ├── index.ts                # Express + WebSocket Server
│   │   ├── trpc/
│   │   │   ├── router.ts           # tRPC Router (alle Endpoints)
│   │   │   ├── context.ts
│   │   │   └── procedures/
│   │   │       ├── project.ts      # Projekt-CRUD
│   │   │       ├── repos.ts        # Repo-Operationen
│   │   │       ├── git.ts          # Git-Operationen
│   │   │       ├── dependencies.ts # Dependency-Graph
│   │   │       ├── cascade.ts      # Cascade-Operationen
│   │   │       ├── ci.ts           # CI-Status
│   │   │       └── bulk.ts         # Bulk-Operationen
│   │   ├── services/
│   │   │   ├── repo-scanner.ts     # Scannt Verzeichnis, findet Repos
│   │   │   ├── dependency-resolver.ts  # Baut Dependency-Graph
│   │   │   ├── git-service.ts      # Git-Operationen (simple-git)
│   │   │   ├── github-service.ts   # GitHub API (Octokit)
│   │   │   ├── ci-monitor.ts       # CI-Status-Polling
│   │   │   ├── cascade-executor.ts # Cascade-Logik
│   │   │   ├── task-queue.ts       # Parallele Task-Ausführung
│   │   │   └── config-service.ts   # Liest/schreibt .repoMaintenance/
│   │   └── utils/
│   │       ├── topological-sort.ts
│   │       ├── glob-patterns.ts
│   │       └── logger.ts
│   │
│   ├── client/                     # Frontend
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── styles/
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx         # Repo-Tree
│   │   │   │   ├── MainContent.tsx
│   │   │   │   ├── BottomPanel.tsx     # Log-Output
│   │   │   │   └── StatusBar.tsx
│   │   │   ├── sidebar/
│   │   │   │   ├── RepoTree.tsx        # Baumansicht
│   │   │   │   ├── RepoNode.tsx        # Einzelner Knoten
│   │   │   │   ├── DomainGroup.tsx     # Domain-Ordner
│   │   │   │   └── TreeFilter.tsx      # Filter/Suche
│   │   │   ├── dashboard/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── StatsCards.tsx
│   │   │   │   ├── UncommittedList.tsx
│   │   │   │   └── RecentOps.tsx
│   │   │   ├── repo-detail/
│   │   │   │   ├── RepoDetail.tsx
│   │   │   │   ├── ChangesTab.tsx
│   │   │   │   ├── DependenciesTab.tsx
│   │   │   │   ├── DependentsTab.tsx
│   │   │   │   ├── CiHistoryTab.tsx
│   │   │   │   └── DiffViewer.tsx
│   │   │   ├── graph/
│   │   │   │   ├── DependencyGraph.tsx # React Flow basiert
│   │   │   │   ├── GraphControls.tsx
│   │   │   │   ├── GraphNode.tsx       # Custom Node
│   │   │   │   └── GraphEdge.tsx       # Custom Edge
│   │   │   ├── cascade/
│   │   │   │   ├── CascadePlanner.tsx
│   │   │   │   ├── ExecutionPlan.tsx
│   │   │   │   ├── StepCard.tsx
│   │   │   │   └── LiveProgress.tsx
│   │   │   ├── bulk/
│   │   │   │   ├── BulkOperations.tsx
│   │   │   │   ├── CommandInput.tsx
│   │   │   │   └── ResultsList.tsx
│   │   │   ├── ci/
│   │   │   │   ├── CiMonitor.tsx
│   │   │   │   └── BuildDetail.tsx
│   │   │   └── shared/
│   │   │       ├── StatusBadge.tsx
│   │   │       ├── ProgressBar.tsx
│   │   │       ├── Terminal.tsx     # xterm.js Wrapper
│   │   │       └── ConfirmDialog.tsx
│   │   ├── hooks/
│   │   │   ├── useRepos.ts
│   │   │   ├── useDependencyGraph.ts
│   │   │   ├── useCascade.ts
│   │   │   ├── useCiStatus.ts
│   │   │   ├── useWebSocket.ts
│   │   │   └── useBulkOperation.ts
│   │   ├── stores/                 # Zustand
│   │   │   ├── repo-store.ts
│   │   │   ├── ui-store.ts
│   │   │   └── operation-store.ts
│   │   └── trpc/
│   │       └── client.ts           # tRPC Client Setup
│   │
│   └── shared/                     # Shared Types
│       ├── types.ts                # Repo, Domain, CascadePlan, etc.
│       └── constants.ts
│
├── tests/
│   ├── server/
│   │   ├── repo-scanner.test.ts
│   │   ├── dependency-resolver.test.ts
│   │   ├── topological-sort.test.ts
│   │   └── cascade-executor.test.ts
│   └── fixtures/
│       └── mock-repos/
│
└── doc/
    └── usage.md
```

---

## Start-Befehl

```bash
cd repo_maintenance
pnpm dev          # Startet Backend (Port 3100) + Frontend (Port 3101)
pnpm dev:server   # Nur Backend
pnpm dev:client   # Nur Frontend
```

Öffnet automatisch `http://localhost:3101` im Browser.

---

## Implementierungs-Phasen

### Phase 1: Foundation (MVP)
- [ ] Projekt-Setup (React + Vite + Express + tRPC)
- [ ] `.repoMaintenance/project.json` Konfiguration
- [ ] Repo-Scanner: Verzeichnis scannen, `package.json` lesen
- [ ] Dependency-Graph berechnen
- [ ] Sidebar mit Repo-Tree (collapsible, farbig)
- [ ] Dashboard mit Stats

### Phase 2: Git-Integration
- [ ] Uncommitted Changes erkennen und anzeigen
- [ ] Diff-Viewer (react-diff-viewer)
- [ ] Commit & Push für einzelne Repos
- [ ] Pull/Clone all repos

### Phase 3: Dependency Visualization
- [ ] Interaktiver Dependency-Graph (React Flow)
- [ ] Focus-Mode, Domain-Filter
- [ ] Impact-Preview (was ist betroffen)
- [ ] Affected-Mode

### Phase 4: Cascade & Automation
- [ ] Cascade Planner UI
- [ ] Cascade Executor (topologisch, parallel)
- [ ] CI-Status-Monitoring (GitHub Actions)
- [ ] Live-Progress mit WebSocket

### Phase 5: Bulk Operations
- [ ] Command auf mehrere Repos ausführen
- [ ] Test-Results mit Coverage anzeigen
- [ ] Ergebnis-Aggregation und Reporting

### Phase 6: Polish & Extras
- [ ] Health Score
- [ ] Version Matrix
- [ ] Template Sync / Config Drift Detection
- [ ] History & Undo
- [ ] Bookmarks & Quick Actions
- [ ] Desktop-Notifications

---

## Offene Fragen

1. **Standalone oder im Browser?** → Empfehlung: Web-App (localhost), da React Flow + xterm.js dort am besten funktionieren. Alternative: Electron/Tauri für Desktop-App.

2. **Bestehende `repo-maintenance.sh` ersetzen?** → Das Tool sollte die gleiche Funktionalität bieten, aber das Shell-Script kann als Fallback bleiben.

3. **State Management?** → Zustand (leichtgewichtig) oder TanStack Query für Server-State + tRPC Integration.

4. **Persistenz?** → JSON-Dateien in `.repoMaintenance/` reichen. Keine DB nötig.

5. **Auth?** → Nicht nötig da lokal. GitHub-Token wird aus `gh auth token` gelesen.
