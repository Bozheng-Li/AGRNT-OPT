import { Activity, Globe2, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CatalogExplorer } from "@/components/catalog-explorer";
import { loadPublicCatalog } from "@/lib/catalog";

export default function HomePage() {
  const plugins = loadPublicCatalog();
  const verified = plugins.filter((plugin) => plugin.lifecycle.status === "verified").length;
  const sourceCount = new Set(plugins.flatMap((plugin) => plugin.source.marketplaces.map((item) => item.sourceId))).size;

  return (
    <AppShell publicCount={plugins.length}>
      <main className="page-container">
        <section className="hero">
          <div>
            <div className="eyebrow"><Sparkles size={13} />Quality-first Agent Ecosystem</div>
            <h1>把真正有用的 Agent 能力，做成<span>真正好用的 Web。</span></h1>
            <p className="hero-description">
              聚合不是堆链接。这里的每个正式项目都保留原始证据与中文说明，经过质量和安全筛选，并拥有与能力匹配的独立 Web 工作流。
            </p>
          </div>
          <div className="hero-metrics" aria-label="平台指标">
            <div className="metric-card"><strong>{plugins.length}</strong><span>公开 Web 适配</span></div>
            <div className="metric-card"><strong>{verified}</strong><span>真实验证通过</span></div>
            <div className="metric-card"><strong>{sourceCount}</strong><span>权威来源</span></div>
            <div className="metric-card"><strong>100%</strong><span>来源可追溯</span></div>
          </div>
        </section>

        <CatalogExplorer plugins={plugins} />

        <section id="quality" style={{ marginTop: 38 }} className="plugin-grid" aria-label="质量原则">
          <article className="plugin-card"><span className="plugin-icon"><ShieldCheck size={20} /></span><h2>质量优先</h2><p className="plugin-summary">来源、许可证、能力、安全和实用性都要有证据；不靠市场热度或营销文案充数。</p></article>
          <article className="plugin-card"><span className="plugin-icon"><Activity size={20} /></span><h2>真实测试</h2><p className="plugin-summary">核心、场景、错误和浏览器端到端测试分别记录；外部条件不足时明确标记阻塞。</p></article>
          <article id="sources" className="plugin-card"><span className="plugin-icon"><Globe2 size={20} /></span><h2>持续发现</h2><p className="plugin-summary">优先同步官方结构化接口，再核验仓库、包、许可证和多市场交叉信息，持续增量扩张。</p></article>
        </section>
      </main>
    </AppShell>
  );
}

