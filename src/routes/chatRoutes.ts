import express from 'express';
import { body } from 'express-validator';
import * as chatController from '../controllers/chatController';
import { validateRequest } from '../middleware/validateRequest';

export const router = express.Router();

// Создание нового чата
router.post(
  '/',
  [
    body('participants').isArray().withMessage('Participants должен быть массивом'),
    body('participants.*').isMongoId().withMessage('Неверный ID участника'),
  ],
  validateRequest as express.RequestHandler,
  chatController.createChat as express.RequestHandler
);

// Получение чатов пользователя
router.get('/user/:userId', chatController.getUserChats as express.RequestHandler);

// Получение сообщений чата
router.get('/:chatId/messages', chatController.getChatMessages as express.RequestHandler);

// Отправка сообщения
router.post(
  '/:chatId/messages',
  [
    body('content').notEmpty().withMessage('Сообщение не может быть пустым'),
    body('sender').isMongoId().withMessage('Неверный ID отправителя'),
  ],
  validateRequest as express.RequestHandler,
  chatController.sendMessage as express.RequestHandler
);

// Отметить сообщения как прочитанные
router.put('/:chatId/messages/read', chatController.markMessagesAsRead as express.RequestHandler);

// Деактивация чата
router.delete('/:chatId', chatController.deactivateChat as express.RequestHandler); 