import mongoose from 'mongoose';

export interface IRating {
  ratedUserId: mongoose.Types.ObjectId;
  ratedTelegramId: string;
  raterUserId: mongoose.Types.ObjectId;
  raterTelegramId: string;
  chatId: mongoose.Types.ObjectId;
  score: number;
  comment?: string;
  createdAt: Date;
}

const ratingSchema = new mongoose.Schema<IRating>({
  ratedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ratedTelegramId: {
    type: String,
    required: true
  },
  raterUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  raterTelegramId: {
    type: String,
    required: true
  },
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  score: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: String
}, {
  timestamps: true
});

// Индексы
ratingSchema.index({ ratedUserId: 1 });
ratingSchema.index({ ratedTelegramId: 1 });
ratingSchema.index({ raterUserId: 1 });
ratingSchema.index({ chatId: 1 });

// Составной индекс для предотвращения повторных оценок
ratingSchema.index({ raterUserId: 1, chatId: 1 }, { unique: true });

// Статические методы
interface RatingModel extends mongoose.Model<IRating> {
  calculateAverageRating(userId: mongoose.Types.ObjectId): Promise<{
    averageRating: number;
    totalRatings: number;
    positiveRatings: number;
  }>;
}

ratingSchema.statics.calculateAverageRating = async function(userId: mongoose.Types.ObjectId) {
  const ratings = await this.aggregate([
    { $match: { ratedUserId: userId } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$score' },
        totalRatings: { $sum: 1 },
        positiveRatings: {
          $sum: {
            $cond: [{ $gte: ['$score', 4] }, 1, 0]
          }
        }
      }
    }
  ]);

  if (ratings.length === 0) {
    return {
      averageRating: 0,
      totalRatings: 0,
      positiveRatings: 0
    };
  }

  return {
    averageRating: Number(ratings[0].averageRating.toFixed(2)),
    totalRatings: ratings[0].totalRatings,
    positiveRatings: ratings[0].positiveRatings
  };
};

export default mongoose.model<IRating, RatingModel>('Rating', ratingSchema); 