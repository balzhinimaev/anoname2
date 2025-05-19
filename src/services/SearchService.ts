import Search, { ISearch } from '../models/Search';
import Chat from '../models/Chat';
import { wsManager } from '../server';
import mongoose from 'mongoose';
import { wsLogger } from '../utils/logger';
import User from '../models/User';

export interface SearchCriteria {
  gender: 'male' | 'female';
  age: number;
  rating?: number;
  desiredGender: ('male' | 'female' | 'any')[];
  desiredAgeMin: number;
  desiredAgeMax: number;
  minAcceptableRating?: number;
  useGeolocation: boolean;
  location?: {
    longitude: number;
    latitude: number;
  };
  maxDistance?: number;
}

export interface SearchResult {
  status: 'searching' | 'matched' | 'cancelled' | 'expired';
  userId: mongoose.Types.ObjectId;
  telegramId: string;
  matchedWith?: {
    userId: mongoose.Types.ObjectId;
    telegramId: string;
    chatId: mongoose.Types.ObjectId;
  };
}

export class SearchService {
  private static debounceTimeout: NodeJS.Timeout | null = null;
  private static readonly DEBOUNCE_DELAY = 2000; // 2 секунды
  private static statsCache: {
    data: any;
    timestamp: number;
  } | null = null;
  private static readonly CACHE_TTL = 5000; // 5 секунд

  static async startSearch(
    userId: string,
    telegramId: string,
    criteria: SearchCriteria
  ): Promise<SearchResult> {
    // Добавляем логирование полученных критериев
    wsLogger.info('search_service_start', 'Запуск поиска в сервисе', {
      userId,
      telegramId,
      criteria: {
        gender: criteria.gender,
        age: criteria.age,
        desiredGender: criteria.desiredGender,
        desiredAgeMin: criteria.desiredAgeMin,
        desiredAgeMax: criteria.desiredAgeMax,
        useGeolocation: criteria.useGeolocation,
        hasLocation: !!criteria.location,
        location: criteria.location ? {
          longitude: criteria.location.longitude,
          latitude: criteria.location.latitude
        } : null,
        maxDistance: criteria.maxDistance
      }
    });
    
    // Добавляем явный вывод в консоль для отладки
    console.log('🔍 SEARCH START REQUEST:', {
      userId,
      telegramId,
      useGeolocation: criteria.useGeolocation,
      location: criteria.location,
      maxDistance: criteria.maxDistance
    });

    // Отменяем предыдущий поиск, если есть
    await Search.findOneAndUpdate(
      { userId, status: 'searching' },
      { status: 'cancelled' }
    );

    // Создаем новый поиск
    const search = await Search.create({
      userId: new mongoose.Types.ObjectId(userId),
      telegramId,
      status: 'searching',
      gender: criteria.gender,
      age: criteria.age,
      rating: criteria.rating ?? 0,
      desiredGender: criteria.desiredGender,
      desiredAgeMin: criteria.desiredAgeMin,
      desiredAgeMax: criteria.desiredAgeMax,
      minAcceptableRating: criteria.minAcceptableRating ?? -1,
      useGeolocation: criteria.useGeolocation,
      location: criteria.location ? {
        type: 'Point',
        coordinates: [criteria.location.longitude, criteria.location.latitude]
      } : undefined,
      maxDistance: criteria.maxDistance
    });
    
    // Логируем созданную запись поиска с фокусом на геоданные
    wsLogger.info('search_record_created', 'Запись поиска создана', {
      userId,
      searchId: search._id?.toString(),
      useGeolocation: search.useGeolocation,
      hasLocation: !!search.location,
      coordinates: search.location ? search.location.coordinates : null,
      maxDistance: search.maxDistance
    });
    
    // Ищем подходящий мэтч
    const matches = await this.findMatches(search);
    if (matches.length > 0) {
      // Выбираем лучший мэтч
      const bestMatch = this.selectBestMatch(search, matches);
      if (search._id && bestMatch._id) {
        await this.createMatch(
          search as ISearch & { _id: mongoose.Types.ObjectId },
          bestMatch as ISearch & { _id: mongoose.Types.ObjectId }
        );
      }
    }

    // Атомарно обновляем статистику после начала поиска
    await this.updateAndBroadcastStats('start', userId);

    // Преобразуем результат в SearchResult
    return {
      status: search.status as 'searching' | 'matched' | 'cancelled' | 'expired',
      userId: search.userId,
      telegramId: search.telegramId,
      matchedWith: search.matchedWith ? {
        userId: search.matchedWith.userId,
        telegramId: search.matchedWith.telegramId,
        chatId: search.matchedWith.chatId as mongoose.Types.ObjectId
      } : undefined
    };
  }

