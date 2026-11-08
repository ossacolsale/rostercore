"""CLI acceptance, regression and mathematical invariant tests; no native wrapper."""
import copy, hashlib, itertools, json, random, sys, tempfile, unittest
from collections import Counter
from fractions import Fraction
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CLI=str(Path(sys.argv.pop(1)).resolve())
sys.path.insert(0,str(ROOT/'scripts'))
from create_example import scenario
from cli_runner import process_details, run_cli
from cli_smoke import check_cli

def invoke(command,s,*extra,apply=False,mappings=None):
 with tempfile.TemporaryDirectory() as d:
  paths=[]
  for i,document in enumerate([s,*extra]):
   if isinstance(document,str): paths.append(document)
   else:
    p=Path(d)/f'{i}.json';p.write_text(json.dumps(document),encoding='utf-8');paths.append(str(p))
  args=[CLI,command,*paths]
  if apply:args.append('--apply')
  if mappings is not None:
   p=Path(d)/'mappings.json';p.write_text(json.dumps(mappings),encoding='utf-8');args+=['--mappings',str(p)]
  p=run_cli(args[0],*args[1:])
  try:return json.loads(p.stdout)
  except Exception:raise AssertionError(f'{args}: {process_details(p)}')
def fraction(v):return Fraction(v['numerator'],v['denominator'])
def atom(n=1,comparison='EQ',shift='closing',selector=None):return {'op':'COUNT','selector':selector or {'typeIds':['staff']},'shiftId':shift,'comparison':comparison,'count':n}
def policy_document(p,operation='CREATE',expected=None):
 d={'format':'rostercore.planning-policy','schemaVersion':1,'engineVersion':'0.1.0','operation':operation,'policy':copy.deepcopy(p)}
 if expected is not None:d['expectedRevision']=expected
 return d

def event(revision=1,operation='UPSERT',status='APPROVED'):
 return {'eventId':f'leave-{revision}','source':'hr','externalId':'leave-1','employeeId':'e1','revision':revision,'operation':operation,'absenceType':'LEAVE','status':status,'start':'2026-01-26','end':'2026-01-27'}
def hr(*events,**kwargs):return {'format':'rostercore.hr-events','schemaVersion':1,'events':list(events),**kwargs}

