/**
 * Unified Diagnostics Logger Service for AutoAnki
 * Powers both browser DevTools console output and in-app Diagnostics & Logs Viewer.
 */

const MAX_BUFFER_SIZE = 300;
const STORAGE_KEY = 'autoanki_diagnostics_logs';

class DiagnosticsLogger {
  constructor() {
    this.buffer = [];
    this.subscribers = new Set();
    this.loadPersistedLogs();
  }

  loadPersistedLogs() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            this.buffer = parsed.slice(-MAX_BUFFER_SIZE);
          }
        }
      }
    } catch (e) {
      console.warn('[Logger] Could not load persisted logs:', e);
    }
  }

  persistLogs() {
    try {
      if (typeof localStorage !== 'undefined') {
        // Save latest 100 entries to avoid localStorage bloat
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.buffer.slice(-100)));
      }
    } catch (e) {
      // QuotaExceededError or security block
    }
  }

  notifySubscribers(entry) {
    this.subscribers.forEach(cb => {
      try {
        cb(entry, this.buffer);
      } catch (err) {
        console.warn('[Logger] Subscriber notification error:', err);
      }
    });
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.subscribers.add(callback);
      return () => this.subscribers.delete(callback);
    }
    return () => {};
  }

  addEntry(level, tag, message, data = null) {
    const timestamp = new Date().toISOString();
    const timeFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let safeData = null;
    if (data !== null && data !== undefined) {
      if (data instanceof Error) {
        safeData = {
          name: data.name,
          message: data.message,
          stack: data.stack
        };
      } else if (typeof data === 'object') {
        try {
          safeData = JSON.parse(JSON.stringify(data));
        } catch {
          safeData = String(data);
        }
      } else {
        safeData = data;
      }
    }

    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp,
      timeFormatted,
      level, // 'info', 'warn', 'error', 'sync', 'db', 'fsrs', 'init'
      tag,
      message,
      data: safeData
    };

    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }

    if (level === 'error' || this.buffer.length % 10 === 0) {
      this.persistLogs();
    }

    this.notifySubscribers(entry);
    return entry;
  }

  init(tag, message, data = null) {
    const formattedTag = `🚀 [INIT:${tag}]`;
    if (data !== null && data !== undefined) {
      console.log(formattedTag, message, data);
    } else {
      console.log(formattedTag, message);
    }
    return this.addEntry('init', tag, message, data);
  }

  db(tag, message, data = null) {
    const formattedTag = `💾 [LOCAL-DB:${tag}]`;
    if (data !== null && data !== undefined) {
      console.log(formattedTag, message, data);
    } else {
      console.log(formattedTag, message);
    }
    return this.addEntry('db', tag, message, data);
  }

  sync(tag, message, data = null) {
    const formattedTag = `🔄 [GDRIVE-SYNC:${tag}]`;
    if (data !== null && data !== undefined) {
      console.log(formattedTag, message, data);
    } else {
      console.log(formattedTag, message);
    }
    return this.addEntry('sync', tag, message, data);
  }

  fsrs(tag, message, data = null) {
    const formattedTag = `🧠 [FSRS:${tag}]`;
    if (data !== null && data !== undefined) {
      console.log(formattedTag, message, data);
    } else {
      console.log(formattedTag, message);
    }
    return this.addEntry('fsrs', tag, message, data);
  }

  info(tag, message, data = null) {
    const formattedTag = `ℹ️ [INFO:${tag}]`;
    if (data !== null && data !== undefined) {
      console.log(formattedTag, message, data);
    } else {
      console.log(formattedTag, message);
    }
    return this.addEntry('info', tag, message, data);
  }

  warn(tag, message, data = null) {
    const formattedTag = `⚠️ [WARN:${tag}]`;
    if (data !== null && data !== undefined) {
      console.warn(formattedTag, message, data);
    } else {
      console.warn(formattedTag, message);
    }
    return this.addEntry('warn', tag, message, data);
  }

  error(tag, message, data = null) {
    const formattedTag = `❌ [ERROR:${tag}]`;
    if (data !== null && data !== undefined) {
      console.error(formattedTag, message, data);
    } else {
      console.error(formattedTag, message);
    }
    return this.addEntry('error', tag, message, data);
  }

  anomaly(tag, message, data = null) {
    const formattedTag = `⚠️ [LOGIC-ANOMALY:${tag}]`;
    if (data !== null && data !== undefined) {
      console.warn(formattedTag, message, data);
    } else {
      console.warn(formattedTag, message);
    }
    return this.addEntry('anomaly', tag, message, data);
  }

  getLogs(filter = 'all') {
    if (!filter || filter === 'all') return [...this.buffer];
    if (filter === 'errors') return this.buffer.filter(l => l.level === 'error');
    if (filter === 'anomalies') return this.buffer.filter(l => l.level === 'anomaly');
    if (filter === 'sync') return this.buffer.filter(l => l.level === 'sync');
    if (filter === 'db') return this.buffer.filter(l => l.level === 'db');
    if (filter === 'fsrs') return this.buffer.filter(l => l.level === 'fsrs');
    return this.buffer.filter(l => l.level === filter || l.tag?.toLowerCase().includes(filter.toLowerCase()));
  }

  clearLogs() {
    this.buffer = [];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    this.notifySubscribers(null);
  }

  exportLogsAsText() {
    const header = `=== AutoAnki System Diagnostics Logs Export ===\nGenerated At: ${new Date().toISOString()}\nTotal Entries: ${this.buffer.length}\n================================================\n\n`;
    const lines = this.buffer.map(l => {
      const levelPad = (l.level || 'INFO').toUpperCase().padEnd(6);
      let line = `[${l.timestamp}] [${levelPad}] [${l.tag}] ${l.message}`;
      if (l.data) {
        line += `\n  Payload: ${JSON.stringify(l.data, null, 2).replace(/\n/g, '\n  ')}`;
      }
      return line;
    });
    return header + lines.join('\n\n');
  }
}

export const logger = new DiagnosticsLogger();
export default logger;
