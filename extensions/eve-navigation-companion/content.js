const EVE_MARKER = 'meta[name="eve-app"][content="navigation-bridge-v1"]';
const OVERLAY_ID = 'eve-navigation-companion-root';
let overlayTimer = null;
let successWatcher = null;
let timeoutSent = false;
let successSent = false;

function pageIsEve() {
  return Boolean(document.querySelector(EVE_MARKER));
}

function postToEve(type, payload = {}) {
  window.postMessage({ source: 'eve-navigation-companion', type, ...payload }, '*');
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function removeOverlay() {
  clearInterval(overlayTimer);
  clearInterval(successWatcher);
  overlayTimer = null;
  successWatcher = null;
  document.getElementById(OVERLAY_ID)?.remove();
}

function normalisedPath(pathname) {
  const value = String(pathname || '/').replace(/\/{2,}/g, '/');
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

function successUrlMatches(currentUrl, successUrl) {
  if (!successUrl) return false;
  try {
    const current = new URL(currentUrl);
    const target = new URL(successUrl);
    if (current.origin !== target.origin) return false;
    if (normalisedPath(current.pathname) !== normalisedPath(target.pathname)) return false;
    return !target.search || current.search === target.search;
  } catch (_) {
    return false;
  }
}

async function detectAutomaticSuccess(task, statusNode, completeButton) {
  if (!task?.successPage || successSent || !successUrlMatches(location.href, task.successPage)) return false;
  successSent = true;
  if (completeButton) { completeButton.disabled = true; completeButton.textContent = 'Success page reached'; }
  if (statusNode) statusNode.textContent = 'Success page reached. Returning you to Eve…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EVE_NAV_SUCCESS_REACHED' });
    if (!response?.ok) throw new Error(response?.error || 'Could not complete the task.');
    clearInterval(overlayTimer);
    clearInterval(successWatcher);
    return true;
  } catch (error) {
    successSent = false;
    if (completeButton) { completeButton.disabled = false; completeButton.textContent = 'I’ve completed this task'; }
    if (statusNode) statusNode.textContent = error?.message || 'Could not complete the task automatically.';
    return false;
  }
}

