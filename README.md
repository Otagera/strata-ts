# Strata DB

A high-performance key-value database built from scratch using a Log-Structured Merge Tree (LSM-Tree) architecture.

## Features
- **SSTables:** Sorted String Tables for persistent storage.
- **MemTable:** In-memory sorted buffer for fast writes.
- **Sparse Indexing:** Min/Max key tracking for efficient range queries.
- **Bloom Filters:** Probabilistic data structure to skip unnecessary disk reads.
- **Graceful Shutdown:** Flushes memory to disk on exit.

## Getting Started

### Install Dependencies:

```bash
bun install
```

### Run the CLI:

```bash
bun cli.ts
```

### Run Tests:

```bash
bun test
```

## Strata Ecosystem
- **Strata KV:** The core key-value engine (Implemented).
- **Strata Doc:** Document-oriented storage (Planned).
- **Strata SQL:** SQL interface for relational queries (Planned).