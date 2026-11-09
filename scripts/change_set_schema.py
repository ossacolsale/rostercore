"""The operation catalogue is the single source for schemas and AI capabilities."""
ENTITIES={'EMPLOYEE_TYPE':'employeeTypes','ATTRIBUTE':'attributeDefinitions','GROUP':'groups','SHIFT':'shifts','WORK_PATTERN':'workPatterns','PATTERN_RULE':'workPatternAssignmentRules','WEEK_PROFILE':'weekProfiles','AVAILABILITY':'availability','ALLOWED_SHIFTS':'allowedShifts','CONSTRAINT':'constraints','CONSTRAINT_SET':'constraintSets','POLICY':'policies','COVERAGE':'dutyRequirements','TEMPORAL_RULE':'temporalRules','SPACING_RULE':'spacingRules'}
def extend_changes(defs,scenario,obj,arr,enum,ref,s,id_,positive,date):
    variants=[]
    def op(name,fields,required):variants.append(obj({'op':enum(name),**fields},['op',*required]))
    for name,field in ENTITIES.items():
        item=scenario['properties'][field]['items']
        op('CREATE_'+name,{'value':item},['value'])
        # Updates are typed replacements of one entity, not arbitrary object patches.
        op('REPLACE_'+name,{'value':item,'expectedEntityHash':s},['value','expectedEntityHash'])
        op('DELETE_'+name,{'id':id_,'expectedEntityHash':s},['id','expectedEntityHash'])
    employee=scenario['properties']['employees']['items']
    op('CREATE_EMPLOYEE',{'value':employee},['value'])
    props=defs['employeeVersion']['properties']
    patch=obj({k:v for k,v in props.items() if k not in ['validFrom','validTo']},[])
    patch['minProperties']=1
    op('UPDATE_EMPLOYEE',{'employeeId':id_,'effectiveFrom':date,'patch':patch},['employeeId','effectiveFrom','patch'])
    op('RENAME_EMPLOYEE',{'employeeId':id_,'label':s},['employeeId','label'])
    op('END_EMPLOYMENT',{'employeeId':id_,'effectiveFrom':date},['employeeId','effectiveFrom'])
    for name,field in [('SET_WEEK_CONFIGURATION','weekConfiguration'),('SET_CALENDAR','calendar'),('SET_BASE_CONSTRAINTS','baseConstraintIds'),('SET_SEARCH','search')]:
        op(name,{'value':scenario['properties'][field]},['value'])
    op('SET_CLOSURES',{'value':scenario['properties']['calendar']['properties']['closures']},['value'])
    op('SYNC_HR',{'value':obj({'format':enum('rostercore.hr-events'),'schemaVersion':enum(4),'events':arr(ref('hrEvent')),'snapshot':obj({'source':id_,'revision':positive},['source','revision'])},['format','schemaVersion','events'])},['value'])
    defs['scenarioChangeSet']=obj({'format':enum('rostercore.scenario-change-set'),'schemaVersion':enum(1),'id':id_,'scenarioId':id_,'expectedRevision':positive,'expectedConfigurationHash':s,'allowHardRuleChanges':{'type':'boolean'},'description':s,'referenceDate':date,'operations':{'type':'array','minItems':1,'maxItems':200,'items':{'oneOf':variants}}},['format','schemaVersion','id','scenarioId','expectedRevision','allowHardRuleChanges','operations'])
    scenario['properties']['appliedChangeSets']={'type':'array','maxItems':1000,'items':obj({'id':id_,'hash':s,'revision':positive},['id','hash','revision'])}
    return {'scenario-change-set':ref('scenarioChangeSet')}
