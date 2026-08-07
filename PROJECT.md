# Project: Distributed File Storage and Sharing System (DFUS)

## Architecture
DFUS is an epic, enterprise-grade, high-performance distributed file storage and sharing system inspired by GFS and HDFS, built with Node.js to handle massive 5GB+ files.
- **Topology**: Master-Worker Topology. Single Master Node (`src/master`) orchestrating N Worker Nodes (`src/worker`).
- **Direct-to-Worker Pipeline**:
  - Client performs 5MB chunking using Web File API / Streams.
  - Master handles upload initialization (`POST /api/files/init-upload`), returns assigned worker endpoints + signed JWT tokens per chunk.
  - Client uploads chunks directly and concurrently to multiple Worker endpoints (`POST http://worker:port/api/chunks/:hash`).
- **Worker LRU Disk Caching**:
  - Worker nodes verify SHA-256 chunk hash, apply zlib compression and AES-256 encryption at rest.
  - Workers maintain an LRU (Least Recently Used) disk cache of hot chunks for instant zero-latency repeated downloads.
- **Dual-Mode System**:
  - Presentation Mode (`MODE=presentation`): `SqliteMetadataRepo` (better-sqlite3) + `LocalStorageRepo` (Local FS).
  - Cloud Mode (`MODE=cloud`): `MongoMetadataRepo` (MongoDB Atlas) + `R2StorageRepo` (Cloudflare R2 via `@aws-sdk/client-s3`).
- **Resumable 5GB Uploads**: Master tracks received chunk hashes per upload session allowing clients to query progress (`GET /api/files/:uploadId/status`) and resume interrupted uploads.
- **GitHub Secret Safety & Security**: Strict dotenv loading, comprehensive `.env.example` with dummy values, `.env` gitignored, Helmet CSP/HSTS headers, auth rate limiting (10 req / 15 min).

