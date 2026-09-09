import { describe, expect, it } from "vitest";
import { isMalformedRequestTarget } from "./requestTarget";

describe("isMalformedRequestTarget", () => {
  it("rejects unresolved Vite placeholders and truncated percent encoding", () => {
    expect(isMalformedRequestTarget("/%VITE_APP_TITLE%/asset.svg")).toBe(true);
    expect(isMalformedRequestTarget("/%E0%A4%A")).toBe(true);
  });

  it("allows valid encoded paths", () => {
    expect(isMalformedRequestTarget("/studio-rental?date=2026-09-09")).toBe(false);
    expect(isMalformedRequestTarget("/files/My%20Studio.pdf")).toBe(false);
  });
});
