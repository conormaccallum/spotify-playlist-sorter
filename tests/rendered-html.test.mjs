import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("playlist sorter source replaces the starter shell", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /title:\s*"Playlist Sorter"/);
  assert.match(page, /Sort the playlist without losing the room/);
  assert.match(page, /classic/);
  assert.match(page, /marginal/);
  assert.match(page, /api\/tracks\/category/);
  assert.match(page, /api\/tracks\/reorder/);
  assert.doesNotMatch(page + layout + packageJson, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("build output includes the app routes", async () => {
  const manifest = await readFile(new URL("../.next/server/app-paths-manifest.json", import.meta.url), "utf8");

  assert.match(manifest, /api\/import/);
  assert.match(manifest, /api\/room/);
  assert.match(manifest, /api\/tracks\/category/);
  assert.match(manifest, /api\/tracks\/reorder/);
});
