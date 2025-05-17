import express from 'express';
import { SearchService } from '../services/SearchService';

export const router = express.Router();

/**
 * @swagger
 * /api/search/stats:
 *   get:
 *     tags: [Поиск]
 *     summary: Получение статистики поиска
 *     description: Возвращает количество пользователей в поиске и статистику по полу
 *     responses:
 *       200:
 *         description: Статистика поиска
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSearching:
 *                   type: number
 *                   description: Общее количество пользователей в поиске
 *                 genderStats:
 *                   type: object
 *                   properties:
 *                     male:
 *                       type: number
 *                       description: Количество мужчин в поиске
 *                     female:
 *                       type: number
 *                       description: Количество женщин в поиске
 */
router.get('/stats', async (_req, res) => {
  try {
    const stats = await SearchService.getSearchStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении статистики поиска' });
  }
}); 