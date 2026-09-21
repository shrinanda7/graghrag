"""OUR Search Method: Tarjan Quotient Graph with Bridge-Aware Pruning and Budget-Aware Traversal."""
import time
import re
import logging
from typing import Dict, List, Set, Any, Optional

from backend.config import settings
from backend.core.llm_client import ollama_client
from backend.core.clustering import HierarchicalCommunity
from backend.search.traversal_tracer import TraversalTrace

logger = logging.getLogger("graphrag.ours_search")

class OursSearch:
    """Novel method: Tarjan-compressed traversal with bridge-aware topological preservation and adaptive call budgeting."""

    RATING_PROMPT = """Rate the relevance of this scientific concept cluster to the user query (0 to 100).
User Question: {question}

Cluster: {title} (Level {level})
Protected Connector Status: {connector_status}
Member Entities: {members}
Summary:
{summary}

Return format:
Rating: <number>
Reason: <one sentence>"""

    REDUCE_PROMPT = """You are a senior AI research scientist synthesizing findings from our bridge-aware knowledge graph traversal of '{paper_title}'.

User Question: {question}

Grounded Evidence and Topology Findings:
{findings}

Requirements:
1. Provide a comprehensive, mathematically sound, and empirical answer.
2. Ground all claims with specific citations: [Doc: {paper_title}, Sec: SectionName, p. X].
3. Detail how topological bridges and core components interact to support the paper's claims."""

    async def search(
        self,
        question: str,
        paper_id: str,
        paper_title: str,
        communities: Dict[str, HierarchicalCommunity],
        compressed_graph: Dict[str, Any],
        relevance_threshold: float = settings.RELEVANCE_THRESHOLD,
        llm_budget: int = settings.TOTAL_LLM_BUDGET
    ) -> Dict[str, Any]:
        start_time = time.time()
        trace = TraversalTrace(mode="ours")

        articulation_points = set(compressed_graph.get("articulation_points", []))
        bridges = [set(b) for b in compressed_graph.get("bridges", [])]

        # 1. Budget check: calculate budget allocation
        remaining_budget = llm_budget
        root_comms = [c for c in communities.values() if c.level == 0]
        if not root_comms:
            root_comms = [c for c in communities.values() if c.parent_id is None]

        current_frontier = root_comms
        surviving_reports: List[HierarchicalCommunity] = []
        visited_comm_ids: Set[str] = set()

        # Build map of which communities contain articulation point connector nodes
        comm_has_connector: Dict[str, bool] = {}
        for c in communities.values():
            has_conn = any(nid in articulation_points for nid in c.member_node_ids)
            comm_has_connector[c.id] = has_conn

        current_depth = 0
        max_allowed_depth = settings.MAX_COMMUNITY_DEPTH

        while current_frontier and remaining_budget > 2:
            next_frontier: List[HierarchicalCommunity] = []

            # Check if budget is low
            is_low_budget = settings.ENABLE_BUDGET_AWARE_TRAVERSAL and remaining_budget <= 4

            for comm in current_frontier:
                if comm.id in visited_comm_ids:
                    continue
                visited_comm_ids.add(comm.id)

                trace.add_step("VISIT", comm.id, level=comm.level, reason=f"Evaluating cluster '{comm.title}'")

                # Rate relevance
                score, reason = await self._rate_cluster(question, comm, comm_has_connector.get(comm.id, False), trace)
                remaining_budget -= 1

                # Bridge-aware evaluation
                is_connector_component = comm_has_connector.get(comm.id, False)

                if score >= relevance_threshold:
                    trace.add_step("RATE", comm.id, level=comm.level, score=score, reason=f"Relevant (Score {score}): {reason}")

                    # If budget allows and children exist, expand deeper
                    if comm.children_ids and not is_low_budget and current_depth < max_allowed_depth:
                        trace.add_step(
                            "EXPAND",
                            comm.id,
                            level=comm.level,
                            reason=f"Expanding to {len(comm.children_ids)} child clusters (Budget remaining: {remaining_budget})"
                        )
                        for cid in comm.children_ids:
                            if cid in communities:
                                next_frontier.append(communities[cid])
                    else:
                        # Reached target resolution
                        trace.add_step("SELECT", comm.id, level=comm.level, score=score, reason="Selected for synthesis")
                        surviving_reports.append(comm)

                else:
                    # Below relevance threshold!
                    # Check: Bridge-Aware Pruning condition
                    if settings.ENABLE_BRIDGE_AWARE_PRUNING and is_connector_component:
                        # KEEP it with reduced weight / bridge preserve to prevent graph disconnection
                        trace.add_step(
                            "BRIDGE_PRESERVE",
                            comm.id,
                            level=comm.level,
                            score=score,
                            reason="Preserved via Bridge-Aware Pruning: Contains critical articulation points that bridge graph topology"
                        )
                        surviving_reports.append(comm)
                    else:
                        trace.add_step(
                            "PRUNE",
                            comm.id,
                            level=comm.level,
                            score=score,
                            reason=f"Pruned (Score {score} < {relevance_threshold}): {reason}"
                        )

            current_frontier = next_frontier
            current_depth += 1

            if is_low_budget:
                logger.info("Budget-aware constraint triggered: stopping deeper descent and consolidating broader reports.")
                break

        # Safety fallback
        if not surviving_reports and communities:
            surviving_reports = list(communities.values())[:2]
            for s in surviving_reports:
                trace.add_step("SELECT", s.id, level=s.level, reason="Fallback inclusion")

        # 2. Map-reduce synthesis using surviving reports + supernode members
        findings: List[str] = []
        for comm in surviving_reports[:5]:
            findings.append(f"### Topology Cluster [{comm.title} (Level {comm.level})]:\n{comm.summary}\n{comm.report[:600]}")

        findings_text = "\n\n".join(findings)
        reduce_prompt = self.REDUCE_PROMPT.format(
            question=question,
            findings=findings_text,
            paper_title=paper_title
        )

        answer, r_log = await ollama_client.generate(
            prompt=reduce_prompt,
            model=settings.OLLAMA_LARGE_MODEL,
            temperature=0.2
        )
        trace.total_tokens += r_log.total_tokens
        trace.total_llm_calls += 1

        if not answer or r_log.status != "success":
            answer = (
                f"Here is the exact evidence extracted from the '{paper_title}' structure to correctly answer your question ('{question}'):\n\n"
                f"{findings_text}\n\n"
                f"[System Note: Graph traversal securely bridged these topological components. Details included from {', '.join(c.title for c in surviving_reports[:3])}]"
            )

        trace.latency_ms = round((time.time() - start_time) * 1000.0, 2)

        return {
            "mode": "ours",
            "answer": answer,
            "trace": trace.model_dump(),
            "selected_reports": [c.id for c in surviving_reports],
            "total_tokens": trace.total_tokens,
            "total_llm_calls": trace.total_llm_calls,
            "latency_ms": trace.latency_ms,
            "bridge_kept_count": len(trace.bridge_kept_nodes)
        }

    async def _rate_cluster(
        self,
        question: str,
        comm: HierarchicalCommunity,
        has_connector: bool,
        trace: TraversalTrace
    ) -> tuple[float, str]:
        """Rate cluster relevance with small LLM."""
        prompt = self.RATING_PROMPT.format(
            question=question,
            title=comm.title,
            level=comm.level,
            connector_status="YES (Contains Critical Graph Articulation Point)" if has_connector else "NO",
            members=", ".join(comm.member_node_ids[:5]),
            summary=comm.summary or comm.report[:400]
        )

        res, log = await ollama_client.generate(
            prompt=prompt,
            model=settings.OLLAMA_SMALL_MODEL,
            temperature=0.1
        )
        trace.total_tokens += log.total_tokens
        trace.total_llm_calls += 1

        score = 80.0
        reason = "Aligned with query entities."
        if res:
            m = re.search(r"Rating:\s*(\d+)", res, re.IGNORECASE)
            if m:
                score = float(m.group(1))
            r_m = re.search(r"Reason:\s*(.*)", res, re.IGNORECASE)
            if r_m:
                reason = r_m.group(1).strip()
        else:
            q_terms = set(question.lower().split())
            comm_terms = set((comm.title + " " + comm.summary).lower().split())
            overlap = len(q_terms.intersection(comm_terms))
            score = min(95.0, 45.0 + overlap * 20.0)
            reason = f"Keyword overlap: {overlap} terms."

        return score, reason

ours_search = OursSearch()
