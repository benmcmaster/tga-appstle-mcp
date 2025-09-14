type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  tool?: string;
  customerId?: number;
  contractId?: number;
  billingAttemptId?: number;
  duration?: number;
  statusCode?: number;
  [key: string]: unknown;
}

class Logger {
  private maskSensitiveData(data: unknown): unknown {
    if (typeof data === 'string') {
      // Mask email addresses
      let maskedData = data.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_MASKED]');
      
      // Mask API keys (assuming they start with known prefixes or are long strings)
      maskedData = maskedData.replace(/\b[A-Za-z0-9]{32,}\b/g, '[API_KEY_MASKED]');
      
      // Mask credit card numbers (basic pattern)
      maskedData = maskedData.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_MASKED]');
      
      return maskedData;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.maskSensitiveData(item));
    }
    
    if (data && typeof data === 'object') {
      const masked: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        // Mask specific sensitive fields
        if (['email', 'password', 'apiKey', 'api_key', 'token', 'authorization'].some(field => 
          key.toLowerCase().includes(field.toLowerCase())
        )) {
          masked[key] = '[MASKED]';
        } else {
          masked[key] = this.maskSensitiveData(value);
        }
      }
      return masked;
    }
    
    return data;
  }

  private maskIdentifiers(context: LogContext): LogContext {
    const masked = { ...context };
    
    // Show only last 4 digits of numeric IDs when helpful for debugging
    if (masked.customerId && masked.customerId > 9999) {
      masked.customerId = parseInt(`****${String(masked.customerId).slice(-4)}`);
    }
    
    if (masked.contractId && masked.contractId > 9999) {
      masked.contractId = parseInt(`****${String(masked.contractId).slice(-4)}`);
    }
    
    return masked;
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const maskedContext = context ? this.maskIdentifiers(this.maskSensitiveData(context) as LogContext) : {};
    
    return JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      message: this.maskSensitiveData(message),
      ...maskedContext,
    });
  }

  debug(message: string, context?: LogContext): void {
    console.debug(this.formatMessage('debug', message, context));
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, context?: LogContext): void {
    console.error(this.formatMessage('error', message, context));
  }

  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const logger = new Logger();
export type { LogLevel, LogContext };