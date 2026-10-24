# Agentic Intelligence: AI Voice Agent & Codebase RAG

A production-grade, self-hosted AI Voice Agent and GitHub Repository Intelligence platform built natively with **Bun**, **TypeScript**, **Next.js 14**, **Express**, **LiveKit WebRTC**, **Google Gemini Multimodal Live API**, and **PostgreSQL with pgvector**.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │             End User                   │
                      │  https://agentic.dabelwal.online       │
                      └───────▲────────────────────────▲───────┘
                              │ HTTPS                  │ WebRTC Audio
                              │                        │
       ┌──────────────────────▼───────┐     ┌──────────▼────────────────────────┐
       │     EC2 Instance 1: Web      │     │  EC2 Instance 3: LiveKit & Voice  │
       │  Next.js 14 UI               │     │  LiveKit SFU (UDP 50000-60000)    │
       │  CodeViewerDrawer            │     │  Voice Agent Worker (Gemini Live) │
       │  Caddy SSL Reverse Proxy     │     │  Caddy SSL (livekit.dabelwal.online│
       └──────────────┬───────────────┘     └──────────┬────────────────────────┘
                      │                                │
                      │ REST / SSE API                 │ Internal RAG Queries
                      │                                │
       ┌──────────────▼────────────────────────────────▼──────┐
       │             EC2 Instance 2: API & Data               │
       │  Express 4 Backend + Better-Auth                     │
       │  BullMQ Ingestion Queue + Git Clone Worker           │
       │  PostgreSQL 16 + pgvector (HNSW Cosine Index)        │
       │  Redis 7 Cache & Job Queue                           │
       │  Caddy SSL (api.dabelwal.online)                     │
       └──────────────────────────────────────────────────────┘
```

---

## 3-Instance Production Topology

| Instance | Subdomain | Services Running | Open Security Group Ports |
| :--- | :--- | :--- | :--- |
| **Instance 1 (Frontend)** | `agentic.dabelwal.online` | Next.js 14 Web Frontend, Caddy SSL Proxy | TCP 80, 443, 22 (SSH) |
| **Instance 2 (Backend & DB)** | `api.dabelwal.online` | Express API, PostgreSQL (`pgvector`), Redis, Caddy SSL Proxy | TCP 80, 443, 22 (SSH) |
| **Instance 3 (LiveKit & Voice)** | `livekit.dabelwal.online` | LiveKit SFU Server, LiveKit Voice Agent Worker, Caddy SSL | TCP 80, 443, 7880, 22 (SSH), **UDP 50000–60000** |

---

## Key Features

1. **Self-Hosted LiveKit Voice Agent**:
   - WebRTC bidirectional audio streaming.
   - Powered by **Google Gemini Multimodal Live API** (`gemini-2.0-flash-exp`) for sub-second, natural speech-to-speech interaction.
   - Equipped with function-calling tools (`searchCodebase`, `explainSymbol`, `readFileRange`).
   - Streams citation metadata over WebRTC room data channels, opening and highlighting relevant code lines in the web drawer in sync with speech!

2. **Codebase Intelligence & RAG**:
   - Syntax-aware code chunking (AST/boundary-aware) keeping line numbers intact.
   - 768-dimensional embeddings generated with Google Gemini (`text-embedding-004`).
   - PostgreSQL `pgvector` storage with HNSW cosine similarity index.
   - Recursive CTE graph walk query for symbol call-chain and dependency traversal.
   - Strict citation validation: every cited range `[file#Lstart-Lend]` is verified against indexed chunks.

3. **CI/CD via GitHub Actions**:
   - Multi-stage Docker builds for `agentic-api`, `agentic-web`, and `agentic-voice-agent`.
   - Pushes images to Docker Hub.
   - Deploys via SSH to all 3 EC2 instances in parallel.
   - Caddy reverse proxy automatically provisions and renews Let's Encrypt SSL certificates.

---

## Local Development

### Prerequisites
- [Bun](https://bun.sh) (v1.1+)
- [Docker Desktop](https://www.docker.com)

### 1. Install Dependencies
```bash
bun install
```

### 2. Start Local Database, Redis & LiveKit
```bash
docker compose -f infra/docker-compose.local.yml up -d
```

### 3. Generate Database Client & Push Schema
```bash
bun run --cwd packages/database db:generate
bun run --cwd packages/database db:push
```

### 4. Configure Environment
```bash
cp .env.example .env
```
Ensure `GEMINI_API_KEY` is set in `.env`.

### 5. Start Services
In separate terminal windows:
```bash
# Terminal 1: API Backend
bun run dev:api

# Terminal 2: Web Frontend
bun run dev:web

# Terminal 3: LiveKit Voice Agent Worker
bun run dev:voice
```
Open [http://localhost:3000](http://localhost:3000) in your browser!

---

## GitHub Actions Secrets

To enable automated CI/CD deployment, add the following secrets in **GitHub Repository Settings -> Secrets and variables -> Actions**:

| Secret Name | Description | Example |
| :--- | :--- | :--- |
| `DOCKERHUB_USERNAME` | Docker Hub username | `dabelwal` |
| `DOCKERHUB_TOKEN` | Docker Hub Personal Access Token | `dckr_pat_...` |
| `EC2_SSH_KEY` | Private SSH key (PEM format) | `-----BEGIN RSA PRIVATE KEY-----...` |
| `EC2_USER` | EC2 SSH username | `ubuntu` or `ec2-user` |
| `EC2_FRONTEND_HOST` | Instance 1 public IP or domain | `agentic.dabelwal.online` |
| `EC2_BACKEND_HOST` | Instance 2 public IP or domain | `api.dabelwal.online` |
| `EC2_VOICE_HOST` | Instance 3 public IP or domain | `livekit.dabelwal.online` |
