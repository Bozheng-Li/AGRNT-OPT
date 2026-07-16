import path from "node:path";
import { describe, expect, it } from "vitest";
import { InvocationValidationError } from "../src/lib/runtime/errors";
import { resolveSandboxPath } from "../src/lib/runtime/sandbox";

describe("filesystem sandbox", () => {
  const root = path.resolve("var", "tests", "sandbox");

  it("resolves a relative path inside the sandbox", () => {
    expect(resolveSandboxPath(root, "notes/demo.txt")).toBe(path.join(root, "notes", "demo.txt"));
  });

  it.each(["../outside.txt", "..\\outside.txt", "C:\\Windows\\win.ini", "/etc/passwd"])(
    "rejects a path outside the sandbox: %s",
    (candidate) => {
      expect(() => resolveSandboxPath(root, candidate)).toThrow(InvocationValidationError);
    },
  );
});

