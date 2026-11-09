"""Blocking preference-quality regressions using anonymized operational inputs."""
import copy,json,unittest
import evolution as engine
from pathlib import Path

def fixture(days=2):
 s=json.loads((engine.ROOT/'examples/coverage-reliability.json').read_text());s['calendar']['end']='2026-11-'+str(8+days).zfill(2);s['search']['maxTimeSeconds']=5;return s

def primary_types(s):return sorted(set(t for r in s['dutyRequirements'] for t in r['levels'][0]['selector']['typeIds']))
def owners(s):return [e['id'] for e in s['employees'] if e['typeId']==s['dutyRequirements'][0]['levels'][1]['selector']['typeIds'][0]]
def absent(s,selector):s['availability'].append({'id':'test-absence','selector':selector,'scope':{},'state':'ABSENT'})
class Reliability(unittest.TestCase):
 def solved(self,s):
  r=engine.call('solve',s);self.assertIn(r['status'],['OPTIMAL','FEASIBLE'],r);self.assertEqual(engine.call('verify',s,r)['status'],'VERIFIED');return r
 def test_01_ordinary_staff_sufficient_no_substitutions(self):
  s=fixture();r=self.solved(s);self.assertEqual(r['quality']['fallback']['totalSubstitutions'],0);self.assertEqual(engine.call('verify-quality',s,r)['status'],'QUALITY_VERIFIED')
 def test_02_one_pharmacist_away_still_zero(self):
  s=fixture();id=next(e['id'] for e in s['employees'] if e['typeId']==s['dutyRequirements'][0]['levels'][0]['selector']['typeIds'][0]);absent(s,{'employeeIds':[id]});r=self.solved(s);self.assertEqual(r['quality']['fallback']['totalSubstitutions'],0)
 def test_03_substitution_when_ordinary_staff_absent(self):
  s=fixture();absent(s,{'typeIds':primary_types(s)});r=self.solved(s);self.assertGreater(r['quality']['fallback']['totalSubstitutions'],0);audit=engine.call('verify-quality',s,r);self.assertEqual(audit['status'],'QUALITY_VERIFIED');self.assertTrue(all(row['status']=='PROVED_MINIMUM' for row in audit['quality']['audit']))
 def test_04_no_reserve_means_infeasible(self):
  s=fixture();absent(s,{});self.assertEqual(engine.call('solve',s)['status'],'INFEASIBLE')
 def test_05_distinct_responsibilities_and_no_extra_burden(self):
  s=fixture();r=self.solved(s);d={}
  for row in r['coverage']:
   for p in row['people']:d.setdefault(row['date'],[]).append(p['employeeId'])
  self.assertTrue(all(len(ids)==2 and len(set(ids))==2 for ids in d.values()));burdens={id for duty in s['dutyRequirements'] for id in duty['shiftIds']};self.assertEqual(sum(a['shiftId'] in burdens for a in r['assignments']),sum(len(row['people']) for row in r['coverage']))
 def test_06_fairness_cannot_increase_proved_fallback(self):
  s=fixture(14);r=self.solved(s);self.assertEqual(r['phases'][0]['metric'],'FALLBACK_LEVEL_1');self.assertEqual(r['phases'][0]['valueScaled'],0);self.assertEqual(r['quality']['fallback']['totalSubstitutions'],0)
 def test_07_exhausted_budget_never_claims_optimality(self):
  s=fixture();s['search']['maxTimeSeconds']=0;r=engine.call('solve',s);self.assertEqual(r['status'],'UNKNOWN');self.assertNotIn('assignments',r)
 def test_08_multiple_levels_minimize_worst_first(self):
  s=fixture();absent(s,{'typeIds':primary_types(s)});ids=owners(s)
  for duty in s['dutyRequirements']:duty['levels']=[duty['levels'][0],{'selector':{'employeeIds':ids[:2]},'level':1},{'selector':{'employeeIds':ids[2:]},'level':2}]
  r=self.solved(s);self.assertEqual(r['quality']['fallback']['stages'][0]['minimumLevel'],2);self.assertEqual(r['quality']['fallback']['stages'][0]['incumbent'],0);self.assertGreater(r['quality']['fallback']['totalSubstitutions'],0)
 def test_09_independent_audit_detects_improvable_feasible_schedule(self):
  s=fixture();good=self.solved(s);forced=copy.deepcopy(s);reserve=owners(s)[0];forced['publishedAssignments']=[{'employeeId':reserve,'date':s['calendar']['start'],'shiftId':s['dutyRequirements'][0]['shiftIds'][0]}];bad=self.solved(forced);bad['metadata']=good['metadata'];bad.pop('quality',None);self.assertEqual(engine.call('verify',s,bad)['status'],'VERIFIED');audit=engine.call('verify-quality',s,bad);self.assertEqual(audit['status'],'QUALITY_IMPROVABLE')
 def test_10_long_trial_proves_zero_before_large_fairness_model(self):
  s=fixture();s['calendar']['end']='2026-12-31';s['calendar']['excludedIsoWeeks']=['2026-W48','2026-W52'];r=self.solved(s);self.assertEqual(r['quality']['fallback']['totalSubstitutions'],0);self.assertEqual(r['quality']['fallback']['status'],'PROVED_MINIMUM')
 def test_11_quality_timeout_does_not_trust_claimed_phase(self):
  s=fixture();absent(s,{'typeIds':primary_types(s)});r=self.solved(s)
  for p in r['phases']:
   if p['metric'].startswith('FALLBACK_'):p['status']='FEASIBLE';p['bestBoundScaled']=0
  r.pop('quality',None);audit=engine.call('verify-quality',s,r,'0');self.assertEqual(audit['status'],'QUALITY_UNKNOWN');self.assertEqual(audit['quality']['fallback']['status'],'PROVISIONAL')
if __name__=='__main__':unittest.main(verbosity=2)
