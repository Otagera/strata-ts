import type { ICursor, Pair } from "../shared/interfaces";

export class MemTableCursor implements ICursor {
	private mem_table: Map<string, string>;
	private current: Pair | null = null;
	private keys_list: string[];
	private internal_pointer: number = -1;

	constructor(mem_table: Map<string, string>) {
		this.mem_table = mem_table;
		this.keys_list = [];
	}

	async init() {
		const keys = this.mem_table.keys();
		for (const key of keys) {
			this.keys_list.push(key);
		}
		this.keys_list.sort();

		this.internal_pointer = -1;
		await this.advance();
	}

	async advance() {
		this.internal_pointer += 1;

		if (this.keys_list.length <= this.internal_pointer) {
			this.current = null;
			return;
		}

		const key = this.keys_list[this.internal_pointer];
		if (!key) throw new Error();
		const value = this.mem_table.get(key);
		if (!value) throw new Error();
		this.current = { key, value };
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
