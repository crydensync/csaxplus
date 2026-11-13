import { describe, expect, it } from "vitest";

import { buildAskAIWidgetSnippet } from "@/lib/ask-ai-widget-snippet";

describe("Ask-AI Widget install snippet", () => {
  it("uses the configured hosts and public copy without embedding credentials or identity", () => {
    const snippet = buildAskAIWidgetSnippet({
      consoleOrigin: "https://console.example.test",
      apiUrl: "https://api.example.test/",
      greeting: "Ask about your account",
      placeholder: "Type a question",
    });

    expect(snippet).toContain('src="https://console.example.test/csax-widget.js"');
    expect(snippet).toContain('data-api-url="https://api.example.test"');
    expect(snippet).toContain('data-greeting="Ask about your account"');
    expect(snippet).not.toMatch(/token|user_id|userId|api[_-]?key/i);
  });

  it("escapes admin-provided copy before placing it in HTML attributes", () => {
    const snippet = buildAskAIWidgetSnippet({
      consoleOrigin: "https://console.example.test",
      apiUrl: "https://api.example.test",
      greeting: 'Hello"><img src=x onerror="alert(1)">',
      placeholder: "Ask & learn",
    });

    expect(snippet).toContain(
      'data-greeting="Hello&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"',
    );
    expect(snippet).toContain('data-placeholder="Ask &amp; learn"');
    expect(snippet).not.toContain("<img");
  });
});
