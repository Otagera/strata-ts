import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { 
  database_set, 
  database_get, 
  database_delete, 
  compaction, 
  database_init,
  _reset_db_state,
  _get_db_size
} from "./index";
import { writeFile, readFile } from "node:fs/promises";

const FILENAME = "the_humble_file.txt";

// Helper to clear the DB file
async function clearDbFile() {
  await writeFile(FILENAME, "");
  _reset_db_state();
}

describe("Humble File DB", () => {
  beforeEach(async () => {
    await clearDbFile();
  });

  afterAll(async () => {
    await clearDbFile();
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
    await database_set("p2", "data");
    await database_delete("p2");

    // 2. Simulate "crash" (clear memory)
    _reset_db_state();
    expect(_get_db_size()).toBe(0);

    // 3. Restart (Init)
    await database_init();

    // 4. Verify state restored
    expect(await database_get("p1")).toBe("persistent");
    expect(await database_get("p2")).toBe(null);
  });

  test("Compaction (Garbage Collection)", async () => {
    // Write 10 updates for same key
    for (let i = 0; i < 10; i++) {
      await database_set("counter", i.toString());
    }
    
    // Check file size before compaction (should be large)
    const beforeContent = await readFile(FILENAME, "utf8");
    const beforeLines = beforeContent.trim().split("\n").length;
    expect(beforeLines).toBeGreaterThanOrEqual(10);

    // Run compaction
    await compaction();

    // Verify value is still correct
    const val = await database_get("counter");
    expect(val).toBe("9");

    // Check file size (should be small, just 1 line)
    const afterContent = await readFile(FILENAME, "utf8");
    const afterLines = afterContent.trim().split("\n").length;
    expect(afterLines).toBe(1);
  });

  test("Unicode/Emoji Support", async () => {
    const key = "user_🚀";
    const value = "Othniel_👍";
    
    await database_set(key, value);
    const result = await database_get(key);
    expect(result).toBe(value);

    // Restart check for byte offset correctness
    _reset_db_state();
    await database_init();
    expect(await database_get(key)).toBe(value);
  });

  test("Large number of keys", async () => {
    const COUNT = 1000;
    for (let i = 0; i < COUNT; i++) {
      await database_set(`k_${i}`, `val_${i}`);
    }

    expect(_get_db_size()).toBe(COUNT);
    expect(await database_get("k_0")).toBe("val_0");
    expect(await database_get(`k_${COUNT-1}`)).toBe(`val_${COUNT-1}`);
  });
});
