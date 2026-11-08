"""Generate the committed offline transition catalogue using the host IANA tzdb."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import json
root=Path(__file__).resolve().parents[1]
zone=ZoneInfo('Europe/Rome');start=datetime(2000,1,1,tzinfo=timezone.utc);end=datetime(2101,1,1,tzinfo=timezone.utc)
offset=lambda d:int(d.astimezone(zone).utcoffset().total_seconds()//60)
minute=lambda d:int(d.timestamp()//60)
transitions=[[minute(start),offset(start)]];previous=offset(start);cursor=start
while cursor<end:
 cursor+=timedelta(hours=1);current=offset(cursor)
 if current!=previous:
  lo=cursor-timedelta(hours=1);hi=cursor
  while hi-lo>timedelta(minutes=1):
   mid=lo+timedelta(minutes=int((hi-lo).total_seconds()//120))
   if offset(mid)==previous:lo=mid
   else:hi=mid
  transitions.append([minute(hi),current]);previous=current
rules=[('new_year',1,1,'New Year'),('epiphany',1,6,'Epiphany'),('liberation',4,25,'Liberation Day'),('workers',5,1,'Labour Day'),('republic',6,2,'Republic Day'),('assumption',8,15,'Assumption'),('all_saints',11,1,'All Saints'),('immaculate',12,8,'Immaculate Conception'),('christmas',12,25,'Christmas'),('stephen',12,26,'Saint Stephen')]
holidays=[{'id':'it.'+id,'month':m,'day':d,'label':label,'validFrom':'2001-01-01'} for id,m,d,label in rules]
holidays.append({'id':'it.francis','month':10,'day':4,'label':'Saint Francis of Assisi','validFrom':'2026-01-01','source':'https://www.gazzettaufficiale.it/eli/id/2025/10/10/25G00153/sg'})
version=Path('/usr/share/zoneinfo/tzdata.zi');version=version.read_text().splitlines()[0] if version.exists() else 'host IANA tzdb'
data={'italianHolidays':{'version':'IT-2001-2026.1','validFrom':'2001-01-01','validTo':'2201-01-01','source':'https://presidenza.governo.it/ufficio_cerimoniale/cerimoniale/giornate.html','fixed':holidays,'easterMonday':True},'timezones':{'Europe/Rome':{'source':version,'validFromUtcMinute':minute(start),'validToUtcMinute':minute(end),'transitions':transitions}}}
(root/'data/catalogues.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
