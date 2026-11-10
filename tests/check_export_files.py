"""Independent file consumers; no reuse of the generator or native time resolver."""
import json,sys,zipfile
from datetime import date,datetime,timedelta,timezone
from pathlib import Path
from pypdf import PdfReader
from icalendar import Calendar
root=Path(sys.argv[1]);manifest=json.loads((root/'manifest.json').read_text())
for pdf in manifest['pdfs']:
 reader=PdfReader(root/(pdf['name']+'.pdf'));assert len(reader.pages)==pdf['pages'],pdf
 assert abs(float(reader.pages[0].mediabox.width)-pdf['width'])<.1
 text='\n'.join(p.extract_text() for p in reader.pages)
 assert 'Verified calendar' in text and 'Document generated' in text and 'Team è calendar' in text,pdf
 assert 'seed' not in text and 'configurationHash' not in text,pdf
 for i,page in enumerate(reader.pages):assert f'Page {i+1} / {len(reader.pages)}' in page.extract_text()
 if pdf['name'] in ['a4-complete','personal']:assert '10:00-13:00' in text and '09:00-12:00' in text and '14:00-18:00' in text
 if pdf['name']=='completed':assert 'Work confirmed through 2027-05-03; Future dates are draft' in text

def events(name):
 wire=(root/(name+'.ics')).read_bytes();assert b'\r\n' in wire;cal=Calendar.from_ical(wire);assert str(cal['VERSION'])=='2.0';return cal.walk('VEVENT')
rows=events('collective');uids=[str(e['UID']) for e in rows];assert len(uids)==len(set(uids));assert len(rows)==14,(len(rows),uids)
for row in rows:
 assert 'DTSTAMP' in row and 'LAST-MODIFIED' in row and 'SEQUENCE' in row
 assert row.decoded('DTEND')>row.decoded('DTSTART')
 if isinstance(row.decoded('DTSTART'),datetime):assert row.decoded('DTSTART').utcoffset()==timedelta(0)
 else:assert row.decoded('DTEND')-row.decoded('DTSTART')==timedelta(days=1)
 assert str(row['STATUS'])=='TENTATIVE'
 assert 'Private leave' not in str(row.get('DESCRIPTION',''))
for kind,minutes in [('dst',180),('fold',90),('overnight',480)]:
 row=events(kind)[0];assert int((row.decoded('DTEND')-row.decoded('DTSTART')).total_seconds()/60)==minutes,kind
personal=events('personal');assert len(personal)==5;assert set(str(r['UID']) for r in personal)<=set(uids)
assert all('Other-person' not in str(r) for r in personal)
completed=events('completed');assert set(str(r['UID']) for r in completed)==set(uids)
# Validate the per-cell actual-prefix lifecycle without inferring future publication.
for row in completed:
 d=row.decoded('DTSTART');d=d.date() if isinstance(d,datetime) else d
 assert str(row['X-ROSTERCORE-STATE'])==('COMPLETED' if d==date(2027,5,3) else 'DRAFT')
 assert int(row['SEQUENCE'])>int(rows[0]['SEQUENCE'])
assert len(events('filtered'))==9
with zipfile.ZipFile(root/'personal.zip') as zipped:
 assert len(zipped.namelist())==3
 for name in zipped.namelist():
  assert '/' not in name and '\\' not in name
  assert Calendar.from_ical(zipped.read(name)).walk('VEVENT')
print(f'Independent parsers verified {len(manifest["pdfs"])} PDFs, iCalendar instants/lifecycle/UIDs and personal ZIP files.')

public=next(row for row in events('absence') if str(row['SUMMARY']).startswith('Unavailable'))
assert not isinstance(public.decoded('DTSTART'),datetime)
assert 'Private leave' not in str(public)
private=next(row for row in events('private-absence') if str(row['SUMMARY']).startswith('Unavailable'))
assert str(private['DESCRIPTION'])=='Private leave'
assert str(public['UID'])==str(private['UID'])

for layout in ['WEEK','MONTH','PERSON']:
 text='\n'.join(page.extract_text() for page in PdfReader(root/('omitted-'+layout+'.pdf')).pages)
 assert 'Nonworking holiday' not in text
 if layout=='PERSON':
  assert '2027-05-03 Regular' in text and '2027-05-04 Regular' in text
  assert '2027-05-05 ' not in text and '2027-05-08 ' not in text
 else:
  assert 'Mon 03/05' in text and 'Tue 04/05' in text
  for day in ['Wed 05/05','Thu 06/05','Fri 07/05','Sat 08/05','Sun 09/05']:assert day not in text
