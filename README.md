# Strata DB

> *"The layer where your data lives."*

**Strata DB** is an educational project designed to explore and implement the internal storage engines of various database types from scratch. It serves as a playground for understanding the fundamental differences in how Key-Value stores, Document databases, and Relational (SQL) engines manage data on disk and in memory.

Currently, the **Key-Value (KV)** engine is fully implemented.

---

## 📚 Database Engines

### 1. Strata KV (Implemented)
A high-performance **Log-Structured Merge Tree (LSM-Tree)** engine.
*   **Best for:** High write throughput, simple lookups.
*   **Architecture:** MemTable -> SSTables -> Compaction.
*   **Status:** ✅ Production-ready (Educational).

### 2. Strata Doc (Planned)
A JSON-document store inspired by MongoDB/CouchDB.
*   **Best for:** Unstructured data, flexible schemas.
*   **Key Concepts:** B-Trees for indexing ID fields, memory-mapped files.
*   **Status:** 🚧 In Conception.

### 3. Strata SQL (Planned)
A relational engine with a SQL parser and query planner.
*   **Best for:** Structured data, complex joins, transactions (ACID).
*   **Key Concepts:** Page-based storage, B+Tree indexes, WAL-based transactions.
*   **Status:** 🚧 In Conception.

---

## 🗝️ Strata KV: Deep Dive

The KV engine is the foundation of the project. It implements a classic LSM-tree architecture found in systems like LevelDB and RocksDB.

### Features
*   **LSM-Tree Architecture:** Optimized for write-heavy workloads using append-only storage.
*   **MemTable:** In-memory sorted buffer (Map) for immediate access and fast writes.
*   **SSTables (Sorted String Tables):** Immutable disk-based files for durability.
*   **Write-Ahead Log (WAL):** Ensures data durability across crashes (configurable).
*   **Compaction (K-Way Merge):** Automatic background merging of SSTables to reclaim space and enforce tombstones.
*   **Bloom Filters:** Probabilistic filtering to eliminate 99% of unnecessary disk lookups.
*   **Sparse Indexing:** Metadata files with Min/Max key ranges to quickly prune search space.
*   **Tombstone Deletion:** Efficient deletion handling during compaction.

### Architecture Flow

#### Write Path
1.  **WAL Append:** Key-value pair is appended to `wal.log` for durability.
2.  **MemTable Insert:** Data is stored in an in-memory `Map`.
3.  **Flush:** When MemTable reaches a limit (default 5 keys), it is sorted and flushed to a new `.sst` file.
4.  **Compaction:** When SST files exceed a threshold (default 5 files), they are merged into a single file.

#### Read Path
1.  **MemTable:** Checks memory first.
2.  **SSTables (Newest to Oldest):**
    *   **Sparse Index:** Checks if key is within `[minKey, maxKey]`.
    *   **Bloom Filter:** Checks if key *might* exist in the file.
    *   **Scan:** Linearly scans the file (if checks pass).

---

## 🚀 Getting Started (Strata KV)

### Prerequisites
*   [Bun](https://bun.sh/) (v1.0+)

### Installation

```bash
bun install
```

### Running the CLI
Interact with the KV engine directly.

```bash
bun start
# or
bun run cli.ts
```

Commands:
- `set <key> <value>`
- `get <key>`
- `delete <key>`

### Running Tests
Run the comprehensive test suite (Logic + Load Tests).

```bash
bun test
```

### Benchmarks
Check the performance impact of the Write-Ahead Log (WAL).

```bash
bun test wal_perf.test.ts
```

---

## 🛠️ Configuration

You can configure the database instance:

```typescript
const db = new StrataKV({
  dataDir: "./my_db_data",
  walEnabled: true,       // Enable/Disable durability
  memtableLimit: 1000,    // Flush after 1000 keys
  compactionThreshold: 10 // Compact after 10 SST files
});
```

---

## 🔮 Strata KV: Roadmap & Future Work

The following technical improvements are planned specifically for the **KV engine**.

### 1. Namespaces (Buckets)
**Concept:** Partition keys into logical groups (like tables in SQL or buckets in S3) to isolate data.
**Implementation Strategy:**
*   **Storage:** Add a `namespace` prefix to file paths (e.g., `data/users/sst_...`, `data/orders/sst_...`).
*   **Memory:** Maintain separate `MemTable` and `SSTMetadata` lists for each namespace.
*   **Compaction:** Run compaction processes independently per namespace. This prevents a high-write namespace from locking up resources for a low-write namespace.

### 2. WAL Optimizations
**Current State:** Every `set` operation triggers an `appendFile` syscall. While effective, this bottlenecks high-throughput systems.
**Optimization Strategies:**
*   **Group Commit / Batching:** Collect writes in a memory buffer and write them to disk in a single chunk every few milliseconds (or when the buffer fills). This drastically reduces syscall overhead.
*   **Binary Format:** Switch from text-based `key:value\n` to a binary format (length-prefixed strings). This handles special characters, newlines, and binary data safely without complex escaping.
*   **Checksums:** Add CRC32 checksums to each WAL entry to detect and discard corrupted records during recovery.

### 3. Block-Based SSTables
**Current State:** Simple line-based text files. Reading requires scanning potentially the whole file if the Bloom filter yields a false positive.
**Optimization:**
*   **Blocking:** Divide SSTables into fixed-size blocks (e.g., 4KB).
*   **Block Index:** Store a "Block Index" at the end of the file (e.g., "Key 'apple' starts at offset 0, Key 'zebra' starts at offset 4096").
*   **Binary Search:** Perform a binary search on the Block Index to load only the specific 4KB block containing the target key.
