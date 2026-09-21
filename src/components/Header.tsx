import React from "react";
import { GitGraph, Activity, Sliders, Database, FileText, CheckCircle2, Award } from "lucide-react";
import { ConfigState } from "../types";

interface HeaderProps {
  activeTab: "graphrag" | "benchmark" | "compression_qa";
  setActiveTab: (tab: "graphrag" | "benchmark" | "compression_qa") => void;
  config: ConfigState | null;
  onOpenConfig: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  config,
  onOpenConfig,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 text-white">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <GitGraph className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">GraphRAG Publication Engine</h1>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Tarjan & Community RAG
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Iterative SCC Quotient Graphs &bull; Bridge-Aware Pruning &bull; Dynamic Budgeting
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
        <button
          onClick={() => setActiveTab("graphrag")}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
            activeTab === "graphrag"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
          }`}
        >
          <GitGraph className="w-3.5 h-3.5" />
          Interactive Explorer
        </button>
        <button
          onClick={() => setActiveTab("compression_qa")}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
            activeTab === "compression_qa"
              ? "bg-emerald-500 text-slate-950 shadow-sm"
              : "text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50"
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          Compression QA Trainer
        </button>
        <button
          onClick={() => setActiveTab("benchmark")}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
            activeTab === "benchmark"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Benchmark & Ablations (50 Qs)
        </button>
      </div>

      <div className="flex items-center gap-3">
        {config && (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <span className={`inline-block w-2 h-2 rounded-full ${config.ENABLE_TARJAN_COMPRESSION ? "bg-emerald-400" : "bg-slate-500"}`} />
            <span>Tarjan: {config.ENABLE_TARJAN_COMPRESSION ? "ON" : "OFF"}</span>
            <span className="text-slate-600">&bull;</span>
            <span className={`inline-block w-2 h-2 rounded-full ${config.ENABLE_BRIDGE_AWARE_PRUNING ? "bg-emerald-400" : "bg-slate-500"}`} />
            <span>Bridges: {config.ENABLE_BRIDGE_AWARE_PRUNING ? "ON" : "OFF"}</span>
            <span className="text-slate-600">&bull;</span>
            <span className={`inline-block w-2 h-2 rounded-full ${config.ENABLE_BUDGET_AWARE_TRAVERSAL ? "bg-emerald-400" : "bg-slate-500"}`} />
            <span>Budget: {config.ENABLE_BUDGET_AWARE_TRAVERSAL ? "ON" : "OFF"}</span>
          </div>
        )}

        <button
          onClick={onOpenConfig}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
          title="Ablation Toggles and Hyperparameters"
        >
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          <span>Ablation Settings</span>
        </button>
      </div>
    </header>
  );
};
