'use strict';

const util = require('util');
const createDebug = require('debug');

class PluginLogger {
  constructor(baseLog, options = {}) {
    this.baseLog = baseLog || console;
    this.prefixParts = Array.isArray(options.prefix)
      ? options.prefix.slice()
      : options.prefix
        ? [options.prefix]
        : [];
    this.debugEnabled = !!options.debug;

    const namespace = options.namespace || 'tcc';
    if (options.debugLogger) {
      this.debugLogger = options.debugLogger;
    } else {
      const fullNamespace = this.prefixParts.length
        ? `${namespace}:${this.prefixParts.join(':')}`
        : namespace;
      this.debugLogger = createDebug(fullNamespace);
    }

    if (this.debugEnabled) {
      this.enableDebug();
    }
  }

  enableDebug() {
    this.debugEnabled = true;
    if (this.debugLogger && !this.debugLogger.enabled) {
      this.debugLogger.enabled = true;
    }
  }

  disableDebug() {
    this.debugEnabled = false;
  }

  child(prefix, options = {}) {
    const childPrefix = Array.isArray(prefix)
      ? prefix
      : prefix !== undefined && prefix !== null
        ? [prefix]
        : [];
    const combinedPrefix = this.prefixParts.concat(childPrefix);
    const debugLogger = this.debugLogger
      ? this.debugLogger.extend(childPrefix.length ? childPrefix.join(':') : 'child')
      : undefined;

    return new PluginLogger(this.baseLog, {
      prefix: combinedPrefix,
      debug: options.debug ?? this.debugEnabled,
      namespace: options.namespace,
      debugLogger
    });
  }

  buildPrefix() {
    const parts = ['TCC'].concat(this.prefixParts);
    return `[${parts.join(' | ')}]`;
  }

  format(message, args) {
    if (typeof message === 'string') {
      return args.length ? util.format(message, ...args) : message;
    }

    const values = [message].concat(args);
    return values
      .map((value) =>
        typeof value === 'string'
          ? value
          : util.inspect(value, { depth: 3, colors: false })
      )
      .join(' ');
  }

  resolveMethod(level) {
    if (this.baseLog && typeof this.baseLog[level] === 'function') {
      return this.baseLog[level].bind(this.baseLog);
    }
    if (typeof this.baseLog === 'function') {
      return this.baseLog;
    }
    if (console && typeof console[level] === 'function') {
      return console[level].bind(console);
    }
    return console.log.bind(console);
  }

  logWithLevel(level, message, args) {
    const formatted = this.format(message, args);
    const entry = `${this.buildPrefix()} ${formatted}`;
    const method = this.resolveMethod(level);
    method(entry);
  }

  info(message, ...args) {
    this.logWithLevel('info', message, args);
  }

  warn(message, ...args) {
    this.logWithLevel('warn', message, args);
  }

  error(message, ...args) {
    this.logWithLevel('error', message, args);
  }

  success(message, ...args) {
    this.logWithLevel('success', message, args);
  }

  debug(message, ...args) {
    if (this.debugLogger) {
      this.debugLogger(this.format(message, args));
    }
    if (this.debugEnabled) {
      const level = this.baseLog && typeof this.baseLog.debug === 'function' ? 'debug' : 'info';
      this.logWithLevel(level, message, args);
    }
  }
}

function createLogger(baseLog, options = {}) {
  return new PluginLogger(baseLog, options);
}

module.exports = {
  PluginLogger,
  createLogger
};

