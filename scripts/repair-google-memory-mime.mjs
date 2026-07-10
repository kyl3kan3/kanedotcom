import { del, get, put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const applyChanges = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

if (!databaseUrl || !blobToken) {
  throw new Error(
    "DATABASE_URL and BLOB_READ_WRITE_TOKEN are required in .env.local.",
  );
}

const sql = neon(databaseUrl);
const rows = await sql`
  SELECT id, original_name, storage_key
  FROM memories
  WHERE source = 'google_photos'
    AND status = 'ready'
    AND deleted_at IS NULL
    AND mime_type IN ('image/heic', 'image/heif')
    AND storage_key IS NOT NULL
  ORDER BY created_at
`;

console.log(
  `[google-memory-repair] ${rows.length} mislabeled Google photo${rows.length === 1 ? "" : "s"} found.`,
);

if (!applyChanges) {
  console.log(
    "[google-memory-repair] Dry run only. Re-run with --apply to repair Blob and Neon metadata.",
  );
  process.exit(0);
}

function jpegName(value) {
  return /\.(?:heic|heif)$/i.test(value)
    ? value.replace(/\.(?:heic|heif)$/i, ".jpg")
    : `${value}.jpg`;
}

function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

let repaired = 0;

for (const row of rows) {
  const source = await get(row.storage_key, {
    access: "private",
    token: blobToken,
    useCache: false,
  });

  if (!source || source.statusCode !== 200 || !source.stream) {
    throw new Error("A private Google memory could not be read for repair.");
  }

  const bytes = new Uint8Array(await new Response(source.stream).arrayBuffer());
  if (!isJpeg(bytes)) {
    throw new Error(
      "A Google memory labeled as HEIF did not contain JPEG bytes; repair stopped safely.",
    );
  }

  const repairedStorageKey = jpegName(row.storage_key);
  const repairedOriginalName = jpegName(row.original_name);

  await put(repairedStorageKey, bytes, {
    access: "private",
    allowOverwrite: true,
    cacheControlMaxAge: 30 * 24 * 60 * 60,
    contentType: "image/jpeg",
    token: blobToken,
  });

  const updated = await sql`
    UPDATE memories
    SET storage_key = ${repairedStorageKey},
        original_name = ${repairedOriginalName},
        mime_type = 'image/jpeg'
    WHERE id = ${row.id}
      AND storage_key = ${row.storage_key}
      AND mime_type IN ('image/heic', 'image/heif')
    RETURNING id
  `;

  if (updated.length !== 1) {
    throw new Error("A repaired Blob was created, but its Neon record was not updated.");
  }

  if (repairedStorageKey !== row.storage_key) {
    await del(row.storage_key, { token: blobToken }).catch((error) => {
      console.warn(
        "[google-memory-repair] The old Blob copy could not be removed.",
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  repaired += 1;
  console.log(`[google-memory-repair] repaired ${repaired}/${rows.length}`);
}

console.log(`[google-memory-repair] complete: ${repaired} repaired.`);
