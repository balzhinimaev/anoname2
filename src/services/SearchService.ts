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

    // Создаем объект для нового поиска
    const searchData: any = {
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
      // maxDistance устанавливаем только если используется геолокация
      maxDistance: criteria.useGeolocation ? (criteria.maxDistance || 10) : undefined
    };

    // Добавляем местоположение только если используется геолокация и координаты предоставлены
    if (criteria.useGeolocation && criteria.location) {
      searchData.location = {
        type: 'Point',
        coordinates: [criteria.location.longitude, criteria.location.latitude]
      };
    }

    // Создаем новый поиск
    const search = await Search.create(searchData);
    
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
    };

    // Корректная обработка желаемого пола
    let gendersToMatch: ('male' | 'female')[] = [];
    if (search.desiredGender.includes('any')) {
      gendersToMatch = ['male', 'female'];
    } else {
      // Убедимся, что отфильтровываем 'any', если он там случайно оказался,
      // и приводим к нужному типу.
      gendersToMatch = search.desiredGender.filter(g => g === 'male' || g === 'female') as ('male' | 'female')[];
    }
    matchCriteria.gender = { $in: gendersToMatch };

    // Проверяем, что наш пол соответствует желаемому полу других
    matchCriteria.desiredGender = {
      $in: [search.gender, 'any']
    };

    // Проверяем возрастные ограничения (в обе стороны)
    matchCriteria.age = { 
      $gte: search.desiredAgeMin,
      $lte: search.desiredAgeMax
    };
    matchCriteria.desiredAgeMin = { $lte: search.age };
    matchCriteria.desiredAgeMax = { $gte: search.age };

    // Добавляем фильтр по рейтингу
    if (search.minAcceptableRating > -1) {
      matchCriteria.rating = { $gte: search.minAcceptableRating };
    }

    // Если мы не используем геолокацию, не учитываем ее в критериях поиска
    if (!search.useGeolocation) {
      // Либо другой пользователь также не использует геолокацию, либо мы игнорируем этот параметр
      matchCriteria.$or = [
        { useGeolocation: false },
        { useGeolocation: true }
      ];
    }
    // Если используем геолокацию, применяем стандартную логику
    else if (search.useGeolocation && search.location) {
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
    try {
      // Защита от пустого массива
      if (!matches || matches.length === 0) {
        wsLogger.info('select_best_match', 'Попытка выбрать лучший матч из пустого массива', {
          searchId: search._id?.toString()
        });
        throw new Error('No matches available for selection');
      }

      return matches.reduce((best, current) => {
        try {
          const bestScore = this.calculateMatchScore(search, best);
          const currentScore = this.calculateMatchScore(search, current);
          return currentScore > bestScore ? current : best;
        } catch (error) {
          // В случае ошибки при расчете, логируем и возвращаем лучший предыдущий матч
          wsLogger.warn('match_score_calc', (error as Error).message, {
            searchId: search._id?.toString(),
            bestId: best._id?.toString(),
            currentId: current._id?.toString()
          });
          return best;
        }
      }, matches[0]);
    } catch (error) {
      // В случае общей ошибки возвращаем первый матч как запасной вариант
      wsLogger.warn('select_best_match', (error as Error).message, {
        searchId: search._id?.toString()
      });
      return matches[0];
    }
  }

  private static calculateMatchScore(search: ISearch, match: ISearch): number {
    try {
      let score = 0;

      // Близость рейтинга (максимум 40 баллов)
      const searchRating = typeof search.rating === 'number' ? search.rating : 0;
      const matchRating = typeof match.rating === 'number' ? match.rating : 0;
      const ratingDiff = Math.abs(searchRating - matchRating);
      score += Math.max(0, 40 - ratingDiff * 2);

      // Близость возраста (максимум 30 баллов)
      const searchAge = typeof search.age === 'number' ? search.age : 25;
      const matchAge = typeof match.age === 'number' ? match.age : 25;
      const ageDiff = Math.abs(searchAge - matchAge);
      score += Math.max(0, 30 - ageDiff * 2);

      // Геолокация (максимум 30 баллов)
      if (search.useGeolocation && match.useGeolocation && 
          search.location && match.location && 
          search.location.coordinates && match.location.coordinates &&
          search.location.coordinates.length >= 2 && match.location.coordinates.length >= 2) {
        try {
          const distance = this.calculateDistance(
            search.location.coordinates as [number, number],
            match.location.coordinates as [number, number]
          );
          score += Math.max(0, 30 - (distance / 1000)); // distance в км
        } catch (error) {
          // Ошибка при расчете расстояния - просто не добавляем эти баллы
          wsLogger.warn('distance_calc', (error as Error).message, {
            matchId: match._id?.toString()
          });
        }
      }

      return score;
    } catch (error) {
      wsLogger.warn('match_score', (error as Error).message, {
        searchId: search._id?.toString(),
        matchId: match._id?.toString()
      });
      // В случае ошибки возвращаем базовый счет
      return 50; // базовый счет по умолчанию
    }
  }

  private static calculateDistance(coord1: [number, number], coord2: [number, number]): number {
    try {
      // Проверка на валидность координат
      if (!coord1 || !coord2 || coord1.length < 2 || coord2.length < 2 ||
          typeof coord1[0] !== 'number' || typeof coord1[1] !== 'number' ||
          typeof coord2[0] !== 'number' || typeof coord2[1] !== 'number' ||
          isNaN(coord1[0]) || isNaN(coord1[1]) || isNaN(coord2[0]) || isNaN(coord2[1])) {
        throw new Error('Invalid coordinates for distance calculation');
      }

      // Реализация формулы гаверсинусов для расчета расстояния между точками
      const R = 6371e3; // радиус Земли в метрах
      const φ1 = (coord1[1] * Math.PI) / 180;
      const φ2 = (coord2[1] * Math.PI) / 180;
      const Δφ = ((coord2[1] - coord1[1]) * Math.PI) / 180;
      const Δλ = ((coord2[0] - coord1[0]) * Math.PI) / 180;

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1-a))); // Защита от отрицательных значений

      return R * c; // расстояние в метрах
    } catch (error) {
      wsLogger.warn('distance_calculation', (error as Error).message, {
        coord1: JSON.stringify(coord1),
        coord2: JSON.stringify(coord2)
      });
      return 10000; // возвращаем 10км как безопасное значение по умолчанию
    }
  }

  private static async createMatch(search1: ISearch & { _id: mongoose.Types.ObjectId }, search2: ISearch & { _id: mongoose.Types.ObjectId }) {
    try {
      // Проверка данных перед созданием чата
      if (!search1.userId || !search2.userId || !search1.telegramId || !search2.telegramId) {
        throw new Error('Invalid search data for match creation');
      }

      // Создаем анонимный чат
      const chat = await Chat.create({
        // Участники как массив ObjectId
        participants: [
          search1.userId,
          search2.userId
        ],
        messages: [],
        // Добавляем тип чата (обязательное поле)
        type: 'anonymous',
        isActive: true,
        startedAt: new Date()
      });

      // Проверяем, что чат был успешно создан и имеет _id
      if (!chat || !chat._id) {
        throw new Error('Failed to create chat for match');
      }

      wsLogger.info('match_created', 'Создан новый матч', {
        chatId: chat._id.toString(),
        search1Id: search1._id.toString(),
        search2Id: search2._id.toString(),
      });

      // Обновляем статус обоих поисков
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

      // Отправляем уведомления обоим пользователям
      wsManager.sendToUser(search1.userId.toString(), 'search:matched', {
        matchedUser: {
          telegramId: search2.telegramId,
          gender: search2.gender,
          age: search2.age,
          chatId: chat._id.toString()
        }
      });

      wsManager.sendToUser(search2.userId.toString(), 'search:matched', {
        matchedUser: {
          telegramId: search1.telegramId,
          gender: search1.gender,
          age: search1.age,
          chatId: chat._id.toString()
        }
      });

      // Атомарно обновляем статистику после мэтча
      await this.updateAndBroadcastStats('match', search1.userId.toString());

      return chat;
    } catch (error) {
      wsLogger.warn('create_match', (error as Error).message, {
        search1Id: search1._id.toString(),
        search2Id: search2._id.toString(),
        stack: (error as Error).stack
      });
      
      // Попытка отката, если произошла ошибка после создания чата
      try {
        // Обновляем статусы обратно на searching
        await Promise.all([
          Search.findByIdAndUpdate(search1._id, { status: 'searching', $unset: { matchedWith: 1 } }),
          Search.findByIdAndUpdate(search2._id, { status: 'searching', $unset: { matchedWith: 1 } })
        ]);
      } catch (rollbackError) {
        wsLogger.warn('match_rollback', (rollbackError as Error).message, {
          search1Id: search1._id.toString(),
          search2Id: search2._id.toString()
        });
      }
      
      throw error; // Пробрасываем ошибку дальше для правильной обработки
    }
  }

  static async getSearchStats() {
    // Проверяем кэш
    if (this.statsCache && Date.now() - this.statsCache.timestamp < this.CACHE_TTL) {
      return this.statsCache.data;
    }

    // Получаем количество пользователей в поиске
    const [totalSearching, maleSearching, femaleSearching] = await Promise.all([
      Search.countDocuments({ status: 'searching' }),
      Search.countDocuments({ status: 'searching', gender: 'male' }),
      Search.countDocuments({ status: 'searching', gender: 'female' })
    ]);

    // Получаем количество онлайн пользователей и суммируем из разных источников
    const [onlineUsers, totalOnlineFromDB] = await Promise.all([
      User.find({ isActive: true }).select('gender'),
      User.countDocuments({ isActive: true })
    ]);

    // Подсчитываем количество мужчин и женщин онлайн
    let maleOnline = 0;
    let femaleOnline = 0;
    onlineUsers.forEach(user => {
      if (user.gender === 'male') maleOnline++;
      else if (user.gender === 'female') femaleOnline++;
    });

    // Получаем статистику по времени поиска и мэтчам за 24 часа
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const matches24h = await Search.countDocuments({
      status: 'matched',
      updatedAt: { $gte: oneDayAgo }
    });

    // Собираем и возвращаем статистику
    const stats = {
      t: totalSearching,
      m: maleSearching,
      f: femaleSearching,
      online: {
        t: totalOnlineFromDB,
        m: maleOnline,
        f: femaleOnline
      },
      avgSearchTime: {
        t: 0, // Эти значения могут быть заполнены реальными данными позже
        m: 0,
        f: 0,
        matches24h
      }
    };

    // Обновляем кэш
    this.statsCache = {
      data: stats,
      timestamp: Date.now()
    };

    return stats;
  }

  static async getUserActiveSearch(userId: string) {
    return await Search.findOne({
      userId,
      status: 'searching'
    });
  }

  public static async broadcastSearchStats() {
    try {
      const stats = await this.getSearchStats();
      wsManager.io.to('search_stats_room').emit('search:stats', stats);
      return stats; // Возвращаем stats для соответствия предыдущему Promise<any>
    } catch (error) {
      console.error('Failed to broadcast search stats:', error);
      return null; // Возвращаем null в случае ошибки
    }
  }

  private static async updateAndBroadcastStats(action: 'start' | 'cancel' | 'match', userId: string) {
    // Вынесли обновление статистики в отдельный метод для атомарности
    try {
      // Если статистика уже обновляется, планируем еще одно обновление после завершения текущего
      if (this.updatingStats) {
        this.pendingUpdates = true;
        return;
      }

      this.updatingStats = true;

      // Если у нас есть кэш и он свежий, то обновим его инкрементально
      if (this.statsCache && Date.now() - this.statsCache.timestamp < this.CACHE_TTL) {
        // Получаем пол пользователя для инкрементного обновления статистики
        const user = await Search.findOne({ userId });
        const gender = user?.gender;

        if (gender) {
          // Логируем, что выполняем инкрементное обновление
          wsLogger.info('stats_incremental_update', 'Инкрементное обновление кэша (' + action + ' поиска)', {
            gender,
            userId
          });

          // Инкрементально обновляем статистику в зависимости от действия
          if (action === 'start') {
            this.statsCache.data.t++;
            if (gender === 'male') this.statsCache.data.m++;
            else if (gender === 'female') this.statsCache.data.f++;
          } else if (action === 'cancel') {
            this.statsCache.data.t = Math.max(0, this.statsCache.data.t - 1);
            if (gender === 'male') this.statsCache.data.m = Math.max(0, this.statsCache.data.m - 1);
            else if (gender === 'female') this.statsCache.data.f = Math.max(0, this.statsCache.data.f - 1);
          } else if (action === 'match') {
            // При мэтче двое покидают поиск
            this.statsCache.data.t = Math.max(0, this.statsCache.data.t - 2);
            
            // Увеличиваем счетчик мэтчей
            this.statsCache.data.avgSearchTime.matches24h++;
            
            // Мы не знаем пол второго участника, поэтому просто сокращаем общее количество
            // и корректируем пол известного нам участника
            if (gender === 'male') this.statsCache.data.m = Math.max(0, this.statsCache.data.m - 1);
            else if (gender === 'female') this.statsCache.data.f = Math.max(0, this.statsCache.data.f - 1);
          }

          // Обновляем временную метку кэша
          this.statsCache.timestamp = Date.now();
        }
      } else {
        // Если кэша нет или он устарел, запрашиваем полные данные
        await this.getSearchStats();
      }

      // Отправляем обновленную статистику всем подписчикам
      wsLogger.info('stats_force_update', 'Статистика отправлена после действия: ' + action, {
        userId,
        stats: this.statsCache?.data,
        fromCache: !!this.statsCache
      });
      await this.broadcastSearchStats();

      this.updatingStats = false;

      // Если были отложенные обновления, выполняем еще одно
      if (this.pendingUpdates) {
        this.pendingUpdates = false;
        // Используем setTimeout, чтобы избежать слишком глубокой рекурсии
        setTimeout(() => this.broadcastSearchStats(), 0);
      }
    } catch (error) {
      this.updatingStats = false;
      console.error('Failed to update and broadcast stats:', error);
      throw error;
    }
  }

  private static updatingStats = false;
  private static pendingUpdates = false;
} 