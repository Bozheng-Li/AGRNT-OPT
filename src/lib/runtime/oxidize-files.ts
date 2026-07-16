import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultOxidizeRoot, ensureOxidizeSandbox, type AdapterContext } from "./adapters";
import { InvocationValidationError } from "./errors";
import { resolveSandboxPath } from "./sandbox";

export const OXIDIZE_UPLOAD_LIMIT = 8 * 1024 * 1024;

export type OxidizePdfFile = {
  path: string;
  name: string;
  bytes: number;
  modifiedAt: string;
};

function portable(relative: string): string {
  return relative.split(path.sep).join("/");
}

async function containedExistingFile(workspace: string, relativePath: string): Promise<string> {
  if (path.extname(relativePath).toLowerCase() !== ".pdf") {
    throw new InvocationValidationError("只允许访问 PDF 文件。");
  }
  const lexical = resolveSandboxPath(workspace, relativePath);
  let actual: string;
  try {
    actual = await realpath(lexical);
  } catch {
    throw new InvocationValidationError("PDF 文件不存在。");
  }
  const actualWorkspace = await realpath(workspace);
  const relative = path.relative(actualWorkspace, actual);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvocationValidationError("PDF 文件超出 oxidize-pdf 工作区。");
  }
  const info = await stat(actual);
  if (!info.isFile()) throw new InvocationValidationError("请求路径不是 PDF 文件。");
  if (info.size > 16 * 1024 * 1024) throw new InvocationValidationError("PDF 文件超过 16 MiB 下载上限。");
  return actual;
}

export async function uploadOxidizePdf(
  name: string,
  encoded: string,
  context: AdapterContext = {},
): Promise<OxidizePdfFile> {
  if (path.extname(name).toLowerCase() !== ".pdf") {
    throw new InvocationValidationError("上传文件必须以 .pdf 结尾。");
  }
  const payload = encoded.includes(",") ? encoded.slice(encoded.indexOf(",") + 1) : encoded;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(payload)) {
    throw new InvocationValidationError("PDF base64 数据格式无效。");
  }
  const body = Buffer.from(payload, "base64");
  if (body.length === 0 || body.length > OXIDIZE_UPLOAD_LIMIT) {
    throw new InvocationValidationError("PDF 文件必须大于 0 字节且不超过 8 MiB。");
  }
  if (body.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new InvocationValidationError("文件头不是有效的 PDF 签名。");
  }

  const sandbox = await ensureOxidizeSandbox(context.oxidizeRoot ?? defaultOxidizeRoot());
  const uploadRoot = path.join(sandbox.workspace, "uploads");
  await mkdir(uploadRoot, { recursive: true });
  const stem = path.basename(name, path.extname(name)).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "document";
  const filename = `${randomUUID()}-${stem}.pdf`;
  const target = path.join(uploadRoot, filename);
  await writeFile(target, body, { flag: "wx" });
  const info = await stat(target);
  return {
    path: portable(path.relative(sandbox.workspace, target)),
    name: filename,
    bytes: info.size,
    modifiedAt: info.mtime.toISOString(),
  };
}

export async function readOxidizePdf(
  relativePath: string,
  context: AdapterContext = {},
): Promise<{ body: Buffer; filename: string }> {
  const sandbox = await ensureOxidizeSandbox(context.oxidizeRoot ?? defaultOxidizeRoot());
  const actual = await containedExistingFile(sandbox.workspace, relativePath);
  return { body: await readFile(actual), filename: path.basename(actual) };
}

export async function listOxidizePdfs(context: AdapterContext = {}): Promise<OxidizePdfFile[]> {
  const sandbox = await ensureOxidizeSandbox(context.oxidizeRoot ?? defaultOxidizeRoot());
  const files: OxidizePdfFile[] = [];

  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > 4 || files.length >= 200) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= 200) return;
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await visit(target, depth + 1);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".pdf") {
        const fileStat = await lstat(target);
        files.push({
          path: portable(path.relative(sandbox.workspace, target)),
          name: entry.name,
          bytes: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
        });
      }
    }
  }

  await visit(sandbox.workspace, 0);
  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
