import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PluginIcon } from "@/components/plugin-icon";
import { StatusBadge } from "@/components/status-badge";
import { PluginWorkspace } from "@/components/workspaces/plugin-workspace";
import { findPublicPlugin, loadPublicCatalog } from "@/lib/catalog";

export function generateStaticParams() {
  return loadPublicCatalog().map((plugin) => ({ slug: plugin.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const plugin = findPublicPlugin(slug);
  if (!plugin) return {};
  return { title: plugin.name.zhCN, description: plugin.summary.zhCN };
}

export default async function PluginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const plugin = findPublicPlugin(slug);
  if (!plugin) notFound();
  const publicCount = loadPublicCatalog().length;

  return (
    <AppShell publicCount={publicCount}>
      <main className="page-container">
        <header className="plugin-page-header">
          <div>
            <Link href="/" className="breadcrumb"><ArrowLeft size={12} />返回插件目录</Link>
            <div className="plugin-title-row">
              <span className="plugin-icon"><PluginIcon slug={plugin.slug} size={24} /></span>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}><Sparkles size={11} />{plugin.name.original}</div>
                <h1>{plugin.name.zhCN}</h1>
              </div>
            </div>
            <p>{plugin.description.zhCN}</p>
            <div className="tag-row" style={{ marginTop: 14 }}>
              <StatusBadge status={plugin.lifecycle.status} />
              {plugin.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
            </div>
          </div>
          <div className="header-score"><strong>{plugin.quality.score}</strong><span>质量评分 / 100</span></div>
        </header>

        <div className="workspace-layout">
          <PluginWorkspace component={plugin.web.component} />

          <aside className="info-stack">
            <section className="info-card">
              <h3><PackageCheck size={13} />运行与版本</h3>
              <div className="info-list">
                <div className="info-row"><span>上游版本</span><strong>{plugin.version.value}</strong></div>
                <div className="info-row"><span>运行协议</span><strong>{plugin.runtime.transport.toUpperCase()}</strong></div>
                <div className="info-row"><span>许可证</span><strong>{plugin.license.spdx}</strong></div>
                <div className="info-row"><span>测试状态</span><strong>{plugin.verification.overall}</strong></div>
              </div>
            </section>

            <section className="info-card">
              <h3><ShieldCheck size={13} />能力与风险</h3>
              <div className="capability-list">
                {plugin.capabilities.map((capability) => <div className="capability-item" key={capability.id}><strong>{capability.name.zhCN}</strong><p>{capability.description.zhCN}</p></div>)}
              </div>
            </section>

            <section className="info-card">
              <h3><ExternalLink size={13} />来源证据</h3>
              <div className="info-list">
                <div className="info-row"><span>作者</span><strong>{plugin.author.name}</strong></div>
                <div className="info-row"><span>证据条数</span><strong>{plugin.source.evidence.length}</strong></div>
                <div className="info-row"><span>翻译状态</span><strong>{plugin.translation.status}</strong></div>
              </div>
              <a className="source-link" href={plugin.source.primaryUrl} target="_blank" rel="noreferrer">查看官方来源 <ExternalLink size={11} /></a>
            </section>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

