"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, PackageCheck, Search } from "lucide-react";
import type { PluginManifest } from "@/lib/catalog/schema";
import { PluginIcon } from "./plugin-icon";
import { StatusBadge } from "./status-badge";

export function CatalogExplorer({ plugins }: { plugins: PluginManifest[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(
    () => [...new Set(plugins.flatMap((plugin) => plugin.categories))].sort(),
    [plugins],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      const matchesCategory = category === "all" || plugin.categories.includes(category);
      const haystack = [
        plugin.name.zhCN,
        plugin.name.original,
        plugin.summary.zhCN,
        plugin.summary.original,
        ...plugin.tags,
      ].join(" ").toLowerCase();
      return matchesCategory && (!normalized || haystack.includes(normalized));
    });
  }, [category, plugins, query]);

  return (
    <section aria-label="插件目录">
      <div className="catalog-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索能力、插件或使用场景…"
            aria-label="搜索插件"
          />
        </label>
        <select className="filter-select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="按分类筛选">
          <option value="all">全部分类</option>
          {categories.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </div>

      <div className="catalog-meta">
        <span>{filtered.length} 个符合质量门槛的 Web 适配</span>
        <span>按质量评分展示</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-catalog"><PackageCheck size={28} /><p>没有匹配的公开适配。只有达到 Web-ready 或 verified 的项目会出现。</p></div>
      ) : (
        <div className="plugin-grid">
          {[...filtered].sort((a, b) => b.quality.score - a.quality.score).map((plugin) => (
            <article className="plugin-card" key={plugin.id}>
              <div className="plugin-card-top">
                <span className="plugin-icon"><PluginIcon slug={plugin.slug} /></span>
                <div className="quality-score"><strong>{plugin.quality.score}</strong>/100</div>
              </div>
              <h2>{plugin.name.zhCN}</h2>
              <div className="plugin-original-name">{plugin.name.original}</div>
              <p className="plugin-summary">{plugin.summary.zhCN}</p>
              <div className="tag-row">
                {plugin.tags.slice(0, 4).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              <div className="plugin-card-footer">
                <div className="plugin-meta-small">
                  <StatusBadge status={plugin.lifecycle.status} />
                  <span>v{plugin.version.value}</span>
                </div>
                <Link className="card-link" href={`/plugins/${plugin.slug}`}>打开 Web <ArrowRight size={12} /></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

