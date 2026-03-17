"""
OR-Tools CP-SAT solver for nurse rostering.

Builds a constraint satisfaction model with:
- BoolVar decision variables: shifts[(staff_id, date_str, shift_id)]
- Hard constraints 1-10 as model constraints
- Soft constraints 1-5 as objective function penalties
"""

from datetime import date, datetime, timedelta
from ortools.sat.python import cp_model
import time

from models import SolveRequest, SolveResponse, Assignment


def _parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _dates_between(start: str, end: str) -> list[date]:
    s = _parse_date(start)
    e = _parse_date(end)
    result = []
    while s <= e:
        result.append(s)
        s += timedelta(days=1)
    return result


def _shift_hours(shift) -> float:
    """Calculate shift duration in hours from start_time / end_time strings."""
    if shift.duration_minutes is not None:
        return shift.duration_minutes / 60.0
    st = datetime.strptime(shift.start_time, "%H:%M:%S")
    et = datetime.strptime(shift.end_time, "%H:%M:%S")
    diff = (et - st).total_seconds()
    if diff <= 0:
        diff += 24 * 3600  # crosses midnight
    return diff / 3600.0


def _is_night_shift(shift) -> bool:
    """Night shift = end_time < start_time (crosses midnight)."""
    return shift.end_time < shift.start_time


