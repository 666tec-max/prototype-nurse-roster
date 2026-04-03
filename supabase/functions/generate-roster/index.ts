import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-user-id',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { department_id, start_date, end_date, user_id, time_limit_seconds } = await req.json()

    if (!department_id || !start_date || !end_date || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { 'x-app-user-id': user_id } } }
    )

    // ── 1. Fetch all data from Supabase ────────────────────────────────────
    const startObj = new Date(start_date)
    const firstOfMonth = new Date(startObj.getFullYear(), startObj.getMonth(), 1).toISOString().split('T')[0]
    const sevenDaysAgo = new Date(startObj.getTime() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0]

    const [staffRes, demandRes, leavesRes, shiftsRes, skillsRes, gradesRes, fixedRes, pastRosterRes, softRes, monthRosterRes] = await Promise.all([
      supabaseClient.from('staff').select('*').eq('department_id', department_id),
      supabaseClient.from('demand').select('*').eq('department_id', department_id),
      supabaseClient.from('leave_requests').select('*').eq('status', 'Approved'),
      supabaseClient.from('shifts').select('*'),
      supabaseClient.from('staff_skills').select('*'),
      supabaseClient.from('grades').select('*'),
      supabaseClient.from('fixed_assignments').select('*'),
      supabaseClient.from('roster').select('*').gte('date', sevenDaysAgo).lt('date', start_date),
      supabaseClient.from('soft_constraints').select('*'),
      supabaseClient.from('roster').select('*').gte('date', firstOfMonth).lt('date', start_date),
    ])

    if (staffRes.error) throw staffRes.error
    if (demandRes.error) throw demandRes.error
    if (leavesRes.error) throw leavesRes.error
    if (shiftsRes.error) throw shiftsRes.error
    if (skillsRes.error) throw skillsRes.error
    if (gradesRes.error) throw gradesRes.error
    if (fixedRes.error) throw fixedRes.error

    const allStaffRaw = staffRes.data || []
    const allDemand = demandRes.data || []
    const allLeaves = leavesRes.data || []
    const allShifts = shiftsRes.data || []
    const allStaffSkills = skillsRes.data || []
    const allGrades = gradesRes.data || []
    const allFixed = fixedRes.data || []
    const pastRoster = pastRosterRes.data || []
    const softConstraints = softRes.data || []
    const monthRoster = monthRosterRes.data || []

    const gradesMap = new Map(allGrades.map((g: any) => [g.grade_id, g.hierarchy_level]))
    const shiftsMap = new Map(allShifts.map((s: any) => [s.shift_id, s]))

    // ── 2. Precompute staff data ───────────────────────────────────────────
    const allStaff = allStaffRaw.map((staff: any) => {
      const staffMonthRoster = monthRoster.filter((r: any) => r.staff_id === staff.staff_id)
      let initialHours = 0
      for (const r of staffMonthRoster) {
        const s = shiftsMap.get(r.shift_id)
        if (s) {
          const start = new Date(`2000-01-01T${s.start_time}`)
          let end = new Date(`2000-01-01T${s.end_time}`)
          if (end < start) end.setDate(end.getDate() + 1)
          initialHours += (end.getTime() - start.getTime()) / (1000 * 3600)
        }
      }
      return {
        staff_id: staff.staff_id,
        name: staff.name,
        department_id: staff.department_id,
        grade_id: staff.grade_id,
        max_shifts_per_week: staff.max_shifts_per_week || 5,
        max_consecutive_shifts: staff.max_consecutive_shifts || 4,
        staff_skills: allStaffSkills
          .filter((ss: any) => ss.staff_id === staff.staff_id)
          .map((ss: any) => ss.skill_id),
        hierarchy_level: gradesMap.get(staff.grade_id) || 99,
        current_month_hours: initialHours,
        total_shifts: staffMonthRoster.length,
      }
    })

    // ── 3. Build solver request payload ────────────────────────────────────
    const solverPayload = {
      department_id,
      start_date,
      end_date,
      user_id,
      time_limit_seconds: time_limit_seconds || 30,
      staff: allStaff,
      shifts: allShifts.map((s: any) => ({
        shift_id: s.shift_id,
        start_time: s.start_time,
        end_time: s.end_time,
        duration_minutes: s.duration_minutes,
      })),
      demand: allDemand.map((d: any) => ({
        shift_id: d.shift_id,
        required_grade: d.required_grade,
        required_skill: d.required_skill,
        minimum_staff: d.minimum_staff,
        date_start: d.date_start,
        date_end: d.date_end,
      })),
      leaves: allLeaves.map((l: any) => ({
        staff_id: l.staff_id,
        start_date: l.start_date,
        end_date: l.end_date,
      })),
      fixed_assignments: allFixed.map((f: any) => ({
        staff_id: f.staff_id,
        shift_id: f.shift_id,
        start_date: f.start_date,
        end_date: f.end_date,
      })),
      past_roster: pastRoster.map((r: any) => ({
        staff_id: r.staff_id,
        date: r.date,
        shift_id: r.shift_id,
      })),
      soft_constraints: softConstraints.map((sc: any) => ({
        constraint_key: sc.constraint_key,
        priority: sc.priority,
      })),
      grades: allGrades.map((g: any) => ({
        grade_id: g.grade_id,
        hierarchy_level: g.hierarchy_level,
      })),
    }

    // ── 4. Call OR-Tools solver service ─────────────────────────────────────
    const SOLVER_URL = Deno.env.get('SOLVER_SERVICE_URL')
    if (!SOLVER_URL) {
      throw new Error('SOLVER_SERVICE_URL environment variable is not set')
    }

    console.log(`Calling solver at ${SOLVER_URL}/solve with ${allStaff.length} staff, ${allShifts.length} shifts...`)

    const solverRes = await fetch(`${SOLVER_URL}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(solverPayload),
    })

    if (!solverRes.ok) {
      const errBody = await solverRes.text()
      console.error('Solver error:', errBody)
      throw new Error(`Solver returned ${solverRes.status}: ${errBody}`)
    }

    const solverResult = await solverRes.json()

    console.log(`Solver status: ${solverResult.status}, assignments: ${solverResult.assignments?.length}, time: ${solverResult.solve_time_ms}ms`)

    if (solverResult.status === 'INFEASIBLE' || solverResult.status === 'MODEL_INVALID') {
      return new Response(JSON.stringify({
        success: false,
        error: solverResult.message || 'Constraints are too tight — no valid roster is possible',
        solver_status: solverResult.status,
        solve_time_ms: solverResult.solve_time_ms,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Write results to Supabase ───────────────────────────────────────
    const rosterGroupId = crypto.randomUUID()

    const { error: metaError } = await supabaseClient.from('roster_metadata').insert({
      id: rosterGroupId,
      user_id,
      department_id,
      start_date,
      end_date,
      status: 'generated',
    })
    if (metaError) throw metaError

    const assignments = (solverResult.assignments || []).map((a: any) => ({
      user_id,
      staff_id: a.staff_id,
      date: a.date,
      shift_id: a.shift_id,
      roster_group_id: rosterGroupId,
    }))

    if (assignments.length > 0) {
      const { error: insertError } = await supabaseClient.from('roster').insert(assignments)
      if (insertError) throw insertError
    }

    return new Response(JSON.stringify({
      success: true,
      count: assignments.length,
      solver_status: solverResult.status,
      solve_time_ms: solverResult.solve_time_ms,
      score: solverResult.score,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Edge function error:', error.message || error)
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
