import express from 'express';
import { metricsCollector } from '../utils/metrics';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

// Получение текущих метрик (защищенный маршрут)
router.get('/metrics', authMiddleware, (_req, res) => {
  res.json(metricsCollector.getMetrics());
});

// Проверка здоровья системы (публичный маршрут)
router.get('/health', (_req, res) => {
  const metrics = metricsCollector.getMetrics();
  const status = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      websocket: {
        status: metrics.connections.current >= 0 ? 'OK' : 'ERROR',
        activeConnections: metrics.connections.current
      },
      search: {
        status: metrics.searches.active >= 0 ? 'OK' : 'ERROR',
        activeSearches: metrics.searches.active
      }
    },
    performance: {
      messageLatency: `${metrics.latency.avg.toFixed(2)}ms`,
      messagesPerMinute: Math.round(metrics.messages.perMinute)
    },
    errors: {
      count: metrics.errors.count,
      lastError: metrics.errors.lastError?.message
    }
  };

  const isHealthy = 
    status.services.websocket.status === 'OK' && 
    status.services.search.status === 'OK';

  res.status(isHealthy ? 200 : 503).json(status);
});

export { router as monitoringRouter }; 