import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { router as userRouter } from './routes/userRoutes';
import { router as chatRouter } from './routes/chatRoutes';
import { router as authRouter } from './routes/authRoutes';
import { monitoringRouter } from './routes/monitoringRoutes';
import { authMiddleware } from './middleware/authMiddleware';
import mongoose from 'mongoose';
import config from './config';
import { WebSocketManager } from './websocket/WebSocketManager';
import Token from './models/Token';
import logger from './utils/logger';
import { metricsCollector } from './utils/metrics';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3001',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Инициализация WebSocket
export const wsManager = new WebSocketManager(httpServer);

// Публичные маршруты (не требуют аутентификации)
app.use('/api/auth', authRouter);
app.use('/api/monitoring', monitoringRouter);
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Защищенные маршруты (требуют аутентификации)
app.use('/api/users', authMiddleware, userRouter);
app.use('/api/chats', authMiddleware, chatRouter);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Необработанная ошибка:', {
    error: {
      message: err.message,
      stack: err.stack
    }
  });
  metricsCollector.errorOccurred(err);
  res.status(500).json({ error: 'Что-то пошло не так!' });
});

// Автоматическая очистка токенов каждые 24 часа
const setupTokenCleanup = () => {
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 часа
  setInterval(async () => {
    try {
      const deletedCount = await Token.cleanupExpiredTokens();
      logger.info(`[Токены] Удалено ${deletedCount} устаревших токенов`);
    } catch (error) {
      logger.error('[Токены] Ошибка при очистке:', error);
      if (error instanceof Error) {
        metricsCollector.errorOccurred(error);
      }
    }
  }, CLEANUP_INTERVAL);
};

// Start server
const startServer = async () => {
  try {
    // Подключение к MongoDB
    await mongoose.connect(config.mongoUri, {
      dbName: "anoname"
    });
    logger.info('Connected to MongoDB');
    
    // Запуск очистки токенов
    setupTokenCleanup();
    
    // Запуск сервера
    httpServer.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
    });
  } catch (error) {
    logger.error('Ошибка при запуске сервера:', error);
    if (error instanceof Error) {
      metricsCollector.errorOccurred(error);
    }
    process.exit(1);
  }
};

startServer(); 