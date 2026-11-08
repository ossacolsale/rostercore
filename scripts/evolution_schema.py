"""Add schema-2 contracts without discarding schema-1 fields or identifiers."""
def extend(defs, scenario, policy, hr, result, obj, arr, enum, ref, s, id_, integer, positive, date, ids, label):
    scalar={'type':['string','boolean','number','null']}
    validity={'validFrom':date,'validTo':date}
    defs['condition']={'oneOf':[
        obj({'op':enum('AND','OR'),'children':{'type':'array','minItems':1,'maxItems':100,'items':ref('condition')}},['op','children']),
        obj({'op':enum('NOT'),'child':ref('condition')},['op','child']),
        obj({'op':enum('EQ','NE','LT','LE','GT','GE'),'attributeId':id_,'value':{'type':['string','boolean','number']}},['op','attributeId','value']),
        obj({'op':enum('IN','NOT_IN'),'attributeId':id_,'values':arr({'type':['string','boolean','number']})},['op','attributeId','values']),
        obj({'op':enum('EXISTS','NOT_EXISTS'),'attributeId':id_},['op','attributeId'])]}
    defs['selector']['properties']['where']=ref('condition')
    defs['scope']['properties'].update({'weekProfileIds':ids,'dayType':enum('ANY','HOLIDAY','NON_HOLIDAY')})
    defs['interval']['properties'].update({'startFold':enum(0,1),'endFold':enum(0,1)})
    defs['effective']=obj(validity,['validFrom'])
    defs['attributeDefinition']=obj({'id':id_,'label':label,'type':enum('STRING','BOOLEAN','NUMBER','INTEGER','ENUM'),'description':label,'values':arr({'type':['string','number','boolean']}),'default':{'type':['string','number','boolean']},'unit':label,'visible':{'type':'boolean'},**validity},['id','label','type'])
    defs['employeeVersion']=obj({**validity,'typeId':id_,'workPatternId':{'anyOf':[id_,{'type':'null'}]},'attributes':{'type':'object','additionalProperties':scalar}},['validFrom'])
    employee=scenario['properties']['employees']['items']
    employee['properties']['attributes']['additionalProperties']=scalar
    employee['properties'].update({'employment':ref('effective'),'versions':arr(ref('employeeVersion')),'workPatternId':id_})
    scenario['properties']['groups']['items']['properties']['scope']=ref('scope')
    pattern_version=obj({**validity,'weekdays':{'type':'array','uniqueItems':True,'items':{'type':'integer','minimum':1,'maximum':7}},'shiftIds':ids,'exceptions':arr(obj({'date':date,'shiftIds':ids},['date','shiftIds']))},['validFrom','weekdays','shiftIds'])
    defs['workPatternAssignmentRule']=obj({'id':id_,'label':label,'enabled':{'type':'boolean'},'selector':ref('selector'),'workPatternId':id_,'priority':integer,**validity},['id','label','enabled','selector','workPatternId','priority','validFrom'])
    defs['workPattern']=obj({'id':id_,'label':label,'versions':arr(pattern_version)},['id','label','versions'])
    defs['shiftVariant']=obj({'id':id_,'label':label,'priority':integer,'selector':ref('selector'),'scope':ref('scope'),'workPatternIds':ids,'intervals':arr(ref('interval'))},['id','label','priority','selector','scope','intervals'])
    scenario['properties']['shifts']['items']['properties'].update({'variants':arr(ref('shiftVariant')),'fairnessTags':ids})
    defs['weekProfile']=obj({'id':id_,'label':label,'shiftIds':ids,'offWeekdays':{'type':'array','uniqueItems':True,'items':{'type':'integer','minimum':1,'maximum':7}},'holidayMode':enum('NORMAL','OFF'),'constraintIds':ids,'policyIds':ids},['id','label','offWeekdays','holidayMode','constraintIds','policyIds'])
    manual=obj({'week':date,'profileId':id_,'overrideRecurrence':{'type':'boolean'},'waiveFrequencyIds':ids,'reason':label},['week','profileId','overrideRecurrence','waiveFrequencyIds','reason'])
    recurrence=obj({'id':id_,'label':label,'anchor':date,'sequence':{'type':'array','minItems':1,'maxItems':104,'items':id_},**validity},['id','label','anchor','sequence','validFrom'])
    automatic=obj({'profileIds':{'type':'array','minItems':1,'uniqueItems':True,'items':id_},**validity},['profileIds','validFrom'])
    frequency=obj({'id':id_,'profileId':id_,'minGapWeeks':positive,'maxGapWeeks':positive,'windowWeeks':positive,'minCount':integer,'maxCount':integer,'desiredCount':integer,'desiredGapWeeks':positive},['id','profileId'])
    defs['weekConfiguration']=obj({'defaultProfileId':id_,'manual':arr(manual),'recurrences':arr(recurrence),'automatic':automatic,'frequencies':arr(frequency),'history':arr(obj({'week':date,'profileId':id_},['week','profileId']))},['manual','recurrences','frequencies','history'])
    defs['closure']=obj({'id':id_,'label':label,**validity,'selector':ref('selector'),'reason':label,'administrativeType':label,'exceptions':arr(obj({'date':date,'selector':ref('selector'),'authorized':enum(True),'reason':s},['date','selector','authorized','reason']))},['id','label','validFrom','validTo','selector','reason','exceptions'])
    defs['holidaySettings']=obj({'country':enum('IT'),'catalogueVersion':enum('IT-2001-2026.1'),'localDates':arr(obj({'date':date,'label':label,'holiday':{'type':'boolean'}},['date','label','holiday']))},['country','catalogueVersion','localDates'])
    defs['coverageLevel']=obj({'selector':ref('selector'),'level':integer},['selector','level'])
    defs['dutyRequirement']=obj({'id':id_,'label':label,'mode':enum('RESPONSIBILITY','PRESENCE'),'shiftIds':ids,'levels':{'type':'array','minItems':1,'items':ref('coverageLevel')},'comparison':enum('EQ','GE','LE'),'count':integer,'intervals':arr(ref('interval')),'scope':ref('scope'),'preferencePriority':integer,'exclusiveGroup':id_,'bindAssignments':{'type':'boolean'}},['id','label','mode','shiftIds','levels','comparison','count','intervals','scope','preferencePriority'])
    defs['temporalRule']=obj({'id':id_,'label':label,'type':enum('SUCCESSION','FORBIDDEN_PAIR','MIN_REST'),'selector':ref('selector'),'fromShiftIds':ids,'toShiftIds':ids,'offsetDays':{'type':'integer','minimum':1,'maximum':14},'minimumMinutes':integer,'scope':ref('scope')},['id','label','type','selector','fromShiftIds','toShiftIds','offsetDays','scope'])
    scenario['properties'].update({'attributeDefinitions':arr(ref('attributeDefinition')),'workPatterns':arr(ref('workPattern')),'workPatternAssignmentRules':arr(ref('workPatternAssignmentRule')),'weekProfiles':arr(ref('weekProfile')),'weekConfiguration':ref('weekConfiguration'),'dutyRequirements':arr(ref('dutyRequirement')),'temporalRules':arr(ref('temporalRule')),'replanning':obj({'from':date,'baseline':arr(ref('assignment')),'stabilityPriority':enum('BEFORE_FAIRNESS','AFTER_FAIRNESS')},['from','baseline','stabilityPriority'])})
    scenario['properties']['calendar']['properties'].update({'holidays':ref('holidaySettings'),'closures':arr(ref('closure'))})
    scenario['properties']['allowedShifts']['items']['properties']['allowRequiredRest']={'type':'boolean'}
    defs['policy']['properties'].update({'dutyRequirements':arr(ref('dutyRequirement')),'temporalRules':arr(ref('temporalRule'))})
    defs['objective']['properties']['fairnessTags']=ids
    defs['assignment']['properties'].update({'variantId':id_,'intervals':arr(ref('interval')),'weekProfileId':id_})
    defs['snapshot']['properties']['weekProfileId']=id_
    defs['dependency']['properties']['kind']=enum('employee','type','group','shift','constraint','constraintSet','attribute','workPattern','weekProfile')
    for root in [scenario,policy,hr,result]:root['properties']['schemaVersion']=enum(1,2,3)
    policy['properties']['engineVersion']=enum('0.1.0','0.2.0','0.3.0')
    for key in ['weekAssignments','calendarDays','coverage','changes']:result['properties'][key]={'type':'array'}
    for key in ['workforce','migration']:result['properties'][key]={'type':'object'}
    result['properties']['status']['enum']+=['MIGRATED','INSPECTED']
    result['properties']['diagnostics']['items']['properties'].update({'severity':enum('ERROR','WARNING','INFORMATION'),'objectIds':ids,'suggestion':label,'section':s})
