import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { InvocationValidationError } from "./errors";
import { resolveSandboxPath } from "./sandbox";

export const SAFE_DOCX_UPLOAD_LIMIT = 8 * 1024 * 1024;
export const SAFE_DOCX_OUTPUT_LIMIT = 8 * 1024 * 1024;

const supportedExtensions = new Set([".docx", ".odt"]);

export type SafeDocxFile = {
  path: string;
  name: string;
  bytes: number;
  extension: string;
  modifiedAt: string;
};

function portable(value: string): string {
  return value.split(path.sep).join("/");
}

export function defaultSafeDocxRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "var", "runtime", "safe-docx");
}

export async function ensureSafeDocxSandbox(
  root: string = defaultSafeDocxRoot(),
): Promise<{ root: string; uploads: string; outputs: string; temporary: string; home: string }> {
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  const uploads = path.join(resolved, "uploads");
  const outputs = path.join(resolved, "outputs");
  const temporary = path.join(resolved, "tmp");
  const home = path.join(resolved, "home");
  await Promise.all([
    mkdir(uploads, { recursive: true }),
    mkdir(outputs, { recursive: true }),
    mkdir(temporary, { recursive: true }),
    mkdir(home, { recursive: true }),
  ]);
  for (const target of [resolved, uploads, outputs, temporary, home]) {
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new InvocationValidationError("Safe DOCX 工作区不能是符号链接。");
  }
  return { root: resolved, uploads, outputs, temporary, home };
}

function decodeBase64(encoded: string): Buffer {
  const payload = encoded.includes(",") ? encoded.slice(encoded.indexOf(",") + 1) : encoded;
  if (!payload || !/^[A-Za-z0-9+/=\r\n]+$/.test(payload)) {
    throw new InvocationValidationError("文件 base64 数据格式无效。");
  }
  const body = Buffer.from(payload, "base64");
  if (body.length === 0 || body.length > SAFE_DOCX_UPLOAD_LIMIT) {
    throw new InvocationValidationError("文件必须大于 0 字节且不超过 8 MiB。");
  }
  return body;
}

function validateOfficeZip(body: Buffer, extension: string): void {
  if (body.length < 22 || body.readUInt32LE(0) !== 0x04034b50) {
    throw new InvocationValidationError(`${extension} 文件不是有效的 ZIP/OOXML 容器。`);
  }

  const searchStart = Math.max(0, body.length - 65_557);
  let eocd = -1;
  for (let index = body.length - 22; index >= searchStart; index -= 1) {
    if (body.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new InvocationValidationError("文档缺少 ZIP 中央目录。");

  const entries = body.readUInt16LE(eocd + 10);
  const centralSize = body.readUInt32LE(eocd + 12);
  const centralOffset = body.readUInt32LE(eocd + 16);
  if (entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new InvocationValidationError("不接受 ZIP64 文档。");
  }
  if (entries === 0 || entries > 2_000 || centralOffset + centralSize > eocd) {
    throw new InvocationValidationError("文档中央目录超出安全限制。");
  }

  let cursor = centralOffset;
  let expandedBytes = 0;
  const names = new Set<string>();
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > body.length || body.readUInt32LE(cursor) !== 0x02014b50) {
      throw new InvocationValidationError("文档中央目录已损坏。");
    }
    const flags = body.readUInt16LE(cursor + 8);
    const compressed = body.readUInt32LE(cursor + 20);
    const expanded = body.readUInt32LE(cursor + 24);
    const nameLength = body.readUInt16LE(cursor + 28);
    const extraLength = body.readUInt16LE(cursor + 30);
    const commentLength = body.readUInt16LE(cursor + 32);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > body.length) throw new InvocationValidationError("文档条目超出容器边界。");
    const name = body.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replace(/\\/g, "/");
    if (!name || name.startsWith("/") || name.split("/").some((segment) => segment === "..")) {
      throw new InvocationValidationError("文档包含不安全的内部路径。");
    }
    if ((flags & 0x1) !== 0) throw new InvocationValidationError("不接受加密的文档。");
    if (expanded > 32 * 1024 * 1024 || (compressed === 0 ? expanded > 0 : expanded / compressed > 200)) {
      throw new InvocationValidationError("文档包含疑似压缩炸弹条目。");
    }
    expandedBytes += expanded;
    if (expandedBytes > 64 * 1024 * 1024) throw new InvocationValidationError("文档解压后超过 64 MiB 安全上限。");
    names.add(name);
    cursor = end;
  }

  if (extension === ".docx") {
    if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
      throw new InvocationValidationError("文件内容与 .docx 扩展名不匹配。");
    }
  } else if (extension === ".odt") {
    if (!names.has("content.xml") && !names.has("mimetype")) {
      throw new InvocationValidationError("文件内容与 .odt 扩展名不匹配。");
    }
  }
}

