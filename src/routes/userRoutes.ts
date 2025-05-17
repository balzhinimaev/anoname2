import express from 'express';
import { body } from 'express-validator';
import * as userController from '../controllers/userController';
import { validateRequest } from '../middleware/validateRequest';

export const router = express.Router();

// Регистрация/обновление пользователя
router.post(
  '/',
  [
    body('telegramId').isNumeric(),
    body('username').optional(),
    body('firstName').optional(),
    body('lastName').optional(),
    body('bio').optional(),
    body('gender').optional().isIn(['male', 'female', 'other']),
    body('age').optional().isInt({ min: 18 }),
  ],
  validateRequest as express.RequestHandler,
  userController.createOrUpdateUser as express.RequestHandler
);

// Получение профиля пользователя
router.get('/:telegramId', userController.getUser as express.RequestHandler);

// Получение потенциальных партнеров
router.get('/:telegramId/matches', userController.getPotentialMatches as express.RequestHandler);

// Обновление предпочтений
router.put(
  '/:telegramId/preferences',
  [
    body('gender').optional().isIn(['male', 'female', 'any']),
    body('ageRange.min').optional().isInt({ min: 18 }),
    body('ageRange.max').optional().isInt({ max: 100 }),
  ],
  validateRequest as express.RequestHandler,
  userController.updatePreferences as express.RequestHandler
);

// Загрузка фотографий
router.post('/:telegramId/photos', userController.uploadPhotos as express.RequestHandler);

// Удаление фотографии
router.delete('/:telegramId/photos/:photoId', userController.deletePhoto as express.RequestHandler); 