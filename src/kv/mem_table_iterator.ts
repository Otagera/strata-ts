import type { IKVIterator, Pair } from "../shared/interfaces";

export class MemTableIterator implements IKVIterator {
	private mem_table: Map<string, string>;
	private current: Pair | null = null;
	private keys_list: string[] = [];
	private internal_pointer: number = -1;

	constructor(mem_table: Map<string, string>) {
		this.mem_table = mem_table;
	}

	async init() {
		this.keys_list = [...this.mem_table.keys()].sort();
		this.internal_pointer = -1;
		await this.advance();
	}

	async advance() {
		this.internal_pointer += 1;

		if (this.internal_pointer >= this.keys_list.length) {
			this.current = null;
			return;
		}

		const key = this.keys_list[this.internal_pointer];
		const value = this.mem_table.get(key!);
		this.current = { key: key!, value: value! };
	}

	async seek(targetKey: string) {
		// Binary search would be better, but linear is fine for MemTable size
		this.internal_pointer = this.keys_list.findIndex((k) => k >= targetKey) - 1;
		await this.advance();
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