import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fromRoot = (...parts) => join(root, ...parts);
const read = (...parts) => readFileSync(fromRoot(...parts), "utf8");

test("package scripts use the native Next.js runtime", () => {
  const packageJson = JSON.parse(read("package.json"));
  const allPackages = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.scripts.start, "next start");
  assert.match(packageJson.scripts.test, /tests\/source-contracts\.test\.mjs/);
  assert.match(packageJson.scripts["db:seed"], /db\/seed\.mjs/);

  for (const legacyPackage of [
    "vinext",
    "vite",
    "wrangler",
    "@cloudflare/vite-plugin",
    "@vitejs/plugin-react",
    "@vitejs/plugin-rsc",
    "react-server-dom-webpack",
  ]) {
    assert.equal(
      allPackages[legacyPackage],
      undefined,
      `${legacyPackage} should not be part of the production project`,
    );
  }

  assert.ok(allPackages.next, "Next.js must remain an explicit dependency");
});

test("legacy Sites, Cloudflare Worker, and Vite entry points are removed", () => {
  for (const path of [
    ".openai/hosting.json",
    "build/sites-vite-plugin.ts",
    "vite.config.ts",
    "worker/index.ts",
    "app/chatgpt-auth.ts",
  ]) {
    assert.equal(existsSync(fromRoot(path)), false, `${path} should not exist`);
  }

  assert.doesNotMatch(read("next.config.ts"), /vinext|cloudflare|workerEntrypoint/i);
});

