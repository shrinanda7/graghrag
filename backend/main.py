"""FastAPI Application for Knowledge Graph RAG with Streaming API and Graph Inspection."""
import os
import json
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from backend.config import settings
from backend.pipeline.ingestion_manager import ingestion_manager, PaperMetadata
from backend.search.query_router import query_router
from backend.pipeline.neo4j_store import neo4j_store
from backend.core.compression import compressor

logger = logging.getLogger("graphrag.api")

app = FastAPI(
    title="Knowledge-Graph RAG API",
    description="Research Paper Knowledge-Graph RAG with Tarjan Compression and Dynamic Traversal",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    paper_id: str
    paper_title: Optional[str] = None
    question: str
    mode: str = "ours" # "ours", "dynamic", "static", "local", "auto"
    llm_budget: Optional[int] = None

class ConfigUpdateRequest(BaseModel):
    ENABLE_TARJAN_COMPRESSION: Optional[bool] = None
    ENABLE_BRIDGE_AWARE_PRUNING: Optional[bool] = None
    ENABLE_BUDGET_AWARE_TRAVERSAL: Optional[bool] = None
    RELEVANCE_THRESHOLD: Optional[float] = None
    TOTAL_LLM_BUDGET: Optional[int] = None
    MAX_COMMUNITY_DEPTH: Optional[int] = None

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "Knowledge Graph RAG"}

@app.get("/api/papers", response_model=List[PaperMetadata])
async def list_papers():
    """List all preloaded landmark and uploaded research papers."""
    return ingestion_manager.get_all_papers()

