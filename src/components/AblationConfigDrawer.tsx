import React, { useState, useEffect } from "react";
import { X, Sliders, CheckCircle2, ShieldAlert, Zap, Layers, Network } from "lucide-react";
import { ConfigState } from "../types";

interface AblationConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: ConfigState | null;
  onUpdateConfig: (newConfig: Partial<ConfigState>) => Promise<void>;
}

export const AblationConfigDrawer: React.FC<AblationConfigDrawerProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
}) => {
  const [localConfig, setLocalConfig] = useState<ConfigState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setLocalConfig({ ...config });
    }
  }, [config]);

  if (!isOpen || !localConfig) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateConfig(localConfig);
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
      <div className="w-96 bg-slate-900 border-l border-slate-800 h-full flex flex-col p-6 shadow-2xl overflow-y-auto text-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              Ablation & Hyperparameters
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 py-6 flex-1 text-xs">
          {/* Ablation Toggles */}
          <div className="space-y-4">
            <h3 className="font-semibold text-indigo-300 uppercase tracking-wider text-[11px]">
              Publication Ablation Flags
            </h3>

            {/* Tarjan Compression */}
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-purple-400" />
                  <span className="font-medium text-white">Tarjan SCC Compression</span>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.ENABLE_TARJAN_COMPRESSION}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      ENABLE_TARJAN_COMPRESSION: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Collapses cyclical strongly connected components into supernodes while preserving
                articulation connectors. Reduces graph search radius and token bloat.
              </p>
            </div>

            {/* Bridge-Aware Pruning */}
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span className="font-medium text-white">Bridge-Aware Pruning</span>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.ENABLE_BRIDGE_AWARE_PRUNING}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      ENABLE_BRIDGE_AWARE_PRUNING: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Guarantees nodes bridging isolated clusters are never pruned, preventing
                topological disconnects during retrieval pruning.
              </p>
            </div>

            {/* Budget-Aware Traversal */}
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="font-medium text-white">Budget-Aware Traversal</span>
                </div>
                <input
                  type="checkbox"
                  checked={localConfig.ENABLE_BUDGET_AWARE_TRAVERSAL}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      ENABLE_BUDGET_AWARE_TRAVERSAL: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Dynamically allocates LLM calls across high-information communities rather than
                exhausting fixed depth quotas.
              </p>
            </div>
          </div>

          {/* Hyperparameter Sliders */}
          <div className="space-y-4 pt-2">
            <h3 className="font-semibold text-indigo-300 uppercase tracking-wider text-[11px]">
              Algorithmic Thresholds
            </h3>

            {/* Total LLM Budget */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Total LLM Call Budget:</span>
                <span className="font-mono text-indigo-300 font-bold">
                  {localConfig.TOTAL_LLM_BUDGET} calls
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={30}
                value={localConfig.TOTAL_LLM_BUDGET}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    TOTAL_LLM_BUDGET: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Relevance Threshold */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Relevance Pruning Cutoff:</span>
                <span className="font-mono text-indigo-300 font-bold">
                  {localConfig.RELEVANCE_THRESHOLD} / 100
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={90}
                value={localConfig.RELEVANCE_THRESHOLD}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    RELEVANCE_THRESHOLD: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Max Community Depth */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Max Hierarchy Depth:</span>
                <span className="font-mono text-indigo-300 font-bold">
                  Level {localConfig.MAX_COMMUNITY_DEPTH}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={4}
                value={localConfig.MAX_COMMUNITY_DEPTH}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    MAX_COMMUNITY_DEPTH: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Footer Save */}
        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-xs transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? "Updating..." : "Save & Apply Ablation Switches"}
          </button>
        </div>
      </div>
    </div>
  );
};
