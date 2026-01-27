import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { StrataDoc } from "./doc/engine";
import { StrataKV } from "./kv/engine";

const rl = createInterface({ input, output });

async function main() {
	const kv = new StrataKV();
	const db = new StrataDoc(kv);

	await kv.database_init();
	// db.init() just calls kv.database_init(), so we are good.

	console.log("📚 StrataDB CLI (Unified Layer)");
	console.log("--------------------------------");
	console.log("DOC Layer Commands:");
	console.log("  INSERT <collection> <json_doc>");
	console.log("  FIND <collection> [json_query]");
	console.log("  GET <collection> <id>");
	console.log("  INDEX <collection> <field>");
	console.log("\nKV Layer Commands (Raw Access):");
	console.log("  KV:SET <key> <value>");
	console.log("  KV:GET <key>");
	console.log("  KV:SCAN [prefix]");
	console.log("  KV:DEL <key>");
	console.log("--------------------------------");
	console.log("  EXIT");

	while (true) {
		const answer = await rl.question("\nStrata> ");
		const trimmed = answer.trim();
		if (!trimmed) continue;

		const firstSpace = trimmed.indexOf(" ");
		const command = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toUpperCase();
		
		const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();
		const secondSpace = rest.indexOf(" ");
		
		let collection = "";
		let arg = "";
		let kvKey = "";
		let kvVal = "";

		if (command === "EXIT") {
			await db.close();
			console.log("Bye!");
			rl.close();
			return;
		}

		if (command.startsWith("KV:")) {
			// Parsing for KV commands
			if (secondSpace === -1) {
				kvKey = rest;
			} else {
				kvKey = rest.slice(0, secondSpace);
				kvVal = rest.slice(secondSpace + 1);
			}
		} else if (rest) {
			// Parsing for Doc commands
			if (secondSpace === -1) {
				collection = rest;
			} else {
				collection = rest.slice(0, secondSpace);
				arg = rest.slice(secondSpace + 1);
			}
		}

		try {
			switch (command) {
				// --- DOC COMMANDS ---
				case "INSERT": {
					if (!collection || !arg) {
						console.log("Usage: INSERT <collection> <json>");
						break;
					}
					const doc = JSON.parse(arg);
					const result = await db.insert(collection, doc);
					console.log("Inserted:", result);
					break;
				}
				case "FIND": {
					if (!collection) {
						console.log("Usage: FIND <collection> [json_query]");
						break;
					}
					const query = arg ? JSON.parse(arg) : {};
					const cursor = db.find(collection, query);
					
					const results = await cursor.limit(20).toArray();
					
					if (results.length === 0) {
						console.log("(No results found)");
					} else {
						console.table(results);
						if (results.length === 20) console.log("... (limit 20)");
					}
					break;
				}
				case "GET": {
					if (!collection || !arg) {
						console.log("Usage: GET <collection> <id>");
						break;
					}
					const result = await db.findById(collection, arg);
					console.log(result === null ? "(null)" : result);
					break;
				}
				case "INDEX": {
					if (!collection || !arg) {
						console.log("Usage: INDEX <collection> <field>");
						break;
					}
					db.createIndex(collection, arg);
					console.log(`Index created on ${collection}.${arg}`);
					break;
				}

				// --- KV COMMANDS ---
				case "KV:SET": {
					if (!kvKey || !kvVal) {
						console.log("Usage: KV:SET <key> <value>");
						break;
					}
					await kv.database_set(kvKey, kvVal);
					console.log("OK");
					break;
				}
				case "KV:GET": {
					// Use the 'rest' directly as key to allow spaces if needed, 
					// though keys usually don't have spaces in this CLI.
					const keyToGet = kvKey || rest; 
					if (!keyToGet) {
						console.log("Usage: KV:GET <key>");
						break;
					}
					const result = await kv.database_get(keyToGet);
					console.log(result === null ? "(nil)" : result);
					break;
				}
				case "KV:DEL": {
					const keyToDel = kvKey || rest;
					if (!keyToDel) {
						console.log("Usage: KV:DEL <key>");
						break;
					}
					await kv.database_delete(keyToDel);
					console.log("OK");
					break;
				}
				case "KV:SCAN": {
					const prefix = rest || undefined;
					console.log(`Scanning KV with prefix: ${prefix || "(all)"}`);
					let count = 0;
					for await (const { key, value } of kv.scan(prefix)) {
						console.log(`${key} => ${value}`);
						count++;
						if (count >= 20) {
							console.log("... (limit 20)");
							break;
						}
					}
					if (count === 0) console.log("(empty)");
					break;
				}

				default:
					console.log("Unknown command. Type HELP for commands.");
			}
		} catch (error: any) {
			console.error("Error:", error.message);
		}
	}
}

main();