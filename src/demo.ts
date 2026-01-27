import { StrataDoc } from "./doc/engine";
import { rm } from "node:fs/promises";

async function main() {
  const DATA_DIR = "data_demo";
  
  // Clean up previous run
  await rm(DATA_DIR, { recursive: true, force: true });

  console.log("🚀 Starting StrataDoc Demo...");
  const db = new StrataDoc({ dataDir: DATA_DIR });
  await db.init();

  // 1. Define Schema / Indexes
  console.log("📝 Creating Index on 'role'...");
  db.createIndex("staff", "role");

  // 2. Insert Data
  console.log("💾 Inserting staff members...");
  await db.insert("staff", { name: "Alice", role: "Manager", salary: 80000 });
  await db.insert("staff", { name: "Bob", role: "Engineer", salary: 70000 });
  await db.insert("staff", { name: "Charlie", role: "Engineer", salary: 72000 });
  await db.insert("staff", { name: "Dave", role: "Intern", salary: 30000 });

  // 3. Query using Index (Engineer)
  console.log("\n🔍 Finding all Engineers (Index Scan):");
  const engineers = await db.find("staff", { role: "Engineer" }).toArray();
  console.table(engineers);

  // 4. Query using Advanced Operators (Salary > 50k)
  console.log("\n💰 Finding High Earners (> 50k) (Collection Scan):");
  // Note: We don't have an index on salary, so this scans all staff
  const highEarners = await db.find("staff", { salary: { $gt: 50000 } }).toArray();
  console.table(highEarners);

  await db.close();
  console.log("\n✨ Demo Complete!");
}

main();
