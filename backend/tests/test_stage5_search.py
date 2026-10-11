"""Stage 5 Verification Tests: Search Modes (Static, Dynamic, Ours, Local) & Traversal Traces."""
import pytest
from backend.search.query_router import query_router
from backend.pipeline.neo4j_store import neo4j_store

@pytest.fixture(autouse=True)
def setup_test_graph():
    """Seed test graph for search evaluations."""
    paper_id = "test_paper_stage5"
    nodes = [
        {"id": "transformer", "name": "Transformer", "type": "Architecture", "description": "Sequence-to-sequence model using self-attention", "source_chunk_ids": ["c1"]},
        {"id": "attention", "name": "Multi-Head Attention", "type": "Method", "description": "Parallel attention heads capturing diverse representation subspaces", "source_chunk_ids": ["c1"]},
        {"id": "bleu", "name": "BLEU Score", "type": "Metric", "description": "Bilingual Evaluation Understudy metric for translation quality", "source_chunk_ids": ["c2"]},
        {"id": "wmt", "name": "WMT 2014 En-De", "type": "Dataset", "description": "Machine translation benchmark dataset", "source_chunk_ids": ["c2"]},
    ]
    edges = [
        {"source": "transformer", "target": "attention", "type": "USES", "weight": 1.0, "source_chunk_ids": ["c1"]},
        {"source": "attention", "target": "transformer", "type": "BELONGS_TO", "weight": 1.0, "source_chunk_ids": ["c1"]},
        {"source": "transformer", "target": "wmt", "type": "EVALUATED_ON", "weight": 1.0, "source_chunk_ids": ["c2"]},
        {"source": "wmt", "target": "bleu", "type": "MEASURED_BY", "weight": 1.0, "source_chunk_ids": ["c2"]}
    ]
    chunks = [
        {"chunk_id": "c1", "section": "3.1 Multi-Head Attention", "page": 4, "content": "Multi-Head Attention allows the model to jointly attend to information."},
        {"chunk_id": "c2", "section": "5.1 Machine Translation", "page": 7, "content": "On the WMT 2014 English-to-German task, the Transformer establishes a new state of the art BLEU score of 28.4."}
    ]
    neo4j_store.save_entities_and_relations(paper_id, nodes, edges, chunks)
    return paper_id

@pytest.mark.asyncio
async def test_static_search():
    res = await query_router.execute_query(
        question="How does Multi-Head Attention improve performance?",
        paper_id="test_paper_stage5",
        paper_title="Attention Is All You Need",
        mode="static"
    )
    assert res["mode"] == "static"
    assert "answer" in res
    assert "trace" in res
    assert len(res["trace"]["steps"]) > 0
    assert res["total_llm_calls"] >= 1

@pytest.mark.asyncio
async def test_dynamic_search():
    res = await query_router.execute_query(
        question="What dataset was used for evaluation and what was the metric?",
        paper_id="test_paper_stage5",
        paper_title="Attention Is All You Need",
        mode="dynamic"
    )
    assert res["mode"] == "dynamic"
    assert "answer" in res
    assert "trace" in res
    assert len(res["trace"]["steps"]) > 0

@pytest.mark.asyncio
async def test_ours_search_with_bridge_and_budget():
    res = await query_router.execute_query(
        question="Describe the core architecture and translation benchmarks.",
        paper_id="test_paper_stage5",
        paper_title="Attention Is All You Need",
        mode="ours",
        llm_budget=6
    )
    assert res["mode"] == "ours"
    assert "answer" in res
    assert "compressed_graph" in res
    assert "original_graph" in res
    assert "trace" in res
    # Verify trace contains actions
    actions = [s["action"] for s in res["trace"]["steps"]]
    assert "VISIT" in actions

@pytest.mark.asyncio
async def test_local_search():
    res = await query_router.execute_query(
        question="What is the BLEU score on WMT 2014?",
        paper_id="test_paper_stage5",
        paper_title="Attention Is All You Need",
        mode="local"
    )
    assert res["mode"] == "local"
    assert "answer" in res
    assert "trace" in res

@pytest.mark.asyncio
async def test_missing_graph_causes_no_writes_and_no_llm_calls(monkeypatch):
    """Confirm that a missing graph returns no_indexed_graph status with no graph writes and 0 LLM calls."""
    unindexed_id = "missing_paper_unindexed_999"
    # Ensure graph is empty before test
    assert len(neo4j_store.get_paper_graph(unindexed_id)["nodes"]) == 0

    res = await query_router.execute_query(
        question="Explain the core mechanism of this unindexed paper.",
        paper_id=unindexed_id,
        paper_title="Unindexed Paper Title",
        mode="ours"
    )

    # 1. Status must explicitly be no_indexed_graph
    assert res["status"] == "no_indexed_graph"
    assert "No indexed knowledge graph found" in res["answer"]

    # 2. No LLM calls made
    assert res["total_llm_calls"] == 0
    assert res["total_tokens"] == 0

    # 3. No graph writes occurred: no entities/edges created in Neo4j
    post_check = neo4j_store.get_paper_graph(unindexed_id)
    assert len(post_check["nodes"]) == 0
    assert len(post_check["edges"]) == 0

@pytest.mark.asyncio
async def test_valid_indexed_paper_query_execution():
    """Confirm that a valid, indexed paper executes normal query retrieval."""
    res = await query_router.execute_query(
        question="How does Multi-Head Attention relate to the Transformer architecture?",
        paper_id="test_paper_stage5",
        paper_title="Attention Is All You Need",
        mode="ours"
    )
    assert res.get("status") != "no_indexed_graph"
    assert "answer" in res
    assert len(res["answer"]) > 0
    assert "original_graph" in res
    assert len(res["original_graph"]["nodes"]) > 0
    assert "trace" in res
    assert len(res["trace"]["steps"]) > 0

