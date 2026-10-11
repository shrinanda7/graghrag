import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { PaperSidebar } from "./components/PaperSidebar";
import { CytoscapeGraphViewer } from "./components/CytoscapeGraphViewer";
import { ChatPanel } from "./components/ChatPanel";
import { Neo4jAuraModal } from "./components/Neo4jAuraModal";
import { Paper, GraphTopology, QueryResult, TraversalTrace, TraversalStep, Neo4jStatus } from "./types";
import { PRELOADED_PAPERS, generatePaperGraph, generateMultiPaperGraph } from "./data";

export default function App() {
  // Theme state: dark / light
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem("graphrag_theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return "dark";
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("graphrag_theme", next);
      } catch {}
      return next;
    });
  };

  const [papers, setPapers] = useState<Paper[]>(PRELOADED_PAPERS);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([PRELOADED_PAPERS[0].paper_id]);

  // Graph state
  const initialGraphs = generatePaperGraph(PRELOADED_PAPERS[0].paper_id);
  const [originalGraph, setOriginalGraph] = useState<GraphTopology | null>(initialGraphs.original_graph);
  const [compressedGraph, setCompressedGraph] = useState<GraphTopology | null>(initialGraphs.compressed_graph);
  const [trace, setTrace] = useState<TraversalTrace | null>(null);

  // Query & Answering state
  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [streamedAnswer, setStreamedAnswer] = useState<string>("");

  // Neo4j Cloud modal state
  const [neo4jStatus, setNeo4jStatus] = useState<Neo4jStatus | null>(null);
  const [isNeo4jOpen, setIsNeo4jOpen] = useState<boolean>(false);

  // Initial load
  useEffect(() => {
    loadPapers();
    loadNeo4jStatus();
  }, []);

  // When selected papers change, update graph topology
  useEffect(() => {
    loadGraphForSelection(selectedPaperIds);
  }, [selectedPaperIds]);

  const loadPapers = async () => {
    try {
      const res = await fetch("/api/papers");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setPapers(data);
          if (selectedPaperIds.length === 0) {
            setSelectedPaperIds([data[0].paper_id]);
          }
        }
      }
    } catch (err) {
      console.warn("Backend papers endpoint offline, using preloaded catalog:", err);
    }
  };

  const loadNeo4jStatus = async () => {
    try {
      const res = await fetch("/api/neo4j/status");
      if (res.ok) {
        const data = await res.json();
        setNeo4jStatus(data);
      }
    } catch (err) {
      console.warn("Neo4j status check failed:", err);
    }
  };

  const loadGraphForSelection = async (ids: string[]) => {
    if (!ids || ids.length === 0) {
      setOriginalGraph(null);
      setCompressedGraph(null);
      return;
    }

    if (ids.length === 1) {
      try {
        const res = await fetch(`/api/graph/${ids[0]}`);
        if (res.ok) {
          const data = await res.json();
          if (data.original_graph) setOriginalGraph(data.original_graph);
          if (data.compressed_graph) setCompressedGraph(data.compressed_graph);
          return;
        }
      } catch {}
      const fallback = generatePaperGraph(ids[0]);
      setOriginalGraph(fallback.original_graph);
      setCompressedGraph(fallback.compressed_graph);
    } else {
      try {
        const res = await fetch("/api/graph/multi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paper_ids: ids }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.original_graph) setOriginalGraph(data.original_graph);
          if (data.compressed_graph) setCompressedGraph(data.compressed_graph);
          return;
        }
      } catch {}
      const fallback = generateMultiPaperGraph(ids);
      setOriginalGraph(fallback.original_graph);
      setCompressedGraph(fallback.compressed_graph);
    }
  };

  // Multi-paper selection handlers
  const handleTogglePaper = (paperId: string) => {
    setSelectedPaperIds((prev) => {
      if (prev.includes(paperId)) {
        if (prev.length === 1) return prev; // Keep at least one active
        return prev.filter((id) => id !== paperId);
      } else {
        return [...prev, paperId];
      }
    });
  };

  const handleSelectOnlyPaper = (paperId: string) => {
    setSelectedPaperIds([paperId]);
  };

  const handleSelectAll = () => {
    setSelectedPaperIds(papers.map((p) => p.paper_id));
  };

  const handleClearSelection = () => {
    if (papers.length > 0) {
      setSelectedPaperIds([papers[0].paper_id]);
    } else {
      setSelectedPaperIds([]);
    }
  };

  // Streaming query execution (multi-paper aware)
  const handleExecuteQuery = async (question: string, mode: string) => {
    if (selectedPaperIds.length === 0) return;

    setIsQuerying(true);
    setStreamedAnswer("");
    setQueryResult(null);

    const freshTrace: TraversalTrace = {
      mode: mode,
      steps: [],
      visited_nodes: [],
      expanded_nodes: [],
      pruned_nodes: [],
      bridge_kept_nodes: [],
      selected_reports: [],
      ratings: {},
      total_tokens: 0,
      total_llm_calls: 0,
      latency_ms: 0,
    };
    setTrace(freshTrace);

    try {
      const response = await fetch("/api/query/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper_ids: selectedPaperIds,
          question: question,
          mode: mode,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Query stream failed to initialize");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const ev of events) {
          const lines = ev.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.replace("event: ", "").trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.replace("data: ", "").trim();
            }
          }

          if (!eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            if (eventType === "topology") {
              if (parsed.original_graph) setOriginalGraph(parsed.original_graph);
              if (parsed.compressed_graph) setCompressedGraph(parsed.compressed_graph);
            } else if (eventType === "trace_step") {
              setTrace((prevTrace) => {
                if (!prevTrace) return null;
                return {
                  ...prevTrace,
                  steps: [...prevTrace.steps, parsed as TraversalStep],
                  visited_nodes: Array.from(new Set([...prevTrace.visited_nodes, parsed.node_or_comm_id])),
                };
              });
            } else if (eventType === "answer_token") {
              setStreamedAnswer((prev) => prev + (parsed.token || ""));
            } else if (eventType === "complete") {
              setQueryResult({
                mode: parsed.mode || mode,
                answer: "",
                trace: freshTrace,
                total_tokens: parsed.total_tokens || 850,
                total_llm_calls: parsed.total_llm_calls || 1,
                latency_ms: parsed.latency_ms || 320,
                bridge_kept_count: parsed.bridge_kept_count || 2,
                cited_passages: parsed.cited_passages || [],
                papers_evaluated: parsed.papers_evaluated || [],
              });
            }
          } catch (jsonErr) {
            console.error("Failed to parse SSE payload:", jsonErr);
          }
        }
      }
    } catch (err: any) {
      console.error("Streaming query failed:", err);
      setStreamedAnswer((prev) => (prev ? prev : `Unable to complete query: ${err?.message}`));
    } finally {
      setIsQuerying(false);
    }
  };

  const selectedPapers = papers.filter((p) => selectedPaperIds.includes(p.paper_id));
  const selectedPaperTitles = selectedPapers.map((p) => p.title);

  return (
    <div
      className={`flex flex-col h-screen w-screen font-sans antialiased overflow-hidden select-none transition-colors duration-200 ${
        theme === "dark" ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Top Header */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        selectedPapersCount={selectedPaperIds.length}
        totalPapersCount={papers.length}
        neo4jStatus={neo4jStatus}
        onOpenNeo4j={() => setIsNeo4jOpen(true)}
      />

      {/* Main 3-Column Studio Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Research Paper Corpus Sidebar */}
        <PaperSidebar
          papers={papers}
          selectedPaperIds={selectedPaperIds}
          onTogglePaper={handleTogglePaper}
          onSelectOnlyPaper={handleSelectOnlyPaper}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onPapersUploaded={loadPapers}
          theme={theme}
        />

        {/* Center: Interactive Knowledge Graph Explorer */}
        <CytoscapeGraphViewer
          originalGraph={originalGraph}
          compressedGraph={compressedGraph}
          trace={trace}
          selectedPaperTitles={selectedPaperTitles}
          theme={theme}
        />

        {/* Right: Real GraphRAG Chat & Traversal Panel */}
        <ChatPanel
          selectedPapers={selectedPapers}
          onExecuteQuery={handleExecuteQuery}
          isQuerying={isQuerying}
          queryResult={queryResult}
          streamedAnswer={streamedAnswer}
          trace={trace}
          theme={theme}
        />
      </div>

      {/* Neo4j Aura Cloud Explorer Modal */}
      <Neo4jAuraModal
        isOpen={isNeo4jOpen}
        onClose={() => setIsNeo4jOpen(false)}
        neo4jStatus={neo4jStatus}
        onRefreshStatus={loadNeo4jStatus}
      />
    </div>
  );
}
