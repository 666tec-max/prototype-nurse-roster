"""
FastAPI REST API for the OR-Tools nurse rostering solver.
Deployed on Google Cloud Run.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import traceback

from models import SolveRequest, SolveResponse
from solver import solve

app = FastAPI(
    title="Nurse Roster Solver",
    description="OR-Tools CP-SAT solver for nurse shift scheduling",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "solver": "or-tools-cpsat"}


@app.post("/solve", response_model=SolveResponse)
def solve_roster(req: SolveRequest):
    try:
        result = solve(req)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
