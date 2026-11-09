"""Canonical round trips, protected publication and idempotent actual-history replay."""
import copy,json,unittest
import evolution as engine

def fixture():return engine.upgraded(end='2027-05-05')
def action(s,catalogue,operation,**kw):return engine.call('archives',s,{'operation':operation,'archives':catalogue,'dryRun':False,'expectedRevision':s['revision'],'at':'2026-11-09T12:00:00Z',**kw})
def created(s,id='schedule-a'):
 r=engine.call('solve',s);assert r['status'] in ['OPTIMAL','FEASIBLE'],r
 a=action(s,[],'CREATE',id=id,result=r,createdAt='2026-11-09T12:00:00Z',source='test');assert a['status']=='ARCHIVED',a;return a['archive']
class Archives(unittest.TestCase):
 def test_01_draft_has_no_actual_history(self):
  s=fixture();a=created(s);self.assertEqual(a['state'],'DRAFT');self.assertEqual(a['publishedLocks'],[]);self.assertEqual(s['history']['assignments'],[]);self.assertIn('intervals',a['result']['assignments'][0])
 def test_02_publish_protects_future_without_counting_work(self):
  s=fixture();a=created(s);r=action(s,[a],'PUBLISH',id=a['id']);self.assertEqual(r['status'],'PUBLISHED',r);self.assertEqual(r['archives'][0]['state'],'PUBLISHED');self.assertEqual(r['scenario']['history']['assignments'],[]);self.assertEqual(len(r['scenario']['publishedAssignments']),9)
 def test_03_completed_prefix_replays_actuals_and_retains_future(self):
  s=fixture();a=created(s);r=action(s,[a],'PUBLISH',id=a['id']);r=action(r['scenario'],r['archives'],'COMPLETE',id=a['id'],through='2027-05-04');self.assertEqual(r['status'],'CONSOLIDATED',r);self.assertEqual(len(r['scenario']['history']['assignments']),6);self.assertEqual(len(r['scenario']['publishedAssignments']),3);self.assertEqual(r['scenario']['calendar']['start'],'2027-05-05');next=engine.call('solve',r['scenario']);self.assertIn(next['status'],['OPTIMAL','FEASIBLE'],next);self.assertTrue(any(e['initialActual'] for e in next['fairness'][0]['employees']))
 def test_04_import_published_into_new_session(self):
  s=fixture();a=created(s);pub=action(s,[a],'PUBLISH',id=a['id']);r=action(s,[],'IMPORT',archive=pub['archives'][0],mode='PUBLISH');self.assertEqual(r['status'],'IMPORTED',r);self.assertEqual(len(r['scenario']['publishedAssignments']),9);self.assertEqual(r['scenario']['history']['assignments'],[])
 def test_05_completed_import_is_idempotent(self):
  s=fixture();a=created(s);done=action(s,[a],'COMPLETE',id=a['id'],through='2027-05-04');a=done['archives'][0];r=action(s,[],'IMPORT',archive=a,mode='COMPLETE');self.assertIn('scenario',r,r);history=copy.deepcopy(r['scenario']['history']);again=action(r['scenario'],r['archives'],'IMPORT',archive=a,mode='COMPLETE');self.assertNotIn('scenario',again,again);self.assertEqual(history,r['scenario']['history']);self.assertEqual(len(again['archives']),1)
 def test_06_tampered_integrity_is_rejected_atomically(self):
  s=fixture();a=created(s);a['result']['assignments'][0]['shiftId']='missing';r=action(s,[],'IMPORT',archive=a,mode='REFERENCE');self.assertEqual(r['diagnostics'][0]['code'],'ARCHIVE_INTEGRITY');self.assertNotIn('scenario',r);self.assertNotIn('archives',r)
 def test_07_preview_does_not_apply_publication(self):
  s=fixture();a=created(s);r=engine.call('archives',s,{'operation':'PUBLISH','id':a['id'],'archives':[a],'expectedRevision':1,'dryRun':True});self.assertEqual(r['status'],'PREVIEW',r);self.assertNotIn('scenario',r);self.assertEqual(len(r['preview']['scenario']['publishedAssignments']),9);self.assertEqual(s['publishedAssignments'],[])
 def test_08_backup_restores_scenario_archives_and_history(self):
  s=fixture();a=created(s);r=action(s,[a],'COMPLETE',id=a['id'],through='2027-05-04');backup=action(r['scenario'],r['archives'],'BACKUP',createdAt='2026-11-09T13:00:00Z')['document'];restored=action(s,[],'RESTORE',backup=backup);self.assertEqual(restored['status'],'RESTORED',restored);self.assertEqual(restored['scenario'],r['scenario']);self.assertEqual(restored['archives'],r['archives']);self.assertEqual(engine.call('solve',restored['scenario'])['status'],'OPTIMAL')
 def test_09_revision_retains_original_and_only_publication_supersedes(self):
  s=fixture();a=created(s);pub=action(s,[a],'PUBLISH',id=a['id']);proposal=engine.call('archives',pub['scenario'],{'operation':'REVISE','archives':pub['archives'],'id':a['id'],'from':'2027-05-04','expectedRevision':pub['scenario']['revision'],'dryRun':False});self.assertIn('scenario',proposal,proposal);self.assertEqual(proposal['archives'][0]['state'],'PUBLISHED');self.assertEqual(len(proposal['scenario']['publishedAssignments']),3);new=created(proposal['scenario'],'schedule-b');r=action(proposal['scenario'],[proposal['archives'][0],new],'PUBLISH',id=new['id']);self.assertEqual(r['status'],'PUBLISHED',r);self.assertEqual([a['state'] for a in r['archives']],['SUPERSEDED','PUBLISHED'])
 def test_10_csv_and_revision_preconditions(self):
  s=fixture();a=created(s);r=action(s,[a],'CSV',id=a['id']);self.assertIn('Actual intervals',r['csv']);self.assertEqual(len(r['csv'].splitlines()),10);r=engine.call('archives',s,{'operation':'PUBLISH','id':a['id'],'archives':[a],'expectedRevision':99,'dryRun':False});self.assertEqual(r['diagnostics'][0]['code'],'REVISION_CONFLICT')
 def test_11_browser_number_round_trip_preserves_integrity(self):
  import subprocess
  s=fixture();s['search']['maxTimeSeconds']=20.0;a=created(s);wire=json.loads(subprocess.run(['node','-e','let t="";process.stdin.on("data",c=>t+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(t))));'],input=json.dumps(a),text=True,encoding="utf-8",capture_output=True,check=True).stdout);r=action(s,[],'IMPORT',archive=wire,mode='REFERENCE');self.assertEqual(r['status'],'IMPORTED',r)
 def test_12_checks_schedule_feasibility_beyond_hashes(self):
  s=fixture();r=engine.call('solve',s);r['assignments'][0]['shiftId']='missing';out=action(s,[],'CREATE',id='bad',result=r,createdAt='2026-11-09T12:00:00Z',source='test');self.assertEqual(out['diagnostics'][0]['code'],'ARCHIVE_INVALID');self.assertNotIn('archives',out)
 def test_13_advancing_completed_prefix_advances_archive_revision(self):
  s=fixture();a=created(s);r=action(s,[a],'COMPLETE',id=a['id'],through='2027-05-03');first=r['archives'][0]['revision'];r=action(r['scenario'],r['archives'],'COMPLETE',id=a['id'],through='2027-05-04');self.assertGreater(r['archives'][0]['revision'],first);self.assertEqual(r['archives'][0]['events'][-1]['completedThrough'],'2027-05-04');self.assertEqual(len(r['scenario']['history']['assignments']),6)
 def test_14_rebuild_new_category_from_completed_original_context(self):
  from change_sets import base
  s=base();a=created(s);done=action(s,[a],'COMPLETE',id=a['id'],through='2026-11-13');s=done['scenario'];p=copy.deepcopy(s['policies'][0]);p['id']='new-aggregate';p['objective']['id']='new-total';p['objective']['priority']=20;s['policies'].append(p);history=copy.deepcopy(s['history']['assignments']);self.assertEqual(engine.call('solve',s)['diagnostics'][0]['code'],'HISTORY_SNAPSHOT_REQUIRED');r=action(s,done['archives'],'REBUILD_HISTORY',useCurrentCategoryMembership=True);self.assertEqual(r['status'],'IMPORTED',r);self.assertEqual(r['scenario']['history']['assignments'],history);solved=engine.call('solve',r['scenario']);self.assertIn(solved['status'],['OPTIMAL','FEASIBLE'],solved);self.assertEqual(sum(e['initialActual'] for e in solved['fairness'][1]['employees']),5)
 def test_15_missing_history_context_never_guesses(self):
  s=fixture();a=created(s);done=action(s,[a],'COMPLETE',id=a['id'],through='2027-05-04');r=action(done['scenario'],[],'REBUILD_HISTORY',useCurrentCategoryMembership=True);self.assertEqual(r['diagnostics'][0]['code'],'ARCHIVE_CONTEXT_REQUIRED');self.assertNotIn('scenario',r)
 def test_16_repeated_publication_does_not_duplicate_locks(self):
  s=fixture();a=created(s);r=action(s,[a],'PUBLISH',id=a['id']);again=action(r['scenario'],r['archives'],'PUBLISH',id=a['id']);self.assertNotIn('scenario',again);self.assertEqual(again['archives'],r['archives'])
 def test_17_completion_cannot_silently_replace_an_official_assignment(self):
  s=fixture();a=created(s);published=action(s,[a],'PUBLISH',id=a['id']);other=copy.deepcopy(s);first=a['result']['assignments'][0]['date'];closing=next(x['employeeId'] for x in a['result']['assignments'] if x['date']==first and x['shiftId']=='closing');replacement=next(e['id'] for e in s['employees'] if e['id']!=closing);other['publishedAssignments']=[dict(employeeId=replacement,date=first,shiftId='closing')];b=created(other,'another');r=action(published['scenario'],[published['archives'][0],b],'COMPLETE',id=b['id'],through=first);self.assertEqual(r['diagnostics'][0]['code'],'ARCHIVE_OVERLAP');self.assertNotIn('scenario',r)
 def test_18_rebuild_retains_profile_linked_objective_fingerprint(self):
  from change_sets import base
  s=base();a=created(s);done=action(s,[a],'COMPLETE',id=a['id'],through='2026-11-13');s=done['scenario'];p=copy.deepcopy(s['policies'][0]);p['id']='new-linked';p['objective']['id']='linked-total';s['policies'].append(p);s['weekProfiles'][0]['policyIds'].append(p['id']);rebuilt=action(s,done['archives'],'REBUILD_HISTORY',useCurrentCategoryMembership=True);self.assertEqual(rebuilt['status'],'IMPORTED',rebuilt);self.assertIn(engine.call('solve',rebuilt['scenario'])['status'],['OPTIMAL','FEASIBLE'])
if __name__=='__main__':unittest.main(verbosity=2)
