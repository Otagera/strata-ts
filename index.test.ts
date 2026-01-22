import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { 
  database_set, 
  database_get, 
  database_delete, 
  compaction, 
  database_init,
  database_close,
  _reset_db_state,
  _get_db_size
} from "./index";
import { rm, mkdir } from "node:fs/promises";

// Helper to clear the DB state and files
async function clearDb() {
  await rm("data", { recursive: true, force: true });
  await mkdir("data", { recursive: true });
  _reset_db_state();
  await database_init();
}

describe("Humble File DB (SSTable Edition)", () => {
  beforeEach(async () => {
    await clearDb();
  });

  afterAll(async () => {
    await clearDb();
  });

  test("Basic Set and Get", async () => {
    await database_set("user_1", "Alice");
    const val = await database_get("user_1");
    expect(val).toBe("Alice");
  });

  test("Get non-existent key returns null", async () => {
    const val = await database_get("ghost");
    expect(val).toBe(null);
  });

  test("Update value (overwrite)", async () => {
    await database_set("config", "dark_mode");
    let val = await database_get("config");
    expect(val).toBe("dark_mode");

    await database_set("config", "light_mode");
    val = await database_get("config");
    expect(val).toBe("light_mode");
  });

  test("Delete key", async () => {
    await database_set("temp", "data");
    expect(await database_get("temp")).toBe("data");

    await database_delete("temp");
    expect(await database_get("temp")).toBe(null);
  });

  test("Persistence (Restart)", async () => {
    // 1. Write data
    await database_set("p1", "persistent");
    await database_set("p2", "trash");

    // 2. Graceful Shutdown (Flushes MemTable)
    await database_close();

    // 3. Restart (Init)
    await database_init();

    // 4. Verify state restored from SSTs
    expect(await database_get("p1")).toBe("persistent");
  });

  test("Unicode/Emoji Support", async () => {
    const key = "user_🚀";
    const value = "Othniel_👍";
    
    await database_set(key, value);
    const result = await database_get(key);
    expect(result).toBe(value);

    // Graceful Shutdown
    await database_close();
    await database_init();
    expect(await database_get(key)).toBe(value);
  });

  test("Edge Case: Empty Value", async () => {
    await database_set("empty", "");
    expect(await database_get("empty")).toBe("");
  });

  test("Large number of keys (triggers multiple SSTs)", async () => {
    const COUNT = 100; // Reduced for speed in development
    for (let i = 0; i < COUNT; i++) {
      await database_set(`k_${i}`, `val_${i}`);
    }

    // Verify a sample of keys across different SSTs
    expect(await database_get("k_0")).toBe("val_0");
    expect(await database_get("k_50")).toBe("val_50");
    expect(await database_get(`k_${COUNT-1}`)).toBe(`val_${COUNT-1}`);
  });

  test.skip("Compaction", async () => {
    // Skipped until we implement K-Way Merge
  });
});
