import { resolveModel } from "../config/models";
import { JSON_FIX_PROMPT } from "../prompts/templates";
import type { ModelRole, Settings } from "../types";

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
  status === 401
    ? "Khóa truy cập không hợp lệ."
    : status === 402 || status === 403
      ? "Tài khoản OpenRouter không đủ tín dụng hoặc không được phép dùng model này. Hãy bật Test mode hoặc nạp tín dụng."
      : status === 429
        ? "Đã chạm giới hạn yêu cầu, vui lòng thử lại."
        : status === 404
          ? "Mô hình không khả dụng."
          : "Không thể gọi dịch vụ AI.";

const REQUEST_TIMEOUT_MS = 25_000;

interface AiResponse {
  text: string;
  model: string;
  provider?: string;
}

async function requestAi(
  role: ModelRole,
  system: string,
  user: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<AiResponse> {
  if (!settings.apiKey && settings.mode === "direct")
    throw new AiError("key", "Hãy nhập khóa truy cập trong Cài đặt trước khi tạo báo cáo.");

  const url =
    settings.mode === "worker"
      ? settings.endpoint
      : `${settings.endpoint.replace(/\/$/, "")}/chat/completions`;
  const model = resolveModel(role, settings.testMode);

  for (let attempt = 0; attempt < 3; attempt++) {
    const timeoutController = new AbortController();
    const timer = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const abortFromUser = () => timeoutController.abort();
    signal.addEventListener("abort", abortFromUser, { once: true });
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: timeoutController.signal,
        headers: {
          "Content-Type": "application/json",
          ...(settings.mode === "direct" ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: role === "writer" ? 0.45 : 0.15,
        }),
      });

      if (!response.ok) {
        const rawError = await response.text();
        let providerDetail = "";
        try {
          const parsed = JSON.parse(rawError) as {
            error?: { message?: string } | string;
            message?: string;
          };
          providerDetail =
            typeof parsed.error === "string"
              ? parsed.error
              : parsed.error?.message ?? parsed.message ?? "";
        } catch {
          providerDetail = rawError.slice(0, 240);
        }
        if ((response.status === 429 || response.status >= 500) && attempt < 2) continue;
        throw new AiError(
          "api",
          `${messageOf(response.status)} (HTTP ${response.status})${providerDetail ? `: ${providerDetail}` : ""}`,
          response.status,
        );
      }

      const json = (await response.json()) as {
        model?: string;
        provider?: string;
        choices?: { message?: { content?: AiContent } }[];
      };
      const text = normalizeContent(json.choices?.[0]?.message?.content);
      if (!text) throw new AiError("format", "Dịch vụ trả về nội dung không đúng định dạng.");
      return { text, model: json.model ?? model, provider: json.provider };
    } catch (error) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (timeoutController.signal.aborted)
        throw new AiError(
          "network",
          `Không nhận được phản hồi từ OpenRouter trong 25 giây. Model: ${model}. API: ${url}. Nếu OpenRouter Logs trống, request chưa được OpenRouter ghi nhận; hãy kiểm tra mạng, khóa API, workspace đang xem và địa chỉ API rồi thử lại.`,
        );
      if (error instanceof AiError) throw error;
      if (attempt === 2)
        throw new AiError(
          "network",
          `Không thể gửi yêu cầu tới OpenRouter. Model: ${model}. API: ${url}. Chi tiết trình duyệt: ${error instanceof Error ? error.message : String(error)}. Nếu OpenRouter Logs trống, lỗi xảy ra trước khi OpenRouter tạo transaction.`,
        );
    } finally {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abortFromUser);
    }
  }
  throw new AiError("network", "Mất kết nối.");
}

export async function askAi(
  role: ModelRole,
  system: string,
  user: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<string> {
  return (await requestAi(role, system, user, settings, signal)).text;
}

export async function askStructured<T>(
  role: ModelRole,
  system: string,
  user: string,
  parse: (text: string) => T | undefined,
  startMarker: string,
  expectedFormat: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<T> {
  let response = await requestAi(role, system, user, settings, signal);
  for (let repair = 0; repair < 2; repair++) {
    const start = response.text.indexOf(startMarker);
    const parsed = start >= 0 ? parse(response.text.slice(start)) : undefined;
    if (parsed !== undefined) return parsed;
    if (import.meta.env.DEV)
      console.debug("Invalid structured response", {
        role,
        model: response.model,
        provider: response.provider,
        content: response.text,
      });
    if (repair === 1) break;
    response = await requestAi(
      role,
      JSON_FIX_PROMPT,
      `Phản hồi cần sửa:\n${response.text}\n\nEXPECTED_FORMAT:\n${expectedFormat}`,
      settings,
      signal,
    );
  }
  throw new AiError("format", "Phản hồi Markdown không đúng cấu trúc sau khi đã thử sửa một lần.");
}
