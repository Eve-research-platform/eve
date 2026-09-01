const ACTIVE_TASK_KEY = 'eveActiveNavigationTask';
const LAST_RESULT_KEY = 'eveLastNavigationResult';

const sessionGet = async key => (await chrome.storage.session.get(key))[key] || null;
const sessionSet = async (key, value) => chrome.storage.session.set({ [key]: value });
const sessionRemove = async key => chrome.storage.session.remove(key);

function normaliseTask(raw, senderTab) {
  const startPage = String(raw?.startPage || '').trim();
  const parsed = new URL(startPage);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Navigation tasks require an http(s) start page.');
  const successPage = String(raw?.successPage || '').trim();
  if (successPage) {
    const success = new URL(successPage);
    if (!['http:', 'https:'].includes(success.protocol)) throw new Error('Navigation tasks require an http(s) success page.');
  }
  const timeoutSeconds = Math.max(0, Number(raw?.timeoutSeconds) || 0);
  const startedAt = Number(raw?.startedAt) || Date.now();
  return {
    taskId: String(raw?.taskId || ''),
    instructions: String(raw?.instructions || 'Complete the navigation task, then confirm when you are finished.'),
    startPage,
    successPage,
    timeoutSeconds,
    startedAt,
    expiresAt: timeoutSeconds ? startedAt + timeoutSeconds * 1000 : null,
    sourceTabId: senderTab?.id ?? null,
    sourceWindowId: senderTab?.windowId ?? null,
    taskTabId: null,
    sourceUrl: String(raw?.sourceUrl || ''),
    extensionVersion: chrome.runtime.getManifest().version
  };
}

async function currentTask() {
  const task = await sessionGet(ACTIVE_TASK_KEY);
  if (!task) return null;
  if (task.expiresAt && Date.now() >= task.expiresAt) {
    await finaliseTask('timed_out', { completionUrl: '', elapsedMs: Math.max(0, task.expiresAt - task.startedAt) });
    return null;
  }
  return task;
}

async function safeSend(tabId, message) {
  if (!Number.isInteger(tabId)) return;
  try { await chrome.tabs.sendMessage(tabId, message); } catch (_) {}
}

async function finaliseTask(status, details = {}) {
  const task = await sessionGet(ACTIVE_TASK_KEY);
  if (!task) return null;
  const finishedAt = Date.now();
  const result = {
    taskId: task.taskId,
    status,
    startedAt: task.startedAt,
    finishedAt,
    elapsedMs: Number(details.elapsedMs) || Math.max(0, finishedAt - task.startedAt),
    completionUrl: String(details.completionUrl || ''),
    source: String(details.source || 'eve-navigation-extension')
  };
  await sessionRemove(ACTIVE_TASK_KEY);
  await sessionSet(LAST_RESULT_KEY, { ...result, sourceTabId: task.sourceTabId, savedAt: finishedAt });
  await safeSend(task.sourceTabId, { type: 'EVE_NAV_TASK_RESULT', result });
  await safeSend(task.taskTabId, { type: 'EVE_NAV_TASK_RESULT', result });
  return result;
}