test("Neon Auth is exposed through Next.js and protects application routes", () => {
  const authServer = read("lib", "auth", "server.ts");
  const authRoute = read("app", "api", "auth", "[...path]", "route.ts");
  const authPage = read("app", "auth", "[path]", "page.tsx");
  const verificationForm = read(
    "app",
    "auth",
    "verify-email",
    "verification-form.tsx",
  );
  const proxy = read("proxy.ts");

  assert.match(authServer, /createNeonAuth/);
  assert.match(authServer, /NEON_AUTH_BASE_URL/);
  assert.match(authServer, /NEON_AUTH_COOKIE_SECRET/);
  assert.match(authServer, /sameSite:\s*["']lax["']/);
  assert.match(authRoute, /export async function GET/);
  assert.match(authRoute, /export async function POST/);
  assert.match(authRoute, /getAuth\(\)\.handler\(\)/);
  assert.match(authPage, /AuthView/);
  assert.match(verificationForm, /emailOtp\.verifyEmail/);
  assert.match(proxy, /getAuth\(\)\.middleware/);
  assert.match(proxy, /loginUrl:\s*["']\/auth\/sign-in["']/);
  assert.match(proxy, /\/auth\/verify-email/);
  assert.match(proxy, /NextResponse\.next/);
});

test("family authorization is server-derived and enforced before mutations", () => {
  const family = read("lib", "family.ts");
  const actions = read("app", "actions.ts");

  assert.match(family, /getAuth\(\)\.getSession\(\)/);
  assert.match(family, /familyMembers\.isActive/);
  assert.match(family, /familyMembers\.authUserId/);
  assert.match(family, /familyMembers\.invitedEmail/);
  assert.match(family, /user\.emailVerified/);
  assert.match(family, /export async function requireFamilyContext/);
  assert.match(actions, /requireFamilyContext\(\)/);
  assert.match(actions, /familyMembers\.familyId/);
  assert.doesNotMatch(
    actions,
    /function\s+\w+\s*\([^)]*familyId\s*:/,
    "server actions must not accept a browser-supplied familyId",
  );
});

test("Drizzle targets Neon PostgreSQL with family-scoped relational tables", () => {
  const config = read("drizzle.config.ts");
  const database = read("db", "index.ts");
  const schema = read("db", "schema.ts");

  assert.match(config, /dialect:\s*["']postgresql["']/);
  assert.match(database, /@neondatabase\/serverless/);
  assert.match(database, /drizzle-orm\/neon-http/);
  assert.match(schema, /drizzle-orm\/pg-core/);
  assert.doesNotMatch(schema, /sqlite-core|sqliteTable/);

  for (const table of [
    "families",
    "family_members",
    "trips",
    "trip_stamps",
    "trip_votes",
    "memories",
  ]) {
    assert.match(schema, new RegExp(`pgTable\\(\\s*["']${table}["']`));
  }

  assert.match(schema, /familyId:[\s\S]*references\(\(\) => families\.id/);
  assert.match(schema, /uploadedByMemberId:[\s\S]*familyMembers\.id/);
  assert.match(schema, /storageKey:\s*text\(["']storage_key["']\)/);

  const seed = read("db", "seed.mjs");
  for (const slug of ["yellowstone", "beach", "chicago", "farm"]) {
    assert.match(seed, new RegExp(`['"]${slug}['"]`));
  }
});

test("Google Photos imports become permanent private family memories", () => {
  const packageJson = JSON.parse(read("package.json"));
  const storage = read("lib", "memory-storage.ts");
  const importer = read(
    "app",
    "api",
    "photos",
    "google",
    "sessions",
    "[sessionId]",
    "route.ts",
  );
  const delivery = read("app", "api", "memories", "[memoryId]", "route.ts");
  const repair = read("scripts", "repair-google-memory-mime.mjs");

  assert.ok(packageJson.dependencies["@vercel/blob"]);
  assert.match(storage, /upstream\.headers\.get\(["']content-type["']\)/);
  assert.match(storage, /put\(storedPathname, upstream\.body/);
  assert.match(storage, /contentType:\s*upstreamMimeType/);
  assert.match(storage, /access:\s*["']private["']/);
  assert.match(storage, /issueSignedToken/);
  assert.match(storage, /presignUrl/);
  assert.match(importer, /copyGoogleMediaToPrivateBlob/);
  assert.match(importer, /status:\s*["']ready["']/);
  assert.match(importer, /storageKey:\s*blob\.pathname/);
  assert.match(importer, /mimeType:\s*storedMimeType/);
  assert.match(importer, /\[google-photos-import\] import failed/);
  assert.match(delivery, /getFamilyContext\(\)/);
  assert.match(delivery, /eq\(memories\.familyId, member\.familyId\)/);
  assert.match(delivery, /getPrivateMemoryUrl/);
  assert.match(repair, /isJpeg/);
  assert.match(repair, /mime_type = 'image\/jpeg'/);
  assert.match(repair, /--apply/);
});

test("Google Photos connection is configuration-aware and browser-safe", () => {
  const configuration = read("lib", "google-photos.ts");
  const statusRoute = read(
    "app",
    "api",
    "photos",
    "google",
    "status",
    "route.ts",
  );
  const sessionRoute = read(
    "app",
    "api",
    "photos",
    "google",
    "session",
    "route.ts",
  );
  const importer = read(
    "app",
    "api",
    "photos",
    "google",
    "sessions",
    "[sessionId]",
    "route.ts",
  );
  const callback = read(
    "app",
    "api",
    "photos",
    "google",
    "callback",
    "route.ts",
  );
  const returnPage = read(
    "app",
    "auth",
    "google-photos-return",
    "page.tsx",
  );
  const client = read("app", "adventure-book.tsx");
  const proxy = read("proxy.ts");
  const envExample = read(".env.example");
  const readme = read("README.md");

  for (const variable of [
    "GOOGLE_PHOTOS_CLIENT_ID",
    "GOOGLE_PHOTOS_CLIENT_SECRET",
    "GOOGLE_PHOTOS_REDIRECT_URI",
  ]) {
    assert.match(configuration, new RegExp(variable));
    assert.match(envExample, new RegExp(`^${variable}=`, "m"));
  }

  assert.match(statusRoute, /getGooglePhotosConfigStatus/);
  assert.match(configuration, /BLOB_READ_WRITE_TOKEN/);
  assert.match(configuration, /https:\/\/kanedotcom\.com/);
  assert.match(sessionRoute, /configured:\s*false/);
  assert.match(sessionRoute, /timeoutAfterMs/);
  assert.match(sessionRoute, /maxItemCount:\s*["']50["']/);
  assert.match(importer, /pollingConfig\?\.timeoutIn/);
  assert.match(importer, /Choose 50 or fewer Google Photos/);
  assert.match(client, /googlePollExpiryTimerRef/);
  assert.match(client, /readJsonResponse/);
  assert.match(client, /content-type/);
  assert.match(client, /window\.open\(\s*["']about:blank["']/);
  assert.match(client, /Open picker manually/);
  assert.match(client, /setImportView\(["']choose["']\)/);
  assert.match(client, /memory-shelf-section/);
  assert.match(callback, /try\s*{[\s\S]*oauth2\.googleapis\.com\/token/);
  assert.match(callback, /GOOGLE_PHOTOS_STATE_COOKIE/);
  assert.match(callback, /\/auth\/google-photos-return/);
  assert.doesNotMatch(callback, /requireGooglePhotosAdmin/);
  assert.match(returnPage, /window\.location\.replace/);
  assert.match(returnPage, /allowedStatuses/);
  assert.match(proxy, /VERCEL_ENV\s*===\s*["']production["']/);
  assert.match(proxy, /kanedotcom\.com/);
  assert.match(proxy, /\/auth\/google-photos-return/);
  assert.match(proxy, /startsWith\(["']\/api\/photos\/google\/["']\)/);
  assert.match(proxy, /\/api\/photos\/google\/[\s\S]*NextResponse\.next\(\)/);
  assert.match(proxy, /startsWith\(["']\/api\/memories\/["']\)/);

  const popupIndex = client.indexOf('window.open(\n      "about:blank"');
  const sessionFetchIndex = client.indexOf(
    'fetch("/api/photos/google/session"',
  );
  assert.ok(popupIndex >= 0 && popupIndex < sessionFetchIndex);
  assert.doesNotMatch(readme, /connection shown in the interface is not wired/i);
});

test("Google metadata is retained and existing imports can be enriched", () => {
  const schema = read("db", "schema.ts");
  const configuration = read("lib", "google-photos.ts");
  const importer = read(
    "app",
    "api",
    "photos",
    "google",
    "sessions",
    "[sessionId]",
    "route.ts",
  );
  const intelligence = read("lib", "memory-intelligence.ts");

  for (const field of [
    "sourceMediaId",
    "capturedAt",
    "captureTimeSource",
    "width",
    "height",
    "durationMs",
    "metadataStatus",
  ]) {
    assert.match(schema, new RegExp(`${field}:`));
  }

  assert.match(configuration, /mediaFileMetadata/);
  assert.match(configuration, /cameraMake/);
  assert.match(configuration, /videoMetadata/);
  assert.match(importer, /parseGoogleCaptureTime\(item\.createTime\)/);
  assert.match(importer, /sourceMediaId:\s*item\.googleId/);
  assert.match(importer, /metadata\?\.width/);
  assert.match(importer, /metadata\?\.height/);
  assert.match(importer, /processingStatus\s*!==\s*["']READY["']/);
  assert.match(importer, /if \(stored\)[\s\S]*update\(memories\)/);
  assert.match(intelligence, /parseExif/);
  assert.match(intelligence, /resize\(\{[\s\S]*width:\s*512/);
  assert.match(intelligence, /parseMp4MovieHeader/);
  assert.match(intelligence, /UNIX_EPOCH_SENTINEL_WINDOW_MS/);
  assert.doesNotMatch(intelligence, /parseExif\([^)]*GPS|latitude|longitude/i);
});

test("AI trip organization is admin-only, private, reviewable, and atomic", () => {
  const packageJson = JSON.parse(read("package.json"));
  const schema = read("db", "schema.ts");
  const organizer = read("app", "api", "memories", "organize", "route.ts");
  const apply = read(
    "app",
    "api",
    "memories",
    "organize",
    "apply",
    "route.ts",
  );
  const client = read("app", "adventure-book.tsx");
  const page = read("app", "page.tsx");
  const envExample = read(".env.example");

  assert.match(packageJson.dependencies.ai, /^\^6\./);
  assert.match(packageJson.dependencies["@ai-sdk/openai"], /^\^3\./);
  assert.match(schema, /pgTable\(\s*["']trip_drafts["']/);
  assert.match(schema, /pgTable\(\s*["']trip_draft_memories["']/);

  assert.match(organizer, /requireFamilyAdmin\(\)/);
  assert.match(organizer, /generateText\(/);
  assert.match(organizer, /Output\.object\(/);
  assert.doesNotMatch(organizer, /generateObject\(/);
  assert.match(organizer, /openai:\s*\{\s*store:\s*false/);
  assert.match(organizer, /imageDetail:\s*["']low["']/);
  assert.match(organizer, /eq\(memories\.familyId,\s*context\.member\.familyId\)/);
  assert.doesNotMatch(organizer, /request\.json|body\.familyId/);

  assert.match(apply, /requireFamilyAdmin\(\)/);
  assert.match(apply, /db\.batch\(/);
  assert.match(apply, /jsonb_to_recordset/);
  assert.match(apply, /eq\(tripDrafts\.familyId,\s*context\.member\.familyId\)/);
  assert.doesNotMatch(apply, /body\.familyId|familyId:\s*parsed\.data/);

  assert.match(client, /data-testid=["']organize-memories["']/);
  assert.match(client, /data-testid=["']memory-organizer["']/);
  assert.match(client, /data-testid=["']create-approved-trips["']/);
  assert.match(client, /MessageResponse/);
  assert.match(client, /void generateTripDrafts\(\)/);
  assert.match(page, /eq\(trips\.source,\s*["']ai["']\)/);
  assert.match(envExample, /^OPENAI_API_KEY=/m);
  assert.match(envExample, /^AI_ORGANIZER_MODEL=/m);
});

test("trip dates use one family timezone during server and client rendering", () => {
  const client = read("app", "adventure-book.tsx");

  assert.match(client, /timeZone:\s*["']America\/Chicago["']/);
});
