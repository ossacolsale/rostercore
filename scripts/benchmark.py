"""Measure real CLI workloads; statuses are evidence, not latency promises."""
import argparse, copy, datetime, json, platform, subprocess, sys, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from create_example import scenario
p=argparse.ArgumentParser();p.add_argument('cli');p.add_argument('--output',default='docs/benchmark-results.json');args=p.parse_args()
results=[]
for n,days in [(5,14),(15,28),(40,56)]:
 s=scenario();template=copy.deepcopy(s['employees'][0]);s['employees']=[{**template,'id':f'e{i+1}','label':f'Employee {i+1}'} for i in range(n)];s['calendar']['end']=(datetime.date.fromisoformat(s['calendar']['start'])+datetime.timedelta(days=days-1)).isoformat();s['search']['maxTimeSeconds']=8
 started=time.monotonic();r=subprocess.run([args.cli,'solve','-'],input=json.dumps(s),text=True,capture_output=True,check=True);r=json.loads(r.stdout)
 row={'employees':n,'days':days,'status':r['status'],'wallSeconds':round(time.monotonic()-started,4),'engineSeconds':r['metadata']['elapsedSeconds'],'assignments':len(r.get('assignments',[])),'phases':r.get('phases',[])};results.append(row);print(f'{n} people × {days} days: {row["status"]} in {row["wallSeconds"]}s',flush=True)
report={'platform':platform.platform(),'python':platform.python_version(),'processor':platform.processor(),'engineVersion':'0.1.0','backendVersion':r['metadata']['backendVersion'],'budgetSeconds':8,'workers':1,'seed':42,'results':results}
Path(args.output).write_text(json.dumps(report,indent=2)+'\n')
