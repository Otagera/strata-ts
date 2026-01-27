import { createReadStream } from "node:fs";
import { createInterface, type Interface } from "node:readline/promises";
import type { BlockIndex, IKVIterator, Pair } from "../shared/interfaces";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { BloomFilter } from "../shared/bloom_filter";

export class SSTIterator implements IKVIterator {
	private rl: Interface;
	private current: Pair | null = null;
	private iterator: AsyncIterableIterator<string>;
	public filename: string;
	public filePath: string;
	private DATA_DIR: string;
	private ENCODING: BufferEncoding = "utf8";

	constructor(filePath: string, filename: string) {
		this.filename = filename;
		this.filePath = filePath;
		this.DATA_DIR = path.dirname(filePath);
		const input = createReadStream(filePath);
		this.rl = createInterface({ input, crlfDelay: Infinity });
		this.iterator = this.rl[Symbol.asyncIterator]();
	}

	/**
	 * Initializes the cursor by reading the first line.
	 */
	async init() {
		await this.advance();
	}

	/**
	 * Moves to the next record.
	 */
	advance = async () => {
		const result = await this.iterator.next();
		if (result.done) {
			this.current = null;
			this.rl.close();
			return;
		}

		try {
			// We use key:value format
			const separatorIndex = result.value.indexOf(":");
			if (separatorIndex === -1) {
				// Skip malformed line
				await this.advance();
				return;
			}
			const key = result.value.substring(0, separatorIndex);
			const value = result.value.substring(separatorIndex + 1);
			this.current = { key, value };
		} catch (_e) {
			// Skip malformed lines
			await this.advance();
		}
	};

	seek = async (targetKey: string) => {
		const meta = await this.get_file_meta(this.filename);

		let bestOffset = 0;
		if (meta.blockIndex) {
			for (const entry of meta.blockIndex) {
				if (entry.key <= targetKey) {
					bestOffset = entry.offset;
				} else {
					break;
				}
			}
		}

		this.rl.close();

		const input = createReadStream(this.filePath, {
			start: bestOffset,
		});

		this.rl = createInterface({
			input: input,
			crlfDelay: Infinity,
		});
		this.iterator = this.rl[Symbol.asyncIterator]();

		await this.advance();
		while (!this.done && this.key! < targetKey) {
			await this.advance();
		}
	};

	private get_file_meta = async (filename: string) => {
		const SST_FILE_EXT = ".sst";
		const SST_META_FILE_EXT = ".meta.json";

		const metaPath = path.join(
			this.DATA_DIR,
			filename.replace(SST_FILE_EXT, SST_META_FILE_EXT)
		);
		const file = await readFile(metaPath, { encoding: this.ENCODING });
		const data = JSON.parse(file);
		const filter = BloomFilter.deserialize(data.filterData, 128, 3);

		return {
			minKey: data.minKey,
			maxKey: data.maxKey,
			filter,
			blockIndex: data.blockIndex as BlockIndex[],
		};
	};

	get key(): string | null {
		return this.current?.key ?? null;
	}

	get value(): string | null {
		return this.current?.value ?? null;
	}

	get done(): boolean {
		return this.current === null;
	}
}
