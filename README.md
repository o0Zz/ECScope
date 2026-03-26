# ECScope

> **Deep visibility into your AWS ECS workloads**

ECScope is a modern, intuitive UI for exploring, monitoring, and managing your Amazon ECS infrastructure.
It gives you a clear, real-time view of your clusters, services, and tasks — all in one place.
## How to run it

### 1. ~/.aws/credentials ~/.aws/config 
Make sure you have `~/.aws/credentials` `~/.aws/config` available, ECScope use it to conenct to your cluster

### 2. Install SSM
`winget install Amazon.SessionManagerPlugin`

### 3. Install AWS Cli
`msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi`

### 4. ecscope.config.json
Create your configure file
```
{
    "refreshPeriodSeconds": 10,
    "clusters": [
        {
            "profile": "my-profile1",
            "region": "eu-west-1",
            "clusterName": "my-cluster"
        },
        {
            ...
        }
    ],
    "storage": {
        "s3Bucket": "my-diagnostics-bucket",
        "s3AccessKeyId": "AKIA...",
        "s3SecretAccessKey": "wJalr...",
        "s3Region": "eu-west-1"
    }
}
```

List all your cluster in clusters:

 - `profile`: Profile that match your `~/.aws/config` `[profile]`
 - `region`: Region of your cluster
 - `clusterName`: Name of your cluster in AWS web interface

Define a S3 bucket for download/upload/diagnostic feature. If you plan to use these feature you will have to define a S3 that you ec2 have access.
ECScope use S3 as temporary storage to extract file from EC2 or push them via S3.


## ✨ Features

### 🔍 Explore Your Infrastructure

* Browse clusters, services, and tasks
* SSH, Logs, Environement varilable, Metrics
* Clean and intuitive navigation

### 📊 Real-Time Observability

* Task status and health monitoring
* Deployment tracking
* Resource usage insights (CPU, memory)

### 📜 Live Logs

* Stream logs in real time
* Search and filter logs
* Cntralized access to task logs

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


### Build

`npx xxx`

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
