# ECScope

ECScope is a cross-platform desktop application (Tauri + React) for exploring, monitoring, and managing AWS ECS infrastructure. Think OpenLens but for ECS — clusters, services, tasks, load balancers, nodes, and databases in one place. Runs on Windows, Linux, and macOS.

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

### General
- No test framework — no test files exist
- Avoid over-engineering — no abstractions for one-time operations
- Optimize for developer experience and speed
- Think like a DevOps tool UI — information-dense, action-oriented

## UI Guidelines

- UI is custom Tailwind components — no shadcn/ui or component library
- Dark mode by default (theme configurable via config file)
- Sidebar navigation with collapsible cluster list
- Tab-based feature navigation (Services, Tasks, ALB/NLB, Nodes, EC2/RDS)
- Tables for resource listing with inline actions
- `cn()` utility for conditional Tailwind classes: `className={cn("base", condition && "extra")}`
- StatusBadge for health/status indicators, MetricBar for CPU/RAM, MetricsChart for CloudWatch data
- Monospace font for logs and terminal output

## Configuration

App config loaded from `ecscope.config.json` (next to executable or CWD):
- `refreshPeriodSeconds` — polling interval
- `theme` — `dark` or `light`
- `language` — locale code (`en`, `en-emoji`)
- `clusters[]` — each with `profile`, `region`, `clusterName`, optional `sshUser`, `color`, `group`, `icon`

AWS credentials resolved from `~/.aws/credentials` + `~/.aws/config` with STS role assumption support.
