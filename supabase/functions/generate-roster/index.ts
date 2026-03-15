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
    const { department_id, start_date, end_date, user_id } = await req.json()

    if (!department_id || !start_date || !end_date || !user_id) {
      console.error('Missing parameters:', { department_id, start_date, end_date, user_id });
      return new Response(JSON.stringify({ error: 'Missing required parameters including user_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Create a Supabase client with the app's user impersonation header
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { 'x-app-user-id': user_id } } }
    )

    // 1. Fetch all necessary data
    const sevenDaysAgo = new Date(new Date(start_date).getTime() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const [staffRes, demandRes, leavesRes, shiftsRes, skillsRes, gradesRes, fixedRes, pastRosterRes] = await Promise.all([
      supabaseClient.from('staff').select('*'),
      supabaseClient.from('demand').select('*').eq('department_id', department_id),
      supabaseClient.from('leave_requests').select('*').eq('status', 'Approved'),
      supabaseClient.from('shifts').select('*'),
      supabaseClient.from('staff_skills').select('*'),
      supabaseClient.from('grades').select('*'),
      supabaseClient.from('fixed_assignments').select('*'),
      supabaseClient.from('roster').select('*').gte('date', sevenDaysAgo).lte('date', start_date)
    ])

    if (staffRes.error) throw staffRes.error;
    if (demandRes.error) throw demandRes.error;
    if (leavesRes.error) throw leavesRes.error;
    if (shiftsRes.error) throw shiftsRes.error;
    if (skillsRes.error) throw skillsRes.error;
    if (gradesRes.error) throw gradesRes.error;
    if (fixedRes.error) throw fixedRes.error;

    const allStaffRaw = staffRes.data || []
    const allDemand = demandRes.data || []
    const allLeaves = leavesRes.data || []
    const allShifts = shiftsRes.data || []
    const allStaffSkills = skillsRes.data || []
    const allGrades = gradesRes.data || []
    const allFixed = fixedRes.data || []
    const pastRoster = pastRosterRes.data || []

    const gradesMap = new Map(allGrades.map(g => [g.grade_id, g.hierarchy_level]))
    const shiftsMap = new Map(allShifts.map(s => [s.shift_id, s]))

    // Attach skills and grade hierarchy to staff
    const allStaff = allStaffRaw
      .filter(staff => !staff.department_id || staff.department_id === department_id)
      .map(staff => ({
        ...staff,
        staff_skills: allStaffSkills.filter(ss => ss.staff_id === staff.staff_id).map(ss => ss.skill_id),
        hierarchy_level: gradesMap.get(staff.grade_id) || 99
      }))

    const assignments = []
    const rosterGroupId = crypto.randomUUID()
    
    let current = new Date(start_date)
    const end = new Date(end_date)
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      const prevDate = new Date(current)
      prevDate.setDate(prevDate.getDate() - 1)
      const prevDateStr = prevDate.toISOString().split('T')[0]

      const dailyDemand = allDemand.filter(d => 
        (!d.date_start || d.date_start <= dateStr) && 
        (!d.date_end || d.date_end >= dateStr)
      )
      
      const fixedForDay = allFixed.filter(f => 
        f.start_date <= dateStr && (f.end_date >= dateStr || !f.end_date)
      )

      // Apply fixed assignments first
      for (const fixed of fixedForDay) {
        assignments.push({
          user_id: user_id,
          staff_id: fixed.staff_id,
          date: dateStr,
          shift_id: fixed.shift_id,
          roster_group_id: rosterGroupId
        })
      }

      for (const demand of dailyDemand) {
        const shift = shiftsMap.get(demand.shift_id)
        if (!shift) continue
        
        const demandGradeHierarchy = gradesMap.get(demand.required_grade) || 99
        let assignedCount = assignments.filter(a => a.date === dateStr && a.shift_id === demand.shift_id).length

        for (const staff of allStaff) {
          if (assignedCount >= demand.minimum_staff) break

          // Grade Eligibility (cannot fill roles requiring higher grade, meaning lower hierarchy number)
          if (staff.hierarchy_level > demandGradeHierarchy) continue
          
          // Skill Eligibility (Removed as per requirement)
          // if (demand.required_skill && !staff.staff_skills.includes(demand.required_skill)) continue

          // Leave protection
          const isOnLeave = allLeaves.some(l => l.staff_id === staff.staff_id && l.start_date <= dateStr && l.end_date >= dateStr)
          if (isOnLeave) continue
          
          // Max shifts check
          const weekStart = new Date(current)
          weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Sunday
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 6)
          const weekShiftsCount = assignments.filter(a => a.staff_id === staff.staff_id && a.date >= weekStart.toISOString().split('T')[0] && a.date <= weekEnd.toISOString().split('T')[0]).length
               + pastRoster.filter(a => a.staff_id === staff.staff_id && a.date >= weekStart.toISOString().split('T')[0] && a.date <= weekEnd.toISOString().split('T')[0]).length
          if (weekShiftsCount >= (staff.max_shifts_per_week || 6)) continue

          // Max consecutive shifts check
          const maxConsecutive = staff.max_consecutive_shifts || 6
          let consecutiveCount = 0
          let checkDate = new Date(current)
          checkDate.setDate(checkDate.getDate() - 1)
          
          while (consecutiveCount <= maxConsecutive) {
            const dStr = checkDate.toISOString().split('T')[0]
            const worked = assignments.some(a => a.staff_id === staff.staff_id && a.date === dStr)
              || pastRoster.some(a => a.staff_id === staff.staff_id && a.date === dStr)
            
            if (worked) {
              consecutiveCount++
              checkDate.setDate(checkDate.getDate() - 1)
            } else {
              break
            }
          }
          if (consecutiveCount >= maxConsecutive) continue

          // Already assigned on this day
          const alreadyAssigned = assignments.some(a => a.staff_id === staff.staff_id && a.date === dateStr)
          if (alreadyAssigned) continue

          // Night Shift Recovery: check if staff worked a night shift yesterday
          // A night shift often has end time < start time (e.g. 20:00 to 08:00)
          const workedYesterday = assignments.find(a => a.staff_id === staff.staff_id && a.date === prevDateStr) 
            || pastRoster.find(a => a.staff_id === staff.staff_id && a.date === prevDateStr)
          
          if (workedYesterday) {
            const yesterdayShift = shiftsMap.get(workedYesterday.shift_id) as any
            if (yesterdayShift && yesterdayShift.end_time < yesterdayShift.start_time) {
              // Worked night shift yesterday, must rest today
              continue
            }
          }
          
          assignments.push({
            user_id: user_id,
            staff_id: staff.staff_id,
            date: dateStr,
            shift_id: demand.shift_id,
            roster_group_id: rosterGroupId
          })
          
          assignedCount++
        }
      }
      current.setDate(current.getDate() + 1)
    }

    const { error: metaError } = await supabaseClient.from('roster_metadata').insert({
      id: rosterGroupId,
      user_id: user_id,
      department_id,
      start_date,
      end_date,
      status: 'generated'
    })
    
    if (metaError) throw metaError

    if (assignments.length > 0) {
      const { error: insertError } = await supabaseClient.from('roster').insert(assignments)
      if (insertError) throw insertError
    }

    return new Response(JSON.stringify({ success: true, count: assignments.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Top level caught error:', error.message || error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
