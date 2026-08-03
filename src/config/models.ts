import type { ModelRole } from "../types";
export const MODEL_CONFIG: Record<ModelRole, string> = {
  analyzer: "openai/gpt-oss-120b",
  writer: "google/gemini-2.5-flash-lite",
  reviewer: "google/gemini-2.5-flash-lite",
  fixer: "deepseek/deepseek-v3.2",
};
export const TEST_MODEL = "openai/gpt-oss-20b:free";
export const resolveModel = (role: ModelRole, testMode: boolean) =>
  testMode ? TEST_MODEL : MODEL_CONFIG[role];
