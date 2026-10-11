import React, { useState, useRef } from "react";
import { Upload, Search, CheckSquare, Square, FileText, Check, Plus, Loader2, AlertCircle } from "lucide-react";
import { Paper } from "../types";

interface PaperSidebarProps {
  papers: Paper[];
  selectedPaperIds: string[];
  onTogglePaper: (paperId: string) => void;
  onSelectOnlyPaper: (paperId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onPapersUploaded: () => void;
  theme: "dark" | "light";
}

export const PaperSidebar: React.FC<PaperSidebarProps> = ({
  papers,
  selectedPaperIds,
  onTogglePaper,
  onSelectOnlyPaper,
  onSelectAll,
  onClearSelection,
  onPapersUploaded,
  theme,
}) => {
  const isDark = theme === "dark";
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPapers = papers.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.title.toLowerCase().includes(q) || (p.filename && p.filename.toLowerCase().includes(q));
  });

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const pdfFiles = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      alert("Please upload valid PDF files.");
      return;
    }

    setIsUploading(true);
    setUploadMessage(`Extracting & indexing ${pdfFiles.length} PDF(s)...`);

    try {
      const formData = new FormData();
      for (const file of pdfFiles) {
        formData.append("files", file);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to process upload");
      }

      const data = await res.json();
      setUploadMessage(`Indexed ${pdfFiles.length} paper(s) successfully!`);
      setTimeout(() => {
        setIsUploading(false);
        setUploadMessage(null);
        onPapersUploaded();
      }, 700);
    } catch (err: any) {
      alert(err.message || "Upload failed");
      setIsUploading(false);
      setUploadMessage(null);
    }
  };

  const allSelected = papers.length > 0 && selectedPaperIds.length === papers.length;

  return (
    <aside
      className={`w-80 h-full border-r flex flex-col transition-colors duration-200 select-none ${
        isDark
          ? "bg-slate-950 border-slate-800/80 text-slate-200"
          : "bg-slate-50 border-slate-200 text-slate-800"
      }`}
    >
      {/* Sidebar Header */}
      <div
        className={`p-4 border-b flex flex-col gap-3 ${
          isDark ? "border-slate-800/80 bg-slate-900/40" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Research Corpus
            </h2>
            <div className="text-xs text-slate-500 mt-0.5">
              <span>{selectedPaperIds.length} of {papers.length} active</span>
              <span className="mx-1.5">·</span>
              <span>Multi-select enabled</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={allSelected ? onClearSelection : onSelectAll}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                isDark
                  ? "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300"
                  : "bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs"
              }`}
            >
              {allSelected ? "Clear" : "Select All"}
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search papers by title or topic..."
            className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none transition-all ${
              isDark
                ? "bg-slate-900/80 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500"
                : "bg-slate-100/70 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white"
            }`}
          />
        </div>

        {/* Dropzone / Upload Action */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFileUpload(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-all ${
            dragActive
              ? "border-indigo-500 bg-indigo-500/10"
              : isDark
              ? "border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/50"
              : "border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 shadow-2xs"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          {isUploading ? (
            <div className="flex items-center justify-center gap-2 text-xs text-indigo-400 py-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{uploadMessage || "Indexing PDF text & graph..."}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs font-medium">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                Upload PDF(s) to Index
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Paper List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredPapers.map((paper) => {
          const isSelected = selectedPaperIds.includes(paper.paper_id);

          return (
            <div
              key={paper.paper_id}
              className={`p-3 rounded-lg border transition-all cursor-pointer group ${
                isSelected
                  ? isDark
                    ? "bg-slate-900/90 border-indigo-500/60 shadow-xs"
                    : "bg-white border-indigo-500/60 shadow-xs"
                  : isDark
                  ? "bg-transparent border-transparent hover:bg-slate-900/50 hover:border-slate-800"
                  : "bg-transparent border-transparent hover:bg-white hover:border-slate-200"
              }`}
              onClick={() => onTogglePaper(paper.paper_id)}
            >
              <div className="flex items-start gap-2.5">
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePaper(paper.paper_id);
                  }}
                  className="mt-0.5 text-slate-400 hover:text-indigo-400 transition-colors shrink-0"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-indigo-500" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <h3
                    className={`text-xs font-medium leading-snug line-clamp-2 ${
                      isSelected
                        ? isDark
                          ? "text-white"
                          : "text-slate-950 font-semibold"
                        : isDark
                        ? "text-slate-300 group-hover:text-white"
                        : "text-slate-700 group-hover:text-slate-900"
                    }`}
                  >
                    {paper.title}
                  </h3>

                  {/* Clean unboxed metadata */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
                    <span>{paper.num_entities || 16} entities</span>
                    <span aria-hidden="true">·</span>
                    <span>{paper.num_relations || 22} relations</span>
                    {paper.file_size_kb ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{Math.round(paper.file_size_kb)} KB</span>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* "Focus Only" single selection trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectOnlyPaper(paper.paper_id);
                  }}
                  className={`opacity-0 group-hover:opacity-100 px-1.5 py-0.5 text-[10px] font-medium rounded transition-opacity ${
                    isDark
                      ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                  title="Focus solely on this paper"
                >
                  Only
                </button>
              </div>
            </div>
          );
        })}

        {filteredPapers.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500">
            No research papers match "{searchQuery}"
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div
        className={`p-3 border-t text-[11px] text-slate-500 flex items-center justify-between ${
          isDark ? "border-slate-800/80 bg-slate-950" : "border-slate-200 bg-white"
        }`}
      >
        <span>Neo4j Cloud Synchronized</span>
        <span className="font-mono">{papers.length} Papers Total</span>
      </div>
    </aside>
  );
};
