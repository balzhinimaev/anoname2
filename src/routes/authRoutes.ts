import express from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController';
import { validateRequest } from '../middleware/validateRequest';
import { authMiddleware } from '../middleware/authMiddleware';

export const router = express.Router();

// Регистрация пользователя
router.post(
  '/register',
  [
    body('telegramId').isNumeric().withMessage('Неверный формат Telegram ID'),
    body('username').optional(),
    body('firstName').optional(),
    body('lastName').optional(),
    body('bio').optional(),
    body('gender').optional().isIn(['male', 'female', 'other']),
    body('age').optional().isInt({ min: 18 }),
  ],
  validateRequest as express.RequestHandler,
  authController.register as express.RequestHandler
);

// Аутентификация пользователя
router.post(
  '/login',
  [
    body('telegramId').isNumeric().withMessage('Неверный формат Telegram ID'),
  ],
  validateRequest as express.RequestHandler,
  authController.login as express.RequestHandler
);

// Выход из системы (требует аутентификации)
router.post(
  '/logout',
  authMiddleware as express.RequestHandler,
  authController.logout as express.RequestHandler
);

// Выход из всех сессий (требует аутентификации)
router.post(
  '/logout-all',
  authMiddleware as express.RequestHandler,
  authController.logoutAll as express.RequestHandler
); 