# Master Orchestration Plan — DFUS Project

## Strategy
Using Project Orchestrator pattern with Dual Track (Implementation Track + E2E Testing Track) updated for High-Performance 5GB+ Distributed Architecture.

### Key Architectural Updates (User Spec 2026-08-07):
1. **Direct-to-Worker Pipeline**:
   - Client performs 5MB stream chunking via Web File API.
   - Master issues signed chunk JWTs and worker endpoint assignments (`POST /api/files/init-upload`).
   - Client streams chunks directly & concurrently to multiple Worker endpoints.
2. **Worker LRU Caching**:
   - Workers buffer, hash, compress (zlib), encrypt (AES-256), and stream to storage engine.
   - Workers maintain an LRU (Least Recently Used) disk cache of hot chunks for zero-latency repeated downloads.
3. **Storage & Cloud Provider**:
   - Cloud Mode uses Cloudflare R2 via `@aws-sdk/client-s3`.
   - Presentation Mode uses SQLite + Local FS.
4. **Resumable 5GB Uploads**:
   - Master tracks uploaded chunk hashes per upload session so client can resume 5GB uploads if interrupted.
5. **GitHub Secret Safety & Security**:
   - Strict dotenv loading, comprehensive `.env.example` with dummy values, `.env` strictly gitignored, Helmet CSP/HSTS, rate limiting (10 req/15min for Auth).

### Phase Execution Roadmap
- **Phase 1: E2E Verification Track** (DONE - 15/15 tests passing).
- **Phase 2: Milestone Execution** (M1 to M10).
  - M1: Initialization & Baseline Infra (IN_PROGRESS)
  - M2: Database Layer & Resumable Upload Schema
  - M3: Authentication & Signed Worker Chunk JWTs
  - M4: Storage Engine & Cloud R2 Provider (@aws-sdk/client-s3)
  - M5: Worker Nodes & LRU Disk Caching
  - M6: Heartbeats & Resumable Upload Engine
  - M7: File Management & Folder Hierarchy
  - M8: Sharing & Direct-to-Worker JWT Authorization
  - M9: Client Interface (Vanilla JS 5MB Chunking & Direct Upload)
  - M10: Polish, CLI Tooling & Analytics
- **Phase 3: Final Gate & Forensic Audit**
- **Phase 4: Sentinel Handoff**
