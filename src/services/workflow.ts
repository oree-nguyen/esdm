import { z } from "zod";
import { askAi, askJson, type JsonSchema } from "./aiClient";
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
  GoalDraft,
  RuleCheckResult,
  Settings,
  StepEvent,
  WorkflowCheckpoint,
} from "../types";
const DOMAIN_LIST = ["Giao tiếp tiếp nhận", "Giao tiếp diễn đạt", "Hành vi tập trung chú ý", "Các kỹ năng xã hội", "Bắt chước", "Nhận thức", "Kỹ năng chơi", "Vận động tinh", "Vận động thô", "Tự lập"] as const;
const domain = z.enum(DOMAIN_LIST);
const analysisSchema = z.object({
  administrative: z.object({
    childName: z.string(),
    birthDate: z.string(),
    evaluator: z.string(),
    missingFields: z.array(z.string()),
  }).strict(),
  domains: z.array(
    z.object({
      name: domain,
      skills: z.array(
        z.object({
          skill: z.string(),
          category: z.enum(["strength", "emerging", "priority", "observe"]),
          evidence: z.string(), supportLevel: z.string(), conflict: z.boolean(), missingData: z.boolean(),
        }).strict(),
      ),
    }).strict(),
  ),
  conflicts: z.array(z.object({ domain, skill: z.string(), reason: z.string() }).strict()),
  missingData: z.array(z.object({ domain, skill: z.string(), reason: z.string() }).strict()),
  goalCandidates: z.array(
    z.object({
      domain,
      sourceSkill: z.string(),
      reason: z.string(),
      suggestedTargetBehavior: z.string(),
    }).strict(),
  ),
}).strict();
const goalsSchema = z.object({
  selectedGoals: z.array(
    z.object({
      domain,
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
      baselineStatus: z.enum(["available", "missing"]), baselineEvidence: z.string(),
    }).strict(),
  ),
  notSelected: z.array(
    z.object({ sourceSkill: z.string(), reason: z.string() }).strict(),
  ),
}).strict();
const reviewerSchema = z.object({
  score: z.number().int(), passedCount: z.number().int(), failedCount: z.number().int(),
  issues: z.array(
    z.object({
      criterionId: z.number().int(),
      severity: z.enum(["critical", "warning", "format"]),
      section: z.string(), problem: z.string(), evidence: z.string(), suggestedFix: z.string(),
    }).strict(),
  ),
}).strict();
const object = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", additionalProperties: false, required, properties });
const string = { type: "string" };
const boolean = { type: "boolean" };
const integer = { type: "integer" };
const domainSchema = { type: "string", enum: DOMAIN_LIST };
const analysisJsonSchema: JsonSchema = object({
  administrative: object({ childName: string, birthDate: string, evaluator: string, missingFields: { type: "array", items: string } }, ["childName", "birthDate", "evaluator", "missingFields"]),
  domains: { type: "array", items: object({ name: domainSchema, skills: { type: "array", items: object({ skill: string, category: { type: "string", enum: ["strength", "emerging", "priority", "observe"] }, evidence: string, supportLevel: string, conflict: boolean, missingData: boolean }, ["skill", "category", "evidence", "supportLevel", "conflict", "missingData"]) } }, ["name", "skills"]) },
  conflicts: { type: "array", items: object({ domain: domainSchema, skill: string, reason: string }, ["domain", "skill", "reason"]) },
  missingData: { type: "array", items: object({ domain: domainSchema, skill: string, reason: string }, ["domain", "skill", "reason"]) },
  goalCandidates: { type: "array", items: object({ domain: domainSchema, sourceSkill: string, reason: string, suggestedTargetBehavior: string }, ["domain", "sourceSkill", "reason", "suggestedTargetBehavior"]) },
}, ["administrative", "domains", "conflicts", "missingData", "goalCandidates"]);
const goalsJsonSchema: JsonSchema = object({
  selectedGoals: { type: "array", items: object({ domain: domainSchema, sourceSkill: string, targetBehavior: string, duration: string, context: string, opportunityCondition: string, maxSupport: string, masteryCriterion: string, contextsCount: integer, peopleCount: integer, consecutiveSessions: integer, baselineStatus: { type: "string", enum: ["available", "missing"] }, baselineEvidence: string }, ["domain", "sourceSkill", "targetBehavior", "duration", "context", "opportunityCondition", "maxSupport", "masteryCriterion", "contextsCount", "peopleCount", "consecutiveSessions", "baselineStatus", "baselineEvidence"]) },
  notSelected: { type: "array", items: object({ sourceSkill: string, reason: string }, ["sourceSkill", "reason"]) },
}, ["selectedGoals", "notSelected"]);
const reviewerJsonSchema: JsonSchema = object({
  score: integer, passedCount: integer, failedCount: integer,
  issues: { type: "array", items: object({ criterionId: integer, severity: { type: "string", enum: ["critical", "warning", "format"] }, section: string, problem: string, evidence: string, suggestedFix: string }, ["criterionId", "severity", "section", "problem", "evidence", "suggestedFix"]) },
}, ["score", "passedCount", "failedCount", "issues"]);
const fallbackReport = (input: ChildInput) => `**BÁO CÁO CAN THIỆP**

## I. THÔNG TIN HÀNH CHÍNH
- **Họ và tên trẻ:** ${input.childName}
- **Ngày viết báo cáo:** ${input.reportDate}
- **Người thực hiện can thiệp:** ${input.interventionPeople}
- **Nguồn dữ liệu:** Tệp đánh giá do người dùng đính kèm.

## II. HỆ THỐNG MÃ DỮ LIỆU VÀ QUY TẮC CHUNG
- **I (Độc lập):** Trẻ thực hiện đúng hoàn toàn không cần hỗ trợ.
- **G (Gợi ý):** Trẻ thực hiện sau gợi ý bằng lời hoặc cử chỉ.
- **M (Làm mẫu):** Trẻ thực hiện sau khi người lớn làm mẫu.
- **H (Hỗ trợ thể chất):** Trẻ thực hiện khi có hỗ trợ một phần.
- **F (Chưa đạt):** Trẻ chưa thực hiện hoặc thực hiện sai.

## III. CHỨC NĂNG HIỆN TẠI THEO TỪNG LĨNH VỰC
- Dữ liệu từ tệp đã được tiếp nhận. Cần rà soát nội dung chi tiết trước khi xác định mức kỹ năng.

## IV. MỤC TIÊU CỤ THỂ
- Chưa tự tạo mục tiêu vì phản hồi AI không đúng định dạng để đối chiếu dữ liệu an toàn.

## V. HOẠT ĐỘNG CAN THIỆP
- Chờ rà soát dữ liệu nguồn trước khi lập hoạt động.

## VI. CÁCH GHI DỮ LIỆU VÀ ĐÁNH GIÁ TIẾN ĐỘ
- Ghi nhận trực tiếp từng cơ hội thực hiện; không tự tạo số liệu nền.

## VII. KHUYẾN NGHỊ PHỐI HỢP GIA ĐÌNH VÀ NHÀ TRƯỜNG
- Trao đổi lại sau khi hoàn tất rà soát dữ liệu đánh giá.`;
export async function runWorkflow(
  input: ChildInput,
  settings: Settings,
  signal: AbortSignal,
  onStepEvent: (event: StepEvent) => void,
  options: { resume?: WorkflowCheckpoint; onCheckpoint?: (state: WorkflowCheckpoint) => void } = {},
) {
  const checkpoint = (state: WorkflowCheckpoint) => options.onCheckpoint?.(state);
  let sequence = 0;
  let active: StepEvent | undefined;
  let filler: ReturnType<typeof setTimeout> | undefined;
  const finishActive = () => {
    if (active) onStepEvent({ ...active, status: "done" });
    active = undefined;
    if (filler) clearTimeout(filler);
    filler = undefined;
  };
  const step = (phase: StepEvent["phase"], text: string) => {
    finishActive();
    active = { id: `evt-${++sequence}`, text, phase, status: "active" };
    onStepEvent(active);
    filler = setTimeout(() => {
      if (active)
        onStepEvent({
          ...active,
          text: `${active.text}…`,
          phase: active.phase,
          status: "active",
        });
    }, 3000);
  };
  step("analyzer", "Đang đọc dữ liệu đánh giá của trẻ");
  const analysis = options.resume?.analysisJson ?? await askJson<Analysis>("analyzer", ANALYZER_PROMPT, input.sourceData, analysisSchema, analysisJsonSchema, "analysis", settings, signal);
  checkpoint({ ...options.resume, lastCompletedStep: "analysis", analysisJson: analysis, fixRoundCount: options.resume?.fixRoundCount ?? 0 });
  step("ruleEngineAnalysis", "Đang kiểm tra dữ liệu phân tích theo quy tắc");
  const missingAdministrative = analysis.administrative.missingFields.filter(
    (field) => field === "childName" || field === "birthDate",
  );
  if (missingAdministrative.length) {
    const labels = missingAdministrative.map((field) =>
      field === "childName" ? "tên trẻ" : "ngày sinh",
    );
    throw new Error(
      `Dữ liệu bạn cung cấp chưa có ${labels.join(" và ")}. Vui lòng bổ sung rồi gửi lại.`,
    );
  }
  input = {
    ...input,
    childName: analysis.administrative.childName,
    birthDate: analysis.administrative.birthDate || input.birthDate,
    evaluator: analysis.administrative.evaluator || input.evaluator,
  };
  step("goalSelection", "Đang chọn mục tiêu can thiệp phù hợp");
  const goalsResult = options.resume?.goalsJson ? { selectedGoals: options.resume.goalsJson } : await askJson(
    "analyzer",
    GOALS_PROMPT,
    JSON.stringify({ analysis, priorityDomains: input.priorityDomains ?? [] }),
    goalsSchema,
    goalsJsonSchema,
    "goal_selection",
    settings,
    signal,
  );
  const goals: GoalDraft[] = goalsResult.selectedGoals.map((goal, index) => ({
    ...goal,
    id: `goal-${index + 1}`,
  }));
  checkpoint({ ...options.resume, lastCompletedStep: "goalSelection", analysisJson: analysis, goalsJson: goals, fixRoundCount: options.resume?.fixRoundCount ?? 0 });
  const pre = runRules("", input, analysis, goals);
  if (pre.some((x) => !x.passed && x.severity === "critical"))
    throw new Error(
      pre
        .filter((x) => !x.passed)
        .map((x) => x.message)
        .join(" "),
    );
  step("writer", "Đang viết báo cáo chức năng hiện tại");
  let report = options.resume?.reportMarkdown ?? await askAi(
    "writer",
    WRITER_PROMPT,
    JSON.stringify({ input, analysis, goals }),
    settings,
    signal,
  );
  checkpoint({ ...options.resume, lastCompletedStep: "writer", analysisJson: analysis, goalsJson: goals, reportMarkdown: report, fixRoundCount: options.resume?.fixRoundCount ?? 0 });
  let issues: RuleCheckResult[] = options.resume?.reviewIssuesJson ?? [];
  for (let round = options.resume?.lastCompletedStep === "review" ? 0 : options.resume?.fixRoundCount ?? 0; round < 3; round++) {
    if (options.resume?.lastCompletedStep === "review" && round === 0) {
      step("fixer", "Đang sửa các lỗi được phát hiện");
      report = await askAi("fixer", FIXER_PROMPT, JSON.stringify({ report, issues }), settings, signal);
      checkpoint({ ...options.resume, lastCompletedStep: "fixer", analysisJson: analysis, goalsJson: goals, reportMarkdown: report, reviewIssuesJson: issues, fixRoundCount: 1 });
      options.resume = { ...options.resume, lastCompletedStep: "fixer", fixRoundCount: 1 };
      continue;
    }
    step("reviewer", "Đang kiểm tra báo cáo theo 20 tiêu chí");
    const [review, rules] = await Promise.all([
      askJson(
        "reviewer",
        REVIEWER_PROMPT,
        JSON.stringify({ report, analysis, goals }),
        reviewerSchema,
        reviewerJsonSchema,
        "report_review",
        settings,
        signal,
      ),
      Promise.resolve(runRules(report, input, analysis, goals)),
    ]);
    issues = [
      ...rules,
      ...review.issues.map((x) => ({ id: x.criterionId, title: `Tiêu chí ${x.criterionId}`, passed: false, severity: x.severity, message: x.problem, section: x.section, suggestedFix: x.suggestedFix, source: "reviewer" as const })),
    ].filter((x) => !x.passed);
    checkpoint({ ...options.resume, lastCompletedStep: "review", analysisJson: analysis, goalsJson: goals, reportMarkdown: report, reviewIssuesJson: issues, fixRoundCount: round });
    if (!issues.length) break;
    if (round === 2) break;
    step("fixer", "Đang sửa các lỗi được phát hiện");
    report = await askAi(
      "fixer",
      FIXER_PROMPT,
      JSON.stringify({ report, issues }),
      settings,
      signal,
    );
    checkpoint({ ...options.resume, lastCompletedStep: "fixer", analysisJson: analysis, goalsJson: goals, reportMarkdown: report, reviewIssuesJson: issues, fixRoundCount: round + 1 });
  }
  step("done", "Đã xử lý xong");
  finishActive();
  checkpoint({ ...options.resume, lastCompletedStep: "done", analysisJson: analysis, goalsJson: goals, reportMarkdown: report, reviewIssuesJson: issues, fixRoundCount: options.resume?.fixRoundCount ?? 0 });
  return { report, goals, issues, childName: input.childName };
}
