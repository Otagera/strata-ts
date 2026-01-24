import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { StrataKV } from "./engine";

const TEST_DATA_DIR = "test_scan_data";

async function cleanDataDir() {
	await rm(TEST_DATA_DIR, { recursive: true, force: true });
}

describe("Strata KV: Scan & Iterator", () => {
	let db: StrataKV;

	beforeEach(async () => {
		await cleanDataDir();
		db = new StrataKV({ dataDir: TEST_DATA_DIR, memtableLimit: 3 });
		await db.database_init();
	});

	afterAll(async () => {
		await cleanDataDir();
	});

	test("Basic Scan (MemTable Only)", async () => {
		await db.database_set("a", "1");
		await db.database_set("b", "2");
		await db.database_set("c", "3");

		const results = [];
		for await (const pair of db.scan()) {
			results.push(pair);
		}

		expect(results).toEqual([
			{ key: "a", value: "1" },
			{ key: "b", value: "2" },
			{ key: "c", value: "3" },
		]);
	});

	test("Prefix Scan", async () => {
		await db.database_set("user/1", "Alice");
		await db.database_set("user/2", "Bob");
		await db.database_set("video/1", "Cat Video");

		const results = [];
		for await (const pair of db.scan("user/")) {
			results.push(pair);
		}

		expect(results).toEqual([
			{ key: "user/1", value: "Alice" },
			{ key: "user/2", value: "Bob" },
		]);
	});

	test("Scan Merged (SST + MemTable)", async () => {
		// Flush a, b to SST (Limit is 3)
		await db.database_set("a", "old_a");
		await db.database_set("b", "old_b");
		await db.database_set("d", "old_d"); // Trigger flush

		// Update a in MemTable, add c
		await db.database_set("a", "new_a");
		await db.database_set("c", "new_c");

		const results = [];
		for await (const pair of db.scan()) {
			results.push(pair);
		}

		// Expect sorted, latest versions
		expect(results).toEqual([
			{ key: "a", value: "new_a" },
			{ key: "b", value: "old_b" },
			{ key: "c", value: "new_c" },
			{ key: "d", value: "old_d" },
		]);
	});

	test("Scan respects Deletions (Tombstones)", async () => {
		await db.database_set("a", "1");
		await db.database_set("b", "2");
		await db.database_set("c", "3");
		await db.database_close(); // Flush all to SST

		const db2 = new StrataKV({ dataDir: TEST_DATA_DIR });
		await db2.database_init();

		await db2.database_delete("b"); // Tombstone in MemTable

		const results = [];
		for await (const pair of db2.scan()) {
			results.push(pair);
		}

		expect(results).toEqual([
			{ key: "a", value: "1" },
			{ key: "c", value: "3" },
		]);
	});

	test("Scan with Prefix and multiple SSTs", async () => {
		// Force creation of multiple SSTs
		await db.database_set("prefix/1", "v1");
		await db.database_set("prefix/2", "v2");
		await db.database_set("prefix/3", "v3"); // Flush

		await db.database_set("prefix/4", "v4");
		await db.database_set("prefix/5", "v5");
		await db.database_set("prefix/6", "v6"); // Flush

		await db.database_set("other/1", "o1");

		const results = [];
		for await (const pair of db.scan("prefix/")) {
			results.push(pair);
		}

		expect(results.length).toBe(6);
		expect(results[0]?.key).toBe("prefix/1");
		expect(results[5]?.key).toBe("prefix/6");
	});
});
