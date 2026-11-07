import {
  terminalSelect,
  terminalInput,
  terminalUser,
  buildCallFields,
  buildVideoFields,
  buildAudioFields,
  buildGeneralFields,
} from './admin-terminalfields.js';
import { query } from './admin-shared.js';
// Device association and settings editor. Serial numbers identify hardware independently of SIP usernames.
import {
  el,
  badge,
  online,
  registered,
  panel,
  submit,
  api,
  notice,
  actionButton,
  setView,
  empty,
  link,
  confirm,
} from './admin-shared.js';
import { state, $ } from './admin-state.js';
import { openWifi, serverPdf } from './admin-setup.js';
import { openConsole } from './admin-console.js';
import { openDeveloperAccess } from './admin-developer.js';
/** @param {HTMLElement} card @param {string} title @param {string} kind @returns {import('../types/admin-dom').TerminalForm} */
export function terminalForm(card, title, kind) {
  const form = Object.assign(el('form', null, 'terminal-settings-form'), {
    fields: /** @type {Record<string, HTMLInputElement | HTMLSelectElement>} */ ({}),
    errorId: '',
  });
  form.dataset.kind = kind;
  form.setAttribute('aria-label', `${title} for ${terminalId(card)}`);
  form.append(el('h3', title));
  const error = el('p', null, 'banner error');
  error.id = `terminal-${kind}-error-${terminalId(card)}`;
  error.hidden = true;
  error.setAttribute('role', 'alert');
  form.errorId = error.id;
  form.append(error);
  form.addEventListener('input', () => {
    form.dataset.dirty = 'true';
    card.dataset.dirty = 'true';
    updateTerminalSaveState(card);
  });
  form.addEventListener('change', () => {
    form.dataset.dirty = 'true';
    card.dataset.dirty = 'true';
    updateTerminalSaveState(card);
  });
  return form;
}
/** @param {import('../types/admin-dom').TerminalForm} form @param {HTMLElement} card */
export function savedTerminalForm(form, card) {
  form.dataset.dirty = 'false';
  card.dataset.dirty = String(!!card.querySelector('form[data-dirty="true"]'));
  updateTerminalSaveState(card);
}
// @llr LLR-SRV-UI-017
/** @param {HTMLElement} card */
function updateTerminalSaveState(card) {
  const status = card.querySelector('.terminal-save-state');
  if (status)
    status.textContent = card.querySelector('form[data-kind=devices][data-dirty=true]')
      ? 'Unsaved settings'
      : 'Settings saved';
}
/** @param {HTMLElement} list @param {string} label @param {string} value */
function terminalDetail(list, label, value) {
  const row = el('div');
  row.append(el('dt', label), el('dd', value));
  list.append(row);
}
// @llr LLR-SRV-UI-017
/** @param {HTMLElement} summary @param {import('../types/contracts').TerminalStatus | undefined} status @param {boolean} fresh */
function appendTerminalHardware(summary, status, fresh) {
  if (!fresh) {
    terminalDetail(summary, 'Remote', 'Status unavailable');
    terminalDetail(summary, 'C10/C20', 'Status unavailable');
    return;
  }
  /** @type {Record<string, string>} */
  const remote = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    unpaired: 'Not paired',
    blocked: 'Blocked',
    bluetooth_unavailable: 'Bluetooth unavailable',
    input_unavailable: 'input unavailable',
  };
  /** @type {Record<string, string>} */
  const camera = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    off: 'Powered off',
    on: 'Powered on (connection unknown)',
    waking: 'Waking',
    switching: 'Changing power',
    error: 'Power/recovery error',
  };
  const battery = status?.remote_battery;
  terminalDetail(summary, 'Remote', remote[status?.remote_status || ''] || 'Unknown');
  terminalDetail(
    summary,
    'Remote battery',
    typeof battery === 'number' ? battery + '%' : 'Unknown',
  );
  terminalDetail(
    summary,
    'Remote charger',
    status?.remote_charger_connected === true
      ? 'Connected'
      : status?.remote_charger_connected === false
        ? 'Not connected'
        : 'Unknown',
  );
  terminalDetail(summary, 'C10/C20', camera[status?.camera_status || ''] || 'Unknown');
  terminalDetail(
    summary,
    'C10/C20 power',
    status?.camera_powered === true ? 'On' : status?.camera_powered === false ? 'Off' : 'Unknown',
  );
}
/** @param {HTMLElement} connection
 * @param {import('../types/contracts').TerminalUpdateStatus | undefined} update
 * @param {number} [now] */
