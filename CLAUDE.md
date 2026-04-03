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
| AWS | AWS SDK v3 (ECS, EC2, CloudWatch, ELBv2, RDS, S3, SSM, STS, Secrets Manager) |
| Logging | tslog with domain-specific sub-loggers |

UI is custom Tailwind components — no shadcn/ui or component library.

## Common Commands

```bash
npm ci                # Install dependencies
npx tauri dev         # Dev server + Tauri window (frontend on port 1420)
npx tauri build       # Production build for current platform
npm run build         # Frontend-only build (tsc + vite)
```

No test framework is configured.

## Project Structure

```
src/
├── api/              # AWS SDK clients and domain API modules
│   ├── clients.ts    # Singleton AWS client init (initAwsClients, getEcsClient, etc.)
│   ├── ecs.ts, alb.ts, cloudwatch.ts, ssm.ts, s3.ts, ec2.ts, rds.ts
│   ├── index.ts      # Barrel export + ecsApi facade
│   └── types/        # TypeScript interfaces per AWS domain
├── components/       # Reusable UI primitives (MetricsChart, StatusBadge, MetricBar, etc.)
├── config/
│   ├── config.ts     # Loads ecscope.config.json via Tauri command
│   └── aws-credentials.ts  # AWS profile/credential resolution + STS role assumption
├── features/         # Feature modules by domain
│   ├── welcome/      # Welcome view (before cluster selection)
│   ├── services/     # ServiceList (status, CPU/RAM, scaling)
│   ├── tasks/        # TaskList, TaskRow, EnvVarPanel, TaskActions
│   ├── albnlb/       # AlbNlbViewer (load balancers, target groups, health, metrics)
│   ├── nodes/        # NodeViewer (EC2 instances, SSM, file transfer via SSH tunnel)
│   └── ec2rds/       # Ec2RdsDashboard
├── layout/           # App shell: Sidebar, MainPanel, Breadcrumb, TabBar
├── store/
│   ├── config.ts     # Clusters, credentials, connection state (Zustand)
│   └── navigation.ts # Selected cluster/service/task, activeTab, sidebar (Zustand)
└── lib/
    ├── logger.ts     # tslog with sub-loggers and sensitive data masking
    ├── utils.ts      # cn() helper (Tailwind class merging)
    └── format.ts     # Formatting utilities

src-tauri/
├── src/lib.rs        # Tauri commands: config loading, SSM sessions, ECS exec, SSH/SFTP
├── src/main.rs       # Entry point
├── tauri.conf.json   # App config, CSP, bundling
└── capabilities/     # Tauri permissions (filesystem, dialog, shell)
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
- Used for: config file reading, terminal sessions (SSM/ECS exec), SSH tunneling, SFTP

### General
- No linter or formatter configured — TypeScript strict mode enforces quality
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

- **Azure Pipelines** (`azure-pipelines.yml`)
- Triggers on `develop` and `release/*` branches
- 4 parallel build jobs: Windows (NSIS/MSI), macOS ARM64 (DMG), macOS x64 (DMG), Linux (DEB/AppImage/RPM)
- Version from branch name (`release/X.Y.Z`) or `0.0.0` for develop
- Artifacts uploaded to JFrog Artifactory
- Node 22, Rust stable

## Configuration

App config loaded from `ecscope.config.json` (next to executable or CWD):
- `refreshPeriodSeconds` — polling interval
- `clusters[]` — each with `profile`, `region`, `clusterName`, optional `sshUser`
- `storage` — optional S3 config for diagnostics (bucket, credentials, region)

AWS credentials resolved from `~/.aws/credentials` + `~/.aws/config` with STS role assumption support.
