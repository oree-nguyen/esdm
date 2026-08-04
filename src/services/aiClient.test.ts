import { afterEach, describe, expect, it, vi } from "vitest";
import { askAi, extractJsonObject, normalizeContent, OPENROUTER_APP_TITLE, sseDataValue } from "./aiClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenRouter request headers", () => {
  it("uses an ASCII-safe application title accepted by browser fetch", () => {
    expect(OPENROUTER_APP_TITLE).toMatch(/^[\x20-\x7e]*$/);
  });
});

describe("OpenRouter streaming", () => {
  it("reads JSON data events and ignores keep-alive comments", () => {
    expect(sseDataValue(": OPENROUTER PROCESSING")).toBeUndefined();
    expect(sseDataValue('data: {"choices":[]}')).toBe('{"choices":[]}');
    expect(sseDataValue("data: [DONE]")).toBe("[DONE]");
  });

  it("sends a streaming request and joins the returned output", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://oree-nguyen.github.io", search: "" },
    });
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n"));
        controller.enqueue(
          encoder.encode(
            'data: {"model":"deepseek/deepseek-v4-flash-0731","choices":[{"delta":{"content":"Xin "}}]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"chào"}}]}\n\n'),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "X-Generation-Id": "generation-test",
        },
      }),
    );

    const output = await askAi(
      "writer",
      "system prompt",
      "user content",
      {
        apiKey: "sk-or-v1-test-key",
        persistKey: false,
        mode: "direct",
        endpoint: "https://openrouter.ai/api/v1",
        testMode: false,
      },
      new AbortController().signal,
    );

    expect(output).toBe("Xin chào");
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      stream?: boolean;
    };
    expect(requestBody.stream).toBe(true);
  });
});

describe("normalizeContent", () => {
  it("returns string content unchanged", () => {
    expect(normalizeContent('{"ok":true}')).toBe('{"ok":true}');
  });

  it("extracts the first complete nested JSON object after reasoning text", () => {
    expect(
      extractJsonObject(
        'We need to check. {"item":{"note":"brace } in text"}} trailing',
      ),
    ).toBe('{"item":{"note":"brace } in text"}}');
  });

  it("joins OpenRouter content parts before JSON parsing", () => {
    expect(
      normalizeContent([
        { type: "text", text: '{"ok":' },
        { type: "text", text: "true}" },
      ]),
    ).toBe('{"ok":true}');
  });
});
