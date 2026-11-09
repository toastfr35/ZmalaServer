// @ts-check
'use strict';
const { own } = require('./validation');

/** Revision-bound directory data shared by phone and terminal configuration.
 * Live presence and callbacks belong to response enrichment, never this cache. */
class ContactDirectory {
  /** @param {() => import('./types/contracts').ServerState} readState */
  constructor(readState) {
    this.readState = readState;
    this.viewVersion = -1;
    this.collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
    /** @type {Map<string, Set<string>>} */
    this.permissions = new Map();
    /** @type {Map<string, ReturnType<ContactDirectory['buildContacts']>>} */
    this.contactViews = new Map();
    /** @type {string[] | null} */
    this.accountOrder = null;
  }
  // @llr LLR-SRV-DIR-030
  /** @param {unknown} from @param {unknown} to */
  permitted(from, to) {
    const v = this.readState();
    return (
      typeof from === 'string' &&
      typeof to === 'string' &&
      from !== to &&
      own(v.users, from) &&
      own(v.users, to) &&
      this.derivedPermissions().get(from)?.has(to) === true
    );
  }
  // @llr LLR-SRV-DIR-032
  derivedPermissions() {
    const state = this.readState();
    if (this.viewVersion !== state.configuration_version) {
      this.permissions.clear();
      this.contactViews.clear();
      this.accountOrder = null;
      for (const group of Object.values(state.groups))
        for (const from of group.members) {
          const peers = this.permissions.get(from) || new Set();
          for (const to of group.members) if (from !== to) peers.add(to);
          this.permissions.set(from, peers);
        }
      this.viewVersion = state.configuration_version;
    }
    return this.permissions;
  }
  // @llr LLR-SRV-DIR-032
  /** @param {string} id */
  contacts(id) {
    this.derivedPermissions();
    const contacts = this.contactViews.get(id) || this.buildContacts(id);
    this.contactViews.set(id, contacts);
    // Callers add live fields; never let them modify the shared stable view.
    return contacts.map((contact) => ({ ...contact }));
  }
  // @llr LLR-SRV-DIR-031
  /** @param {string} id */
  buildContacts(id) {
    this.derivedPermissions();
    const v = this.readState(),
      collator = this.collator;
    // Every device uses the same ordering. Sort once per revision, then omit
    // the caller and derive its permission flags without sorting again.
    const ordered = (this.accountOrder ||= Object.keys(v.users).sort(
      (a, b) => collator.compare(v.users[a].name, v.users[b].name) || a.localeCompare(b),
    ));
    return ordered
      .filter((key) => key !== id)
      .map((key) => {
        const u = v.users[key],
          incoming = this.permitted(key, id);
        // Retain the derived field for terminals already running the previous client.
        return {
          id: key,
          name: u.name,
          photo: u.photo || '',
          can_call: this.permitted(id, key),
          can_receive: incoming,
          auto_answer:
            incoming && v.users[id]?.type === 'terminal' && v.users[id].auto_answer === true,
        };
      });
  }
}
module.exports = { ContactDirectory };
