import { createReadStream } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { MemTable, WALBatch, WALConfig } from "../shared/interfaces";
import { Utils } from "../shared/utils";

export class WALManager {
	private DATA_DIR = "data";
	private WAL_FILE = "wal.log";
	private WAL_PATH;
	private ENCODING: BufferEncoding = "utf8";
	private BEGIN_BATCH_KEY = "BEGIN";
	private PUT_KEY = "PUT";
	private DELETE_KEY = "DEL";
	private END_BATCH_KEY = "COMMIT";
	private DB_SENTINEL_VALUE = "$nullified";

	constructor(config?: WALConfig) {
		if (config?.dataDir) {
			this.DATA_DIR = config.dataDir;
		}
		if (config?.walFile) {
			this.WAL_FILE = config.walFile;
		}
		if (config?.encoding) {
			this.ENCODING = config.encoding;
		}
		if (config?.dbSentinelValue) {
			this.DB_SENTINEL_VALUE = config.dbSentinelValue;
		}

		this.WAL_PATH = join(this.DATA_DIR, this.WAL_FILE);
		// Ensure the data directory exists
		mkdir(this.DATA_DIR, { recursive: true }).then().catch();
	}

	public appendBatch = async (batch: WALBatch, txId: string): Promise<void> => {
		const lines: string[] = [];

		lines.push(JSON.stringify({ type: this.BEGIN_BATCH_KEY, txId }));

		for (const [key, value] of batch.entries()) {
			if (value === null) {
				lines.push(JSON.stringify({ type: this.DELETE_KEY, key, txId }));
			} else {
				lines.push(JSON.stringify({ type: this.PUT_KEY, key, value, txId }));
			}
		}

		lines.push(JSON.stringify({ type: this.END_BATCH_KEY, txId }));

		await appendFile(this.WAL_PATH, lines.join("\n") + "\n", {
			encoding: this.ENCODING,
		});
	};

	public recover = async (): Promise<MemTable> => {
		const wal_exists = await Utils.file_exists(this.WAL_PATH);
		const table = new Map<string, string>();
		if (wal_exists) {
			const fileStream = createReadStream(this.WAL_PATH, {
				encoding: this.ENCODING,
			});

			const rl = createInterface({
				input: fileStream,
				crlfDelay: Infinity,
			});

			const pendingTx = new Map<
				string,
				Array<{ key: string; value: string | null }>
			>();

			for await (const line of rl) {
				if (!line.trim()) continue;

				try {
					const entry = JSON.parse(line);

					switch (entry.type) {
						case this.BEGIN_BATCH_KEY:
							pendingTx.set(entry.txId, []);
							break;

						case this.PUT_KEY:
							if (pendingTx.has(entry.txId)) {
								pendingTx
									.get(entry.txId)
									?.push({ key: entry.key, value: entry.value });
							}
							break;

						case this.DELETE_KEY:
							if (pendingTx.has(entry.txId)) {
								pendingTx
									.get(entry.txId)
									?.push({ key: entry.key, value: null });
							}
							break;

						case this.END_BATCH_KEY: {
							const changes = pendingTx.get(entry.txId);
							if (changes) {
								for (const change of changes) {
									if (change.value === null) {
										table.set(change.key, this.DB_SENTINEL_VALUE);
									} else {
										table.set(change.key, change.value);
									}
								}
								pendingTx.delete(entry.txId);
							}
							break;
						}
					}
				} catch (e) {
					console.warn("Corrupted WAL line:", line);
				}
			}
		}
		return table;
	};

	public sync = async (): Promise<void> => {
		// No-op for now since appendFile is used, which is atomic and doesn't require explicit syncing.
		// In a more complex implementation, you might want to implement fsync here.
	};

	public clear = async () => {
		await writeFile(this.WAL_PATH, "");
	};
}
