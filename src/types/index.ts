export type ModelRole = "analyzer" | "writer" | "reviewer" | "fixer";
export interface ChildInput {
  childName: string;
  birthDate?: string;
  evaluator?: string;
  reportDate: string;
  interventionPeople: string;
  sourceData: string;
  observationNotes?: string;
  parentNotes?: string;
  priorityDomains?: string[];
}
export type SkillCategory = "strength" | "emerging" | "priority" | "observe";
export interface SkillItem {
  skill: string;
  category: SkillCategory;
  evidence: string;
  supportLevel: string;
  conflict: boolean;
  missingData: boolean;
}
export interface Analysis {
  administrative: {
    childName: string;
    birthDate: string;
    evaluator: string;
    missingFields: string[];
  };
  domains: { name: string; skills: SkillItem[] }[];
  conflicts: AnalysisReference[];
  missingData: AnalysisReference[];
  goalCandidates: {
    domain: string;
    sourceSkill: string;
    reason: string;
    suggestedTargetBehavior: string;
  }[];
}
export interface AnalysisReference {
  domain: string;
  skill: string;
  reason: string;
}
export interface GoalDraft {
  id: string;
  domain: string;
  sourceSkill: string;
  targetBehavior: string;
  duration: string;
  context: string;
  opportunityCondition: string;
  maxSupport: string;
  masteryCriterion: string;
  contextsCount: number;
  peopleCount: number;
  consecutiveSessions: number;
  baselineStatus: "available" | "missing";
  baselineEvidence: string;
}
export interface InterventionActivity {
  goalId: string;
  role: "direct" | "foundation" | "extension" | "generalization";
  preparation: string;
  start: string;
  opportunity: string;
  support: string;
  praise: string;
  repetition: string;
  fading: string;
  ending: string;
  generalization: string;
  dataCollection: string;
}
export interface RuleCheckResult {
  id: number;
  title: string;
  passed: boolean;
  severity: "critical" | "warning" | "format";
  message: string;
  section?: string;
  suggestedFix?: string;
  source?: "rule-engine" | "reviewer";
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  report?: boolean;
  createdAt: number;
}
export interface Settings {
  apiKey: string;
  persistKey: boolean;
  mode: "direct" | "worker";
  endpoint: string;
  testMode: boolean;
}
export interface StepEvent {
  id: string;
  text: string;
  phase:
    | "analyzer"
    | "goalSelection"
    | "ruleEngineAnalysis"
    | "writer"
    | "reviewer"
    | "ruleEngineReport"
    | "fixer"
    | "done";
  status: "active" | "done";
}
export type WorkflowStep = "none" | "analysis" | "goalSelection" | "writer" | "review" | "fixer" | "done";
export interface WorkflowCheckpoint { lastCompletedStep: WorkflowStep; analysisJson?: Analysis; goalsJson?: GoalDraft[]; reportMarkdown?: string; reviewIssuesJson?: RuleCheckResult[]; fixRoundCount: number; }
export interface ReportSession { id: string; createdAt: number; updatedAt: number; childNameLabel?: string; status: "in_progress" | "completed" | "stopped_missing_info" | "error"; rawInput: string; priorityDomains?: string[]; lastCompletedStep: WorkflowStep; stepOutputs: Omit<WorkflowCheckpoint, "lastCompletedStep">; stepTraceLog: { text: string; phase: string }[]; messages: ChatMessage[]; lastError?: string; }
export interface SessionIndexItem { id: string; createdAt: number; updatedAt: number; childNameLabel?: string; status: ReportSession["status"] }
