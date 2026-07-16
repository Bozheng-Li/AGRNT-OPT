import Link from "next/link";
import { Blocks, BookOpen, Database, Gauge, ShieldCheck } from "lucide-react";

export function AppShell({ children, publicCount }: { children: React.ReactNode; publicCount: number }) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Agent-OPT 首页">
          <span className="brand-mark"><Blocks size={18} /></span>
          <span className="brand-copy"><strong>Agent-OPT</strong><span>精品能力聚合</span></span>
        </Link>

        <div>
          <div className="sidebar-section-title">工作区</div>
          <nav className="sidebar-nav" aria-label="主导航">
            <Link className="sidebar-link active" href="/"><Gauge size={15} />插件目录</Link>
            <Link className="sidebar-link" href="/#sources"><Database size={15} />来源与证据</Link>
            <Link className="sidebar-link" href="/#quality"><ShieldCheck size={15} />质量门槛</Link>
            <Link className="sidebar-link" href="https://github.com/modelcontextprotocol/registry"><BookOpen size={15} />上游生态</Link>
          </nav>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-row"><span>公开适配</span><strong>{publicCount}</strong></div>
          <div className="sidebar-progress"><span /></div>
          <p>只有完成专属 Web 适配的项目才会在这里出现；验证状态单独展示。</p>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-context">来源可追溯 · 中文本地化 · 独立 Web 适配 · 真实验证</div>
          <div className="topbar-actions">
            <span className="connection-pill"><span className="connection-dot" />MCP Runtime Ready</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