def solve(req: SolveRequest) -> SolveResponse:
    t0 = time.time()
    model = cp_model.CpModel()

    # ── Precompute lookup maps ──────────────────────────────────────────────
    all_dates = _dates_between(req.start_date, req.end_date)
    date_strs = [d.isoformat() for d in all_dates]
    shifts_map = {s.shift_id: s for s in req.shifts}
    grades_map = {g.grade_id: g.hierarchy_level for g in req.grades}
    soft_map = {sc.constraint_key: sc.priority for sc in req.soft_constraints}

    staff_skills = {}
    for s in req.staff:
        staff_skills[s.staff_id] = set(s.staff_skills)

    # Pre-build leave lookup: (staff_id, date_str) -> True
    leave_set: set[tuple[str, str]] = set()
    for lv in req.leaves:
        ld = _parse_date(lv.start_date)
        le = _parse_date(lv.end_date)
        while ld <= le:
            leave_set.add((lv.staff_id, ld.isoformat()))
            ld += timedelta(days=1)

    # Pre-build fixed assignment lookup: (staff_id, date_str) -> shift_id
    fixed_map: dict[tuple[str, str], str] = {}
    for fa in req.fixed_assignments:
        fd = _parse_date(fa.start_date)
        fe = _parse_date(fa.end_date) if fa.end_date else fd
        while fd <= fe:
            fixed_map[(fa.staff_id, fd.isoformat())] = fa.shift_id
            fd += timedelta(days=1)

    # Pre-build past roster lookup: (staff_id, date_str) -> shift_id
    past_map: dict[tuple[str, str], str] = {}
    for pr in req.past_roster:
        past_map[(pr.staff_id, pr.date)] = pr.shift_id

    # Compute eligible (demand, date, staff) combinations for grade/skill
    demand_for_date: dict[str, list] = {}
    for d_str in date_strs:
        day_demand = [
            dm for dm in req.demand
            if (not dm.date_start or dm.date_start <= d_str)
            and (not dm.date_end or dm.date_end >= d_str)
        ]
        demand_for_date[d_str] = day_demand

    # ── Decision Variables ──────────────────────────────────────────────────
    # x[(staff_id, date_str, shift_id)] = 1 if staff works that shift on that day
    x: dict[tuple[str, str, str], cp_model.IntVar] = {}

    # Helper: any_shift[(staff_id, date_str)] = 1 if staff works any shift
    any_shift: dict[tuple[str, str], cp_model.IntVar] = {}

    for staff in req.staff:
        for d_str in date_strs:
            shift_vars_for_day = []
            for shift in req.shifts:
                var = model.new_bool_var(f"x_{staff.staff_id}_{d_str}_{shift.shift_id}")
                x[(staff.staff_id, d_str, shift.shift_id)] = var
                shift_vars_for_day.append(var)

            # any_shift helper variable
            a = model.new_bool_var(f"any_{staff.staff_id}_{d_str}")
            any_shift[(staff.staff_id, d_str)] = a
            # a == 1 iff at least one shift var is 1
            model.add_max_equality(a, shift_vars_for_day)

    # ── Hard Constraints ────────────────────────────────────────────────────

    for staff in req.staff:
        staff_grade_level = grades_map.get(staff.grade_id, 99)

        for d_str in date_strs:
            # HC1: Maximum one shift per day (also covers HC2: no overlapping)
            model.add_at_most_one(
                x[(staff.staff_id, d_str, sh.shift_id)] for sh in req.shifts
            )

            # HC3: Leave protection — no shifts on leave days
            if (staff.staff_id, d_str) in leave_set:
                for sh in req.shifts:
                    model.add(x[(staff.staff_id, d_str, sh.shift_id)] == 0)

            # HC4: Fixed assignments — must work the requested shift
            if (staff.staff_id, d_str) in fixed_map:
                req_shift = fixed_map[(staff.staff_id, d_str)]
                if req_shift in shifts_map:
                    model.add(x[(staff.staff_id, d_str, req_shift)] == 1)

            # HC9: Grade eligibility — can't fill roles above own grade
            for dm in demand_for_date.get(d_str, []):
                if dm.required_grade:
                    demand_grade = grades_map.get(dm.required_grade, 99)
                    if staff_grade_level > demand_grade:
                        model.add(x[(staff.staff_id, d_str, dm.shift_id)] == 0)

                # Also enforce skill eligibility
                if dm.required_skill and dm.required_skill not in staff_skills.get(staff.staff_id, set()):
                    model.add(x[(staff.staff_id, d_str, dm.shift_id)] == 0)

    # HC5: Maximum consecutive shifts
    for staff in req.staff:
        max_consec = staff.max_consecutive_shifts or 6
        # Need to include past roster in the lookback window
        # Build extended date range (past + current)
        lookback_days = max_consec
        ext_start = _parse_date(req.start_date) - timedelta(days=lookback_days)
        ext_dates = _dates_between(ext_start.isoformat(), req.end_date)

        # For each window of (max_consec + 1) consecutive days, at most max_consec can have shifts
        for i in range(len(ext_dates) - max_consec):
            window = [ext_dates[j] for j in range(i, i + max_consec + 1)]
            window_vars = []
            past_count = 0
            for wd in window:
                wd_str = wd.isoformat()
                if wd_str in date_strs:
                    window_vars.append(any_shift[(staff.staff_id, wd_str)])
                elif (staff.staff_id, wd_str) in past_map:
                    past_count += 1
            if window_vars:
                model.add(sum(window_vars) <= max_consec - past_count)

    # HC6: Maximum shifts per week
    for staff in req.staff:
        max_weekly = staff.max_shifts_per_week or 6
        # Group dates by ISO week
        weeks: dict[tuple[int, int], list[str]] = {}
        for d in all_dates:
            iso = d.isocalendar()
            key = (iso[0], iso[1])
            weeks.setdefault(key, []).append(d.isoformat())

        for week_key, week_dates in weeks.items():
            # Count past roster entries for same week
            past_week_count = 0
            start_of_week = date.fromisocalendar(week_key[0], week_key[1], 1)
            for i in range(7):
                wd = start_of_week + timedelta(days=i)
                wd_str = wd.isoformat()
                if wd_str not in date_strs and (staff.staff_id, wd_str) in past_map:
                    past_week_count += 1

            week_shift_vars = [any_shift[(staff.staff_id, ds)] for ds in week_dates]
            if week_shift_vars:
                model.add(sum(week_shift_vars) <= max_weekly - past_week_count)

    # HC7: Maximum 196 monthly working hours
    for staff in req.staff:
        # Group dates by month
        months: dict[tuple[int, int], list[str]] = {}
        for d in all_dates:
            key = (d.year, d.month)
            months.setdefault(key, []).append(d.isoformat())

        for month_key, month_dates in months.items():
            # Convert hours to integer centihours (x100) to use integer arithmetic
            existing_centihours = int(staff.current_month_hours * 100)
            hour_terms = []
            for ds in month_dates:
                for sh in req.shifts:
                    hrs = _shift_hours(shifts_map[sh.shift_id])
                    centihours = int(hrs * 100)
                    hour_terms.append(x[(staff.staff_id, ds, sh.shift_id)] * centihours)
            if hour_terms:
                model.add(sum(hour_terms) + existing_centihours <= 19600)  # 196 * 100

    # HC8: Night shift recovery
    # 1 night → 1 off | 2-3 nights → 2 off | 4 nights → 3 off | Max 4 consecutive nights
    night_shift_ids = [sh.shift_id for sh in req.shifts if _is_night_shift(sh)]

    if night_shift_ids:
        # Create night-shift indicator variable per (staff, date)
        is_night: dict[tuple[str, str], cp_model.IntVar] = {}
        for staff in req.staff:
            for d_str in date_strs:
                nv = model.new_bool_var(f"night_{staff.staff_id}_{d_str}")
                night_vars = [x[(staff.staff_id, d_str, ns)] for ns in night_shift_ids]
                model.add_max_equality(nv, night_vars)
                is_night[(staff.staff_id, d_str)] = nv

        for staff in req.staff:
            # Need extended date range to look back into past
            ext_start_night = _parse_date(req.start_date) - timedelta(days=7)
            ext_night_dates = _dates_between(ext_start_night.isoformat(), req.end_date)

            def was_night_past(sid: str, d_str: str) -> bool:
                """Check if staff worked a night shift on a past date."""
                sid_in_past = past_map.get((sid, d_str))
                return sid_in_past is not None and sid_in_past in night_shift_ids

            # HC8a: Max 4 consecutive nights
            for i in range(len(ext_night_dates) - 4):
                window = [ext_night_dates[j] for j in range(i, i + 5)]
                vars_in_window = []
                past_nights = 0
                for wd in window:
                    wd_str = wd.isoformat()
                    if wd_str in date_strs and (staff.staff_id, wd_str) in is_night:
                        vars_in_window.append(is_night[(staff.staff_id, wd_str)])
                    elif was_night_past(staff.staff_id, wd_str):
                        past_nights += 1
                if vars_in_window:
                    model.add(sum(vars_in_window) <= 4 - past_nights)

            # HC8b: Night recovery rules
            # For each date in the planning range, enforce recovery based on
            # the preceding night streak. We implement this by encoding the
            # four recovery patterns as forbidden sequences.
            #
            # Pattern: 1 night then work next day (must have 1 off)
            # Pattern: 2 nights then work within 2 days (must have 2 off)
            # Pattern: 3 nights then work within 2 days (must have 2 off)
            # Pattern: 4 nights then work within 3 days (must have 3 off)
            #
            # Strategy: for each possible night streak length k ending at day d,
            # enforce that the required recovery_days after d are all OFF.

            for d_idx, d in enumerate(all_dates):
                d_str = d.isoformat()

                # For streak length 1: if day before was night AND the day before THAT was not,
                # then today must be off
                for streak_len in [1, 2, 3, 4]:
                    if streak_len == 1:
                        recovery_needed = 1
                    elif streak_len in (2, 3):
                        recovery_needed = 2
                    else:  # 4
                        recovery_needed = 3

                    # Check if a streak of exactly `streak_len` nights ended just before
                    # the recovery window starting at date index d_idx
                    # The streak ended on the day before the first recovery day
                    streak_end_d = d - timedelta(days=1)
                    streak_start_d = streak_end_d - timedelta(days=streak_len - 1)
                    day_before_streak = streak_start_d - timedelta(days=1)

                    # Collect boolean indicators for each streak day
                    streak_indicators = []
                    all_known = True
                    for k in range(streak_len):
                        sd = streak_start_d + timedelta(days=k)
                        sd_str = sd.isoformat()
                        if sd_str in date_strs and (staff.staff_id, sd_str) in is_night:
                            streak_indicators.append(("var", is_night[(staff.staff_id, sd_str)]))
                        elif was_night_past(staff.staff_id, sd_str):
                            streak_indicators.append(("const", True))
                        else:
                            streak_indicators.append(("const", False))

                    # All streak days must be night shifts
                    streak_all_night = all(
                        (t == "var") or (t == "const" and v)
                        for t, v in streak_indicators
                    )
                    if not streak_all_night:
                        continue

                    # Day before streak must NOT be a night shift (for "exactly" streak_len)
                    dbs_str = day_before_streak.isoformat()
                    if dbs_str in date_strs and (staff.staff_id, dbs_str) in is_night:
                        # Variable — we need conditional enforcement
                        dbs_not_night = is_night[(staff.staff_id, dbs_str)].negated()
                    elif was_night_past(staff.staff_id, dbs_str):
                        continue  # streak is actually longer, skip
                    else:
                        dbs_not_night = None  # confirmed not night

                    # Collect the bool vars from the streak
                    enforcement_literals = []
                    if dbs_not_night is not None:
                        enforcement_literals.append(dbs_not_night)
                    for t, v in streak_indicators:
                        if t == "var":
                            enforcement_literals.append(v)

                    # Recovery window: current day and next (recovery_needed - 1) days
                    for r in range(recovery_needed):
                        rec_d = d + timedelta(days=r)
                        rec_str = rec_d.isoformat()
                        if rec_str in date_strs:
                            # Must not work on this recovery day
                            if enforcement_literals:
                                model.add(
                                    any_shift[(staff.staff_id, rec_str)] == 0
                                ).only_enforce_if(enforcement_literals)

    # HC10: Minimum demand
    for d_str in date_strs:
        for dm in demand_for_date.get(d_str, []):
            if dm.shift_id not in shifts_map:
                continue
            eligible_staff = []
            for staff in req.staff:
                # Grade check
                if dm.required_grade:
                    demand_grade = grades_map.get(dm.required_grade, 99)
                    staff_grade = grades_map.get(staff.grade_id, 99)
                    if staff_grade > demand_grade:
                        continue
                # Skill check
                if dm.required_skill and dm.required_skill not in staff_skills.get(staff.staff_id, set()):
                    continue
                eligible_staff.append(staff.staff_id)

            demand_vars = [x[(sid, d_str, dm.shift_id)] for sid in eligible_staff]
            if demand_vars:
                model.add(sum(demand_vars) >= dm.minimum_staff)

    # ── Soft Constraints → Objective ────────────────────────────────────────
    penalties: list = []

    # SC1: Total shift fairness — minimise (max_total - min_total) across staff
    sc_total_priority = soft_map.get("total_shift_fairness", 5)
    if sc_total_priority > 0 and len(req.staff) > 1:
        staff_totals = []
        max_possible = len(date_strs)
        for staff in req.staff:
            total = model.new_int_var(0, max_possible, f"total_{staff.staff_id}")
            model.add(total == sum(any_shift[(staff.staff_id, ds)] for ds in date_strs))
            staff_totals.append(total)
        max_total = model.new_int_var(0, max_possible, "max_total")
        min_total = model.new_int_var(0, max_possible, "min_total")
        model.add_max_equality(max_total, staff_totals)
        model.add_min_equality(min_total, staff_totals)
        spread_total = model.new_int_var(0, max_possible, "spread_total")
        model.add(spread_total == max_total - min_total)
        penalties.append(spread_total * sc_total_priority)

    # SC2: Night fairness — minimise (max_night - min_night)
    sc_night_priority = soft_map.get("night_fairness", 5)
    if sc_night_priority > 0 and night_shift_ids and len(req.staff) > 1:
        staff_nights = []
        max_possible_nights = len(date_strs)
        for staff in req.staff:
            ntotal = model.new_int_var(0, max_possible_nights, f"nights_{staff.staff_id}")
            model.add(ntotal == sum(
                is_night[(staff.staff_id, ds)]
                for ds in date_strs
                if (staff.staff_id, ds) in is_night
            ))
            staff_nights.append(ntotal)
        max_night = model.new_int_var(0, max_possible_nights, "max_night")
        min_night = model.new_int_var(0, max_possible_nights, "min_night")
        model.add_max_equality(max_night, staff_nights)
        model.add_min_equality(min_night, staff_nights)
        spread_night = model.new_int_var(0, max_possible_nights, "spread_night")
        model.add(spread_night == max_night - min_night)
        penalties.append(spread_night * sc_night_priority)

    # SC3: Weekend fairness — minimise (max_weekend - min_weekend)
    sc_weekend_priority = soft_map.get("weekend_fairness", 5)
    weekend_dates = [ds for d, ds in zip(all_dates, date_strs) if d.weekday() in (5, 6)]
    if sc_weekend_priority > 0 and weekend_dates and len(req.staff) > 1:
        staff_weekends = []
        max_possible_we = len(weekend_dates)
        for staff in req.staff:
            we_total = model.new_int_var(0, max_possible_we, f"weekend_{staff.staff_id}")
            model.add(we_total == sum(
                any_shift[(staff.staff_id, ds)]
                for ds in weekend_dates
            ))
            staff_weekends.append(we_total)
        max_we = model.new_int_var(0, max_possible_we, "max_weekend")
        min_we = model.new_int_var(0, max_possible_we, "min_weekend")
        model.add_max_equality(max_we, staff_weekends)
        model.add_min_equality(min_we, staff_weekends)
        spread_we = model.new_int_var(0, max_possible_we, "spread_weekend")
        model.add(spread_we == max_we - min_we)
        penalties.append(spread_we * sc_weekend_priority)

    # SC4: Shift type variety — penalise consecutive same-shift assignments
    sc_variety_priority = soft_map.get("shift_type_variety", 5)
    if sc_variety_priority > 0:
        for staff in req.staff:
            for sh in req.shifts:
                for i in range(len(date_strs) - 1):
                    # Both consecutive days on the same shift → penalty
                    both = model.new_bool_var(
                        f"consec_{staff.staff_id}_{sh.shift_id}_{date_strs[i]}"
                    )
                    model.add_min_equality(both, [
                        x[(staff.staff_id, date_strs[i], sh.shift_id)],
                        x[(staff.staff_id, date_strs[i + 1], sh.shift_id)],
                    ])
                    penalties.append(both * sc_variety_priority)

    # SC5: Shift coverage utilisation — reward assignments beyond minimum
    sc_util_priority = soft_map.get("shift_coverage_utilisation", 5)
    if sc_util_priority > 0:
        for d_str in date_strs:
            for dm in demand_for_date.get(d_str, []):
                if dm.shift_id not in shifts_map:
                    continue
                eligible = [
                    sid for sid in [s.staff_id for s in req.staff]
                    if (sid, d_str, dm.shift_id) in x
                ]
                total_assigned = sum(x[(sid, d_str, dm.shift_id)] for sid in eligible)
                # Bonus for each extra staff beyond minimum (negative penalty = reward)
                bonus = model.new_int_var(0, len(eligible), f"bonus_{d_str}_{dm.shift_id}")
                model.add(bonus <= total_assigned - dm.minimum_staff)
                model.add(bonus >= 0)
                penalties.append(bonus * (-sc_util_priority))

    # Set objective: minimise sum of penalties
    if penalties:
        model.minimize(sum(penalties))

    # ── Solve ───────────────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = req.time_limit_seconds
    solver.parameters.num_workers = 4
    solver.parameters.log_search_progress = True

    status = solver.solve(model)

    elapsed_ms = int((time.time() - t0) * 1000)

    status_map = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
        cp_model.UNKNOWN: "UNKNOWN",
    }
    status_str = status_map.get(status, "UNKNOWN")

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        assignments = []
        for staff in req.staff:
            for d_str in date_strs:
                for sh in req.shifts:
                    if solver.value(x[(staff.staff_id, d_str, sh.shift_id)]) == 1:
                        assignments.append(Assignment(
                            staff_id=staff.staff_id,
                            date=d_str,
                            shift_id=sh.shift_id,
                        ))
        return SolveResponse(
            status=status_str,
            assignments=assignments,
            solve_time_ms=elapsed_ms,
            score=str(solver.objective_value) if penalties else None,
            message=f"Found {len(assignments)} shift assignments",
        )
    else:
        return SolveResponse(
            status=status_str,
            assignments=[],
            solve_time_ms=elapsed_ms,
            message=f"Solver returned {status_str}. The constraints may be too tight for the available staff.",
        )
