import React, { useState } from "react";
import { Send, Sparkles, Zap, Cpu, Clock, Layers, ArrowRight, CornerDownLeft, Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import { QueryResult, Paper } from "../types";

interface ChatPanelProps {
  selectedPaper: Paper | null;
  onExecuteQuery: (question: string, mode: string) => Promise<void>;
  isQuerying: boolean;
  queryResult: QueryResult | null;
  streamedAnswer: string;
}

const PRESET_QUESTIONS: Record<string, string[]> = {
  default: [
    "How does the core model architecture work and what are the primary contributions?",
    "What empirical benchmarks were evaluated and what were the quantitative results?",
    "Explain the theoretical connection between the objective function and representation learning."
  ],
  "Attention Is All You Need": [
    "How does Multi-Head Attention replace recurrence in sequence modeling?",
    "What were the BLEU score results on WMT 2014 English-to-German translation?",
    "Explain why Scaled Dot-Product Attention divides by sqrt(d_k)."
  ],
  "Semi-Supervised Classification with Graph Convolutional Networks": [
    "What is the renormalization trick and why is it necessary for deep GCN layers?",
    "What classification accuracy did GCN achieve on Cora and Citeseer?",
    "How does localized first-order spectral convolution approximate Chebyshev polynomials?"
  ],
  "Graph Attention Networks": [
    "How do attention coefficients alpha_ij allow anisotropic message passing?",
    "What Micro-averaged F1 score was achieved on the inductive PPI dataset?",
    "How does multi-head attention in GAT stabilize training?"
  ],
  "Inductive Representation Learning on Large Graphs": [
    "How does GraphSAGE transition from transductive learning to inductive neighborhood aggregation?",
    "Explain the difference between the Mean, LSTM, and Pooling aggregators in GraphSAGE.",
    "What performance gains did GraphSAGE show on the Reddit post classification benchmark?"
  ],
  "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks": [
    "Compare RAG-Sequence and RAG-Token formulations in terms of marginalization.",
    "What are the primary components of RAG's dense retriever and parametric generator?",
    "On what knowledge-intensive benchmarks did RAG achieve state-of-the-art results?"
  ],
  "DeepWalk: Online Learning of Social Representations": [
    "How does DeepWalk generalize language modeling to graphs using random walks?",
    "Explain the skip-gram architecture and hierarchical softmax used in DeepWalk.",
    "What advantages does DeepWalk show in multi-label classification on social networks?"
  ],
  "node2vec: Scalable Feature Learning for Networks": [
    "Explain the biased random walk parameters p and q in node2vec.",
    "How does node2vec balance Homophily (BFS) and Structural Equivalence (DFS)?",
    "What performance advantages does node2vec show on multilabel node classification?"
  ],
  "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding": [
    "Explain the Masked Language Model (MLM) and Next Sentence Prediction (NSP) pre-training objectives.",
    "How does BERT's bidirectional representation differ from GPT's left-to-right approach?",
    "What benchmarks did BERT-Large dominate, and what scores did it achieve on GLUE?"
  ],
  "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models": [
    "What is Chain-of-Thought prompting, and how does it elicit multi-step reasoning?",
    "What accuracy did Chain-of-Thought achieve on the GSM8K math reasoning benchmark?",
    "How does model parameter scale (e.g., 100B+ parameters) affect Chain-of-Thought emergence?"
  ],
  "Knowledge Graph Embedding: A Survey of Approaches and Applications": [
    "Compare translational models (TransE, TransH, TransR) in knowledge graph embedding.",
    "What is the primary formulation of bilinear models like DistMult and ComplEx?",
    "How are knowledge graph embeddings applied to link prediction and triple classification?"
  ]
};

export const ChatPanel: React.FC<ChatPanelProps> = ({
  selectedPaper,
  onExecuteQuery,
  isQuerying,
  queryResult,
  streamedAnswer,
}) => {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<string>("ours");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isQuerying) return;
    onExecuteQuery(question, mode);
  };

  const handleSelectPreset = (q: string) => {
    setQuestion(q);
    onExecuteQuery(q, mode);
  };

  // Find relevant presets
  const presets =
    (selectedPaper &&
      Object.entries(PRESET_QUESTIONS).find(([k]) =>
        selectedPaper.title.toLowerCase().includes(k.toLowerCase())
      )?.[1]) ||
    PRESET_QUESTIONS.default;

  const currentAnswer = streamedAnswer || queryResult?.answer;

  return (
    <div className="w-[480px] bg-slate-900 border-l border-slate-800 flex flex-col h-full flex-shrink-0">
      {/* Header & Mode Selector */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Graph RAG Answering
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            {selectedPaper ? selectedPaper.title.slice(0, 24) + "..." : "No paper selected"}
          </span>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-400 font-medium">Method:</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-medium"
          >
            <option value="ours">Ours (Tarjan SCC + Bridges + Budget)</option>
            <option value="dynamic">Dynamic Selection (Reference Baseline)</option>
            <option value="static">Static Baseline (Fixed Level 1)</option>
            <option value="local">Local Search (Seed Entities + 2-Hop)</option>
            <option value="auto">Auto-Router (Intent Classification)</option>
          </select>
        </div>
      </div>

      {/* Answer & Telemetry Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Telemetry Metrics Card */}
        {queryResult && (
          <div className="grid grid-cols-4 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 mb-0.5">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Tokens</span>
              </div>
              <p className="text-xs font-semibold text-white font-mono">
                {queryResult.total_tokens.toLocaleString()}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 mb-0.5">
                <Cpu className="w-3 h-3 text-indigo-400" />
                <span>LLM Calls</span>
              </div>
              <p className="text-xs font-semibold text-white font-mono">
                {queryResult.total_llm_calls}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 mb-0.5">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Latency</span>
              </div>
              <p className="text-xs font-semibold text-white font-mono">
                {queryResult.latency_ms} ms
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 mb-0.5">
                <Layers className="w-3 h-3 text-purple-400" />
                <span>Bridges</span>
              </div>
              <p className="text-xs font-semibold text-emerald-400 font-mono">
                +{queryResult.bridge_kept_count || 0}
              </p>
            </div>
          </div>
        )}

        {/* Answer Content */}
        {currentAnswer ? (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 text-xs text-slate-200 leading-relaxed space-y-3">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
              <span className="font-semibold text-indigo-300">Answer with Citations</span>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono">
                {queryResult?.mode || mode}
              </span>
            </div>

            <div className="markdown-body space-y-2 text-slate-200 leading-relaxed font-sans text-xs">
              <Markdown
                components={{
                  h1: ({ children }) => <h1 className="text-sm font-bold text-white mt-3 mb-1.5 border-b border-slate-700/60 pb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xs font-bold text-indigo-200 mt-2.5 mb-1">{children}</h2>,
                  h3: ({ children }) => {
                    const text = String(children || "");
                    if (text.includes("Simple English")) {
                      return (
                        <div className="mt-3.5 mb-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2 shadow-sm">
                          <span className="text-base leading-none">💡</span>
                          <span>In Simple English (Short Summary)</span>
                        </div>
                      );
                    }
                    return <h3 className="text-xs font-semibold text-indigo-300 mt-2 mb-1">{children}</h3>;
                  },
                  p: ({ children }) => <p className="mb-2 leading-relaxed text-slate-200">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 mb-2 text-slate-300">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 mb-2 text-slate-300">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                  code: ({ children }) => <code className="bg-slate-900/90 text-amber-300 px-1 py-0.5 rounded font-mono text-[11px] border border-slate-800">{children}</code>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-500 pl-3 italic text-slate-400 my-2">{children}</blockquote>,
                  hr: () => <hr className="border-slate-800 my-3" />,
                }}
              >
                {currentAnswer}
              </Markdown>
            </div>
          </div>
        ) : isQuerying ? (
          <div className="h-48 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            <p>Traversing graph hierarchy & synthesizing answer...</p>
          </div>
        ) : (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-500 border border-dashed border-slate-800 rounded-xl">
            <Sparkles className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs font-medium text-slate-400">Ask a research question</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Select a suggested question below or enter your own query.
            </p>
          </div>
        )}

        {/* Suggested Landmark Questions */}
        <div className="space-y-2 pt-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Suggested Research Questions
          </p>
          <div className="space-y-1.5">
            {presets.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectPreset(q)}
                disabled={isQuerying}
                className="w-full text-left p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 hover:text-white transition-all flex items-center justify-between group disabled:opacity-50"
              >
                <span className="line-clamp-2 pr-2">{q}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input Box */}
      <div className="p-4 border-t border-slate-800 bg-slate-900">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask about architecture, datasets, or theoretical properties..."
            rows={2}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none pr-12"
          />
          <button
            type="submit"
            disabled={!question.trim() || isQuerying}
            className="absolute right-2.5 bottom-3.5 w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center transition-colors shadow-sm"
          >
            {isQuerying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
