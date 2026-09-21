"""Section-aware PDF Text and Structure Extractor."""
import re
import logging
from pathlib import Path
from typing import List, Dict, Any
from pypdf import PdfReader

logger = logging.getLogger("graphrag.pdf")

class ExtractedSection:
    def __init__(self, title: str, page: int, text: str):
        self.title = title
        self.page = page
        self.text = text

    def to_dict(self) -> Dict[str, Any]:
        return {"title": self.title, "page": self.page, "text": self.text}

class PDFExtractor:
    """Extracts text while detecting section headings and page numbers."""

    HEADING_PATTERNS = [
        re.compile(r"^(?:[0-9IVXLCDM]+\.?\s+)?(Abstract|Introduction|Related\s+Work|Background|Methodology|Model|Architecture|Approach|Experiments|Results|Discussion|Conclusion|References)\b", re.IGNORECASE),
        re.compile(r"^[0-9]+(\.[0-9]+)*\s+[A-Z][A-Za-z0-9\s]{2,60}$"),
        re.compile(r"^[A-Z\s]{4,50}$")
    ]

    def extract_from_pdf(self, pdf_path: Path) -> List[Dict[str, Any]]:
        """Extract structured sections with page numbers from a PDF file."""
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF not found at {pdf_path}")

        reader = PdfReader(str(pdf_path))
        sections: List[Dict[str, Any]] = []
        current_title = "Abstract / Header"
        current_page = 1
        current_lines: List[str] = []

        for page_idx, page in enumerate(reader.pages):
            page_num = page_idx + 1
            text = page.extract_text() or ""
            lines = text.split("\n")

            for line in lines:
                cleaned = line.strip()
                if not cleaned:
                    continue

                # Check if this line is a section heading
                is_heading = False
                if len(cleaned) < 80:
                    for pattern in self.HEADING_PATTERNS:
                        if pattern.match(cleaned):
                            is_heading = True
                            break

                if is_heading:
                    # Flush current section
                    if current_lines:
                        sections.append({
                            "title": current_title,
                            "page": current_page,
                            "text": " ".join(current_lines).strip()
                        })
                        current_lines = []
                    current_title = cleaned
                    current_page = page_num
                else:
                    current_lines.append(cleaned)

        # Flush trailing section
        if current_lines:
            sections.append({
                "title": current_title,
                "page": current_page,
                "text": " ".join(current_lines).strip()
            })

        # Fallback if no headings matched
        if not sections and len(reader.pages) > 0:
            for page_idx, page in enumerate(reader.pages):
                txt = (page.extract_text() or "").strip()
                if txt:
                    sections.append({"title": f"Page {page_idx + 1}", "page": page_idx + 1, "text": txt})

        logger.info(f"Extracted {len(sections)} sections from {pdf_path.name}")
        return sections

pdf_extractor = PDFExtractor()
