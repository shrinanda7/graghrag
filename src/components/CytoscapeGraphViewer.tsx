import React, { useEffect, useRef, useState } from "react";
import cytoscape, { Core, EventObject } from "cytoscape";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Pause,
  RotateCcw,
  Network,
  Info,
  X,
  Layers,
} from "lucide-react";
import { GraphTopology, TraversalStep, TraversalTrace, GraphNode } from "../types";

interface CytoscapeGraphViewerProps {
  originalGraph: GraphTopology | null;
  compressedGraph: GraphTopology | null;
  trace: TraversalTrace | null;
  selectedPaperTitles: string[];
  theme: "dark" | "light";
}

export const CytoscapeGraphViewer: React.FC<CytoscapeGraphViewerProps> = ({
  originalGraph,
  compressedGraph,
  trace,
  selectedPaperTitles,
  theme,
}) => {
  const isDark = theme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const [graphMode, setGraphMode] = useState<"compressed" | "original">("compressed");
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);

  const activeGraph = graphMode === "compressed" ? compressedGraph : originalGraph;
  const steps: TraversalStep[] = trace?.steps || [];

  // Initialize or update Cytoscape instance
  useEffect(() => {
    if (!containerRef.current || !activeGraph || !activeGraph.nodes.length) return;

    if (cyRef.current) {
      try {
        if (!cyRef.current.destroyed()) {
          cyRef.current.stop();
          cyRef.current.destroy();
        }
      } catch (e) {}
      cyRef.current = null;
    }

    const articulationPoints = new Set(compressedGraph?.articulation_points || []);
    const bridgeEdgeKeys = new Set(
      (compressedGraph?.bridges || []).map(([u, v]) => `${u}->${v}`)
    );

    const elements: any[] = [];

    // Add nodes
    activeGraph.nodes.forEach((n) => {
      const isAP = articulationPoints.has(n.id) || n.is_connector;
      const isSuper = n.is_supernode;
      const memberCount = n.member_count || (n.member_node_ids?.length || 1);

      const color = isSuper
        ? isDark ? "#a855f7" : "#7e22ce"
        : isAP
        ? isDark ? "#10b981" : "#059669"
        : isDark ? "#3b82f6" : "#2563eb";

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
          originalColor: color,
        },
      });
    });

    // Add edges
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
          weight: e.weight || 1.0,
        },
      });
    });

    try {
      const cy = cytoscape({
        container: containerRef.current,
        elements: elements,
        boxSelectionEnabled: false,
        autounselectify: false,
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              "font-size": "10px",
              "font-family": "ui-sans-serif, system-ui, sans-serif",
              color: isDark ? "#f8fafc" : "#0f172a",
              "text-valign": "bottom",
              "text-halign": "center",
              "text-margin-y": 4,
              "text-wrap": "wrap",
              "text-max-width": "110px",
              "background-color": "data(originalColor)",
              width: "mapData(memberCount, 1, 10, 26, 46)",
              height: "mapData(memberCount, 1, 10, 26, 46)",
              "border-width": 2,
              "border-color": isDark ? "#0f172a" : "#ffffff",
              "border-opacity": 0.9,
              "transition-property": "background-color, border-color, border-width, width, height",
              "transition-duration": 250,
            },
          },
          {
            selector: "node[?isSupernode]",
            style: {
              shape: "hexagon",
              "border-width": 2.5,
              "border-color": isDark ? "#c084fc" : "#9333ea",
            },
          },
          {
            selector: "node[?isConnector]",
            style: {
              shape: "round-rectangle",
              "border-width": 2.5,
              "border-color": isDark ? "#34d399" : "#10b981",
            },
          },
          {
            selector: "edge",
            style: {
              width: 1.5,
              "line-color": isDark ? "#334155" : "#cbd5e1",
              "target-arrow-color": isDark ? "#475569" : "#94a3b8",
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              "arrow-scale": 0.8,
              opacity: 0.75,
              "transition-property": "line-color, target-arrow-color, width, opacity",
              "transition-duration": 250,
            },
          },
          {
            selector: "edge[?isBridge]",
            style: {
              width: 2.5,
              "line-color": isDark ? "#10b981" : "#059669",
              "target-arrow-color": isDark ? "#10b981" : "#059669",
              "line-style": "solid",
              opacity: 0.95,
            },
          },
          {
            selector: "node.highlighted",
            style: {
              "background-color": "#f59e0b",
              "border-color": "#ffffff",
              "border-width": 3,
              width: 38,
              height: 38,
              "z-index": 999,
            },
          },
          {
            selector: "edge.highlighted",
            style: {
              width: 3.5,
              "line-color": "#f59e0b",
              "target-arrow-color": "#f59e0b",
              opacity: 1,
              "z-index": 998,
            },
          },
          {
            selector: "node.dimmed",
            style: {
              opacity: 0.25,
            },
          },
          {
            selector: "edge.dimmed",
            style: {
              opacity: 0.15,
            },
          },
        ],
        layout: {
          name: "cose",
          idealEdgeLength: 80,
          nodeOverlap: 20,
          refresh: 20,
          fit: true,
          padding: 30,
          randomize: false,
          componentSpacing: 100,
          nodeRepulsion: 400000,
          edgeElasticity: 100,
          nestingFactor: 5,
        } as any,
      });

      cy.on("tap", "node", (evt: EventObject) => {
        const node = evt.target;
        setSelectedNodeData(node.data());
      });

      cy.on("tap", (evt: EventObject) => {
        if (evt.target === cy) {
          setSelectedNodeData(null);
          cy.elements().removeClass("dimmed highlighted");
        }
      });

      cyRef.current = cy;
    } catch (e) {
      console.error("Cytoscape init error:", e);
    }

    return () => {
      if (cyRef.current) {
        try {
          if (!cyRef.current.destroyed()) {
            cyRef.current.destroy();
          }
        } catch (e) {}
        cyRef.current = null;
      }
    };
  }, [activeGraph, graphMode, theme]);

  // Handle trace animation steps
  useEffect(() => {
    if (!cyRef.current || currentStepIndex < 0 || currentStepIndex >= steps.length) {
      if (currentStepIndex === -1 && cyRef.current) {
        cyRef.current.elements().removeClass("highlighted dimmed");
      }
      return;
    }

    const cy = cyRef.current;
    const step = steps[currentStepIndex];

    cy.elements().addClass("dimmed").removeClass("highlighted");

    const targetNode = cy.getElementById(step.node_or_comm_id);
    if (targetNode && targetNode.length) {
      targetNode.removeClass("dimmed").addClass("highlighted");

      if (step.action === "EXPAND" || step.action === "BRIDGE_PRESERVE") {
        const connectedEdges = targetNode.connectedEdges();
        connectedEdges.removeClass("dimmed").addClass("highlighted");
        connectedEdges.connectedNodes().removeClass("dimmed");
      }

      cy.animate(
        {
          center: { eles: targetNode },
          zoom: Math.max(cy.zoom(), 1.1),
        },
        { duration: 300 }
      );
    }
  }, [currentStepIndex, steps]);

  // Auto-play trace animation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      if (currentStepIndex < steps.length - 1) {
        timer = setTimeout(() => {
          setCurrentStepIndex((prev) => prev + 1);
        }, 1100);
      } else {
        setIsPlaying(false);
      }
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIndex, steps.length]);

  return (
    <div
      className={`flex-1 h-full flex flex-col relative overflow-hidden transition-colors duration-200 select-none ${
        isDark ? "bg-slate-950" : "bg-slate-100/60"
      }`}
    >
      {/* Top Toolbar */}
      <div
        className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 z-10 transition-colors ${
          isDark
            ? "bg-slate-950/90 border-slate-800/80 text-white backdrop-blur-md"
            : "bg-white/95 border-slate-200 text-slate-900 shadow-2xs backdrop-blur-md"
        }`}
      >
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-semibold tracking-tight">
            {selectedPaperTitles.length === 0
              ? "Global Knowledge Graph"
              : selectedPaperTitles.length === 1
              ? selectedPaperTitles[0]
              : `Multi-Paper Graph (${selectedPaperTitles.length} papers)`}
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">
            {activeGraph?.nodes.length || 0} nodes · {activeGraph?.edges.length || 0} relations
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Segmented Graph View Switcher */}
          <div
            className={`flex items-center p-0.5 rounded-lg border ${
              isDark
                ? "bg-slate-900 border-slate-800"
                : "bg-slate-100 border-slate-200"
            }`}
          >
            <button
              onClick={() => setGraphMode("compressed")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                graphMode === "compressed"
                  ? isDark
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Tarjan SCC Quotient
            </button>
            <button
              onClick={() => setGraphMode("original")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                graphMode === "original"
                  ? isDark
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Full Graph
            </button>
          </div>

          {/* Trace Playback if steps exist */}
          {steps.length > 0 && (
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border ${
                isDark ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"
              }`}
            >
              <button
                onClick={() => {
                  if (currentStepIndex >= steps.length - 1) setCurrentStepIndex(0);
                  setIsPlaying(!isPlaying);
                }}
                className={`p-1 rounded hover:bg-slate-800 text-xs ${
                  isPlaying ? "text-amber-400" : "text-slate-400"
                }`}
                title={isPlaying ? "Pause Trace" : "Play Traversal"}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStepIndex(-1);
                }}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 text-xs"
                title="Reset Traversal"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Zoom & Fit */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)}
              className={`p-1.5 rounded-lg border transition-colors ${
                isDark
                  ? "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400"
                  : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-2xs"
              }`}
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
              className={`p-1.5 rounded-lg border transition-colors ${
                isDark
                  ? "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400"
                  : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-2xs"
              }`}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => cyRef.current?.fit(undefined, 30)}
              className={`p-1.5 rounded-lg border transition-colors ${
                isDark
                  ? "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400"
                  : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-2xs"
              }`}
              title="Fit to Screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Cytoscape Canvas Container */}
      <div ref={containerRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Traversal Step Overlay if active */}
      {currentStepIndex >= 0 && steps[currentStepIndex] && (
        <div
          className={`absolute bottom-5 left-5 max-w-md p-3.5 rounded-xl border shadow-lg z-20 text-xs transition-colors ${
            isDark
              ? "bg-slate-900/95 border-amber-500/40 text-slate-200 backdrop-blur-md"
              : "bg-white/95 border-amber-500/40 text-slate-800 shadow-md backdrop-blur-md"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-amber-500 font-mono">
                Step {currentStepIndex + 1}/{steps.length}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-semibold text-white">
                {steps[currentStepIndex].action}
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              Score: {steps[currentStepIndex].score}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {steps[currentStepIndex].reason}
          </p>
        </div>
      )}

      {/* Node Inspector Drawer */}
      {selectedNodeData && (
        <div
          className={`absolute top-14 right-5 w-80 p-4 rounded-xl border shadow-xl z-20 text-xs transition-colors ${
            isDark
              ? "bg-slate-900/95 border-slate-800 text-slate-200 backdrop-blur-md"
              : "bg-white/95 border-slate-200 text-slate-800 shadow-md backdrop-blur-md"
          }`}
        >
          <div className="flex items-start justify-between gap-2 border-b pb-2.5 mb-2.5 border-slate-800/60">
            <div>
              <span className="text-[10px] uppercase font-semibold text-indigo-400 tracking-wider">
                {selectedNodeData.type}
              </span>
              <h3 className="text-sm font-semibold text-white mt-0.5 leading-snug">
                {selectedNodeData.label}
              </h3>
            </div>
            <button
              onClick={() => setSelectedNodeData(null)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
            {selectedNodeData.description || "Topological knowledge node extracted from academic literature."}
          </p>

          <div className="space-y-1.5 text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
            <div className="flex justify-between">
              <span>Node ID:</span>
              <span className="font-mono text-slate-300">{selectedNodeData.id}</span>
            </div>
            {selectedNodeData.isSupernode && (
              <div className="flex justify-between">
                <span>Condensed Members:</span>
                <span className="text-purple-400 font-semibold">
                  {selectedNodeData.memberCount} nodes
                </span>
              </div>
            )}
            {selectedNodeData.isConnector && (
              <div className="flex justify-between">
                <span>Structure:</span>
                <span className="text-emerald-400 font-medium">Articulation Bridge</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
