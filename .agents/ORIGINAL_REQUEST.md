# Original User Request

## 2026-08-07T08:14:18Z

# Teamwork Project Prompt

You are building a **Distributed File Storage and Sharing System** — an epic, enterprise-grade, production-ready project. This is a real distributed system inspired by Google File System (GFS) and Hadoop Distributed File System (HDFS), built from scratch with Node.js.

Working directory: `c:\Users\xavir\OneDrive\Desktop\DFUS`
Integrity mode: development

## Requirements

### R1. Architecture & Code Structure
- Dual-Mode System (Presentation mode with SQLite/Local FS vs Cloud mode with MongoDB/R2) via `.env`.
- Master-Worker Topology: One Master Node orchestrating N Worker Nodes.
- Strict Repository Pattern for database and storage access.
- Strict modular folder structure with no floating files.

### R2. Feature Implementation (Build Stages)
You must implement the system according to the following stages. Note: I have already built parts of the foundational architecture in the working directory. Please review the codebase first and continue building from where I left off, ensuring it matches this spec:
1. Initialization (Express, env, logging, errors, rate limiting, etc.)
2. Database Layer (Interfaces, SQLite, MongoDB)
3. Authentication (JWT, 2FA, API Keys, RBAC)
4. Storage & Chunking (Streams, Hash, Dedup, Compression, Encryption)
5. Worker Nodes (Chunk CRUD, self-registration, circuit breaker)
6. Heartbeats & Replication
7. File Management (CRUD, folders, versioning, trash, search, tags)
8. Sharing & Communication (WebSockets, Webhooks, Public Shares)
9. Client Interface (Vanilla HTML/CSS/JS with Dark Theme/Glassmorphism)
10. Polish & Tooling (CLI companion, analytics, testing)

### R3. Non-Negotiable Constraints
- Budget: ₹0. Use only free, open-source libraries.
- ALL database and storage access must go through interfaces.
- Streaming I/O only. Files NEVER fully loaded into memory.
- Proper error handling and security by default.

## Acceptance Criteria

### E2E Testing Verification
- [ ] The agent team MUST write an automated End-to-End (E2E) verification script (e.g., using Jest/Supertest or similar) BEFORE implementing the core features.
- [ ] The E2E script must programmatically test the full lifecycle: uploading a file, verifying it is chunked and stored across multiple workers, retrieving the file, and deleting it.
- [ ] The system must pass this E2E test suite with 0 failures to be considered complete.

## Follow-up — 2026-08-07T08:29:57Z

Status update request: You have been running for over 15 minutes. Can you provide a quick update on your current progress against the DFUS Build Stages and the E2E verification test?

## Follow-up — 2026-08-07T08:33:48Z

Updated and enhanced specification provided by user:

You are a Senior Distributed Systems Engineer building a Distributed File Storage and Sharing System — an epic, enterprise-grade, production-ready project optimized for massive files (5GB+). This is NOT a toy upload system. This is a real distributed system inspired by Google File System (GFS) and Hadoop Distributed File System (HDFS), built from scratch with Node.js. It must demonstrate mastery of distributed systems, high-throughput network I/O, security, fault tolerance, and full-stack engineering.

Technical Constraints:
Budget: ₹0. Use only free, open-source libraries.
Code Structure: Highly modular. Separate routes, controllers, services, and utilities into their own clean directories. No floating files.
Comments: Write concise, human-like comments explaining the purpose (the "why") of a block of code, not the syntax.

ARCHITECTURE — THE BIG PICTURE
Cloud-Native Production Architecture
The system operates exclusively in a production-grade cloud environment:
Database: Uses MongoDB Atlas (free tier) for all metadata, user states, and system states.
Storage: Uses Cloudflare R2 (10GB free, zero egress fees) for chunk storage. You MUST use the official @aws-sdk/client-s3 (AWS SDK v3) to interact with the R2 S3-compatible API.

Master-Worker Topology
One Master Node (The Brain): Handles client API requests, orchestrates file operations, manages the worker registry, monitors health, and generates upload/download tokens. It does NOT handle the actual file data streams to prevent bottlenecking.
N Worker Nodes (The Muscles): Independent Express servers acting as high-throughput storage gateways to R2. Workers self-register with the master.
Process Manager: A start-cluster.js script spawns the master and all workers as child processes with colored console output. npm run dev starts the full cluster.

High-Performance I/O Engine (For 5GB+ Files)
To achieve lightning-fast transfers for massive files, the system uses a Direct-to-Worker pipeline:
Client-Side Chunking: The Web UI / CLI reads the file and splits it into 5MB chunks locally using the File API / Streams.
Parallel Direct Uploads: The client requests an upload session from the Master. The Master returns a list of assigned Worker IPs and signed JWTs for each chunk. The client uploads chunks directly and concurrently to multiple Workers.
Worker LRU Caching: Workers buffer incoming chunks to memory/local-disk, verify the SHA-256 hash, compress, encrypt, and stream them to Cloudflare R2. Workers maintain an LRU (Least Recently Used) disk cache of hot chunks to make repeated public downloads instant without hitting R2.
Resumable Uploads: The Master tracks exactly which chunks have been successfully received. If a 5GB upload drops at 4.9GB, the client can resume exactly where it left off.

SECURITY & SECRETS MANAGEMENT (GITHUB SAFE)
This project will be open-sourced. Under zero circumstances should any secret, API key, or credential exist in the source code.
Strict Environment Loading: All secrets must be loaded via dotenv.
The .env.example File: Provide a comprehensive .env.example file with dummy values. The real .env file must be strictly added to .gitignore.
Security Hardening: Implement helmet for CSP/HSTS, configure strict CORS, and sanitize all inputs via express-validator.
Rate Limiting: Strict per-IP limits (10 req/15min for Auth) and dynamic limits for APIs to prevent abuse.

## Follow-up — 2026-08-07T08:34:48Z

User approval: STAGE 2 PROCEED
Proceed to execution of STAGE 2: DATABASE LAYER. Strictly follow architecture constraints: IMetadataRepository interface, MongoDB Atlas implementation, Mongoose models, SQLite fallback, connection management, and repository factory. Do not proceed to Stage 3 until further user approval.

## Follow-up — 2026-08-07T08:50:14Z

Status update request on Stage 2: MongoDB implementation, Mongoose models, and connection management.
