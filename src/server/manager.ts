import type { ServerWebSocket } from "bun";
import { StrataDoc } from "../doc/engine";
import { StrataKV } from "../kv/engine";
import { StrataSQL } from "../sql/engine";

export class SpaceManager {
	private instances: Map<
		string,
		{ kv: StrataKV; doc: StrataDoc; sql: StrataSQL }
	> = new Map();

	async getSpace(spaceId: string = "default") {
		if (this.instances.has(spaceId)) {
			return this.instances.get(spaceId)!;
		}

		const dataDir = "data";
		const kv = new StrataKV({ dataDir });
		const doc = new StrataDoc(kv);
		const sql = new StrataSQL(doc);

		await kv.database_init();

		const space = { kv, doc, sql };
		this.instances.set(spaceId, space);
		return space;
	}

	async closeAll() {
		for (const space of this.instances.values()) {
			await space.doc.close();
		}
	}
}

export const manager = new SpaceManager();
export const clients = new Set<ServerWebSocket<unknown>>();

export function broadcast(event: string, data: any) {
	const payload = JSON.stringify({ event, data, timestamp: Date.now() });
	for (const client of clients) {
		client.send(payload);
	}
}

export async function patchEngine(spaceId: string) {
	const { kv } = await manager.getSpace(spaceId);

	const originalSet = kv.database_set.bind(kv);
	kv.database_set = async (key: string, value: string) => {
		const res = await originalSet(key, value);
		broadcast("kv_set", { key, value, spaceId });
		return res;
	};

	const originalFlush = (kv as any).flush_mem_table?.bind(kv);
	if (originalFlush) {
		(kv as any).flush_mem_table = async () => {
			broadcast("engine_flush_start", { spaceId });
			const res = await originalFlush();
			broadcast("engine_flush_end", {
				spaceId,
				sstCount: (kv as any).sst_files.length,
			});
			return res;
		};
	}
}
