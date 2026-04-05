<div align="center">
  <br />
  <img src="docs/images/logo.png" alt="🛡️ LogTide" width="auto" height="120" />
  <p>
    <strong>Modern Observability & SIEM. Open Source. Multi-Engine.</strong>
  </p>

  <p>
    <a href="https://logtide.dev"><strong>☁️ Try Cloud (Free Alpha)</strong></a> •
    <a href="#self-hosting">Self-Host</a> •
    <a href="#sdks--integrations">SDKs</a> •
    <a href="https://logtide.dev/docs">Docs</a>
  </p>

  <a href="https://github.com/logtide-dev/logtide/actions/workflows/ci.yml"><img src="https://github.com/logtide-dev/logtide/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://codecov.io/gh/logtide-dev/logtide"><img src="https://codecov.io/gh/logtide-dev/logtide/branch/main/graph/badge.svg" alt="Coverage"></a>
  <a href="https://hub.docker.com/r/logtide/backend"><img src="https://img.shields.io/docker/v/logtide/backend?label=docker&logo=docker" alt="Docker"></a>
  <a href="https://artifacthub.io/packages/helm/logtide/logtide"><img src="https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/logtide" alt="Artifact Hub"></a>
  <img src="https://img.shields.io/badge/version-0.9.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/status-stable_alpha-success.svg" alt="Status">
</div>

<br />

> **🚀 RELEASE 0.9.0:** LogTide now supports **Multi-Engine Storage** (ClickHouse, MongoDB) and **Advanced Browser Observability**.

---

## 👋 What is LogTide?

LogTide is an open-source, high-performance observability platform and SIEM. It provides a unified view of **Logs, Traces, and Metrics** with built-in security detection.
Designed for teams that need **GDPR compliance**, **full data ownership**, and **sub-100ms query performance** without the overhead of ElasticSearch.

### Why LogTide?
* 🔌 **Multi-Engine:** Choose your storage — **TimescaleDB** (standard), **ClickHouse** (massive scale), or **MongoDB** (flexibility).
* 🌐 **Full-Stack Observability:** Monitor everything from backend services to browser **Web Vitals** and user sessions.
* 🛡️ **Security-First:** Native **Sigma Rules** engine for real-time threat detection and incident management.
* 🇪🇺 **GDPR Ready:** Keep data on your own infrastructure. Built-in **PII Masking** and **Audit Logs**.
* ⚡ **Lightweight:** Low RAM footprint. 5-minute setup with Docker.

---

## 📸 Screenshots

### Logs Explorer
![LogTide Logs](docs/images/logs.png)

### Performance & Metrics (New in 0.9.0)
![LogTide Metrics](docs/images/metrics.png)

### Distributed Tracing
![LogTide Traces](docs/images/traces.png)

### Error Groups
![LogTide Errors](docs/images/errors.png)

### SIEM Dashboard
![LogTide Security](docs/images/security.png)

---

## 🚀 Quick Start

### Option A: Self-Hosted (Docker) - Recommended
Total control over your data. Uses pre-built images from Docker Hub.

1.  **Download configuration**
    ```bash
    mkdir logtide && cd logtide
    curl -O https://raw.githubusercontent.com/logtide-dev/logtide/main/docker/docker-compose.yml
    curl -O https://raw.githubusercontent.com/logtide-dev/logtide/main/docker/.env.example
    mv .env.example .env
    ```

2.  **Start the stack**
    ```bash
    docker compose up -d
    ```

3.  **Access LogTide**
    * **Frontend:** `http://localhost:3000`
    * **API:** `http://localhost:8080`

