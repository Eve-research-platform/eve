'use strict';

const cfg = globalThis.EVE_FACTORY_CONFIG || {};
const $ = id => document.getElementById(id);
const placeholder = /OWNER|REPOSITORY/.test(`${cfg.repository || ''} ${cfg.containerImage || ''}`);
const revision = cfg.revision || cfg.branch || 'main';
const absolute = path => {
  try { return new URL(String(path || ''), document.baseURI).href; }
  catch { return String(path || '#'); }
};

function repoRaw(path) {
  const match = String(cfg.repository || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) return '';
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${encodeURIComponent(revision).replace(/%2F/g, '/')}/${path}`;
}

function googleCloudShellUrl() {
  return 'https://console.cloud.google.com/cloudshell?show=terminal';
}

function googleBootstrapCommand() {
  const repo = String(cfg.repository || '').replace(/\/+$/, '');
  if (!repo || placeholder) return '';
  const tutorial = String(cfg.googleTutorial || 'deploy/google/tutorial.md');
  return `rm -rf "$HOME/eve-deploy" && git clone --depth 1 --single-branch --branch ${revision} ${repo}.git "$HOME/eve-deploy" && cd "$HOME/eve-deploy" && cloudshell launch-tutorial ${tutorial}`;
}

function googleManualUrl() {
  const repo = String(cfg.repository || '').replace(/\/+$/, '');
  if (!repo || placeholder) return '#';
  return `${repo}/blob/${encodeURIComponent(revision).replace(/%2F/g, '/')}/deploy/google/README.md`;
}

function azureUrl(path) {
  const template = absolute(path);
  return template ? `https://portal.azure.com/#create/Microsoft.Template/uri/${encodeURIComponent(template)}` : '#';
}

