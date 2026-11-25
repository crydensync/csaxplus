import { Card } from "@/components/Card";

/** Shared maintenance state for the console's AI-only screens. */
export function AIWorkInProgress() {
  return (
    <div className="view anim">
      <Card title="AI features are being worked on">
        <p>
          AI tools and provider settings are temporarily locked while we finish verifying model
          requests and the read-only database connection.
        </p>
        <p className="hint" style={{ marginTop: 12 }}>
          Existing CSAG settings have not been changed. Other console features remain available.
        </p>
      </Card>
    </div>
  );
}