class Acceptance(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  check_cli(CLI)
 def solved(self,s):
  r=invoke('solve',s);self.assertEqual(r['status'],'OPTIMAL',{'diagnostics':r['diagnostics'],'phases':r.get('phases')});self.assertEqual(invoke('verify',s,r)['status'],'VERIFIED');self.assertEqual(r['metadata']['configurationHash'],hashlib.sha256(json.dumps(s,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest())
  for report in r['fairness']:
   for prefix in report['prefixes']:
    self.assertEqual(sum(fraction(e['debt']) for e in prefix['employees']),0)
    for e in prefix['employees']:self.assertEqual(fraction(e['ideal'])-e['actual'],fraction(e['debt']))
  return r
 def test_01_three_continuously_balanced(self):
  s=scenario(3,end='2026-02-03');r=self.solved(s)
  for prefix in r['fairness'][0]['prefixes']:
   counts=[e['actual'] for e in prefix['employees']];self.assertLessEqual(max(counts)-min(counts),1)
 def test_02_fourteen_among_five(self):
  r=self.solved(scenario());self.assertEqual(sorted(e['actual'] for e in r['fairness'][0]['employees']),[2,3,3,3,3])
 def test_03_month_boundary(self):
  r=self.solved(scenario(3));prefixes=r['fairness'][0]['prefixes'];feb=next(p for p in prefixes if p['date']=='2026-02-01');self.assertEqual(sum(e['actual'] for e in feb['employees']),7)
 def test_04_rolling_horizons(self):
  s=scenario();r=self.solved(s);c=invoke('consolidate',s,r,'2026-02-01');self.assertEqual(c['status'],'CONSOLIDATED',c);next_s=c['scenario'];next_r=self.solved(next_s);self.assertEqual(sorted(e['actual'] for e in next_r['fairness'][0]['employees']),[2,3,3,3,3]);self.assertEqual(next_s['history']['assignments'],[a for a in r['assignments'] if a['date']<='2026-02-01']);self.assertGreater(sum(e['initialActual'] for e in next_r['fairness'][0]['employees']),0)
 def test_05_absence(self):
  s=scenario();s['availability']=[{'id':'away','selector':{'employeeIds':['e1']},'scope':{'start':'2026-01-26','end':'2026-01-28'},'state':'ABSENT'}];r=self.solved(s);self.assertFalse(any(a['employeeId']=='e1' and a['date']<='2026-01-28' for a in r['assignments']))
 def test_06_exclusions(self):
  s=scenario();s['calendar']['excludedDates']=['2026-01-27'];s['calendar']['excludedRanges']=[{'start':'2026-01-29','end':'2026-01-30'}];s['calendar']['excludedIsoWeeks']=['2026-W06'];r=self.solved(s);self.assertEqual(sum(e['actual'] for e in r['fairness'][0]['employees']),4)
 def test_07_intersecting_groups(self):
  s=scenario();s['allowedShifts']=[{'id':'a','selector':{'employeeIds':['e1']},'shiftIds':['regular','closing'],'scope':{}},{'id':'b','selector':{'groupIds':['team']},'shiftIds':['regular','off'],'scope':{}}];r=invoke('solve',s);self.assertEqual(r['status'],'INFEASIBLE');s['allowedShifts'][1]['selector']={'employeeIds':['e1']};r=self.solved(s);self.assertTrue(all(a['shiftId']=='regular' for a in r['assignments'] if a['employeeId']=='e1'));s['allowedShifts'][1]['shiftIds']=['off'];self.assertEqual(invoke('solve',s)['diagnostics'][0]['code'],'EMPTY_ALLOWED_INTERSECTION')
 def test_08_nested_boolean_equivalence(self):
  s=scenario(3,end='2026-01-27');s['policies'][0]['constraints'][0]['expression']={'op':'OR','children':[{'op':'AND','children':[atom(4),atom(1,'EQ','regular')]},{'op':'AND','children':[atom(1),{'op':'OR','children':[atom(1,'EQ','regular'),atom(2,'EQ','regular')]}]}]};r=self.solved(s);self.assertTrue(all(sum(a['date']==d and a['shiftId']=='closing' for a in r['assignments'])==1 for d in ['2026-01-26','2026-01-27']))
 def test_09_remaining_branch_and_at_least(self):
  s=scenario(end='2026-01-26');base=s['policies'][0]['constraints'][0]['expression'];base['children'][1]['count']=3;branch=copy.deepcopy(base);branch['children'][0]['count']=2;branch['children'][1]['count']=2;s['policies'][0]['constraints'][0]['expression']={'op':'OR','children':[base,branch]};r=self.solved(s);self.assertGreaterEqual(sum(a['shiftId']=='regular' for a in r['assignments']),2)
  s['constraints']=[{'id':'force-ge','expression':atom(4,'GE','regular')}];s['baseConstraintIds']=['force-ge'];r=self.solved(s);self.assertEqual(sum(a['shiftId']=='regular' for a in r['assignments']),4)
  base['children'].reverse();s['policies'][0]['constraints'][0]['expression']=base;self.solved(s)
 def test_10_understaffing(self):
  s=scenario(3);s['policies'][0]['constraints'][0]['expression']=atom(4);r=invoke('solve',s);self.assertEqual(r['status'],'INFEASIBLE');self.assertIn('HARD_CONFLICT',str(r))
 def test_11_multiple_policies(self):
  s=scenario(3,end='2026-01-29');p=copy.deepcopy(s['policies'][0]);p.update(id='regular-policy',constraints=[]);p['objective'].update(id='regular-objective',shiftIds=['regular'],priority=1);s['policies'].append(p);r=self.solved(s);self.assertEqual(len(r['fairness']),2)
 def test_12_priority_and_ties(self):
  s=scenario(3,end='2026-01-28');p=copy.deepcopy(s['policies'][0]);p.update(id='a-first',constraints=[]);p['objective'].update(id='other',priority=0);s['policies'].append(p);r=self.solved(s);self.assertEqual(r['phases'][0]['policyId'],'a-first');p['objective']['priority']=2;r=self.solved(s);self.assertEqual(r['phases'][0]['policyId'],'closing-fairness')
 def test_13_replace_policy(self):
  s=scenario();p=copy.deepcopy(s['policies'][0]);p.update(revision=2,label='Updated');d=policy_document(p,'REPLACE',1);r=invoke('import-policy',s,d);self.assertEqual(r['status'],'PREVIEW');self.assertNotIn('scenario',r);r=invoke('import-policy',s,d,apply=True);self.assertEqual(r['scenario']['policies'][0]['label'],'Updated');self.assertEqual(r['scenario']['constraints'],s['constraints'])
 def test_14_revision_conflict(self):
  s=scenario();p=copy.deepcopy(s['policies'][0]);p['revision']=2;self.assertEqual(invoke('import-policy',s,policy_document(p,'REPLACE',99))['diagnostics'][0]['code'],'REVISION_CONFLICT')
 def test_15_unknown_reference(self):
  s=scenario();p=copy.deepcopy(s['policies'][0]);p.update(id='new');p['objective'].update(id='new-objective',shiftIds=['nonexistent']);self.assertEqual(invoke('import-policy',s,policy_document(p))['status'],'VALIDATION_ERROR')
 def test_16_draft_dependency_mapping(self):
  s=scenario();p=copy.deepcopy(s['policies'][0]);p.update(id='new',active=False,draft=True,constraints=[],dependencies=[{'symbol':'@duty','kind':'shift'}]);p['objective'].update(id='draft-objective',shiftIds=['@duty']);d=policy_document(p);r=invoke('import-policy',s,d,apply=True);self.assertTrue(r['scenario']['policies'][1]['draft']);p['active']=True;self.assertEqual(invoke('import-policy',s,policy_document(p))['status'],'VALIDATION_ERROR');p.update(draft=False);r=invoke('import-policy',s,policy_document(p),apply=True,mappings={'@duty':'closing'});self.assertEqual(r['scenario']['policies'][1]['objective']['shiftIds'],['closing'])
 def test_17_atomic_failure(self):
  s=scenario();before=copy.deepcopy(s);p=copy.deepcopy(s['policies'][0]);p['revision']=2;p['sharedConstraintIds']=['bad'];r=invoke('import-policy',s,policy_document(p,'REPLACE',1),apply=True);self.assertEqual(s,before);self.assertNotIn('scenario',r)
 def test_18_hr_idempotency_and_order(self):
  s=scenario();d=hr(event());r=invoke('sync-hr',s,d,apply=True);s=r['scenario'];self.assertEqual(len(s['hrState']['events']),1);r=invoke('sync-hr',s,d,apply=True);self.assertEqual(r['scenario'],s);e=event(2);e['end']='2026-01-29';s=invoke('sync-hr',s,hr(e),apply=True)['scenario'];self.assertEqual(invoke('sync-hr',s,d,apply=True)['scenario'],s)
 def test_19_hr_update_delete_snapshot_protection(self):
  s=invoke('sync-hr',scenario(),hr(event()),apply=True)['scenario'];s=invoke('sync-hr',s,hr(event(2,'DELETE')),apply=True)['scenario'];self.assertEqual(s['hrState']['events'][0]['operation'],'DELETE');self.solved(s)
  s=invoke('sync-hr',s,hr(event(3)),apply=True)['scenario'];s=invoke('sync-hr',s,hr(snapshot={'source':'hr','revision':4}),apply=True)['scenario'];self.assertEqual(s['hrState']['events'][0]['operation'],'DELETE');self.assertEqual(invoke('sync-hr',s,hr(event(3)),apply=True)['scenario'],s)
  s=scenario();s['publishedAssignments']=[{'employeeId':'e1','date':'2026-01-26','shiftId':'closing'}];self.assertEqual(invoke('sync-hr',s,hr(event()),apply=True)['diagnostics'][0]['code'],'HR_PROTECTED_CONFLICT')
 def test_20_objective_history_recalculation(self):
  s=scenario(3,end='2026-01-29');r=self.solved(s);s=invoke('consolidate',s,r,'2026-01-27')['scenario'];p=copy.deepcopy(s['policies'][0]);p['revision']=2;p['objective']['participation']='AVAILABILITY_WEIGHTED';d=policy_document(p,'REPLACE',1);r=invoke('import-policy',s,d,apply=True);self.assertTrue(r['preview']['historyRecalculationRequired']);self.assertEqual(invoke('solve',r['scenario'])['diagnostics'][0]['code'],'HISTORY_REBUILD_REQUIRED')
 def test_21_timeout_truthfulness(self):
  s=scenario();s['search']['maxTimeSeconds']=0;r=invoke('solve',s);self.assertEqual(r['status'],'UNKNOWN');self.assertNotIn('assignments',r)
 def test_22_unsupported_strict_validation(self):
  for key,value in [('measure','MINUTES'),('measure','BURDEN_POINTS'),('mode','EARLIEST_BALANCE'),('type','MAGIC')]:
   s=scenario();s['policies'][0]['objective'][key]=value;self.assertEqual(invoke('validate',s)['status'],'VALIDATION_ERROR')
  s=scenario();s['policies'][0]['constraints'][0]['expression']={'op':'NOT','children':[atom()]};self.assertEqual(invoke('validate',s)['status'],'VALIDATION_ERROR')
  s=scenario();s['policies'][0]['objective']['script']='alert(1)';self.assertEqual(invoke('validate',s)['status'],'VALIDATION_ERROR')
 def test_23_weighted_conservation(self):
  for mode in ['CUSTOM_WEIGHTED','AVAILABILITY_WEIGHTED']:
   s=scenario(3,end='2026-01-31');o=s['policies'][0]['objective'];o['participation']=mode
   if mode=='CUSTOM_WEIGHTED':o['weights']={'e1':1,'e2':2,'e3':3}
   else:s['availability']=[{'id':'away','selector':{'employeeIds':['e1']},'scope':{'start':'2026-01-26','end':'2026-01-28'},'state':'ABSENT'}]
   r=self.solved(s)
   if mode=='CUSTOM_WEIGHTED':self.assertEqual([fraction(e['ideal']) for e in r['fairness'][0]['employees']],[1,2,3])
 def test_24_verifier_rejects_tampering(self):
  s=scenario(3,end='2026-01-26');r=self.solved(s);r['assignments'][0]['shiftId']='off';self.assertEqual(invoke('verify',s,r)['status'],'MODEL_INVALID');r=self.solved(s);r['fairness'][0]['employees'][0]['actual']=99;self.assertEqual(invoke('verify',s,r)['status'],'MODEL_INVALID')
 def test_25_randomized_fairness_properties(self):
  rng=random.Random(42)
  for _ in range(8):
   n=rng.randint(2,5);days=rng.randint(2,7);s=scenario(n,end=f'2026-01-{25+days:02d}' if days<=6 else '2026-02-01');r=self.solved(s);counts=[e['actual'] for e in r['fairness'][0]['employees']];self.assertLessEqual(max(counts)-min(counts),1)
 def test_26_calendar_groups_and_intervals(self):
  s=scenario(3,end='2026-01-28');s['groups'].append({'id':'cycle','label':'Cycle','selector':{'groupIds':['cycle']}});self.assertEqual(invoke('validate',s)['diagnostics'][0]['code'],'GROUP_CYCLE');s=scenario();s['calendar']['start']='2026-02-30';self.assertEqual(invoke('validate',s)['status'],'VALIDATION_ERROR');s=scenario();s['shifts'][0]['intervals'][0]['end']='07:00';self.assertEqual(invoke('validate',s)['status'],'VALIDATION_ERROR')
 def test_27_requested_hr_does_not_block(self):
  s=invoke('sync-hr',scenario(3,end='2026-01-28'),hr(event(status='REQUESTED')),apply=True)['scenario'];r=self.solved(s);self.assertTrue(any(a['employeeId']=='e1' and a['date']=='2026-01-26' for a in r['assignments']))
 def test_28_remaining_ambiguity_rejected(self):
  s=scenario();s['policies'][0]['constraints'][0]['expression']['children'][0]['selector']={'groupIds':['team']};self.assertEqual(invoke('validate',s)['diagnostics'][0]['code'],'AMBIGUOUS_REMAINING')
 def test_29_context_minimizes_personal_data(self):
  s=scenario();s['employees'][0]['attributes']={'email':'private@example.org'};c=invoke('context',s)['context'];self.assertNotIn('Alex',json.dumps(c));self.assertNotIn('private@example.org',json.dumps(c));self.assertNotIn('history',c)
 def test_30_exhaustive_small_lexicographic_optimum(self):
  s=scenario(3,end='2026-01-28');r=self.solved(s);scores=[]
  for choices in itertools.product(range(3),repeat=3):
   counts=[0]*3;values=[]
   for i,e in enumerate(choices):
    counts[e]+=1;values.extend(abs(Fraction(i+1,3)-v) for v in counts)
   scores.append((max(values),sum(values),sum(values[-3:])))
  metrics=r['fairness'][0]['metrics'];actual=tuple(fraction(metrics[k]) for k in s['policies'][0]['objective']['metrics']);self.assertEqual(actual,min(scores))

 def test_31_rebuild_history_from_dated_context(self):
  context=scenario(3,end='2026-01-29');s=copy.deepcopy(context);r=self.solved(s);s=invoke('consolidate',s,r,'2026-01-27')['scenario'];s['policies'][0]['objective']['participation']='AVAILABILITY_WEIGHTED';self.assertEqual(invoke('solve',s)['status'],'VALIDATION_ERROR');context['calendar']['end']='2026-01-27';d={'format':'rostercore.history-contexts','schemaVersion':1,'scenarios':[context]};preview=invoke('rebuild-history',s,d);self.assertEqual(preview['status'],'PREVIEW');r=invoke('rebuild-history',s,d,apply=True);self.assertEqual(r['scenario']['history']['assignments'],s['history']['assignments']);self.solved(r['scenario'])
 def test_32_shared_constraints_only_when_active(self):
  s=scenario(3,end='2026-01-26');s['constraints']=[{'id':'impossible','expression':atom(9)}];self.solved(s);s['policies'][0]['sharedConstraintIds']=['impossible'];self.assertEqual(invoke('solve',s)['status'],'INFEASIBLE');s['policies'][0]['active']=False;self.solved(s)
 def test_33_overnight_boundaries(self):
  s=scenario(3,end='2026-01-27');s['shifts'][1]['intervals']=[{'start':'22:00','end':'10:00','endDayOffset':1}];s['publishedAssignments']=[{'employeeId':'e1','date':'2026-01-26','shiftId':'closing'},{'employeeId':'e1','date':'2026-01-27','shiftId':'regular'}];self.assertEqual(invoke('solve',s)['status'],'INFEASIBLE');s['publishedAssignments']=s['publishedAssignments'][:1];r=self.solved(s);s=invoke('consolidate',s,r,'2026-01-26')['scenario'];s['publishedAssignments']=[{'employeeId':'e1','date':'2026-01-27','shiftId':'regular'}];self.assertEqual(invoke('solve',s)['status'],'INFEASIBLE')
 def test_34_example_contracts(self):
  s=scenario()
  for name in ['policy-create','policy-replace','policy-draft']:
   d=json.loads((ROOT/f'examples/{name}.json').read_text(encoding='utf-8'));self.assertEqual(invoke('import-policy',s,d)['status'],'PREVIEW')
  d=json.loads((ROOT/'examples/policy-invalid.json').read_text(encoding='utf-8'));self.assertEqual(invoke('import-policy',s,d)['status'],'VALIDATION_ERROR')
 def test_35_draft_must_declare_unknown_ids(self):
  s=scenario();p=copy.deepcopy(s['policies'][0]);p.update(id='bad-draft',active=False,draft=True,constraints=[],dependencies=[]);p['objective'].update(id='bad-objective',shiftIds=['@undeclared']);self.assertEqual(invoke('import-policy',s,policy_document(p))['status'],'VALIDATION_ERROR')
 def test_36_protected_consolidated_hr_conflict(self):
  s=scenario(3,end='2026-01-28');r=self.solved(s);a=next(a for a in r['assignments'] if a['shiftId']=='closing' and a['date']=='2026-01-26');s=invoke('consolidate',s,r,'2026-01-26')['scenario'];e=event();e['employeeId']=a['employeeId'];self.assertEqual(invoke('sync-hr',s,hr(e),apply=True)['diagnostics'][0]['code'],'HR_PROTECTED_CONFLICT')
 def test_37_duplicate_json_keys_rejected(self):
  r=run_cli(CLI,'validate','-',input_text='{"format":"rostercore.scenario","format":"override"}');self.assertEqual(json.loads(r.stdout)['diagnostics'][0]['code'],'JSON_DUPLICATE_KEY')

if __name__=='__main__':unittest.main(verbosity=2)
