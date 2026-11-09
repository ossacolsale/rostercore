"""Single source for the public JSON Schema contracts (draft-07)."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def obj(props, required=()): return {'type':'object','properties':props,'required':list(required),'additionalProperties':False}
def arr(items): return {'type':'array','items':items}
def enum(*items): return {'enum':list(items)}
def ref(name): return {'$ref':'#/definitions/'+name}
s = {'type':'string','minLength':1,'maxLength':256}
id_ = {**s,'pattern':r'^[A-Za-z0-9_@.:-]+$'}
integer = {'type':'integer','minimum':0,'maximum':1000000}
positive = {'type':'integer','minimum':1,'maximum':1000000}
date = {'type':'string','pattern':r'^\d{4}-\d{2}-\d{2}$'}
ids = {'type':'array','items':id_,'uniqueItems':True}
label = {'type':'string','maxLength':256}
defs = {}
defs['selector'] = obj({'employeeIds':ids,'typeIds':ids,'groupIds':ids,'attributes':{'type':'object','additionalProperties':{'type':['string','boolean','number']}}})
defs['scope'] = obj({'start':date,'end':date,'weekdays':{'type':'array','items':{'type':'integer','minimum':1,'maximum':7},'uniqueItems':True},'excludedDates':arr(date)})
defs['range'] = obj({'start':date,'end':date},['start','end'])
defs['interval'] = obj({'start':{'type':'string','pattern':r'^([01]\d|2[0-3]):[0-5]\d$'},'end':{'type':'string','pattern':r'^([01]\d|2[0-3]):[0-5]\d$'},'endDayOffset':{'type':'integer','minimum':0,'maximum':1}},['start','end','endDayOffset'])
defs['expression'] = {'oneOf':[
 obj({'op':enum('COUNT'),'selector':ref('selector'),'shiftId':id_,'comparison':enum('EQ','GE','LE'),'count':integer},['op','selector','shiftId','comparison','count']),
 obj({'op':enum('REMAINING'),'selector':ref('selector'),'shiftId':id_},['op','selector','shiftId']),
 obj({'op':enum('AND','OR'),'children':{'type':'array','items':ref('expression'),'minItems':1,'maxItems':100}},['op','children'])]}
defs['constraint'] = obj({'id':id_,'label':label,'expression':ref('expression'),'scope':ref('scope')},['id','expression'])
defs['objective'] = obj({'id':id_,'label':label,'type':enum('CUMULATIVE_FAIRNESS'),'mode':enum('CONTINUOUS_BALANCED'),'measure':enum('COUNT'),'selector':ref('selector'),'shiftIds':ids,'participation':enum('EQUAL','AVAILABILITY_WEIGHTED','CUSTOM_WEIGHTED'),'weights':{'type':'object','additionalProperties':positive},'metrics':{'type':'array','minItems':1,'uniqueItems':True,'items':enum('MAX_ABSOLUTE_PREFIX_DEVIATION','SUM_ABSOLUTE_PREFIX_DEVIATIONS','FINAL_ABSOLUTE_DEVIATION')},'priority':integer,'scope':ref('scope')},['id','type','mode','measure','selector','shiftIds','participation','metrics','priority'])
defs['dependency'] = obj({'symbol':id_,'kind':enum('employee','type','group','shift','constraint','constraintSet')},['symbol','kind'])
defs['policy'] = obj({'id':id_,'label':label,'revision':positive,'active':{'type':'boolean'},'draft':{'type':'boolean'},'dependencies':arr(ref('dependency')),'objective':ref('objective'),'constraints':arr(ref('constraint')),'sharedConstraintIds':ids,'constraintSetIds':ids,'scope':ref('scope')},['id','label','revision','active','draft','dependencies','objective','constraints','sharedConstraintIds','constraintSetIds'])
defs['assignment'] = obj({'employeeId':id_,'date':date,'shiftId':id_},['employeeId','date','shiftId'])
defs['snapshot'] = obj({'date':date,'objectiveId':id_,'fingerprint':s,'weights':{'type':'object','additionalProperties':positive}},['date','objectiveId','fingerprint','weights'])
defs['hrEvent'] = obj({'eventId':id_,'source':id_,'externalId':id_,'employeeId':id_,'revision':positive,'operation':enum('UPSERT','DELETE'),'absenceType':s,'status':enum('REQUESTED','APPROVED','REJECTED'),'start':date,'end':date,'partialIntervals':arr(ref('interval'))},['eventId','source','externalId','employeeId','revision','operation','absenceType','status','start','end'])
scenario = obj({
 'format':enum('rostercore.scenario'),'schemaVersion':enum(1),'id':id_,'label':label,'revision':positive,
 'employeeTypes':arr(obj({'id':id_,'label':label},['id','label'])),
 'employees':arr(obj({'id':id_,'label':label,'typeId':id_,'attributes':{'type':'object','additionalProperties':{'type':['string','boolean','number']}}},['id','label','typeId','attributes'])),
 'groups':arr(obj({'id':id_,'label':label,'selector':ref('selector')},['id','label','selector'])),
 'shifts':arr(obj({'id':id_,'label':label,'kind':enum('WORKING','OFF'),'intervals':arr(ref('interval'))},['id','label','kind','intervals'])),
 'calendar':obj({'start':date,'end':date,'timezone':s,'excludedDates':arr(date),'excludedRanges':arr(ref('range')),'excludedIsoWeeks':arr({'type':'string','pattern':r'^\d{4}-W\d{2}$'})},['start','end','timezone','excludedDates','excludedRanges','excludedIsoWeeks']),
 'availability':arr(obj({'id':id_,'selector':ref('selector'),'scope':ref('scope'),'state':enum('ABSENT')},['id','selector','scope','state'])),
 'allowedShifts':arr(obj({'id':id_,'selector':ref('selector'),'shiftIds':ids,'scope':ref('scope')},['id','selector','shiftIds','scope'])),
 'constraints':arr(ref('constraint')),'baseConstraintIds':ids,'constraintSets':arr(obj({'id':id_,'label':label,'constraintIds':ids},['id','label','constraintIds'])),
 'policies':arr(ref('policy')),
 'history':obj({'assignments':arr(ref('assignment')),'fairnessSnapshots':arr(ref('snapshot')),'through':date},['assignments','fairnessSnapshots']),
 'publishedAssignments':arr(ref('assignment')),
 'hrState':obj({'events':arr(ref('hrEvent')),'snapshotRevisions':{'type':'object','additionalProperties':positive}},['events','snapshotRevisions']),
 'search':obj({'maxTimeSeconds':{'type':'number','minimum':0,'maximum':600},'seed':integer,'workers':{'type':'integer','minimum':1,'maximum':32},'deterministic':{'type':'boolean'}},['maxTimeSeconds','seed','workers','deterministic'])
},['format','schemaVersion','id','label','revision','employeeTypes','employees','groups','shifts','calendar','availability','allowedShifts','constraints','baseConstraintIds','constraintSets','policies','history','publishedAssignments','hrState','search'])
policy = obj({'format':enum('rostercore.planning-policy'),'schemaVersion':enum(1),'engineVersion':enum('0.1.0'),'operation':enum('CREATE','REPLACE'),'expectedRevision':positive,'policy':ref('policy')},['format','schemaVersion','engineVersion','operation','policy'])
hr = obj({'format':enum('rostercore.hr-events'),'schemaVersion':enum(1),'events':arr(ref('hrEvent')),'snapshot':obj({'source':id_,'revision':positive},['source','revision'])},['format','schemaVersion','events'])
result = obj({'format':enum('rostercore.result'),'schemaVersion':enum(1),'status':enum('VALIDATION_ERROR','MODEL_INVALID','INFEASIBLE','FEASIBLE','OPTIMAL','UNKNOWN','VALID','VERIFIED','IMPORTED','PREVIEW','CONSOLIDATED','CONTEXT'),'diagnostics':arr(obj({'code':s,'path':{'type':'string'},'message':{'type':'string'}},['code','path','message'])),'metadata':{'type':'object'},'assignments':arr(ref('assignment')),'calendarStates':{'type':'array'},'fairness':{'type':'array'},'phases':{'type':'array'},'scenario':{'type':'object'},'preview':{'type':'object'},'context':{'type':'object'}},['format','schemaVersion','status','diagnostics'])
from evolution_schema import extend
extend(defs,scenario,policy,hr,result,obj,arr,enum,ref,s,id_,integer,positive,date,ids,label)
from reliability_schema import extend_reliability
reliability_documents=extend_reliability(defs,scenario,policy,hr,result,obj,arr,enum,ref,s,id_,integer,positive,date,ids,label)
contexts=obj({'format':enum('rostercore.history-contexts'),'schemaVersion':enum(1),'scenarios':arr(ref('historicalScenario'))},['format','schemaVersion','scenarios'])
for name, doc in [('selector',ref('selector')),('history-contexts',contexts),('scenario',scenario),('planning-policy',policy),('hr-events',hr),('result',result),*reliability_documents.items()]:
 doc={'$schema':'http://json-schema.org/draft-07/schema#','$id':f'https://rostercore.org/schemas/v1/{name}.schema.json',**doc,'definitions':{**defs,**({'historicalScenario':scenario} if name=='history-contexts' else {})}}
 (ROOT/'schemas'/f'{name}.schema.json').write_text(json.dumps(doc,indent=2)+'\n')
catalog={'schemaVersion':1,'operators':{'COUNT':{'comparisons':['EQ','GE','LE']},'AND':{},'OR':{},'REMAINING':{'placement':'direct child of flat AND branch; identical selector to COUNT siblings'}},'objectives':['CUMULATIVE_FAIRNESS'],'participation':['EQUAL','AVAILABILITY_WEIGHTED','CUSTOM_WEIGHTED'],'metrics':defs['objective']['properties']['metrics']['items']['enum'],'selectorOperators':['EQ','NE','IN','NOT_IN','EXISTS','NOT_EXISTS','LT','LE','GT','GE','AND','OR','NOT'],'temporalRules':['SUCCESSION','FORBIDDEN_PAIR','MIN_REST'],'coverage':['RESPONSIBILITY','PRESENCE'],'unsupported':['NOT_CONSTRAINT','IMPLIES','MINUTES','BURDEN_POINTS','EARLIEST_BALANCE','PARTIAL_DAY_ABSENCE']}
(ROOT/'schemas'/'operators.json').write_text(json.dumps(catalog,indent=2)+'\n')
