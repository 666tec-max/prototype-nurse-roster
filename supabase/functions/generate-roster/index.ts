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
    const startObj = new Date(start_date);
    const firstOfMonth = new Date(startObj.getFullYear(), startObj.getMonth(), 1).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(startObj.getTime() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    
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
      supabaseClient.from('roster').select('*').gte('date', firstOfMonth).lt('date', start_date)
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
    const softConstraints = softRes.data || []
    const monthRoster = monthRosterRes.data || []

    const gradesMap = new Map(allGrades.map(g => [g.grade_id, g.hierarchy_level]))
    const shiftsMap = new Map(allShifts.map(s => [s.shift_id, s]))
    const softMap = new Map(softConstraints.map(sc => [sc.constraint_key, sc.priority]))

    // Helper to check if a shift is a night shift
    const isNightShift = (shiftId: string) => {
      const s = shiftsMap.get(shiftId);
      return s && s.end_time < s.start_time;
    }

    // Attach skills and grade hierarchy to staff, and calc initial monthly hours
    const allStaff = allStaffRaw.map(staff => {
      const staffMonthRoster = monthRoster.filter(r => r.staff_id === staff.staff_id);
      let initialHours = 0;
      for (const r of staffMonthRoster) {
        const s = shiftsMap.get(r.shift_id);
        if (s) {
          const start = new Date(`2000-01-01T${s.start_time}`);
          let end = new Date(`2000-01-01T${s.end_time}`);
          if (end < start) end.setDate(end.getDate() + 1);
          initialHours += (end.getTime() - start.getTime()) / (1000 * 3600);
        }
      }

      return {
        ...staff,
        staff_skills: allStaffSkills.filter(ss => ss.staff_id === staff.staff_id).map(ss => ss.skill_id),
        hierarchy_level: gradesMap.get(staff.grade_id) || 99,
        current_month_hours: initialHours,
        total_shifts: staffMonthRoster.length
      }
    })

    const assignments: any[] = []
    const rosterGroupId = crypto.randomUUID()
    
    let current = new Date(start_date)
    const end = new Date(end_date)
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      const isWeekend = current.getDay() === 0 || current.getDay() === 6;

      const dailyDemand = allDemand.filter(d => 
        (!d.date_start || d.date_start <= dateStr) && 
        (!d.date_end || d.date_end >= dateStr)
      )
      
      const fixedForDay = allFixed.filter(f => 
        f.start_date <= dateStr && (f.end_date >= dateStr || !f.end_date)
      )

      // Apply fixed assignments first (Hard Constraints)
      for (const fixed of fixedForDay) {
        const staff = allStaff.find(s => s.staff_id === fixed.staff_id);
        if (staff) {
          assignments.push({
            user_id: user_id,
            staff_id: fixed.staff_id,
            date: dateStr,
            shift_id: fixed.shift_id,
            roster_group_id: rosterGroupId
          });
          // Update hours and shift count
          const s = shiftsMap.get(fixed.shift_id);
          if (s) {
            const startT = new Date(`2000-01-01T${s.start_time}`);
            let endT = new Date(`2000-01-01T${s.end_time}`);
            if (endT < startT) endT.setDate(endT.getDate() + 1);
            staff.current_month_hours += (endT.getTime() - startT.getTime()) / (1000 * 3600);
          }
          staff.total_shifts++;
        }
      }

      for (const demand of dailyDemand) {
        const shift = shiftsMap.get(demand.shift_id)
        if (!shift) continue
        
        const demandGradeHierarchy = gradesMap.get(demand.required_grade) || 99
        let assignedCount = assignments.filter(a => a.date === dateStr && a.shift_id === demand.shift_id).length

        // Soft Constraint: Shift Coverage Utilisation
        const utilPriority = softMap.get('shift_coverage_utilisation') || 0;
        const targetStaff = (utilPriority > 7) ? demand.minimum_staff + 1 : demand.minimum_staff;

        const eligibleStaff = allStaff.filter(staff => {
          if (assignedCount >= targetStaff) return false;

          // 1. Grade Eligibility
          if (staff.hierarchy_level > demandGradeHierarchy) return false;

          // 2. Already assigned today
          if (assignments.some(a => a.staff_id === staff.staff_id && a.date === dateStr)) return false;

          // 3. Leave protection
          if (allLeaves.some(l => l.staff_id === staff.staff_id && l.start_date <= dateStr && l.end_date >= dateStr)) return false;

          // 4. Monthly hours limit (196h)
          const s = shiftsMap.get(demand.shift_id);
          let shiftHours = 0;
          if (s) {
              const startT = new Date(`2000-01-01T${s.start_time}`);
              let endT = new Date(`2000-01-01T${s.end_time}`);
              if (endT < startT) endT.setDate(endT.getDate() + 1);
              shiftHours = (endT.getTime() - startT.getTime()) / (1000 * 3600);
          }
          if (staff.current_month_hours + shiftHours > 196) return false;

          // 5. Max shifts per week
          const curD = new Date(dateStr);
          const weekStart = new Date(curD);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          const wStr = weekStart.toISOString().split('T')[0];
          const weStr = weekEnd.toISOString().split('T')[0];
          const weekShifts = assignments.filter(a => a.staff_id === staff.staff_id && a.date >= wStr && a.date <= weStr).length
                           + pastRoster.filter(a => a.staff_id === staff.staff_id && a.date >= wStr && a.date <= weStr).length;
          if (weekShifts >= (staff.max_shifts_per_week || 6)) return false;

          // 6. Max consecutive shifts
          const maxC = staff.max_consecutive_shifts || 6;
          let countC = 0;
          let checkD = new Date(dateStr);
          checkD.setDate(checkD.getDate() - 1);
          while (countC < 10) { // Safety break
            const dS = checkD.toISOString().split('T')[0];
            const worked = assignments.some(a => a.staff_id === staff.staff_id && a.date === dS)
                        || pastRoster.some(a => a.staff_id === staff.staff_id && a.date === dS);
            if (worked) { countC++; checkD.setDate(checkD.getDate() - 1); }
            else break;
          }
          if (countC >= maxC) return false;

          // 7. Night Shift Recovery
          // 1 night -> 1 off | 2-3 nights -> 2 off | 4 nights -> 3 off | Max 4 consecutive nights
          
          const getRecoveryRequired = (streak: number) => {
            if (streak === 1) return 1;
            if (streak === 2 || streak === 3) return 2;
            if (streak >= 4) return 3;
            return 0;
          };

          // Find the last night shift streak and how many days off have been taken since
          let streakCount = 0;
          let daysSinceStreak = 0;
          let foundStreak = false;
          let checkRD = new Date(dateStr);
          
          // Safety lookback up to 10 days
          for (let i = 1; i <= 10; i++) {
            checkRD.setDate(checkRD.getDate() - 1);
            const dS = checkRD.toISOString().split('T')[0];
            const a = assignments.find(a => a.staff_id === staff.staff_id && a.date === dS)
                   || pastRoster.find(a => a.staff_id === staff.staff_id && a.date === dS);
            
            if (a && isNightShift(a.shift_id)) {
              streakCount++;
              foundStreak = true;
            } else if (foundStreak) {
              // Streak ended before this day
              break;
            } else {
              // Still looking for a streak
              daysSinceStreak++;
            }
          }

          if (isNightShift(demand.shift_id)) {
            if (streakCount >= 4 && daysSinceStreak === 0) return false; // Already worked 4 nights in a row
          } else {
            // Non-night shift: check if in recovery
            const required = getRecoveryRequired(streakCount);
            if (daysSinceStreak < required) return false;
          }

          return true;
        });

        // Scoring for Soft Constraints
        const scoredStaff = eligibleStaff.map(staff => {
            let score = 0;

            // Total Shift Fairness
            const totalShiftPriority = softMap.get('total_shift_fairness') || 5;
            score -= (staff.total_shifts * totalShiftPriority);

            // Night Fairness
            if (isNightShift(demand.shift_id)) {
                const nightPriority = softMap.get('night_fairness') || 5;
                const nightCount = pastRoster.filter(a => a.staff_id === staff.staff_id && isNightShift(a.shift_id)).length
                                 + assignments.filter(a => a.staff_id === staff.staff_id && isNightShift(a.shift_id)).length;
                score -= (nightCount * nightPriority * 2);
            }

            // Weekend Fairness
            if (isWeekend) {
                const weekendPriority = softMap.get('weekend_fairness') || 5;
                const weekendCount = pastRoster.filter(a => {
                    const d = new Date(a.date);
                    return a.staff_id === staff.staff_id && (d.getDay() === 0 || d.getDay() === 6);
                }).length + assignments.filter(a => {
                    const d = new Date(a.date);
                    return a.staff_id === staff.staff_id && (d.getDay() === 0 || d.getDay() === 6);
                }).length;
                score -= (weekendCount * weekendPriority * 2);
            }

            // Shift Type Variety
            const varietyPriority = softMap.get('shift_type_variety') || 5;
            const lastA = assignments.filter(a => a.staff_id === staff.staff_id).pop() 
                       || pastRoster.filter(a => a.staff_id === staff.staff_id).pop();
            if (lastA && lastA.shift_id === demand.shift_id) {
                score -= (varietyPriority * 10);
            }

            return { staff, score };
        }).sort((a, b) => b.score - a.score);

        for (const item of scoredStaff) {
          if (assignedCount >= targetStaff) break;
          const staff = item.staff;

          assignments.push({
            user_id: user_id,
            staff_id: staff.staff_id,
            date: dateStr,
            shift_id: demand.shift_id,
            roster_group_id: rosterGroupId
          })
          
          // Update staff state for next iteration
          const s = shiftsMap.get(demand.shift_id);
          if (s) {
              const startT = new Date(`2000-01-01T${s.start_time}`);
              let endT = new Date(`2000-01-01T${s.end_time}`);
              if (endT < startT) endT.setDate(endT.getDate() + 1);
              staff.current_month_hours += (endT.getTime() - startT.getTime()) / (1000 * 3600);
          }
          staff.total_shifts++;
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
