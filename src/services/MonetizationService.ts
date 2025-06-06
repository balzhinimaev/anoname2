/**
 * Сервис монетизации для управления подписками, лимитами и покупками
 * @module services/MonetizationService
 */

import User, { IUser } from '../models/User';
import { wsLogger } from '../utils/logger';

export interface SubscriptionTier {
  type: 'basic' | 'premium' | 'gold';
  price: number;
  duration: number; // дни
  features: {
    unlimitedSearches: boolean;
    maxSearchDistance: number;
    advancedFilters: boolean;
    priorityInSearch: boolean;
    dailyHearts: number;
    dailySuperLikes: number;
    canSeeWhoLiked: boolean;
    analytics: boolean;
    videoChat: boolean;
  };
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  basic: {
    type: 'basic',
    price: 0,
    duration: 0,
    features: {
      unlimitedSearches: false,
      maxSearchDistance: 10,
      advancedFilters: false,
      priorityInSearch: false,
      dailyHearts: 10,
      dailySuperLikes: 1,
      canSeeWhoLiked: false,
      analytics: false,
      videoChat: false
    }
  },
  premium: {
    type: 'premium',
    price: 299, // рублей/месяц
    duration: 30,
    features: {
      unlimitedSearches: true,
      maxSearchDistance: 100,
      advancedFilters: true,
      priorityInSearch: true,
      dailyHearts: 50,
      dailySuperLikes: 5,
      canSeeWhoLiked: true,
      analytics: true,
      videoChat: false
    }
  },
  gold: {
    type: 'gold',
    price: 499, // рублей/месяц
    duration: 30,
    features: {
      unlimitedSearches: true,
      maxSearchDistance: 500,
      advancedFilters: true,
      priorityInSearch: true,
      dailyHearts: 100,
      dailySuperLikes: 10,
      canSeeWhoLiked: true,
      analytics: true,
      videoChat: true
    }
  }
};

export interface PurchaseItem {
  type: 'hearts' | 'boosts' | 'superLikes' | 'subscription';
  amount?: number;
  subscriptionType?: 'premium' | 'gold';
  price: number;
}

export const PURCHASE_ITEMS: Record<string, PurchaseItem> = {
  hearts_10: { type: 'hearts', amount: 10, price: 59 },
  hearts_50: { type: 'hearts', amount: 50, price: 199 },
  hearts_100: { type: 'hearts', amount: 100, price: 349 },
  boosts_1: { type: 'boosts', amount: 1, price: 99 },
  boosts_5: { type: 'boosts', amount: 5, price: 399 },
  superLikes_3: { type: 'superLikes', amount: 3, price: 149 },
  superLikes_10: { type: 'superLikes', amount: 10, price: 399 },
  premium: { type: 'subscription', subscriptionType: 'premium', price: 299 },
  gold: { type: 'subscription', subscriptionType: 'gold', price: 499 }
};

export class MonetizationService {
  /**
   * Проверяет может ли пользователь выполнить поиск
   */
  static async canUserSearch(userId: string): Promise<{ canSearch: boolean; reason?: string }> {
    const user = await User.findById(userId);
    if (!user) {
      return { canSearch: false, reason: 'User not found' };
    }

    // Сброс лимитов если прошли сутки
    await this.resetDailyLimitsIfNeeded(user);

    // Проверяем подписку
    if (user.subscription?.isActive && user.subscription.type !== 'basic') {
      const tier = SUBSCRIPTION_TIERS[user.subscription.type];
      if (tier.features.unlimitedSearches) {
        return { canSearch: true };
      }
    }

    // Проверяем лимиты для базовых пользователей
    const maxSearches = user.subscription?.type === 'basic' ? 5 : 3; // базовые или без подписки
    
    if (!user.limits || user.limits.searchesToday >= maxSearches) {
      return { 
        canSearch: false, 
        reason: `Достигнут дневной лимит поисков (${maxSearches}). Купите Premium для безлимитного поиска.` 
      };
    }

    return { canSearch: true };
  }

