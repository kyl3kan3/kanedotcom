import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const apply = process.argv.includes("--apply");
const { and, eq, isNotNull, isNull } = await import("drizzle-orm");
const { getDb } = await import("../db/index");
const { memories } = await import("../db/schema");
const { getPrivateMemoryPreviewUrl } = await import(
  "../lib/memory-storage"
);

const rows = await getDb()
  .select({ storageKey: memories.storageKey })
  .from(memories)
  .where(
    and(
      eq(memories.kind, "image"),
      eq(memories.status, "ready"),
      isNull(memories.deletedAt),
      isNotNull(memories.storageKey),
    ),
  );

console.log(
  `${rows.length} ready private image${rows.length === 1 ? "" : "s"} found.`,
);

if (!apply || rows.length === 0) {
  if (!apply && rows.length > 0) {
    console.log("Dry run only. Re-run with --apply to create 480px previews.");
  }
  process.exit(0);
}

let completed = 0;
let failed = 0;
let cursor = 0;
const workerCount = Math.min(2, rows.length);

await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      if (!row.storageKey) continue;

      try {
        await getPrivateMemoryPreviewUrl(row.storageKey, 480);
        completed += 1;
      } catch {
        failed += 1;
      }

      const processed = completed + failed;
      if (processed % 10 === 0 || processed === rows.length) {
        console.log(`Prepared ${processed}/${rows.length} previews.`);
      }
    }
  }),
);

console.log(`Preview backfill complete: ${completed} ready, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;
