/**
 * Маршруты для управления пользователями
 * @module routes/users
 */

import express from 'express';
import { body } from 'express-validator';
import * as userController from '../controllers/userController';
import { validateRequest } from '../middleware/validateRequest';

export const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     UserPreferences:
 *       type: object
 *       properties:
 *         gender:
 *           type: string
 *           enum: [male, female, any]
 *           description: Предпочитаемый пол для поиска
 *         ageRange:
 *           type: object
 *           properties:
 *             min:
 *               type: integer
 *               minimum: 18
 *               description: Минимальный возраст
 *             max:
 *               type: integer
 *               maximum: 100
 *               description: Максимальный возраст
 *     PhotoResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Уникальный идентификатор фотографии
 *         url:
 *           type: string
 *           description: URL фотографии
 *         uploadedAt:
 *           type: string
 *           format: date-time
 *           description: Время загрузки фотографии
 */

/**
 * @swagger
 * /api/users:
 *   post:
 *     tags: [Пользователи]
 *     summary: Создание или обновление пользователя
 *     description: Создает нового пользователя или обновляет существующего
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       200:
 *         description: Пользователь успешно создан/обновлен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Ошибка валидации данных
 *       401:
 *         description: Не авторизован
 */
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

/**
 * @swagger
 * /api/users/{telegramId}:
 *   get:
 *     tags: [Пользователи]
 *     summary: Получение профиля пользователя
 *     description: Возвращает профиль пользователя по его Telegram ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: number
 *         description: Telegram ID пользователя
 *     responses:
 *       200:
 *         description: Профиль пользователя
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: Пользователь не найден
 *       401:
 *         description: Не авторизован
 */
router.get('/:telegramId', userController.getUser as express.RequestHandler);

/**
 * @swagger
 * /api/users/{telegramId}/matches:
 *   get:
 *     tags: [Пользователи]
 *     summary: Получение потенциальных партнеров
 *     description: Возвращает список потенциальных партнеров согласно предпочтениям пользователя
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: number
 *         description: Telegram ID пользователя
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Количество результатов на странице
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Номер страницы
 *     responses:
 *       200:
 *         description: Список потенциальных партнеров
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 total:
 *                   type: integer
 *                   description: Общее количество найденных пользователей
 *                 pages:
 *                   type: integer
 *                   description: Общее количество страниц
 *       401:
 *         description: Не авторизован
 */
router.get('/:telegramId/matches', userController.getPotentialMatches as express.RequestHandler);

/**
 * @swagger
 * /api/users/{telegramId}/preferences:
 *   put:
 *     tags: [Пользователи]
 *     summary: Обновление предпочтений пользователя
 *     description: Обновляет предпочтения пользователя для поиска партнеров
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: number
 *         description: Telegram ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserPreferences'
 *     responses:
 *       200:
 *         description: Предпочтения успешно обновлены
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Ошибка валидации данных
 *       401:
 *         description: Не авторизован
 *       404:
 *         description: Пользователь не найден
 */
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

/**
 * @swagger
 * /api/users/{telegramId}/photos:
 *   post:
 *     tags: [Пользователи]
 *     summary: Загрузка фотографий
 *     description: Загружает новые фотографии в профиль пользователя
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: number
 *         description: Telegram ID пользователя
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Файлы фотографий (максимум 5)
 *     responses:
 *       200:
 *         description: Фотографии успешно загружены
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PhotoResponse'
 *       400:
 *         description: Ошибка валидации или превышен лимит фотографий
 *       401:
 *         description: Не авторизован
 *       413:
 *         description: Размер файла превышает лимит
 */
router.post('/:telegramId/photos', userController.uploadPhotos as express.RequestHandler);

/**
 * @swagger
 * /api/users/{telegramId}/photos/{photoId}:
 *   delete:
 *     tags: [Пользователи]
 *     summary: Удаление фотографии
 *     description: Удаляет фотографию из профиля пользователя
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: number
 *         description: Telegram ID пользователя
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID фотографии
 *     responses:
 *       200:
 *         description: Фотография успешно удалена
 *       401:
 *         description: Не авторизован
 *       404:
 *         description: Фотография не найдена
 */
router.delete('/:telegramId/photos/:photoId', userController.deletePhoto as express.RequestHandler); 