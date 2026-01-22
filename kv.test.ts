import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { StrataKV } from "./index";
import { rm } from "node:fs/promises";

// Helper to clear the files
async function cleanDataDir() {
  await rm("data", { recursive: true, force: true });
}

describe("Strata DB (KV Edition)", () => {
  let db: StrataKV;

  beforeEach(async () => {
    await cleanDataDir();
    db = new StrataKV();
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
    // 1. Write data
    await db.database_set("p1", "persistent");
    await db.database_set("p2", "trash");

    // 2. Graceful Shutdown (Flushes MemTable)
    await db.database_close();

    // 3. Restart (New Instance)
    const newDb = new StrataKV();
    await newDb.database_init();

    // 4. Verify state restored from SSTs
    expect(await newDb.database_get("p1")).toBe("persistent");
  });

  test("Unicode/Emoji Support", async () => {
    const key = "user_🚀";
    const value = "Othniel_👍";
    
    await db.database_set(key, value);
    const result = await db.database_get(key);
    expect(result).toBe(value);

    // Persistence Check
    await db.database_close();
    const newDb = new StrataKV();
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

    // Verify a sample of keys across different SSTs
    expect(await db.database_get("k_0")).toBe("val_0");
    expect(await db.database_get("k_50")).toBe("val_50");
    expect(await db.database_get(`k_${COUNT-1}`)).toBe(`val_${COUNT-1}`);
  });
});