export function appendTerminalUpdate(connection, update, now = Date.now()) {
  // @llr LLR-SRV-MAINT-022
  if (update) {
    const age = now - Date.parse(update.received_at);
    const fresh = age >= 0 && age <= 60000;
    /** @type {Record<string, string>} */
    const phases = {
      idle: 'Up to date',
      request: 'Waiting for inactivity',
      updating: 'Applying update',
      checking: 'Checking update',
      rollback: 'Restoring previous version',
      recovery_failed: 'Recovery needs attention',
    };
    const detail = fresh
      ? update.error
        ? 'Update retry pending'
        : update.phase === 'idle' && update.available && update.available !== update.installed
          ? 'Update available'
          : phases[update.phase] || 'Update status unknown'
      : 'Update status unavailable';
    connection.append(
      badge(
        (update.installed ? 'Version ' + update.installed + ' · ' : '') + detail,
        fresh && update.phase === 'idle' && !update.error ? 'success' : 'neutral',
      ),
    );
  }
}
/** @param {HTMLElement} card @param {string} id */
export function terminalCardState(card, id) {
  const u = state.model.users[id];
  query(card, 'h2').textContent = u.name;
  query(card, '.terminal-address').textContent = `sip:${id}@${state.model.host}`;
  const summary = query(card, '.terminal-summary');
  const fresh = online(id);
  const sipRegistered = registered(id);
  const status = state.model.terminal_statuses[id];
  const quick = query(card, '.terminal-quick-status');
  quick.replaceChildren(
    badge(fresh ? 'Terminal online' : 'Terminal offline', fresh ? 'success' : 'neutral'),
    el('span', sipRegistered ? 'SIP registered' : 'SIP offline'),
  );
  if (fresh && typeof status?.remote_battery === 'number')
    quick.append(el('span', `Remote ${status.remote_battery}%`));
  if (fresh && status?.camera_status === 'connected') quick.append(el('span', 'Camera connected'));
  summary.replaceChildren();
  /** @param {string} title */
  function statusGroup(title) {
    const group = el('div', null, 'terminal-status-group');
    const rows = el('dl');
    group.append(el('h3', title), rows);
    summary.append(group);
    return { group, rows };
  }
  const connection = statusGroup('Connection');
  const hardware = statusGroup('Remote & camera');
  const features = statusGroup('Call features');
  terminalDetail(connection.rows, 'SIP', sipRegistered ? 'Registered' : 'Offline');
  if (id === state.model.local_terminal_id)
    terminalDetail(connection.rows, 'Server', 'Local terminal');
  appendTerminalUpdate(connection.group, status?.update);
  appendTerminalHardware(hardware.rows, status, fresh);
  if (state.model.profiles[id].auto_framing === true) {
    const framingStatus = status?.auto_framing_status;
    /** @type {Record<string, string>} */
    const labels = {
      active: 'Active',
      waiting: 'Ready for a call',
      unavailable: 'Unavailable · full view',
      unsupported: 'Requires a Pi C10/C20 terminal',
    };
    terminalDetail(features.rows, 'Automatic framing', labels[framingStatus || ''] || 'Pending');
  }
  if (
    (state.model.profiles[id].audio_profile || 'normal') === 'speech' &&
    status?.requested_audio_profile === 'speech'
  )
    terminalDetail(
      features.rows,
      'Speech audio',
      status.audio_profile === 'speech' ? 'Active' : 'Unavailable · normal audio',
    );
  features.group.hidden = !features.rows.children.length;
  card
    .querySelectorAll('form')
    .forEach((form) =>
      form.setAttribute(
        'aria-label',
        `${form.dataset.kind === 'association' ? 'Account association' : 'Terminal settings'} for ${id}`,
      ),
    );
}
/** @param {HTMLElement} card @param {string} key @param {string} title @param {string} description */
function terminalSection(card, key, title, description) {
  const section = el('details', null, 'terminal-section terminal-' + key);
  const heading = el('summary');
  heading.append(el('span', title), el('small', description));
  section.append(heading);
  section.dataset.section = key;
  section.setAttribute('name', 'terminal-sections-' + terminalId(card));
  return section;
}
/** @param {HTMLElement} card @param {string} id */
function buildDevicesForm(card, id) {
  // Keep the revision that produced these controls, even while polling updates state.model.
  const configurationVersion = state.model.configuration_version;
  const devices = terminalForm(card, 'Terminal settings', 'devices');
  devices.configurationVersion = configurationVersion;
  query(devices, 'h3').remove();
  // @llr LLR-SRV-UI-017
  // Keep saving beside the draft status while the long form scrolls.
  const saveBar = el('div', null, 'terminal-save-bar');
  const saveState = el('span', 'Settings saved', 'terminal-save-state');
  saveState.setAttribute('role', 'status');
  const save = el('button', 'Save changes', 'primary');
  save.type = 'submit';
  saveBar.append(saveState, save);
  // Separate visual groups share one form and one save action.
  /** @param {string} key @param {string} title @param {string} description */
  const group = (key, title, description) => {
    const section = terminalSection(card, key, title, description);
    const fields = el('div', null, 'terminal-options');
    section.append(fields);
    devices.append(section);
    return fields;
  };
  const user = terminalUser(id);
  const profile = state.model.profiles[id];
  const language = state.model.terminal_languages.find(
    (entry) => entry.code === (profile.language || 'en'),
  );
  const ringtone = state.model.ringtone_choices.find((entry) => entry.id === profile.ringtone);
  buildCallFields(
    devices,
    group('calls', 'Calls', user.auto_answer ? 'Auto-answer on' : 'Auto-answer off'),
    id,
  );
  buildVideoFields(
    devices,
    group(
      'video',
      'Video',
      `${profile.video_resolution || '720p'} · ${profile.video_fps ?? 15} fps`,
    ),
    id,
  );
  buildAudioFields(
    devices,
    group(
      'audio',
      'Audio',
      `${profile.audio_profile === 'speech' ? 'Speech' : 'Normal audio'} · ${ringtone?.name || 'Nokia'}`,
    ),
    id,
  );
  buildGeneralFields(
    devices,
    group(
      'general',
      'General',
      `${language?.native || 'English'} · ${profile.carousel_portraits ?? 3} portraits`,
    ),
    id,
  );
  devices.append(saveBar);
  // A user can save from a different section after editing a numeric field.
  devices.addEventListener(
    'invalid',
    (event) => {
      const section =
        event.target instanceof HTMLElement && event.target.closest('.terminal-section');
      if (section instanceof HTMLDetailsElement) section.open = true;
    },
    true,
  );
  devices.onsubmit = (e) => {
    e.preventDefault();
    return submit(
      devices,
      async () => {
        const fields = devices.fields,
          currentId = terminalId(card);
        await api('/api/settings', 'PUT', {
          terminal_id: currentId,
          configuration_version: devices.configurationVersion,
          display_name: state.model.profiles[currentId].display_name,
          auto_answer: terminalInput(devices, 'autoAnswer').checked,
          auto_answer_seconds: Number(fields.countdown.value),
          language: fields.language.value,
          command_shell: state.model.profiles[currentId].command_shell || 'powershell',
          audio_profile: fields.audioProfile.value,
          video_resolution: fields.videoResolution.value,
          video_fps: Number(fields.videoFps.value),
          carousel_portraits: Number(fields.carouselPortraits.value),
          tv_idle_seconds: Number(fields.tvIdleSeconds.value),
          auto_framing: terminalInput(devices, 'autoFraming').checked,
          c20_speaker_volume: Number(fields.c20SpeakerVolume.value),
          ringtone_volume: Number(fields.ringtoneVolume.value),
          action_sound_volume: Number(fields.actionSoundVolume.value),
          // @llr LLR-SRV-CONFIG-024
          ringtone: fields.ringtone.value,
          camera: '',
          microphone: '',
          speaker: '',
        });
        savedTerminalForm(devices, card);
        await state.refresh(true);
        notice(`Saved terminal settings for ${currentId}.`);
      },
      devices.errorId,
    );
  };
  return devices;
}
/** @param {HTMLElement} card */
function buildTerminalTools(card) {
  const footer = el('details', null, 'terminal-tools');
  const tools = el('div', null, 'button-row');
  const setup = el('details', null, 'terminal-setup');
  setup.append(el('summary', 'Setup', 'secondary'));
  const menu = el('div', null, 'terminal-setup-menu');
  /** @param {import('../types/admin').Action} action */
  const setupAction = (action) => () => {
    setup.open = false;
    return action();
  };
  menu.append(
    actionButton('Download Wi-Fi QR PDF', setupAction(openWifi), 'secondary', 'down'),
    actionButton(
      'Download server QR PDF',
      setupAction(() => serverPdf(terminalId(card))),
      'secondary',
      'down',
    ),
  );
  setup.append(menu);
  tools.append(
    setup,
    actionButton('Console', () => openConsole(terminalId(card)), 'secondary', 'terminal'),
    actionButton(
      'Developer access',
      () => openDeveloperAccess(terminalId(card)),
      'secondary',
      'terminal',
    ),
  );
  footer.append(el('summary', 'Setup & maintenance'), tools);
  return footer;
}
/** @param {HTMLElement} card @param {string} id */
function buildAssociationForm(card, id) {
  // @llr LLR-SRV-UI-016
  const configurationVersion = state.model.configuration_version;
  const form = terminalForm(card, 'Account association', 'association');
  const serial = terminalUser(id).device_id;
  const row = el('div', null, 'terminal-association-row');
  const serialField = el('div', null, 'terminal-serial');
  serialField.append(el('span', 'Serial number'), el('code', serial));
  row.append(serialField);
  form.append(row);
  const choices = Object.keys(state.model.profiles).map((key) => [
    key,
    `${state.model.users[key].name} (${key})`,
  ]);
  row.append(terminalSelect(form, 'Associated account', 'accountId', choices, id));
  const change = el('button', 'Change association', 'secondary');
  change.type = 'submit';
  change.disabled = true;
  form.fields.accountId.onchange = () => {
    change.disabled = form.fields.accountId.value === id;
  };
  row.append(change);
  form.onsubmit = (event) => {
    event.preventDefault();
    const next = form.fields.accountId.value;
    if (next === id) return;
    confirm(
      'Change terminal account?',
      `Associate serial ${serial} with ${state.model.users[next].name} (${next})? The two terminals exchange account associations. Device settings remain with each serial. End any calls first.`,
      async () => {
        await api('/api/terminal-association', 'PUT', {
          serial_number: serial,
          account_id: next,
          configuration_version: configurationVersion,
        });
        state.terminalCards.clear();
        state.terminalId = next;
        await state.refresh(true);
        notice('Account association changed. Connected terminals update automatically.');
      },
      'Change association',
    );
  };
  return form;
}
/** @param {string} id @param {string} [openSection] */
export function buildTerminalCard(id, openSection = 'device-details') {
  const u = state.model.users[id],
    card = panel(u.name, `sip:${id}@${state.model.host}`);
  card.classList.add('terminal-card');
  card.dataset.terminalId = id;
  query(card, '.panel-heading p').classList.add('terminal-address');
  const details = terminalSection(
    card,
    'device-details',
    'Device details',
    'Connection · hardware · account',
  );
  details.append(
    el('div', null, 'terminal-summary'),
    buildAssociationForm(card, id),
    buildTerminalTools(card),
  );
  card.append(el('div', null, 'terminal-quick-status'), details, buildDevicesForm(card, id));
  for (const section of card.querySelectorAll('details.terminal-section'))
    if (section instanceof HTMLDetailsElement)
      section.open = section.dataset.section === openSection;
  terminalCardState(card, id);
  return card;
}
// @llr LLR-SRV-UI-017
export function renderTerminals() {
  $('page-actions').replaceChildren();
  const ids = Object.keys(state.model.profiles);
  if (!ids.length) {
    state.terminalCards.clear();
    setView(
      empty(
        'Add your first terminal',
        'Create an account with type Terminal to configure its devices and settings.',
        link('Go to accounts', '/accounts', 'primary'),
      ),
    );
    return;
  }
  for (const id of state.terminalCards.keys())
    if (!ids.includes(id)) state.terminalCards.delete(id);
  if (!ids.includes(state.terminalId))
    state.terminalId = ids.includes(state.model.local_terminal_id || '')
      ? state.model.local_terminal_id || ids[0]
      : ids[0];
  const chooser = el('label', 'Terminal', 'terminal-dropdown'),
    select = el('select');
  select.setAttribute('aria-label', 'Select terminal');
  for (const id of ids) {
    const option = el('option', `${state.model.users[id].name} (${id})`);
    option.value = id;
    select.append(option);
  }
  select.value = state.terminalId;
  select.onchange = () => {
    state.terminalId = select.value;
    renderTerminals();
  };
  chooser.append(select);
  let card = state.terminalCards.get(state.terminalId);
  if (!card || card.dataset.dirty !== 'true') {
    const openSection = card
      ?.querySelector('.terminal-section[open]')
      ?.getAttribute('data-section');
    card = buildTerminalCard(state.terminalId, card ? (openSection ?? '') : undefined);
    state.terminalCards.set(state.terminalId, card);
  }
  terminalCardState(card, state.terminalId);
  // Reuse dirty cards so switching terminals or saving another form preserves drafts.
  card.querySelector('.terminal-dropdown')?.remove();
  query(card, '.panel-heading').append(chooser);
  setView(card);
}

/** @param {HTMLElement} card @returns {string} */
function terminalId(card) {
  const id = card.dataset.terminalId;
  if (!id) throw Error('Terminal card has no account identity.');
  return id;
}