function blockPlaceholder(e) {
  if (!placeholder) return false;
  e?.preventDefault?.();
  $('configWarning')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

function show(id) {
  for (const x of ['installChoice', 'organisationFlow', 'googleFlow', 'azureFlow', 'deploymentWizard', 'localFlow']) {
    $(x)?.classList.toggle('hidden', x !== id);
  }
  $(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function goHome() {
  clearWizardTimer();
  show('installChoice');
  try { history.replaceState?.(null, '', location.pathname + location.search); } catch {}
}

function goOrganisation() {
  clearWizardTimer();
  show('organisationFlow');
  try { history.replaceState?.(null, '', '#organisation'); } catch {}
}

function goProvider(provider) {
  clearWizardTimer();
  show(provider === 'google' ? 'googleFlow' : provider === 'azure' ? 'azureFlow' : 'localFlow');
  try { history.replaceState?.(null, '', `#${provider}`); } catch {}
}

// Bind navigation before any optional deployment-link/config setup can fail.
document.addEventListener('click', event => {
  const target = event.target?.closest?.('[data-install],[data-provider],[data-back-home],[data-back-organisation]');
  if (!target) return;
  if (target.hasAttribute('data-back-home')) { event.preventDefault(); goHome(); return; }
  if (target.hasAttribute('data-back-organisation')) { event.preventDefault(); goOrganisation(); return; }
  if (target.dataset.install === 'organisation') { event.preventDefault(); goOrganisation(); return; }
  if (target.dataset.install === 'local') { event.preventDefault(); goProvider('local'); return; }
  if (target.dataset.provider) { event.preventDefault(); goProvider(target.dataset.provider); }
});

function setHref(id, href) { const el = $(id); if (el) el.href = href; }
function setText(id, text) { const el = $(id); if (el) el.textContent = text; }

const deploymentLinks = {
  google: () => googleCloudShellUrl(),
  'azure-standard': () => azureUrl(cfg.azureTemplatePath || 'deploy/azure/azuredeploy.json'),
  'azure-private': () => azureUrl(cfg.azurePrivateTemplatePath || 'deploy/azure/azuredeploy-private.json')
};
const advancedLinks = {
  google: () => googleManualUrl(),
  'azure-standard': () => absolute(cfg.azureTemplatePath || 'deploy/azure/azuredeploy.json'),
  'azure-private': () => absolute(cfg.azurePrivateTemplatePath || 'deploy/azure/azuredeploy-private.json')
};
const providerMeta = {
  google: { mark: 'G', eyebrow: 'GOOGLE CLOUD', name: 'Google Cloud', resources: ['Cloud Run application','Cloud SQL PostgreSQL','Organisation storage','Secrets and service identity'] },
  'azure-standard': { mark: 'M', eyebrow: 'MICROSOFT AZURE · STANDARD', name: 'Microsoft Azure', resources: ['Container Apps application','PostgreSQL Flexible Server','Azure Files storage','Runtime secrets'] },
  'azure-private': { mark: 'M', eyebrow: 'MICROSOFT AZURE · PRIVATE', name: 'Private Microsoft Azure', resources: ['Internal Container Apps','Private PostgreSQL','Private Azure Files','Private DNS and VNet'] }
};
let wizard = { key: '', target: '', eveUrl: '', timer: null, launchedAt: 0 };
const WIZARD_STORAGE_KEY = 'eve.deploymentWizard.v1';

function saveWizard() {
  try { localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ key: wizard.key, target: wizard.target, eveUrl: wizard.eveUrl, launchedAt: wizard.launchedAt })); } catch {}
}
function restoreWizard() {
  try {
    const row = JSON.parse(localStorage.getItem(WIZARD_STORAGE_KEY) || 'null');
    if (row?.key && providerMeta[row.key]) wizard = { ...wizard, ...row };
  } catch {}
}
function clearWizardTimer() { if (wizard.timer) clearTimeout(wizard.timer); wizard.timer = null; }
function setWizardStep(active) {
  const order = ['launch','provider','verify','ready'];
  const index = order.indexOf(active);
  document.querySelectorAll('[data-wizard-step]').forEach(el => {
    const i = order.indexOf(el.dataset.wizardStep);
    el.classList.toggle('done', i < index || active === 'ready' && i <= index);
    el.classList.toggle('active', i === index && active !== 'ready');
  });
}
function renderResourceGrid(key, state = 'waiting') {
  const meta = providerMeta[key];
  const grid = $('wizardResourceGrid');
  if (!grid || !meta) return;
  grid.innerHTML = meta.resources.map(label => `<div class="wizard-resource ${state}"><span>${state === 'ready' ? '✓' : '•'}</span><small>${label}</small></div>`).join('');
}
function beginWizard(key, href, advancedHref) {
  if (placeholder) return false;
  const meta = providerMeta[key];
  if (!meta || !href || href === '#') return false;
  wizard.key = key; wizard.target = href; wizard.eveUrl = ''; wizard.launchedAt = Date.now(); saveWizard();
  setText('wizardProviderMark', meta.mark); setText('wizardEyebrow', meta.eyebrow); setText('deploymentWizardTitle', `Set up Eve on ${meta.name}`);
  const googleGuided = key === 'google';
  setText('wizardProviderStepTitle', googleGuided ? 'Run the guided Google setup' : `Complete setup in ${meta.name}`);
  setText('wizardProviderText', googleGuided ? 'Paste the Eve setup command into Cloud Shell. Google then guides you through project selection, billing and deployment.' : `Finish the ${meta.name} deployment form and wait until the provider reports that deployment is complete.`);
  setText('wizardStatusTitle', googleGuided ? 'Google Cloud Shell is opening' : `${meta.name} setup is open`);
  setText('wizardStatusDetail', googleGuided ? 'Eve uses a normal authenticated Cloud Shell session. Paste the setup command, then follow the Google walkthrough.' : 'Complete the setup in the new tab. This Eve page will stay here and verify the finished service.');
  setHref('wizardReopen', href); setHref('wizardAdvanced', advancedHref || href);
  $('wizardGooglePanel')?.classList.toggle('hidden', !googleGuided);
  if (googleGuided) {
    const command = googleBootstrapCommand();
    setText('wizardGoogleCommand', command);
    setText('wizardContinue', 'Google says Eve is ready');
    navigator.clipboard?.writeText?.(command).then(() => setText('wizardGoogleCopyStatus', 'Setup command copied — paste it into Cloud Shell.')).catch(() => setText('wizardGoogleCopyStatus', 'Use Copy setup command, then paste it into Cloud Shell.'));
  } else {
    setText('wizardContinue', 'Cloud says deployment is complete');
  }
  $('wizardProviderPanel')?.classList.remove('hidden'); $('wizardVerifyPanel')?.classList.add('hidden'); $('wizardReadyPanel')?.classList.add('hidden');
  $('wizardEveUrl').value = ''; $('wizardVerifyMessage').textContent = 'Eve will automatically advance when the readiness check passes.'; $('wizardChecks')?.classList.add('hidden');
  renderResourceGrid(key, 'waiting'); setWizardStep('provider'); show('deploymentWizard');
  try { history.replaceState?.(null, '', `#deploy-${key}`); } catch {}
  window.open(href, '_blank', 'noopener');
  return true;
}
function showVerify() {
  if (!wizard.key) return;
  setWizardStep('verify');
  $('wizardProviderPanel')?.classList.add('hidden'); $('wizardVerifyPanel')?.classList.remove('hidden'); $('wizardReadyPanel')?.classList.add('hidden');
  if (wizard.eveUrl) $('wizardEveUrl').value = wizard.eveUrl;
  $('wizardEveUrl')?.focus?.();
}
function normalizeEveUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); return u.origin; } catch { return ''; }
}
function checkRows(data) {
  const checks = data?.checks || {};
  const map = [
    ['authentication','Authentication configured'],['persistentStorageWritable','Durable storage writable'],['databaseStateReady','Database ready'],['publicHttpsOrigin','HTTPS public origin']
  ];
  return map.map(([key,label]) => `<div class="wizard-check ${checks[key] === true ? 'ready' : 'waiting'}"><span>${checks[key] === true ? '✓' : '…'}</span><small>${label}</small></div>`).join('');
}
async function verifyEve({ silent = false } = {}) {
  clearWizardTimer();
  const origin = normalizeEveUrl($('wizardEveUrl')?.value || wizard.eveUrl);
  if (!origin) { $('wizardVerifyMessage').textContent = 'Enter the HTTPS Eve address shown by your cloud provider.'; return; }
  wizard.eveUrl = origin; saveWizard();
  const message = $('wizardVerifyMessage'); const checks = $('wizardChecks');
  if (!silent) message.textContent = 'Checking Eve readiness…';
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(`${origin}/api/readiness`, { cache: 'no-store', signal: controller.signal, mode: 'cors' }); clearTimeout(timeout);
    let data = {}; try { data = await response.json(); } catch {}
    checks.innerHTML = checkRows(data?.checks ? data : data?.readiness || data); checks.classList.remove('hidden');
    if (response.ok && data?.ready === true) {
      renderResourceGrid(wizard.key, 'ready'); setWizardStep('ready');
      $('wizardVerifyPanel')?.classList.add('hidden'); $('wizardReadyPanel')?.classList.remove('hidden'); setHref('wizardOpenEve', origin);
      saveWizard(); return;
    }
    message.textContent = 'Eve is reachable but is not ready yet. This page will check again automatically.';
    wizard.timer = setTimeout(() => verifyEve({ silent: true }), 5000);
  } catch (error) {
    message.textContent = 'Eve is not reachable from this browser yet. Check that the deployment has completed and that you copied the final HTTPS address. Retrying…';
    wizard.timer = setTimeout(() => verifyEve({ silent: true }), 6000);
  }
}

