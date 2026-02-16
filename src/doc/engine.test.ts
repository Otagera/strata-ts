import { afterAll, beforeAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { StrataDoc } from "./engine";

const TEST_DIR = "data_doc_test";

test("StrataDoc: Basic Operations", async () => {
	await rm(TEST_DIR, { recursive: true, force: true });
	const db = new StrataDoc({ dataDir: TEST_DIR });
	await db.init();

	// 1. Insert
	const user = await db.insert("users", { name: "Alice", age: 30 });
	expect(user._id).toBeDefined();
	expect(user.name).toBe("Alice");

	// 2. FindById
	const found = await db.findById("users", user._id);
	expect(found).toEqual(user);

	// 3. Duplicate Insert (should fail)
	try {
		await db.insert("users", { _id: user._id, name: "Clone" });
		expect(true).toBe(false); // Should not reach here
	} catch (e: any) {
		expect(e.message).toContain("already exists");
	}

	// 4. Update
	const updated = await db.update("users", { _id: user._id, city: "Paris" });
	expect(updated.name).toBe("Alice"); // Preserved
	expect(updated.city).toBe("Paris"); // Added

	const foundUpdated = await db.findById("users", user._id);
	expect(foundUpdated.city).toBe("Paris");

	await db.close();
});

test("StrataDoc: Find & Cursor", async () => {
	await rm(TEST_DIR, { recursive: true, force: true });
	const db = new StrataDoc({ dataDir: TEST_DIR });
	await db.init();

	await db.insert("users", { name: "Alice", dept: "Eng", age: 30 });
	await db.insert("users", { name: "Bob", dept: "Sales", age: 40 });
	await db.insert("users", { name: "Charlie", dept: "Eng", age: 25 });
	await db.insert("users", { name: "Dave", dept: "Eng", age: 35 });
	await db.insert("products", { name: "Laptop", dept: "Eng" });

	// 1. Basic Find (toArray)
	const eng = await db.find("users", { dept: "Eng" }).toArray();
	expect(eng).toHaveLength(3);
	const names = eng.map((u: any) => u.name).sort();
	expect(names).toEqual(["Alice", "Charlie", "Dave"]);

	// 2. Cursor Limit
	const limitTwo = await db.find("users", { dept: "Eng" }).limit(2).toArray();
	expect(limitTwo).toHaveLength(2);

	// 3. Generator Iteration (for await)
	let count = 0;
	for await (const user of db.find("users", { dept: "Eng" })) {
		expect(user.dept).toBe("Eng");
		count++;
	}
	expect(count).toBe(3);

	// 4. Find with multiple criteria
	const alice = await db
		.find("users", { name: "Alice", dept: "Eng" })
		.toArray();
	expect(alice).toHaveLength(1);

	await db.close();
});

test("StrataDoc: Advanced Operators", async () => {
	await rm(TEST_DIR, { recursive: true, force: true });
	const db = new StrataDoc({ dataDir: TEST_DIR });
	await db.init();

	await db.insert("users", { name: "Alice", age: 30, rank: 1 });
	await db.insert("users", { name: "Bob", age: 40, rank: 2 });
	await db.insert("users", { name: "Charlie", age: 25, rank: 3 });

	// 1. $gt / $lt
	const thirties = await db
		.find("users", { age: { $gt: 25, $lt: 40 } })
		.toArray();
	expect(thirties).toHaveLength(1);
	expect(thirties[0].name).toBe("Alice");

	// 2. $gte / $lte
	const rankRange = await db.find("users", { rank: { $gte: 2 } }).toArray();
	expect(rankRange).toHaveLength(2); // Bob (2), Charlie (3)

	// 3. $ne
	const notAlice = await db.find("users", { name: { $ne: "Alice" } }).toArray();
	expect(notAlice).toHaveLength(2);

	// 4. $in
	const specific = await db.find("users", { age: { $in: [25, 40] } }).toArray();
	expect(specific).toHaveLength(2);
	const names = specific.map((u: any) => u.name).sort();
	expect(names).toEqual(["Bob", "Charlie"]);

	await db.close();
});

test("StrataDoc: Secondary Indexing", async () => {
	await rm(TEST_DIR, { recursive: true, force: true });
	const db = new StrataDoc({ dataDir: TEST_DIR });
	await db.init();

	// 1. Create Index
	db.createIndex("users", "rank");

	// 2. Insert Data
	await db.insert("users", { name: "Alice", rank: 1 });
	await db.insert("users", { name: "Bob", rank: 2 });
	await db.insert("users", { name: "Charlie", rank: 2 }); // Duplicate rank
	await db.insert("users", { name: "Dave", rank: 3 });

	// 3. Verify Index Keys exist (Proof of Indexing)
	// We need to access the underlying KV to verify this.
	// Since db.kv is private, we can't easily do it in a test without casting to any.
	const kv = (db as any).kv;
	const indexKeys = [];
	for await (const { key } of kv.scan("IDX")) {
		// Check unencoded prefix logic?
		// Wait, keys are encoded! "IDX" encoded is "IDX"
		indexKeys.push(key);
	}
	// We expect 4 index entries (one for each user)
	expect(indexKeys.length).toBeGreaterThanOrEqual(4);

	// 4. Query using Index
	// We expect IndexCursor to be used here.
	const rankTwos = await db.find("users", { rank: 2 }).toArray();
	expect(rankTwos).toHaveLength(2);
	const names = rankTwos.map((u: any) => u.name).sort();
	expect(names).toEqual(["Bob", "Charlie"]);

	await db.close();
});
