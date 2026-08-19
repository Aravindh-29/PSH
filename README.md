# PSH — Pure Storage Horizon Ticketing System

An internal IT ticketing platform built for ~1000 users.  
**Stack:** React 18 + Vite · Node.js / Express · PostgreSQL 17 · Docker · Kubernetes

---

## Quick links

| Resource | URL / Reference |
|---|---|
| Docker Hub image | `aravindh146/psh:latest` |
| GitHub repo | https://github.com/Aravindh-29/PSH |
| App (local dev) | http://localhost:5173 |
| App (Docker / K8s) | http://localhost:5000 |

---

## Default accounts

| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `Admin@123` |
| Employee | `john.smith` | `Employee@123` |
| Employee | `sarah.johnson` | `Employee@123` |
| Employee | `mike.davis` | `Employee@123` |

---

## Option 1 — Local development (Node + PostgreSQL)

### Prerequisites

- Node.js 20+
- PostgreSQL 17 running locally
- PowerShell or any terminal

### 1. Clone the repo

```powershell
git clone https://github.com/Aravindh-29/PSH.git
cd PSH
```

### 2. Create the environment file

```powershell
# Copy the example and edit if needed
Copy-Item .env.example .env
```

Default `.env` content (edit DB credentials if yours differ):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/psh_ticketing
SESSION_SECRET=psh-super-secret-change-in-production-2024
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

### 3. Install all dependencies

```powershell
# Root (workspace scripts)
npm install

# Server
cd server
npm install
cd ..

# Client
cd client
npm install
cd ..
```

Or run everything in one shot with the helper script:

```powershell
# PowerShell — install all at once
@(".", "server", "client") | ForEach-Object { Push-Location $_; npm install; Pop-Location }
```

### 4. Initialise the database

```powershell
cd database
npm install   # installs argon2, pg, dotenv for this script
node init.js
cd ..
```

This creates the `psh_ticketing` database, applies the schema, seeds modules / categories, and creates all default user accounts.

### 5. Start the app

Open **two terminals**:

**Terminal 1 — API server**
```powershell
cd server
npm run dev
# Listening on http://localhost:5000
```

**Terminal 2 — React client**
```powershell
cd client
npm run dev
# Vite dev server at http://localhost:5173
```

Open **http://localhost:5173** in your browser and log in.

---

## Option 2 — Run on KillerCoda (free, no install needed)

> Try the full app in a live Kubernetes cluster in your browser — zero setup required.

### Steps

**1. Open a free Kubernetes playground**

Go to → **https://killercoda.com/playgrounds/scenario/kubernetes**

Click **Start** and wait ~30 seconds for the cluster to be ready.

---

**2. Deploy everything with one command**

Paste this into the terminal:

```bash
kubectl apply -f https://raw.githubusercontent.com/Aravindh-29/PSH/main/k8s/psh-all.yaml
```

---

**3. Wait for all pods to be Running**

```bash
kubectl get pods -n psh -w
```

Wait until you see all three pods with `Running` status and `1/1` ready:

```
NAME                        READY   STATUS    RESTARTS
postgres-xxxx               1/1     Running   0
psh-app-xxxx                1/1     Running   0
psh-app-yyyy                1/1     Running   0
```

> The `psh-app` pods have an init container that auto-creates the database schema and seeds all user accounts before the server starts. First startup takes ~60 seconds.

---

**4. Open the app**

Click the **"Traffic / Ports"** tab at the top of the KillerCoda terminal panel, enter port **`30080`**, and click **Access**.

Or get the node IP and open it manually:

```bash
kubectl get nodes -o wide
# copy the INTERNAL-IP of the node
```

Then open: `http://<node-ip>:30080`

---

**5. Log in**

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Employee | `john.smith` | `Employee@123` |

---

**Tear down when done**

```bash
kubectl delete -f https://raw.githubusercontent.com/Aravindh-29/PSH/main/k8s/psh-all.yaml
```

---

## Option 3 — Docker Compose (one command, local)

### Prerequisites

- Docker Desktop (Windows) or Docker Engine (Linux/WSL)

### Run

```powershell
# From the project root
docker compose up --build
```

This will:
1. Start PostgreSQL with a persistent volume
2. Run `database/init.js` to create the schema and seed accounts
3. Start the Express server (serves both the API and the built React app)

Open **http://localhost:5000** once all three services are healthy.

#### Using WSL (PowerShell → WSL)

```powershell
wsl -d Ubuntu-22.04 -- bash -c "cd '/mnt/c/Users/<your-username>/path/to/PSH' && docker compose up --build"
```

#### Stop and remove containers

```powershell
docker compose down          # keep the database volume
docker compose down -v       # also wipe the database
```

---

## Option 4 — Kubernetes (your own cluster)

### Prerequisites

- `kubectl` configured and pointing at your cluster
- Image already on Docker Hub (`aravindh146/psh:latest`)

### Deploy everything with one command

```bash
kubectl apply -f k8s/psh-all.yaml
```

This creates in the `psh` namespace:

| Resource | Kind | Purpose |
|---|---|---|
| `psh` | Namespace | Isolates all resources |
| `psh-secrets` | Secret | DB URL, session secret, PG password |
| `psh-config` | ConfigMap | Non-sensitive env vars |
| `postgres-pvc` | PVC | 5 Gi persistent storage for PostgreSQL |
| `postgres` | Deployment | PostgreSQL 17 pod |
| `postgres-svc` | Service (ClusterIP) | Internal DB access |
| `psh-app` | Deployment | Express + React app (2 replicas) |
| `psh-app-svc` | Service (LoadBalancer) | External access on port 80 |

The `psh-app` deployment has an **init container** that waits for PostgreSQL to be ready, then runs `database/init.js` automatically before the main server starts.

### Watch pods come up

```bash
kubectl get pods -n psh -w
```

### Get the app URL

```bash
# Cloud (LoadBalancer gets an external IP)
kubectl get svc psh-app-svc -n psh

# Minikube
minikube service psh-app-svc -n psh
```

### Tear down

```bash
kubectl delete -f k8s/psh-all.yaml
```

---

## Build & push the Docker image yourself

```bash
# Build
docker build -t aravindh146/psh:latest .

# Push
docker push aravindh146/psh:latest
```

---

## Project structure

```
PSH/
├── client/                  # React 18 + Vite frontend
│   ├── src/
│   │   ├── pages/           # Dashboard, Tickets, Reports, KnowledgeBase …
│   │   ├── components/      # Sidebar, Topbar, Badge …
│   │   ├── context/         # AuthContext
│   │   └── api/             # Axios instance
│   └── package.json
│
├── server/                  # Node.js / Express backend
│   ├── src/
│   │   ├── controllers/     # dashboard, tickets, users, reports, kb …
│   │   ├── routes/
│   │   ├── middleware/      # auth (RBAC), errorHandler
│   │   └── db/              # pg pool
│   └── package.json
│
├── database/
│   ├── schema.sql           # All tables, sequences, indexes
│   ├── seed.sql             # Modules & categories
│   └── init.js              # One-time setup script (creates DB + seeds users)
│
├── k8s/
│   └── psh-all.yaml         # Complete Kubernetes manifests
│
├── Dockerfile               # Multi-stage: builds React → runs Express
├── docker-compose.yml       # Local all-in-one stack
└── .env.example             # Environment variable template
```

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session signing key — use a long random string in production |
| `PORT` | No | Server port (default `5000`) |
| `NODE_ENV` | No | `development` or `production` |
| `CLIENT_URL` | No | CORS allowed origin (default `http://localhost:5173`) |
