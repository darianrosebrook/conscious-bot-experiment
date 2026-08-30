/**
 * Minimal browser-safe EventEmitter shim.
 *
 * The custom viewer is bundled for the browser by Vite, where Node's `events`
 * builtin is externalized to an empty `__vite-browser-external` stub (no
 * `EventEmitter` export). This shim supplies the subset of the EventEmitter API
 * the viewer renderer actually uses, so `import { EventEmitter } from 'events'`
 * resolves in the browser bundle without pulling in the Node module.
 */

export class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, listener) {
    return this.addListener(event, listener);
  }

  addListener(event, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function');
    }
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  once(event, listener) {
    const wrapped = (...args) => {
      this.removeListener(event, wrapped);
      listener(...args);
    };
    wrapped.listener = listener;
    return this.on(event, wrapped);
  }

  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return false;
    for (const listener of [...set]) {
      listener(...args);
    }
    return true;
  }

  removeListener(event, listener) {
    const set = this._listeners.get(event);
    if (!set) return this;
    set.delete(listener);
    if (set.size === 0) this._listeners.delete(event);
    return this;
  }

  off(event, listener) {
    return this.removeListener(event, listener);
  }

  removeAllListeners(event) {
    if (event === undefined) {
      this._listeners.clear();
    } else {
      this._listeners.delete(event);
    }
    return this;
  }

  listeners(event) {
    const set = this._listeners.get(event);
    return set ? [...set] : [];
  }

  listenerCount(event) {
    const set = this._listeners.get(event);
    return set ? set.size : 0;
  }
}

export default EventEmitter;
