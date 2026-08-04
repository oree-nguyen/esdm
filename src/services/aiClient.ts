import { resolveModel } from "../config/models";
import { JSON_FIX_PROMPT } from "../prompts/templates";
import type { ModelRole, Settings } from "../types";

export type JsonSchema = Record<string, unknown>;
type ResponseFormat =
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; strict: true; schema: JsonSchema } };
export class AiError extends Error {
  constructor(public kind: string, message: string, public status?: number) {
    super(message);
  }
}
export type AiContent = string | { type?: string; text?: string }[] | undefined;
export const normalizeContent = (content: AiContent): string | undefined =>
  Array.isArray(content) ? content.map((part) => part.text ?? "").join("") : content;

/** Returns the first complete object, ignoring braces inside quoted JSON strings. */
export const extractJsonObject = (text: string): string | undefined => {
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) return text.slice(start, index + 1);
  }
  return undefined;
};

const messageOf = (status: number) =>
  status === 401 ? "Khóa truy cập không hợp lệ."
    : status === 402 || status === 403 ? "Tài khoản OpenRouter không đủ tín dụng hoặc không được phép dùng model này. Hãy bật Test mode hoặc nạp tín dụng."
    : status === 429 ? "Đã chạm giới hạn yêu cầu, vui lòng thử lại."
    : status === 404 ? "Mô hình không khả dụng."
    : "Không thể gọi dịch vụ AI.";
const REQUEST_TIMEOUT_MS = 25_000;

interface AiResponse { text: string; model: string; provider?: string }

async function requestAi(
  role: ModelRole, system: string, user: string, settings: Settings, signal: AbortSignal,
  responseFormat?: ResponseFormat,
): Promise<AiResponse> {
  if (!settings.apiKey && settings.mode === "direct")
    throw new AiError("key", "Hãy nhập khóa truy cập trong Cài đặt trước khi tạo báo cáo.");
  const url = settings.mode === "worker" ? settings.endpoint : `${settings.endpoint.replace(/\/$/, "")}/chat/completions`;
  const model = resolveModel(role, settings.testMode);
  for (let attempt = 0; attempt < 3; attempt++) {
    const timeoutController = new AbortController();
    const timer = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const abortFromUser = () => timeoutController.abort();
    signal.addEventListener("abort", abortFromUser, { once: true });
    try {
      const response = await fetch(url, {
        method: "POST", signal: timeoutController.signal,
        headers: { "Content-Type": "application/json", ...(settings.mode === "direct" ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature: role === "writer" ? 0.45 : 0.15,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
      });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2) continue;
        throw new AiError("api", messageOf(response.status), response.status);
      }
      const json = await response.json() as {
        model?: string; provider?: string; choices?: { message?: { content?: AiContent } }[];
      };
      const text = normalizeContent(json.choices?.[0]?.message?.content);
      if (!text) throw new AiError("format", "Dịch vụ trả về nội dung không đúng định dạng.");
      return { text, model: json.model ?? model, provider: json.provider };
    } catch (error) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (timeoutController.signal.aborted)
        throw new AiError("network", "Không thể kết nối OpenRouter trong 25 giây. Hãy kiểm tra mạng, khóa API và địa chỉ API rồi thử lại.");
      if (error instanceof AiError) throw error;
      if (attempt === 2) throw new AiError("network", "Mất kết nối hoặc dịch vụ không phản hồi.");
    } finally {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abortFromUser);
    }
  }
  throw new AiError("network", "Mất kết nối.");
}

export async function askAi(role: ModelRole, system: string, user: string, settings: Settings, signal: AbortSignal): Promise<string> {
  return (await requestAi(role, system, user, settings, signal)).text;
}

export async function askJson<T>(
  role: ModelRole, system: string, user: string, normalize: (value: unknown) => T | undefined, jsonSchema: JsonSchema,
  schemaName: string, settings: Settings, signal: AbortSignal,
): Promise<T> {
  let response: AiResponse;
  try {
    response = await requestAi(role, system, user, settings, signal, {
      type: "json_schema", json_schema: { name: schemaName, strict: true, schema: jsonSchema },
    });
  } catch (error) {
    if (!(error instanceof AiError) || error.status !== 400) throw error;
    if (import.meta.env.DEV) console.debug("Structured output unsupported; falling back to json_object", { role, model: resolveModel(role, settings.testMode) });
    response = await requestAi(role, system, user, settings, signal, { type: "json_object" });
  }
  for (let repair = 0; repair < 2; repair++) {
    try {
      const candidate = extractJsonObject(response.text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      const parsed = normalize(candidate ? JSON.parse(candidate) : undefined);
      if (parsed !== undefined) return parsed;
    } catch { /* repaired once below */ }
    if (import.meta.env.DEV)
      console.debug("Invalid JSON response", { role, model: response.model, provider: response.provider, content: response.text });
    if (repair === 1) break;
    response = await requestAi(
      role, JSON_FIX_PROMPT,
      `Phản hồi cần sửa:\n${response.text}\n\nEXPECTED_SCHEMA:\n${JSON.stringify(jsonSchema)}`,
      settings, signal, { type: "json_object" },
    );
  }
  throw new AiError("format", "Phản hồi JSON không hợp lệ sau khi đã thử sửa một lần.");
}
