import { z } from "zod";
import { resolveModel } from "../config/models";
import type { FileAttachment, ModelRole, Settings } from "../types";
export class AiError extends Error {
  constructor(
    public kind: string,
    message: string,
  ) {
    super(message);
  }
}
export type AiContent = string | { type?: string; text?: string }[] | undefined;
export const normalizeContent = (content: AiContent): string | undefined =>
  Array.isArray(content)
    ? content.map((part) => part.text ?? "").join("")
    : content;
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
    else if (character === "}" && --depth === 0)
      return text.slice(start, index + 1);
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
export async function askAi(
  role: ModelRole,
  system: string,
  user: string,
  settings: Settings,
  signal: AbortSignal,
  attachment?: FileAttachment,
  jsonOnly = false,
): Promise<string> {
  if (!settings.apiKey && settings.mode === "direct")
    throw new AiError(
      "key",
      "Hãy nhập khóa truy cập trong Cài đặt trước khi tạo báo cáo.",
    );
  const url =
    settings.mode === "worker"
      ? settings.endpoint
      : `${settings.endpoint.replace(/\/$/, "")}/chat/completions`;
  for (let attempt = 0; attempt < 3; attempt++)
    try {
      const userContent = attachment
        ? [
            { type: "text", text: user },
            {
              type: "file",
              file: {
                filename: attachment.name,
                file_data: attachment.dataUrl,
              },
            },
          ]
        : user;
      const response = await fetch(url, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(settings.mode === "direct"
            ? { Authorization: `Bearer ${settings.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: resolveModel(role, settings.testMode),
          messages: [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
          temperature: role === "writer" ? 0.45 : 0.15,
          ...(jsonOnly ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2)
          continue;
        throw new AiError("api", messageOf(response.status));
      }
      const json = (await response.json()) as {
        choices?: { message?: { content?: AiContent } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      const text = normalizeContent(content);
      if (!text)
        throw new AiError(
          "format",
          "Dịch vụ trả về nội dung không đúng định dạng.",
        );
      return text;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      if (error instanceof AiError) throw error;
      if (attempt === 2)
        throw new AiError(
          "network",
          "Mất kết nối hoặc dịch vụ không phản hồi.",
        );
    }
  throw new AiError("network", "Mất kết nối.");
}
export async function askJson<T>(
  role: ModelRole,
  system: string,
  user: string,
  schema: z.ZodType<T>,
  settings: Settings,
  signal: AbortSignal,
  attachment?: FileAttachment,
): Promise<T> {
  let output = await askAi(
    role,
    system,
    user,
    settings,
    signal,
    attachment,
    true,
  );
  for (let i = 0; i < 2; i++) {
    let parsed: ReturnType<typeof schema.safeParse>;
    try {
      const candidate = extractJsonObject(
        output.replace(/^```(?:json)?\s*|\s*```$/g, ""),
      );
      parsed = schema.safeParse(candidate ? JSON.parse(candidate) : undefined);
    } catch {
      parsed = schema.safeParse(undefined);
    }
    if (parsed.success) return parsed.data;
    if (import.meta.env.DEV)
      console.debug("Invalid JSON response", { role, output });
    if (i === 1) break;
    output = await askAi(
      role,
      "Bạn chỉ trả JSON hợp lệ theo schema yêu cầu.",
      `Sửa JSON này: ${output}`,
      settings,
      signal,
      undefined,
      true,
    );
  }
  throw new AiError(
    "format",
    "Phản hồi JSON không hợp lệ sau khi đã thử sửa một lần.",
  );
}
