import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import {
	database_init,
	database_set,
	database_get,
	database_delete,
	database_close,
} from "./index";

const rl = createInterface({ input, output });

async function main() {
	await database_init();
	console.log("Humble DB CLI");
	console.log("Commands: SET <key> <value>, GET <key>, DELETE <key>, EXIT");

	while (true) {
		const answer = await rl.question("> ");
		const parts = answer.trim().split(" ");
		const command = parts[0]?.toUpperCase();
		const key = parts[1];
		const value = parts.slice(2).join(" ");

		try {
			switch (command) {
				case "SET":
					if (!key || !value) {
						console.log("Usage: SET <key> <value>");
						break;
					}
					await database_set(key, value);
					console.log("OK");
					break;
				case "GET":
					if (!key) {
						console.log("Usage: GET <key>");
						break;
					}
					const result = await database_get(key);
					console.log(result === null ? "(nil)" : result);
					break;
				case "DELETE":
					if (!key) {
						console.log("Usage: DELETE <key>");
						break;
					}
					await database_delete(key);
					console.log("OK");
					break;
				case "EXIT":
					await database_close();
					console.log("Bye!");
					rl.close();
					return;
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
