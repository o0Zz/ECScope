You are a senior full-stack developer.

Help me build a desktop application called **ECScope**.

## 🧠 Project Overview

ECScope is a modern desktop UI (similar to OpenLens but for AWS ECS) that allows developers and DevOps engineers to explore, monitor, and manage their ECS infrastructure.

The application should run cross-platform (Windows, Linux, macOS) using **Tauri**.

## 🧱 Tech Stack

* Frontend: React + TypeScript + Vite
* Desktop: Tauri
* Backend: Minimal Rust (only for Tauri commands if needed)
* State management: Zustand
* Data fetching: TanStack Query
* UI: TailwindCSS + shadcn/ui
* AWS: AWS SDK v3 (JavaScript)

## 🎯 Core Features (MVP)

1. **Cluster Explorer**

   * List ECS clusters
   * Select a cluster to view services
   * Show cluster-level resource usage (CPU / RAM) across all services

2. **Service Viewer**

   * List services in a cluster
   * Show status, desired/running tasks
   * Show per-service CPU and RAM usage
   * **One-click scale up/down** (like OpenLens) — button to change desired count instantly

3. **Task Inspector**

   * List tasks for a service
   * Show task details (status, containers, health)

4. **Logs Viewer**

   * Fetch logs from CloudWatch
   * Stream logs in real-time (if possible)

5. **ALB Viewer**

   * List Application Load Balancers associated with services
   * Show target groups, health checks, listener rules
   * Display request count / latency metrics

6. **Node (EC2) Viewer**

   * List EC2 container instances registered to the cluster
   * Show instance type, status, CPU / RAM usage, running tasks
   * For Fargate clusters, show Fargate task-level resource view

7. **Database Metrics Dashboard**

   * Connect to RDS / Aurora instances
   * Display CPU, RAM, connections, query throughput
   * Show slow queries / performance insights when available

8. **Navigation UI**

   * Sidebar with clusters
   * Main panel with details
   * Clean developer-focused interface (like OpenLens)

## ⚙️ Requirements

* Use React functional components with hooks
* Use TypeScript everywhere
* Keep Rust minimal (only when necessary)
* Use AWS SDK directly from the frontend when possible
* Structure the project cleanly (feature-based folders)

## 📁 Suggested Structure

* src/

  * components/
  * features/

    * clusters/
    * services/
    * tasks/
    * logs/
    * alb/
    * nodes/
    * database/
  * store/
  * api/
  * layout/

## 🎨 UI Guidelines

* Dark mode by default
* Sidebar navigation (clusters/services)
* Panels and tabs for details
* Tables for listing resources
* Logs viewer with monospace font

## 🚀 Tasks

Start by:

1. Setting up the project structure
2. Creating the main layout (sidebar + main panel)
3. Implementing a mock ECS data provider
4. Building the cluster → service → task navigation flow

Then progressively add real AWS integration.

## 💡 Notes

* Optimize for developer experience and speed
* Keep components modular and reusable
* Avoid over-engineering
* Think like a DevOps tool UI

Generate clean, production-ready code.