  /**
   * Использует попытку поиска
   */
  static async useSearchAttempt(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $inc: { 'limits.searchesToday': 1 }
    });
  }

  /**
   * Проверяет можно ли использовать буст
   */
  static async canUseBoost(userId: string): Promise<{ canUse: boolean; reason?: string }> {
    const user = await User.findById(userId);
    if (!user || !user.currency || user.currency.boosts <= 0) {
      return { 
        canUse: false, 
        reason: 'Недостаточно буостов. Купите буосты в магазине.' 
      };
    }

    return { canUse: true };
  }

  /**
   * Использует буст
   */
  static async useBoost(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $inc: { 'currency.boosts': -1 }
    });
  }

  /**
   * Проверяет можно ли использовать супер-лайк
   */
  static async canUseSuperLike(userId: string): Promise<{ canUse: boolean; reason?: string }> {
    const user = await User.findById(userId);
    if (!user || !user.currency || user.currency.superLikes <= 0) {
      return { 
        canUse: false, 
        reason: 'Недостаточно супер-лайков. Купите супер-лайки в магазине.' 
      };
    }

    return { canUse: true };
  }

  /**
   * Использует супер-лайк
   */
  static async useSuperLike(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $inc: { 'currency.superLikes': -1 }
    });
  }

  /**
   * Совершает покупку
   */
  static async makePurchase(userId: string, itemKey: string, paymentData: any): Promise<{ success: boolean; message: string }> {
    const item = PURCHASE_ITEMS[itemKey];
    if (!item) {
      return { success: false, message: 'Товар не найден' };
    }

    // Здесь должна быть интеграция с платежной системой (Stripe, YooKassa, etc.)
    // Для примера считаем что платеж прошел успешно
    const paymentSuccess = await this.processPayment(paymentData, item.price);
    
    if (!paymentSuccess) {
      return { success: false, message: 'Ошибка обработки платежа' };
    }

    // Применяем покупку
    if (item.type === 'subscription') {
      if (!item.subscriptionType) {
        return { success: false, message: 'Неверный тип подписки' };
      }
      await this.activateSubscription(userId, item.subscriptionType);
      return { success: true, message: `Подписка ${item.subscriptionType} активирована!` };
    } else {
      if (!item.amount) {
        return { success: false, message: 'Неверное количество валюты' };
      }
      await this.addCurrency(userId, item.type, item.amount);
      return { success: true, message: `${item.amount} ${item.type} добавлено к вашему счету!` };
    }
  }

  /**
   * Активирует подписку
   */
  private static async activateSubscription(userId: string, type: 'premium' | 'gold'): Promise<void> {
    const tier = SUBSCRIPTION_TIERS[type];
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + tier.duration * 24 * 60 * 60 * 1000);

    await User.findByIdAndUpdate(userId, {
      subscription: {
        type,
        startDate,
        endDate,
        isActive: true,
        autoRenew: false
      },
      'limits.maxSearchDistance': tier.features.maxSearchDistance,
      'limits.canUseAdvancedFilters': tier.features.advancedFilters
    });

    // Пополняем валюту согласно подписке
    await this.addCurrency(userId, 'hearts', tier.features.dailyHearts);
    await this.addCurrency(userId, 'superLikes', tier.features.dailySuperLikes);

    wsLogger.info('subscription_activated', `Подписка ${type} активирована для пользователя ${userId}`, {
      userId,
      subscriptionType: type,
      endDate
    });
  }

  /**
   * Добавляет валюту пользователю
   */
  private static async addCurrency(userId: string, type: 'hearts' | 'boosts' | 'superLikes', amount: number): Promise<void> {
    const updateField = `currency.${type}`;
    await User.findByIdAndUpdate(userId, {
      $inc: { [updateField]: amount }
    });
  }

  /**
   * Пополняет бесплатную валюту раз в день
   */
  static async refillFreeCurrency(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) return;

    const now = new Date();
    const lastRefill = user.currency?.lastFreeRefill || new Date(0);
    const daysSinceRefill = Math.floor((now.getTime() - lastRefill.getTime()) / (24 * 60 * 60 * 1000));

    if (daysSinceRefill >= 1) {
      const tier = user.subscription?.isActive ? 
        SUBSCRIPTION_TIERS[user.subscription.type] : 
        SUBSCRIPTION_TIERS.basic;

      await User.findByIdAndUpdate(userId, {
        'currency.hearts': tier.features.dailyHearts,
        'currency.superLikes': tier.features.dailySuperLikes,
        'currency.lastFreeRefill': now
      });

      wsLogger.info('free_currency_refilled', `Бесплатная валюта пополнена для пользователя ${userId}`, {
        userId,
        hearts: tier.features.dailyHearts,
        superLikes: tier.features.dailySuperLikes
      });
    }
  }

  /**
   * Сбрасывает дневные лимиты если прошли сутки
   */
  private static async resetDailyLimitsIfNeeded(user: IUser): Promise<void> {
    if (!user.limits) return;

    const now = new Date();
    const lastReset = user.limits.lastReset;
    const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (24 * 60 * 60 * 1000));

    if (daysSinceReset >= 1) {
      await User.findByIdAndUpdate(user._id, {
        'limits.searchesToday': 0,
        'limits.lastReset': now
      });
    }
  }

  /**
   * Заглушка для обработки платежа
   */
  private static async processPayment(_paymentData: any, _amount: number): Promise<boolean> {
    // Здесь должна быть интеграция с реальной платежной системой
    // Пока возвращаем true для тестирования
    return true;
  }

  /**
   * Получает информацию о статусе пользователя
   */
  static async getUserStatus(userId: string): Promise<any> {
    const user = await User.findById(userId);
    if (!user) return null;

    await this.resetDailyLimitsIfNeeded(user);
    await this.refillFreeCurrency(userId);

    return {
      subscription: user.subscription,
      currency: user.currency,
      limits: user.limits,
      analytics: user.analytics
    };
  }

  /**
   * Получает только лимиты поиска пользователя
   */
  static async getSearchLimits(userId: string): Promise<any> {
    const user = await User.findById(userId);
    if (!user) return null;

    await this.resetDailyLimitsIfNeeded(user);

    const maxSearches = user.subscription?.isActive && user.subscription.type !== 'basic' 
      ? SUBSCRIPTION_TIERS[user.subscription.type].features.unlimitedSearches ? -1 : 5
      : user.subscription?.type === 'basic' ? 5 : 3;

    return {
      searchesToday: user.limits?.searchesToday || 0,
      maxSearches: maxSearches,
      unlimited: maxSearches === -1,
      remaining: maxSearches === -1 ? -1 : Math.max(0, maxSearches - (user.limits?.searchesToday || 0)),
      resetsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // следующий сброс
      subscriptionType: user.subscription?.type || 'free'
    };
  }
} 