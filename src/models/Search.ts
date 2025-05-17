import mongoose from 'mongoose';

export interface ISearch {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  telegramId: string;
  status: 'searching' | 'matched' | 'cancelled' | 'expired';
  
  // Данные пользователя для мэтчинга
  gender: 'male' | 'female';
  age: number;
  rating: number;

  // Критерии поиска
  desiredGender: ('male' | 'female' | 'any')[];
  desiredAgeMin: number;
  desiredAgeMax: number;
  minAcceptableRating: number;
  useGeolocation: boolean;
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  maxDistance?: number; // в километрах

  // Результат мэтчинга
  matchedWith?: {
    userId: mongoose.Types.ObjectId;
    telegramId: string;
    chatId?: mongoose.Types.ObjectId;
  };

  createdAt: Date;
  updatedAt: Date;
}

const searchSchema = new mongoose.Schema<ISearch>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  telegramId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['searching', 'matched', 'cancelled', 'expired'],
    default: 'searching'
  },
  
  // Данные пользователя
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true
  },
  age: {
    type: Number,
    required: true,
    min: 18,
    max: 100
  },
  rating: {
    type: Number,
    required: true,
    default: 0
  },

  // Критерии поиска
  desiredGender: [{
    type: String,
    enum: ['male', 'female', 'any']
  }],
  desiredAgeMin: {
    type: Number,
    required: true,
    min: 18,
    max: 100
  },
  desiredAgeMax: {
    type: Number,
    required: true,
    min: 18,
    max: 100
  },
  minAcceptableRating: {
    type: Number,
    default: -1 // -1 означает "любой рейтинг"
  },
  useGeolocation: {
    type: Boolean,
    default: false
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: false
    },
    coordinates: {
      type: [Number],
      required: false
    }
  },
  maxDistance: {
    type: Number,
    min: 1,
    max: 100, // максимум 100 км
    default: 10
  },
  
  matchedWith: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    telegramId: String,
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat'
    }
  }
}, {
  timestamps: true
});

// Индексы
searchSchema.index({ userId: 1 });
searchSchema.index({ telegramId: 1 });
searchSchema.index({ status: 1 });
searchSchema.index({ location: '2dsphere' });
searchSchema.index({ rating: 1 });
searchSchema.index({ gender: 1 });
searchSchema.index({ age: 1 });

// Автоматическое истечение поиска через 30 минут
searchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 });

export default mongoose.model<ISearch>('Search', searchSchema); 