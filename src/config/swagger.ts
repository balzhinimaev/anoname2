/**
 * Конфигурация Swagger/OpenAPI документации
 * @module config/swagger
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API анонимного чата',
      version: '1.0.0',
      description: 'API для анонимного чат-приложения с функциями поиска собеседника и обмена сообщениями',
      contact: {
        name: 'API Support',
        url: 'https://github.com/yourusername/telegram-dating-api'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Локальный сервер разработки'
      },
      {
        url: process.env.PRODUCTION_URL || 'https://api.yourdomain.com',
        description: 'Продакшн сервер'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }],
    tags: [
      {
        name: 'Аутентификация',
        description: 'Эндпоинты для регистрации и управления сессиями'
      },
      {
        name: 'Пользователи',
        description: 'Операции с профилями пользователей'
      },
      {
        name: 'Чаты',
        description: 'Управление чатами и сообщениями'
      },
      {
        name: 'Поиск',
        description: 'Поиск собеседников'
      }
    ]
  },
  apis: ['./src/routes/*.ts', './src/models/*.ts'], // Пути к файлам с JSDoc комментариями
};

export const swaggerSpec = swaggerJsdoc(options); 