import { createReadStream } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { appendFile, readFile, stat, open, rename } from "node:fs/promises";
import { createInterface } from "readline/promises";

const FILENAME = "the_humble_file.txt";
const ENCODING = "utf8";
const DB_SENTINEL_VALUE = "$nullified";
const db_map = new Map<string, number>();

const database_init = async () => {
	try {
		const fileStream = createReadStream(FILENAME, { encoding: ENCODING });

		const rl = createInterface({
			input: fileStream,
			crlfDelay: Infinity, // Treats '\r\n' as a single newline character
		});
		let prev = 0;
		for await (const line of rl) {
			const [key, value] = line.split(":");
			if (key) {
				if (value === DB_SENTINEL_VALUE) {
					db_map.delete(key);
				} else {
					db_map.set(key, prev);
				}
			}
			prev += Buffer.byteLength(line + "\n");
		}
	} catch (error) {
		await appendFile(FILENAME, "", ENCODING);
	}
};

export const database_set = async (key: string, value: string) => {
	const stats = await stat(FILENAME);
	const insert_str = `${key}:${value}\n`;
	await appendFile(FILENAME, insert_str);
	db_map.set(key, stats.size);
};

export const database_get = async (
	key: string,
	fd?: FileHandle
): Promise<string | null> => {
	const position = db_map.get(key);
	if (position === undefined) {
		return null;
	}
	let local_fd;
	try {
		if (!fd) {
			local_fd = await open(FILENAME, "r");
		} else {
			local_fd = fd;
		}
		const buf = Buffer.alloc(1024); // Read in chunks of 1KB - reserves 1KB of memory (RAM)
		const { bytesRead, buffer: readBuffer } = await local_fd.read(
			buf,
			0,
			1024,
			position
		);

		const buffer_to_string = readBuffer.toString("utf8", 0, bytesRead);
		const index = buffer_to_string.indexOf("\n");

		if (index) {
			const value = buffer_to_string.substring(0, index).split(":")[1];
			return value || null;
		}
		return null;
	} catch (error) {
		console.error("Error reading file:", error);
		return null;
	} finally {
		if (!fd) {
			local_fd?.close();
		}
	}
};

export const compaction = async () => {
	const COMPACTION_FILENAME = "compacted.txt";
	const fd = await open(FILENAME, "r");
	let prev = 0;
	const new_db_map = new Map<string, number>();

	for (const [key] of db_map) {
		const value = await database_get(key, fd);
		const insert_str = `${key}:${value}\n`;
		await appendFile(COMPACTION_FILENAME, insert_str);
		new_db_map.set(key, prev);
		prev += Buffer.byteLength(insert_str);
	}
	fd.close();

	rename(COMPACTION_FILENAME, FILENAME);
	db_map.clear();
	for (const [key, value] of new_db_map) {
		db_map.set(key, value);
	}
};

// The tombstone
export const database_delete = async (key: string) => {
	const insert_str = `${key}:${DB_SENTINEL_VALUE}\n`;
	await appendFile(FILENAME, insert_str);
	db_map.delete(key);
};