> **Note:** The default `docker compose up` starts **5 services**: PostgreSQL (TimescaleDB), Redis, backend, worker, and frontend. ClickHouse, MongoDB, and Fluent Bit are opt-in via [Docker profiles](#optional-profiles) and won't run unless explicitly enabled.

#### Lightweight Setup (3 containers)

For low-resource environments like a Raspberry Pi or a homelab, use the simplified compose that removes Redis entirely:

```bash
mkdir logtide && cd logtide
curl -O https://raw.githubusercontent.com/logtide-dev/logtide/main/docker/docker-compose.simple.yml
curl -O https://raw.githubusercontent.com/logtide-dev/logtide/main/docker/.env.example
mv .env.example .env
docker compose -f docker-compose.simple.yml up -d
```

This runs only **PostgreSQL + backend + frontend**. The backend automatically uses PostgreSQL-based alternatives for job queues and live tail streaming. See the [Deployment docs](https://logtide.dev/docs/deployment#simplified-deployment) for details.

#### Optional Profiles

Enable additional services with `--profile`:

```bash
# Docker log collection (Fluent Bit)
docker compose --profile logging up -d

# System metrics (CPU, memory, disk, network)
docker compose --profile metrics up -d

# ClickHouse storage engine
docker compose --profile clickhouse up -d

# MongoDB storage engine
docker compose --profile mongodb up -d

# Combine profiles
docker compose --profile logging --profile metrics up -d
```

### Option B: Cloud (Fastest & Free)
We host it for you. Perfect for testing. [**Sign up at logtide.dev**](https://logtide.dev).

---

## ✨ Core Features (v0.9.0)

* 🚀 **Multi-Engine Reservoir:** Pluggable storage layer supporting **TimescaleDB**, **ClickHouse**, and **MongoDB**.
* 🌐 **Browser SDK Enhancements:** Automatic collection of **Web Vitals** (LCP, INP, CLS), user session tracking, and click/network breadcrumbs.
* 📈 **Golden Signals:** Automated P50/P95/P99 latency, error rates, and throughput charts.
* 🔍 **Smart Search:** Combined **Full-text** and **Substring** search modes with sub-100ms response times.
* 🛡️ **SIEM & Incident Management:** Sigma rules engine, MITRE ATT&CK mapping, and collaborative incident workflows.
* 🕵️ **PII Masking:** Detect and redact sensitive data (emails, credit cards, IPs) at ingestion time.
* 📜 **Audit Logs:** Track all user and system actions for SOC2/GDPR compliance.
* 🔗 **Event Correlation:** Trace logs across services using `trace_id`, `session_id`, or custom correlation keys.

---

## 📦 SDKs & Integrations

Ready-to-use SDKs with auto-instrumentation and distributed tracing.

| Language | Status | Package / Link |
| :--- | :--- | :--- |
| **Browser (JS/TS)** | ✅ Ready | [`@logtide/browser`](https://github.com/logtide-dev/logtide-javascript) |
| **Node.js** | ✅ Ready | [`@logtide/sdk-node`](https://www.npmjs.com/package/@logtide/sdk-node) |
| **Python** | ✅ Ready | [`logtide-sdk`](https://pypi.org/project/logtide-sdk/) |
| **Go** | ✅ Ready | [`logtide-sdk-go`](https://github.com/logtide-dev/logtide-sdk-go) |
| **PHP** | ✅ Ready | [`logtide/logtide`](https://packagist.org/packages/logtide/logtide) |
| **Kotlin** | ✅ Ready | [`logtide-sdk-kotlin`](https://github.com/logtide-dev/logtide-sdk-kotlin) |
| **C# / .NET** | ✅ Ready | [`LogTide.SDK`](https://github.com/logtide-dev/logtide-sdk-csharp) |
| **Docker** | ✅ Ready | [Fluent Bit / Syslog Guide](#option-a-self-hosted-docker---recommended) |
| **HTTP API** | ✅ Ready | [API Reference](https://logtide.dev/docs/api) |
| **OpenTelemetry** | ✅ Ready | **Native OTLP support** (Logs, Traces, Metrics) |

---

## 🏗️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | SvelteKit 5 (Runes) + TailwindCSS + ECharts |
| **Backend** | Fastify (Node.js) + TypeScript |
| **Storage** | TimescaleDB / ClickHouse / MongoDB |
| **Detection** | Sigma YAML Engine |

---

## 📄 License

Distributed under the **GNU AGPLv3** License. See `LICENSE` for more information.

---

<div align="center">
  <br />
  <p>Built with ❤️ in Europe</p>
  <p>
    <a href="https://logtide.dev"><strong>Start for Free</strong></a> •
    <a href="https://github.com/logtide-dev/logtide/issues">Report a Bug</a>
  </p>
</div>
