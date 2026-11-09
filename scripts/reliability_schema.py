"""Schema-4 reliability, archives and typed integration contracts."""
def extend_reliability(defs,scenario,policy,hr,result,obj,arr,enum,ref,s,id_,integer,positive,date,ids,label):
    for root in [scenario,policy,hr,result]:root['properties']['schemaVersion']=enum(1,2,3,4)
    policy['properties']['engineVersion']=enum('0.1.0','0.2.0','0.3.0','0.4.0','0.5.0')
    scenario['properties']['archiveState']=obj({'publishedIds':ids,'completedIds':ids},['publishedIds','completedIds'])
    scenario['properties']['proposal']=obj({'supersedesId':id_,'from':date},['supersedesId','from'])
    defs['archiveState']=enum('DRAFT','PUBLISHED','COMPLETED','SUPERSEDED')
    defs['workPattern']['properties']['versions']['items']['properties']['weekdayShifts']=arr(obj({'weekday':{'type':'integer','minimum':1,'maximum':7},'shiftIds':ids},['weekday','shiftIds']))
    defs['snapshot']['properties']['targetShiftIds']=ids
    scenario['properties']['dutyBindingMode']=enum('ACTIVE_SCOPE','GLOBAL')
    defs['spacingRule']=obj({'id':id_,'label':label,'selector':ref('selector'),'shiftIds':ids,'fairnessTags':ids,'scope':ref('scope'),'mode':enum('HARD','SOFT'),'unit':enum('CALENDAR','NORMAL_WORK_DAYS'),'minimumGap':{'type':'integer','minimum':1,'maximum':60},'normalShiftIds':ids,'penalty':enum('CLOSE_PAIRS','GAP_DEFICIT'),'priority':integer},['id','label','selector','shiftIds','scope','mode','unit','minimumGap','normalShiftIds','penalty','priority'])
    scenario['properties']['spacingRules']={'type':'array','maxItems':100,'items':ref('spacingRule')}
    result['properties']['workload']={'type':'array'}
    from change_set_schema import extend_changes
    changes=extend_changes(defs,scenario,obj,arr,enum,ref,s,id_,positive,date)
    # Snapshots use the existing scenario/result contracts, not a parallel scheduling model.
    defs['scenarioContext']=scenario
    defs['archivedResult']=obj(dict(result['properties']),list(result['required']))
    defs['scheduleArchive']=obj({'format':enum('rostercore.schedule-archive'),'schemaVersion':enum(1),'id':id_,'revision':positive,'scenarioId':id_,'scenarioRevision':positive,'configurationHash':s,'engineVersion':s,'solverVersion':s,'period':obj({'start':date,'end':date},['start','end']),'state':ref('archiveState'),'createdAt':s,'source':s,'scenario':ref('scenarioContext'),'scenarioEncoding':{'type':'string'},'result':ref('archivedResult'),'publishedLocks':arr(ref('assignment')),'completedThrough':date,'supersedesId':id_,'events':arr(obj({'state':ref('archiveState'),'at':s,'completedThrough':date},['state','at'])),'integrityHash':s},['format','schemaVersion','id','revision','scenarioId','scenarioRevision','configurationHash','engineVersion','solverVersion','period','state','createdAt','source','scenario','scenarioEncoding','result','publishedLocks','events','integrityHash'])
    defs['workspaceBackup']=obj({'format':enum('rostercore.workspace-backup'),'schemaVersion':enum(1),'scenario':ref('scenarioContext'),'archives':arr(ref('scheduleArchive')),'createdAt':s,'integrityHash':s},['format','schemaVersion','scenario','archives','createdAt','integrityHash'])
    defs['calendarViewOptions']=obj({'start':date,'end':date,'employeeSelection':obj({'all':{'type':'boolean'},'employeeIds':ids,'typeIds':ids,'groupIds':ids},['all','employeeIds','typeIds','groupIds']),'shiftSelection':obj({'mode':enum('ALL','WORKING','SPECIAL','MANUAL'),'shiftIds':ids,'normalShiftIds':ids,'hideNormal':{'type':'boolean'}},['mode','shiftIds','normalShiftIds','hideNormal']),'showAbsences':{'type':'boolean'},'showRest':{'type':'boolean'},'showClosuresAndHolidays':{'type':'boolean'},'includeAbsenceReasons':{'type':'boolean'}},['start','end','employeeSelection','shiftSelection','showAbsences','showRest','showClosuresAndHolidays','includeAbsenceReasons'])
    common={'archives':arr(ref('scheduleArchive')),'dryRun':{'type':'boolean'},'expectedRevision':positive,'at':s}
    variants=[]
    def operation(name,props,required=()):variants.append(obj({**common,'operation':enum(name),**props},['operation','archives','dryRun',*required]))
    operation('CREATE',{'id':id_,'result':ref('archivedResult'),'createdAt':s,'source':s,'supersedesId':id_},['id','result','createdAt','source'])
    for op in ['PUBLISH','OPEN']:operation(op,{'id':id_},['id'])
    operation('CSV',{'id':id_,'options':ref('calendarViewOptions')},['id'])
    operation('VIEW',{'id':id_,'options':ref('calendarViewOptions')},['id','options'])
    operation('REBUILD_HISTORY',{'useCurrentCategoryMembership':enum(True)},['useCurrentCategoryMembership'])
    operation('COMPLETE',{'id':id_,'through':date},['id','through'])
    operation('REVISE',{'id':id_,'from':date},['id','from'])
    operation('IMPORT',{'archive':ref('scheduleArchive'),'mode':enum('REFERENCE','PUBLISH','COMPLETE','RESTORE_CONTEXT')},['archive','mode'])
    operation('BACKUP',{'createdAt':s},['createdAt'])
    operation('RESTORE',{'backup':ref('workspaceBackup')},['backup'])
    result['properties'].update({'archive':ref('scheduleArchive'),'archives':arr(ref('scheduleArchive')),'document':{'type':'object'},'restoredSchedule':{'type':'object'},'csv':{'type':'string'}})
    result['properties']['status']['enum']+=['ARCHIVED','PUBLISHED','OPENED','EXPORTED','RESTORED']
    defs['scenarioImportRequest']=obj({'candidate':ref('scenarioContext'),'expectedRevision':positive,'mode':enum('NEW_SCENARIO','REPLACE_CURRENT'),'allowHardRuleChanges':{'type':'boolean'}},['candidate','expectedRevision','mode','allowHardRuleChanges'])
    defs['improvementRequest']=obj({'previousScenarioEncoding':{'type':'string'},'previousScenario':ref('scenarioContext'),'previousResult':ref('archivedResult'),'maxTimeSeconds':{'type':'number','minimum':0,'maximum':600}},['previousScenario','previousResult','maxTimeSeconds'])
    return {'calendar-view-options':ref('calendarViewOptions'),'scenario-import-request':ref('scenarioImportRequest'),'improvement-request':ref('improvementRequest'),**changes,'schedule-archive':ref('scheduleArchive'),'workspace-backup':ref('workspaceBackup'),'archive-request':{'oneOf':variants}}
