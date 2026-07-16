import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Agent-OPT · 精品 Agent 插件聚合",
    template: "%s · Agent-OPT",
  },
  description: "经过来源核验、中文翻译、独立 Web 适配和真实测试的 Agent 技能、插件与 MCP 服务。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

