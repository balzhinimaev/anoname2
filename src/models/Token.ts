import mongoose from 'mongoose';

export interface IToken {
  token: string;
  userId: mongoose.Types.ObjectId;
  telegramId: string;
  isValid: boolean;
  expiresAt: Date;
  lastUsedAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

interface TokenModel extends mongoose.Model<IToken> {
  cleanupExpiredTokens(): Promise<number>;
}

const tokenSchema = new mongoose.Schema<IToken>({
  token: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  telegramId: {
    type: String,
    required: true
  },
  isValid: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  },
  userAgent: String,
  ipAddress: String
}, {
  timestamps: true
});

// Индексы для быстрого поиска
tokenSchema.index({ userId: 1 });
tokenSchema.index({ telegramId: 1 });
tokenSchema.index({ expiresAt: 1 });

// Статический метод для очистки устаревших токенов
tokenSchema.statics.cleanupExpiredTokens = async function() {
  const now = new Date();
  const result = await this.deleteMany({
    $or: [
      { expiresAt: { $lt: now } },  // Удаляем истекшие токены
      { isValid: false }  // Удаляем невалидные токены
    ]
  });
  return result.deletedCount;
};

const Token = mongoose.model<IToken, TokenModel>('Token', tokenSchema);

export default Token; 