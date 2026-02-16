import path from "node:path";
import { manager, clients, patchEngine } from "./server/manager";
import index from "./ui/index.html";

// Initialize the default space
await patchEngine("default");

const server = Bun.serve({
	port: 2345,
	routes: {
		"/": index,
	},
	async fetch(req, server) {
		const url = new URL(req.url);
		const spaceId = url.searchParams.get("spaceId") || "default";
		const { kv, doc, sql } = await manager.getSpace(spaceId);

		// --- API Routes ---
		
		if (url.pathname === "/api/status") {
			return new Response(JSON.stringify({
				memTableSize: kv._get_db_size(),
				sstCount: (kv as any).sst_files.length,
				spaceId,
			}), { headers: { "Content-Type": "application/json" } });
		}

		if (url.pathname === "/api/query" && req.method === "POST") {
			const { query: rawQuery } = await req.json();
			let query = rawQuery.trim();
			// Strip trailing semicolon if it exists
			if (query.endsWith(";")) {
				query = query.slice(0, -1).trim();
			}
			const parts = query.split(/\s+/);
			const cmd = parts[0]?.toUpperCase();
			
			const start = performance.now();
			try {
				let result: any;
				
				// Dispatch logic inspired by cli.ts
				if (["SELECT", "CREATE", "BEGIN", "COMMIT", "ROLLBACK"].includes(cmd)) {
					result = await sql.execute(query);
				} else if (cmd === "INSERT") {
					if (parts[1]?.toUpperCase() === "INTO") {
						result = await sql.execute(query);
					} else {
						// Doc Insert: INSERT <collection> <json>
						const collection = parts[1];
						const jsonStr = query.substring(query.indexOf(collection) + collection.length).trim();
						result = await doc.insert(collection, JSON.parse(jsonStr));
					}
				} else if (cmd === "FIND") {
					// FIND <collection> <query>
					const collection = parts[1];
					const jsonStr = query.substring(query.indexOf(collection) + collection.length).trim() || "{}";
					result = await doc.find(collection, JSON.parse(jsonStr)).toArray();
				} else if (cmd === "GET") {
					result = await doc.findById(parts[1], parts[2]);
				} else if (cmd.startsWith("KV:")) {
					if (cmd === "KV:SET") {
						const key = parts[1];
						const val = query.substring(query.indexOf(key) + key.length).trim();
						await kv.database_set(key, val);
						result = "OK";
					} else if (cmd === "KV:GET") {
						result = await kv.database_get(parts[1]);
					} else if (cmd === "KV:SCAN") {
						const scanResults = [];
						for await (const entry of kv.scan(parts[1])) {
							scanResults.push(entry);
							if (scanResults.length >= 100) break;
						}
						result = scanResults;
					}
				} else {
					throw new Error(`Unknown command: ${cmd}`);
				}

				const duration = performance.now() - start;
				return new Response(JSON.stringify({ success: true, result, duration }), { headers: { "Content-Type": "application/json" } });
			} catch (e: any) {
				return new Response(JSON.stringify({ success: false, error: e.message, duration: performance.now() - start }), { 
					status: 400,
					headers: { "Content-Type": "application/json" } 
				});
			}
		}

		if (url.pathname === "/api/kv/scan") {
			const prefix = url.searchParams.get("prefix") || "";
			const results = [];
			for await (const entry of kv.scan(prefix)) {
				results.push(entry);
				if (results.length >= 100) break;
			}
			return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
		}

		if (url.pathname === "/api/tables") {
			const tables = await (sql as any).systemCatalog.listTables();
			const schemas = await Promise.all(tables.map((t: string) => (sql as any).systemCatalog.getTable(t)));
			return new Response(JSON.stringify(schemas), { headers: { "Content-Type": "application/json" } });
		}

		if (url.pathname === "/api/collections") {
			const collections = new Set<string>();
			for await (const entry of kv.scan()) {
				const key = decodeURIComponent(entry.key);
				if (key.includes("::") && !key.startsWith("IDX::") && !key.startsWith("_schema::")) {
					const parts = key.split("::");
					if (parts[0]) {
						collections.add(parts[0]);
					}
				}
			}
			return new Response(JSON.stringify(Array.from(collections)), { headers: { "Content-Type": "application/json" } });
		}

		if (url.pathname === "/api/seed" && req.method === "POST") {
			try {
				await sql.execute("CREATE TABLE users (id INT, name TEXT, active BOOL)");
				await sql.execute("INSERT INTO users (id, name, active) VALUES (1, 'Neo', true)");
				await sql.execute("INSERT INTO users (id, name, active) VALUES (2, 'Morpheus', true)");
				await doc.insert("items", { name: "Red Pill", power: 9000 });
				await doc.insert("items", { name: "Blue Pill", power: 0 });
				await kv.database_set("system:status", "online");
				return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
			} catch (e: any) {
				return new Response(JSON.stringify({ success: false, error: e.message }), { 
					status: 400,
					headers: { "Content-Type": "application/json" } 
				});
			}
		}

		// --- Websocket ---

		if (url.pathname === "/ws") {
			if (server.upgrade(req)) return;
		}

		// Fallback for SPA routing or other assets
		if (url.pathname === "/" || !url.pathname.includes(".")) {
			return new Response(await (index as any).text(), { headers: { "Content-Type": "text/html" } });
		}

		const filePath = path.join("src/ui", url.pathname);
		const file = Bun.file(filePath);
		if (await file.exists()) {
			return new Response(file);
		}

		return new Response("Not Found", { status: 404 });
	},
	websocket: {
		open(ws) { clients.add(ws); },
		message(ws, msg) {},
		close(ws) { clients.delete(ws); },
	},
});

console.log(`🚀 StrataUI Server running at http://localhost:${server.port}`);