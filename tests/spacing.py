"""Aggregate burden, physical eligibility and temporal boundary regressions."""
import copy,unittest
import evolution as engine

def fixture():
 s=engine.upgraded(end='2027-05-07');s['schemaVersion']=4
 s['spacingRules']=[dict(id='space',label='Burden spacing',selector={},shiftIds=['closing'],scope={},mode='SOFT',unit='CALENDAR',minimumGap=3,normalShiftIds=['regular'],penalty='CLOSE_PAIRS',priority=50)]
 return s
class Spacing(unittest.TestCase):
 def solve(self,s):
  r=engine.call('solve',s);self.assertIn(r['status'],['OPTIMAL','FEASIBLE'],r);self.assertEqual(engine.call('verify',s,r)['status'],'VERIFIED');return r
 def test_hard_spacing(self):
  s=fixture();s['spacingRules'][0].update(mode='HARD',minimumGap=2);r=self.solve(s);self.assertTrue(all(row['closePairs']==0 for row in r['workload']))
 def test_soft_cost_replayed_independently(self):
  s=fixture();r=self.solve(s);self.assertEqual(sum(x['penalty'] for x in r['workload']),next(p['valueScaled'] for p in r['phases'] if p['policyId']=='spacing:space'));r['workload'][0]['closePairs']=100;self.assertEqual(engine.call('verify',s,r)['diagnostics'][0]['code'],'WORKLOAD_MISMATCH')
 def test_normal_days_exclude_off_and_absence(self):
  s=fixture();s['policies']=[];s['calendar']['end']='2027-05-05';s['spacingRules'][0].update(unit='NORMAL_WORK_DAYS',minimumGap=1,mode='HARD');s['publishedAssignments']=[dict(employeeId='e1',date='2027-05-03',shiftId='closing'),dict(employeeId='e1',date='2027-05-04',shiftId='off'),dict(employeeId='e1',date='2027-05-05',shiftId='closing')];self.assertEqual(engine.call('solve',s)['status'],'INFEASIBLE')
 def test_actual_normal_day_counts(self):
  s=fixture();s['policies']=[];s['calendar']['end']='2027-05-05';s['spacingRules'][0].update(unit='NORMAL_WORK_DAYS',minimumGap=1,mode='HARD');s['publishedAssignments']=[dict(employeeId='e1',date='2027-05-03',shiftId='closing'),dict(employeeId='e1',date='2027-05-04',shiftId='regular'),dict(employeeId='e1',date='2027-05-05',shiftId='closing')];r=self.solve(s);self.assertEqual(r['workload'][0]['minimumNormalWorkGap'],1)
 def test_history_and_publication_boundaries(self):
  for source in ['history','published']:
   s=fixture();s['policies']=[];s['spacingRules'][0].update(mode='HARD',minimumGap=2);s['publishedAssignments']=[dict(employeeId='e1',date='2027-05-03',shiftId='closing')];a=dict(employeeId='e1',date='2027-05-02',shiftId='closing')
   if source=='history':s['history']['assignments']=[a];s['history']['through']='2027-05-02'
   else:s['publishedAssignments'].append(a)
   self.assertEqual(engine.call('solve',s)['status'],'INFEASIBLE')
 def test_priority_can_move_spacing_before_fairness(self):
  s=fixture();s['policies'][0]['objective']['priority']=20;s['spacingRules'][0]['priority']=0;r=self.solve(s);self.assertEqual(r['phases'][0]['policyId'],'spacing:space')
 def test_invalid_normal_shift(self):
  s=fixture();s['spacingRules'][0]['normalShiftIds']=['off'];self.assertEqual(engine.call('validate',s)['diagnostics'][0]['code'],'SPACING_NORMAL')
 def test_weekday_override_changes_physical_eligibility(self):
  s=fixture();s['workPatterns']=[dict(id='part',label='Part time',versions=[dict(validFrom='2027-01-01',weekdays=[1,2,3,4,5],shiftIds=['regular','closing','off'],weekdayShifts=[dict(weekday=d,shiftIds=['regular','off']) for d in [1,2,3,4]])])];s['employees'][0]['workPatternId']='part';r=self.solve(s);self.assertFalse(any(a['employeeId']=='e1' and a['shiftId']=='closing' and a['date']<'2027-05-07' for a in r['assignments']))
 def test_shared_category_preserves_types_and_rejects_history_redefinition(self):
  from change_sets import base
  s=base();r=self.solve(s);done=engine.call('consolidate',s,r,'2026-11-13')['scenario'];done['shifts'][1]['fairnessTags']=[];out=engine.call('solve',done);self.assertEqual(out['diagnostics'][0]['code'],'HISTORY_REBUILD_REQUIRED')
 def test_hard_spacing_is_verified_even_without_a_report(self):
  s=fixture();s['policies']=[];s['publishedAssignments']=[dict(employeeId='e1',date='2027-05-03',shiftId='closing'),dict(employeeId='e1',date='2027-05-04',shiftId='closing')];r=self.solve(s);r.pop('workload');s['spacingRules'][0].update(mode='HARD',minimumGap=2);out=engine.call('verify',s,r);self.assertIn('VERIFY_SPACING',[d['code'] for d in out['diagnostics']])
 def test_return_from_absence_has_no_invented_normal_day(self):
  s=fixture();s['policies']=[];s['availability']=[dict(id='away',selector={'employeeIds':['e1']},scope={'start':'2027-05-04','end':'2027-05-05'},state='ABSENT')];s['publishedAssignments']=[dict(employeeId='e1',date='2027-05-03',shiftId='closing'),dict(employeeId='e1',date='2027-05-06',shiftId='closing')];s['spacingRules'][0].update(unit='NORMAL_WORK_DAYS',minimumGap=1,mode='HARD');self.assertEqual(engine.call('solve',s)['status'],'INFEASIBLE');s['spacingRules'][0].update(unit='CALENDAR',minimumGap=2);self.solve(s)
 def test_exact_binding_prevents_unneeded_burden_outside_scope(self):
  from change_sets import base
  s=base();s['weekConfiguration']['defaultProfileId']='special';r=self.solve(s);self.assertEqual(sum(a['shiftId']=='closing' for a in r['assignments']),10)
if __name__=='__main__':unittest.main(verbosity=2)
