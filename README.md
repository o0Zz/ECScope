# ECScope

> **Deep visibility into your AWS ECS workloads**

ECScope is a modern, intuitive UI for exploring, monitoring, and managing your Amazon ECS infrastructure.
It gives you a clear, real-time view of your clusters, services, and tasks — all in one place.
## How to run it

### Dependencies to install
`winget install Amazon.SessionManagerPlugin`


## ✨ Features

### 🔍 Explore Your Infrastructure

* Browse clusters, services, and tasks بسهولة
* Drill down from cluster → service → task
* Clean and intuitive navigation

### 📊 Real-Time Observability

* Task status and health monitoring
* Deployment tracking
* Resource usage insights (CPU, memory)

### 📜 Live Logs

* Stream logs in real time
* Search and filter logs بسهولة
* Centralized access to task logs

### ⚡ Fast & Developer-Friendly

* Lightweight and responsive UI
* Designed for daily ops workflows
* Built for clarity and speed

---

## 🚀 Why ECScope?

Managing ECS via the AWS Console can be:

* fragmented
* slow
* hard to navigate at scale

ECScope provides a **focused, developer-centric interface** to:

* understand what’s running
* debug issues faster
* operate ECS with confidence

> Think of ECScope as your control panel for ECS.

* Debug failing tasks or crashing containers
* Monitor deployments and rollouts
* Explore infrastructure in real time
* Improve team visibility on ECS workloads
* Additional tooling: Coredump, tcpdump, download...

---


## ⚙️ Build

### Prerequisites

 - Install rust: https://rustup.rs/
 - Install Node: https://nodejs.org/en/download

### Install dependencies

`npm ci`

## 🧱 Architecture (high-level)

```text
[ ECScope UI ]
       ↓
[ Backend API / Proxy ]
       ↓
[ AWS ECS + CloudWatch APIs ]
```

* UI communicates with a backend service
* Backend interacts with AWS APIs securely
* Optional caching for performance

---

## 📦 Roadmap

* [ ] CloudWatch metrics integration
* [ ] Multi-cluster support
* [ ] Role-based access control (RBAC)
* [ ] CLI companion
* [ ] Plugin system
* [ ] Alerts & notifications

---

## ⚙️ Getting Started

### Prerequisites

* AWS account
* IAM credentials with ECS + CloudWatch access

### Installation

```bash
git clone https://github.com/your-org/ecscope.git
cd ecscope
```

```bash
# install dependencies
npm install
```

```bash
# start the app
npm run dev
```

---

## 🔐 Configuration

Set your AWS credentials using:

* Environment variables
* AWS profiles (`~/.aws/credentials`)
* IAM roles (recommended for production)

Example:

```bash
export AWS_PROFILE=default
```

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repo
2. Create a feature branch
3. Submit a pull request

---

## 📄 License

MIT

---

## 💡 Inspiration

ECScope is inspired by tools like OpenLens, but focused on the AWS ECS ecosystem.

---

## ⭐️ Support

If you find ECScope useful, consider giving it a star ⭐
