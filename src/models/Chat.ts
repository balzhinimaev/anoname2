import mongoose from 'mongoose';

interface IMessage {
  sender: mongoose.Types.ObjectId;
  content: string;
  timestamp: Date;
  isRead: boolean;
}

export interface IChat {
  participants: mongoose.Types.ObjectId[];
  messages: IMessage[];
  lastMessage?: IMessage;
  type: 'anonymous' | 'permanent';
  isActive: boolean;
  expiresAt?: Date; // Для анонимных чатов
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new mongoose.Schema<IMessage>({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  }
});

const chatSchema = new mongoose.Schema<IChat>({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  messages: [messageSchema],
  lastMessage: messageSchema,
  type: {
    type: String,
    enum: ['anonymous', 'permanent'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Индексы
chatSchema.index({ participants: 1 });
chatSchema.index({ isActive: 1 });
chatSchema.index({ type: 1 });

// TTL индекс для автоматического удаления анонимных чатов
chatSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// Методы
chatSchema.methods.isParticipant = function(userId: mongoose.Types.ObjectId): boolean {
  return this.participants.some((participantId: mongoose.Types.ObjectId) => 
    participantId.equals(userId)
  );
};

// Статические методы
interface ChatModel extends mongoose.Model<IChat> {
  findActiveChatsForUser(userId: mongoose.Types.ObjectId): Promise<IChat[]>;
}

chatSchema.statics.findActiveChatsForUser = async function(userId: mongoose.Types.ObjectId) {
  return this.find({
    participants: userId,
    isActive: true
  }).sort({ updatedAt: -1 });
};

// Middleware для установки срока истечения анонимных чатов
chatSchema.pre('save', function(next) {
  if (this.isNew && this.type === 'anonymous') {
    // Анонимный чат истекает через 24 часа
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  next();
});

export default mongoose.model<IChat, ChatModel>('Chat', chatSchema); 