function validatePayload(name: string, body: Buffer): string {
  const extension = path.extname(name).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new InvocationValidationError("仅支持 .docx 与 .odt 文档。");
  }
  validateOfficeZip(body, extension);
  return extension;
}

export async function uploadSafeDocxFile(
  name: string,
  encoded: string,
  root: string = defaultSafeDocxRoot(),
): Promise<SafeDocxFile> {
  const body = decodeBase64(encoded);
  const extension = validatePayload(name, body);
  const sandbox = await ensureSafeDocxSandbox(root);
  const stem =
    path
      .basename(name, path.extname(name))
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .slice(0, 80) || "document";
  const filename = `${randomUUID()}-${stem}${extension}`;
  const target = path.join(sandbox.uploads, filename);
  await writeFile(target, body, { flag: "wx" });
  const info = await stat(target);
  return {
    path: portable(path.relative(sandbox.root, target)),
    name: filename,
    bytes: info.size,
    extension,
    modifiedAt: info.mtime.toISOString(),
  };
}

export async function resolveSafeDocxAbsolutePath(
  relativePath: string,
  root: string = defaultSafeDocxRoot(),
  options: { mustExist?: boolean; forWrite?: boolean } = {},
): Promise<string> {
  const sandbox = await ensureSafeDocxSandbox(root);
  const mustExist = options.mustExist ?? true;
  const lexical = resolveSandboxPath(sandbox.root, relativePath);
  const relative = path.relative(sandbox.root, lexical);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvocationValidationError("文档路径必须位于 Safe DOCX 工作区内。");
  }
  if (options.forWrite) {
    const parent = path.dirname(lexical);
    let parentActual: string;
    try {
      parentActual = await realpath(parent);
    } catch {
      throw new InvocationValidationError("输出目录不存在。");
    }
    const parentRelative = path.relative(await realpath(sandbox.root), parentActual);
    if (parentRelative.startsWith("..") || path.isAbsolute(parentRelative)) {
      throw new InvocationValidationError("输出路径超出 Safe DOCX 工作区。");
    }
    return lexical;
  }

  let actual: string;
  try {
    actual = await realpath(lexical);
  } catch {
    if (!mustExist) return lexical;
    throw new InvocationValidationError("文档不存在。");
  }
  const actualRoot = await realpath(sandbox.root);
  const actualRelative = path.relative(actualRoot, actual);
  if (!actualRelative || actualRelative.startsWith("..") || path.isAbsolute(actualRelative)) {
    throw new InvocationValidationError("文档超出 Safe DOCX 工作区。");
  }
  const info = await stat(actual);
  if (!info.isFile() || info.size <= 0 || info.size > SAFE_DOCX_UPLOAD_LIMIT) {
    throw new InvocationValidationError("文档不是受支持大小的普通文件。");
  }
  const body = await readFile(actual);
  validatePayload(actual, body);
  return actual;
}

export async function listSafeDocxFiles(root: string = defaultSafeDocxRoot()): Promise<SafeDocxFile[]> {
  const sandbox = await ensureSafeDocxSandbox(root);
  const files: SafeDocxFile[] = [];
  for (const directory of [sandbox.uploads, sandbox.outputs]) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      const info = await lstat(target);
      const extension = path.extname(entry.name).toLowerCase();
      if (!supportedExtensions.has(extension) || info.size > SAFE_DOCX_UPLOAD_LIMIT) continue;
      files.push({
        path: portable(path.relative(sandbox.root, target)),
        name: entry.name,
        bytes: info.size,
        extension,
        modifiedAt: info.mtime.toISOString(),
      });
    }
  }
  return files.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)).slice(0, 100);
}

export function toSandboxRelativePath(absolutePath: string, root: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(absolutePath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvocationValidationError("上游返回了工作区外路径。");
  }
  return portable(relative);
}
