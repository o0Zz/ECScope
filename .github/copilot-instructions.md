You are a senior full-stack developer working on **ECScope**.

## 🧠 Project Overview

ECScope is a cross-platform desktop application (like OpenLens but for AWS ECS) that allows developers and DevOps engineers to explore, monitor, and manage their ECS infrastructure. It runs on Windows, Linux, and macOS via **Tauri**.

## 🧱 Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop | Tauri | 2.x |
| Frontend | React + TypeScript + Vite | React 19, TS 6, Vite 8 |
| State | Zustand | 5.x |
| Data fetching | TanStack React Query | 5.x |
| Styling | TailwindCSS v4 (Vite plugin) + clsx + tailwind-merge | |
| Icons | lucide-react | |
| AWS | AWS SDK v3 (ECS, CloudWatch, ELBv2, S3, SSM, STS, Secrets Manager) | |

> **Note:** UI is custom Tailwind components — no shadcn/ui registry is used.

## 📁 Project Structure

```
src/
├── api/                # AWS SDK clients and domain API modules
│   ├── clients.ts      # Singleton AWS client init + getters
│   ├── ecs.ts          # ECS services, tasks, container instances
│   ├── alb.ts          # ALB/NLB discovery, target health
│   ├── cloudwatch.ts   # CloudWatch metric queries
│   ├── ssm.ts          # SSM command send/poll
│   ├── s3.ts           # S3 transfer helpers
│   ├── ec2.ts          # EC2 instance listing + SSM-driven file transfer
│   ├── index.ts        # Barrel + ecsApi facade
│   └── types/          # Shared TypeScript types per domain
├── components/         # Reusable UI primitives (StatusBadge, MetricBar, MetricsChart, etc.)
├── config/
│   ├── config.ts       # Loads ecscope.config.json via Tauri command
│   └── aws-credentials.ts  # AWS profile/credential resolution (INI parsing, STS role assumption)
├── features/
│   ├── welcome/        # WelcomeView (shown before cluster selection)
│   ├── services/       # ServiceList (list, status, CPU/RAM, one-click scaling)
│   ├── tasks/          # TaskList (details, containers, env/secrets, ECS exec, docker logs)
│   ├── albnlb/         # AlbNlbViewer (LBs, target groups, health, metrics)
│   ├── nodes/          # NodeViewer (EC2 container instances, SSM, file transfer)
│   └── ec2rds/         # Ec2RdsDashboard (VPC EC2 instances, metrics)
├── layout/
│   ├── Sidebar.tsx     # Cluster list, connect flow, collapse
│   ├── MainPanel.tsx   # Tab-based feature switching
│   ├── Breadcrumb.tsx  # Cluster > Service > Task path + theme toggle
│   └── TabBar.tsx      # Horizontal tab navigation
├── store/
│   ├── config.ts       # Connection/auth/config state (clusters, credentials, status)
│   └── navigation.ts   # UI navigation (selected cluster/service/task, activeTab, sidebar)
└── lib/
    ├── utils.ts        # cn() helper
    └── format.ts       # Formatting utilities
src-tauri/
├── src/lib.rs          # Tauri commands: read_app_config, read_aws_files, open_ssm_session, open_ecs_exec
├── src/main.rs         # Entry point
├── tauri.conf.json     # App config, CSP, bundling
└── capabilities/       # Tauri permissions (filesystem, dialog, shell)
```

## 🏗️ Architecture & Patterns

### State Management
- **Config store** (`src/store/config.ts`): clusters, storage config, refreshIntervalMs, activeCluster, credentials, connection status/error. Actions: `initialize`, `connectToCluster` (includes AWS client initialization).
- **Navigation store** (`src/store/navigation.ts`): selectedCluster, selectedService, selectedTaskArn, activeTab (services | tasks | albnlb | nodes | ec2rds), sidebarCollapsed. Actions: `selectCluster`, `selectService`, `selectTask`, `setActiveTab`, `toggleSidebar`, `goBack`.

### Data Fetching
- TanStack Query for all reads with periodic refetch via `refetchInterval` from config store.
- Global defaults: `refetchOnWindowFocus: false`, `retry: 1`, `staleTime: 30s`.
- Mutations use `useMutation` with targeted `queryClient.invalidateQueries`.

### API Layer
- Singleton AWS clients initialized once in `src/api/clients.ts` via `initAwsClients()`.
- Domain modules consume client getters (`getEcsClient()`, `getCwClient()`, etc.).
- `src/api/index.ts` exports an `ecsApi` facade composing all domain modules.
- Internal types in `src/api/types/` map AWS SDK shapes to app-specific interfaces.

### Config & Credentials
- `ecscope.config.json` loaded via Tauri Rust command (`read_app_config`) — searches next to executable and CWD.
- AWS credential resolution: reads `~/.aws/credentials` + `~/.aws/config` via Tauri command, parses INI, supports static credentials and STS role assumption.

### Diagnostics (SSM + S3)
- EC2 file transfer orchestrate: SSM RunShellScript → poll completion → S3 transfer → local download via Tauri dialog/fs.
- Features: file download/upload between EC2 and S3.
- Rust commands handle terminal sessions: `open_ssm_session`, `open_ecs_exec`.

### Navigation Flow
1. Sidebar lists configured clusters → user clicks to connect
2. Connection triggers: config load → AWS credential resolution → client init → nav store update
3. MainPanel renders feature based on `activeTab`
4. Breadcrumb shows cluster > service > task path with back navigation

## ⚙️ Coding Conventions

- React functional components with hooks only
- TypeScript strict mode — no `any` unless absolutely necessary
- Rust code kept minimal — only for Tauri commands that need OS-level access
- AWS SDK called directly from frontend (no backend proxy)
- Feature-based folder organization
- Path alias: `@` → `src/`
- One feature component per file, colocated with its feature folder

## 🎨 UI Guidelines

- Dark mode by default (theme toggle available)
- Sidebar navigation with collapsible cluster list
- Tab-based feature navigation (Services, Tasks, ALB/NLB, Nodes, EC2/RDS)
- Tables for resource listing with inline actions
- MetricsChart component for CloudWatch data visualization
- StatusBadge for health/status indicators
- MetricBar for CPU/RAM usage display
- Monospace font for logs and terminal output

## ✅ Implemented Features

- [x] Cluster explorer — list, select, connect, resource overview
- [x] Service viewer — list, status, CPU/RAM, one-click scale up/down
- [x] Task inspector — details, containers, health, env/secrets, ECS exec, docker logs via SSM
- [x] ALB/NLB viewer — load balancers, target groups, health checks, request/latency metrics
- [x] Node viewer — EC2 container instances, SSM connect, diagnostics, file transfer
- [x] Diagnostics — file download/upload via SSM + S3
- [x] Metrics charting — generic framework with domain specializations (service, ALB, NLB)
- [x] Multi-cluster config — multiple clusters with per-cluster profile/region
- [x] AWS credential resolution — static credentials + STS role assumption
- [x] CI/CD — GitHub Actions release workflow

## 🚧 Known Gaps / TODO

- [ ] **EC2/RDS dashboard** — EC2 instances shown, RDS backend not yet implemented

## 💡 Guidelines

- Optimize for developer experience and speed
- Keep components modular and reusable
- Avoid over-engineering — don't add abstractions for one-time operations
- Think like a DevOps tool UI — information-dense, action-oriented
- Generate clean, production-ready code
