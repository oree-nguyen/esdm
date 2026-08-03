import { useEffect, useRef, useState } from 'react';
import mammoth from 'mammoth';
import { APP_NAME, DEFAULT_SETTINGS, MAX_SOURCE_CHARS } from '../config/app';
import { downloadDocx, downloadMarkdown } from '../export/files';
import { runWorkflow } from '../services/workflow';
import { clearStorage, loadDraft, saveDraft } from '../storage/draftStorage';
import type { ChatMessage, ChildInput, Settings } from '../types';

const today = () => new Date().toLocaleDateString('en-CA');
const extract = (text: string): Partial<ChildInput> => ({
  childName: text.match(/(?:họ và tên|tên trẻ|trẻ)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim(),
  birthDate: text.match(/(?:ngày sinh)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim(),
  evaluator: text.match(/(?:người đánh giá)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim(),
  sourceData: text.match(/(?:dữ liệu (?:nguồn|đánh giá)|quan sát)\s*[:\-]\s*([\s\S]+)/i)?.[1]?.trim() || text,
});

export function App() {
  const saved = loadDraft();
  const [messages, setMessages] = useState<ChatMessage[]>(saved.messages ?? [{ id: 'welcome', role: 'assistant', text: 'Chào bạn. Hãy dán dữ liệu đánh giá của trẻ hoặc đính kèm tệp DOCX.', createdAt: Date.now() }]);
  const [draft, setDraft] = useState('');
  const [attachedFile, setAttachedFile] = useState('');
  const [fileError, setFileError] = useState('');
  const [report, setReport] = useState(saved.report ?? '');
  const [settings, setSettings] = useState<Settings>(saved.settings ?? DEFAULT_SETTINGS);
  const [open, setOpen] = useState(false), [settingsOpen, setSettingsOpen] = useState(false), [working, setWorking] = useState(false);
  const [trace, setTrace] = useState<string[]>([]), [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => saveDraft({ messages, report, settings }), [messages, report, settings]);
  useEffect(() => { if (!working) return; const id = setInterval(() => setElapsed(x => x + 1), 1000); return () => clearInterval(id); }, [working]);
  const say = (text: string, reportChip = false) => setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text, report: reportChip, createdAt: Date.now() }]);

  async function attachDocx(file?: File) {
    if (!file) return;
    setFileError('');
    if (!file.name.toLowerCase().endsWith('.docx')) { setFileError('Chỉ hỗ trợ tệp .docx.'); return; }
    try {
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      const text = result.value.trim();
      if (!text) throw new Error('Tệp DOCX không có văn bản để đọc.');
      setDraft(text); setAttachedFile(file.name);
    } catch (error) { setFileError(error instanceof Error ? error.message : 'Không thể đọc tệp DOCX.'); }
  }

  async function submit() {
    const text = draft.trim(); if (!text || working) return;
    setMessages(m => [...m, { id: crypto.randomUUID(), role: 'user', text, createdAt: Date.now() }]); setDraft(''); setAttachedFile('');
    const fields = extract(text); const missing = [!fields.childName && 'tên trẻ', !fields.birthDate && 'ngày sinh', !fields.evaluator && 'người đánh giá', !fields.sourceData && 'dữ liệu nguồn'].filter(Boolean);
    if (missing.length || text.length < 40) { say(`Để bắt đầu, vui lòng bổ sung: ${missing.length ? missing.join(', ') : 'dữ liệu nguồn chi tiết hơn'}.`); return; }
    if (text.length > MAX_SOURCE_CHARS) { say('Dữ liệu quá dài. Vui lòng rút gọn còn dưới 30.000 ký tự.'); return; }
    const input: ChildInput = { childName: fields.childName!, birthDate: fields.birthDate, evaluator: fields.evaluator, sourceData: fields.sourceData!, reportDate: today(), interventionPeople: 'Giáo viên và gia đình' };
    controller.current = new AbortController(); setWorking(true); setElapsed(0); setTrace([]);
    try { const result = await runWorkflow(input, settings, controller.current.signal, s => setTrace(t => [...t, s])); setReport(result.report); say(`Đã tạo báo cáo cho ${input.childName} với ${result.goals.length} mục tiêu.${result.issues.length ? ` Còn ${result.issues.length} điểm cần xem lại.` : ' Báo cáo đã qua kiểm tra.'}`, true); }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') say('Đã hủy quy trình.'); else say(error instanceof Error ? error.message : 'Đã có lỗi không xác định.'); }
    finally { setWorking(false); }
  }
  function newChat() { if (confirm('Bắt đầu cuộc trò chuyện mới?')) { setMessages([{ id: crypto.randomUUID(), role: 'assistant', text: 'Cuộc trò chuyện mới đã sẵn sàng.', createdAt: Date.now() }]); setReport(''); setOpen(false); } }

  return <main><header><div><strong>{APP_NAME}</strong><small>{settings.apiKey || settings.mode === 'worker' ? 'Sẵn sàng kết nối' : 'Cần cấu hình khóa'}</small></div><div><button onClick={newChat}>Mới</button><button onClick={() => setSettingsOpen(true)}>Cài đặt</button></div></header>
    <section className="chat">{messages.map(m => <article key={m.id} className={`bubble ${m.role}`}><p>{m.text}</p>{m.report && <button className="chip" onClick={() => setOpen(true)}>📄 Báo cáo can thiệp</button>}</article>)}{working && <article className="status"><span className="dot"/> Đang làm việc… <button onClick={() => controller.current?.abort()}>Hủy</button></article>}{!working && trace.length > 0 && <details className="status"><summary>Đã xử lý trong {elapsed} giây</summary>{trace.map(x => <div key={x}>✓ {x}</div>)}</details>}</section>
    <footer><div className="composer"><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Dán dữ liệu đánh giá của trẻ…" aria-label="Nội dung tin nhắn" />{attachedFile && <small className="attachment">📎 {attachedFile}</small>}{fileError && <small className="fileError">{fileError}</small>}<label className="attach"><input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => attachDocx(e.target.files?.[0])} />Đính kèm DOCX</label></div><button className="send" disabled={working || !draft.trim()} onClick={submit}>Gửi</button></footer>
    {open && <aside><div className="panelHead"><strong>Báo cáo</strong><button onClick={() => setOpen(false)}>Đóng</button></div><div className="actions"><button onClick={() => navigator.clipboard.writeText(report)}>Sao chép</button><button onClick={() => downloadMarkdown(report, 'bao-cao', today())}>Tải Markdown</button><button onClick={() => downloadDocx(report, 'bao-cao', today())}>Tải Word</button></div><textarea className="reportEdit" value={report} onChange={e => setReport(e.target.value)} /></aside>}
    {settingsOpen && <div className="modal"><section><h2>Cài đặt kết nối</h2><label>Khóa truy cập<input type="password" value={settings.apiKey} onChange={e => setSettings({ ...settings, apiKey: e.target.value })} /></label><label><input type="checkbox" checked={settings.persistKey} onChange={e => setSettings({ ...settings, persistKey: e.target.checked })} /> Lưu khóa trên thiết bị này</label><label>Chế độ<select value={settings.mode} onChange={e => setSettings({ ...settings, mode: e.target.value as Settings['mode'] })}><option value="direct">Gọi trực tiếp</option><option value="worker">Qua Cloudflare Worker</option></select></label><label>Địa chỉ API<input value={settings.endpoint} onChange={e => setSettings({ ...settings, endpoint: e.target.value })} /></label><button onClick={() => { if (confirm('Xóa toàn bộ dữ liệu cục bộ?')) { clearStorage(); location.reload(); } }}>Xóa dữ liệu cục bộ</button><button onClick={() => setSettingsOpen(false)}>Xong</button></section></div>}</main>;
}
