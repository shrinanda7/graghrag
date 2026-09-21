"""Stage 2 Verification Tests: PDF Extraction, Section-Aware Chunking, Entity Extraction & Merging."""
import pytest
from pathlib import Path
from backend.config import settings
from backend.pipeline.pdf_extractor import pdf_extractor
from backend.pipeline.chunker import chunker
from backend.pipeline.extractor import extractor
from backend.pipeline.entity_merging import entity_merger
from backend.pipeline.neo4j_store import neo4j_store

@pytest.mark.asyncio
async def test_pdf_extraction_and_chunking():
    """Verify that a landmark paper PDF is extracted with sections and correctly chunked."""
    test_pdf = settings.PAPERS_DIR / "1609.02907_GCN.pdf"
    assert test_pdf.exists(), "Sample landmark PDF must exist in data/papers"

    sections = pdf_extractor.extract_from_pdf(test_pdf)
    assert len(sections) > 0, "Should extract at least one section"
    assert any("title" in s and len(s["text"]) > 20 for s in sections)

    chunks = chunker.chunk_sections("gcn_paper", sections)
    assert len(chunks) > 0
    assert chunks[0]["chunk_id"].startswith("gcn_paper_chunk_")
    assert "section" in chunks[0]
    assert "page" in chunks[0]
    assert "content" in chunks[0]

@pytest.mark.asyncio
async def test_entity_extraction_and_merging():
    """Verify entity & relationship extraction and merging."""
    sample_chunk = {
        "chunk_id": "test_chunk_0001",
        "section": "Model Architecture",
        "page": 2,
        "content": "We propose the Graph Convolutional Network (GCN) that leverages spectral graph convolutions. "
                   "GCN outperforms DeepWalk and node2vec on citation datasets like Cora and Citeseer. "
                   "The Transformer model uses Self-Attention mechanisms."
    }

    result = await extractor.extract_from_chunk(sample_chunk)
    assert "entities" in result
    assert "relations" in result

    entities = result["entities"]
    relations = result["relations"]

    assert len(entities) >= 2, f"Should extract multiple entities, got {len(entities)}"

    # Check entity format
    for ent in entities:
        assert "id" in ent
        assert "name" in ent
        assert "type" in ent
        assert "source_chunk_ids" in ent
        assert "test_chunk_0001" in ent["source_chunk_ids"]

    # Check relation format (must be directed)
    for rel in relations:
        assert "source" in rel
        assert "target" in rel
        assert "type" in rel
        assert rel["source"] != rel["target"]

    # Test merging
    raw_entities = entities + [
        {"id": "gcn", "name": "GCN", "type": "Architecture", "description": "GCN description", "source_chunk_ids": ["test_chunk_0002"]},
        {"id": "cora", "name": "Cora", "type": "Dataset", "description": "Benchmark dataset", "source_chunk_ids": ["test_chunk_0002"]}
    ]
    raw_relations = relations + [
        {"source": "gcn", "target": "cora", "type": "EVALUATED_ON", "description": "Tested on Cora", "weight": 1.0, "source_chunk_ids": ["test_chunk_0002"]}
    ]

    merged_ents, merged_rels = entity_merger.merge_graph(raw_entities, raw_relations)
    assert len(merged_ents) > 0
    # GCN should be normalized and chunk references merged
    gcn_nodes = [e for e in merged_ents if "graph_convolutional_network" in e["id"] or "gcn" in e["id"]]
    assert len(gcn_nodes) >= 1
    assert len(gcn_nodes[0]["source_chunk_ids"]) >= 1

    # Persist in store
    neo4j_store.save_entities_and_relations("test_paper_stage2", merged_ents, merged_rels, [sample_chunk])
    graph = neo4j_store.get_paper_graph("test_paper_stage2")
    assert len(graph["nodes"]) == len(merged_ents)
