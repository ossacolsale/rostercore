import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def scenario(n=5,start='2026-01-26',end='2026-02-08'):
 selector={'typeIds':['staff']}
 return {'format':'rostercore.scenario','schemaVersion':1,'id':'pharmacy-demo','label':'Pharmacy reference · closing rotation','revision':1,
 'employeeTypes':[{'id':'staff','label':'Qualified staff'}],
 'employees':[{'id':f'e{i+1}','label':name,'typeId':'staff','attributes':{}} for i,name in enumerate(['Alex','Blair','Casey','Drew','Ellis'][:n])],
 'groups':[{'id':'team','label':'Closing team','selector':selector}],
 'shifts':[{'id':'regular','label':'Regular','kind':'WORKING','intervals':[{'start':'08:30','end':'13:00','endDayOffset':0},{'start':'16:30','end':'20:00','endDayOffset':0}]},{'id':'closing','label':'Closing','kind':'WORKING','intervals':[{'start':'09:30','end':'13:30','endDayOffset':0},{'start':'16:30','end':'20:30','endDayOffset':0}]},{'id':'off','label':'Rest','kind':'OFF','intervals':[]}],
 'calendar':{'start':start,'end':end,'timezone':'Europe/Rome','excludedDates':[],'excludedRanges':[],'excludedIsoWeeks':[]},
 'availability':[],'allowedShifts':[],
 'constraints':[],'baseConstraintIds':[],'constraintSets':[],
 'policies':[{'id':'closing-fairness','label':'Continuous closing fairness','revision':1,'active':True,'draft':False,'dependencies':[],
 'objective':{'id':'closing-count','label':'Closing duties','type':'CUMULATIVE_FAIRNESS','mode':'CONTINUOUS_BALANCED','measure':'COUNT','selector':selector,'shiftIds':['closing'],'participation':'EQUAL','metrics':['MAX_ABSOLUTE_PREFIX_DEVIATION','SUM_ABSOLUTE_PREFIX_DEVIATIONS','FINAL_ABSOLUTE_DEVIATION'],'priority':0},
 'constraints':[{'id':'daily-coverage','label':'One closing, at least one regular, rest off','expression':{'op':'AND','children':[{'op':'COUNT','selector':selector,'shiftId':'closing','comparison':'EQ','count':1},{'op':'COUNT','selector':selector,'shiftId':'regular','comparison':'GE','count':1},{'op':'REMAINING','selector':selector,'shiftId':'off'}]}}],
 'sharedConstraintIds':[],'constraintSetIds':[]}],
 'history':{'assignments':[],'fairnessSnapshots':[]},'publishedAssignments':[],
 'hrState':{'events':[],'snapshotRevisions':{}},'search':{'maxTimeSeconds':20,'seed':42,'workers':1,'deterministic':True}}
if __name__=='__main__': (ROOT/'examples'/'pharmacy.json').write_text(json.dumps(scenario(),indent=2)+'\n')
