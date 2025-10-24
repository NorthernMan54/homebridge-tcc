const { createLogger, PluginLogger } = require('../src/lib/logger.js');

describe('PluginLogger', () => {
  const originalConsole = { ...console };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    console.log = jest.fn();
  });

  afterAll(() => {
    Object.assign(console, originalConsole);
  });

  test('logs with prefixes using base logger methods', () => {
    const calls = [];
    const baseLog = {
      info: (msg) => calls.push({ level: 'info', msg }),
      warn: (msg) => calls.push({ level: 'warn', msg }),
      error: (msg) => calls.push({ level: 'error', msg }),
      success: (msg) => calls.push({ level: 'success', msg }),
      debug: (msg) => calls.push({ level: 'debug', msg })
    };

    const logger = createLogger(baseLog, { prefix: ['Unit', 'Test'], debug: true });
    logger.info('hello %s', 'world');
    logger.warn('warn');
    logger.error('error %d', 42);
    logger.success('ok');
    logger.debug('debugging');

    expect(calls).toHaveLength(5);
    expect(calls[0]).toEqual({ level: 'info', msg: '[TCC | Unit | Test] hello world' });
    expect(calls[1].msg).toBe('[TCC | Unit | Test] warn');
    expect(calls[2].msg).toBe('[TCC | Unit | Test] error 42');
    expect(calls[3].msg).toBe('[TCC | Unit | Test] ok');
    expect(calls[4].msg).toBe('[TCC | Unit | Test] debugging');
  });

  test('child logger composes prefix and inherits debug setting', () => {
    const calls = [];
    const baseLog = {
      info: (msg) => calls.push(msg),
      debug: (msg) => calls.push(msg)
    };

    const parent = createLogger(baseLog, { prefix: 'Parent', debug: true });
    const child = parent.child(['Child', 'Leaf']);
    child.info('message');
    child.debug({ foo: 'bar' });

    expect(calls[0]).toBe('[TCC | Parent | Child | Leaf] message');
    expect(calls[1]).toMatch(/\[TCC \| Parent \| Child \| Leaf\] .*foo.*bar/);
  });

  test('debug output can be toggled on and off', () => {
    const calls = [];
    const baseLog = {
      info: (msg) => calls.push({ level: 'info', msg }),
      debug: (msg) => calls.push({ level: 'debug', msg })
    };

    const logger = createLogger(baseLog, { prefix: 'Toggle' });
    logger.debug('hidden');
    expect(calls).toHaveLength(0);

    logger.enableDebug();
    logger.debug('visible');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ level: 'debug', msg: '[TCC | Toggle] visible' });

    logger.disableDebug();
    logger.debug('hidden-again');
    expect(calls).toHaveLength(1);
  });

  test('falls back to console methods when base logger lacks level', () => {
    const logger = createLogger({}, { prefix: 'Console' });
    logger.warn('from console');
    expect(console.warn).toHaveBeenCalledWith('[TCC | Console] from console');

    logger.success('console log fallback');
    expect(console.log).toHaveBeenCalledWith('[TCC | Console] console log fallback');
  });

  test('supports functional base logger', () => {
    const calls = [];
    const base = (entry) => calls.push(entry);
    const logger = createLogger(base, { prefix: 'FnLogger' });
    logger.info('direct');
    expect(calls[0]).toBe('[TCC | FnLogger] direct');
  });

  test('respects injected debug logger', () => {
    const baseLog = { info: jest.fn() };
    const debugSpy = jest.fn();
    const logger = new PluginLogger(baseLog, { prefix: 'Injected', debugLogger: debugSpy });
    logger.debug('custom debug');
    expect(debugSpy).toHaveBeenCalledWith('custom debug');
  });

  test('debug falls back to info when base logger lacks debug method', () => {
    const calls = [];
    const baseLog = { info: (msg) => calls.push(msg) };
    const logger = createLogger(baseLog, { prefix: 'Fallback', debug: true });
    logger.debug('message');
    expect(calls[0]).toBe('[TCC | Fallback] message');
  });

  test('formats non-string messages and supports array prefixes', () => {
    const calls = [];
    const baseLog = {
      info: (msg) => calls.push(msg)
    };

    const logger = new PluginLogger(baseLog, { prefix: ['One', 'Two'], debug: true });
    logger.info({ foo: 'bar' }, 5);
    expect(calls[0]).toMatch(/\[TCC \| One \| Two\] .*foo.*5/);
  });

  test('defaults to top-level prefix when none provided', () => {
    const calls = [];
    const baseLog = {
      info: (msg) => calls.push(msg)
    };
    const logger = createLogger(baseLog, {});
    logger.info('default');
    expect(calls[0]).toBe('[TCC] default');
  });
});
