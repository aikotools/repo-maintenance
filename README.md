# RepoHub - Repository Maintenance Tool

Web-basiertes Dashboard zur Verwaltung des `saas-coding-kernel` Multi-Repo Monorepos. Bietet Dependency-Graph, Bulk-Operationen, Cascade-Updates und Git-Management fuer 140+ Packages.

## Voraussetzungen

| Tool | Version | Zweck |
|------|---------|-------|
| **Bun** | latest | Backend-Runtime |
| **pnpm** | 10+ | Package Manager |
| **Node.js** | 24+ | Build-Tools |
| **Git** | - | Repository-Operationen |
| **GitHub CLI (`gh`)** | - | Pull-All (Clone + GitHub-Abfrage) |

GitHub CLI muss authentifiziert sein (`gh auth login`).

## Installation & Start


```bash
cd repo/tools/tool-repo-maintenance
pnpm install
cp .env.example .env   # Anpassen falls noetig
```

### Development

```bash
pnpm dev          # Backend (3100) + Frontend (3101) parallel
pnpm dev:server   # Nur Backend
pnpm dev:client   # Nur Frontend
```

Oeffne http://localhost:3101 im Browser.

### Production

```bash
pnpm build
pnpm start        # http://localhost:3100
```

## Konfiguration

### .env

```bash
PORT=3100                                # Backend-Port
VITE_PORT=3101                           # Vite Dev-Server Port
NPM_REGISTRY=https://npm.pkg.github.com # npm Registry (fuer Cascade)
```

### Projekt-Einstellungen (UI)

Beim ersten Start ueber das Zahnrad-Icon (Settings) konfigurieren:

- **NPM Organizations** - z.B. `@xhubio-saas` (zum Erkennen interner Dependencies)
- **GitHub Organizations** - z.B. `xhubio-saas` (fuer Pull-All)
- **Parallel Tasks** - Anzahl gleichzeitiger Operationen (1-20, Default: 6)
- **Default Branch** - z.B. `main`

Die Konfiguration wird in `.repoMaintenance/project.json` gespeichert.

## Features

### Dashboard

Uebersicht mit Statistiken: Gesamtzahl Repos, Domains, uncommitted Changes und Dependency-Kanten. Zeigt Repos mit offenen Aenderungen und eine Domain-Uebersicht.

### Repository-Detail

Klick auf ein Repo in der Sidebar oeffnet die Detailansicht:

- **Changes-Tab** - Geaenderte Dateien mit Diff-Viewer. Untracked Files koennen per Klick zu `.gitignore` hinzugefuegt werden.
- **Dependencies-Tab** - Interne Abhaengigkeiten mit Links zum jeweiligen Repo.
- **Dependents-Tab** - Repos die von diesem Repo abhaengen.
- **Actions** - Commit & Push, Pull, Start Cascade.
- **Recent Commits** - Letzte Commits des Repos.

### Dependency Graph

Interaktive Visualisierung aller internen Abhaengigkeiten als Node-Edge-Graph (React Flow). Klick auf einen Node navigiert zum Repo-Detail.

### Pull All

Synchronisiert alle Repos mit GitHub - wie `repo-maintenance.sh`, aber mit UI:

1. Holt alle Repos der konfigurierten GitHub-Organisation via `gh repo list`
2. **Klont** fehlende Repos in den richtigen Domain-Ordner
3. **Pullt** existierende Repos (ueberspringt bei uncommitted Changes)
4. Zeigt Live-Fortschritt mit Status pro Repo

**Status-Typen:**

| Status | Bedeutung |
|--------|-----------|
| Updated | Erfolgreich gepullt |
| Already up-to-date | Keine Aenderungen |
| Cloned | Neu von GitHub geklont |
| Skipped | In Ignore-Liste |
| Unmapped | Kein Domain-Mapping konfiguriert |
| Has changes | Uebersprungen wegen uncommitted Changes |
| Failed | Fehler beim Pull/Clone |

**Repo-Mapping konfigurieren:** Settings > Repo Mapping > Edit. Dort koennen Repos Domains zugewiesen, ignoriert oder aus der Unmapped-Liste zugeordnet werden.

### Cascade Updates

Propagiert Dependency-Updates automatisch durch die gesamte Abhaengigkeitskette.

**Beispiel:** `lib-invoice-interface` wird aktualisiert. Cascade aktualisiert automatisch alle abhaengigen Pakete in der richtigen Reihenfolge (topologisch sortiert, Layer fuer Layer).

**Ablauf:**

