import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://keqefvrtnpeomyrcgojc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcWVmdnJ0bnBlb215cmNnb2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNzE0NTEsImV4cCI6MjA4Nzc0NzQ1MX0.U02ARinXKREoNorKvq1Qz95NDE7ccLacgkiSqu2JW4I';

// Target parameters
const TARGET_DEPT = 'ICU'; 
const USER_ID = 'Demo';

async function validate() {
  console.log(`\n🔍 Deep Validation: Night Shift Rules & Hard Constraints`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { 'x-app-user-id': USER_ID } }
  });

  // 0. Find the LATEST roster metadata for the target department
  const { data: latestMeta, error: metaErr } = await supabase
    .from('roster_metadata')
    .select('*')
    .eq('department_id', TARGET_DEPT)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (metaErr || !latestMeta) {
    console.error('❌ Could not find roster metadata for', TARGET_DEPT);
    return;
  }

  const START_DATE = latestMeta.start_date;
  const END_DATE = latestMeta.end_date;
  const ROSTER_GROUP_ID = latestMeta.id;

  console.log(`Department: ${TARGET_DEPT} | Period: ${START_DATE} to ${END_DATE}`);
  console.log(`Roster Group ID: ${ROSTER_GROUP_ID}`);

  const startObj = new Date(START_DATE);
  const lookbackDate = new Date(startObj.getTime() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

  // 1. Fetch Data
  const [staffRes, demandRes, leavesRes, shiftsRes, fixedRes, rosterRes, pastRosterRes] = await Promise.all([
    supabase.from('staff').select('*').eq('department_id', TARGET_DEPT),
    supabase.from('demand').select('*').eq('department_id', TARGET_DEPT),
    supabase.from('leave_requests').select('*'),
    supabase.from('shifts').select('*'),
    supabase.from('fixed_assignments').select('*'),
    supabase.from('roster').select('*').gte('date', START_DATE).lte('date', END_DATE),
    supabase.from('roster').select('*').gte('date', lookbackDate).lt('date', START_DATE)
  ]);

  const staff = staffRes.data || [];
  const demand = demandRes.data || [];
  const leaves = leavesRes.data || [];
  const shifts = shiftsRes.data || [];
  const meta = latestMeta;

  // We check the entire roster in the table for this period to catch cross-group conflicts
  const currentRoster = (rosterRes.data || []); 
  const pastRoster = (pastRosterRes.data || []);
  const allAssignments = [...pastRoster, ...currentRoster];

  const shiftsMap = new Map(shifts.map(s => [s.shift_id, s]));
  const staffMap = new Map(staff.map(s => [s.staff_id, s]));

  const violations = [];

  // Helper: Is any shift on this day a night shift?
  const hasNightShift = (dayAssigns) => {
    return dayAssigns.some(a => {
      const s = shiftsMap.get(a.shift_id);
      return s && s.end_time < s.start_time;
    });
  };

  // 2. Build global lookup
  const globalStaffAssignments = {}; 
  for (const r of allAssignments) {
    if (!globalStaffAssignments[r.staff_id]) globalStaffAssignments[r.staff_id] = {};
    if (!globalStaffAssignments[r.staff_id][r.date]) globalStaffAssignments[r.staff_id][r.date] = [];
    globalStaffAssignments[r.staff_id][r.date].push(r);
  }

  // 3. Precise Night Shift Rule Check
  console.log('\n--- Checking Night Shift Rules ---');
  staff.forEach(s => {
    const assignments = globalStaffAssignments[s.staff_id] || {};
    
    let consecutiveNights = 0;
    
    let currentCheck = new Date(lookbackDate);
    const endCheck = new Date(END_DATE);
    
    while (currentCheck <= endCheck) {
      const dateStr = currentCheck.toISOString().split('T')[0];
      const isCurrentRange = dateStr >= START_DATE;
      const dayAssigns = assignments[dateStr] || [];
      
      const workedNight = hasNightShift(dayAssigns);
      
      if (workedNight) {
          consecutiveNights++;
          if (consecutiveNights > 4 && isCurrentRange) {
              violations.push({ type: 'Hard', rule: 'Max 4 Nights', details: `${s.name} worked ${consecutiveNights} consecutive nights at ${dateStr}` });
          }
      } else {
          if (consecutiveNights > 0) {
              const requiredOff = consecutiveNights === 1 ? 1 : (consecutiveNights <= 3 ? 2 : 3);
              
              let recoveryPointer = new Date(currentCheck);
              for (let j = 0; j < requiredOff; j++) {
                  const checkStr = recoveryPointer.toISOString().split('T')[0];
                  if (checkStr > END_DATE) break;
                  
                  const recoveryAssigns = assignments[checkStr] || [];
                  if (recoveryAssigns.length > 0 && (checkStr >= START_DATE)) {
                      violations.push({ 
                        type: 'Hard', 
                        rule: 'Night Recovery', 
                        details: `${s.name} working on ${checkStr} during recovery after ${consecutiveNights} nights (Required: ${requiredOff} days off).` 
                      });
                  }
                  recoveryPointer.setDate(recoveryPointer.getDate() + 1);
              }
          }
          consecutiveNights = 0;
      }
      currentCheck.setDate(currentCheck.getDate() + 1);
    }
  });

  // 4. Other Hard Constraints
  console.log('--- Checking Other Constraints ---');
  
  // Coverage for the SELECTED ROSTER GROUP
  const metaRoster = currentRoster.filter(r => r.roster_group_id === meta.id);
  const curDates = [...new Set(metaRoster.map(r => r.date))].sort();
  for (const date of curDates) {
    const dailyDemand = demand.filter(d => (!d.date_start || d.date_start <= date) && (!d.date_end || d.date_end >= date));
    for (const d of dailyDemand) {
      const assigned = metaRoster.filter(r => r.date === date && r.shift_id === d.shift_id).length;
      if (assigned < d.minimum_staff) {
        violations.push({ type: 'Hard', rule: 'Coverage', details: `${date} - ${d.shift_id}: Expected ${d.minimum_staff}, got ${assigned}` });
      }
    }
  }

  // Exclusivity (Total DB check)
  for (const staffId in globalStaffAssignments) {
    for (const date in globalStaffAssignments[staffId]) {
      if (date >= START_DATE && globalStaffAssignments[staffId][date].length > 1) {
        const staffName = staffMap.get(staffId)?.name || staffId;
        const shifts = globalStaffAssignments[staffId][date].map(a => a.shift_id).join(', ');
        violations.push({ type: 'Hard', rule: 'Exclusivity', details: `${staffName} has multiple shifts on ${date}: [${shifts}]` });
      }
    }
  }

  // Summary
  console.log('\n--- Validation Result Summary ---');
  const uniqueViolations = Array.from(new Set(violations.map(v => JSON.stringify(v)))).map(s => JSON.parse(s));
  if (uniqueViolations.length === 0) {
    console.log('✅ All hard constraints fulfilled!');
  } else {
    console.log(`❌ Found ${uniqueViolations.length} distinct violations:`);
    uniqueViolations.forEach(v => console.log(`  [${v.type}] ${v.rule}: ${v.details}`));
  }
}

validate().catch(console.error);