async function returnToSurveyAndCloseTaskTab(task) {
  if (!task) return;
  if (Number.isInteger(task.sourceTabId)) {
    try { await chrome.tabs.update(task.sourceTabId, { active: true }); } catch (_) {}
  }
  if (Number.isInteger(task.sourceWindowId) && chrome.windows?.update) {
    try { await chrome.windows.update(task.sourceWindowId, { focused: true }); } catch (_) {}
  }
  if (Number.isInteger(task.taskTabId) && task.taskTabId !== task.sourceTabId) {
    try { await chrome.tabs.remove(task.taskTabId); } catch (_) {}
  }
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== 'object') return { ok: false, error: 'Invalid message.' };

  if (message.type === 'EVE_NAV_START_TASK') {
    if (!sender.tab?.id) return { ok: false, error: 'Eve source tab was not available.' };
    const task = normaliseTask(message.task, sender.tab);
    if (!task.taskId) return { ok: false, error: 'Task ID is required.' };
    await sessionRemove(LAST_RESULT_KEY);
    await sessionSet(ACTIVE_TASK_KEY, task);
    const created = await chrome.tabs.create({ url: task.startPage, active: true });
    task.taskTabId = created.id;
    await sessionSet(ACTIVE_TASK_KEY, task);
    await safeSend(task.taskTabId, { type: 'EVE_NAV_TASK_ACTIVATE', task });
    return { ok: true, taskId: task.taskId, taskTabId: task.taskTabId };
  }

  if (message.type === 'EVE_NAV_GET_TASK_FOR_TAB') {
    const task = await currentTask();
    if (!task || sender.tab?.id !== task.taskTabId) return { ok: true, task: null };
    return { ok: true, task };
  }

  if (message.type === 'EVE_NAV_SUCCESS_REACHED') {
    const task = await currentTask();
    if (!task) return { ok: false, error: 'No active Eve task.' };
    if (sender.tab?.id !== task.taskTabId) return { ok: false, error: 'This tab does not own the active Eve task.' };
    const result = await finaliseTask('completed', { completionUrl: sender.tab?.url || '', elapsedMs: Date.now() - task.startedAt, source: 'eve-navigation-extension-auto' });
    setTimeout(() => returnToSurveyAndCloseTaskTab(task), 120);
    return { ok: true, result };
  }

  if (message.type === 'EVE_NAV_COMPLETE_TASK') {
    const task = await currentTask();
    if (!task) return { ok: false, error: 'No active Eve task.' };
    if (sender.tab?.id !== task.taskTabId) return { ok: false, error: 'This tab does not own the active Eve task.' };
    const result = await finaliseTask('completed', { completionUrl: sender.tab?.url || '', elapsedMs: Date.now() - task.startedAt });
    // Let the content-script message resolve first, then return the participant to Eve.
    setTimeout(() => returnToSurveyAndCloseTaskTab(task), 120);
    return { ok: true, result };
  }

  if (message.type === 'EVE_NAV_SOURCE_RESULT') {
    const task = await currentTask();
    if (!task) return { ok: true, result: null };
    if (sender.tab?.id !== task.sourceTabId || String(message.result?.taskId || '') !== task.taskId) return { ok: false, error: 'This Eve tab does not own the active task.' };
    const status = message.result?.status === 'timed_out' ? 'timed_out' : 'completed';
    const result = await finaliseTask(status, { elapsedMs: Number(message.result?.elapsedMs) || Date.now() - task.startedAt, completionUrl: '', source: 'eve-manual' });
    return { ok: true, result };
  }

  if (message.type === 'EVE_NAV_TIMEOUT_TASK') {
    const task = await currentTask();
    if (!task) return { ok: true, result: null };
    if (sender.tab?.id !== task.taskTabId) return { ok: false, error: 'This tab does not own the active Eve task.' };
    const result = await finaliseTask('timed_out', { completionUrl: sender.tab?.url || '', elapsedMs: Math.max(0, Date.now() - task.startedAt) });
    return { ok: true, result };
  }

  if (message.type === 'EVE_NAV_GET_SOURCE_RESULT') {
    const saved = await sessionGet(LAST_RESULT_KEY);
    return { ok: true, result: saved && sender.tab?.id === saved.sourceTabId ? saved : null };
  }

  if (message.type === 'EVE_NAV_GET_STATUS') {
    return { ok: true, task: await currentTask(), lastResult: await sessionGet(LAST_RESULT_KEY) };
  }

  return { ok: false, error: 'Unknown message.' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false, error: error?.message || 'Eve extension error.' }));
  return true;
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const task = await sessionGet(ACTIVE_TASK_KEY);
  if (!task) return;
  if (tabId === task.sourceTabId) task.sourceTabId = null;
  if (tabId === task.taskTabId) task.taskTabId = null;
  await sessionSet(ACTIVE_TASK_KEY, task);
});
