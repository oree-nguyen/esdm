import { describe, expect, it } from "vitest";
import { extractJsonObject, normalizeContent } from "./aiClient";

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
