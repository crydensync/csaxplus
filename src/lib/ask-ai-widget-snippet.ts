export function buildAskAIWidgetSnippet(options: {
  consoleOrigin: string;
  apiUrl: string;
  greeting: string;
  placeholder: string;
}): string {
  const scriptURL = new URL("/csax-widget.js", options.consoleOrigin).toString();
  const apiURL = options.apiUrl.replace(/\/+$/, "");

  return [
    '<div id="csax-ask-ai"></div>',
    "<script",
    `  src="${escapeAttribute(scriptURL)}"`,
    `  data-api-url="${escapeAttribute(apiURL)}"`,
    '  data-target="#csax-ask-ai"',
    `  data-greeting="${escapeAttribute(options.greeting)}"`,
    `  data-placeholder="${escapeAttribute(options.placeholder)}"`,
    "></script>",
  ].join("\n");
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
