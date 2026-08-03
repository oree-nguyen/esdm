import { describe, expect, it } from "vitest";
import { normalizeContent } from "./aiClient";

describe("normalizeContent", () => {
  it("returns string content unchanged", () => {
    expect(normalizeContent('{"ok":true}')).toBe('{"ok":true}');
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