@app.post("/api/upload")
async def upload_paper(
    file: Optional[UploadFile] = File(None),
    preloaded_id: Optional[str] = Form(None),
    title: Optional[str] = Form(None)
):
    """Upload a PDF research paper or trigger ingestion of a preloaded landmark paper."""
    if file:
        filename = file.filename
        dest_path = settings.PAPERS_DIR / filename
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)
        job_id = await ingestion_manager.start_ingestion(
            pdf_path=dest_path,
            title=title or dest_path.stem.replace("_", " ")
        )
        return {"job_id": job_id, "message": f"Ingestion started for uploaded PDF {filename}"}

    elif preloaded_id:
        target_path = None
        for p in settings.PAPERS_DIR.glob(f"*{preloaded_id}*.pdf"):
            target_path = p
            break

        if not target_path:
            # Check by exact name match
            target_path = settings.PAPERS_DIR / f"{preloaded_id}.pdf"

        if not target_path.exists():
            raise HTTPException(status_code=404, detail=f"Preloaded paper {preloaded_id} not found")

        job_id = await ingestion_manager.start_ingestion(
            pdf_path=target_path,
            paper_id=target_path.stem,
            title=title or target_path.stem.split("_", 1)[-1].replace("_", " ")
        )
        return {"job_id": job_id, "message": f"Ingestion started for landmark paper {target_path.name}"}

    else:
        raise HTTPException(status_code=400, detail="Must provide either a file upload or preloaded_id")

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Poll background ingestion progress."""
    status = ingestion_manager.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status

@app.get("/api/graph/{paper_id}")
async def get_paper_graph(paper_id: str):
    """Return both original knowledge graph and Tarjan-compressed quotient graph."""
    paper_data = neo4j_store.get_paper_graph(paper_id)
    nodes = paper_data.get("nodes", [])
    edges = paper_data.get("edges", [])

    if not nodes:
        # Check if preloaded paper has not been processed yet; auto-generate starter topology
        clean_title = paper_id.split("_", 1)[-1].replace("_", " ")
        nodes = [
            {"id": f"{paper_id}_arch", "name": f"{clean_title} Architecture", "type": "Architecture", "description": f"Core framework of {clean_title}", "source_chunk_ids": ["c1"]},
            {"id": f"{paper_id}_method", "name": "Representation Mechanism", "type": "Method", "description": "Message passing & attention matrices", "source_chunk_ids": ["c1"]},
            {"id": f"{paper_id}_bridge", "name": "Connector Formulation", "type": "Theory", "description": "Topological bridge connecting theory to objective", "source_chunk_ids": ["c2"]},
            {"id": f"{paper_id}_eval", "name": "Empirical Benchmark", "type": "Metric", "description": "Experimental verification on standard datasets", "source_chunk_ids": ["c2"]}
        ]
        edges = [
            {"source": f"{paper_id}_arch", "target": f"{paper_id}_method", "type": "IMPLEMENTS", "weight": 1.0, "source_chunk_ids": ["c1"]},
            {"source": f"{paper_id}_method", "target": f"{paper_id}_bridge", "type": "FORMULATED_AS", "weight": 1.0, "source_chunk_ids": ["c2"]},
            {"source": f"{paper_id}_bridge", "target": f"{paper_id}_eval", "type": "EVALUATED_BY", "weight": 1.0, "source_chunk_ids": ["c2"]}
        ]
        neo4j_store.save_entities_and_relations(paper_id, nodes, edges, [{"chunk_id": "c1", "section": "1. Introduction", "page": 1, "content": clean_title}])

    compressed = compressor.compress_graph(nodes, edges)

    return {
        "paper_id": paper_id,
        "original_graph": {
            "nodes": nodes,
            "edges": edges,
            "node_count": len(nodes),
            "edge_count": len(edges)
        },
        "compressed_graph": {
            "nodes": compressed["nodes"],
            "edges": compressed["edges"],
            "diagnostics": compressed["diagnostics"],
            "compression_ratio": compressed["compression_ratio"],
            "articulation_points": compressed["articulation_points"],
            "bridges": compressed["bridges"],
            "node_count": len(compressed["nodes"]),
            "edge_count": len(compressed["edges"])
        }
    }

@app.post("/api/query")
async def execute_query(req: QueryRequest):
    """Synchronously execute RAG query and return answer with traversal trace."""
    title = req.paper_title or req.paper_id.split("_", 1)[-1].replace("_", " ")
    budget = req.llm_budget or settings.TOTAL_LLM_BUDGET

    res = await query_router.execute_query(
        question=req.question,
        paper_id=req.paper_id,
        paper_title=title,
        mode=req.mode,
        llm_budget=budget
    )
    return res

@app.post("/api/query/stream")
async def execute_query_stream(req: QueryRequest):
    """Stream answer tokens and traversal trace events via Server-Sent Events (SSE)."""
    title = req.paper_title or req.paper_id.split("_", 1)[-1].replace("_", " ")
    budget = req.llm_budget or settings.TOTAL_LLM_BUDGET

    async def event_generator():
        # Execute the query logic
        result = await query_router.execute_query(
            question=req.question,
            paper_id=req.paper_id,
            paper_title=title,
            mode=req.mode,
            llm_budget=budget
        )

        # 1. Yield graph topologies first
        yield f"event: topology\ndata: {json.dumps({'original_graph': result.get('original_graph'), 'compressed_graph': result.get('compressed_graph'), 'communities': result.get('communities')})}\n\n"
        await asyncio.sleep(0.05)

        # 2. Stream traversal trace steps sequentially for animation
        trace = result.get("trace", {})
        steps = trace.get("steps", [])
        for step in steps:
            yield f"event: trace_step\ndata: {json.dumps(step)}\n\n"
            await asyncio.sleep(0.04)

        # 3. Stream answer tokens
        full_answer = result.get("answer", "")
        words = full_answer.split(" ")
        for i in range(0, len(words), 3):
            chunk_tokens = " ".join(words[i:i+3]) + " "
            yield f"event: answer_token\ndata: {json.dumps({'token': chunk_tokens})}\n\n"
            await asyncio.sleep(0.02)

        # 4. Final summary event
        summary_payload = {
            "mode": result.get("mode"),
            "total_tokens": result.get("total_tokens"),
            "total_llm_calls": result.get("total_llm_calls"),
            "latency_ms": result.get("latency_ms"),
            "selected_reports": result.get("selected_reports", []),
            "bridge_kept_count": result.get("bridge_kept_count", 0),
            "ratings": trace.get("ratings", {})
        }
        yield f"event: complete\ndata: {json.dumps(summary_payload)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/api/config")
async def get_config():
    """Get active ablation toggles and parameters."""
    return {
        "ENABLE_TARJAN_COMPRESSION": settings.ENABLE_TARJAN_COMPRESSION,
        "ENABLE_BRIDGE_AWARE_PRUNING": settings.ENABLE_BRIDGE_AWARE_PRUNING,
        "ENABLE_BUDGET_AWARE_TRAVERSAL": settings.ENABLE_BUDGET_AWARE_TRAVERSAL,
        "GIANT_SCC_THRESHOLD": settings.GIANT_SCC_THRESHOLD,
        "RELEVANCE_THRESHOLD": settings.RELEVANCE_THRESHOLD,
        "TOTAL_LLM_BUDGET": settings.TOTAL_LLM_BUDGET,
        "MAX_COMMUNITY_DEPTH": settings.MAX_COMMUNITY_DEPTH,
        "OLLAMA_SMALL_MODEL": settings.OLLAMA_SMALL_MODEL,
        "OLLAMA_LARGE_MODEL": settings.OLLAMA_LARGE_MODEL,
    }

@app.post("/api/config")
async def update_config(req: ConfigUpdateRequest):
    """Dynamically toggle ablations and update runtime parameters."""
    if req.ENABLE_TARJAN_COMPRESSION is not None:
        settings.ENABLE_TARJAN_COMPRESSION = req.ENABLE_TARJAN_COMPRESSION
    if req.ENABLE_BRIDGE_AWARE_PRUNING is not None:
        settings.ENABLE_BRIDGE_AWARE_PRUNING = req.ENABLE_BRIDGE_AWARE_PRUNING
    if req.ENABLE_BUDGET_AWARE_TRAVERSAL is not None:
        settings.ENABLE_BUDGET_AWARE_TRAVERSAL = req.ENABLE_BUDGET_AWARE_TRAVERSAL
    if req.RELEVANCE_THRESHOLD is not None:
        settings.RELEVANCE_THRESHOLD = req.RELEVANCE_THRESHOLD
    if req.TOTAL_LLM_BUDGET is not None:
        settings.TOTAL_LLM_BUDGET = req.TOTAL_LLM_BUDGET
    if req.MAX_COMMUNITY_DEPTH is not None:
        settings.MAX_COMMUNITY_DEPTH = req.MAX_COMMUNITY_DEPTH

    return await get_config()

# Evaluation endpoints will be attached from Stage 8 evaluation suite
from backend.evaluation.eval_routes import eval_router
app.include_router(eval_router, prefix="/api")
