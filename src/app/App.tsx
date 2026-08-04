import { useEffect, useRef, useState } from "react";
import mammoth from "mammoth";
import { APP_NAME, DEFAULT_SETTINGS } from "../config/app";
import { buildDocx, downloadBlob, downloadDocx, downloadMarkdown } from "../export/files";
import { isCompleteReportMarkdown, runWorkflow } from "../services/workflow";
import { StepTraceStatus } from "../components/chat/StepTraceStatus";
import { BatchWorkflowGrid, type BatchJob } from "../components/chat/BatchWorkflowGrid";
import { deleteSession, loadActiveSession, loadDraft, loadSession, loadSessionIndex, saveDraft, saveSession } from "../storage/draftStorage";
import type { ChatMessage, ChildInput, ReportSession, Settings, StepEvent, WorkflowCheckpoint } from "../types";
import "../attachment.css";

const today = () => new Date().toLocaleDateString("en-CA");
const welcomeMessage = (): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  text: "Chào bạn. Hãy dán dữ liệu đánh giá của trẻ hoặc đính kèm tệp DOCX.",
  createdAt: Date.now(),
});
const createSession = (rawInput = "", sourceFileName?: string): ReportSession => ({
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sourceFileName,
  reportDate: today(),
  status: "in_progress",
  rawInput,
  lastCompletedStep: "none",
  stepOutputs: { fixRoundCount: 0 },
  stepTraceLog: [],
  messages: sourceFileName
    ? [{ id: crypto.randomUUID(), role: "user", text: `📎 ${sourceFileName}`, createdAt: Date.now() }]
    : [welcomeMessage()],
});

const checkpointOutputs = (checkpoint: WorkflowCheckpoint): ReportSession["stepOutputs"] => ({
  analysisJson: checkpoint.analysisJson,
  goalsJson: checkpoint.goalsJson,
  writerReportMarkdown: checkpoint.writerReportMarkdown,
  reportMarkdown: checkpoint.reportMarkdown,
  reviewIssuesJson: checkpoint.reviewIssuesJson,
  fixRoundCount: checkpoint.fixRoundCount,
});

const mergeEvent = (events: StepEvent[], event: StepEvent) =>
  events.some((item) => item.id === event.id)
    ? events.map((item) => (item.id === event.id ? event : item))
    : [...events.map((item) => item.status === "active" ? { ...item, status: "done" as const } : item), event];

const cellStatus = (event: StepEvent, fixRound: number) => {
  switch (event.phase) {
    case "analyzer": return "Đang phân tích kỹ năng...";
    case "ruleEngineAnalysis": return "Đang phân tích kỹ năng...";
    case "goalSelection": return "Đang chọn mục tiêu...";
    case "writer": return "Đang viết báo cáo...";
    case "reviewer":
    case "ruleEngineReport": return "Đang kiểm tra...";
    case "fixer": return `Đang sửa lỗi vòng ${Math.min(3, fixRound + 1)}/3...`;
    case "done": return "Đã xử lý xong";
  }
};

const cellProgress = (phase: StepEvent["phase"]) => ({
  analyzer: 15,
  ruleEngineAnalysis: 25,
  goalSelection: 38,
  writer: 58,
  reviewer: 76,
  ruleEngineReport: 76,
  fixer: 88,
  done: 100,
})[phase];

const safeFilePart = (value: string) => value
  .normalize("NFC")
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
  .replace(/\s+/g, " ")
  .trim() || "bao-cao";

const readAutoDownload = () => {
  try { return localStorage.getItem("settings:autoDownload") === "true"; }
  catch { return false; }
};

