import winston from 'winston';
import path from 'path';

const logDir = 'logs';
const { combine, timestamp, printf, colorize } = winston.format;

// Формат для консоли
const consoleFormat = printf((info) => {
  const { level, message, timestamp, ...metadata } = info;
  const metaStr = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
  return `${timestamp || new Date().toISOString()} [${level}]: ${message} ${metaStr}`;
});

// Формат для файлов
const fileFormat = printf((info) => {
  const { level, message, timestamp, ...metadata } = info;
  return JSON.stringify({
    timestamp: timestamp || new Date().toISOString(),
    level,
    message,
    ...metadata
  });
});

// Создаем логгер
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    fileFormat
  ),
  transports: [
    // Логи ошибок
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Общие логи
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
    // Логи WebSocket
    new winston.transports.File({ 
      filename: path.join(logDir, 'websocket.log'),
      maxsize: 5242880,
      maxFiles: 5,
    })
  ]
});

// Добавляем вывод в консоль для разработки
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp(),
      consoleFormat
    )
  }));
}

// Функции-помощники для логирования WebSocket событий
export const wsLogger = {
  connection: (userId: string, socketId: string, metadata: Record<string, any> = {}) => {
    logger.info('WebSocket connection established', {
      type: 'ws_connection',
      userId,
      socketId,
      ...metadata
    });
  },

  disconnection: (userId: string, socketId: string, reason: string, metadata: Record<string, any> = {}) => {
    logger.info('WebSocket connection closed', {
      type: 'ws_disconnection',
      userId,
      socketId,
      reason,
      ...metadata
    });
  },

  event: (type: string, userId: string, socketId: string, metadata: Record<string, any> = {}) => {
    logger.debug('WebSocket event processed', {
      type: `ws_event_${type}`,
      userId,
      socketId,
      ...metadata
    });
  },

  error: (userId: string, socketId: string, error: Error, metadata: Record<string, any> = {}) => {
    logger.error('WebSocket error occurred', {
      type: 'ws_error',
      userId,
      socketId,
      ...metadata,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  },

  warn: (type: string, message: string, metadata: Record<string, any> = {}) => {
    logger.warn(message, {
      type: `ws_${type}`,
      ...metadata
    });
  },

  info: (type: string, message: string, metadata: Record<string, any> = {}) => {
    logger.info(message, {
      type: `ws_${type}`,
      ...metadata
    });
  }
};

export default logger; 