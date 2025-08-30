/**
 * Comprehensive logging system for Guild Tycoon
 * Provides structured logging with different levels and error tracking
 */

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN', 
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: {
    guildId?: string;
    userId?: string;
    tier?: number;
    action?: string;
    error?: Error;
    metadata?: Record<string, any>;
  };
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  private formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  private createLogEntry(level: LogLevel, message: string, context?: LogEntry['context']): LogEntry {
    return {
      level,
      message,
      timestamp: Date.now(),
      context
    };
  }

  private writeLog(entry: LogEntry): void {
    const contextStr = entry.context ? 
      ` [${Object.entries(entry.context)
        .filter(([_, v]) => v !== undefined && !(v instanceof Error))
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}]` : '';

    const errorStr = entry.context?.error ? ` Error: ${entry.context.error.message}` : '';
    
    console.log(`[${this.formatTimestamp(entry.timestamp)}] [${entry.level}] ${entry.message}${contextStr}${errorStr}`);
    
    // Store in memory (with rotation)
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  error(message: string, context?: LogEntry['context']): void {
    this.writeLog(this.createLogEntry(LogLevel.ERROR, message, context));
  }

  warn(message: string, context?: LogEntry['context']): void {
    this.writeLog(this.createLogEntry(LogLevel.WARN, message, context));
  }

  info(message: string, context?: LogEntry['context']): void {
    this.writeLog(this.createLogEntry(LogLevel.INFO, message, context));
  }

  debug(message: string, context?: LogEntry['context']): void {
    const nodeEnv = typeof process !== 'undefined' ? process.env.NODE_ENV : undefined;
    const debugLog = typeof process !== 'undefined' ? process.env.GT_DEBUG_LOG : undefined;
    if (nodeEnv === 'development' || debugLog === 'true') {
      this.writeLog(this.createLogEntry(LogLevel.DEBUG, message, context));
    }
  }

  // Specialized logging methods for common game events
  gameAction(action: string, guildId: string, userId: string, tier: number, success: boolean, metadata?: Record<string, any>): void {
    this.info(`Game action ${success ? 'completed' : 'failed'}: ${action}`, {
      guildId,
      userId,
      tier,
      action,
      metadata
    });
  }

  databaseError(operation: string, error: Error, context?: { guildId?: string; userId?: string }): void {
    this.error(`Database operation failed: ${operation}`, {
      ...context,
      error,
      metadata: { operation }
    });
  }

  delayedActionSkipped(userId: string, reason: string, context?: { guildId?: string; tier?: number }): void {
    this.warn(`Delayed action skipped for user ${userId}: ${reason}`, {
      ...context,
      userId,
      metadata: { reason }
    });
  }

  discordError(operation: string, error: Error, context?: { guildId?: string; userId?: string }): void {
    this.error(`Discord operation failed: ${operation}`, {
      ...context,
      error,
      metadata: { operation }
    });
  }

  performanceWarning(operation: string, duration: number, threshold: number = 1000): void {
    if (duration > threshold) {
      this.warn(`Slow operation detected: ${operation} took ${duration}ms`, {
        metadata: { operation, duration, threshold }
      });
    }
  }

  // Get recent logs for debugging
  getRecentLogs(level?: LogLevel, limit: number = 100): LogEntry[] {
    let filtered = this.logs;
    if (level) {
      filtered = this.logs.filter(log => log.level === level);
    }
    return filtered.slice(-limit);
  }

  // Clear old logs
  clearLogs(): void {
    this.logs = [];
  }
}

// Global logger instance
export const logger = new Logger();

// Convenience functions for different log levels
export const logError = (message: string, context?: LogEntry['context']) => logger.error(message, context);
export const logWarn = (message: string, context?: LogEntry['context']) => logger.warn(message, context);
export const logInfo = (message: string, context?: LogEntry['context']) => logger.info(message, context);
export const logDebug = (message: string, context?: LogEntry['context']) => logger.debug(message, context);

// Performance monitoring decorator
export function logPerformance<T extends (...args: any[]) => any>(
  fn: T,
  operationName: string,
  threshold: number = 1000
): T {
  return ((...args: any[]) => {
    const start = Date.now();
    try {
      const result = fn(...args);
      const duration = Date.now() - start;
      logger.performanceWarning(operationName, duration, threshold);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Operation ${operationName} failed after ${duration}ms`, {
        error: error as Error,
        metadata: { operationName, duration }
      });
      throw error;
    }
  }) as T;
}
