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

// Free providers can queue before returning a long report. Twenty-five seconds
// cancelled otherwise healthy generations too early.
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_REQUEST_ATTEMPTS = 4;

const waitForRetry = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

const retryDelayMs = (response: Response, attempt: number) => {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000, 1_000), 30_000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(Math.max(retryAt - Date.now(), 1_000), 30_000);
  }
  return Math.min(2_000 * 2 ** attempt, 16_000);
};

const providerErrorDetail = (rawError: string) => {
  try {
    const parsed = JSON.parse(rawError) as {
      error?: {
        message?: string;
        metadata?: { raw?: string; provider_name?: string };
      } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    const message = parsed.error?.message ?? parsed.message ?? "";
    const provider = parsed.error?.metadata?.provider_name;
    const rawProviderError = parsed.error?.metadata?.raw;
    return [message, provider && `Provider: ${provider}`, rawProviderError]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 500);
  } catch {
    return rawError.slice(0, 500);
  }
};

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
  const apiKey = settings.apiKey.trim();
  if (!apiKey && settings.mode === "direct")
    throw new AiError("key", "Hãy nhập khóa truy cập trong Cài đặt trước khi tạo báo cáo.");
  if (settings.mode === "direct" && !apiKey.startsWith("sk-or-v1-"))
    throw new AiError("key", "Khóa OpenRouter phải bắt đầu bằng sk-or-v1-.");

  const url =
    settings.mode === "worker"
      ? settings.endpoint
      : `${settings.endpoint.replace(/\/$/, "")}/chat/completions`;
  const model = resolveModel(role, settings.testMode);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(settings.mode === "direct"
      ? {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-OpenRouter-Title": "Trợ lý Báo cáo Can thiệp",
        }
      : {}),
  };
  const debugEnabled =
    import.meta.env.DEV || new URLSearchParams(window.location.search).has("debug");

  if (debugEnabled) {
    console.debug("OpenRouter request", {
      url,
      model,
      mode: settings.mode,
      apiKeyPresent: Boolean(apiKey),
      apiKeyHasOpenRouterPrefix: apiKey.startsWith("sk-or-v1-"),
      authorization: headers.Authorization ? "Bearer [redacted]" : "missing",
      headers: Object.keys(headers),
    });
  }

  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt++) {
    const timeoutController = new AbortController();
    const timer = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const abortFromUser = () => timeoutController.abort();
    signal.addEventListener("abort", abortFromUser, { once: true });
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: timeoutController.signal,
        headers,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: system,
              // OpenRouter/DeepSeek keeps this fixed system prompt in its prompt cache.
              cache_control: { type: "ephemeral" },
            },
            { role: "user", content: user },
          ],
          temperature: role === "writer" ? 0.45 : 0.15,
        }),
      });

      if (!response.ok) {
        const rawError = await response.text();
        const providerDetail = providerErrorDetail(rawError);
        if (
          (response.status === 429 || response.status === 408 || response.status >= 500) &&
          attempt < MAX_REQUEST_ATTEMPTS - 1
        ) {
          await waitForRetry(retryDelayMs(response, attempt), signal);
          continue;
        }
        throw new AiError(
          "api",
          `${messageOf(response.status)} (HTTP ${response.status}, đã thử ${attempt + 1} lần)${providerDetail ? `: ${providerDetail}` : ""}`,
          response.status,
        );
      }

      const json = (await response.json()) as {
        model?: string;
        provider?: string;
        choices?: { message?: { content?: AiContent } }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          prompt_tokens_details?: {
            cached_tokens?: number;
            cache_write_tokens?: number;
          };
        };
      };
      if (debugEnabled) {
        const usage = json.usage;
        const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
        const promptTokens = usage?.prompt_tokens;
        console.debug("Prompt cache usage", {
          role,
          model: json.model ?? model,
          provider: json.provider,
          cache_hit_tokens: cachedTokens,
          cache_miss_tokens:
            promptTokens === undefined ? undefined : Math.max(promptTokens - cachedTokens, 0),
          cache_write_tokens: usage?.prompt_tokens_details?.cache_write_tokens ?? 0,
        });
      }
      const text = normalizeContent(json.choices?.[0]?.message?.content);
      if (!text) throw new AiError("format", "Dịch vụ trả về nội dung không đúng định dạng.");
      return { text, model: json.model ?? model, provider: json.provider };
    } catch (error) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (timeoutController.signal.aborted) {
        throw new AiError(
          "network",
          `OpenRouter không phản hồi sau 120 giây. Model: ${model}. API: ${url}. Nếu OpenRouter Logs trống, request chưa tới OpenRouter; hãy kiểm tra mạng, khóa API, workspace và địa chỉ API.`,
        );
      }
      if (error instanceof AiError) throw error;
      if (attempt < MAX_REQUEST_ATTEMPTS - 1) {
        await waitForRetry(Math.min(1_000 * 2 ** attempt, 8_000), signal);
        continue;
      }
      if (attempt === MAX_REQUEST_ATTEMPTS - 1)
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
