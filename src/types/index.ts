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
  domain: string;
  skill: string;
  category: SkillCategory;
  sourceEvidence: string;
  supportLevel?: string;
  conflict?: boolean;
  missingData?: boolean;
}
export interface Analysis {
  administrative: {
    childName: string;
    birthDate: string;
    evaluator: string;
    missingFields: string[];
  };
  domains: { name: string; skills: SkillItem[] }[];
  conflicts: string[];
  missingData: string[];
  goalCandidates: {
    domain: string;
    sourceSkill: string;
    reason: string;
    suggestedTargetBehavior: string;
  }[];
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
  baselineStatus?: "available" | "missing";
  baselineEvidence?: string;
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
export interface FileAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
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
