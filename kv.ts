import { createReadStream } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import {
	appendFile,
	stat,
	mkdir,
	readdir,
	readFile,
	unlink,
	rename,
} from "node:fs/promises";
import path from "node:path";
import { createInterface } from "readline/promises";
import { BloomFilter } from "./bloom_filter";
import { SSTCursor } from "./sst_cursor";
import { writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { constants } from "node:fs/promises";

// --- Interfaces ---
interface SSTMetadata {
	filename: string;
	minKey: string;
	maxKey: string;
	filter: BloomFilter;
}

export class StrataKV {
	// --- Configuration ---
	private DATA_DIR = "data";
	private SST_FILE_EXT = ".sst";
	private SST_META_FILE_EXT = ".meta.json";
	private WAL_FILE = "wal.log";
	private ENCODING: BufferEncoding = "utf8";
	private DB_SENTINEL_VALUE = "$nullified";
	private MEMTABLE_LIMIT = 5;
	private COMPACTION_THRESHOLD = 5;
	private WAL_ENABLED = true;

	private sst_files: SSTMetadata[] = [];
	private mem_table = new Map<string, string>();

	constructor(config?: {
		dataDir?: string;
		walEnabled?: boolean;
		memtableLimit?: number;
		compactionThreshold?: number;
	}) {
		if (config?.dataDir) {
			this.DATA_DIR = config.dataDir;
		}
		if (config?.walEnabled !== undefined) {
			this.WAL_ENABLED = config.walEnabled;
		}
		if (config?.memtableLimit !== undefined) {
			this.MEMTABLE_LIMIT = config.memtableLimit;
		}
		if (config?.compactionThreshold !== undefined) {
			this.COMPACTION_THRESHOLD = config.compactionThreshold;
		}
	}

	/**
	 * Initializes the database by loading existing SSTable metadata from disk.
	 */
	public database_init = async () => {
		try {
			await mkdir(this.DATA_DIR, { recursive: true });
			const files = await readdir(this.DATA_DIR);

			const sorted_files = await this.readDirSortedByTime(
				this.DATA_DIR,
				files.filter((file) => file.endsWith(this.SST_FILE_EXT))
			);

			this.sst_files = await Promise.all(
				sorted_files.map(async (filename) => {
					const meta = await this.get_file_meta(filename);
					return { ...meta, filename };
				})
			);

			if (this.WAL_ENABLED) {
				const wal_path = path.join(this.DATA_DIR, this.WAL_FILE);
				const wal_exists = await this._file_exists(wal_path);
				if (wal_exists) {
					const fileStream = createReadStream(wal_path, {
						encoding: this.ENCODING,
					});

					const rl = createInterface({
						input: fileStream,
						crlfDelay: Infinity,
					});

					for await (const line of rl) {
						// Use indexOf to safely handle values containing colons
						const separatorIndex = line.indexOf(":");
						if (separatorIndex === -1) continue;

						const line_key = line.substring(0, separatorIndex);
						const line_value = line.substring(separatorIndex + 1);

						this.mem_table.set(line_key, line_value);
					}
				}
			}
		} catch (error) {
			console.error("Initialization error:", error);
		}
	};

	/**
	 * Retrieves a value from the database.
	 * Checks MemTable first, then searches SSTables using Bloom Filters and Sparse Indexing.
	 */
	public database_get = async (key: string): Promise<string | null> => {
		// 1. Check in-memory MemTable
		const mem_value = this.mem_table.get(key);
		if (mem_value !== undefined) {
			return mem_value === this.DB_SENTINEL_VALUE ? null : mem_value;
		}

		// 2. Search through SSTables
		try {
			let found_value: string | null = null;
			for (const sst of this.sst_files) {
				// Sparse Index Check
				if (key >= sst.minKey && key <= sst.maxKey) {
					// Bloom Filter Check
					if (sst.filter.contains(key)) {
						found_value = await this.search_sst_file(sst.filename, key);
						if (found_value !== null) break;
					}
				}
			}

			return found_value === this.DB_SENTINEL_VALUE ? null : found_value;
		} catch (error) {
			console.error("Error reading file:", error);
			return null;
		}
	};

	/**
	 * Inserts or updates a key-value pair.
	 */
	public database_set = async (key: string, value: string) => {
		if (this.WAL_ENABLED) {
			await appendFile(
				path.join(this.DATA_DIR, this.WAL_FILE),
				`${key}:${value}\n`
			);
		}
		this.mem_table.set(key, value);
		if (this.mem_table.size >= this.MEMTABLE_LIMIT)
			await this.flush_mem_table();
	};

	/**
	 * Deletes a key by writing a tombstone record.
	 */
	public database_delete = async (key: string) => {
		if (this.WAL_ENABLED) {
			await appendFile(
				path.join(this.DATA_DIR, this.WAL_FILE),
				`${key}:${this.DB_SENTINEL_VALUE}\n`
			);
		}
		this.mem_table.set(key, this.DB_SENTINEL_VALUE);
		if (this.mem_table.size >= this.MEMTABLE_LIMIT)
			await this.flush_mem_table();
	};

	/**
	 * Gracefully shuts down the database by flushing remaining memory to disk.
	 */
	public database_close = async () => {
		if (this.mem_table.size > 0) {
			await this.flush_mem_table();
		}
		this._reset_db_state();
	};

	// --- Private Helpers ---

	/**
	 * Flushes the current MemTable to a new SSTable and its corresponding metadata file.
	 */
	private flush_mem_table = async () => {
		const filter = new BloomFilter(128, 3);
		const sorted_keys = [...this.mem_table.keys()].sort();
		let big_str = "";

		for (const key of sorted_keys) {
			filter.add(key);
			const value = this.mem_table.get(key);
			big_str += `${key}:${value}\n`;
		}

		if (big_str && sorted_keys.length > 0) {
			const timestamp = Date.now();
			const uniqueId = Math.random().toString(36).substring(2, 7);
			const filename = `sst_${timestamp}_${uniqueId}${this.SST_FILE_EXT}`;
			const filename_meta = `sst_${timestamp}_${uniqueId}${this.SST_META_FILE_EXT}`;

			const minKey = sorted_keys[0] || "";
			const maxKey = sorted_keys[sorted_keys.length - 1] || "";

			await appendFile(path.join(this.DATA_DIR, filename), big_str);
			await appendFile(
				path.join(this.DATA_DIR, filename_meta),
				JSON.stringify({
					minKey,
					maxKey,
					filterData: filter.serialize(),
				})
			);
			this.sst_files.unshift({
				filename,
				minKey,
				maxKey,
				filter,
			});
			if (this.sst_files.length >= this.COMPACTION_THRESHOLD) {
				await this.compaction();
			}
			this.mem_table.clear();
			
			if (this.WAL_ENABLED) {
				await writeFile(path.join(this.DATA_DIR, this.WAL_FILE), "");
			}
		}
	};

	/**
	 * Searches a single SSTable file for a specific key.
	 */
	private search_sst_file = async (filename: string, key: string) => {
		const fileStream = createReadStream(path.join(this.DATA_DIR, filename), {
			encoding: this.ENCODING,
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
	private get_file_meta = async (filename: string) => {
		const metaPath = path.join(
			this.DATA_DIR,
			filename.replace(this.SST_FILE_EXT, this.SST_META_FILE_EXT)
		);
		const file = await readFile(metaPath, { encoding: this.ENCODING });
		const data = JSON.parse(file);
		const filter = BloomFilter.deserialize(data.filterData, 128, 3);

		return {
			minKey: data.minKey,
			maxKey: data.maxKey,
			filter,
		};
	};

	private readDirSortedByTime = async (dirpath: string, files: string[]) => {
		const stats = await Promise.all(
			files.map(async (filename) => {
				const file_stat = await stat(path.join(dirpath, filename));
				return { filename, mtime: file_stat.mtime.getTime() };
			})
		);

		stats.sort((a, b) => b.mtime - a.mtime);
		return stats.map((stat) => stat.filename);
	};

	/**
	 * Merges all SSTables into a single new SSTable, removing tombstones and duplicates.
	 */
	public compaction = async () => {
		if (this.sst_files.length === 0) return;

		// 1. Initialize cursors for all files
		const sst_cursors = await Promise.all(
			this.sst_files.map(async (file) => {
				const cursor = new SSTCursor(
					path.join(this.DATA_DIR, file.filename),
					file.filename
				);
				await cursor.init();
				return cursor;
			})
		);

		// Prepare output
		const timestamp = Date.now();
		const uniqueId = Math.random().toString(36).substring(2, 7);
		const output_filename = `sst_${timestamp}_${uniqueId}${this.SST_FILE_EXT}`;
		const output_meta_filename = `sst_${timestamp}_${uniqueId}${this.SST_META_FILE_EXT}`;
		const temp_output_path = path.join(this.DATA_DIR, "compaction.tmp");

		const filter = new BloomFilter(128, 3);
		let minKeyGlobal: string | null = null;
		let maxKeyGlobal: string | null = null;
		let hasData = false;

		// 2. K-Way Merge Loop
		while (sst_cursors.some((c) => !c.done)) {
			let minKey: string | null = null;
			let winnerCursor: SSTCursor | null = null;
			const cursorsWithMinKey: SSTCursor[] = [];

			for (const cursor of sst_cursors) {
				if (!cursor.done) {
					if (minKey === null || cursor.key! < minKey) {
						minKey = cursor.key;
						winnerCursor = cursor;
						cursorsWithMinKey.length = 0;
						cursorsWithMinKey.push(cursor);
					} else if (cursor.key === minKey) {
						cursorsWithMinKey.push(cursor);
					}
				}
			}

			if (minKey === null) break;

			if (winnerCursor) {
				const value = winnerCursor.value;

				if (value !== this.DB_SENTINEL_VALUE) {
					const line = `${minKey}:${value}\n`;
					await appendFile(temp_output_path, line);

					filter.add(minKey!);
					if (minKeyGlobal === null) minKeyGlobal = minKey;
					maxKeyGlobal = minKey;
					hasData = true;
				}
			}

			for (const cursor of cursorsWithMinKey) {
				await cursor.advance();
			}
		}

		// 3. Finalize
		if (hasData) {
			await appendFile(
				path.join(this.DATA_DIR, output_meta_filename),
				JSON.stringify({
					minKey: minKeyGlobal,
					maxKey: maxKeyGlobal,
					filterData: filter.serialize(),
				})
			);

			await rename(temp_output_path, path.join(this.DATA_DIR, output_filename));

			await this._delete_all_sst_file();

			this.sst_files = [
				{
					filename: output_filename,
					minKey: minKeyGlobal!,
					maxKey: maxKeyGlobal!,
					filter: filter,
				},
			];
		} else {
			await this._delete_all_sst_file();
			this.sst_files = [];
			try {
				await unlink(temp_output_path);
			} catch (e) {}
		}
	};

	// --- Debug & Test Tools ---

	private _delete_all_sst_file = async () => {
		for (const file of this.sst_files) {
			await unlink(path.join(this.DATA_DIR, file.filename));
			await unlink(
				path.join(
					this.DATA_DIR,
					file.filename.replace(this.SST_FILE_EXT, this.SST_META_FILE_EXT)
				)
			);
		}
	};
	private _file_exists = async (path: string) => {
		try {
			await access(path, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	};
	public _reset_db_state = () => {
		this.sst_files = [];
		this.mem_table.clear();
	};
	public _get_db_size = () => this.mem_table.size;
}
