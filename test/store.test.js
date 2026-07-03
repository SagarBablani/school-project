import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/store.js";

test("concurrent mutate() calls are serialized and none are lost", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sop-store-test-"));
  const file = join(dir, "data.json");
  try {
    const store = new JsonStore(file);
    await store.ready;
    store.data.assignments = [];

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.mutate((data) => {
        data.assignments.push({ id: `asg_${i}` });
      }))
    );

    const inMemory = await store.read((data) => data.assignments.length);
    assert.equal(inMemory, 20);

    const onDisk = JSON.parse(await readFile(file, "utf8"));
    assert.equal(onDisk.assignments.length, 20);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
