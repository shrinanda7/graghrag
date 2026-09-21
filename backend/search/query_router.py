"""Unified Query Router for Knowledge Graph RAG with Routing Intent Classification."""
import re
import logging
from typing import Dict, Any, Optional

from backend.config import settings
from backend.core.llm_client import ollama_client
from backend.pipeline.neo4j_store import neo4j_store
from backend.core.clustering import clusterer
from backend.core.compression import compressor
from backend.pipeline.report_generator import report_generator
from backend.search.static_search import static_search
from backend.search.dynamic_search import dynamic_search
from backend.search.ours_search import ours_search
from backend.search.local_search import local_search

logger = logging.getLogger("graphrag.router")

class QueryRouter:
    """Dispatches search queries to appropriate retrieval engine with unified response schema."""

    ROUTER_PROMPT = """Classify this research query as either 'GLOBAL' (overview, main contributions, theoretical analysis, methodology comparison) or 'LOCAL' (specific metric value, parameter, dataset fact, specific entity definition).

Query: {query}

Return ONLY 'GLOBAL' or 'LOCAL'."""

    async def execute_query(
        self,
        question: str,
        paper_id: str,
        paper_title: str,
        mode: str = "ours",
        llm_budget: int = settings.TOTAL_LLM_BUDGET
    ) -> Dict[str, Any]:
        """Route and execute search with graph topology and traversal trace."""
        # 1. Load paper graph
        paper_data = neo4j_store.get_paper_graph(paper_id)
        nodes = paper_data.get("nodes", [])
        edges = paper_data.get("edges", [])

        # If graph empty, create a minimal initial structure from paper name
        if not nodes:
            nodes = [
                {"id": f"{paper_id}_core", "name": paper_title, "type": "Architecture", "description": f"Core methodology of {paper_title}", "source_chunk_ids": ["c1"]},
                {"id": f"{paper_id}_eval", "name": "Empirical Evaluation", "type": "Metric", "description": "Benchmark metrics and validation", "source_chunk_ids": ["c2"]}
            ]
            edges = [{"source": f"{paper_id}_core", "target": f"{paper_id}_eval", "type": "EVALUATED_ON", "weight": 1.0, "source_chunk_ids": ["c1"]}]
            neo4j_store.save_entities_and_relations(paper_id, nodes, edges, [{"chunk_id": "c1", "section": "Intro", "page": 1, "content": paper_title}])

        # 2. Compress graph (Tarjan SCCs, bridges, articulation points)
        compressed = compressor.compress_graph(nodes, edges)

        # 3. Community hierarchy & reports
        # Build communities on compressed quotient graph
        communities = clusterer.build_hierarchy(compressed["nodes"], compressed["edges"], paper_id)
        communities = await report_generator.generate_reports_for_hierarchy(
            communities, compressed["nodes"], compressed["edges"], use_cache=True
        )

        # 4. Determine execution mode
        effective_mode = mode.lower()
        if effective_mode == "auto":
            effective_mode = await self._classify_intent(question)

        # 5. Dispatch
        if effective_mode == "static":
            result = await static_search.search(
                question=question,
                paper_id=paper_id,
                paper_title=paper_title,
                communities=communities,
                level=1
            )
        elif effective_mode == "dynamic":
            result = await dynamic_search.search(
                question=question,
                paper_id=paper_id,
                paper_title=paper_title,
                communities=communities,
                max_depth=settings.MAX_COMMUNITY_DEPTH
            )
        elif effective_mode == "local":
            result = await local_search.search(
                question=question,
                paper_id=paper_id,
                paper_title=paper_title,
                k_hops=2
            )
        else: # "ours" (default)
            result = await ours_search.search(
                question=question,
                paper_id=paper_id,
                paper_title=paper_title,
                communities=communities,
                compressed_graph=compressed,
                llm_budget=llm_budget
            )

        # Attach graph topology for frontend Cytoscape visualization
        result["original_graph"] = {
            "nodes": nodes,
            "edges": edges
        }
        result["compressed_graph"] = {
            "nodes": compressed["nodes"],
            "edges": compressed["edges"],
            "diagnostics": compressed["diagnostics"],
            "compression_ratio": compressed["compression_ratio"],
            "articulation_points": compressed["articulation_points"],
            "bridges": compressed["bridges"]
        }
        result["communities"] = {cid: c.to_dict() for cid, c in communities.items()}

        return result

    async def _classify_intent(self, question: str) -> str:
        """Heuristic and LLM classification for auto-routing."""
        # Common factual signals
        factual_keywords = ["what is", "learning rate", "dataset", "accuracy", "bleu", "hyperparameter", "batch size"]
        if any(kw in question.lower() for kw in factual_keywords):
            return "local"

        res, log = await ollama_client.generate(
            prompt=self.ROUTER_PROMPT.format(query=question),
            model=settings.OLLAMA_SMALL_MODEL,
            temperature=0.0
        )
        if "LOCAL" in (res or "").upper():
            return "local"
        return "ours"

query_router = QueryRouter()
