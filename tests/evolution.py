"""Schema-2 calendar, workforce, coverage and regeneration acceptance tests."""
import copy,json,sys,tempfile,unittest
from pathlib import Path
from fractions import Fraction
ROOT=Path(__file__).resolve().parents[1];CLI=str(Path(sys.argv.pop(1)).resolve());sys.path.insert(0,str(ROOT/'scripts'))
from create_evolution_example import upgraded,pharmacy
from cli_runner import run_cli,process_details

def call(action,s,*extra):
 with tempfile.TemporaryDirectory() as directory:
  args=[action,'-']
  for i,value in enumerate(extra):
   if isinstance(value,str):args.append(value)
   else:
    path=Path(directory)/f'{i}.json';path.write_text(json.dumps(value),encoding='utf-8');args.append(str(path))
  p=run_cli(CLI,*args,input_text=json.dumps(s),timeout=60)
  try:return json.loads(p.stdout)
  except Exception:raise AssertionError(process_details(p))
def profiles(s):
 s['weekProfiles']=[{'id':id,'label':id,'offWeekdays':[],'holidayMode':'NORMAL','constraintIds':[],'policyIds':[]} for id in ['a','b','c']];s['weekConfiguration']['defaultProfileId']='a';return s
class Evolution(unittest.TestCase):
 def solved(self,s):
  r=call('solve',s);self.assertIn(r['status'],['OPTIMAL','FEASIBLE'],r.get('diagnostics'));self.assertEqual(call('verify',s,r)['status'],'VERIFIED',r.get('diagnostics'))
  for f in r.get('fairness',[]):
   for p in f['prefixes']:self.assertEqual(sum(Fraction(e['debt']['numerator'],e['debt']['denominator']) for e in p['employees']),0)
  return r
 def test_01_cycle_and_year(self):
  s=profiles(upgraded(start='2026-12-21',end='2027-02-14'));s['weekConfiguration']['recurrences']=[{'id':'cycle','label':'Cycle','anchor':'2026-12-23','sequence':['b','a','a','a'],'validFrom':'2026-12-21'}];r=call('inspect',s);self.assertEqual([w['profileIds'][0] for w in r['weekAssignments']],['b','a','a','a','b','a','a','a']);self.assertEqual(r['weekAssignments'][1]['isoWeek'],'2026-W53')
 def test_02_manual_override_no_phase_shift(self):
  s=profiles(upgraded(start='2027-05-03',end='2027-05-30'));s['weekConfiguration']['recurrences']=[{'id':'cycle','label':'Cycle','anchor':'2027-05-03','sequence':['b','a','a','a'],'validFrom':'2027-05-03'}];s['weekConfiguration']['manual']=[{'week':'2027-05-10','profileId':'b','overrideRecurrence':True,'reason':'Exception','waiveFrequencyIds':[]}];r=call('inspect',s);self.assertEqual([w['profileIds'][0] for w in r['weekAssignments']],['b','b','a','a']);s['weekConfiguration']['manual'][0]['overrideRecurrence']=False;self.assertEqual(call('validate',s)['diagnostics'][0]['code'],'WEEK_OVERRIDE_REQUIRED')
 def test_03_recurrence_versions(self):
  s=profiles(upgraded(start='2027-05-03',end='2027-06-06'));s['weekConfiguration']['recurrences']=[{'id':'old','label':'Old','anchor':'2027-05-03','sequence':['b','a'],'validFrom':'2027-05-03','validTo':'2027-05-17'},{'id':'new','label':'New','anchor':'2027-05-17','sequence':['c','a','a'],'validFrom':'2027-05-17'}];r=call('inspect',s);self.assertEqual([w['profileIds'][0] for w in r['weekAssignments']],['b','a','c','a','a'])
 def test_04_automatic_hard_soft(self):
  s=profiles(upgraded(end='2027-05-30'));s['policies']=[];s['weekConfiguration']['automatic']={'profileIds':['a','b'],'validFrom':'2027-05-03'};s['weekConfiguration']['frequencies']=[{'id':'frequency','profileId':'b','windowWeeks':4,'minCount':1,'maxCount':1,'desiredCount':1}];r=self.solved(s);self.assertEqual(sum(w['profileId']=='b' for w in r['weekAssignments']),1);self.assertEqual(r['phases'][0]['metric'],'DESIRED_WEEK_FREQUENCY')
 def test_05_manual_frequency_conflict(self):
  s=profiles(upgraded(end='2027-05-16'));s['policies']=[];s['weekConfiguration']['manual']=[{'week':d,'profileId':'b','overrideRecurrence':False,'reason':'Manual','waiveFrequencyIds':[]} for d in ['2027-05-03','2027-05-10']];s['weekConfiguration']['frequencies']=[{'id':'gap','profileId':'b','minGapWeeks':4}];self.assertEqual(call('solve',s)['status'],'INFEASIBLE');s['weekConfiguration']['manual'][1]['waiveFrequencyIds']=['gap'];self.solved(s)
 def test_06_italian_holidays(self):
  for year,present in [(2025,False),(2026,True)]:
   s=upgraded(start=f'{year}-10-04',end=f'{year}-10-04');s['calendar']['holidays']={'country':'IT','catalogueVersion':'IT-2001-2026.1','localDates':[]};self.assertEqual(bool(call('inspect',s)['calendarDays'][0]['holidays']),present)
  s=upgraded(start='2027-03-29',end='2027-03-29');s['calendar']['holidays']={'country':'IT','catalogueVersion':'IT-2001-2026.1','localDates':[]};self.assertEqual(call('inspect',s)['calendarDays'][0]['holidays'][0]['id'],'it.easter_monday')
 def test_07_profile_holiday_behavior(self):
  s=profiles(upgraded(start='2027-05-01',end='2027-05-01'));s['policies']=[];s['calendar']['holidays']={'country':'IT','catalogueVersion':'IT-2001-2026.1','localDates':[]};s['weekProfiles'][0]['holidayMode']='OFF';r=self.solved(s);self.assertTrue(all(a['shiftId']=='off' for a in r['assignments']));s['weekProfiles'][0]['holidayMode']='NORMAL';s['baseConstraintIds']=['staff'];s['constraints']=[{'id':'staff','expression':{'op':'COUNT','selector':{},'shiftId':'closing','comparison':'EQ','count':1}}];r=self.solved(s);self.assertTrue(any(a['shiftId']=='closing' for a in r['assignments']))
 def test_08_closure(self):
  s=upgraded(end='2027-05-04');s['calendar']['closures']=[{'id':'closed','label':'Closed','validFrom':'2027-05-03','validTo':'2027-05-04','selector':{},'reason':'Shutdown','exceptions':[]}];r=self.solved(s);self.assertFalse(any(a['date']=='2027-05-03' for a in r['assignments']));self.assertTrue(all(c['state']=='CLOSED' for c in r['calendarStates']))
 def test_09_defaults_false_and_missing(self):
  s=upgraded(end='2027-05-03');s['attributeDefinitions']=[{'id':'qualified','label':'Qualified','type':'BOOLEAN','default':True}];s['employees'][1]['attributes']={'qualified':False};s['employees'][2]['attributes']={'qualified':None};r=call('inspect',s)['workforce']['employees'];self.assertEqual([e['attributes']['qualified']['origin'] for e in r],['DEFAULT','EXPLICIT','MISSING']);self.assertFalse(r[1]['attributes']['qualified']['value'])
 def test_10_dynamic_contract_groups(self):
  s=upgraded(end='2027-05-04');s['attributeDefinitions']=[{'id':'contract','label':'Contract','type':'ENUM','values':['full','part'],'default':'full'}];s['employees'][0]['versions']=[{'validFrom':'2027-05-04','attributes':{'contract':'part'}}];s['groups']=[{'id':'part','label':'Part','selector':{'where':{'op':'EQ','attributeId':'contract','value':'part'}}}];s['allowedShifts']=[{'id':'off','selector':{'groupIds':['part']},'scope':{},'shiftIds':['off']}];r=self.solved(s);self.assertEqual(next(a['shiftId'] for a in r['assignments'] if a['employeeId']=='e1' and a['date']=='2027-05-04'),'off')
 def test_11_employment_and_retention(self):
  s=upgraded(end='2027-05-05');s['employees'][0]['employment']={'validFrom':'2027-05-04'};s['employees'][1]['employment']={'validFrom':'2027-01-01','validTo':'2027-05-05'};r=self.solved(s);self.assertFalse(any(a['employeeId']=='e1' and a['date']=='2027-05-03' for a in r['assignments']));self.assertFalse(any(a['employeeId']=='e2' and a['date']=='2027-05-05' for a in r['assignments']))
 def test_12_legacy_migration(self):
  s=upgraded();s['schemaVersion']=1;before=copy.deepcopy(s['history']);r=call('migrate',s);self.assertEqual(r['status'],'MIGRATED');self.assertEqual(r['scenario']['history'],before);self.assertEqual([e['id'] for e in s['employees']],[e['id'] for e in r['scenario']['employees']])
 def test_13_predicate_missing_ne_exists(self):
  s=upgraded(end='2027-05-03');s['attributeDefinitions']=[{'id':'flag','label':'Flag','type':'BOOLEAN'}];s['employees'][0]['attributes']={'flag':False};s['employees'][1]['attributes']={'flag':True};s['allowedShifts']=[{'id':'restriction','selector':{'where':{'op':'AND','children':[{'op':'EXISTS','attributeId':'flag'},{'op':'NE','attributeId':'flag','value':True}]}},'scope':{},'shiftIds':['off']}];r=self.solved(s);self.assertEqual(next(a['shiftId'] for a in r['assignments'] if a['employeeId']=='e1'),'off');s['allowedShifts'][0]['selector']['where']={'op':'NOT_EXISTS','attributeId':'flag'};r=self.solved(s);self.assertEqual(next(a['shiftId'] for a in r['assignments'] if a['employeeId']=='e3'),'off')
 def test_14_part_time_variants_friday(self):
  s=pharmacy();s['calendar'].update(start='2027-05-13',end='2027-05-14');hours=[]
  for date in ['2027-05-13','2027-05-14']:
   e=next(e for e in call('inspect',s,date)['workforce']['employees'] if e['employeeId']=='p3');hours.append(next(x['intervals'] for x in e['shifts'] if x['shiftId']=='normal'))
  self.assertEqual([len(x) for x in hours],[1,2])
 def test_15_fairness_tag_no_duplicate_count(self):
  s=upgraded(end='2027-05-05');s['shifts'][1]['fairnessTags']=['closing','extra'];s['policies'][0]['objective']['fairnessTags']=['closing','extra'];r=self.solved(s);self.assertEqual(sum(e['actual'] for e in r['fairness'][0]['employees']),3)
 def coverage_fixture(self):
  s=upgraded(end='2027-05-03');s['policies'][0]['constraints']=[];s['dutyRequirements']=[{'id':'closing','label':'Qualified closing','mode':'RESPONSIBILITY','shiftIds':['closing'],'levels':[{'selector':{'employeeIds':['e1','e2']},'level':0},{'selector':{'employeeIds':['e3']},'level':1}],'comparison':'EQ','count':1,'intervals':[{'start':'20:00','end':'20:30','endDayOffset':0}],'scope':{},'preferencePriority':0,'exclusiveGroup':'daily'}];return s
 def test_16_reject_morning_only_evening_coverage(self):
  s=self.coverage_fixture();s['shifts'][1]['intervals']=[{'start':'09:00','end':'12:00','endDayOffset':0}];self.assertEqual(call('solve',s)['status'],'INFEASIBLE')
 def test_17_fallback_never_for_secondary_fairness(self):
  s=self.coverage_fixture();r=self.solved(s);self.assertEqual(r['phases'][0]['metric'],'FALLBACK_LEVEL_1');self.assertEqual(r['phases'][0]['valueScaled'],0);self.assertFalse(any(p['substitution'] for row in r['coverage'] for p in row['people']))
 def test_18_fallback_when_required(self):
  s=self.coverage_fixture();s['availability']=[{'id':'away','selector':{'employeeIds':['e1','e2']},'state':'ABSENT','scope':{}}];r=self.solved(s);self.assertEqual(r['coverage'][0]['people'][0]['employeeId'],'e3');self.assertTrue(r['coverage'][0]['people'][0]['substitution'])
 def test_19_no_fallback_infeasible(self):
  s=self.coverage_fixture();s['availability']=[{'id':'away','selector':{},'state':'ABSENT','scope':{}}];self.assertEqual(call('solve',s)['status'],'INFEASIBLE')
 def night_fixture(self,start='2027-05-08',end='2027-05-09'):
  s=upgraded(start=start,end=end);s['policies']=[];s['shifts'].append({'id':'night','label':'Night','kind':'WORKING','intervals':[{'start':'22:00','end':'08:00','endDayOffset':1}]});s['temporalRules']=[{'id':'after-night','label':'Next day off','type':'SUCCESSION','selector':{},'fromShiftIds':['night'],'toShiftIds':['off'],'offsetDays':1,'scope':{}}];s['publishedAssignments']=[{'employeeId':'e1','date':start,'shiftId':'night'}];return s
 def test_20_night_next_calendar_day_off(self):
  s=self.night_fixture();r=self.solved(s);self.assertEqual(next(a['shiftId'] for a in r['assignments'] if a['employeeId']=='e1' and a['date']=='2027-05-09'),'off')
 def test_21_sunday_night_profile_boundary(self):
  s=profiles(self.night_fixture('2027-05-09','2027-05-10'));s['weekConfiguration']['manual']=[{'week':'2027-05-03','profileId':'b','overrideRecurrence':False,'reason':'Duty week','waiveFrequencyIds':[]}];r=self.solved(s);self.assertEqual(next(a['shiftId'] for a in r['assignments'] if a['employeeId']=='e1' and a['date']=='2027-05-10'),'off')
 def test_22_dst_elapsed_rest_and_ambiguity(self):
  for start,end,rest,expected in [('2027-03-27','2027-03-28',480,'INFEASIBLE'),('2027-10-30','2027-10-31',540,'OPTIMAL')]:
   s=self.night_fixture(start,end);s['shifts'][-1]['intervals'][0]['end']='01:30';s['shifts'][0]['intervals']=[{'start':'09:30','end':'17:00','endDayOffset':0}];s['temporalRules'][0].update(type='MIN_REST',toShiftIds=[],minimumMinutes=rest);s['publishedAssignments'].append({'employeeId':'e1','date':end,'shiftId':'regular'});self.assertEqual(call('solve',s)['status'],expected)
  s['shifts'][-1]['intervals'][0]['end']='02:30';self.assertEqual(call('solve',s)['diagnostics'][0]['code'],'AMBIGUOUS_LOCAL_TIME')
 def test_23_partial_regeneration_with_stability(self):
  s=upgraded(end='2027-05-05');r=self.solved(s);updated=copy.deepcopy(s);updated['availability']=[{'id':'sudden','selector':{'employeeIds':['e1']},'scope':{'start':'2027-05-04','end':'2027-05-04'},'state':'ABSENT'}];new=call('regenerate',updated,{'from':'2027-05-04','previousScenario':s,'previousResult':r,'stabilityPriority':'BEFORE_FAIRNESS'});self.assertIn(new['status'],['OPTIMAL','FEASIBLE'],new.get('diagnostics'));self.assertFalse(any(a['employeeId']=='e1' and a['date']=='2027-05-04' for a in new['assignments']));self.assertTrue(all(x['date']>='2027-05-04' for x in new['changes']));self.assertEqual(call('verify',new['scenario'],new)['status'],'VERIFIED')
 def test_24_protected_closure_night_conflict(self):
  s=self.night_fixture();s['calendar']['closures']=[{'id':'closure','label':'Closure','validFrom':'2027-05-09','validTo':'2027-05-10','selector':{},'reason':'Closed','exceptions':[]}];self.assertEqual(call('validate',s)['diagnostics'][0]['code'],'CLOSURE_PROTECTED_CONFLICT')
 def test_25_future_hire_no_retroactive_quota(self):
  s=upgraded(end='2027-05-05');s['employees'][0]['employment']={'validFrom':'2027-05-05'};r=self.solved(s);prefix=r['fairness'][0]['prefixes'][0]['employees'];self.assertEqual(next(e['ideal']['numerator'] for e in prefix if e['employeeId']=='e1'),0)
 def test_26_termination_keeps_historical_balance(self):
  s=upgraded(end='2027-05-06');r=self.solved(s);s=call('consolidate',s,r,'2027-05-04')['scenario'];s['employees'][0]['employment']={'validFrom':'2027-01-01','validTo':'2027-05-05'};r=self.solved(s);e=next(e for e in r['fairness'][0]['employees'] if e['employeeId']=='e1');self.assertEqual(e['ideal'],e['initialIdeal']);self.assertEqual(e['actual'],e['initialActual'])
 def test_27_effective_type_and_work_pattern(self):
  s=upgraded(end='2027-05-04');s['workPatterns']=[{'id':'off-only','label':'Off only','versions':[{'validFrom':'2027-01-01','weekdays':[],'shiftIds':['off'],'exceptions':[]}]}];s['employees'][0]['versions']=[{'validFrom':'2027-05-04','workPatternId':'off-only'}];r=self.solved(s);self.assertEqual(next(a['shiftId'] for a in r['assignments'] if a['employeeId']=='e1' and a['date']=='2027-05-04'),'off')
 def test_28_roster_change_preserves_history(self):
  s=upgraded(end='2027-05-06');r=self.solved(s);s=call('consolidate',s,r,'2027-05-04')['scenario'];history=copy.deepcopy(s['history']);s['employees'].append({'id':'new','label':'New','typeId':'staff','attributes':{},'employment':{'validFrom':'2027-05-05'}});r=self.solved(s);new=next(e for e in r['fairness'][0]['employees'] if e['employeeId']=='new');self.assertEqual(new['initialActual'],0);self.assertEqual(new['initialIdeal']['numerator'],0);self.assertEqual(s['history'],history)
 def test_29_reject_ambiguous_variants(self):
  s=upgraded(end='2027-05-03');v={'id':'a','label':'A','priority':0,'selector':{},'scope':{},'intervals':s['shifts'][0]['intervals']};s['shifts'][0]['variants']=[v,{**copy.deepcopy(v),'id':'b'}];self.assertEqual(call('validate',s)['diagnostics'][0]['code'],'VARIANT_AMBIGUITY')
 def test_30_new_policy_import(self):
  s=profiles(upgraded(end='2027-05-03'));p=copy.deepcopy(s['policies'][0]);p['id']='new';p['objective']['id']='new-objective';p['objective']['scope']={'weekProfileIds':['a']};d={'format':'rostercore.planning-policy','schemaVersion':2,'engineVersion':'0.2.0','operation':'CREATE','policy':p};r=call('import-policy',s,d,'--apply');self.assertEqual(r['status'],'IMPORTED');self.solved(r['scenario'])
 def test_31_independent_coverage_and_profile_checks(self):
  s=profiles(self.coverage_fixture());r=self.solved(s);bad=copy.deepcopy(r);bad['coverage'][0]['people'][0]['level']=99;self.assertEqual(call('verify',s,bad)['status'],'MODEL_INVALID');bad=copy.deepcopy(r);bad['weekAssignments'][0]['profileId']='b';self.assertEqual(call('verify',s,bad)['status'],'MODEL_INVALID')
 def test_32_complete_pharmacy_example(self):
  s=pharmacy();s['calendar'].update(start='2027-05-10',end='2027-05-14');r=self.solved(s);self.assertFalse(any(p['substitution'] for row in r['coverage'] for p in row['people']));s['calendar'].update(start='2027-05-10',end='2027-05-11');s['availability'].append({'id':'sudden','selector':{'employeeIds':['p1']},'scope':{},'state':'ABSENT'});r=self.solved(s);self.assertTrue(any(p['substitution'] for row in r['coverage'] for p in row['people']))

 def test_33_distinct_people_for_shared_shift_duties(self):
  s=self.coverage_fixture();s['dutyRequirements'][0]['levels']=[{'selector':{},'level':0}];other=copy.deepcopy(s['dutyRequirements'][0]);other['id']='other-duty';s['dutyRequirements'].append(other);r=self.solved(s);people=[p['employeeId'] for row in r['coverage'] for p in row['people']];self.assertEqual(len(people),2);self.assertEqual(len(set(people)),2)
 def test_34_presence_handover_uses_change_points(self):
  s=upgraded(end='2027-05-03');s['policies']=[];s['shifts'][0]['intervals']=[{'start':'09:00','end':'12:00','endDayOffset':0}];s['shifts'][1]['intervals']=[{'start':'12:00','end':'17:00','endDayOffset':0}];s['publishedAssignments']=[{'employeeId':'e1','date':'2027-05-03','shiftId':'regular'},{'employeeId':'e2','date':'2027-05-03','shiftId':'closing'}];s['dutyRequirements']=[{'id':'presence','label':'Presence','mode':'PRESENCE','shiftIds':['regular','closing'],'levels':[{'selector':{},'level':0}],'comparison':'GE','count':1,'intervals':[{'start':'09:00','end':'17:00','endDayOffset':0}],'scope':{},'preferencePriority':0}];self.solved(s)
 def test_35_selector_preview_typed_defaults(self):
  s=pharmacy();s['calendar'].update(start='2027-05-10',end='2027-05-10');r=call('select',s,{'where':{'op':'EQ','attributeId':'contract','value':'PART_TIME'}},'2027-05-10');self.assertEqual(r['workforce']['selectedEmployeeIds'],['p3'])
 def test_36_reserved_attribute_names_are_data(self):
  s=upgraded(end='2027-05-03');s['employees'][0]['attributes']={'draft':'text','where':False,'selector':0};self.assertEqual(call('validate',s)['status'],'VALID')
 def test_37_automatic_first_week_without_prior_classification(self):
  s=profiles(self.coverage_fixture());del s['weekConfiguration']['defaultProfileId'];s['weekConfiguration']['automatic']={'validFrom':'2027-05-03','profileIds':['a','b']};s['dutyRequirements'][0]['mode']='PRESENCE';s['temporalRules']=[{'id':'next','label':'Next off','type':'SUCCESSION','selector':{},'fromShiftIds':['closing'],'toShiftIds':['off'],'offsetDays':1,'scope':{}}];self.solved(s)
 def test_38_profile_gated_required_rest_across_automatic_weeks(self):
  s=profiles(upgraded(start='2027-05-09',end='2027-05-10'));s['policies']=[];del s['weekConfiguration']['defaultProfileId'];s['weekConfiguration']['automatic']={'validFrom':'2027-05-03','profileIds':['a','b']};s['weekProfiles'][0]['shiftIds']=['regular','off'];s['publishedAssignments']=[{'employeeId':'e1','date':'2027-05-09','shiftId':'closing'}];s['allowedShifts']=[{'id':'regular-day','selector':{},'shiftIds':['regular'],'scope':{'weekdays':[1]},'allowRequiredRest':True}];s['temporalRules']=[{'id':'next','label':'Next off','type':'SUCCESSION','selector':{},'fromShiftIds':['closing'],'toShiftIds':['off'],'offsetDays':1,'scope':{'weekProfileIds':['b']}}];r=self.solved(s);self.assertEqual(next(a['shiftId'] for a in r['assignments'] if a['employeeId']=='e1' and a['date']=='2027-05-10'),'off')
 def test_39_frozen_hours_cannot_change(self):
  s=upgraded(end='2027-05-04');r=self.solved(s);changed=copy.deepcopy(s)
  for sh in changed['shifts']:
   if sh['intervals']:sh['intervals'][0]['start']='07:00'
  new=call('regenerate',changed,{'from':'2027-05-04','previousScenario':s,'previousResult':r});self.assertEqual(new['status'],'INFEASIBLE')
 def test_40_frozen_absence_cannot_become_assignment(self):
  s=upgraded(end='2027-05-04');s['availability']=[{'id':'away','selector':{'employeeIds':['e1']},'scope':{'start':'2027-05-03','end':'2027-05-03'},'state':'ABSENT'}];r=self.solved(s);changed=copy.deepcopy(s);changed['availability']=[];new=call('regenerate',changed,{'from':'2027-05-04','previousScenario':s,'previousResult':r});self.assertEqual(new['status'],'INFEASIBLE')
 def test_41_ai_context_retains_predicate_attributes(self):
  s=pharmacy();r=call('context',s)['context'];self.assertEqual(next(e for e in r['employees'] if e['id']=='p3')['attributes']['contract'],'PART_TIME');self.assertTrue(next(e for e in r['employees'] if e['id']=='p1')['attributes']['nightEligible']);self.assertNotIn('label',r['employees'][0]);self.assertNotIn('history',r)
 def test_42_assignment_profile_metadata_is_verified(self):
  s=profiles(upgraded(end='2027-05-03'));r=self.solved(s);r['assignments'][0]['weekProfileId']='b';self.assertEqual(call('verify',s,r)['status'],'MODEL_INVALID')
if __name__=='__main__':unittest.main(verbosity=2)
