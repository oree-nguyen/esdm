import type { BatchRecord, ChatMessage, ReportSession, SessionIndexItem, Settings } from "../types";

const key = "intervention-draft-v1";
const indexKey = "sessions:index";
const activeKey = "sessions:active";
const batchPrefix = "batch:";
const maxSessions = 20;

export const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(key) || "{}") as { messages?: ChatMessage[]; report?: string; settings?: Settings }; }
  catch { return {}; }
};

export const saveDraft = (value: unknown) => localStorage.setItem(key, JSON.stringify(value));
export const clearStorage = () => localStorage.clear();

export const loadSessionIndex = (): SessionIndexItem[] => {
  try { return JSON.parse(localStorage.getItem(indexKey) || "[]"); }
  catch { return []; }
};

export const loadSession = (id: string): ReportSession | undefined => {
  try { return JSON.parse(localStorage.getItem(`sessions:${id}`) || "null") || undefined; }
  catch { return undefined; }
};

export const loadActiveSession = () => {
  const id = localStorage.getItem(activeKey);
  return id ? loadSession(id) : undefined;
};

export const saveBatch = (batch: BatchRecord) => {
  localStorage.setItem(`${batchPrefix}${batch.batchId}`, JSON.stringify(batch));
};

export const loadBatch = (batchId: string): BatchRecord | undefined => {
  try { return JSON.parse(localStorage.getItem(`${batchPrefix}${batchId}`) || "null") || undefined; }
  catch { return undefined; }
};

export const loadBatches = (): BatchRecord[] => {
  const batches: BatchRecord[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const storageKey = localStorage.key(index);
    if (!storageKey?.startsWith(batchPrefix)) continue;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "null") as BatchRecord | null;
      if (value?.batchId && Array.isArray(value.sessionIds)) batches.push(value);
    } catch { /* Ignore one corrupt batch without hiding the others. */ }
  }
  return batches.sort((a, b) => b.createdAt - a.createdAt);
};

export const deleteBatch = (batchId: string) => localStorage.removeItem(`${batchPrefix}${batchId}`);

const belongsToPendingBatch = (id: string) => {
  const stored = loadSession(id);
  return Boolean(stored?.batchId && loadBatch(stored.batchId));
};

export const saveSession = (session: ReportSession) => {
  session.updatedAt = Date.now();
  localStorage.setItem(`sessions:${session.id}`, JSON.stringify(session));
  const index = loadSessionIndex().filter((item) => item.id !== session.id);
  index.unshift({ id: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt, childNameLabel: session.childNameLabel, status: session.status });
  const removable = index.filter((item) => item.status === "completed" && !belongsToPendingBatch(item.id)).slice(maxSessions - 1);
  removable.forEach((item) => {
    localStorage.removeItem(`sessions:${item.id}`);
    const position = index.findIndex((candidate) => candidate.id === item.id);
    if (position >= 0) index.splice(position, 1);
  });
  localStorage.setItem(indexKey, JSON.stringify(index));
  localStorage.setItem(activeKey, session.id);
};

export const deleteSession = (id: string) => {
  const stored = loadSession(id);
  localStorage.removeItem(`sessions:${id}`);
  localStorage.setItem(indexKey, JSON.stringify(loadSessionIndex().filter((item) => item.id !== id)));
  if (localStorage.getItem(activeKey) === id) localStorage.removeItem(activeKey);
  if (!stored?.batchId) return;
  const batch = loadBatch(stored.batchId);
  if (!batch) return;
  const sessionIds = batch.sessionIds.filter((sessionId) => sessionId !== id);
  if (sessionIds.length) saveBatch({ ...batch, sessionIds });
  else deleteBatch(batch.batchId);
};
