## 2026-08-07T13:52:49Z
Your working directory for metadata is: c:\Users\xavir\OneDrive\Desktop\DFUS\.agents\test_writer_e2e
Identity: E2E Test Writer

MANDATORY READ:
1. You MUST read c:\Users\xavir\OneDrive\Desktop\DFUS\.agents\ORIGINAL_REQUEST.md before starting work.
2. You MUST read c:\Users\xavir\OneDrive\Desktop\DFUS\PROJECT.md before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
Implement the automated End-to-End (E2E) verification test suite for the Master-Worker cluster BEFORE core feature implementation, as mandated by Acceptance Criteria R3.

Instructions:
1. Inspect `src/master/server.js`, `src/worker/server.js`, `scripts/start-cluster.js`, and `src/config/`.
2. Create/update test helpers and test files under `tests/e2e/e2e.test.js` (and `tests/e2e/clusterTestHelper.js` if needed) that target `src/` (Master-Worker architecture) instead of legacy `server/`.
3. The test suite must programmatically verify the complete lifecycle:
   a. Cluster setup: Launch/connect Master node and N worker nodes (or boot Express instances in test environment).
   b. User registration/login or test authentication.
   c. File Upload: Stream upload a file to Master (`POST /api/files/upload`).
   d. Worker Chunk Distribution: Query database/system or worker node endpoints to programmatically confirm chunks were generated and stored across multiple worker nodes according to REPLICATION_FACTOR.
   e. File Retrieval: Stream download the file (`GET /api/files/:fileId`) and verify exact binary content & SHA-256 checksum match against original file.
   f. File Deletion: Send delete request (`DELETE /api/files/:fileId`) and verify chunk cleanup.
4. Update `package.json` with script `"test:e2e": "jest tests/e2e/e2e.test.js --runInBand --forceExit"`.
5. Run the test script and record results. (Note: tests may initially fail or partially pass due to existing codebase bugs like the hash ring bug — document current pass/fail status clearly!).
6. Write `TEST_READY.md` at project root with instructions on how to run the E2E test suite.

Output:
Write handoff report to `c:\Users\xavir\OneDrive\Desktop\DFUS\.agents\test_writer_e2e\handoff.md`. Send message to parent with status and path.
