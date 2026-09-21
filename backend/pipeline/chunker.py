"""Section-aware Chunker maintaining section titles, page references, and boundaries."""
import re
import hashlib
from typing import List, Dict, Any
from backend.config import settings

class SectionAwareChunker:
    """Splits structured paper sections into semantic chunks."""

    def __init__(self, chunk_size: int = settings.CHUNK_SIZE, overlap: int = settings.CHUNK_OVERLAP):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk_sections(self, paper_id: str, sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Chunk text respecting section boundaries with consistent chunk IDs."""
        chunks: List[Dict[str, Any]] = []
        chunk_idx = 0

        for sec in sections:
            title = sec.get("title", "Section")
            page = sec.get("page", 1)
            text = sec.get("text", "").strip()

            if not text:
                continue

            words = text.split()
            if len(words) <= self.chunk_size:
                chunk_id = f"{paper_id}_chunk_{chunk_idx:04d}"
                chunks.append({
                    "chunk_id": chunk_id,
                    "paper_id": paper_id,
                    "section": title,
                    "page": page,
                    "content": text,
                    "word_count": len(words)
                })
                chunk_idx += 1
            else:
                # Split with overlap
                start = 0
                while start < len(words):
                    end = min(start + self.chunk_size, len(words))
                    chunk_text = " ".join(words[start:end])
                    chunk_id = f"{paper_id}_chunk_{chunk_idx:04d}"
                    chunks.append({
                        "chunk_id": chunk_id,
                        "paper_id": paper_id,
                        "section": title,
                        "page": page,
                        "content": chunk_text,
                        "word_count": len(words[start:end])
                    })
                    chunk_idx += 1
                    if end >= len(words):
                        break
                    start += (self.chunk_size - self.overlap)

        return chunks

chunker = SectionAwareChunker()
