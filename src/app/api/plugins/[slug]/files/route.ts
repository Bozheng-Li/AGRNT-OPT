import { NextResponse } from "next/server";
import { z } from "zod";
import { findPublicPlugin } from "@/lib/catalog";
import { InvocationValidationError } from "@/lib/runtime/errors";
import {
  listOxidizePdfs,
  OXIDIZE_UPLOAD_LIMIT,
  readOxidizePdf,
  uploadOxidizePdf,
} from "@/lib/runtime/oxidize-files";
import {
  listMarkitdownFiles,
  MARKITDOWN_UPLOAD_LIMIT,
  uploadMarkitdownFile,
} from "@/lib/runtime/markitdown-files";
import {
  AUDIO_FILE_UPLOAD_LIMIT,
  listAudioFiles,
  uploadAudioFile,
} from "@/lib/runtime/audio-file-files";
import {
  listSafeDocxFiles,
  SAFE_DOCX_UPLOAD_LIMIT,
  uploadSafeDocxFile,
} from "@/lib/runtime/safe-docx-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  data: z
    .string()
    .min(1)
    .max(
      Math.ceil(
        (Math.max(OXIDIZE_UPLOAD_LIMIT, MARKITDOWN_UPLOAD_LIMIT, AUDIO_FILE_UPLOAD_LIMIT, SAFE_DOCX_UPLOAD_LIMIT) * 4) /
          3,
      ) + 1_024,
    ),
});

function supportsFiles(slug: string): boolean {
  return (
    ["oxidize-pdf-workbench", "markitdown-document-studio", "audio-file-inspector", "safe-docx-studio"].includes(slug) &&
    Boolean(findPublicPlugin(slug))
  );
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!supportsFiles(slug)) return NextResponse.json({ error: "插件不存在或未开放文件工作区。" }, { status: 404 });

  try {
    if (slug === "markitdown-document-studio") {
      return NextResponse.json({ files: await listMarkitdownFiles() });
    }
    if (slug === "audio-file-inspector") {
      return NextResponse.json({ files: await listAudioFiles() });
    }
    if (slug === "safe-docx-studio") {
      return NextResponse.json({ files: await listSafeDocxFiles() });
    }
    const requestedPath = new URL(request.url).searchParams.get("path");
    if (!requestedPath) return NextResponse.json({ files: await listOxidizePdfs() });
    const file = await readOxidizePdf(requestedPath);
    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(file.body.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 文件读取失败。";
    return NextResponse.json({ error: message }, { status: error instanceof InvocationValidationError ? 400 : 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!supportsFiles(slug)) return NextResponse.json({ error: "插件不存在或未开放文件工作区。" }, { status: 404 });

  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "上传请求超过 12 MiB。" }, { status: 413 });
    }
    const payload = uploadSchema.parse(await request.json());
    if (slug === "markitdown-document-studio") {
      return NextResponse.json({ file: await uploadMarkitdownFile(payload.name, payload.data) });
    }
    if (slug === "audio-file-inspector") {
      return NextResponse.json({ file: await uploadAudioFile(payload.name, payload.data) });
    }
    if (slug === "safe-docx-studio") {
      return NextResponse.json({ file: await uploadSafeDocxFile(payload.name, payload.data) });
    }
    return NextResponse.json({ file: await uploadOxidizePdf(payload.name, payload.data) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((issue) => issue.message).join("；") }, { status: 400 });
    }
    const message =
      error instanceof Error
        ? error.message
        : slug === "markitdown-document-studio" || slug === "safe-docx-studio"
          ? "文档上传失败。"
          : "PDF 上传失败。";
    return NextResponse.json({ error: message }, { status: error instanceof InvocationValidationError ? 400 : 500 });
  }
}
