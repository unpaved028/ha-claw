import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { dashboardHtml } from '../src/web/dashboard.js';

/**
 * The dashboard is one classic script. Status is the first screen, so
 * activateStatusSection('health') runs while the script is still evaluating.
 * A `let` used by that call must already be initialized, or the throw aborts
 * everything after it: Settings clicks never bind, and Care, Tasks and Logs
 * stay on their placeholders.
 */
describe('dashboard boot', () => {
  it('finishes initializing and can open Settings sections', async () => {
    const html = dashboardHtml('');
    const start = html.lastIndexOf('<script>');
    const end = html.lastIndexOf('</script>');
    const code = html.slice(start + '<script>'.length, end);

    const elements = new Map<string, ReturnType<typeof makeEl>>();
    function makeEl(id: string) {
      const classes = new Set<string>(id === 'page-status' ? ['active'] : []);
      const node = {
        id,
        dataset: {} as Record<string, string>,
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
          contains: (c: string) => classes.has(c),
        },
        style: {} as Record<string, string>,
        textContent: '',
        innerHTML: '',
        hidden: false,
        value: '',
        disabled: false,
        title: '',
        placeholder: '',
        _listeners: {} as Record<string, () => void>,
        addEventListener(type: string, fn: () => void) {
          node._listeners[type] = fn;
        },
        appendChild() {},
        remove() {},
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
        setAttribute() {},
        getAttribute() {
          return null;
        },
        replaceChildren() {},
        focus() {},
        click() {
          node._listeners['click']?.();
        },
      };
      return node;
    }
    function byId(id: string) {
      let node = elements.get(id);
      if (!node) {
        node = makeEl(id);
        elements.set(id, node);
      }
      return node;
    }

    const settingsNav = ['model', 'tools', 'notify', 'profile'].map(name => {
      const btn = makeEl('nav-' + name);
      btn.dataset['settings'] = name;
      return btn;
    });

    const document = {
      getElementById: byId,
      querySelectorAll(sel: string) {
        if (sel === '#page-settings .settings-nav-item') return settingsNav;
        if (sel === '#page-settings .settings-section') {
          return ['model', 'tools', 'notify', 'profile'].map(name => byId('settings-' + name));
        }
        return [];
      },
      querySelector() {
        return byId('q');
      },
      documentElement: {
        setAttribute() {},
        getAttribute() {
          return 'dark';
        },
        lang: 'de',
        style: {},
      },
      addEventListener() {},
      createElement: () => makeEl('created'),
      head: { appendChild() {} },
      body: { appendChild() {} },
    };

    class SpeechRecognition {
      lang = '';
      start() {}
      stop() {}
    }

    const sandbox: Record<string, unknown> = {
      document,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
      matchMedia: () => ({ matches: false }),
      SpeechRecognition,
      webkitSpeechRecognition: SpeechRecognition,
      fetch: async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => {
          if (String(url).endsWith('/api/logs')) {
            return {
              entries: [
                { ts: '2026-10-01T00:00:00.000Z', level: 'info', component: 'web', msg: 'up' },
              ],
              uptime: 10,
              memory: { heapMB: 1 },
            };
          }
          if (String(url).endsWith('/api/backlog')) return { tasks: [] };
          if (String(url).endsWith('/api/system-health')) return { checking: false, health: null };
          return {
            checking: false,
            health: null,
            version: '1.5.0',
            language: 'de',
            profile: { botName: 'HA-Claw', userName: '' },
            model: 'openrouter/test',
            tools: [],
            availableModels: ['openrouter/test'],
            uptime: 1,
            memory: { heapMB: 1 },
            gaps: [],
            issues: [],
            proposals: [],
            rows: [],
            text: '',
          };
        },
      }),
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      navigator: {},
      location: { href: 'http://127.0.0.1/' },
      parent: null,
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
      EventSource: function EventSource() {},
      URL,
      Blob,
    };
    sandbox['window'] = sandbox;
    sandbox['globalThis'] = sandbox;
    vm.createContext(sandbox);
    assert.doesNotThrow(() => vm.runInContext(code, sandbox, { filename: 'dashboard.js' }));

    settingsNav[1]?.click();
    assert.equal(byId('settings-tools').classList.contains('active'), true);
    assert.equal(byId('settings-model').classList.contains('active'), false);

    await new Promise(resolve => setTimeout(resolve, 0));
    assert.doesNotMatch(byId('health-list').innerHTML, /health\.unavailable|nicht abrufbar/);
  });
});
