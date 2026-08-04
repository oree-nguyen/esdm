import type { ModelRole } from "../types";
export const MODEL_CONFIG: Record<ModelRole, string> = {
  analyzer: "deepseek/deepseek-v4-flash-0731",
  writer: "deepseek/deepseek-v4-flash-0731",
  reviewer: "deepseek/deepseek-v4-flash-0731",
  fixer: "deepseek/deepseek-v4-flash-0731",
};
export const TEST_MODE_MODEL = "deepseek/deepseek-v4-flash-0731";
export const resolveModel = (role: ModelRole, testMode: boolean) =>
  testMode ? TEST_MODE_MODEL : MODEL_CONFIG[role];
