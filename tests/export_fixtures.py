"""Produce genuine native projections for independent PDF/ICS file tests."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from calendar_exports import fixture,view,options
from archives import created,action
# evolution consumes the CLI argument; remaining argument is the output directory.
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
s=fixture();s['employees'][0]['label']='Anna è; Rossi, Junior';s['employees'][1]['label']='Marco Other-person';s['employees'][2]['label']='Rest Person';s['label']='Team è calendar'
s['shifts'][0]['variants']=[dict(id='base',label='Base',priority=0,selector={},scope={},intervals=s['shifts'][0]['intervals']),dict(id='wed',label='Wednesday',priority=1,selector={},scope={'weekdays':[3]},intervals=[dict(start='10:00',end='13:00',endDayOffset=0)])]
a=created(s);standard=view(s,a)['document'];(out/'standard.json').write_text(json.dumps(standard),encoding='utf-8')
o=options(a);o['shiftSelection']['hideNormal']=True;(out/'filtered.json').write_text(json.dumps(view(s,a,o)['document']),encoding='utf-8')
done=action(s,[a],'COMPLETE',id=a['id'],through='2027-05-03');(out/'completed.json').write_text(json.dumps(view(s,done['archives'][0])['document']),encoding='utf-8')
for kind in ['dst','fold','overnight','unknown']:
 s=fixture('2026-10-25','2026-10-25');s['calendar']['timezone']='America/New_York' if kind=='unknown' else 'Europe/Rome'
 s['shifts'][0]['intervals']=[dict(start='02:15',end='02:45',endDayOffset=0,startFold=0,endFold=1)] if kind=='fold' else [dict(start='22:00',end='06:00',endDayOffset=1)] if kind=='overnight' else [dict(start='01:30',end='03:30',endDayOffset=0)]
 a=created(s);(out/(kind+'.json')).write_text(json.dumps(view(s,a)['document']),encoding='utf-8')

s=fixture();s['availability']=[dict(id='leave',selector={'employeeIds':['e1']},scope={'start':'2027-05-03','end':'2027-05-03'},state='ABSENT')];s['hrState']['events']=[dict(eventId='leave-1',source='hr',revision=1,externalId='leave',employeeId='e1',operation='UPSERT',start='2027-05-03',end='2027-05-03',status='APPROVED',absenceType='Private leave')];a=created(s);(out/'absence.json').write_text(json.dumps(view(s,a)['document']),encoding='utf-8');o=options(a);o['includeAbsenceReasons']=True;(out/'private-absence.json').write_text(json.dumps(view(s,a,o)['document']),encoding='utf-8')
