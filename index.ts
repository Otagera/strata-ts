import { createReadStream } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import {
	appendFile,
	stat,
	mkdir,
	readdir,
	readFile,
} from "node:fs/promises";
import path from "node:path";
import { createInterface } from "readline/promises";
import { BloomFilter } from "./bloom_filter";

// --- Configuration ---
const DATA_DIR = "data";
const SST_FILE_EXT = ".sst";
const SST_META_FILE_EXT = ".meta.json";
const ENCODING = "utf8";
const DB_SENTINEL_VALUE = "$nullified";
const MEMTABLE_LIMIT = 5;

// --- Interfaces ---
interface SSTMetadata {
	filename: string;
	minKey: string;
	maxKey: string;
	filter: BloomFilter;
}

// --- State ---
let sst_files: SSTMetadata[] = [];
const mem_table = new Map<string, string>();

// --- Public API ---

/**
 * Initializes the database by loading existing SSTable metadata from disk.
 */
export const database_init = async () => {
	try {
		await mkdir(DATA_DIR, { recursive: true });
		const files = await readdir(DATA_DIR);
		
		const sorted_files = await readDirSortedByTime(
			DATA_DIR,
			files.filter((file) => file.endsWith(SST_FILE_EXT))
		);

		sst_files = await Promise.all(
			sorted_files.map(async (filename) => {
				const meta = await get_file_meta(filename);
				return { ...meta, filename };
			})
		);
	} catch (error) {
		console.error("Initialization error:", error);
	}
};

/**
 * Retrieves a value from the database.
 * Checks MemTable first, then searches SSTables using Bloom Filters and Sparse Indexing.
 */
export const database_get = async (
	key: string,
	fd?: FileHandle
): Promise<string | null> => {
	// 1. Check in-memory MemTable
	const mem_value = mem_table.get(key);
	if (mem_value !== undefined) {
		return mem_value === DB_SENTINEL_VALUE ? null : mem_value;
	}

	// 2. Search through SSTables
	try {
		let found_value: string | null = null;
		for (const sst of sst_files) {
			// Sparse Index Check
			if (key >= sst.minKey && key <= sst.maxKey) {
				// Bloom Filter Check
				if (sst.filter.contains(key)) {
					found_value = await search_sst_file(sst.filename, key);
					if (found_value !== null) break;
				}
			}
		}

		return found_value === DB_SENTINEL_VALUE ? null : found_value;
	} catch (error) {
		console.error("Error reading file:", error);
		return null;
	}
};

/**
 * Inserts or updates a key-value pair.
 */
export const database_set = async (key: string, value: string) => {
	mem_table.set(key, value);
	if (mem_table.size >= MEMTABLE_LIMIT) await flush_mem_table();
};

/**
 * Deletes a key by writing a tombstone record.
 */
export const database_delete = async (key: string) => {
	mem_table.set(key, DB_SENTINEL_VALUE);
	if (mem_table.size >= MEMTABLE_LIMIT) await flush_mem_table();
};

/**
 * Gracefully shuts down the database by flushing remaining memory to disk.
 */
export const database_close = async () => {
	if (mem_table.size > 0) {
		await flush_mem_table();
	}
	_reset_db_state();
};

// --- Private Helpers ---

/**
 * Flushes the current MemTable to a new SSTable and its corresponding metadata file.
 */
const flush_mem_table = async () => {
	const filter = new BloomFilter(128, 3);
	const sorted_keys = [...mem_table.keys()].sort();
	let big_str = "";

	for (const key of sorted_keys) {
		filter.add(key);
		const value = mem_table.get(key);
		big_str += `${key}:${value}\n`;
	}

	if (big_str && sorted_keys.length > 0) {
		const timestamp = Date.now();
		const filename = `sst_${timestamp}${SST_FILE_EXT}`;
		const filename_meta = `sst_${timestamp}${SST_META_FILE_EXT}`;

		const minKey = sorted_keys[0] || "";
		const maxKey = sorted_keys[sorted_keys.length - 1] || "";

		await appendFile(path.join(DATA_DIR, filename), big_str);
		await appendFile(
			path.join(DATA_DIR, filename_meta),
			JSON.stringify({
				minKey,
				maxKey,
				filterData: filter.serialize(),
			})
		);
		sst_files.splice(0, 0, {
			filename,
			minKey,
			maxKey,
			filter,
		});
		mem_table.clear();
	}
};

/**
 * Searches a single SSTable file for a specific key.
 */
const search_sst_file = async (filename: string, key: string) => {
	const fileStream = createReadStream(path.join(DATA_DIR, filename), {
		encoding: ENCODING,
	});

	const rl = createInterface({
		input: fileStream,
		crlfDelay: Infinity, // Treats '\r\n' as a single newline character
	});

	for await (const line of rl) {
		// Use indexOf to safely handle values containing colons
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) continue;
		
		const line_key = line.substring(0, separatorIndex);
		if (line_key === key) {
			return line.substring(separatorIndex + 1) || null;
		}
	}
	return null;
};

/**
 * Loads metadata from a .meta.json file.
 */
const get_file_meta = async (filename: string) => {
	const metaPath = path.join(DATA_DIR, filename.replace(SST_FILE_EXT, SST_META_FILE_EXT));
	const file = await readFile(metaPath, { encoding: ENCODING });
	const data = JSON.parse(file);
	const filter = BloomFilter.deserialize(data.filterData, 128, 3);

	return {
		minKey: data.minKey,
		maxKey: data.maxKey,
		filter,
	};
};

async function readDirSortedByTime(dirpath: string, files: string[]) {
	const stats = await Promise.all(
		files.map(async (filename) => {
			const file_stat = await stat(path.join(dirpath, filename));
			return { filename, mtime: file_stat.mtime.getTime() };
		})
	);

	stats.sort((a, b) => b.mtime - a.mtime);
	return stats.map((stat) => stat.filename);
}

export const compaction = async () => {
    // To be implemented
};

// --- Debug & Test Tools ---

export const _reset_db_state = () => {
	sst_files = [];
	mem_table.clear();
};
export const _get_db_size = () => mem_table.size;
