# ECScope

ECScope is a cross-platform desktop application (Tauri + React) for exploring, monitoring, and managing AWS ECS infrastructure. Think OpenLens but for ECS — clusters, services, tasks, load balancers, nodes, and databases in one place. Runs on Windows, Linux, and macOS.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2.x (Rust backend) |
| Frontend | React 19 + TypeScript 6 + Vite 8 |
| State | Zustand 5 |
| Data fetching | TanStack React Query 5 |
| Styling | TailwindCSS v4 (Vite plugin) + clsx + tailwind-merge |
| Icons | lucide-react |
| i18n | i18next + react-i18next |
| AWS | AWS SDK v3 (ECS, EC2, CloudWatch, ELBv2, RDS, SSM, STS, Secrets Manager, Auto Scaling, Application Auto Scaling) |
| Logging | tslog with domain-specific sub-loggers |
| Linting | ESLint + typescript-eslint + Prettier + Husky + lint-staged |

UI is custom Tailwind components — no shadcn/ui or component library.

## Common Commands

```bash
npm ci                # Install dependencies
npx tauri dev         # Dev server + Tauri window (frontend on port 1420)
npx tauri build       # Production build for current platform
npm run build         # Frontend-only build (tsc + vite)
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix
npm run format        # Prettier format
npm run format:check  # Prettier check
```

No test framework is configured.

## Project Structure

```
src/
├── api/              # AWS SDK clients and domain API modules
│   ├── clients.ts    # Singleton AWS client init (initAwsClients, getEcsClient, etc.)
│   ├── ecs-services.ts  # Service listing, scaling, force deploy, rollback, task-def register
│   ├── ecs-tasks.ts     # Task listing, container enrichment, secret resolution/update
│   ├── ecs-instances.ts # Container instances, resource stats, VPC resolution
│   ├── asg.ts           # ASG discovery from capacity providers, scaling limits
│   ├── service-autoscaling.ts  # ECS service scalable targets (Application Auto Scaling)
│   ├── alb.ts           # ALB/NLB discovery, target groups, target health, LB metrics
│   ├── cloudwatch.ts    # Generic metric queries + domain-specific history APIs
│   ├── ec2.ts           # EC2 instance listing (VPC-filtered)
│   ├── rds.ts           # RDS instance listing (VPC-filtered)
│   ├── ssm.ts           # SSM RunShellScript execution + polling
│   ├── pagination.ts    # Generic paginateAll + batchProcess helpers
│   ├── index.ts         # Barrel export + ecsApi facade
│   └── types/           # TypeScript interfaces per AWS domain
├── components/       # Reusable UI primitives
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
│   ├── config.ts     # Loads ecscope.config.json via Tauri command
│   └── aws-credentials.ts  # AWS profile/credential resolution + STS role assumption
├── features/         # Feature modules by domain
│   ├── welcome/      # WelcomeView (before cluster selection)
│   ├── services/     # ServiceList (status, CPU/RAM, scaling, force deploy, autoscaling)
│   ├── tasks/        # TaskList, TaskRow, EnvVarPanel, TaskActions, CaptureConfigDialog, EditSecretDialog
│   ├── albnlb/       # AlbNlbViewer (load balancers, target groups, health, metrics)
│   ├── nodes/        # NodeViewer (EC2 instances, SSM, SFTP file transfer, ASG controls)
│   └── ec2rds/       # Ec2RdsDashboard (VPC EC2 + RDS instances, metrics)
├── i18n/             # Internationalization
│   ├── index.ts      # i18next init (react-i18next), changeLanguage helper
│   └── locales/      # Translation files
│       ├── en.json       # English (default)
│       └── en-emoji.json # English with emoji status prefixes
├── layout/           # App shell: Sidebar, MainPanel, Breadcrumb, TabBar
├── store/
│   ├── config.ts     # Clusters, credentials, connection state, theme, language (Zustand)
│   └── navigation.ts # Selected cluster/service/task, activeTab, sidebar (Zustand)
└── lib/
    ├── logger.ts     # tslog with sub-loggers, sensitive data masking, wrapped invoke()
    ├── aws-urls.ts   # AWS Console deep links (ECS, EC2, RDS, ALB) + Tauri opener
    ├── metrics-time-range.ts  # Selectable time windows + CloudWatch period calculation
    ├── utils.ts      # cn() helper (Tailwind class merging)
    └── format.ts     # Number/bytes/percent/relative-age formatters

src-tauri/
├── src/lib.rs        # Tauri commands: config, SSM, ECS exec, SSH keypair, SFTP transfer
├── src/main.rs       # Entry point
├── tauri.conf.json   # App config, CSP, bundling
└── capabilities/     # Tauri permissions (filesystem, dialog, shell, opener)
```

