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
    const [staffRes, demandRes, leavesRes, shiftsRes, skillsRes] = await Promise.all([
      supabaseClient.from('staff').select('*'),
      supabaseClient.from('demand').select('*').eq('department_id', department_id).gte('date_start', start_date).lte('date_start', end_date),
      supabaseClient.from('leave_requests').select('*').eq('status', 'Approved'),
      supabaseClient.from('shifts').select('*'),
      supabaseClient.from('staff_skills').select('*')
    ])

    if (staffRes.error) {
      console.error('Staff fetch error:', staffRes.error);
      throw staffRes.error;
    }
    if (demandRes.error) {
      console.error('Demand fetch error:', demandRes.error);
      throw demandRes.error;
    }
    if (leavesRes.error) {
      console.error('Leaves fetch error:', leavesRes.error);
      throw leavesRes.error;
    }
    if (shiftsRes.error) {
      console.error('Shifts fetch error:', shiftsRes.error);
      throw shiftsRes.error;
    }
    if (skillsRes.error) {
      console.error('Skills fetch error:', skillsRes.error);
      throw skillsRes.error;
    }

    const allStaffRaw = staffRes.data || []
    const allDemand = demandRes.data || []
    const allLeaves = leavesRes.data || []
    const allShifts = shiftsRes.data || []
    const allStaffSkills = skillsRes.data || []

    // Attach skills to staff
    const allStaff = allStaffRaw.map(staff => ({
      ...staff,
      staff_skills: allStaffSkills.filter(ss => ss.staff_id === staff.staff_id)
    }))

    const shiftsMap = new Map(allShifts.map(s => [s.shift_id, s]))

    const assignments = []
    
    // Create a generated roster group ID
    const rosterGroupId = crypto.randomUUID()
    
    // Very basic heuristic greedy algorithm
    // Iterate through each day in the date range
    let current = new Date(start_date)
    const end = new Date(end_date)
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      
      // Get demand for this date
      const dailyDemand = allDemand.filter(d => d.date_start <= dateStr && (d.date_end >= dateStr || !d.date_end))
      
      for (const demand of dailyDemand) {
        const shift = shiftsMap.get(demand.shift_id)
        if (!shift) continue
        
        let assignedCount = 0
        
        // Find staff to fulfill this demand
        for (const staff of allStaff) {
          if (assignedCount >= demand.minimum_staff) break
          
          // Check if staff belongs to department (Keep this, but I've already updated staff in DB)
          if (staff.department_id && staff.department_id !== department_id) continue

          // Check if staff is on leave
          const isOnLeave = allLeaves.some(l => l.staff_id === staff.staff_id && l.start_date <= dateStr && l.end_date >= dateStr)
          if (isOnLeave) continue
          
          // Check if staff already assigned to a shift on this day
          const alreadyAssigned = assignments.some(a => a.staff_id === staff.staff_id && a.date === dateStr)
          if (alreadyAssigned) continue
          
          // Add assignment
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

    // Insert metadata and assignments in a transaction
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
  } catch (error) {
    console.error('Top level caught error:', error.message || error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
