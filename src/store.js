import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export function createEmptyData() {
  return {
    schools: [],
    classes: [],
    users: [],
    teacherClasses: [],
    invites: [],
    documents: [],
    assignments: [],
    submissions: [],
    reminders: [],
    idempotencyKeys: [],
    chatBindings: [],
    scheduler: { lastRunAt: null },
    auditEvents: []
  };
}

export class JsonStore {
  constructor(file) {
    this.file = file;
    this.data = createEmptyData();
    this.queue = Promise.resolve();
    this.ready = this.load();
  }

  async load() {
    await mkdir(dirname(this.file), { recursive: true });
    try {
      this.data = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.save();
    }
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2));
    await rename(tmp, this.file);
  }

  async read(fn) {
    await this.ready;
    return fn(this.data);
  }

  // Concurrent HTTP requests can each call mutate() before an earlier save()
  // finishes. Reads/mutations of `this.data` are synchronous, but save() is
  // not, so overlapping mutate() calls must be serialized or their writes to
  // disk interleave and corrupt/lose state. This queue guarantees at most
  // one mutate-then-save runs at a time, in call order.
  async mutate(fn) {
    await this.ready;
    const runAfter = this.queue.catch(() => {});
    let release;
    this.queue = new Promise((resolve) => { release = resolve; });
    await runAfter;
    try {
      const result = await fn(this.data);
      await this.save();
      return result;
    } finally {
      release();
    }
  }
}

export function makeId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function now() {
  return new Date().toISOString();
}

export function addAudit(data, event) {
  const audit = {
    id: makeId("evt"),
    at: now(),
    correlationId: event.correlationId,
    actorId: event.actorId || "system",
    schoolId: event.schoolId,
    resourceType: event.resourceType || "system",
    resourceId: event.resourceId || null,
    action: event.action,
    outcome: event.outcome || "ok",
    details: event.details || {}
  };
  data.auditEvents.unshift(audit);
  data.auditEvents = data.auditEvents.slice(0, 600);
  return audit;
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}
