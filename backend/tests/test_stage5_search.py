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
