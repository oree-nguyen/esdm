import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBatch, deleteSession, loadBatch, loadBatches, saveBatch, saveSession } from "./draftStorage";
import type { ReportSession } from "../types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const createSession = (id: string, batchId: string): ReportSession => ({
  id,
  batchId,
  batchIndex: 0,
  batchTotal: 2,
  createdAt: 1,
  updatedAt: 1,
  status: "in_progress",
  rawInput: "source data",
  lastCompletedStep: "analysis",
  stepOutputs: { fixRoundCount: 0 },
  stepTraceLog: [],
  messages: [],
});

describe("batch storage", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));

  it("lists pending batch records newest first", () => {
    saveBatch({ batchId: "older", sessionIds: ["a"], createdAt: 10 });
    saveBatch({ batchId: "newer", sessionIds: ["b"], createdAt: 20 });
    expect(loadBatches().map((batch) => batch.batchId)).toEqual(["newer", "older"]);
    deleteBatch("newer");
    expect(loadBatch("newer")).toBeUndefined();
  });

  it("keeps the batch index consistent when a session is deleted", () => {
    saveBatch({ batchId: "batch-1", sessionIds: ["a", "b"], createdAt: 10 });
    saveSession(createSession("a", "batch-1"));
    saveSession({ ...createSession("b", "batch-1"), batchIndex: 1 });
    deleteSession("a");
    expect(loadBatch("batch-1")?.sessionIds).toEqual(["b"]);
    deleteSession("b");
    expect(loadBatch("batch-1")).toBeUndefined();
  });
});
