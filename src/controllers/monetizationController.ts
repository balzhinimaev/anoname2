/**
 * Контроллер монетизации
 * @module controllers/monetizationController
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { MonetizationService, SUBSCRIPTION_TIERS, PURCHASE_ITEMS } from '../services/MonetizationService';

/**
 * Получить статус пользователя (подписка, валюта, лимиты)
 */
export const getUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.token;
    if (!token) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const decoded = jwt.decode(token) as { userId: string };
    const userId = decoded?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'Некорректный токен' });
      return;
    }

    const status = await MonetizationService.getUserStatus(userId);
    if (!status) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Ошибка получения статуса пользователя:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Получить доступные тарифы подписок
 */
export const getSubscriptionTiers = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      data: SUBSCRIPTION_TIERS
    });
  } catch (error) {
    console.error('Ошибка получения тарифов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Получить доступные товары для покупки
 */
export const getPurchaseItems = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      data: PURCHASE_ITEMS
    });
  } catch (error) {
    console.error('Ошибка получения товаров:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Совершить покупку
 */
export const makePurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.token;
    if (!token) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const decoded = jwt.decode(token) as { userId: string };
    const userId = decoded?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'Некорректный токен' });
      return;
    }

    const { itemKey, paymentData } = req.body;
    
    if (!itemKey || !paymentData) {
      res.status(400).json({ error: 'Необходимо указать товар и данные платежа' });
      return;
    }

    const result = await MonetizationService.makePurchase(userId, itemKey, paymentData);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error('Ошибка совершения покупки:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Проверить возможность поиска
 */
export const checkSearchAvailability = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.token;
    if (!token) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const decoded = jwt.decode(token) as { userId: string };
    const userId = decoded?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'Некорректный токен' });
      return;
    }

    const result = await MonetizationService.canUserSearch(userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Ошибка проверки доступности поиска:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Получить только лимиты поиска пользователя
 */
export const getSearchLimits = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.token;
    if (!token) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const decoded = jwt.decode(token) as { userId: string };
    const userId = decoded?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'Некорректный токен' });
      return;
    }

    const limits = await MonetizationService.getSearchLimits(userId);
    
    res.json({
      success: true,
      data: limits
    });
  } catch (error) {
    console.error('Ошибка получения лимитов поиска:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Проверить возможность использования буста
 */
export const checkBoostAvailability = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.token;
    if (!token) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const decoded = jwt.decode(token) as { userId: string };
    const userId = decoded?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'Некорректный токен' });
      return;
    }

    const result = await MonetizationService.canUseBoost(userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Ошибка проверки доступности буста:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Проверить возможность использования супер-лайка
 */
export const checkSuperLikeAvailability = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.token;
    if (!token) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const decoded = jwt.decode(token) as { userId: string };
    const userId = decoded?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'Некорректный токен' });
      return;
    }

    const result = await MonetizationService.canUseSuperLike(userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Ошибка проверки доступности супер-лайка:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

/**
 * Пополнить бесплатную валюту
 */
export const refillFreeCurrency = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.token;
    if (!token) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const decoded = jwt.decode(token) as { userId: string };
    const userId = decoded?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'Некорректный токен' });
      return;
    }

    await MonetizationService.refillFreeCurrency(userId);
    
    res.json({
      success: true,
      message: 'Бесплатная валюта пополнена'
    });
  } catch (error) {
    console.error('Ошибка пополнения бесплатной валюты:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}; 