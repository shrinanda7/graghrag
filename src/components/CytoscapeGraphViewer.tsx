import React, { useEffect, useRef, useState } from "react";
import cytoscape, { Core, EventObject } from "cytoscape";
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Pause,
  RotateCcw,
  ShieldAlert,
  Info,
  ChevronRight
} from "lucide-react";
import { GraphTopology, TraversalStep, TraversalTrace, GraphNode } from "../types";

interface CytoscapeGraphViewerProps {
  originalGraph: GraphTopology | null;
  compressedGraph: GraphTopology | null;
  trace: TraversalTrace | null;
  selectedPaperTitle: string;
}

export const CytoscapeGraphViewer: React.FC<CytoscapeGraphViewerProps> = ({
  originalGraph,
  compressedGraph,
  trace,
  selectedPaperTitle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const [graphMode, setGraphMode] = useState<"compressed" | "original">("compressed");
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
  const [expandedSupernodeId, setExpandedSupernodeId] = useState<string | null>(null);

  const activeGraph = graphMode === "compressed" ? compressedGraph : originalGraph;
  const steps: TraversalStep[] = trace?.steps || [];

  // Initialize or update Cytoscape
  useEffect(() => {
    if (!containerRef.current || !activeGraph || !activeGraph.nodes.length) return;

    // Destroy existing instance safely
    if (cyRef.current) {
      try {
        if (!cyRef.current.destroyed()) {
          cyRef.current.stop();
          cyRef.current.destroy();
        }
      } catch (e) {
        // ignore
      }
      cyRef.current = null;
    }

    const articulationPoints = new Set(compressedGraph?.articulation_points || []);
    const bridgeEdgeKeys = new Set(
      (compressedGraph?.bridges || []).map(([u, v]) => `${u}->${v}`)
    );

    // Build elements
    const elements: any[] = [];

    // Nodes
    activeGraph.nodes.forEach((n) => {
      const isAP = articulationPoints.has(n.id) || n.is_connector;
      const isSuper = n.is_supernode;
      const memberCount = n.member_count || (n.member_node_ids?.length || 1);

      elements.push({
        data: {
          id: n.id,
          label: n.name,
          type: n.type,
          description: n.description || "",
          isSupernode: isSuper,
          isConnector: isAP,
          memberCount: memberCount,
          memberNodes: n.member_nodes || [],
          originalColor: isSuper ? "#8b5cf6" : isAP ? "#10b981" : "#3b82f6",
        },
      });
    });

    // Edges
    activeGraph.edges.forEach((e, idx) => {
      const isBridge =
        e.is_bridge ||
        bridgeEdgeKeys.has(`${e.source}->${e.target}`) ||
        bridgeEdgeKeys.has(`${e.target}->${e.source}`);

      elements.push({
        data: {
          id: `edge_${e.source}_${e.target}_${idx}`,
          source: e.source,
          target: e.target,
          type: e.type,
          isBridge: isBridge,
          weight: e.weight || 1,
        },
      });
    });

    // Stylesheet
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      boxSelectionEnabled: false,
      autounselectify: false,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(originalColor)",
            label: "data(label)",
            color: "#f8fafc",
            "font-size": "10px",
            "font-family": "system-ui, -apple-system, sans-serif",
            "text-valign": "bottom",
            "text-margin-y": 5,
            width: "mapData(memberCount, 1, 15, 26, 52)",
            height: "mapData(memberCount, 1, 15, 26, 52)",
            "border-width": 2,
            "border-color": "#475569",
            "transition-property": "background-color, border-color, border-width, width, height",
            "transition-duration": 0.25,
          },
        },
        {
          selector: "node[?isConnector]",
          style: {
            "border-width": 4,
            "border-color": "#10b981", // Emerald highlight for articulation points
            "border-style": "double",
          },
        },
        {
          selector: "node[?isSupernode]",
          style: {
            shape: "round-rectangle",
            "border-width": 3,
            "border-color": "#a855f7", // Violet highlight for supernodes
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.8,
            opacity: 0.65,
          },
        },
        {
          selector: "edge[?isBridge]",
          style: {
            width: 3.0,
            "line-color": "#f59e0b", // Amber line for topological bridges
            "target-arrow-color": "#f59e0b",
            "line-style": "dashed",
            opacity: 0.9,
          },
        },
        // Dynamic Traversal Highlights
        {
          selector: ".traversal-visited",
          style: {
            "border-width": 4,
            "border-color": "#6366f1", // Indigo pulse
            "background-color": "#4f46e5",
          },
        },
        {
          selector: ".traversal-rated",
          style: {
            "border-width": 4,
            "border-color": "#f59e0b", // Amber rated
          },
        },
        {
          selector: ".traversal-pruned",
          style: {
            opacity: 0.25,
            "border-color": "#ef4444",
            "line-color": "#ef4444",
          },
        },
        {
          selector: ".traversal-bridge-kept",
          style: {
            "border-width": 5,
            "border-color": "#10b981", // Emerald preserved
            "background-color": "#059669",
            opacity: 1.0,
          },
        },
        {
          selector: ".traversal-selected",
          style: {
            "border-width": 5,
            "border-color": "#22c55e",
            "background-color": "#16a34a",
            width: 48,
            height: 48,
            opacity: 1.0,
          },
        },
      ],
      layout: {
        name: "preset",
      },
    });

    let layout: any = null;
    try {
      layout = cy.layout({
        name: "cose",
        animate: false,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 100,
        nodeOverlap: 20,
        nodeRepulsion: () => 400000,
        idealEdgeLength: () => 80,
        edgeElasticity: () => 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
      } as any);
      layout.run();
    } catch (e) {
      console.warn("Cytoscape layout initialization:", e);
    }

    cy.on("tap", "node", (evt: EventObject) => {
      const node = evt.target;
      setSelectedNodeData(node.data());
    });

    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNodeData(null);
      }
    });

    cyRef.current = cy;

    return () => {
      try {
        if (layout) layout.stop();
      } catch (e) {}
      try {
        if (cy && !cy.destroyed()) {
          cy.stop();
          cy.destroy();
        }
      } catch (e) {}
      cyRef.current = null;
    };
  }, [activeGraph, graphMode]);

  // Apply Traversal Animation Frame
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !steps.length || currentStepIndex < 0) return;

    try {
      // Reset styles
      cy.elements().removeClass(
        "traversal-visited traversal-rated traversal-pruned traversal-bridge-kept traversal-selected"
      );

      // Apply classes up to current step
      for (let i = 0; i <= currentStepIndex && i < steps.length; i++) {
        const step = steps[i];
        const targetNode = cy.getElementById(step.node_or_comm_id);

        if (targetNode && targetNode.length) {
          if (step.action === "VISIT") {
            targetNode.addClass("traversal-visited");
          } else if (step.action === "RATE") {
            targetNode.addClass("traversal-rated");
          } else if (step.action === "PRUNE") {
            targetNode.addClass("traversal-pruned");
          } else if (step.action === "BRIDGE_PRESERVE") {
            targetNode.addClass("traversal-bridge-kept");
          } else if (step.action === "SELECT") {
            targetNode.addClass("traversal-selected");
          }
        }
      }
    } catch (e) {
      // Ignore animation updates on disposed graph
    }
  }, [currentStepIndex, steps]);

  // Playback Timer
  useEffect(() => {
    let timer: any = null;
    if (isPlaying && steps.length > 0) {
      timer = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, steps]);

  // When trace updates, reset to first step or show full
  useEffect(() => {
    if (trace && trace.steps.length > 0) {
      setCurrentStepIndex(trace.steps.length - 1);
    }
  }, [trace]);

  const handleFit = () => {
    if (cyRef.current && !cyRef.current.destroyed()) {
      cyRef.current.fit(undefined, 30);
    }
  };
  const handleZoomIn = () => {
    if (cyRef.current && !cyRef.current.destroyed()) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.25);
    }
  };
  const handleZoomOut = () => {
    if (cyRef.current && !cyRef.current.destroyed()) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
    }
  };

  const diagnostics = compressedGraph?.diagnostics;
  const currentStep = steps[currentStepIndex];

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
      {/* Top Bar Controls */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setGraphMode("compressed")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                graphMode === "compressed"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Tarjan Compressed ({compressedGraph?.nodes.length || 0} nodes)
            </button>
            <button
              onClick={() => setGraphMode("original")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                graphMode === "original"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Original Graph ({originalGraph?.nodes.length || 0} nodes)
            </button>
          </div>

          {compressedGraph?.compression_ratio && (
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 font-medium">
              Ratio: {Math.round(compressedGraph.compression_ratio * 100)}% of original size
            </span>
          )}
        </div>

        {/* Legend */}
        <div className="hidden xl:flex items-center gap-4 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 border border-purple-400" />
            <span>SCC Supernode</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-emerald-300" />
            <span>Articulation Connector</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-b-2 border-amber-500 border-dashed" />
            <span>Bridge Edge</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Entity Node</span>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-700 text-slate-300 rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-700 text-slate-300 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFit}
            className="p-1.5 hover:bg-slate-700 text-slate-300 rounded"
            title="Fit to Canvas"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Giant SCC Alert Banner */}
      {diagnostics?.has_giant_scc && (
        <div className="bg-amber-950/70 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-10">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Giant SCC Detected:</strong> Max SCC contains {diagnostics.max_scc_size} nodes (
              {Math.round(diagnostics.max_scc_ratio * 100)}% of graph).
            </span>
          </div>
          <span className="text-[11px] text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-500/30">
            {diagnostics.mitigation_strategy}
          </span>
        </div>
      )}

      {/* Cytoscape Canvas */}
      <div ref={containerRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Traversal Step Replay Controller */}
      {steps.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto bg-slate-900/95 backdrop-blur border border-slate-800 p-3 rounded-xl shadow-2xl z-20 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-indigo-400 uppercase tracking-wider text-[11px]">
                Retrieval Traversal
              </span>
              <span className="text-slate-400">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
            </div>
            {currentStep && (
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-medium ${
                  currentStep.action === "SELECT"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : currentStep.action === "BRIDGE_PRESERVE"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : currentStep.action === "PRUNE"
                    ? "bg-red-500/20 text-red-300 border border-red-500/40"
                    : currentStep.action === "RATE"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                }`}
              >
                {currentStep.action} {currentStep.score ? `(${currentStep.score}/100)` : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-colors shadow-sm"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentStepIndex(0);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded"
              title="Restart animation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <input
              type="range"
              min={0}
              max={steps.length - 1}
              value={currentStepIndex >= 0 ? currentStepIndex : 0}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentStepIndex(parseInt(e.target.value, 10));
              }}
              className="flex-1 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {currentStep && currentStep.reason && (
            <p className="text-[11px] text-slate-300 truncate bg-slate-950/60 px-2.5 py-1 rounded border border-slate-800">
              <strong className="text-slate-400">Action Detail:</strong> {currentStep.reason}
            </p>
          )}
        </div>
      )}

      {/* Selected Node Details Drawer */}
      {selectedNodeData && (
        <div className="absolute top-14 right-4 w-80 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-2xl z-20 text-xs text-slate-300 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {selectedNodeData.type}
              </span>
              <h3 className="text-sm font-semibold text-white mt-1.5">{selectedNodeData.label}</h3>
            </div>
            <button
              onClick={() => setSelectedNodeData(null)}
              className="text-slate-500 hover:text-slate-300 text-sm font-bold"
            >
              ✕
            </button>
          </div>

          <p className="text-slate-400 text-xs leading-relaxed">
            {selectedNodeData.description || "No description provided."}
          </p>

          {selectedNodeData.isConnector && (
            <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-lg p-2 text-emerald-200">
              <p className="font-semibold flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Articulation Point (Connector Node)
              </p>
              <p className="text-[10px] text-emerald-300/80 mt-1">
                Removing this node disconnects the graph. Preserved across Tarjan SCC compression and pruning.
              </p>
            </div>
          )}

          {selectedNodeData.isSupernode && (
            <div className="bg-purple-950/60 border border-purple-500/30 rounded-lg p-2.5 text-purple-200 space-y-2">
              <p className="font-semibold text-[11px]">
                Tarjan SCC Supernode ({selectedNodeData.memberCount} nodes collapsed)
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {selectedNodeData.memberNodes?.map((m: any) => (
                  <div key={m.id} className="bg-purple-900/40 p-1.5 rounded text-[10px]">
                    <strong className="text-white">{m.name}</strong> ({m.type})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
