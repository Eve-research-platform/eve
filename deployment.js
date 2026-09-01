'use strict';
const cfg=globalThis.EVE_FACTORY_CONFIG||{};
const $=id=>document.getElementById(id);
const placeholder=/OWNER|REPOSITORY/.test(`${cfg.repository||''} ${cfg.containerImage||''}`);
const revision=cfg.revision||cfg.branch||'main';
const absolute=path=>{try{return new URL(String(path||''),document.baseURI).href}catch{return String(path||'#')}};
function repoRaw(path){const match=String(cfg.repository||'').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);if(!match)return'';return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${encodeURIComponent(revision).replace(/%2F/g,'/')}/${path}`}
function googleOneClickUrl(){const repo=String(cfg.repository||'').replace(/\/+$/,'');if(!repo)return'#';return `https://deploy.cloud.run?${new URLSearchParams({git_repo:repo,revision})}`}
function googleCloudShellUrl(){const repo=String(cfg.repository||'').replace(/\/+$/,'')+'.git';return `https://shell.cloud.google.com/cloudshell/editor?${new URLSearchParams({cloudshell_git_repo:repo,cloudshell_git_branch:revision,cloudshell_tutorial:cfg.googleTutorial||'deploy/google/tutorial.md',show:'terminal'})}`}
function azureUrl(path){const template=absolute(path);return template?`https://portal.azure.com/#create/Microsoft.Template/uri/${encodeURIComponent(template)}`:'#'}
function blockPlaceholder(e){if(!placeholder)return false;e?.preventDefault?.();$('configWarning')?.scrollIntoView({behavior:'smooth',block:'center'});return true}
function show(id){for(const x of ['installChoice','organisationFlow','googleFlow','azureFlow','localFlow'])$(x)?.classList.toggle('hidden',x!==id);$(id)?.scrollIntoView?.({behavior:'smooth',block:'start'})}
function goHome(){show('installChoice');history.replaceState?.(null,'',location.pathname+location.search)}
function goOrganisation(){show('organisationFlow');history.replaceState?.(null,'','#organisation')}
function goProvider(provider){show(provider==='google'?'googleFlow':provider==='azure'?'azureFlow':'localFlow');history.replaceState?.(null,'',`#${provider}`)}
$('googleDeploy').href=googleOneClickUrl();$('googleFallback').href=googleCloudShellUrl();$('azureStandardDeploy').href=azureUrl(cfg.azureTemplatePath||'deploy/azure/azuredeploy.json');$('azurePrivateDeploy').href=azureUrl(cfg.azurePrivateTemplatePath||'deploy/azure/azuredeploy-private.json');$('localDownload').href=absolute(cfg.localKitPath||'downloads/Eve-beta-local-relay-kit.zip');$('localGuide').href=absolute(cfg.localGuidePath||'deploy/local/README.md');
const channel=String(cfg.channel||'development');$('channelBadge').textContent=channel==='stable'?'Stable':channel==='beta'?'Beta':'Local';$('channelEyebrow').textContent=channel==='stable'?'EVE STABLE':channel==='beta'?'EVE BETA':'LOCAL DEVELOPMENT';$('releaseLabel').textContent=`Eve ${cfg.version||'development'} · ${channel}`;$('buildLabel').textContent=cfg.build?`Build ${cfg.build}`:'';
if(placeholder)$('configWarning').classList.remove('hidden');
for(const id of ['googleDeploy','googleFallback','azureStandardDeploy','azurePrivateDeploy'])$(id)?.addEventListener('click',blockPlaceholder);
$('[data-install="organisation"]')?.addEventListener('click',goOrganisation);$('[data-install="local"]')?.addEventListener('click',()=>goProvider('local'));document.querySelectorAll('[data-provider]').forEach(b=>b.addEventListener('click',()=>goProvider(b.dataset.provider)));document.querySelectorAll('[data-back-home]').forEach(b=>b.addEventListener('click',goHome));document.querySelectorAll('[data-back-organisation]').forEach(b=>b.addEventListener('click',goOrganisation));
function initial(){const h=location.hash.toLowerCase();if(h==='#organisation')return goOrganisation();if(h==='#google')return goProvider('google');if(h==='#azure'||h==='#microsoft')return goProvider('azure');if(h==='#local')return goProvider('local');goHome()}initial();