  static async cancelSearch(userId: string) {
    const search = await Search.findOneAndUpdate(
      { userId, status: 'searching' },
      { status: 'cancelled' },
      { new: true }
    );

    // Атомарно обновляем статистику после отмены поиска
    await this.updateAndBroadcastStats('cancel', userId);

    return search;
  }

  private static async findMatches(search: ISearch): Promise<ISearch[]> {
    // Базовые критерии поиска
    const matchCriteria: any = {
      status: 'searching',
      userId: { $ne: search.userId },
      // Проверяем, что пол пользователя соответствует желаемому полу других
      gender: { 
        $in: ['any', ...search.desiredGender] 
      },
      // Проверяем, что наш пол соответствует желаемому полу других
      desiredGender: {
        $in: [search.gender, 'any']
      },
      // Проверяем возрастные ограничения (в обе стороны)
      age: { 
        $gte: search.desiredAgeMin,
        $lte: search.desiredAgeMax
      },
      desiredAgeMin: { $lte: search.age },
      desiredAgeMax: { $gte: search.age }
    };

    // Добавляем фильтр по рейтингу
    if (search.minAcceptableRating > -1) {
      matchCriteria.rating = { $gte: search.minAcceptableRating };
    }

    // Добавляем геолокационные критерии если нужно
    if (search.useGeolocation && search.location) {
      matchCriteria.useGeolocation = true;
      matchCriteria.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: search.location.coordinates
          },
          $maxDistance: (search.maxDistance || 10) * 1000 // конвертируем км в метры
        }
      };
    }

    return await Search.find(matchCriteria);
  }

  private static selectBestMatch(search: ISearch, matches: ISearch[]): ISearch {
    return matches.reduce((best, current) => {
      const bestScore = this.calculateMatchScore(search, best);
      const currentScore = this.calculateMatchScore(search, current);
      return currentScore > bestScore ? current : best;
    }, matches[0]);
  }

  private static calculateMatchScore(search: ISearch, match: ISearch): number {
    let score = 0;

    // Близость рейтинга (максимум 40 баллов)
    const ratingDiff = Math.abs(search.rating - match.rating);
    score += Math.max(0, 40 - ratingDiff * 2);

    // Близость возраста (максимум 30 баллов)
    const ageDiff = Math.abs(search.age - match.age);
    score += Math.max(0, 30 - ageDiff * 2);

    // Геолокация (максимум 30 баллов)
    if (search.useGeolocation && match.useGeolocation && search.location && match.location) {
      const distance = this.calculateDistance(
        search.location.coordinates,
        match.location.coordinates
      );
      score += Math.max(0, 30 - (distance / 1000)); // distance в км
    }

    return score;
  }

  private static calculateDistance(coord1: [number, number], coord2: [number, number]): number {
    // Реализация формулы гаверсинусов для расчета расстояния между точками
    const R = 6371e3; // радиус Земли в метрах
    const φ1 = (coord1[1] * Math.PI) / 180;
    const φ2 = (coord2[1] * Math.PI) / 180;
    const Δφ = ((coord2[1] - coord1[1]) * Math.PI) / 180;
    const Δλ = ((coord2[0] - coord1[0]) * Math.PI) / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // расстояние в метрах
  }

  private static async createMatch(search1: ISearch & { _id: mongoose.Types.ObjectId }, search2: ISearch & { _id: mongoose.Types.ObjectId }) {
    // Создаем анонимный чат
    const chat = await Chat.create({
      participants: [search1.userId, search2.userId],
      type: 'anonymous'
    });

    // Обновляем статусы поиска
    await Promise.all([
      Search.findByIdAndUpdate(search1._id, {
        status: 'matched',
        matchedWith: {
          userId: search2.userId,
          telegramId: search2.telegramId,
          chatId: chat._id
        }
      }),
      Search.findByIdAndUpdate(search2._id, {
        status: 'matched',
        matchedWith: {
          userId: search1.userId,
          telegramId: search1.telegramId,
          chatId: chat._id
        }
      })
    ]);

    // Уведомляем обоих пользователей о мэтче
    wsManager.sendToUser(search1.userId.toString(), 'search:matched', {
      matchedUser: {
        telegramId: search2.telegramId,
        chatId: chat._id.toString()
      }
    });

    wsManager.sendToUser(search2.userId.toString(), 'search:matched', {
      matchedUser: {
        telegramId: search1.telegramId,
        chatId: chat._id.toString()
      }
    });

    // Отправляем обновленную статистику всем после матча
    // Используем новый метод для обновления статистики с учетом среднего времени
    await this.updateAndBroadcastStats('match', search1.userId.toString());

    return chat;
  }

  static async getSearchStats() {
    // Уменьшаем логирование
    // wsLogger.info('stats_request', 'Запрос статистики');

    // Используем кэш если он свежий
    if (this.statsCache && Date.now() - this.statsCache.timestamp < this.CACHE_TTL) {
      // Уменьшаем логирование
      // wsLogger.info('stats_cache_hit', 'Возврат статистики из кэша', {
      //   cacheAge: Date.now() - this.statsCache.timestamp
      // });
      return this.statsCache.data;
    }

    // Уменьшаем логирование
    // wsLogger.info('stats_cache_miss', 'Получение свежей статистики');
    
    // Получаем статистику поиска
    const [searchingStats, onlineStats, avgSearchTimeStats] = await Promise.all([
      // Статистика поиска
      Search.aggregate([
        { $match: { status: 'searching' } },
        {
          $group: {
            _id: '$gender',
            count: { $sum: 1 }
          }
        }
      ]),
      // Статистика онлайн пользователей
      User.aggregate([
        { 
          $match: { 
            isActive: true,
            lastActive: { 
              $gte: new Date(Date.now() - 30 * 1000) // активны за последние 30 секунд
            }
          }
        },
        {
          $group: {
            _id: '$gender',
            count: { $sum: 1 }
          }
        }
      ]),
      // Статистика по времени поиска (для мэтчей за последние 24 часа)
      Search.aggregate([
        { 
          $match: { 
            status: 'matched',
            updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // за последние 24 часа
          } 
        },
        {
          $project: {
            searchDuration: { 
              $subtract: ['$updatedAt', '$createdAt'] // разница в миллисекундах
            },
            gender: 1
          }
        },
        {
          $group: {
            _id: '$gender',
            avgTime: { $avg: '$searchDuration' }, // среднее время в мс
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Расчет общего среднего времени поиска
    let totalSearchTime = 0;
    let totalSearchCount = 0;
    
    avgSearchTimeStats.forEach(stat => {
      totalSearchTime += (stat.avgTime || 0) * stat.count;
      totalSearchCount += stat.count;
    });
    
    const avgSearchTimeTotal = totalSearchCount > 0 ? 
      Math.round(totalSearchTime / totalSearchCount / 1000) : 0; // в секундах
    
    const stats = {
      // Статистика поиска
      t: searchingStats.reduce((sum, stat) => sum + stat.count, 0),
      m: searchingStats.find(s => s._id === 'male')?.count || 0,
      f: searchingStats.find(s => s._id === 'female')?.count || 0,
      // Статистика онлайн
      online: {
        t: onlineStats.reduce((sum, stat) => sum + stat.count, 0),
        m: onlineStats.find(s => s._id === 'male')?.count || 0,
        f: onlineStats.find(s => s._id === 'female')?.count || 0
      },
      // Статистика по времени поиска (в секундах)
      avgSearchTime: {
        t: avgSearchTimeTotal,
        m: Math.round((avgSearchTimeStats.find(s => s._id === 'male')?.avgTime || 0) / 1000),
        f: Math.round((avgSearchTimeStats.find(s => s._id === 'female')?.avgTime || 0) / 1000),
        // Дополнительно - количество успешных мэтчей за 24 часа
        matches24h: totalSearchCount
      }
    };
    
    // Обновляем кэш
    this.statsCache = {
      data: stats,
      timestamp: Date.now()
    };

    // wsLogger.info('stats_updated', 'Статистика обновлена', stats);
    return stats;
  }

  /**
   * Получает активный поиск пользователя по его ID
   * @param userId ID пользователя
   * @returns Объект поиска или null, если пользователь не в поиске
   */
  static async getUserActiveSearch(userId: string) {
    return await Search.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'searching'
    });
  }

  public static async broadcastSearchStats() {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      // wsLogger.info('stats_debounce', 'Сброс таймера дебаунса');
    }
    
    this.debounceTimeout = setTimeout(async () => {
      // wsLogger.info('stats_broadcast_start', 'Начало рассылки статистики');
      const stats = await this.getSearchStats();
      wsManager.io.to('search_stats_room').emit('search:stats', stats);
      // wsLogger.info('stats_broadcast_complete', 'Статистика разослана', {
      //   subscribersCount: wsManager.io.sockets.adapter.rooms.get('search_stats_room')?.size || 0
      // });
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Атомарное обновление и отправка статистики всем подписчикам
   * @param action Тип действия ('start', 'cancel', 'match')
   * @param userId ID пользователя, выполнившего действие
   */
  private static async updateAndBroadcastStats(action: 'start' | 'cancel' | 'match', userId: string) {
    // Используем семафор для предотвращения одновременного доступа к статистике
    if (this.updatingStats) {
      wsLogger.info('stats_update_queued', `Запрос на обновление статистики (${action}) поставлен в очередь`, {
        userId,
        action
      });
      // Если обновление уже идет, просто запланируем broadcastSearchStats
      this.pendingUpdates = true;
      return;
    }

    try {
      this.updatingStats = true;
      
      let stats;
      
      // Пробуем обновить кэш инкрементно вместо полного сброса
      if (this.statsCache && Date.now() - this.statsCache.timestamp < this.CACHE_TTL) {
        // Если есть свежий кэш и действие предсказуемо, обновляем инкрементно
        const userSearch = action === 'start' ? 
          await this.getUserActiveSearch(userId) : null;
          
        if (action === 'start' && userSearch) {
          // Инкрементно обновляем кэш при начале поиска
          const gender = userSearch.gender as 'male' | 'female';
          if (gender === 'male' || gender === 'female') {
            this.statsCache.data.t += 1;
            this.statsCache.data[gender.charAt(0)] += 1;
            stats = { ...this.statsCache.data }; // создаем копию данных
            wsLogger.info('stats_incremental_update', 'Инкрементное обновление кэша (начало поиска)', { 
              gender, 
              userId 
            });
          } else {
            // Если пол неизвестен, делаем полное обновление
            this.statsCache = null;
            stats = await this.getSearchStats();
          }
        } else if (action === 'cancel') {
          // Декрементно обновляем кэш при отмене поиска, но только если точно знаем пол
          const canceledSearch = await Search.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            status: 'cancelled'
          });
          
          if (canceledSearch && (canceledSearch.gender === 'male' || canceledSearch.gender === 'female')) {
            const gender = canceledSearch.gender as 'male' | 'female';
            // Уменьшаем только количество ищущих, не трогая онлайн
            this.statsCache.data.t = Math.max(0, this.statsCache.data.t - 1);
            this.statsCache.data[gender.charAt(0)] = Math.max(0, this.statsCache.data[gender.charAt(0)] - 1);
            
            // Убеждаемся что статистика онлайн сохраняется
            const currentStats = { ...this.statsCache.data }; // создаем копию данных
            
            // Если по какой-то причине кэш не содержит данных об онлайн, запрашиваем свежие данные
            if (!currentStats.online) {
              const freshStats = await this.getSearchStats();
              // Обновляем только данные о поиске, сохраняя актуальную информацию онлайн
              this.statsCache = {
                data: {
                  ...freshStats,
                  t: currentStats.t,
                  m: currentStats.m,
                  f: currentStats.f
                },
                timestamp: Date.now()
              };
              stats = this.statsCache.data;
            } else {
              stats = currentStats;
            }
            
            wsLogger.info('stats_incremental_update', 'Инкрементное обновление кэша (отмена поиска)', { 
              gender, 
              userId 
            });
          } else {
            // Если не нашли отмененный поиск, делаем полное обновление
            this.statsCache = null;
            stats = await this.getSearchStats();
          }
        } else if (action === 'match') {
          // При матче мы не меняем текущую статистику поиска, но можем обновить
          // статистику среднего времени поиска. Для простоты делаем полное обновление
          // при матчах, так как это редкое событие и требуется точность.
          this.statsCache = null;
          stats = await this.getSearchStats();
        } else {
          // Для других действий или при сложных сценариях делаем полное обновление
          this.statsCache = null;
          stats = await this.getSearchStats();
        }
      } else {
        // Если кэш устарел или отсутствует, получаем свежую статистику
        this.statsCache = null;
        stats = await this.getSearchStats();
      }
      
      // Отправляем статистику всем подписчикам сразу
      wsManager.io.to('search_stats_room').emit('search:stats', stats);
      
      wsLogger.info('stats_force_update', `Статистика отправлена после действия: ${action}`, {
        userId,
        stats,
        fromCache: !!this.statsCache
      });
      
    } catch (error) {
      wsLogger.error('stats_update_error', userId, error as Error, {
        action
      });
    } finally {
      // Снимаем блокировку
      this.updatingStats = false;
      
      // Если были запросы на обновление во время выполнения, запускаем стандартный механизм
      if (this.pendingUpdates) {
        this.pendingUpdates = false;
        await this.broadcastSearchStats();
      }
    }
  }
  
  // Флаги для контроля конкурентных обновлений
  private static updatingStats = false;
  private static pendingUpdates = false;
} 