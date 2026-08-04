import type { ModelRole } from "../types";
export const MODEL_CONFIG: Record<ModelRole, string> = {
  analyzer: "deepseek/deepseek-v4-flash",
  writer: "deepseek/deepseek-v4-flash",
  reviewer: "deepseek/deepseek-v4-flash",
  fixer: "deepseek/deepseek-v4-flash",
};
export const TEST_MODE_MODEL = "deepseek/deepseek-v4-flash";
export const resolveModel = (role: ModelRole, testMode: boolean) =>
  testMode ? TEST_MODE_MODEL : MODEL_CONFIG[role];
