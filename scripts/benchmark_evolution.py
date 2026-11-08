"""Measure and independently verify the shipped schema-2 examples."""
import argparse,json,platform,subprocess,time,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('cli');p.add_argument('--output',default='docs/evolution-benchmark-results.json');args=p.parse_args()
root=Path(__file__).resolve().parents[1];cli=str(Path(args.cli).resolve());rows=[]
for name in ['pharmacy-evolution','pharmacy-automatic-weeks']:
 scenario=json.loads((root/'examples'/f'{name}.json').read_text(encoding='utf-8'));started=time.monotonic()
 process=subprocess.run([cli,'solve','-'],input=json.dumps(scenario),capture_output=True,text=True,encoding='utf-8',check=True);r=json.loads(process.stdout);wall=time.monotonic()-started
 verified=None
 if 'assignments' in r:
  with tempfile.TemporaryDirectory() as folder:
   result=Path(folder)/'result.json';result.write_text(process.stdout,encoding='utf-8');checked=subprocess.run([cli,'verify',str(root/'examples'/f'{name}.json'),str(result)],capture_output=True,text=True,encoding='utf-8',check=True);verified=json.loads(checked.stdout)['status']
  assert verified=='VERIFIED',verified
 row={'example':name,'employees':len(scenario['employees']),'days':35,'budgetSeconds':scenario['search']['maxTimeSeconds'],'status':r['status'],'wallSeconds':round(wall,4),'assignments':len(r.get('assignments',[])),'verification':verified,'substitutions':sum(p['substitution'] for row in r.get('coverage',[]) for p in row['people']),'weekAssignments':r.get('weekAssignments',[]),'phases':r.get('phases',[]),'diagnostics':r['diagnostics']};rows.append(row);print(f'{name}: {r["status"]}, {wall:.3f}s, {verified}',flush=True)
Path(args.output).write_text(json.dumps({'platform':platform.platform(),'engineVersion':r['metadata']['engineVersion'],'backendVersion':r['metadata']['backendVersion'],'results':rows},indent=2)+'\n',encoding='utf-8')
