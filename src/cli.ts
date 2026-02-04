import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { StrataDoc } from "./doc/engine";
import { StrataKV } from "./kv/engine";
import { StrataSQL } from "./sql/engine";

const rl = createInterface({ input, output });

async function main() {
	// 1. Initialize Stack
	const kv = new StrataKV();
	const db = new StrataDoc(kv);
	const sql = new StrataSQL(db);

	await kv.database_init();

	// 2. Banner
	console.log("📚 StrataDB Unified CLI");
	console.log("=======================");
	console.log("SQL MODE:    SELECT, INSERT INTO, CREATE TABLE");
	console.log("DOC MODE:    INSERT <col> <json>, FIND, GET, INDEX");
	console.log("KV MODE:     KV:SET, KV:GET, KV:SCAN");
	console.log("SYSTEM:      EXIT, HELP");
	console.log("=======================");

	// 3. Command Loop
	while (true) {
		const line = await rl.question("\nStrata> ");
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Tokenize: [Command, Arg1, ...Rest]
		const parts = trimmed.split(/\s+/);
		const cmd = parts[0]?.toUpperCase();

		try {
			switch (cmd) {
				// --- SYSTEM ---
				case "EXIT":
				case "QUIT":
					await db.close();
					console.log("Bye!");
					rl.close();
					return;

				case "HELP":
					printHelp();
					break;

				// --- SQL LAYER ---
				case "SELECT":
				case "CREATE":
					await handleSQL(sql, trimmed);
					break;

				// --- HYBRID (SQL vs DOC) ---
				case "INSERT":
					// Distinguish SQL "INSERT INTO" vs Doc "INSERT collection"
					if (parts[1]?.toUpperCase() === "INTO") {
						await handleSQL(sql, trimmed);
					} else {
						await handleDocInsert(db, trimmed);
					}
					break;

				// --- DOCUMENT LAYER ---
				case "FIND":
					await handleDocFind(db, trimmed);
					break;
				case "GET": // GET <collection> <id>
					await handleDocGet(db, parts);
					break;
				case "INDEX":
					await handleDocIndex(db, parts);
					break;

				// --- KV LAYER ---
				case "KV:SET":
				case "KV:GET":
				case "KV:DEL":
				case "KV:SCAN":
					await handleKV(kv, cmd, parts, trimmed);
					break;

				default:
					console.log(`Unknown command: '${cmd}'. Type HELP for options.`);
			}
		} catch (error: any) {
			console.error("❌ Error:", error.message);
		}
	}
}

// --- Handlers ---

async function handleSQL(sql: StrataSQL, query: string) {
	const start = performance.now();
	const results = await sql.execute(query);
	const duration = (performance.now() - start).toFixed(2);

	if (query.toUpperCase().startsWith("SELECT")) {
		if (results.length === 0) {
			console.log(`(No results) [${duration}ms]`);
		} else {
			console.table(results);
			console.log(`(${results.length} rows) [${duration}ms]`);
		}
	} else {
		console.log(`OK [${duration}ms]`);
	}
}

async function handleDocInsert(db: StrataDoc, line: string) {
	// Format: INSERT <collection> <json>
	// We need to carefully split strictly on the first two spaces
	const firstSpace = line.indexOf(" ");
	if (firstSpace === -1) throw new Error("Usage: INSERT <collection> <json>");

	const rest = line.slice(firstSpace + 1).trim();
	const secondSpace = rest.indexOf(" ");
	if (secondSpace === -1) throw new Error("Usage: INSERT <collection> <json>");

	const collection = rest.slice(0, secondSpace);
	const jsonStr = rest.slice(secondSpace + 1);

	const doc = JSON.parse(jsonStr);
	const result = await db.insert(collection, doc);
	console.log("Inserted:", result);
}

async function handleDocFind(db: StrataDoc, line: string) {
	// Format: FIND <collection> [json_query]
	const parts = line.split(/\s+/);
	const collection = parts[1];
	if (!collection) throw new Error("Usage: FIND <collection> [json]");

	// Extract JSON part (everything after collection)
	const match = line.match(/^FIND\s+\S+\s+(.*)$/i);
	const jsonStr = match ? match[1] : "{}";

	const query = JSON.parse(jsonStr);
	const results = await db.find(collection, query).limit(20).toArray();

	if (results.length === 0) console.log("(No results found)");
	else console.table(results);
}

async function handleDocGet(db: StrataDoc, parts: string[]) {
	// GET <collection> <id>
	const collection = parts[1];
	id = parts[2];
	if (!collection || !id) throw new Error("Usage: GET <collection> <id>");

	const result = await db.findById(collection, id);
	console.log(result ?? "(null)");
}

async function handleDocIndex(db: StrataDoc, parts: string[]) {
	// INDEX <collection> <field>
	const collection = parts[1];
	const field = parts[2];
	if (!collection || !field)
		throw new Error("Usage: INDEX <collection> <field>");

	db.createIndex(collection, field);
	console.log(`Index created on ${collection}.${field}`);
}

async function handleKV(
	kv: StrataKV,
	cmd: string,
	parts: string[],
	line: string
) {
	// KV commands might have simple args (GET) or complex values (SET)

	if (cmd === "KV:SCAN") {
		const prefix = parts[1]; // Optional
		console.log(`Scanning '${prefix || ""}'...`);
		let count = 0;
		for await (const entry of kv.scan(prefix)) {
			console.log(`${entry.key} => ${entry.value}`);
			if (++count >= 20) {
				console.log("... (limit 20)");
				break;
			}
		}
		if (count === 0) console.log("(empty)");
		return;
	}

	const key = parts[1];
	if (!key) throw new Error(`Usage: ${cmd} <key> [value]`);

	if (cmd === "KV:GET") {
		const val = await kv.database_get(key);
		console.log(val ?? "(nil)");
	} else if (cmd === "KV:DEL") {
		await kv.database_delete(key);
		console.log("OK");
	} else if (cmd === "KV:SET") {
		// Value is everything after the key
		const match = line.match(/^KV:SET\s+\S+\s+(.*)$/i);
		const value = match ? match[1] : "";
		if (!value) throw new Error("Usage: KV:SET <key> <value>");

		await kv.database_set(key, value);
		console.log("OK");
	}
}

function printHelp() {
	console.log(`
Commands:
  SQL:
    CREATE TABLE <table> (col TYPE, ...)
    INSERT INTO <table> (cols) VALUES (vals)
    SELECT * FROM <table> WHERE col = val
  
  DOC:
    INSERT <collection> <json>
    FIND <collection> [json]
    GET <collection> <id>
    INDEX <collection> <field>

  KV:
    KV:SET <key> <value>
    KV:GET <key>
    KV:DEL <key>
    KV:SCAN [prefix]
`);
}

main();