## Coding Conventions

### TypeScript / React
- React functional components with hooks only — no class components
- TypeScript strict mode — avoid `any` unless absolutely necessary
- Path alias: `@/` maps to `src/` — use it for all imports (`import { cn } from "@/lib/utils"`)
- Use `import type` for type-only imports
- One feature component per file, colocated in its feature folder
- Feature-based folder organization under `src/features/`
- camelCase for functions/variables, PascalCase for components/types, prefix hooks with `use`

### i18n
- All user-facing strings use `useTranslation()` hook from react-i18next
- Access translations via `t("section.key")` — e.g., `t("services.title")`
- Translation keys organized by feature/domain in locale JSON files
- Language set via `ecscope.config.json` (`language` field) and applied in config store
- Two locales: `en` (clean English) and `en-emoji` (emoji-prefixed statuses)
- Add new keys to both locale files when adding UI text

### State Management
- Zustand stores with `create<StateInterface>()` pattern
- Two stores: `useConfigStore` (AWS config/credentials) and `useNavigationStore` (UI state)
- Use selectors to pick specific state: `useConfigStore((s) => s.refreshIntervalMs)`

### Data Fetching
- TanStack React Query for all reads with `refetchInterval` from config store
- Global defaults: `refetchOnWindowFocus: false`, `retry: 1`, `staleTime: 30s`
- Mutations via `useMutation` with targeted `queryClient.invalidateQueries`

### API Layer
- Singleton AWS clients initialized once in `src/api/clients.ts` via `initAwsClients()`
- Domain modules consume client getters (`getEcsClient()`, `getCwClient()`, etc.)
- `ecsApi` facade in `src/api/index.ts` composes all domain modules
- Types in `src/api/types/` map AWS SDK shapes to app-specific interfaces
- AWS SDK called directly from frontend — no backend proxy
- Handle AWS API limits with batching (e.g., 10 items per DescribeServices call)

### Rust (src-tauri)
- Keep Rust code minimal — only for Tauri commands needing OS-level access
- Used for: config file reading, terminal sessions (SSM/ECS exec), SSH keypair generation, SFTP transfer over SSM tunnel
- Tauri commands: `read_app_config`, `read_aws_files`, `open_ssm_session`, `open_ecs_exec`, `generate_ssh_keypair`, `sftp_download`, `sftp_upload`, `cancel_transfer`
- SFTP transfers emit `sftp-progress` events with percent and transfer rate

### General
- ESLint + Prettier configured — run `npm run lint` and `npm run format`
- Husky + lint-staged for pre-commit hooks
- No test framework — no test files exist
- Avoid over-engineering — no abstractions for one-time operations
- Optimize for developer experience and speed
- Think like a DevOps tool UI — information-dense, action-oriented

## UI Guidelines

- Dark mode by default with theme toggle
- Sidebar navigation with collapsible cluster list
- Tab-based feature navigation (Services, Tasks, ALB/NLB, Nodes, EC2/RDS)
- Tables for resource listing with inline actions
- `cn()` utility for conditional Tailwind classes: `className={cn("base", condition && "extra")}`
- StatusBadge for health/status indicators, MetricBar for CPU/RAM, MetricsChart for CloudWatch data
- Monospace font for logs and terminal output

## CI/CD

- **GitHub Actions** (`.github/workflows/build.yml`)
- Triggers on tagged releases
- Parallel build jobs: Windows (NSIS/MSI), macOS ARM64 (DMG), macOS x64 (DMG), Linux (DEB/AppImage/RPM)
- Drafts GitHub releases with build artifacts
- Node 22, Rust stable

## Configuration

App config loaded from `ecscope.config.json` (next to executable or CWD):
- `refreshPeriodSeconds` — polling interval
- `theme` — `dark` or `light`
- `language` — locale code (`en`, `en-emoji`)
- `clusters[]` — each with `profile`, `region`, `clusterName`, optional `sshUser`, `color`, `group`, `icon`

AWS credentials resolved from `~/.aws/credentials` + `~/.aws/config` with STS role assumption support.
