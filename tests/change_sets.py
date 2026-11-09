"""Executable authoring examples, atomic updates, protected history and recovery."""
import copy,json,unittest
import evolution as engine
EX=engine.ROOT/'AI_EXAMPLES'
def load(name):return json.loads((EX/name).read_text())
def base():return load('01-create-scenario.json')
def apply(s,doc,dry=False):return engine.call('change-set',s,doc,*([] if dry else ['--apply']))
class ChangeSets(unittest.TestCase):
 def test_all_seven_examples_validate_and_apply(self):
  s=base();self.assertEqual(engine.call('validate',s)['status'],'VALID');self.assertEqual(engine.call('solve',s)['status'],'OPTIMAL')
  for file in sorted(EX.glob('*.json'))[1:]:
   doc=json.loads(file.read_text());r=apply(s,doc);self.assertEqual(r['status'],'IMPORTED',(file,r));self.assertEqual(engine.call('validate',r['scenario'])['status'],'VALID')
 def test_dated_patch_preserves_unspecified_fields_and_future(self):
  s=base();e=s['employees'][0];e['versions']=[dict(validFrom='2026-12-01',validTo='2027-06-01',attributes={'manager':False},typeId='staff'),dict(validFrom='2027-06-01',attributes={'manager':True})];future=copy.deepcopy(e['versions'][1]);r=apply(s,load('02-anna-part-time.json'));e=r['scenario']['employees'][0];self.assertEqual(e['label'],'Anna');self.assertEqual(e['attributes'],s['employees'][0]['attributes']);self.assertEqual(e['versions'][1]['typeId'],'staff');self.assertFalse(e['versions'][1]['attributes']['manager']);self.assertEqual(e['versions'][2],future);self.assertEqual(e['versions'][0]['validTo'],'2027-03-01')
 def test_preview_and_repeat_are_atomic(self):
  s=base();doc=load('04-marco-unexpected-absence.json');preview=apply(s,doc,True);self.assertEqual(preview['status'],'PREVIEW');self.assertNotIn('scenario',preview);r=apply(s,doc);again=apply(r['scenario'],doc);self.assertTrue(again['preview']['idempotent']);self.assertNotIn('scenario',again)
 def test_conflicting_receipt_rejected(self):
  s=base();doc=load('04-marco-unexpected-absence.json');r=apply(s,doc);doc['description']='Different';r=apply(r['scenario'],doc);self.assertEqual(r['diagnostics'][0]['code'],'CHANGE_SET_CONFLICT')
 def test_revision_and_entity_preconditions(self):
  s=base();doc=load('07-new-colleague-fairness.json');doc['operations'][1]['expectedEntityHash']='bad';r=apply(s,doc);self.assertEqual(r['diagnostics'][0]['code'],'ENTITY_CONFLICT');self.assertNotIn('scenario',r);doc['expectedRevision']=99;self.assertEqual(apply(s,doc)['diagnostics'][0]['code'],'REVISION_CONFLICT')
 def test_no_arbitrary_patch_or_hard_change_without_authorization(self):
  s=base();doc=load('05-evening-shift.json');doc['allowHardRuleChanges']=False;self.assertEqual(apply(s,doc)['diagnostics'][0]['code'],'HARD_RULE_AUTHORIZATION');doc['operations'][0]={'op':'PATCH','path':'/history','value':[]};self.assertEqual(apply(s,doc)['diagnostics'][0]['code'],'SCHEMA')
 def test_all_or_nothing_on_late_failure(self):
  s=base();doc=load('04-marco-unexpected-absence.json');doc['operations'].append(dict(op='UPDATE_EMPLOYEE',employeeId='missing',effectiveFrom='2026-11-09',patch={'attributes':{'contract':'PART_TIME'}}));r=apply(s,doc);self.assertEqual(r['status'],'VALIDATION_ERROR');self.assertNotIn('scenario',r);self.assertEqual(s['availability'],[])
 def test_absence_regeneration(self):
  s=base();prior=engine.call('solve',s);changed=apply(s,load('04-marco-unexpected-absence.json'))['scenario'];r=engine.call('regenerate',changed,{'from':'2026-11-09','previousScenario':s,'previousResult':prior,'stabilityPriority':'AFTER_FAIRNESS'});self.assertIn(r['status'],['OPTIMAL','FEASIBLE'],r);self.assertFalse(any(a['employeeId']=='marco' and a['date']<='2026-11-11' for a in r['assignments']))
 def test_history_continues_for_new_hire(self):
  s=base();r=engine.call('solve',s);done=engine.call('consolidate',s,r,'2026-11-15')['scenario'];doc=load('07-new-colleague-fairness.json');doc['expectedRevision']=done['revision'];updated=apply(done,doc);self.assertEqual(updated['status'],'IMPORTED',updated);self.assertEqual(updated['scenario']['history'],done['history']);r=engine.call('solve',updated['scenario']);self.assertEqual(r['status'],'OPTIMAL',r);self.assertTrue(any(e['initialActual'] for e in r['fairness'][0]['employees']));self.assertIn('new-colleague',[e['employeeId'] for e in r['fairness'][0]['employees']])
 def test_published_absence_requires_revision(self):
  s=base();r=engine.call('solve',s);s['publishedAssignments']=r['assignments'];doc=load('04-marco-unexpected-absence.json');out=apply(s,doc);self.assertEqual(out['status'],'VALIDATION_ERROR');self.assertNotIn('scenario',out)
 def test_special_sunday_manager_physically_present(self):
  s=apply(base(),load('06-special-sunday-manager.json'))['scenario'];s['weekConfiguration']['defaultProfileId']='special';r=engine.call('solve',s);self.assertIn(r['status'],['OPTIMAL','FEASIBLE'],r);rows=[x for x in r['coverage'] if x['requirementId']=='sunday-manager'];self.assertEqual(len(rows),2);self.assertTrue(all(len(x['people'])>=1 for x in rows))
 def test_improve_retains_verified_incumbent_at_zero_budget(self):
  s=base();r=engine.call('solve',s);out=engine.call('improve',s,{'previousScenario':s,'previousResult':r,'maxTimeSeconds':0});self.assertEqual(out['status'],'FEASIBLE',out);self.assertEqual(out['assignments'],r['assignments']);self.assertTrue(out['metadata']['retainedVerifiedIncumbent']);self.assertEqual(engine.call('verify',out['scenario'],out)['status'],'VERIFIED')
 def test_full_scenario_import_preview_then_apply(self):
  s=base();candidate=base();candidate['id']='another';doc={'candidate':candidate,'expectedRevision':1,'mode':'NEW_SCENARIO','allowHardRuleChanges':False};p=engine.call('import-scenario',s,doc);self.assertEqual(p['status'],'PREVIEW');self.assertNotIn('scenario',p);r=engine.call('import-scenario',s,doc,'--apply');self.assertEqual(r['scenario']['id'],'another')
 def test_published_work_cannot_lose_its_pattern_domain(self):
  s=base();r=engine.call('solve',s);s['publishedAssignments']=r['assignments'];employee=next(a['employeeId'] for a in r['assignments'] if a['shiftId']=='closing' and a['date']=='2026-11-09');doc=load('02-anna-part-time.json');doc['operations'][0].update(employeeId=employee,effectiveFrom='2026-11-09');out=apply(s,doc);self.assertEqual(out['diagnostics'][0]['code'],'PROTECTED_ASSIGNMENT');self.assertNotIn('scenario',out)
if __name__=='__main__':unittest.main(verbosity=2)
