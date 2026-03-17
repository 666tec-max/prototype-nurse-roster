"""
Pydantic request / response schemas for the solver API.
Field names match the Supabase table columns exactly.
"""

from pydantic import BaseModel, Field
from typing import Optional


# ──── Input Models (from Supabase) ──────────────────────────────────────────

class StaffInput(BaseModel):
    staff_id: str
    name: str
    department_id: Optional[str] = None
    grade_id: Optional[str] = None
    max_shifts_per_week: int = 5
    max_consecutive_shifts: int = 4
    staff_skills: list[str] = Field(default_factory=list)   # skill_ids
    hierarchy_level: int = 99                                # from grades join
    current_month_hours: float = 0.0                         # pre-computed
    total_shifts: int = 0                                    # pre-computed


class ShiftInput(BaseModel):
    shift_id: str
    start_time: str           # "HH:MM:SS"
    end_time: str             # "HH:MM:SS"
    duration_minutes: Optional[int] = None


class DemandInput(BaseModel):
    shift_id: str
    required_grade: Optional[str] = None
    required_skill: Optional[str] = None
    minimum_staff: int = 1
    date_start: Optional[str] = None
    date_end: Optional[str] = None


class LeaveInput(BaseModel):
    staff_id: str
    start_date: str
    end_date: str


class FixedAssignmentInput(BaseModel):
    staff_id: str
    shift_id: str
    start_date: str
    end_date: Optional[str] = None


class PastRosterEntry(BaseModel):
    staff_id: str
    date: str
    shift_id: str


class SoftConstraintInput(BaseModel):
    constraint_key: str
    priority: int = 5


class GradeInput(BaseModel):
    grade_id: str
    hierarchy_level: int = 0


# ──── Solver Request ────────────────────────────────────────────────────────

class SolveRequest(BaseModel):
    department_id: str
    start_date: str                                         # "YYYY-MM-DD"
    end_date: str                                           # "YYYY-MM-DD"
    user_id: str
    time_limit_seconds: int = 30

    staff: list[StaffInput]
    shifts: list[ShiftInput]
    demand: list[DemandInput]
    leaves: list[LeaveInput] = Field(default_factory=list)
    fixed_assignments: list[FixedAssignmentInput] = Field(default_factory=list)
    past_roster: list[PastRosterEntry] = Field(default_factory=list)
    soft_constraints: list[SoftConstraintInput] = Field(default_factory=list)
    grades: list[GradeInput] = Field(default_factory=list)


# ──── Solver Response ───────────────────────────────────────────────────────

class Assignment(BaseModel):
    staff_id: str
    date: str
    shift_id: str


class SolveResponse(BaseModel):
    status: str                 # OPTIMAL, FEASIBLE, INFEASIBLE, MODEL_INVALID
    assignments: list[Assignment] = Field(default_factory=list)
    solve_time_ms: int = 0
    score: Optional[str] = None
    message: Optional[str] = None
