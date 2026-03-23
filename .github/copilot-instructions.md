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

2. **Service Viewer**

   * List services in a cluster
   * Show status, desired/running tasks

3. **Task Inspector**

   * List tasks for a service
   * Show task details (status, containers, health)

4. **Logs Viewer**

   * Fetch logs from CloudWatch
   * Stream logs in real-time (if possible)

5. **Navigation UI**

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