export function App() {
  const saved = loadDraft();
  const restored = loadActiveSession();
  const initialSession = restored ?? createSession();
  const [session, setSession] = useState<ReportSession>(initialSession);
  const [sessions, setSessions] = useState(() => loadSessionIndex());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? saved.messages ?? [welcomeMessage()]);
  const [draft, setDraft] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [attachedFile, setAttachedFile] = useState("");
  const [fileError, setFileError] = useState("");
  const [report, setReport] = useState(restored?.stepOutputs.reportMarkdown ?? saved.report ?? "");
  const [activeReportSessionId, setActiveReportSessionId] = useState(initialSession.id);
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = saved.settings ?? DEFAULT_SETTINGS;
    return stored.persistKey ? stored : { ...stored, apiKey: "" };
  });
  const [autoDownload, setAutoDownload] = useState(readAutoDownload);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [trace, setTrace] = useState<StepEvent[]>(() => restored?.stepTraceLog.map((x, i) => ({ id: `saved-${i}`, text: x.text, phase: x.phase as StepEvent["phase"], status: "done" })) ?? []);
  const [elapsed, setElapsed] = useState(0);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [batchAwaitingStart, setBatchAwaitingStart] = useState(false);
  const [batchPreparing, setBatchPreparing] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const batchControllers = useRef(new Map<string, AbortController>());
  const autoDownloadRef = useRef(autoDownload);

  useEffect(() => { autoDownloadRef.current = autoDownload; }, [autoDownload]);
  useEffect(() => {
    saveDraft({ messages, report, settings: settings.persistKey ? settings : { ...settings, apiKey: "" } });
  }, [messages, report, settings]);
  useEffect(() => {
    if (activeReportSessionId !== session.id) return;
    saveSession({ ...session, messages, stepTraceLog: trace.map((x) => ({ text: x.text, phase: x.phase })), stepOutputs: { ...session.stepOutputs, reportMarkdown: report } });
    setSessions(loadSessionIndex());
  }, [activeReportSessionId, session, messages, report, trace]);
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [working]);
  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); }, [darkMode]);
  useEffect(() => {
    if (session.status !== "completed" || activeReportSessionId !== session.id || !report || isCompleteReportMarkdown(report)) return;
    setReport("");
    setSession((current) => ({
      ...current,
      status: "error",
      lastCompletedStep: current.stepOutputs.goalsJson?.length ? "goalSelection" : "analysis",
      lastError: "Báo cáo đã bị ghi đè bởi phản hồi sửa lỗi không hợp lệ; cần tạo lại từ checkpoint.",
      stepOutputs: { ...current.stepOutputs, reportMarkdown: undefined, reviewIssuesJson: undefined, fixRoundCount: 0 },
    }));
  }, [activeReportSessionId, report, session.id, session.status]);

  const say = (text: string, reportSessionId?: string, reportFileName?: string) =>
    setMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: "assistant",
      text,
      report: Boolean(reportSessionId),
      reportSessionId,
      reportFileName,
      createdAt: Date.now(),
    }]);

  async function readDocx(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Chỉ hỗ trợ tệp .docx.");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = result.value.trim();
    if (!text) throw new Error("Tệp DOCX không có văn bản để đọc.");
    return text;
  }

  async function attachDocx(file?: File) {
    if (!file) return;
    setFileError("");
    try {
      setExtractedText(await readDocx(file));
      setAttachedFile(file.name);
      setBatchJobs([]);
      setBatchAwaitingStart(false);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Không thể đọc tệp DOCX.");
    }
  }

  async function handleMultipleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    if (files.length === 1) {
      await attachDocx(files[0]);
      return;
    }
    setFileError("");
    setBatchPreparing(true);
    setAttachedFile("");
    setExtractedText("");
    const settled = await Promise.allSettled(files.map(async (file) => ({ file, text: await readDocx(file) })));
    const jobs = settled.map((item, index): BatchJob => {
      const file = files[index];
      const sourceText = item.status === "fulfilled" ? item.value.text : "";
      const error = item.status === "rejected" ? (item.reason instanceof Error ? item.reason.message : "Không thể đọc tệp DOCX.") : undefined;
      return {
        id: crypto.randomUUID(),
        fileName: file.name,
        sourceText,
        status: error ? "error" : "queued",
        progress: error ? 0 : 5,
        currentStatus: error ? "Không thể đọc tệp" : "Sẵn sàng xử lý",
        trace: [],
        session: createSession(sourceText, file.name),
        error,
      };
    });
    setBatchJobs(jobs);
    setBatchAwaitingStart(true);
    setBatchPreparing(false);
  }

  function buildInput(text: string): ChildInput {
    return { childName: "", sourceData: text, reportDate: today(), interventionPeople: "Giáo viên và gia đình" };
  }

  async function submit(resume = false) {
    const text = (resume ? session.rawInput : (draft.trim() || extractedText)).trim();
    if (!text || working || batchRunning) return;
    const sourceFileName = resume ? session.sourceFileName : attachedFile || undefined;
    if (!resume) setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: sourceFileName ? `📎 ${sourceFileName}` : text, createdAt: Date.now() }]);
    if (!resume) { setDraft(""); setExtractedText(""); setAttachedFile(""); }
    if (text.length < 40) { say("Để bắt đầu, vui lòng bổ sung dữ liệu nguồn chi tiết hơn."); return; }
    setActiveReportSessionId(session.id);
    setSession((current) => resume
      ? { ...current, status: "in_progress", lastError: undefined }
      : { ...current, rawInput: text, sourceFileName, reportDate: today(), status: "in_progress", lastError: undefined, lastCompletedStep: "none", stepOutputs: { fixRoundCount: 0 } });
    controller.current = new AbortController();
    setWorking(true);
    setElapsed(0);
    if (!resume) setTrace([]);
    try {
      const result = await runWorkflow(buildInput(text), settings, controller.current.signal, (event) => setTrace((events) => mergeEvent(events, event)), {
        resume: resume ? { lastCompletedStep: session.lastCompletedStep, ...session.stepOutputs } : undefined,
        onCheckpoint: (checkpoint) => setSession((current) => ({ ...current, lastCompletedStep: checkpoint.lastCompletedStep, stepOutputs: checkpointOutputs(checkpoint) })),
      });
      setReport(result.report);
      const completed = { ...session, rawInput: text, sourceFileName, reportDate: session.reportDate ?? today(), status: "completed" as const, childNameLabel: result.childName, lastCompletedStep: "done" as const, stepOutputs: { ...session.stepOutputs, reportMarkdown: result.report } };
      setSession((current) => ({ ...current, status: "completed", childNameLabel: result.childName, lastCompletedStep: "done", stepOutputs: { ...current.stepOutputs, reportMarkdown: result.report } }));
      say(`Đã tạo báo cáo cho ${result.childName} với ${result.goals.length} mục tiêu.${result.issues.length ? ` Còn ${result.issues.length} điểm cần xem lại.` : " Báo cáo đã qua kiểm tra."}`, completed.id, sourceFileName);
    } catch (error) {
      setTrace((events) => events.map((item) => item.status === "active" ? { ...item, status: "error" as const, text: `${item.text} - lỗi` } : item));
      if (error instanceof DOMException && error.name === "AbortError") {
        setSession((current) => ({ ...current, status: "error", lastError: "Đã hủy quy trình." }));
        say("Đã hủy quy trình.");
      } else {
        const message = error instanceof Error ? error.message : "Đã có lỗi không xác định.";
        setSession((current) => ({ ...current, status: message.includes("chưa có") ? "stopped_missing_info" : "error", lastError: message }));
        say(message);
      }
    } finally {
      setWorking(false);
    }
  }

  async function runBatchJob(job: BatchJob, resume: boolean) {
    const jobController = new AbortController();
    batchControllers.current.set(job.id, jobController);
    let currentSession: ReportSession = { ...job.session, status: "in_progress", lastError: undefined };
    let currentTrace = job.trace;
    const persist = (next: ReportSession) => {
      currentSession = next;
      saveSession(currentSession);
      setBatchJobs((jobs) => jobs.map((item) => item.id === job.id ? { ...item, session: currentSession } : item));
      setSessions(loadSessionIndex());
    };
    persist(currentSession);
    setBatchJobs((jobs) => jobs.map((item) => item.id === job.id ? { ...item, status: "running", progress: 10, currentStatus: "Đang đọc tệp...", error: undefined } : item));
    try {
      const result = await runWorkflow(buildInput(job.sourceText), settings, jobController.signal, (event) => {
        currentTrace = mergeEvent(currentTrace, event);
        currentSession = {
          ...currentSession,
          stepTraceLog: currentTrace.map((item) => ({ text: item.text, phase: item.phase })),
        };
        saveSession(currentSession);
        setBatchJobs((jobs) => jobs.map((item) => {
          if (item.id !== job.id) return item;
          return { ...item, trace: currentTrace, currentStatus: cellStatus(event, currentSession.stepOutputs.fixRoundCount), progress: Math.max(item.progress, cellProgress(event.phase)) };
        }));
      }, {
        resume: resume ? { lastCompletedStep: currentSession.lastCompletedStep, ...currentSession.stepOutputs } : undefined,
        onCheckpoint: (checkpoint) => persist({ ...currentSession, lastCompletedStep: checkpoint.lastCompletedStep, stepOutputs: checkpointOutputs(checkpoint), stepTraceLog: currentSession.stepTraceLog }),
      });
      const successMessage: ChatMessage = {
        id: crypto.randomUUID(), role: "assistant",
        text: `Đã tạo báo cáo cho ${result.childName} từ ${job.fileName}.`, report: true,
        reportSessionId: currentSession.id, reportFileName: job.fileName, createdAt: Date.now(),
      };
      persist({ ...currentSession, status: "completed", childNameLabel: result.childName, lastCompletedStep: "done", stepOutputs: { ...currentSession.stepOutputs, reportMarkdown: result.report }, messages: [...currentSession.messages, successMessage] });
      setBatchJobs((jobs) => jobs.map((item) => item.id === job.id ? { ...item, status: "completed", progress: 100, currentStatus: "Đã xử lý xong", report: result.report, session: currentSession } : item));
      setMessages((current) => [...current, successMessage]);
      return currentSession;
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      const message = cancelled ? "Đã hủy luồng." : error instanceof Error ? error.message : "Đã có lỗi không xác định.";
      persist({ ...currentSession, status: "error", lastError: message });
      setBatchJobs((jobs) => jobs.map((item) => item.id === job.id ? { ...item, status: cancelled ? "cancelled" : "error", currentStatus: cancelled ? "Đã hủy" : "Xử lý lỗi", error: message, session: currentSession } : item));
      throw error;
    } finally {
      batchControllers.current.delete(job.id);
    }
  }

  async function downloadAll(completedSessions: ReportSession[]) {
    for (const completed of completedSessions.filter((item) => item.status === "completed" && item.stepOutputs.reportMarkdown)) {
      const blob = await buildDocx(completed.stepOutputs.reportMarkdown!);
      const name = safeFilePart(completed.childNameLabel || completed.sourceFileName?.replace(/\.docx$/i, "") || "bao-cao");
      downloadBlob(blob, `${name}_${completed.reportDate ?? today()}.docx`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  async function startBatch(targets = batchJobs.filter((job) => job.status === "queued"), resume = false) {
    if (!targets.length || batchRunning) return;
    setBatchAwaitingStart(false);
    setBatchRunning(true);
    if (!resume) setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: `📎 ${targets.length} tệp DOCX`, createdAt: Date.now() }]);
    const settled = await Promise.allSettled(targets.map((job) => runBatchJob(job, resume)));
    const completed = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
    setBatchRunning(false);
    setSessions(loadSessionIndex());
    if (autoDownloadRef.current && completed.length) {
      const completedById = new Map<string, ReportSession>();
      batchJobs.filter((job) => job.status === "completed").forEach((job) => completedById.set(job.session.id, loadSession(job.session.id) ?? job.session));
      completed.forEach((item) => completedById.set(item.id, item));
      await downloadAll([...completedById.values()]);
    }
  }

  function cancelBatchJob(id: string) {
    const active = batchControllers.current.get(id);
    if (active) active.abort();
    else setBatchJobs((jobs) => jobs.map((job) => job.id === id && job.status === "queued" ? { ...job, status: "cancelled", currentStatus: "Đã hủy" } : job));
  }

  function cancelAll() {
    batchControllers.current.forEach((item) => item.abort());
    setBatchJobs((jobs) => jobs.map((job) => job.status === "queued" ? { ...job, status: "cancelled", currentStatus: "Đã hủy" } : job));
  }

  function openReportForSession(id: string, fallbackReport = "") {
    const target = loadSession(id);
    const markdown = target?.stepOutputs.reportMarkdown ?? fallbackReport;
    if (!markdown) return;
    setActiveReportSessionId(id);
    setReport(markdown);
    setOpen(true);
  }

  function updateActiveReport(value: string) {
    setReport(value);
    if (activeReportSessionId === session.id) {
      setSession((current) => ({ ...current, stepOutputs: { ...current.stepOutputs, reportMarkdown: value } }));
      return;
    }
    setBatchJobs((jobs) => jobs.map((job) => {
      if (job.session.id !== activeReportSessionId) return job;
      const updated = { ...job.session, stepOutputs: { ...job.session.stepOutputs, reportMarkdown: value } };
      saveSession(updated);
      return { ...job, report: value, session: updated };
    }));
  }

  function newChat() {
    if (!confirm("Bắt đầu cuộc trò chuyện mới?")) return;
    controller.current?.abort();
    cancelAll();
    const next = createSession();
    setSession(next); setMessages(next.messages); setTrace([]); setElapsed(0); setReport(""); setOpen(false);
    setActiveReportSessionId(next.id); setBatchJobs([]); setBatchAwaitingStart(false); setBatchRunning(false);
  }

  function openSession(id: string) {
    const target = loadSession(id);
    if (!target) return;
    setSession(target); setMessages(target.messages); setReport(target.stepOutputs.reportMarkdown ?? ""); setActiveReportSessionId(target.id);
    setTrace(target.stepTraceLog.map((x, i) => ({ id: `saved-${i}`, text: x.text, phase: x.phase as StepEvent["phase"], status: "done" })));
    setElapsed(Math.max(0, Math.round((target.updatedAt - target.createdAt) / 1000))); setSidebarOpen(false); setBatchJobs([]);
  }

  const completedJobs = batchJobs.filter((job) => job.status === "completed");
  const failedJobs = batchJobs.filter((job) => job.status === "error");
  const cancelledJobs = batchJobs.filter((job) => job.status === "cancelled");
  const batchFinished = batchJobs.length > 1 && !batchAwaitingStart && !batchRunning && batchJobs.every((job) => ["completed", "error", "cancelled"].includes(job.status));
  const activeReportSession = loadSession(activeReportSessionId) ?? batchJobs.find((job) => job.session.id === activeReportSessionId)?.session ?? session;
  const isBusy = working || batchRunning || batchPreparing;

  return (
    <main>
      <button className="menuButton" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
      <nav className={`sessionSidebar ${sidebarOpen ? "open" : ""}`}>
        <button onClick={newChat}>+ Cuộc trò chuyện mới</button>
        {sessions.map((item) => <div className="sessionItem" key={item.id}><button onClick={() => openSession(item.id)}><i className={item.status} />{item.childNameLabel || "Báo cáo chưa đặt tên"}<small>{new Date(item.createdAt).toLocaleString("vi-VN")}</small></button><button aria-label="Xóa phiên" onClick={() => { if (confirm("Xóa phiên này?")) { deleteSession(item.id); setSessions(loadSessionIndex()); if (item.id === session.id) newChat(); } }}>🗑</button></div>)}
      </nav>
      {sidebarOpen && <button className="sidebarBackdrop" aria-label="Đóng lịch sử" onClick={() => setSidebarOpen(false)} />}
      <header>
        <div><strong>{APP_NAME}</strong><small>{settings.apiKey || settings.mode === "worker" ? "Sẵn sàng kết nối" : "Cần cấu hình khóa"}</small></div>
        <div className="headerActions">
          {batchRunning && <button className="cancelAll" onClick={cancelAll}>Hủy tất cả</button>}
          <button onClick={newChat}>Mới</button>
          <button onClick={() => setSettingsOpen(true)}>Cài đặt</button>
        </div>
      </header>
      <section className="chat">
        {messages.map((message) => (
          <article key={message.id} className={`bubble ${message.role}`}>
            <p>{message.text}</p>
            {message.report && <button className="chip" onClick={() => openReportForSession(message.reportSessionId ?? session.id)}>
              📄 Báo cáo can thiệp{message.reportFileName ? ` · ${message.reportFileName.replace(/\.docx$/i, "")}` : ""}
            </button>}
          </article>
        ))}
        {batchPreparing && <div className="batchPreparing"><span />Đang đọc các tệp DOCX...</div>}
        {batchAwaitingStart && batchJobs.length > 1 && (
          <section className="batchConfirm">
            <p>Bạn đã chọn {batchJobs.length} tệp. Bắt đầu xử lý song song?</p>
            {batchJobs.some((job) => job.error) && <small>{batchJobs.filter((job) => job.error).length} tệp không đọc được và sẽ không chạy.</small>}
            <button onClick={() => startBatch()}>Bắt đầu</button>
          </section>
        )}
        {batchJobs.length > 1 && !batchAwaitingStart && (
          <BatchWorkflowGrid jobs={batchJobs} onCancel={cancelBatchJob} onOpenReport={(job) => openReportForSession(job.session.id, job.report)} />
        )}
        {batchFinished && (
          <section className="batchSummary">
            <span className="batchSuccess">✓ Hoàn thành {completedJobs.length}/{batchJobs.length}</span>
            <span className="batchFailure">✗ Lỗi {failedJobs.length}/{batchJobs.length}</span>
            {cancelledJobs.length > 0 && <span>Đã hủy {cancelledJobs.length}/{batchJobs.length}</span>}
            {failedJobs.length > 0 && <button onClick={() => startBatch(failedJobs, true)}>Thử lại các lỗi</button>}
            {completedJobs.length > 0 && !autoDownload && <button onClick={() => downloadAll(completedJobs.map((job) => job.session))}>Tải tất cả .docx</button>}
          </section>
        )}
        {batchJobs.length <= 1 && <StepTraceStatus events={trace} working={working} elapsed={elapsed} onCancel={() => controller.current?.abort()} resumable={!working && (session.status === "in_progress" || session.status === "error") && Boolean(session.rawInput)} onContinue={() => submit(true)} />}
      </section>
      <footer>
        <div className="composer">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Đính kèm file dữ liệu đánh giá của trẻ..." aria-label="Nội dung tin nhắn" />
          {attachedFile && <small className="attachment">📎 {attachedFile}</small>}
          {fileError && <small className="fileError">{fileError}</small>}
          <label className="attach">
            <input type="file" multiple accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { void handleMultipleFiles(event.target.files); event.currentTarget.value = ""; }} />
            Đính kèm DOCX
          </label>
        </div>
        <button className="send" disabled={isBusy || batchAwaitingStart || (!draft.trim() && !extractedText)} onClick={() => submit()}>Gửi</button>
      </footer>
      {open && (
        <aside>
          <div className="panelHead"><strong>Báo cáo</strong><button onClick={() => setOpen(false)}>Đóng</button></div>
          <div className="actions">
            <button onClick={() => navigator.clipboard.writeText(report)}>Sao chép</button>
            <label><input type="checkbox" checked={darkMode} onChange={(event) => setDarkMode(event.target.checked)} /> Chế độ tối</label>
            <button onClick={() => downloadMarkdown(report, activeReportSession.childNameLabel || "bao-cao", activeReportSession.reportDate ?? today())}>Tải Markdown</button>
            <button onClick={() => downloadDocx(report, activeReportSession.childNameLabel || "bao-cao", activeReportSession.reportDate ?? today())}>Tải Word</button>
          </div>
          <textarea className="reportEdit" value={report} onChange={(event) => updateActiveReport(event.target.value)} />
        </aside>
      )}
      {settingsOpen && (
        <div className="modal">
          <section>
            <h2>Cài đặt kết nối</h2>
            <label>Khóa truy cập<input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} /></label>
            <label><input type="checkbox" checked={settings.persistKey} onChange={(event) => setSettings({ ...settings, persistKey: event.target.checked })} /> Lưu khóa trên thiết bị này</label>
            <label>Chế độ<select value={settings.mode} onChange={(event) => setSettings({ ...settings, mode: event.target.value as Settings["mode"] })}><option value="direct">Gọi trực tiếp</option><option value="worker">Qua Cloudflare Worker</option></select></label>
            <label>Địa chỉ API<input value={settings.endpoint} onChange={(event) => setSettings({ ...settings, endpoint: event.target.value })} /></label>
            <label><input type="checkbox" checked={settings.testMode} onChange={(event) => setSettings({ ...settings, testMode: event.target.checked })} /> Chế độ test (dùng DeepSeek V4 Flash cho cả 4 vai trò)</label>
            <div className="settingsSection">
              <h3>XUẤT FILE</h3>
              <label className="toggleRow"><span>Tự động tải tất cả .docx khi xong</span><input type="checkbox" role="switch" checked={autoDownload} onChange={(event) => { const next = event.target.checked; setAutoDownload(next); localStorage.setItem("settings:autoDownload", String(next)); }} /></label>
            </div>
            <button className="settingsDone" onClick={() => setSettingsOpen(false)}>Lưu</button>
          </section>
        </div>
      )}
    </main>
  );
}