function wireDeploymentStart(id, key, advancedHref) {
  const el = $(id); if (!el) return;
  el.addEventListener('click', event => {
    if (blockPlaceholder(event)) return;
    event.preventDefault();
    beginWizard(key, el.href, advancedHref());
  });
}

try {
  setHref('googleDeploy', googleCloudShellUrl());
  setHref('googleFallback', googleManualUrl());
  setHref('azureStandardDeploy', deploymentLinks['azure-standard']());
  setHref('azurePrivateDeploy', deploymentLinks['azure-private']());
  setHref('localDownload', absolute(cfg.localKitPath || 'downloads/Eve-beta-local-relay-kit.zip'));
  setHref('localGuide', absolute(cfg.localGuidePath || 'deploy/local/README.md'));
  wireDeploymentStart('googleDeploy', 'google', advancedLinks.google);
  wireDeploymentStart('azureStandardDeploy', 'azure-standard', advancedLinks['azure-standard']);
  wireDeploymentStart('azurePrivateDeploy', 'azure-private', advancedLinks['azure-private']);

  $('wizardCopyGoogleCommand')?.addEventListener('click', async () => {
    const command = googleBootstrapCommand();
    try { await navigator.clipboard.writeText(command); setText('wizardGoogleCopyStatus', 'Setup command copied — paste it into Cloud Shell.'); }
    catch { setText('wizardGoogleCopyStatus', 'Copy the command shown above, then paste it into Cloud Shell.'); }
  });
  $('wizardReopen')?.addEventListener('click', () => {
    if (wizard.key === 'google') navigator.clipboard?.writeText?.(googleBootstrapCommand()).catch(() => {});
  });
  $('wizardContinue')?.addEventListener('click', showVerify);
  $('wizardVerify')?.addEventListener('click', () => verifyEve());
  $('wizardEveUrl')?.addEventListener('keydown', e => { if (e.key === 'Enter') verifyEve(); });
  $('wizardEveUrl')?.addEventListener('paste', () => setTimeout(() => verifyEve(), 50));
  $('wizardPaste')?.addEventListener('click', async () => {
    try { const text = await navigator.clipboard.readText(); if (text) { $('wizardEveUrl').value = text; verifyEve(); } }
    catch { $('wizardVerifyMessage').textContent = 'Paste the Eve address into the box, then choose Check Eve.'; }
  });
  $('wizardBack')?.addEventListener('click', () => wizard.key === 'google' ? goProvider('google') : goProvider('azure'));
  $('wizardStartAnother')?.addEventListener('click', () => { try { localStorage.removeItem(WIZARD_STORAGE_KEY); } catch {} wizard = { key:'',target:'',eveUrl:'',timer:null,launchedAt:0 }; goHome(); });
  window.addEventListener('focus', () => {
    if (!$('deploymentWizard')?.classList.contains('hidden') && wizard.key && Date.now() - Number(wizard.launchedAt || 0) > 1500 && !$('wizardProviderPanel')?.classList.contains('hidden')) {
      setText('wizardStatusTitle', 'Back from cloud setup?');
      setText('wizardStatusDetail', 'If your cloud provider reports that deployment is complete, continue to verification. Eve will not mark it ready until the live readiness check passes.');
    }
  });

  const channel = String(cfg.channel || 'development');
  setText('channelBadge', channel === 'stable' ? 'Stable' : channel === 'beta' ? 'Beta' : 'Local');
  setText('channelEyebrow', channel === 'stable' ? 'EVE STABLE' : channel === 'beta' ? 'EVE BETA' : 'LOCAL DEVELOPMENT');
  setText('releaseLabel', `Eve ${cfg.version || 'development'} · ${channel}`);
  setText('buildLabel', cfg.build ? `Build ${cfg.build}` : '');
  if (placeholder) $('configWarning')?.classList.remove('hidden');
  for (const id of ['googleFallback']) $(id)?.addEventListener('click', blockPlaceholder);
} catch (error) {
  console.error('Eve deployment-link setup failed; navigation remains available.', error);
}

function initial() {
  restoreWizard();
  const h = location.hash.toLowerCase();
  if (h.startsWith('#deploy-') && wizard.key) {
    const meta = providerMeta[wizard.key];
    setText('wizardProviderMark', meta.mark); setText('wizardEyebrow', meta.eyebrow); setText('deploymentWizardTitle', `Set up Eve on ${meta.name}`);
    setHref('wizardReopen', wizard.target || deploymentLinks[wizard.key]?.()); setHref('wizardAdvanced', advancedLinks[wizard.key]?.() || wizard.target);
    renderResourceGrid(wizard.key, 'waiting'); show('deploymentWizard');
    if (wizard.eveUrl) showVerify(); else setWizardStep('provider');
    return;
  }
  if (h === '#organisation') return goOrganisation();
  if (h === '#google') return goProvider('google');
  if (h === '#azure' || h === '#microsoft') return goProvider('azure');
  if (h === '#local') return goProvider('local');
  goHome();
}

try { initial(); }
catch (error) { console.error('Eve launcher initialisation failed.', error); }