1. Source-Repo auswaehlen (z.B. `lib-invoice-interface`)
2. Tool berechnet alle betroffenen Repos in topologischer Reihenfolge
3. Optionen konfigurieren:
   - **Wait for CI** - Wartet zwischen Layern auf CI/CD-Publish
   - **Run Tests** - Fuehrt `pnpm test` vor dem Commit aus
   - **Commit Prefix** - z.B. `deps: ` oder `chore: `
4. Plan bestaetigen und starten

**Pro Repo wird ausgefuehrt:**

1. `package.json` Dependencies aktualisieren
2. `npm install`
3. Tests (optional)
4. Commit + Push
5. Auf CI warten (optional) + publishte Version aufloesen

**Steuerung waehrend der Ausfuehrung:** Pause, Resume, Abort, Skip Failed, manuell Version setzen.

### Bulk Operations

Beliebige Shell-Befehle ueber mehrere Repos gleichzeitig ausfuehren:

1. Repos filtern nach Domain, Typ oder Suchbegriff
2. Befehl eingeben (z.B. `npm run build`, `git status`, `npm test`)
3. Parallelitaet waehlen (1-20)
4. Starten - Live-Output pro Repo mit Exit-Code und Dauer

### Packages (File-URL Management)

Zeigt Repos mit `file:`-Dependencies in `package.json`. Ermoeglicht Batch-Umschaltung zwischen lokalen `file:`-Pfaden (Entwicklung) und npm-Versionen (Produktion).

### History

Persistente Historie aller Cascade- und Pull-All-Operationen mit Status, betroffenen Repos und Dauer.

## Datenablage

```
.repoMaintenance/
├── project.json          # Projekt-Konfiguration + Repo-Mapping
├── cached-repos.json     # Repo-Cache (fuer schnellen Start)
├── cached-graph.json     # Dependency-Graph Cache
├── cascade-history/      # Cascade-Ausfuehrungen
└── pull-history/         # Pull-All Ausfuehrungen
```

## Scripts

| Script | Beschreibung |
|--------|-------------|
| `pnpm dev` | Development (Backend + Frontend) |
| `pnpm build` | TypeScript + Vite Build |
| `pnpm start` | Production Server starten |
| `pnpm test` | Tests mit Coverage |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |
| `pnpm depcheck` | Unused Dependencies pruefen |

## Architektur

```
src/
├── server/                  # Hono + tRPC Backend (Bun Runtime)
│   ├── index.ts             # Server Entry Point
│   ├── services/            # Business Logic
│   │   ├── repo-scanner.ts           # Scannt repo/ nach Packages
│   │   ├── dependency-resolver.ts    # Baut Dependency-Graph
│   │   ├── cascade-service.ts        # Cascade-Update Orchestrierung
│   │   ├── bulk-service.ts           # Bulk-Command Ausfuehrung
│   │   ├── git-service.ts            # Git-Operationen (simple-git)
│   │   ├── pull-all-service.ts       # Pull/Clone aller Repos
│   │   ├── package-service.ts        # file: URL Management
│   │   ├── task-queue.ts             # Paralleler Task-Executor
│   │   └── config-service.ts         # Config + Cache Persistenz
│   └── trpc/                # tRPC Router + Procedures
│       ├── router.ts
│       └── procedures/
│           ├── project.ts            # Projekt-Konfiguration
│           ├── repos.ts              # Repo-Liste / Refresh
│           ├── git.ts                # Git-Operationen
│           ├── cascade.ts            # Cascade-Updates
│           ├── bulk.ts               # Bulk-Operationen
│           ├── dependencies.ts       # Dependency-Graph
│           └── package.ts            # Package-Management
├── client/                  # React Frontend
│   ├── main.tsx             # App Entry Point
│   ├── App.tsx              # Root-Komponente
│   ├── trpc.ts              # tRPC Client Setup
│   └── components/
│       ├── layout/          # AppLayout, Sidebar, StatusBar
│       ├── dashboard/       # Dashboard-Ansicht
│       ├── repo-detail/     # Repository-Detail
│       ├── graph/           # Dependency-Graph (React Flow)
│       ├── cascade/         # Cascade Planner & Monitor
│       ├── bulk/            # Bulk-Operationen
│       ├── history/         # History-Ansicht
│       ├── packages/        # File-URL Ansicht
│       ├── settings/        # Settings + Repo-Mapping Dialog
│       └── shared/          # Shared Components
└── shared/                  # Shared Types (Server + Client)
    └── types.ts
```

## Tech Stack

| Komponente | Technologie |
|------------|-------------|
| Backend | Bun + Hono + tRPC |
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| State | TanStack Query (Polling fuer Live-Updates) |
| Graph | React Flow (@xyflow/react) |
| Git | simple-git |
| Icons | Lucide React |
