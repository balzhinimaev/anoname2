/**
 * Модель пользователя в системе анонимного чата
 * @module models/User
 */

import mongoose, { Schema, Document } from 'mongoose';

/**
 * Интерфейс, описывающий модель пользователя
 * @interface IUser
 * @extends {Document}
 */
export interface IUser extends Document {
  /** Уникальный идентификатор пользователя в Telegram */
  telegramId: number;
  /** Имя пользователя в Telegram (опционально) */
  username?: string;
  /** Имя пользователя */
  firstName?: string;
  /** Фамилия пользователя */
  lastName?: string;
  /** Описание профиля пользователя */
  bio?: string;
  /** Пол пользователя */
  gender?: 'male' | 'female' | 'other';
  /** Предпочтения пользователя для поиска собеседников */
  preferences?: {
    /** Предпочитаемый пол собеседника */
    gender?: 'male' | 'female' | 'any';
    /** Предпочитаемый возрастной диапазон */
    ageRange?: {
      /** Минимальный возраст */
      min: number;
      /** Максимальный возраст */
      max: number;
    };
  };
  /** Возраст пользователя */
  age?: number;
  /** Массив URL фотографий пользователя */
  photos?: string[];
  /** Статус активности пользователя */
  isActive: boolean;
  /** Время последней активности */
  lastActive: Date;
  /** Дата создания профиля */
  createdAt: Date;
  /** Дата последнего обновления профиля */
  updatedAt: Date;
}

/**
 * Схема пользователя для MongoDB
 * @type {Schema}
 */
const UserSchema: Schema = new Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  bio: { type: String },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  preferences: {
    gender: { type: String, enum: ['male', 'female', 'any'] },
    ageRange: {
      min: { type: Number, min: 18 },
      max: { type: Number, max: 100 }
    }
  },
  age: { type: Number, min: 18 },
  photos: [{ type: String }],
  isActive: { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now }
}, {
  timestamps: true
});

export default mongoose.model<IUser>('User', UserSchema); 