# StrataDB Architecture

This diagram illustrates the layered architecture of StrataDB, showing how user queries flow through the Document Engine down to the physical storage.

```mermaid
graph TD
    subgraph "User Interface"
        CLI["Unified CLI (src/cli.ts)"]
        App["User App (src/demo.ts)"]
    end

    subgraph "Layer 2: Document Engine (StrataDoc)"
        API["API: insert(), find(), createIndex()"]
        QueryCursor["QueryCursor / IndexQueryCursor"]
        Protocol["Key Protocol: collection::id (URL Encoded)"]
    end

    subgraph "Layer 1: Key-Value Engine (StrataKV)"
        KV["KV Engine: get(), set(), scan()"]
        MemTable["MemTable (RAM - Sorted Map)"]
        WAL["WAL (Disk - Append Log)"]
        SST["SSTables (Disk - Immutable Files)"]
        Compaction["Compaction Process"]
    end

    CLI --> API
    App --> API

    API --> QueryCursor
    QueryCursor -- "Scan Index Prefix" --> KV
    QueryCursor -- "Fetch Doc ID" --> KV

    KV --> MemTable
    KV -- "Recover" --> WAL
    MemTable -- "Flush" --> SST
    SST --> Compaction
```

## Data Layout on Disk

### Primary Data
Stored as standard Key-Value pairs. The key is namespaced by collection.
```text
users%3A%3A123  ->  {"name": "Alice", "rank": 1, "_id": "123"}
users%3A%3A456  ->  {"name": "Bob",   "rank": 2, "_id": "456"}
```

### Secondary Indexes
Stored as empty-value keys. The document ID is part of the key to allow duplicate values.
```text
IDX%3A%3Ausers%3A%3Arank%3A%3A1%3A%3A123  ->  ""
IDX%3A%3Ausers%3A%3Arank%3A%3A2%3A%3A456  ->  ""
```
