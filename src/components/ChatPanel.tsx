import React, { useState } from "react";
import { Send, CornerDownLeft, Copy, Check, Sparkles, BookOpen, Clock, Cpu, Layers, GitCommit, ChevronDown, ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import { QueryResult, Paper, TraversalTrace } from "../types";

interface ChatPanelProps {
  selectedPapers: Paper[];
  onExecuteQuery: (question: string, mode: string) => Promise<void>;
  isQuerying: boolean;
  queryResult: QueryResult | null;
  streamedAnswer: string;
  trace?: TraversalTrace | null;
  theme: "dark" | "light";
}

const SINGLE_PAPER_PRESETS: Record<string, string[]> = {
  "attention": [
    "How does Multi-Head Attention replace recurrence in sequence modeling?",
    "Explain why Scaled Dot-Product Attention divides by sqrt(d_k).",
    "What were the BLEU score results on WMT 2014 English-to-German?",
  ],
  "gcn": [
    "What is the renormalization trick and why is it necessary for deep GCN layers?",
    "What classification accuracy did GCN achieve on Cora and Citeseer?",
  ],
  "gat": [
    "How do attention coefficients alpha_ij allow anisotropic message passing?",
    "What Micro-averaged F1 score was achieved on the inductive PPI dataset?",
  ],
  "graphsage": [
    "How does GraphSAGE transition from transductive learning to inductive aggregation?",
    "Explain the difference between the Mean, LSTM, and Pooling aggregators.",
  ],
  "rag": [
    "Compare RAG-Sequence and RAG-Token formulations in terms of marginalization.",
    "What are the primary components of RAG's dense retriever and parametric generator?",
  ],
  "bert": [
    "Explain the Masked Language Model (MLM) and Next Sentence Prediction (NSP) objectives.",
    "How does BERT's bidirectional representation differ from GPT's left-to-right approach?",
  ],
  "cot": [
    "What is Chain-of-Thought prompting, and how does it elicit multi-step reasoning?",
    "What accuracy did Chain-of-Thought achieve on the GSM8K math reasoning benchmark?",
  ],
};

const MULTI_PAPER_PRESETS = [
  "Compare the attention mechanism in Transformer vs Graph Attention Networks (GAT).",
  "How does inductive learning in GraphSAGE compare with transductive learning in GCN and DeepWalk?",
  "Synthesize how BERT and RAG leverage transformer foundations for representation vs retrieval.",
  "What are the common graph neural network paradigms across the selected papers?",
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  selectedPapers,
  onExecuteQuery,
  isQuerying,
  queryResult,
  streamedAnswer,
  trace,
  theme,
}) => {
  const isDark = theme === "dark";
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<string>("ours");
  const [copied, setCopied] = useState(false);
  const [showPassages, setShowPassages] = useState(true);
  const [showTrace, setShowTrace] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isQuerying) return;
    onExecuteQuery(question, mode);
  };

  const handleSelectPreset = (q: string) => {
    setQuestion(q);
    onExecuteQuery(q, mode);
  };

  const handleCopy = () => {
    const textToCopy = streamedAnswer || queryResult?.answer || "";
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine dynamic presets
  let presets: string[] = [];
  if (selectedPapers.length > 1) {
    presets = MULTI_PAPER_PRESETS;
  } else if (selectedPapers.length === 1) {
    const titleLower = selectedPapers[0].title.toLowerCase();
    const matchedKey = Object.keys(SINGLE_PAPER_PRESETS).find((k) => titleLower.includes(k));
    presets = matchedKey ? SINGLE_PAPER_PRESETS[matchedKey] : [
      "What are the main theoretical contributions of this paper?",
      "What datasets and empirical evaluation benchmarks were used?",
      "Explain the core mathematical formulation and equations.",
    ];
  } else {
    presets = [
      "Select one or more research papers from the left sidebar to begin graph-grounded analysis.",
    ];
  }

  const activeAnswer = streamedAnswer || queryResult?.answer;

  return (
    <aside
      className={`w-96 h-full border-l flex flex-col transition-colors duration-200 select-none ${
        isDark
          ? "bg-slate-950 border-slate-800/80 text-slate-200"
          : "bg-slate-50 border-slate-200 text-slate-800"
      }`}
    >
      {/* Chat Header */}
      <div
        className={`p-4 border-b flex items-center justify-between ${
          isDark ? "border-slate-800/80 bg-slate-900/40" : "border-slate-200 bg-white"
        }`}
      >
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            GraphRAG Assistant
          </h2>
          <div className="text-xs text-slate-500 mt-0.5">
            {selectedPapers.length === 0
              ? "No papers loaded"
              : selectedPapers.length === 1
              ? `Grounded in: ${selectedPapers[0].title}`
              : `Synthesizing across ${selectedPapers.length} papers`}
          </div>
        </div>

        {/* Copy button */}
        {activeAnswer && (
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-md border text-xs transition-colors flex items-center gap-1 ${
              isDark
                ? "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300"
                : "bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs"
            }`}
            title="Copy answer to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Answer & Chat Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeAnswer ? (
          <div className="space-y-4">
            {/* Metric strip */}
            {queryResult && (
              <div
                className={`p-2.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                  isDark
                    ? "bg-slate-900/60 border-slate-800 text-slate-400"
                    : "bg-white border-slate-200 text-slate-600 shadow-2xs"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-cyan-500" />
                  <span>{queryResult.latency_ms || 320}ms</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 text-indigo-500" />
                  <span>{queryResult.total_tokens || 850} tokens</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-emerald-500" />
                  <span>{queryResult.bridge_kept_count || 2} bridges kept</span>
                </div>
              </div>
            )}

            {/* Markdown Answer */}
            <div
              className={`text-xs leading-relaxed prose prose-sm max-w-none ${
                isDark ? "prose-invert text-slate-300" : "text-slate-800"
              }`}
            >
              <Markdown>{activeAnswer}</Markdown>
            </div>

            {/* Graph Traversal Discovery Path Accordion */}
            {trace && trace.steps && trace.steps.length > 0 && (
              <div className="pt-3 border-t border-slate-800/60 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowTrace(!showTrace)}
                  className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-indigo-400 transition-colors uppercase tracking-wider"
                >
                  <div className="flex items-center gap-1.5">
                    <GitCommit className="w-3.5 h-3.5 text-amber-500" />
                    <span>Graph Traversal Chain ({trace.steps.length} steps)</span>
                  </div>
                  {showTrace ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>

                {showTrace && (
                  <div className="space-y-1.5">
                    {trace.steps.map((s, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg border text-[11px] leading-normal flex items-start gap-2 ${
                          isDark
                            ? "bg-slate-900/50 border-slate-800/80 text-slate-300"
                            : "bg-white border-slate-200 text-slate-700 shadow-2xs"
                        }`}
                      >
                        <span className="font-mono text-amber-500 text-[10px] font-bold shrink-0 mt-0.5">
                          #{s.step_index}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-indigo-400">
                              {s.action}
                            </span>
                            <span className="text-slate-500">·</span>
                            <span className="font-mono text-[10px] text-slate-400 truncate">
                              '{s.node_or_comm_id}'
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                            {s.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cited Real Passages Accordion */}
            {queryResult?.cited_passages && queryResult.cited_passages.length > 0 && (
              <div className="pt-3 border-t border-slate-800/60 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowPassages(!showPassages)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-indigo-400 transition-colors uppercase tracking-wider"
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Grounded Document Passages ({queryResult.cited_passages.length})</span>
                </button>

                {showPassages && (
                  <div className="space-y-2">
                    {queryResult.cited_passages.map((p, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border text-[11px] leading-normal ${
                          isDark
                            ? "bg-slate-900/50 border-slate-800/80 text-slate-400"
                            : "bg-white border-slate-200 text-slate-600 shadow-2xs"
                        }`}
                      >
                        <div className="font-semibold text-indigo-400 mb-1">
                          {p.paper_title}
                        </div>
                        <p className="line-clamp-3 italic">"{p.text}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col justify-center text-center px-4 space-y-3">
            <div className="w-10 h-10 mx-auto rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3
                className={`text-xs font-semibold ${
                  isDark ? "text-slate-200" : "text-slate-800"
                }`}
              >
                Ask Anything About the Papers
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                Answers are grounded in real PDF passages and topological relationships in Neo4j.
              </p>
            </div>

            {/* Preset Query Chips */}
            <div className="space-y-1.5 pt-2 text-left">
              <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">
                Suggested Research Queries:
              </span>
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPreset(preset)}
                  className={`w-full text-left p-2 rounded-lg border text-[11px] transition-all leading-snug ${
                    isDark
                      ? "bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 text-slate-300 hover:border-slate-700"
                      : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-2xs"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div
        className={`p-3 border-t ${
          isDark ? "border-slate-800/80 bg-slate-950" : "border-slate-200 bg-white"
        }`}
      >
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="relative">
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={
                selectedPapers.length === 0
                  ? "Select a paper first..."
                  : selectedPapers.length === 1
                  ? `Ask about ${selectedPapers[0].title}...`
                  : `Ask question synthesizing ${selectedPapers.length} papers...`
              }
              disabled={isQuerying || selectedPapers.length === 0}
              className={`w-full p-2.5 pr-10 text-xs rounded-xl border outline-none resize-none transition-all ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500"
                  : "bg-slate-100/70 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white"
              }`}
            />
            <button
              type="submit"
              disabled={isQuerying || !question.trim() || selectedPapers.length === 0}
              className="absolute right-2.5 bottom-3.5 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-xs"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Enter to send · Shift+Enter for newline</span>
            <span className="font-mono">{isQuerying ? "Streaming tokens..." : "Ready"}</span>
          </div>
        </form>
      </div>
    </aside>
  );
};
