import path from "node:path";
import { InvocationValidationError } from "./errors";

export function resolveSandboxPath(root: string, requestedPath: string): string {
  if (!requestedPath || requestedPath.includes("\0")) {
    throw new InvocationValidationError("路径不能为空或包含空字符。");
  }

  if (path.isAbsolute(requestedPath) || /^[a-zA-Z]:/.test(requestedPath)) {
    throw new InvocationValidationError("只允许使用插件沙箱内的相对路径。");
  }

  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, requestedPath);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvocationValidationError("路径超出了插件沙箱范围。");
  }

  return resolvedPath;
}

