"""Automatic assignments use dated core selectors; preserve legacy overrides."""
import copy,unittest
import evolution as engine

def fixture():
 s=engine.upgraded(end='2027-05-05');s['schemaVersion']=3
 s['attributeDefinitions']=[{'id':'contract','label':'Contract','type':'ENUM','values':['FULL_TIME','PART_TIME'],'default':'FULL_TIME'}]
 s['workPatterns']=[{'id':'full','label':'Full','versions':[{'validFrom':'2027-01-01','weekdays':[1,2,3,4,5,6,7],'shiftIds':['regular','closing','off'],'exceptions':[]}]},{'id':'part','label':'Morning','versions':[{'validFrom':'2027-01-01','weekdays':[1,2,3,4,5,6,7],'shiftIds':['regular','off'],'exceptions':[]}]}]
 s['workPatternAssignmentRules']=[{'id':id,'label':id,'enabled':True,'selector':{'where':{'op':'EQ','attributeId':'contract','value':value}},'workPatternId':pattern,'priority':10,'validFrom':'2027-01-01'} for id,value,pattern in [('full-rule','FULL_TIME','full'),('part-rule','PART_TIME','part')]]
 return s

def assignments(s,date='2027-05-03'):
 r=engine.call('inspect-patterns',s,date);return {e['employeeId']:e['workPatternAssignment'] for e in r['workforce']['employees']}
