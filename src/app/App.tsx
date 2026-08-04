import { useEffect, useRef, useState } from "react";
import mammoth from "mammoth";
import { APP_NAME, DEFAULT_SETTINGS } from "../config/app";
import { downloadDocx, downloadMarkdown } from "../export/files";
import { runWorkflow } from "../services/workflow";
import { StepTraceStatus } from "../components/chat/StepTraceStatus";
import { deleteSession, loadActiveSession, loadDraft, loadSession, loadSessionIndex, saveDraft, saveSession } from "../storage/draftStorage";
import type {
  ChatMessage,
  ChildInput,
  Settings,
  StepEvent,
  ReportSession,
} from "../types";
import "../attachment.css";

const today = () => new Date().toLocaleDateString("en-CA");
const createSession = (): ReportSession => ({ id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), status: "in_progress", rawInput: "", lastCompletedStep: "none", stepOutputs: { fixRoundCount: 0 }, stepTraceLog: [], messages: [{ id: crypto.randomUUID(), role: "assistant", text: "Chào bạn. Hãy dán dữ liệu đánh giá của trẻ hoặc đính kèm tệp DOCX.", createdAt: Date.now() }] });

export function App() {
  const saved = loadDraft();
  const restored = loadActiveSession();
  const [session, setSession] = useState<ReportSession>(() => restored ?? createSession());
  const [sessions, setSessions] = useState(() => loadSessionIndex());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(
    restored?.messages ?? saved.messages ?? [
      {
        id: "welcome",
        role: "assistant",
        text: "Chào bạn. Hãy dán dữ liệu đánh giá của trẻ hoặc đính kèm tệp DOCX.",
        createdAt: Date.now(),
      },
    ],
  );
  const [draft, setDraft] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [attachedFile, setAttachedFile] = useState("");
  const [fileError, setFileError] = useState("");
  const [report, setReport] = useState(restored?.stepOutputs.reportMarkdown ?? saved.report ?? "");
  const [settings, setSettings] = useState<Settings>(
    saved.settings ?? DEFAULT_SETTINGS,
  );
  const [open, setOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [working, setWorking] = useState(false);
  const [trace, setTrace] = useState<StepEvent[]>(() => restored?.stepTraceLog.map((x, i) => ({ id: `saved-${i}`, text: x.text, phase: x.phase as StepEvent["phase"], status: "done" })) ?? []),
    [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => saveDraft({ messages, report, settings }),
    [messages, report, settings],
  );
  useEffect(() => { saveSession({ ...session, messages, stepTraceLog: trace.map(x => ({ text: x.text, phase: x.phase })), stepOutputs: { ...session.stepOutputs, reportMarkdown: report } }); setSessions(loadSessionIndex()); }, [session, messages, report, trace]);
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [working]);
  useEffect(() => { document.documentElement.classList.toggle("dark", darkMode); }, [darkMode]);
  const say = (text: string, reportChip = false) =>
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text,
        report: reportChip,
        createdAt: Date.now(),
      },
    ]);

  async function attachDocx(file?: File) {
    if (!file) return;
    setFileError("");
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setFileError("Chỉ hỗ trợ tệp .docx.");
      return;
    }
    try {
      const result = await mammoth.extractRawText({
        arrayBuffer: await file.arrayBuffer(),
      });
      const text = result.value.trim();
      if (!text) throw new Error("Tệp DOCX không có văn bản để đọc.");
      setExtractedText(text);
      setAttachedFile(file.name);
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Không thể đọc tệp DOCX.",
      );
    }
  }

  async function submit(resume = false) {
    const text = (resume ? session.rawInput : (draft.trim() || extractedText)).trim();
    if (!text || working) return;
    if (!resume) setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: attachedFile ? `📎 ${attachedFile}` : text,
        createdAt: Date.now(),
      },
    ]);
    if (!resume) { setDraft(""); setExtractedText(""); setAttachedFile(""); }
    const fields: Partial<ChildInput> = {};
    const missing = [
      !fields.childName && "tên trẻ",
      !fields.birthDate && "ngày sinh",
      !fields.evaluator && "người đánh giá",
      !fields.sourceData && "dữ liệu nguồn",
    ].filter(Boolean);
    missing.length = 0;
    if (missing.length || text.length < 40) {
      say(
        `Để bắt đầu, vui lòng bổ sung: ${missing.length ? missing.join(", ") : "dữ liệu nguồn chi tiết hơn"}.`,
      );
      return;
    }
    const input: ChildInput = {
      childName: "",
      birthDate: fields.birthDate,
      evaluator: fields.evaluator,
      sourceData: text,
      reportDate: today(),
      interventionPeople: "Giáo viên và gia đình",
    };
    setSession((s) => resume ? ({ ...s, status: "in_progress", lastError: undefined }) : ({ ...s, rawInput: text, status: "in_progress", lastError: undefined, lastCompletedStep: "none", stepOutputs: { fixRoundCount: 0 } }));
    controller.current = new AbortController();
    setWorking(true);
    setElapsed(0);
    if (!resume) setTrace([]);
    try {
      const result = await runWorkflow(
        input,
        settings,
        controller.current.signal,
        (event) =>
          setTrace((events) =>
            events.some((item) => item.id === event.id)
              ? events.map((item) => (item.id === event.id ? event : item))
              : [
                  ...events.map((item) =>
                    item.status === "active"
                      ? { ...item, status: "done" as const }
                      : item,
                  ),
                  event,
                ],
          ),
        { resume: resume ? { lastCompletedStep: session.lastCompletedStep, ...session.stepOutputs } : undefined, onCheckpoint: (checkpoint) => setSession((s) => ({ ...s, lastCompletedStep: checkpoint.lastCompletedStep, stepOutputs: { analysisJson: checkpoint.analysisJson, goalsJson: checkpoint.goalsJson, reportMarkdown: checkpoint.reportMarkdown, reviewIssuesJson: checkpoint.reviewIssuesJson, fixRoundCount: checkpoint.fixRoundCount } })) },
      );
      setReport(result.report);
      setSession((s) => ({ ...s, status: "completed", childNameLabel: result.childName, lastCompletedStep: "done" }));
      say(
        `Đã tạo báo cáo cho ${result.childName} với ${result.goals.length} mục tiêu.${result.issues.length ? ` Còn ${result.issues.length} điểm cần xem lại.` : " Báo cáo đã qua kiểm tra."}`,
        true,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        say("Đã hủy quy trình.");
      else {
        const message = error instanceof Error ? error.message : "Đã có lỗi không xác định.";
        setSession((s) => ({ ...s, status: message.includes("chưa có") ? "stopped_missing_info" : "error", lastError: message }));
        say(
          message,
        );
      }
    } finally {
      setWorking(false);
    }
  }
  function newChat() {
    if (confirm("Bắt đầu cuộc trò chuyện mới?")) {
      const next=createSession(); setSession(next); setMessages(next.messages); setTrace([]); setElapsed(0);
      setReport("");
      setOpen(false);
    }
  }
  function openSession(id: string) { const target=loadSession(id); if (!target) return; setSession(target); setMessages(target.messages); setReport(target.stepOutputs.reportMarkdown ?? ""); setTrace(target.stepTraceLog.map((x,i)=>({id:`saved-${i}`,text:x.text,phase:x.phase as StepEvent["phase"],status:"done"}))); setElapsed(Math.max(0, Math.round((target.updatedAt-target.createdAt)/1000))); setSidebarOpen(false); }

  return (
    <main>
      <button className="menuButton" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
      <nav className={`sessionSidebar ${sidebarOpen ? "open" : ""}`}>
        <button onClick={() => newChat()}>+ Cuộc trò chuyện mới</button>
        {sessions.map((item) => <div className="sessionItem" key={item.id}><button onClick={() => openSession(item.id)}><i className={item.status} />{item.childNameLabel || "Báo cáo chưa đặt tên"}<small>{new Date(item.createdAt).toLocaleString("vi-VN")}</small></button><button aria-label="Xóa phiên" onClick={() => { if(confirm("Xóa phiên này?")){ deleteSession(item.id); setSessions(loadSessionIndex()); if(item.id===session.id)newChat(); } }}>🗑</button></div>)}
      </nav>
      {sidebarOpen && <button className="sidebarBackdrop" aria-label="Đóng lịch sử" onClick={() => setSidebarOpen(false)} />}
      <header>
        <div>
          <strong>{APP_NAME}</strong>
          <small>
            {settings.apiKey || settings.mode === "worker"
              ? "Sẵn sàng kết nối"
              : "Cần cấu hình khóa"}
          </small>
        </div>
        <div>
          <button onClick={newChat}>Mới</button>
          <button onClick={() => setSettingsOpen(true)}>Cài đặt</button>
        </div>
      </header>
      <section className="chat">
        {messages.map((m) => (
          <article key={m.id} className={`bubble ${m.role}`}>
            <p>{m.text}</p>
            {m.report && (
              <button className="chip" onClick={() => setOpen(true)}>
                📄 Báo cáo can thiệp
              </button>
            )}
          </article>
        ))}
        <StepTraceStatus
          events={trace}
          working={working}
          elapsed={elapsed}
          onCancel={() => controller.current?.abort()}
          resumable={!working && (session.status === "in_progress" || session.status === "error") && session.lastCompletedStep !== "none"}
          onContinue={() => submit(true)}
        />
      </section>
      <footer>
        <div className="composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Dán dữ liệu đánh giá của trẻ…"
            aria-label="Nội dung tin nhắn"
          />
          {attachedFile && (
            <small className="attachment">📎 {attachedFile}</small>
          )}
          {fileError && <small className="fileError">{fileError}</small>}
          <label className="attach">
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => attachDocx(e.target.files?.[0])}
            />
            Đính kèm DOCX
          </label>
        </div>
        <button
          className="send"
          disabled={working || (!draft.trim() && !extractedText)}
          onClick={() => submit()}
        >
          Gửi
        </button>
      </footer>
      {open && (
        <aside>
          <div className="panelHead">
            <strong>Báo cáo</strong>
            <button onClick={() => setOpen(false)}>Đóng</button>
          </div>
          <div className="actions">
            <button onClick={() => navigator.clipboard.writeText(report)}>
              Sao chép
            </button>
            <label>
              <input type="checkbox" checked={darkMode} onChange={(e) => setDarkMode(e.target.checked)} /> Chế độ tối
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.testMode}
                onChange={(e) =>
                  setSettings({ ...settings, testMode: e.target.checked })
                }
              />{" "}
              Cháº¿ Ä‘á»™ test (dÃ¹ng openai/gpt-oss-20b:free cho cáº£ 4 vai
              trÃ²)
            </label>
            <button
              onClick={() => downloadMarkdown(report, "bao-cao", today())}
            >
              Tải Markdown
            </button>
            <button onClick={() => downloadDocx(report, "bao-cao", today())}>
              Tải Word
            </button>
          </div>
          <textarea
            className="reportEdit"
            value={report}
            onChange={(e) => setReport(e.target.value)}
          />
        </aside>
      )}
      {settingsOpen && (
        <div className="modal">
          <section>
            <h2>Cài đặt kết nối</h2>
            <label>
              Khóa truy cập
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) =>
                  setSettings({ ...settings, apiKey: e.target.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.persistKey}
                onChange={(e) =>
                  setSettings({ ...settings, persistKey: e.target.checked })
                }
              />{" "}
              Lưu khóa trên thiết bị này
            </label>
            <label>
              Chế độ
              <select
                value={settings.mode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    mode: e.target.value as Settings["mode"],
                  })
                }
              >
                <option value="direct">Gọi trực tiếp</option>
                <option value="worker">Qua Cloudflare Worker</option>
              </select>
            </label>
            <label>
              Địa chỉ API
              <input
                value={settings.endpoint}
                onChange={(e) =>
                  setSettings({ ...settings, endpoint: e.target.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.testMode}
                onChange={(e) =>
                  setSettings({ ...settings, testMode: e.target.checked })
                }
              />{" "}
              Test mode: use openai/gpt-oss-20b:free for all roles
            </label>
            <button className="settingsDone" onClick={() => setSettingsOpen(false)}>Xong</button>
          </section>
        </div>
      )}
    </main>
  );
}
