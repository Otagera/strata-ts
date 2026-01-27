import { test, expect } from "bun:test";
import { StrataId } from "./id";

test("StrataId: generates 24 character hex strings", () => {
  const id = StrataId.generate();
  expect(id).toHaveLength(24);
  expect(StrataId.isValid(id)).toBe(true);
});

test("StrataId: IDs are unique", () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    ids.add(StrataId.generate());
  }
  expect(ids.size).toBe(1000);
});

test("StrataId: IDs are roughly sortable by time", async () => {
  const id1 = StrataId.generate();
  // Wait 1.1s to ensure timestamp changes
  await new Promise(resolve => setTimeout(resolve, 1100));
  const id2 = StrataId.generate();
  
  expect(id1 < id2).toBe(true);
});
