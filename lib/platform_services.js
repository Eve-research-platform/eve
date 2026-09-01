'use strict';
const {installV52}=require('../v52_routes');
const {createCloudConnectorService}=require('./cloud_connectors');
const {createLiveSecurity}=require('./live_security');
const {createStateStore}=require('./state_store');
const {createOrganisationStorage}=require('./organisation_storage');
function controlPlanePath(pathname){return /^\/api\/(?:auth(?:\/|$)|org(?:\/|$)|collaboration(?:-v2)?(?:\/|$)|mail(?:\/|$)|recruitment(?:\/|$)|panel(?:\/|$)|ai(?:\/|$)|activity(?:\/|$)|connectors(?:\/|$)|organisation-storage(?:\/|$))/.test(pathname)}
async function createPlatformServices({dataDir,json,body,publicOrigin=''}){const stateStore=createStateStore({dataDir,namespace:'eve'});await stateStore.initialize();const eveV52=installV52({dataDir,json,body,stateStore});const cloudConnectors=createCloudConnectorService({dataDir,json,body,stateStore,publicOrigin,requireRole:eveV52.control.requireRole,authConfigured:eveV52.control.isConfigured});const organisationStorage=createOrganisationStorage({dataDir,json,body,stateStore,requireRole:eveV52.control.requireRole,authConfigured:eveV52.control.isConfigured,enabled:String(process.env.EVE_ORG_STORAGE_ENABLED||'').toLowerCase()!=='false',label:process.env.EVE_ORG_STORAGE_LABEL||'Organisation cloud storage'});await stateStore.flushInitial();const liveSecurity=createLiveSecurity({dataDir,control:eveV52.control,json,stateStore});liveSecurity.enforceStartup();return{stateStore,eveV52,cloudConnectors,organisationStorage,liveSecurity}}
module.exports={createPlatformServices,controlPlanePath};
