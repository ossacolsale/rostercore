"""Generic declarative reference data. No pharmacy rules live in the C++ core."""
import copy,json
from pathlib import Path
from create_example import scenario
ROOT=Path(__file__).resolve().parents[1]
def upgraded(n=3,start='2027-05-03',end='2027-05-09'):
 s=scenario(n,start,end);s['schemaVersion']=2
 for key in ['attributeDefinitions','workPatterns','weekProfiles','dutyRequirements','temporalRules']:s[key]=[]
 s['weekConfiguration']={'manual':[],'recurrences':[],'frequencies':[],'history':[]}
 s['calendar']['closures']=[]
 return s

def pharmacy():
 s=upgraded(start='2027-05-03',end='2027-06-06');s.update(id='pharmacy-evolution',label='Pharmacy · evolving workforce',policies=[],groups=[],allowedShifts=[])
 s['employeeTypes']=[{'id':id,'label':label} for id,label in [('pharmacist','Pharmacist'),('store','Store staff'),('reserve','Reserve resource')]]
 s['attributeDefinitions']=[{'id':'contract','label':'Contract type','type':'ENUM','values':['FULL_TIME','PART_TIME'],'default':'FULL_TIME','visible':True},{'id':'nightEligible','label':'Night qualified','type':'BOOLEAN','default':False,'visible':True}]
 s['employees']=[{'id':id,'label':label,'typeId':type,'attributes':attrs,'workPatternId':pattern,'employment':{'validFrom':'2027-01-01'},'versions':[]} for id,label,type,attrs,pattern in [('p1','Pharmacist A','pharmacist',{'nightEligible':True},'full'),('p2','Pharmacist B','pharmacist',{'nightEligible':True},'full'),('p3','Pharmacist C','pharmacist',{'contract':'PART_TIME'},'part'),('s1','Store A','store',{},'full'),('r1','Reserve A','reserve',{'nightEligible':True},'full'),('p4','New colleague','pharmacist',{'nightEligible':True},'full')]]
 s['employees'][1]['employment']['validTo']='2027-06-01';s['employees'][5]['employment']['validFrom']='2027-06-01'
 s['employees'][2]['versions']=[{'validFrom':'2027-06-01','attributes':{'contract':'FULL_TIME','nightEligible':True},'workPatternId':'full'}]
 s['groups']=[{'id':'ordinary','label':'Ordinary resources','selector':{'typeIds':['pharmacist','store']}},{'id':'part-time','label':'Part-time resources','selector':{'where':{'op':'EQ','attributeId':'contract','value':'PART_TIME'}}}]
 def iv(a,b,next=0):return {'start':a,'end':b,'endDayOffset':next}
 normal=[iv('08:30','13:00'),iv('16:30','20:00')];eve=[iv('09:00','13:00'),iv('16:30','20:30')];both=[iv('09:00','13:30'),iv('16:30','20:30')]
 s['shifts']=[{'id':'normal','label':'Normal','kind':'WORKING','intervals':[],'fairnessTags':[],'variants':[]},{'id':'close-evening','label':'Evening closing','kind':'WORKING','intervals':[],'fairnessTags':['closing'],'variants':[]},{'id':'close-both','label':'Morning and evening closing','kind':'WORKING','intervals':[],'fairnessTags':['closing'],'variants':[]},{'id':'night','label':'Night','kind':'WORKING','intervals':[],'fairnessTags':['night'],'variants':[{'id':'night-qualified','label':'Qualified night','priority':0,'selector':{'where':{'op':'EQ','attributeId':'nightEligible','value':True}},'scope':{},'intervals':[iv('22:00','08:00',1)]}]},{'id':'off','label':'Rest','kind':'OFF','intervals':[],'fairnessTags':[]}]
 for sh,hours in zip(s['shifts'][:3],[normal,eve,both]):
  sh['variants']=[{'id':sh['id']+'-full','label':'Full-day hours','priority':0,'selector':{'where':{'op':'EQ','attributeId':'contract','value':'FULL_TIME'}},'scope':{},'intervals':hours},{'id':sh['id']+'-part-friday','label':'Part-time Friday','priority':10,'selector':{'groupIds':['part-time']},'scope':{'weekdays':[5]},'intervals':hours}]
 s['shifts'][0]['variants'].append({'id':'normal-part-morning','label':'Part-time morning','priority':10,'selector':{'groupIds':['part-time']},'scope':{'weekdays':[1,2,3,4]},'intervals':[iv('08:30','13:00')]})
 shiftIds=[x['id'] for x in s['shifts']]
 s['workPatterns']=[{'id':'full','label':'Full-time arrangement','versions':[{'validFrom':'2027-01-01','weekdays':[1,2,3,4,5,6,7],'shiftIds':shiftIds,'exceptions':[]}]},{'id':'part','label':'Morning arrangement with full Friday','versions':[{'validFrom':'2027-01-01','weekdays':[1,2,3,4,5],'shiftIds':['normal','close-evening','close-both','off'],'exceptions':[]}]}]
 s['weekProfiles']=[{'id':'regular','label':'Regular week','offWeekdays':[6,7],'holidayMode':'OFF','constraintIds':[],'policyIds':[]},{'id':'special','label':'Duty week','offWeekdays':[],'holidayMode':'NORMAL','constraintIds':[],'policyIds':[]}]
 s['weekConfiguration'].update(defaultProfileId='regular',recurrences=[{'id':'rotation','label':'One duty week in four','anchor':'2027-05-05','sequence':['special','regular','regular','regular'],'validFrom':'2027-01-04'}],manual=[{'week':'2027-05-17','profileId':'special','overrideRecurrence':True,'waiveFrequencyIds':[],'reason':'Demonstration of an authorized one-week exception'}])
 s['calendar']['holidays']={'country':'IT','catalogueVersion':'IT-2001-2026.1','localDates':[]}
 s['calendar']['closures']=[{'id':'annual-closure','label':'Company closure','validFrom':'2027-05-27','validTo':'2027-05-29','selector':{},'reason':'Annual shutdown, not individual vacation accounting','exceptions':[]}]
 regular={'weekProfileIds':['regular'],'weekdays':[1,2,3,4,5],'dayType':'NON_HOLIDAY'}
 s['allowedShifts']=[{'id':'ordinary-regular','selector':{'groupIds':['ordinary']},'shiftIds':['normal','close-evening','close-both'],'scope':regular,'allowRequiredRest':True},{'id':'reserve-regular','selector':{'typeIds':['reserve']},'shiftIds':['off','close-evening','close-both'],'scope':regular},{'id':'ordinary-special','selector':{'groupIds':['ordinary']},'shiftIds':['normal','off'],'scope':{'weekProfileIds':['special'],'weekdays':[1,2,3,4,5,6]}},{'id':'sunday-special','selector':{'groupIds':['ordinary']},'shiftIds':['normal','night','off'],'scope':{'weekProfileIds':['special'],'weekdays':[7]}},{'id':'reserve-special','selector':{'typeIds':['reserve']},'shiftIds':['off','night'],'scope':{'weekProfileIds':['special']}}]
 def duty(id,shift,selector,scope,intervals,count=1):return {'id':id,'label':id.replace('-',' ').title(),'mode':'RESPONSIBILITY','shiftIds':[shift],'levels':[{'selector':selector,'level':0},{'selector':{'typeIds':['reserve']},'level':1}],'comparison':'EQ','count':count,'intervals':intervals,'scope':scope,'preferencePriority':0,'exclusiveGroup':'daily-responsibilities'}
 s['dutyRequirements']=[duty('two-closings','close-both',{'typeIds':['pharmacist']},regular,[iv('13:00','13:30'),iv('20:00','20:30')]),duty('evening-closing','close-evening',{'groupIds':['ordinary']},regular,[iv('20:00','20:30')]),duty('sunday-night','night',{'typeIds':['pharmacist']},{'weekProfileIds':['special'],'weekdays':[7]},[iv('22:00','08:00',1)])]
 s['dutyRequirements'].append({'id':'weekend-presence','label':'Saturday morning presence','mode':'PRESENCE','shiftIds':['normal'],'levels':[{'selector':{'typeIds':['pharmacist']},'level':0}],'comparison':'GE','count':1,'intervals':[iv('09:00','12:00')],'scope':{'weekProfileIds':['special'],'weekdays':[6]},'preferencePriority':0})
 s['temporalRules']=[{'id':'night-next-day-off','label':'Rest on the day after night start','type':'SUCCESSION','selector':{},'fromShiftIds':['night'],'toShiftIds':['off'],'offsetDays':1,'scope':{}}]
 for i,(id,shifts,selector,scope) in enumerate([('regular-both',['close-both'],{'typeIds':['pharmacist']},regular),('regular-evening',['close-evening'],{'groupIds':['ordinary']},regular),('special-nights',['night'],{'typeIds':['pharmacist']},{'weekProfileIds':['special']}),('special-weekends',['normal'],{'typeIds':['pharmacist']},{'weekProfileIds':['special'],'weekdays':[6,7]})]):
  s['policies'].append({'id':id,'label':id.replace('-',' ').title(),'revision':1,'active':True,'draft':False,'dependencies':[],'constraints':[],'sharedConstraintIds':[],'constraintSetIds':[],'objective':{'id':id+'-count','label':'Continuous duty balance','type':'CUMULATIVE_FAIRNESS','mode':'CONTINUOUS_BALANCED','measure':'COUNT','selector':selector,'shiftIds':shifts,'participation':'AVAILABILITY_WEIGHTED','metrics':['MAX_ABSOLUTE_PREFIX_DEVIATION','SUM_ABSOLUTE_PREFIX_DEVIATIONS','FINAL_ABSOLUTE_DEVIATION'],'priority':i,'scope':scope}})
 s['availability']=[{'id':'planned-leave','selector':{'employeeIds':['p2']},'scope':{'start':'2027-05-10','end':'2027-05-11'},'state':'ABSENT'}]
 s['search']['maxTimeSeconds']=15
 return s
if __name__=='__main__':
 s=pharmacy();(ROOT/'examples/pharmacy-evolution.json').write_text(json.dumps(s,indent=2)+'\n',encoding='utf-8')
 auto=copy.deepcopy(s);auto['id']='automatic-week-demo';auto['label']='Solver-selected week profiles';auto['weekConfiguration']={'manual':[],'recurrences':[],'history':[],'automatic':{'validFrom':'2027-05-03','profileIds':['regular','special']},'frequencies':[{'id':'four-week-frequency','profileId':'special','windowWeeks':4,'minCount':1,'maxCount':1,'desiredCount':1}]};(ROOT/'examples/pharmacy-automatic-weeks.json').write_text(json.dumps(auto,indent=2)+'\n',encoding='utf-8')