## Code Layout
```
c:\Users\xavir\OneDrive\Desktop\DFUS\
├── src/
│   ├── config/             # Environment, constants, database/storage factories
│   ├── repositories/       # IMetadataRepository, IStorageRepository, SQLite, Mongo, Local, R2 (@aws-sdk/client-s3)
│   ├── master/             # Express Master server, controllers (init-upload, complete-upload, resume), routes, middleware
│   ├── worker/             # Express Worker server, LRU cache service, controllers, routes, middleware
│   ├── services/           # Chunker, ChunkService, ConsistentHash, Heartbeat, Replication, EventBus, Webhook, ResumableUpload
│   ├── cli/                # CLI companion tool
│   └── utils/              # Crypto, compression, logging, error handlers
├── client/                 # Vanilla HTML/CSS/JS frontend (Dark theme + Glassmorphism, 5MB chunking, direct-to-worker stream uploader)
├── tests/                  # Unit, Integration, and Automated E2E verification test suite
├── scripts/                # Start cluster, seed scripts, benchmark scripts
└── .agents/                # Orchestrator & subagent metadata (no code)
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Cluster & Middleware Baseline | Express Master/Worker, env validation, helmet CSP/HSTS, rate-limiting (10 req/15min auth, 200 general), Winston logger, graceful shutdown | M1 | Update Spec |
| 2 | DB Repository Layer | SQLite & Mongo repos implementing IMetadataRepository, resumable upload tracking schema | M2 | Update Spec |
| 3 | Authentication & Security | Local JWT (login/register), signed chunk JWT tokens for direct worker upload, 2FA (TOTP), API Keys, RBAC, Refresh tokens | M3 | Update Spec |
| 4 | Storage Engine & Cloud Provider | Stream chunking (5MB), SHA-256, hash ring, dedup, zlib compression, AES-256 encryption, R2StorageRepo via `@aws-sdk/client-s3` | M4 | Update Spec |
| 5 | Worker Nodes & LRU Caching | Worker chunk CRUD, self-registration, LRU disk cache for hot chunks, circuit breaker | M5 | Update Spec |
| 6 | Heartbeats & Resumable Uploads | Worker ping loop, dead node eviction, background chunk re-replication, resumable 5GB upload tracking | M6 | Update Spec |
| 7 | File Management | File/Folder CRUD, hierarchy (`parentId`), file versioning, soft delete / trash, search, tagging | M7 | Update Spec |
| 8 | Sharing & Direct Worker JWTs | Direct-to-Worker upload authorization JWTs, WebSockets (live stats), Webhooks with HMAC, Public Shares | M8 | Update Spec |
| 9 | Client Interface | Vanilla JS 5MB client-side chunking, Direct-to-Worker concurrent upload, Dark Glassmorphism, Packet Matrix, speed/ETA | M9 | Update Spec |
| 10 | Polish, CLI & Analytics | CLI companion tool, analytics endpoints/aggregation, benchmark script, secret safety verification | M10 | Update Spec |
| 11 | E2E Automated Verification | Automated E2E test suite (Jest/Supertest) testing upload, chunking across workers, retrieve, delete | E2E Track | Spec/AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Test Suite | Automated E2E verification script (Jest/Supertest) written BEFORE core features | M1 | DONE |
| M1 | Initialization & Baseline Infra | Server init, middleware (rate-limit, cors, helmet CSP/HSTS), logger, graceful shutdown | None | DONE |
| M2 | Database Layer (SQLite + Mongo) | Complete SqliteMetadataRepo, implement MongoMetadataRepo, full IMetadataRepository methods, resumable upload schema | M1 | PLANNED |
| M3 | Authentication & Security | Local JWT login/register, signed chunk JWT tokens for direct worker uploads, 2FA TOTP, API Keys, Refresh tokens | M2 | PLANNED |
| M4 | Storage Engine & Cloud Provider | Stream chunking (5MB), hash ring fix, dedup, zlib compression, AES-256 encryption, R2StorageRepo via `@aws-sdk/client-s3` | M2 | PLANNED |
| M5 | Worker Nodes & LRU Caching | Worker chunk CRUD, self-registration, LRU disk cache for hot chunks, circuit breaker | M4 | PLANNED |
| M6 | Heartbeats & Resumable Engine | Heartbeat ping loop, dead node handling, background chunk re-replication, resumable 5GB upload session tracking | M5 | PLANNED |
| M7 | File Management | Folders (`parentId`), file CRUD, versioning, trash/restore, search API, tagging | M2, M4 | PLANNED |
| M8 | Sharing & Direct Worker JWTs | Direct-to-Worker upload JWT tokens, WebSockets server/client, Webhooks queue with HMAC, Public Share links | M3, M7 | PLANNED |
| M9 | Client Interface | Vanilla JS 5MB stream chunking, direct-to-worker upload, Glassmorphism CSS, Packet Matrix, transfer speed/ETA | M7, M8 | PLANNED |
| M10 | Polish, CLI & Analytics | CLI companion tool, analytics service & API, system benchmarks, secret safety audit | M8, M9 | PLANNED |

## Interface Contracts
### Master ↔ Client (Direct-to-Worker Upload Flow)
- `POST /api/files/init-upload`: Client sends `{ filename, size, totalChunks, chunkHashes }`. Master returns `{ uploadId, fileId, chunks: [{ chunkIndex, hash, workerUrls: [...], uploadJwt }] }`.
- `GET /api/files/upload-status/:uploadId`: Client checks progress of 5GB upload to resume missing chunks.
- `POST /api/files/complete-upload`: Client sends `{ uploadId, fileId }` after all workers confirm chunk uploads.

### Client ↔ Worker (Direct Upload)
- `POST http://worker:port/api/chunks/:hash`: Client sends 5MB raw chunk payload with `Authorization: Bearer <uploadJwt>`. Worker verifies JWT, hashes, compresses, encrypts, writes to storage & LRU cache, returns 201.
- `GET http://worker:port/api/chunks/:hash`: Client requests chunk. Worker returns chunk from LRU cache if hot, else loads from storage engine.
