import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}));

import { resolveGeneratedImageArtifact } from "./generatedImageArtifacts";

describe("generatedImageArtifacts", () => {
  it("keeps a single preview when one payload contains both saved_path and base64 result", () => {
    const artifact = resolveGeneratedImageArtifact(
      "generating",
      {
        revised_prompt: "一位成年女性的人像写真",
      },
      {
        type: "image_generation_end",
        saved_path: "/Users/demo/.codex/generated_images/ig_demo.png",
        result: "QUJD".repeat(32),
      },
    );

    expect(artifact.status).toBe("completed");
    expect(artifact.images).toHaveLength(1);
    expect(artifact.images[0]?.src).toMatch(/^data:image\/png;base64,/);
  });

  it("decodes percent-encoded file urls before building local previews", () => {
    const artifact = resolveGeneratedImageArtifact(
      "completed",
      {
        prompt: "A workspace screenshot",
      },
      {
        saved_path:
          "file:///Users/demo/Codex%20Images/generated%20image.png?download=1",
      },
    );

    expect(artifact.status).toBe("completed");
    expect(artifact.images).toHaveLength(1);
    expect(artifact.images[0]?.src).toBe(
      "asset://localhost/Users/demo/Codex Images/generated image.png",
    );
    expect(artifact.images[0]?.localPath).toBe(
      "/Users/demo/Codex Images/generated image.png",
    );
  });

  it("decodes percent-encoded windows file urls before building local previews", () => {
    const artifact = resolveGeneratedImageArtifact(
      "completed",
      {
        prompt: "A workspace screenshot",
      },
      {
        saved_path:
          "file:///C:/Users/demo/Codex%20Images/generated%20image.png",
      },
    );

    expect(artifact.status).toBe("completed");
    expect(artifact.images).toHaveLength(1);
    expect(artifact.images[0]?.src).toBe(
      "asset://localhostC:/Users/demo/Codex Images/generated image.png",
    );
    expect(artifact.images[0]?.localPath).toBe(
      "C:/Users/demo/Codex Images/generated image.png",
    );
  });
});
