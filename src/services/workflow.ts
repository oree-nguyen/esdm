import { z } from "zod";
import { AiError, askAi, askJson } from "./aiClient";
import {
  ANALYZER_PROMPT,
  FIXER_PROMPT,
  GOALS_PROMPT,
  REVIEWER_PROMPT,
  WRITER_PROMPT,
} from "../prompts/templates";
import { runRules } from "../rules/reportRules";
import type {
  Analysis,
  ChildInput,
  FileAttachment,
  GoalDraft,
  RuleCheckResult,
  Settings,
} from "../types";
const analysisSchema = z.object({
  administrative: z.object({
    childName: z.string(),
    birthDate: z.string(),
    evaluator: z.string(),
    missingFields: z.array(z.string()),
  }),
  domains: z.array(
    z.object({
      name: z.string(),
      skills: z.array(
        z.object({
          domain: z.string(),
          skill: z.string(),
          category: z.enum(["strength", "emerging", "priority", "observe"]),
          sourceEvidence: z.string(),
          supportLevel: z.string().optional(),
          conflict: z.boolean().optional(),
          missingData: z.boolean().optional(),
        }),
      ),
    }),
  ),
  conflicts: z.array(z.string()),
  missingData: z.array(z.string()),
  goalCandidates: z.array(
    z.object({
      domain: z.string(),
      sourceSkill: z.string(),
      reason: z.string(),
      suggestedTargetBehavior: z.string(),
    }),
  ),
});
const goalsSchema = z.object({
  selectedGoals: z.array(
    z.object({
      domain: z.string(),
      sourceSkill: z.string(),
      targetBehavior: z.string(),
      duration: z.string(),
      context: z.string(),
      opportunityCondition: z.string(),
      maxSupport: z.string(),
      masteryCriterion: z.string(),
      contextsCount: z.number(),
      peopleCount: z.number(),
      consecutiveSessions: z.number(),
      baselineStatus: z.enum(["available", "missing"]).optional(),
      baselineEvidence: z.string().optional(),
    }),
  ),
  notSelected: z.array(
    z.object({ sourceSkill: z.string(), reason: z.string() }),
  ),
});
const reviewerSchema = z.object({
  issues: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      passed: z.boolean(),
      severity: z.enum(["critical", "warning", "format"]),
      message: z.string(),
      section: z.string().optional(),
      suggestedFix: z.string().optional(),
    }),
  ),
});
export async function runWorkflow(
  input: ChildInput,
  settings: Settings,
  signal: AbortSignal,
  trace: (s: string) => void,
  attachment?: FileAttachment,
) {
  trace("Đã phân tích dữ liệu nguồn");
  let analysis: Analysis;
  try {
    analysis = await askJson<Analysis>(
      "analyzer",
      ANALYZER_PROMPT,
      input.sourceData,
      analysisSchema,
      settings,
      signal,
      attachment,
    );
  } catch (error) {
    if (
      !attachment ||
      (error instanceof DOMException && error.name === "AbortError") ||
      !(error instanceof AiError)
    )
      throw error;
    trace("File không được provider hỗ trợ, chuyển sang nội dung văn bản");
    analysis = await askJson<Analysis>(
      "analyzer",
      ANALYZER_PROMPT,
      input.sourceData,
      analysisSchema,
      settings,
      signal,
    );
  }
  trace("Đã chọn mục tiêu can thiệp");
  const goalsResult = await askJson(
    "analyzer",
    GOALS_PROMPT,
    JSON.stringify({ analysis, priorityDomains: input.priorityDomains ?? [] }),
    goalsSchema,
    settings,
    signal,
  );
  const goals: GoalDraft[] = goalsResult.selectedGoals.map((goal, index) => ({
    ...goal,
    id: `goal-${index + 1}`,
  }));
  const pre = runRules("", input, analysis, goals);
  if (pre.some((x) => !x.passed && x.severity === "critical"))
    throw new Error(
      pre
        .filter((x) => !x.passed)
        .map((x) => x.message)
        .join(" "),
    );
  trace("Đã viết báo cáo");
  let report = await askAi(
    "writer",
    WRITER_PROMPT,
    JSON.stringify({ input, analysis, goals }),
    settings,
    signal,
  );
  let issues: RuleCheckResult[] = [];
  for (let round = 0; round < 3; round++) {
    trace(`Đã kiểm tra 20 tiêu chí${round ? ` (vòng ${round + 1})` : ""}`);
    const [review, rules] = await Promise.all([
      askJson(
        "reviewer",
        REVIEWER_PROMPT,
        JSON.stringify({ report, analysis, goals }),
        reviewerSchema,
        settings,
        signal,
      ),
      Promise.resolve(runRules(report, input, analysis, goals)),
    ]);
    issues = [
      ...rules,
      ...review.issues.map((x) => ({ ...x, source: "reviewer" as const })),
    ].filter((x) => !x.passed);
    if (!issues.length) break;
    if (round === 2) break;
    trace(`Đã sửa lỗi (vòng ${round + 1}/3)`);
    report = await askAi(
      "fixer",
      FIXER_PROMPT,
      JSON.stringify({ report, issues }),
      settings,
      signal,
    );
  }
  return { report, goals, issues };
}
