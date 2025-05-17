import Search, { ISearch } from '../models/Search';
import Chat from '../models/Chat';
import { wsManager } from '../server';
import mongoose from 'mongoose';

export interface SearchCriteria {
  gender: 'male' | 'female';
  age: number;
  rating: number;
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
  static async startSearch(
    userId: string,
    telegramId: string,
    criteria: SearchCriteria
  ): Promise<SearchResult> {
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
      rating: criteria.rating,
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

    // Отправляем обновленную статистику всем
    await this.broadcastSearchStats();

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

    // Отправляем обновленную статистику всем
    await this.broadcastSearchStats();

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
    await this.broadcastSearchStats();

    return chat;
  }

  static async getSearchStats() {
    const totalSearching = await Search.countDocuments({ status: 'searching' });
    
    const genderStats = await Search.aggregate([
      { $match: { status: 'searching' } },
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      totalSearching,
      genderStats: genderStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  private static async broadcastSearchStats() {
    const stats = await this.getSearchStats();
    wsManager.io.emit('search:stats', stats);
  }
} 