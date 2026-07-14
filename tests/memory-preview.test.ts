import assert from "node:assert/strict";
import test from "node:test";
import {
  getMemoryPreviewPathname,
  memoryRedirectCacheSeconds,
  memoryPreviewUrl,
  parseMemoryPreviewWidth,
} from "../lib/memory-preview";

test("memory previews accept only the generated width variants", () => {
  assert.equal(parseMemoryPreviewWidth("480"), 480);
  assert.equal(parseMemoryPreviewWidth("960"), null);
  assert.equal(parseMemoryPreviewWidth("481"), null);
  assert.equal(parseMemoryPreviewWidth("0"), null);
  assert.equal(parseMemoryPreviewWidth(null), null);
});

test("redirect caching never outlives a signed private URL", () => {
  const now = 1_000_000;
  assert.equal(memoryRedirectCacheSeconds(now + 5 * 60_000, now), 240);
  assert.equal(memoryRedirectCacheSeconds(now + 50_000, now), 20);
  assert.equal(memoryRedirectCacheSeconds(now + 30_000, now), 0);
  assert.equal(memoryRedirectCacheSeconds(now - 1, now), 0);
});

test("memory preview paths are stable and do not replace originals", () => {
  assert.equal(
    getMemoryPreviewPathname("families/family/photo.jpg", 480),
    "families/family/photo.jpg.preview-480.webp",
  );
  assert.equal(
    memoryPreviewUrl("/api/memories/123", 480),
    "/api/memories/123?width=480",
  );
  assert.equal(
    memoryPreviewUrl("/api/memories/123?download=0", 480),
    "/api/memories/123?download=0&width=480",
  );
  assert.equal(
    memoryPreviewUrl("blob:https://example.test/local-preview", 480),
    "blob:https://example.test/local-preview",
  );
});
