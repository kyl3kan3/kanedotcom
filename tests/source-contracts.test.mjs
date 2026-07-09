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
