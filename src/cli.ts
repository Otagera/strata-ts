import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { StrataKV } from "./index";

const rl = createInterface({ input, output });

async function main() {
	const db = new StrataKV();
	await db.database_init();

	console.log("Strata DB CLI");
	console.log("Commands: SET <key> <value>, GET <key>, DELETE <key>, EXIT");

	while (true) {
		const answer = await rl.question("> ");
		const parts = answer.trim().split(" ");
		const command = parts[0]?.toUpperCase();
		const key = parts[1];
		const value = parts.slice(2).join(" ");

		try {
			switch (command) {
				case "SET": {
					if (!key || !value) {
						console.log("Usage: SET <key> <value>");
						break;
					}
					await db.database_set(key, value);
					console.log("OK");
					break;
				}
				case "GET": {
					if (!key) {
						console.log("Usage: GET <key>");
						break;
					}
					const result = await db.database_get(key);
					console.log(result === null ? "(nil)" : result);
					break;
				}
				case "DELETE": {
					if (!key) {
						console.log("Usage: DELETE <key>");
						break;
					}
					await db.database_delete(key);
					console.log("OK");
					break;
				}
				case "EXIT": {
					await db.database_close();
					console.log("Bye!");
					rl.close();
					return;
				}
				default:
					if (command) {
						console.log("Unknown command");
					}
			}
		} catch (error) {
			console.error("Error:", error);
		}
	}
}

main();
