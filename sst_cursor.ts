import { createReadStream } from "node:fs";
import { createInterface, Interface } from "readline/promises";

export class SSTCursor {
	private rl: Interface;
	private current: { key: string; value: string } | null = null;
	private iterator: AsyncIterableIterator<string>;
	public filename: string;

	constructor(filePath: string, filename: string) {
		this.filename = filename;
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
	async advance() {
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
		} catch (e) {
			// Skip malformed lines
			await this.advance();
		}
	}

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
