import { CheckCircle2, PanelsTopLeft } from "lucide-react";
import type { LifecycleStatus } from "@/lib/catalog/schema";

const labels: Partial<Record<LifecycleStatus, string>> = {
  verified: "已真实验证",
  "web-ready": "Web 已适配",
};

export function StatusBadge({ status }: { status: LifecycleStatus }) {
  const Icon = status === "verified" ? CheckCircle2 : PanelsTopLeft;
  return <span className={`badge ${status}`}><Icon size={10} />{labels[status] ?? status}</span>;
}