async function renderOverlay(task) {
  removeOverlay();
  successSent = false;
  if (!task) return;
  const host = document.createElement('div');
  host.id = OVERLAY_ID;
  host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host{all:initial}
      *{box-sizing:border-box}
      .eve-card{width:min(360px,calc(100vw - 32px));font-family:ui-rounded,"SF Pro Rounded","Nunito","Avenir Next",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#24304d;border:1px solid #cfd8ec;border-radius:14px;box-shadow:0 12px 34px rgba(36,48,77,.18);overflow:hidden}
      .eve-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f2f5fb;border-bottom:1px solid #dfe5f1}
      .eve-mark{width:26px;height:26px;border-radius:8px;background:#3758a8;color:#fff;display:grid;place-items:center;font:700 14px/1 system-ui,sans-serif}
      .eve-title{font-weight:750;font-size:14px;flex:1}
      .eve-minimise{border:0;background:transparent;color:#52617f;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:20px;line-height:1}
      .eve-minimise:hover,.eve-minimise:focus{background:#e4eaf6;outline:2px solid transparent}
      .eve-body{padding:16px}
      .eve-label{font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.06em;color:#6d7891;margin-bottom:7px}
      .eve-instructions{font-size:16px;line-height:1.45;font-weight:650;margin:0 0 16px;white-space:pre-wrap}
      .eve-timer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:#f7f8fc;border:1px solid #e2e7f1;margin-bottom:14px;font-size:13px;color:#586581}
      .eve-timer strong{font-variant-numeric:tabular-nums;font-size:17px;color:#253354}
      .eve-complete{width:100%;border:0;border-radius:10px;background:#3155a6;color:#fff;padding:12px 14px;font:700 14px/1.2 inherit;cursor:pointer}
      .eve-complete:hover{background:#28498f}.eve-complete:focus{outline:3px solid #ffdd00;outline-offset:2px}.eve-complete:disabled{cursor:default;background:#7c8aaa}
      .eve-status{font-size:12px;line-height:1.4;color:#69758f;margin-top:10px}
      .eve-card.minimised .eve-body{display:none}.eve-card.minimised{width:auto;min-width:180px}.eve-card.minimised .eve-head{border-bottom:0}
      @media(max-width:520px){.eve-card{width:calc(100vw - 24px)}:host{right:12px!important;bottom:12px!important}}
    </style>
    <aside class="eve-card" role="complementary" aria-label="Eve navigation task">
      <header class="eve-head">
        <span class="eve-mark" aria-hidden="true">E</span>
        <span class="eve-title">Eve navigation task</span>
        <button class="eve-minimise" type="button" aria-label="Minimise Eve task" title="Minimise">−</button>
      </header>
      <div class="eve-body">
        <div class="eve-label">Your task</div>
        <p class="eve-instructions"></p>
        <div class="eve-timer" data-timer-wrap hidden><span>Time remaining</span><strong data-timer>0:00</strong></div>
        <button class="eve-complete" type="button">I’ve completed this task</button>
        <div class="eve-status" aria-live="polite">Complete the task on this website, then use the button above.</div>
      </div>
    </aside>`;
  const card = shadow.querySelector('.eve-card');
  const instructions = shadow.querySelector('.eve-instructions');
  const timerWrap = shadow.querySelector('[data-timer-wrap]');
  const timer = shadow.querySelector('[data-timer]');
  const complete = shadow.querySelector('.eve-complete');
  const status = shadow.querySelector('.eve-status');
  const minimise = shadow.querySelector('.eve-minimise');
  instructions.textContent = task.instructions || 'Complete the navigation task.';

  const checkSuccess = () => detectAutomaticSuccess(task, status, complete);
  await checkSuccess();
  if (successSent) return;
  if (task.successPage) successWatcher = setInterval(checkSuccess, 500);

  minimise.addEventListener('click', () => {
    card.classList.toggle('minimised');
    const minimised = card.classList.contains('minimised');
    minimise.textContent = minimised ? '+' : '−';
    minimise.setAttribute('aria-label', minimised ? 'Expand Eve task' : 'Minimise Eve task');
    minimise.title = minimised ? 'Expand' : 'Minimise';
  });

  complete.addEventListener('click', async () => {
    complete.disabled = true;
    complete.textContent = 'Completing…';
    const response = await chrome.runtime.sendMessage({ type: 'EVE_NAV_COMPLETE_TASK' });
    if (!response?.ok) {
      complete.disabled = false;
      complete.textContent = 'I’ve completed this task';
      status.textContent = response?.error || 'Could not complete the task. Try again.';
      return;
    }
    clearInterval(overlayTimer);
    complete.textContent = 'Task complete';
    status.textContent = 'Done. Returning you to Eve…';
    setTimeout(removeOverlay, 2200);
  });

  const tick = async () => {
    if (!task.expiresAt) return;
    const seconds = Math.max(0, (task.expiresAt - Date.now()) / 1000);
    timerWrap.hidden = false;
    timer.textContent = formatRemaining(seconds);
    if (seconds <= 0 && !timeoutSent) {
      timeoutSent = true;
      clearInterval(overlayTimer);
      complete.disabled = true;
      complete.textContent = 'Time limit reached';
      status.textContent = 'The time limit has ended. Return to Eve to continue.';
      await chrome.runtime.sendMessage({ type: 'EVE_NAV_TIMEOUT_TASK' });
      setTimeout(removeOverlay, 2600);
    }
  };

  document.documentElement.appendChild(host);
  timeoutSent = false;
  if (task.expiresAt) {
    await tick();
    if (!timeoutSent) overlayTimer = setInterval(tick, 1000);
  }
}

async function askForTask() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EVE_NAV_GET_TASK_FOR_TAB' });
    if (response?.ok && response.task) await renderOverlay(response.task);
  } catch (_) {}
}

window.addEventListener('message', async event => {
  if (event.source !== window || !event.data || event.data.source !== 'eve-web') return;
  if (event.data.type === 'EVE_NAV_EXTENSION_PING') {
    if (pageIsEve()) postToEve('EVE_NAV_EXTENSION_READY', { version: chrome.runtime.getManifest().version });
    return;
  }
  if (event.data.type === 'EVE_NAV_TASK_SOURCE_RESULT' && pageIsEve()) {
    try { await chrome.runtime.sendMessage({ type: 'EVE_NAV_SOURCE_RESULT', result: event.data.result }); } catch (_) {}
    return;
  }
  if (event.data.type !== 'EVE_NAV_TASK_START' || !pageIsEve()) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EVE_NAV_START_TASK', task: event.data.task });
    if (response?.ok) postToEve('EVE_NAV_TASK_STARTED', { taskId: response.taskId });
    else postToEve('EVE_NAV_TASK_ERROR', { taskId: event.data.task?.taskId, error: response?.error || 'Could not start navigation task.' });
  } catch (error) {
    postToEve('EVE_NAV_TASK_ERROR', { taskId: event.data.task?.taskId, error: error?.message || 'Could not start navigation task.' });
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'EVE_NAV_TASK_ACTIVATE' && message.task && !pageIsEve()) { renderOverlay(message.task); return; }
  if (message?.type !== 'EVE_NAV_TASK_RESULT' || !message.result) return;
  if (pageIsEve()) postToEve('EVE_NAV_TASK_RESULT', { result: message.result });
  const host = document.getElementById(OVERLAY_ID);
  if (host) {
    const shadow = host.shadowRoot;
    const button = shadow?.querySelector('.eve-complete');
    const status = shadow?.querySelector('.eve-status');
    clearInterval(overlayTimer);
    if (button) {
      button.disabled = true;
      button.textContent = message.result.status === 'timed_out' ? 'Time limit reached' : 'Task complete';
    }
    if (status) status.textContent = message.result.status === 'timed_out' ? 'The time limit has ended. Return to Eve to continue.' : 'Done. Returning you to Eve…';
    setTimeout(removeOverlay, 2200);
  }
});

const initialise = async () => {
  if (pageIsEve()) {
    postToEve('EVE_NAV_EXTENSION_READY', { version: chrome.runtime.getManifest().version });
    try {
      const response = await chrome.runtime.sendMessage({ type: 'EVE_NAV_GET_SOURCE_RESULT' });
      if (response?.ok && response.result) postToEve('EVE_NAV_TASK_RESULT', { result: response.result });
    } catch (_) {}
  } else {
    askForTask();
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
else initialise();
