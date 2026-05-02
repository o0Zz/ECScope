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
| i18n | i18next + react-i18next | |
| AWS | AWS SDK v3 (ECS, EC2, CloudWatch, ELBv2, RDS, SSM, STS, Secrets Manager, Auto Scaling, Application Auto Scaling) | |
| Logging | tslog with domain-specific sub-loggers | |
| Linting | ESLint + typescript-eslint + Prettier + Husky + lint-staged | |

> **Note:** UI is custom Tailwind components — no shadcn/ui registry is used.

## 📁 Project Structure

```
src/
├── api/                # AWS SDK clients and domain API modules
│   ├── clients.ts      # Singleton AWS client init + getters
│   ├── ecs-services.ts # Service listing, scaling, force deploy, rollback, task-def register
│   ├── ecs-tasks.ts    # Task listing, container enrichment, secret resolution/update
│   ├── ecs-instances.ts # Container instances, resource stats, VPC resolution
│   ├── asg.ts          # ASG discovery from capacity providers, scaling limits
│   ├── service-autoscaling.ts # ECS service scalable targets (Application Auto Scaling)
│   ├── alb.ts          # ALB/NLB discovery, target groups, target health, LB metrics
│   ├── cloudwatch.ts   # Generic metric queries + domain-specific history APIs
│   ├── ec2.ts          # EC2 instance listing (VPC-filtered)
│   ├── rds.ts          # RDS instance listing (VPC-filtered)
│   ├── ssm.ts          # SSM RunShellScript execution + polling
│   ├── pagination.ts   # Generic paginateAll + batchProcess helpers
│   ├── index.ts        # Barrel + ecsApi facade
│   └── types/          # Shared TypeScript types per domain
├── components/         # Reusable UI primitives
│   ├── MetricsChart.tsx          # Generic SVG chart with adaptive ticks
│   ├── MetricsPanel.tsx          # Chart wrapper with range selector + loading state
│   ├── metrics-chart-presets.ts  # Compact/percent chart config presets
│   ├── ServiceMetricsChart.tsx   # ECS service CPU/memory charts
│   ├── AlbMetricsChart.tsx       # ALB request/latency/error charts
│   ├── NlbMetricsChart.tsx       # NLB flow/bytes/reset charts
│   ├── Ec2MetricsChart.tsx       # EC2 CPU/network/disk charts
│   ├── RdsMetricsChart.tsx       # RDS CPU/connections/IOPS charts
│   ├── StatusBadge.tsx           # Status color + translated emoji
│   ├── MetricBar.tsx             # Compact percentage bar
│   ├── ConfirmDialog.tsx         # Reusable confirm/cancel modal
│   ├── CopyButton.tsx            # Clipboard copy with feedback
│   ├── DeploymentStatusPanel.tsx # Deployment list with rollback actions
│   ├── ScalingLimitsDialog.tsx   # Numeric scaling limits modal
│   ├── ServiceEventsTimeline.tsx # Service events feed with error highlighting
│   ├── TaskDefinitionEditor.tsx  # JSON task-def editor + validate + deploy
│   └── ThemeToggle.tsx           # Dark/light theme toggle
├── config/
│   ├── config.ts       # Loads ecscope.config.json via Tauri command
│   └── aws-credentials.ts  # AWS profile/credential resolution (INI parsing, STS role assumption)
├── features/
│   ├── welcome/        # WelcomeView (shown before cluster selection)
│   ├── services/       # ServiceList (status, CPU/RAM, scaling, force deploy, autoscaling)
│   ├── tasks/          # TaskList, TaskRow, EnvVarPanel, TaskActions, CaptureConfigDialog, EditSecretDialog
│   ├── albnlb/         # AlbNlbViewer (LBs, target groups, health, metrics)
│   ├── nodes/          # NodeViewer (EC2 instances, SSM, SFTP file transfer, ASG controls)
│   └── ec2rds/         # Ec2RdsDashboard (VPC EC2 + RDS instances, metrics)
├── i18n/
│   ├── index.ts        # i18next init (react-i18next), changeLanguage helper
│   └── locales/        # Translation files
│       ├── en.json         # English (default)
│       └── en-emoji.json   # English with emoji status prefixes
├── layout/
│   ├── Sidebar.tsx     # Cluster list, connect flow, collapse
│   ├── MainPanel.tsx   # Tab-based feature switching
│   ├── Breadcrumb.tsx  # Cluster > Service > Task path + theme toggle
│   └── TabBar.tsx      # Horizontal tab navigation
├── store/
│   ├── config.ts       # Connection/auth/config state (clusters, credentials, theme, language)
│   └── navigation.ts   # UI navigation (selected cluster/service/task, activeTab, sidebar)
└── lib/
    ├── logger.ts       # tslog with sub-loggers, sensitive data masking, wrapped invoke()
    ├── aws-urls.ts     # AWS Console deep links (ECS, EC2, RDS, ALB) + Tauri opener
    ├── metrics-time-range.ts # Selectable time windows + CloudWatch period calculation
    ├── utils.ts        # cn() helper
    └── format.ts       # Number/bytes/percent/relative-age formatters
src-tauri/
├── src/lib.rs          # Tauri commands: config, SSM, ECS exec, SSH keypair, SFTP transfer
├── src/main.rs         # Entry point
├── tauri.conf.json     # App config, CSP, bundling
└── capabilities/       # Tauri permissions (filesystem, dialog, shell, opener)
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

### Diagnostics (SSM + SFTP)
- EC2 file transfer via SFTP over SSM tunnel (Rust backend handles SSH/SFTP).
- Features: file download/upload between EC2 and local machine with progress tracking.
- Rust commands handle terminal sessions: `open_ssm_session`, `open_ecs_exec`.
- Tauri commands: `read_app_config`, `read_aws_files`, `open_ssm_session`, `open_ecs_exec`, `generate_ssh_keypair`, `sftp_download`, `sftp_upload`, `cancel_transfer`.
- SFTP transfers emit `sftp-progress` events with percent and transfer rate.

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
- camelCase for functions/variables, PascalCase for components/types, prefix hooks with `use`
- Use `import type` for type-only imports
- ESLint + Prettier configured — run `npm run lint` and `npm run format`
- Husky + lint-staged for pre-commit hooks

### i18n
- All user-facing strings use `useTranslation()` hook from react-i18next
- Access translations via `t("section.key")` — e.g., `t("services.title")`
- Translation keys organized by feature/domain in locale JSON files
- Language set via `ecscope.config.json` (`language` field) and applied in config store
- Two locales: `en` (clean English) and `en-emoji` (emoji-prefixed statuses)
- Add new keys to both locale files when adding UI text

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
- [x] Service viewer — list, status, CPU/RAM, one-click scale up/down, force deploy, autoscaling
- [x] Task inspector — details, containers, health, env/secrets, ECS exec, docker logs via SSM
- [x] Task definition editor — JSON editor with validation and deploy
- [x] Secret management — view/edit secret values, redeploy prompt
- [x] ALB/NLB viewer — load balancers, target groups, health checks, request/latency metrics
- [x] Node viewer — EC2 container instances, SSM connect, SFTP file transfer, ASG controls
- [x] EC2/RDS dashboard — VPC EC2 + RDS instances with metrics
- [x] Diagnostics — file download/upload via SFTP over SSM tunnel with progress tracking
- [x] Metrics charting — generic framework with domain specializations (service, ALB, NLB, EC2, RDS)
- [x] Multi-cluster config — multiple clusters with per-cluster profile/region/color/group/icon
- [x] AWS credential resolution — static credentials + STS role assumption
- [x] i18n — i18next with two locales (en, en-emoji)
- [x] CI/CD — GitHub Actions release workflow

## 🚧 Known Gaps / TODO

- [ ] **Testing** — No test framework configured yet

## 💡 Guidelines

- Optimize for developer experience and speed
- Keep components modular and reusable
- Avoid over-engineering — don't add abstractions for one-time operations
- Think like a DevOps tool UI — information-dense, action-oriented
- Generate clean, production-ready code