class AutomaticAssignments(unittest.TestCase):
 def solved(self,s):
  r=engine.call('solve',s);self.assertIn(r['status'],['OPTIMAL','FEASIBLE'],r);self.assertEqual(engine.call('verify',s,r)['status'],'VERIFIED');return r
 def test_01_defaults_and_explicit_values(self):
  s=fixture();s['employees'][1]['attributes']['contract']='PART_TIME';a=assignments(s);self.assertEqual(a['e1'],{'origin':'AUTOMATIC_RULE','workPatternId':'full','ruleIds':['full-rule']});self.assertEqual(a['e2']['workPatternId'],'part');r=self.solved(s);self.assertFalse(any(a['employeeId']=='e2' and a['shiftId']=='closing' for a in r['assignments']))
 def test_02_future_attribute_changes_pattern(self):
  s=fixture();s['employees'][0]['versions']=[{'validFrom':'2027-05-04','attributes':{'contract':'PART_TIME'}}];self.assertEqual(assignments(s)['e1']['workPatternId'],'full');self.assertEqual(assignments(s,'2027-05-04')['e1']['workPatternId'],'part');self.assertNotIn('workPatternId',s['employees'][0]);self.solved(s)
 def test_03_base_manual_precedence(self):
  s=fixture();s['employees'][0].update(workPatternId='part');self.assertEqual(assignments(s)['e1']['origin'],'INDIVIDUAL');self.assertEqual(assignments(s)['e1']['workPatternId'],'part');del s['employees'][0]['workPatternId'];self.assertEqual(assignments(s)['e1']['workPatternId'],'full')
 def test_04_temporal_manual_then_automatic_masks_base(self):
  s=fixture();s['employees'][0].update(workPatternId='part',versions=[{'validFrom':'2027-05-04','validTo':'2027-05-05','workPatternId':'full'},{'validFrom':'2027-05-05','workPatternId':None}]);self.assertEqual(assignments(s)['e1']['workPatternId'],'part');self.assertEqual(assignments(s,'2027-05-04')['e1']['origin'],'TEMPORAL_OVERRIDE');self.assertEqual(assignments(s,'2027-05-05')['e1']['workPatternId'],'full');self.solved(s)
 def test_05_conflict_is_diagnostic_in_preview_and_error_in_solve(self):
  s=fixture();s['workPatternAssignmentRules'].append({**copy.deepcopy(s['workPatternAssignmentRules'][0]),'id':'conflict','workPatternId':'part'});r=engine.call('validate',s);self.assertEqual(r['diagnostics'][0]['code'],'WORK_PATTERN_ASSIGNMENT_CONFLICT');self.assertEqual(engine.call('solve',s)['status'],'VALIDATION_ERROR');preview=engine.call('inspect-patterns',s,'2027-05-03');self.assertEqual(len(preview['workforce']['employees']),3);self.assertTrue(all(e['workPatternAssignment']['origin']=='CONFLICT' for e in preview['workforce']['employees']));self.assertEqual(len(preview['diagnostics']),3)
 def test_06_same_priority_same_pattern_is_compatible(self):
  s=fixture();s['workPatternAssignmentRules'].append({**s['workPatternAssignmentRules'][0],'id':'same'});self.assertEqual(set(assignments(s)['e1']['ruleIds']),{'full-rule','same'});self.solved(s)
 def test_07_higher_priority_wins(self):
  s=fixture();s['workPatternAssignmentRules'].append({**s['workPatternAssignmentRules'][0],'id':'higher','priority':11,'workPatternId':'part','selector':{'employeeIds':['e1']}});self.assertEqual(assignments(s)['e1']['workPatternId'],'part');self.solved(s)
 def test_08_disabled_effective_and_inactive(self):
  s=fixture();s['workPatternAssignmentRules'][0]['enabled']=False;self.assertEqual(assignments(s)['e1']['origin'],'NONE');s['workPatternAssignmentRules'][0].update(enabled=True,validTo='2027-05-04');self.assertEqual(assignments(s,'2027-05-04')['e1']['origin'],'NONE');s['employees'][0]['employment']={'validFrom':'2027-05-04'};self.assertEqual(assignments(s)['e1']['origin'],'INACTIVE');r=engine.call('inspect-patterns',s,'2027-05-03');self.assertNotIn('e1',r['workforce']['rules'][0]['employeeIds'])
 def test_09_dynamic_group_selectors(self):
  s=fixture();s['groups']=[{'id':'part','label':'Part','selector':{'where':{'op':'EQ','attributeId':'contract','value':'PART_TIME'}}}];s['workPatternAssignmentRules'][1]['selector']={'groupIds':['part']};s['employees'][0]['versions']=[{'validFrom':'2027-05-04','attributes':{'contract':'PART_TIME'}}];self.assertEqual(assignments(s,'2027-05-04')['e1']['workPatternId'],'part');self.solved(s)
 def test_10_variants_use_resolved_arrangement(self):
  s=fixture();s['employees'][0]['attributes']['contract']='PART_TIME';s['shifts'][0]['variants']=[{'id':pattern,'label':pattern,'priority':0,'selector':{},'scope':{},'workPatternIds':[pattern],'intervals':[{'start':'09:00','end':end,'endDayOffset':0}]} for pattern,end in [('full','17:00'),('part','12:00')]];r=engine.call('inspect',s,'2027-05-03');e=r['workforce']['employees'][0];self.assertEqual(next(sh for sh in e['shifts'] if sh['shiftId']=='regular')['intervals'][0]['end'],'12:00');self.solved(s)
 def test_11_verifier_checks_automatic_domain(self):
  s=fixture();s['employees'][0]['attributes']['contract']='PART_TIME';r=self.solved(s);a=next(a for a in r['assignments'] if a['employeeId']=='e1');a['shiftId']='closing';self.assertEqual(engine.call('verify',s,r)['status'],'MODEL_INVALID')
 def test_12_migration_preserves_individual_assignments(self):
  s=fixture();del s['workPatternAssignmentRules'];s['schemaVersion']=2;s['employees'][0]['workPatternId']='part';r=engine.call('migrate',s);self.assertEqual(r['scenario']['schemaVersion'],4);self.assertEqual(r['scenario']['employees'],s['employees']);self.assertEqual(r['scenario']['history'],s['history']);self.assertEqual(r['scenario']['workPatternAssignmentRules'],[]);self.solved(r['scenario'])
 def test_13_history_is_retained_after_future_change(self):
  s=fixture();r=self.solved(s);s=engine.call('consolidate',s,r,'2027-05-03')['scenario'];old=copy.deepcopy(s['history']);s['employees'][0]['versions']=[{'validFrom':'2027-05-04','attributes':{'contract':'PART_TIME'}}];self.solved(s);self.assertEqual(s['history'],old);self.assertEqual(assignments(s,'2027-05-04')['e1']['workPatternId'],'part')
 def test_14_unknown_references_dates_and_schema_are_rejected(self):
  s=fixture();s['workPatternAssignmentRules'][0]['workPatternId']='missing';self.assertEqual(engine.call('validate',s)['diagnostics'][0]['code'],'REFERENCE');s=fixture();s['workPatternAssignmentRules'][0]['validTo']='2026-01-01';self.assertEqual(engine.call('validate',s)['diagnostics'][0]['code'],'DATE_RANGE');s=fixture();s['schemaVersion']=2;self.assertEqual(engine.call('validate',s)['diagnostics'][0]['code'],'SCHEMA_VERSION')
 def test_15_manual_assignments_mask_conflicting_rules(self):
  s=fixture();s['workPatternAssignmentRules'].append({**s['workPatternAssignmentRules'][0],'id':'conflict','workPatternId':'part'});
  for e in s['employees']:e['workPatternId']='full'
  self.solved(s);self.assertTrue(all(a['origin']=='INDIVIDUAL' for a in assignments(s).values()))
 def test_16_effective_pattern_gap_is_explained(self):
  s=fixture();s['workPatterns'][0]['versions'][0]['validTo']='2027-05-04';self.assertEqual(engine.call('validate',s)['diagnostics'][0]['code'],'WORK_PATTERN_GAP');r=engine.call('inspect-patterns',s,'2027-05-04');self.assertEqual(len(r['workforce']['employees']),3);self.assertEqual(r['diagnostics'][0]['code'],'WORK_PATTERN_GAP')
 def test_17_automatic_temporal_override_ends_exclusively(self):
  s=fixture();s['employees'][0].update(workPatternId='part',versions=[{'validFrom':'2027-05-04','validTo':'2027-05-05','workPatternId':None}]);self.assertEqual(assignments(s,'2027-05-04')['e1']['workPatternId'],'full');self.assertEqual(assignments(s,'2027-05-05')['e1']['workPatternId'],'part');self.solved(s)
 def test_18_pattern_preview_does_not_require_finished_operational_configuration(self):
  s=fixture()
  for shift in s['shifts']:
   if shift['kind']=='WORKING':shift['intervals']=[]
  self.assertEqual(engine.call('solve',s)['status'],'VALIDATION_ERROR');self.assertEqual(assignments(s)['e1']['workPatternId'],'full')
  s=fixture();s['policies'][0]['objective']['selector']={'employeeIds':['missing']};self.assertEqual(assignments(s)['e1']['workPatternId'],'full');self.assertEqual(engine.call('solve',s)['status'],'VALIDATION_ERROR')
if __name__=='__main__':unittest.main(verbosity=2)
