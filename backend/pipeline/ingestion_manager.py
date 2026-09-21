"""Background Ingestion Job Manager with fine-grained status and progress states."""
import os
import uuid
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from backend.config import settings
from backend.pipeline.pdf_extractor import pdf_extractor
from backend.pipeline.chunker import chunker
from backend.pipeline.extractor import extractor
from backend.pipeline.entity_merging import entity_merger
from backend.pipeline.neo4j_store import neo4j_store

logger = logging.getLogger("graphrag.ingestion")

class JobStatus(BaseModel):
    job_id: str
    paper_id: str
    paper_title: str
    state: str = "QUEUED"  # QUEUED, EXTRACTING_PDF, CHUNKING, EXTRACTING_ENTITIES, MERGING_ENTITIES, STORING_GRAPH, COMPLETED, FAILED
    progress: int = 0      # 0 to 100
    message: str = "Job created"
    num_chunks: int = 0
    num_entities: int = 0
    num_relations: int = 0
    error: Optional[str] = None

class PaperMetadata(BaseModel):
    paper_id: str
    title: str
    filename: str
    file_size_kb: int
    is_preloaded: bool
    status: str = "ready" # pending, processing, ready, failed
    num_entities: int = 0
    num_relations: int = 0
    num_communities: int = 0

class IngestionManager:
    """Orchestrates document ingestion background tasks and status tracking."""

    def __init__(self):
        self.jobs: Dict[str, JobStatus] = {}
        self.papers: Dict[str, PaperMetadata] = {}
        self._init_preloaded_papers()

    def _init_preloaded_papers(self):
        """Register the 10 preloaded landmark research papers in the catalog."""
        if not settings.PAPERS_DIR.exists():
            return

        for pdf_file in settings.PAPERS_DIR.glob("*.pdf"):
            paper_id = pdf_file.stem
            clean_title = pdf_file.stem.split("_", 1)[-1].replace("_", " ")
            size_kb = pdf_file.stat().st_size // 1024
            self.papers[paper_id] = PaperMetadata(
                paper_id=paper_id,
                title=clean_title,
                filename=pdf_file.name,
                file_size_kb=size_kb,
                is_preloaded=True,
                status="ready"
            )

    def get_all_papers(self) -> List[PaperMetadata]:
        # Refresh catalog
        self._init_preloaded_papers()
        return list(self.papers.values())

    def get_job_status(self, job_id: str) -> Optional[JobStatus]:
        return self.jobs.get(job_id)

    async def start_ingestion(self, pdf_path: Path, paper_id: Optional[str] = None, title: Optional[str] = None) -> str:
        """Start async ingestion job."""
        job_id = str(uuid.uuid4())[:8]
        pid = paper_id or pdf_path.stem
        ptype = title or pdf_path.stem.replace("_", " ")

        status = JobStatus(job_id=job_id, paper_id=pid, paper_title=ptype, state="QUEUED", progress=5)
        self.jobs[job_id] = status

        # Spawn background task
        asyncio.create_task(self._run_pipeline(job_id, pdf_path, pid, ptype))
        return job_id

    async def _run_pipeline(self, job_id: str, pdf_path: Path, paper_id: str, title: str):
        status = self.jobs[job_id]
        try:
            # 1. Extract PDF
            status.state = "EXTRACTING_PDF"
            status.progress = 15
            status.message = "Extracting structured text and section headings from PDF..."
            sections = pdf_extractor.extract_from_pdf(pdf_path)

            # 2. Chunking
            status.state = "CHUNKING"
            status.progress = 30
            status.message = f"Partitioning {len(sections)} sections into semantic chunks..."
            chunks = chunker.chunk_sections(paper_id, sections)
            status.num_chunks = len(chunks)

            # 3. Entity & Relation Extraction
            status.state = "EXTRACTING_ENTITIES"
            status.progress = 50
            status.message = f"Extracting entities & directed relations from {len(chunks)} chunks..."

            raw_entities: List[Dict[str, Any]] = []
            raw_relations: List[Dict[str, Any]] = []

            for idx, c in enumerate(chunks[:25]): # Ingest primary chunks
                extracted = await extractor.extract_from_chunk(c)
                raw_entities.extend(extracted.get("entities", []))
                raw_relations.extend(extracted.get("relations", []))

            # 4. Entity Merging & Deduplication
            status.state = "MERGING_ENTITIES"
            status.progress = 75
            status.message = "Canonical entity resolution and alias merging..."
            merged_ents, merged_rels = entity_merger.merge_graph(raw_entities, raw_relations)
            status.num_entities = len(merged_ents)
            status.num_relations = len(merged_rels)

            # 5. Graph Persistence (Neo4j / fallback)
            status.state = "STORING_GRAPH"
            status.progress = 90
            status.message = f"Persisting {len(merged_ents)} entities and {len(merged_rels)} relations to graph..."
            neo4j_store.save_entities_and_relations(paper_id, merged_ents, merged_rels, chunks)

            # Complete
            status.state = "COMPLETED"
            status.progress = 100
            status.message = f"Successfully ingested paper! Graph ready with {len(merged_ents)} entities and {len(merged_rels)} relations."

            # Update catalog
            self.papers[paper_id] = PaperMetadata(
                paper_id=paper_id,
                title=title,
                filename=pdf_path.name,
                file_size_kb=pdf_path.stat().st_size // 1024,
                is_preloaded=False,
                status="ready",
                num_entities=len(merged_ents),
                num_relations=len(merged_rels)
            )
        except Exception as e:
            logger.error(f"Ingestion job {job_id} failed: {e}", exc_info=True)
            status.state = "FAILED"
            status.error = str(e)
            status.message = f"Ingestion error: {e}"

ingestion_manager = IngestionManager()
