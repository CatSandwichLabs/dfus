# Context — DFUS Project Orchestrator

## Overview
DFUS is an enterprise-grade Distributed File Storage and Sharing System inspired by GFS and HDFS, built with Node.js to handle massive 5GB+ files.

## Updated Core Specifications (2026-08-07)
1. **Direct-to-Worker Pipeline**: Client 5MB chunking -> Master returns worker endpoints + signed JWTs -> Client uploads directly to workers.
2. **Worker LRU Caching**: Workers buffer, verify hash, compress (zlib), encrypt (AES-256), stream to storage, and maintain an LRU disk cache for hot chunks.
3. **Cloud Storage Engine**: Cloudflare R2 via `@aws-sdk/client-s3` (Cloud mode) vs SQLite/Local FS (Presentation mode).
4. **Resumable 5GB Uploads**: Master tracks received chunk hashes per upload session to allow upload resumption.
5. **GitHub Secret Safety**: `.env.example` with dummy values, `.env` gitignored, Helmet CSP/HSTS, Auth rate limit 10 req / 15 min.

## Workspace Paths
- Project Root: `c:\Users\xavir\OneDrive\Desktop\DFUS`
- Metadata: `c:\Users\xavir\OneDrive\Desktop\DFUS\.agents\orchestrator`
- User Request: `c:\Users\xavir\OneDrive\Desktop\DFUS\.agents\ORIGINAL_REQUEST.md`
- Project Spec: `c:\Users\xavir\OneDrive\Desktop\DFUS\PROJECT.md`
