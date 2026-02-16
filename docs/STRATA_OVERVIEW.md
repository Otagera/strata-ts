# StrataDB: Engineering a Multi-Layered Database from Scratch

Building a database is the ultimate exercise in systems engineering. I came across [Build Your Own Database](https://www.nan.fyi/database) that explain Key-Value DB and I start learning with Gemini and the whole thing was demystified, in that process we built **StrataDB**—a system that starts at the byte level and climbs all the way up to a Relational SQL interface. This post documents the architecture, the "Aha!" moments, and the engineering trade-offs made along the way. It is a constant battle against the limitations of hardware, the unpredictability of crashes, and the inevitable complexity of abstraction. We didn't build **StrataDB** by following a rigid specification; we built it by hitting walls and refactoring our way through them.

This is a technical post-mortem of the journey from a naive file-writer to a multi-layered relational engine with ACID aspirations.

---

## 1. The I/O Wall & The LSM-Tree Pivot
In the beginning, the goal was simple: "Save a key-value pair to disk." The first attempt was naive: one file per key.

**The Engineering Wall:** 
1. **File Descriptor (FD) Exhaustion:** Operating systems can't handle 100,000 open files. 
2. **Random I/O Latency:** Random writes are the slowest possible operation. Even on SSDs, the overhead of updating data "in-place" is massive.

We moved to a **Log-Structured Merge-tree (LSM-tree)**. We stopped updating files. Instead, we buffer writes in an in-memory **MemTable** which is a simple hashmap (Map in javascript) with the key being the key and the value the position in the file and flush them as immutable **SSTables** (Sorted String Tables).

```typescript
// The core of the LSM-Tree: Sparse Indexing
export interface BlockIndex {
    key: string;   // The first key in a 1KB block
    offset: number; // The byte offset in the .sst file
}
```
*By indexing only every 1KB of data, we keep the index small enough for RAM while allowing us to perform small, efficient sequential scans on disk.*

---

## 2. Persistence vs. Durability
We had a fast engine. Then we crashed the process. Because the MemTable lived in RAM, every write since the last flush vanished.

What I quickly realised was that **Persistence** (eventually hitting disk) is not **Durability** (surviving a power cut). 
*   **The Fix:** We implemented a **Write-Ahead Log (WAL)**. Every operation is appended to a sequential log *before* it touches the MemTable.
*   **The Format:** The original format was the KV format using the ":" delimiter.

```json
{"txId": "uuid-1", "op": "BEGIN"}
{"txId": "uuid-1", "op": "PUT", "key": "user:123", "value": "{...}"}
{"txId": "uuid-1", "op": "COMMIT"}
```

---

## 3. Documents & "Shadow Data"
Once the KV layer was stable, in my conversation with Gemini I realized that NoSQL DBs use the KV layer we had build as their base layer so i thought we could go in that direction and build a Doc style DB like MongoDB. So **StrataDoc** was built to handle JSON.

*   **The "Aha!" Moment:** What I realized was that indexes were shadow data in the KV store - **Secondary Index**. To index an email, we write a second KV entry that points back to the primary ID.
*   **The Query Cursor:** To handle large datasets, we avoided returning massive arrays. We built **Async Query Cursors** using Async Generators to stream documents from disk one by one.

```typescript
// Indexing "Magic": Just another Key-Value pair
const indexKey = `IDX::${collection}::${field}::${value}::${id}`;
await this.kv.database_set(indexKey, ""); // The key IS the index
```

---

## 4. The SQL Era: Adding the Guardrails
Flexibility is a liability in structured systems. We built **StrataSQL** to enforce "Clean Data" via a formal compiler pipeline (Lexer -> Parser -> Executor).

**The Pivot:** We moved from "Schema-less" to "Schema-Enforced." 
*   **System Catalog:** A "metadatabase" that stores table definitions. 
*   **Type Enforcement:** SQL ensures you can't put a string into an `INT` column, even though the underlying KV layer treats everything as a string.

---

## 5. The ACID Frontier: Atomicity & Isolation
Our current challenge is the move from "Individual Writes" to "Atomic Transactions." At this point we had to abstract away the WAL to be able to do transactions so we migrated the WAL format to a **JSON Lines** format for Transactions. While less dense than a binary format, the ability to `tail -f wal.log` during recovery debugging provided invaluable observability.

*   **Isolation via Staging Buffers:** To prevent "Dirty Reads," we implemented a private workspace for each transaction. Writes live in a `Map` buffer and are only merged into the global MemTable upon a successful `COMMIT`.
*   **Dependency Inversion:** To solve a circular dependency where the `Engine` needed the `Transaction` class and vice-versa, we introduced the `IStorageEngine` interface. 

```typescript
export interface IKVStorageEngine {
    database_get(key: string): Promise<string | null>;
    commitBatch(batch: WALBatch): Promise<void>;
    _get_db_sentinel_value(): string;
}
```

---

## 6. The Current State: The Unified CLI
StrataDB now exposes a unified interface that allows interacting with all three layers simultaneously.

### Example: Relational Transaction
```sql
> BEGIN;
> CREATE TABLE users (id INT, name TEXT, active BOOL);
> INSERT INTO users {"id": 1, "name": "Neo", "active": true};
> SELECT * FROM users WHERE id = 1;
# Result: [{ id: 1, name: "Neo", active: true }]
> COMMIT;
```

### Example: Document Indexing
```bash
> INDEX users email
> INSERT users {"email": "morpheus@nebuchadnezzar.io", "rank": "Captain"}
> FIND users {"email": "morpheus@nebuchadnezzar.io"}
```

### Example: Raw KV Access
```bash
> KV:SET system:status "online"
> KV:GET system:status
# Result: "online"
```

---

## 7. Retrospective: Engineering Trade-offs

| Component | Senior Decision | Trade-off |
| :--- | :--- | :--- |
| **Storage Engine** | LSM-Tree | Optimized for write throughput; requires complex background Compaction. |
| **Log Format** | JSON Lines | Prioritizes human-readability and debuggability over binary density. |
| **Isolation** | Staging Buffer | Simple implementation of Snapshot Isolation; RAM usage scales with transaction size. |
| **Relational** | AST-based Parser | Extensible and robust; slower than Regex but required for complex WHERE logic. |

**The Journey Ahead:** We are currently moving toward **MVCC (Multi-Version Concurrency Control)**, allowing readers to see a consistent snapshot of the past while writers build the future—all without the performance penalty of global locks.

---

*StrataDB is a masterclass in layers. It proves that while databases are complex, they are not magic. They are just layers of clever logic stacked on top of bytes.*