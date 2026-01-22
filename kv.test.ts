import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { StrataKV } from "./index";
import { rm } from "node:fs/promises";
import path from "node:path";

const TEST_DATA_DIR = "test_data";

// Helper to clear the files
async function cleanDataDir() {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
}

describe("Strata DB (KV Edition)", () => {
  let db: StrataKV;

  beforeEach(async () => {
    await cleanDataDir();
    // Use the custom test directory
    db = new StrataKV({ dataDir: TEST_DATA_DIR });
    await db.database_init();
  });

  afterAll(async () => {
    await cleanDataDir();
  });

  test("Basic Set and Get", async () => {
    await db.database_set("user_1", "Alice");
    const val = await db.database_get("user_1");
    expect(val).toBe("Alice");
  });

  test("Get non-existent key returns null", async () => {
    const val = await db.database_get("ghost");
    expect(val).toBe(null);
  });

  test("Update value (overwrite)", async () => {
    await db.database_set("config", "dark_mode");
    let val = await db.database_get("config");
    expect(val).toBe("dark_mode");

    await db.database_set("config", "light_mode");
    val = await db.database_get("config");
    expect(val).toBe("light_mode");
  });

  test("Delete key", async () => {
    await db.database_set("temp", "data");
    expect(await db.database_get("temp")).toBe("data");

    await db.database_delete("temp");
    expect(await db.database_get("temp")).toBe(null);
  });

  test("Persistence (Restart)", async () => {
    await db.database_set("p1", "persistent");
    await db.database_set("p2", "trash");

    await db.database_close();

    const newDb = new StrataKV({ dataDir: TEST_DATA_DIR });
    await newDb.database_init();

    expect(await newDb.database_get("p1")).toBe("persistent");
  });

  test("Unicode/Emoji Support", async () => {
    const key = "user_🚀";
    const value = "Othniel_👍";
    
    await db.database_set(key, value);
    const result = await db.database_get(key);
    expect(result).toBe(value);

    await db.database_close();
    const newDb = new StrataKV({ dataDir: TEST_DATA_DIR });
    await newDb.database_init();
    expect(await newDb.database_get(key)).toBe(value);
  });

  test("Edge Case: Empty Value", async () => {
    await db.database_set("empty", "");
    expect(await db.database_get("empty")).toBe("");
  });

  test("Large number of keys (triggers multiple SSTs)", async () => {
    const COUNT = 100;
    for (let i = 0; i < COUNT; i++) {
      await db.database_set(`k_${i}`, `val_${i}`);
    }

    expect(await db.database_get("k_0")).toBe("val_0");
    expect(await db.database_get("k_50")).toBe("val_50");
    expect(await db.database_get(`k_${COUNT-1}`)).toBe(`val_${COUNT-1}`);
  });

  test("Compaction (Garbage Collection)", async () => {
    for (let i = 0; i < 15; i++) {
        await db.database_set(`key_${i}`, `v1_${i}`);
    }
    await db.database_set("key_0", "v2_0");
    await db.database_delete("key_1");
    
    await db.database_close();
    
    const newDb = new StrataKV({ dataDir: TEST_DATA_DIR });
    await newDb.database_init();
    
    await newDb.compaction();
    
    expect(await newDb.database_get("key_0")).toBe("v2_0");
    expect(await newDb.database_get("key_1")).toBe(null);
    expect(await newDb.database_get("key_2")).toBe("v1_2");
  });

  test("Load Test (1,000 Keys)", async () => {
    const COUNT = 1000;
    const START_TIME = Date.now();
    
    for (let i = 0; i < COUNT; i++) {
        await db.database_set(`load_${i}`, `payload_${i}`);
    }

    const WRITE_TIME = Date.now() - START_TIME;
    console.log(`Wrote ${COUNT} keys in ${WRITE_TIME}ms`);

    // Verify random access
    expect(await db.database_get("load_0")).toBe("payload_0");
    expect(await db.database_get("load_500")).toBe("payload_500");
    expect(await db.database_get(`load_${COUNT-1}`)).toBe(`payload_${COUNT-1}`);
    
    // Check restart time with many files
    await db.database_close();
    const RESTART_START = Date.now();
    const newDb = new StrataKV({ dataDir: TEST_DATA_DIR });
    await newDb.database_init();
    console.log(`Restarted with ${COUNT/5} files in ${Date.now() - RESTART_START}ms`);

    expect(await newDb.database_get("load_999")).toBe("payload_999");
  });
});
