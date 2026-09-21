"""FastAPI Router for Comparative Benchmark and Evaluation Suite."""
from fastapi import APIRouter, Query, Response
from typing import Optional

from backend.evaluation.question_generator import get_evaluation_questions
from backend.evaluation.benchmark_runner import benchmark_runner

eval_router = APIRouter(tags=["Evaluation & Benchmarks"])

@eval_router.get("/benchmark/questions")
async def list_evaluation_questions(
    category: str = Query("all", description="Category filter: global, intermediate, local, all"),
    limit: int = Query(50, description="Max questions to return")
):
    """Retrieve 50 landmark evaluation questions categorized by retrieval scope."""
    questions = get_evaluation_questions(category=category, limit=limit)
    return {
        "total": len(questions),
        "questions": [q.model_dump() for q in questions]
    }

@eval_router.post("/benchmark/run")
async def trigger_benchmark(
    num_questions: int = Query(6, description="Number of questions to evaluate (fast run=6, full=50)"),
    randomize_order: bool = Query(True, description="Randomize configuration order for blind judging")
):
    """Run comparative evaluation comparing Static, Dynamic, Ours, and 3 Ablation conditions."""
    results = await benchmark_runner.run_benchmark(num_questions=num_questions, randomize_order=randomize_order)
    return results

@eval_router.get("/benchmark/results")
async def get_latest_benchmark_results():
    """Retrieve aggregate summary and detailed records of the latest benchmark run."""
    summary = benchmark_runner._compute_summary(benchmark_runner.latest_results)
    return {
        "summary": summary,
        "records": benchmark_runner.latest_results
    }

@eval_router.get("/benchmark/export.csv")
async def export_benchmark_csv():
    """Download comparative benchmark results as a CSV file."""
    csv_content = benchmark_runner.export_csv()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=graphrag_ablation_benchmark.csv"}
    )
