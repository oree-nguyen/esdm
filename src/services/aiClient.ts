import { z } from "zod";
import { MODEL_CONFIG, TEST_MODEL } from "../config/models";
import type { ModelRole, Settings } from "../types";
export class AiError extends Error {
  constructor(
    public kind: string,
    message: string,
  ) {
    super(message);
  }
}
const messageOf = (status: number) =>
  status === 401
    ? "Khóa truy cập không hợp lệ."
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
          model: settings.testMode ? TEST_MODEL : MODEL_CONFIG[role],
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: role === "writer" ? 0.45 : 0.15,
          max_tokens: role === "writer" ? 6000 : 3500,
        }),
      });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2)
          continue;
        throw new AiError("api", messageOf(response.status));
      }
      const json = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content;
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
): Promise<T> {
  let output = await askAi(role, system, user, settings, signal);
  for (let i = 0; i < 2; i++) {
    const parsed = schema.safeParse(
      JSON.parse(output.replace(/^```json\s*|\s*```$/g, "")),
    );
    if (parsed.success) return parsed.data;
    output = await askAi(
      role,
      "Bạn chỉ trả JSON hợp lệ theo schema yêu cầu.",
      `Sửa JSON này: ${output}`,
      settings,
      signal,
    );
  }
  throw new AiError(
    "format",
    "Phản hồi JSON không hợp lệ sau khi đã thử sửa một lần.",
  );
}
