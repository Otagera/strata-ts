# Deploying StrataDB

StrataDB is designed to be deployed as a containerized application. Because it uses a custom storage engine that writes to disk (WAL and SSTables), it requires **persistent storage** to maintain data between restarts.

## 🚀 One-Click Deployment

The easiest way to deploy StrataDB is using a platform that supports Docker and Persistent Volumes.

### Railway / Render / Fly.io

1. **Point to the Repository:** Connect your GitHub fork (e.g., `https://github.com/Otagera/strata-ts`) to the platform.
2. **Use the Dockerfile:** The platform should automatically detect the `Dockerfile` in the root directory.
3. **Configure Persistence (CRITICAL):**
   - Create a **Persistent Volume** (or "Disk").
   - Mount the volume to the path: `/app/data`.
   - StrataDB will store all engine data in this directory. If this is not configured, data will be lost every time the container redeploys or restarts.
4. **Environment Variables:**
   - `PORT`: 2345 (Default)
   - `NODE_ENV`: production
5. **Health Check:** Point the health check to `/api/status`.

---

## 🛠 Manual Docker Deployment

If you want to run the production build locally or on a VPS using Docker:

### 1. Build the Image
```bash
docker build -t stratadb .
```

### 2. Run with Persistence
Create a local directory for data and map it to the container:

```bash
mkdir -p ./strata-data
docker run -p 2345:2345 -v $(pwd)/strata-data:/app/data stratadb
```

The UI will be accessible at `http://localhost:2345`.

---

## 🏗 Architecture Notes for Deployment

- **Port:** The server listens on port `2345` by default.
- **Routing:**
  - `/` -> Landing Page
  - `/workbench` -> Interactive DB Explorer
  - `/api/*` -> Database Engine APIs
- **Binary Data:** StrataDB writes raw binary files for the Write-Ahead Log (WAL) and Sorted String Tables (SST). Ensure your filesystem supports standard POSIX locking if running in a highly concurrent environment.
