import { afterAll, describe, test } from "bun:test";
import { rm } from "node:fs/promises";
import { StrataKV } from "./engine";

const PERF_DIR_WAL = "perf_data_wal";
const PERF_DIR_NO_WAL = "perf_data_no_wal";

async function cleanDirs() {
	await rm(PERF_DIR_WAL, { recursive: true, force: true });
	await rm(PERF_DIR_NO_WAL, { recursive: true, force: true });
}

describe("WAL Performance Benchmark", () => {
	afterAll(async () => {
		await cleanDirs();
	});

	test("Compare throughput with and without WAL", async () => {
		const COUNT = 1000;
		await cleanDirs();

		// 1. With WAL
		const dbWal = new StrataKV({ dataDir: PERF_DIR_WAL, walEnabled: true });
		await dbWal.database_init();

		const startWal = performance.now();
		for (let i = 0; i < COUNT; i++) {
			await dbWal.database_set(`key_${i}`, `val_${i}`);
		}
		const timeWal = performance.now() - startWal;

		// 2. Without WAL
		const dbNoWal = new StrataKV({
			dataDir: PERF_DIR_NO_WAL,
			walEnabled: false,
		});
		await dbNoWal.database_init();

		const startNoWal = performance.now();
		for (let i = 0; i < COUNT; i++) {
			await dbNoWal.database_set(`key_${i}`, `val_${i}`);
		}
		const timeNoWal = performance.now() - startNoWal;

		console.log(`\n--- Performance Results (${COUNT} keys) ---`);
		console.log(
			`With WAL:    ${timeWal.toFixed(2)}ms (${(
				(COUNT / timeWal) * 1000
			).toFixed(0)} ops/sec)`,
		);
		console.log(
			`Without WAL: ${timeNoWal.toFixed(2)}ms (${(
				(COUNT / timeNoWal) * 1000
			).toFixed(0)} ops/sec)`,
		);
		console.log(
			`Overhead:    ${(((timeWal - timeNoWal) / timeNoWal) * 100).toFixed(
				1,
			)}% slower`,
		);
		console.log(`-------------------------------------------\n`);

		// Sanity check: WAL should be slower (or at least not faster)
		// But we don't strictly enforce it in a test assertion as environments vary
	});

	test("Compare throughput with High Memtable Limit", async () => {
		const COUNT = 1000;
		const HIGH_LIMIT = 5000;
		await cleanDirs();

		// 1. With WAL (No flushes)
		const dbWal = new StrataKV({
			dataDir: PERF_DIR_WAL,
			walEnabled: true,
			memtableLimit: HIGH_LIMIT,
		});
		await dbWal.database_init();

		const startWal = performance.now();
		for (let i = 0; i < COUNT; i++) {
			await dbWal.database_set(`key_${i}`, `val_${i}`);
		}
		const timeWal = performance.now() - startWal;

		// 2. Without WAL (Pure Memory)
		const dbNoWal = new StrataKV({
			dataDir: PERF_DIR_NO_WAL,
			walEnabled: false,
			memtableLimit: HIGH_LIMIT,
		});
		await dbNoWal.database_init();

		const startNoWal = performance.now();
		for (let i = 0; i < COUNT; i++) {
			await dbNoWal.database_set(`key_${i}`, `val_${i}`);
		}
		const timeNoWal = performance.now() - startNoWal;

		console.log(`\n--- High Limit Results (${COUNT} keys, Memory-Focused) ---`);
		console.log(
			`With WAL (Disk):  ${timeWal.toFixed(2)}ms (${(
				(COUNT / timeWal) * 1000
			).toFixed(0)} ops/sec)`,
		);
		console.log(
			`No WAL (Memory):  ${timeNoWal.toFixed(2)}ms (${(
				(COUNT / timeNoWal) * 1000
			).toFixed(0)} ops/sec)`,
		);
		console.log(
			`Overhead:         ${(((timeWal - timeNoWal) / timeNoWal) * 100).toFixed(
				1,
			)}% slower`,
		);
		console.log(`----------------------------------------------------------\n`);
	});
});
