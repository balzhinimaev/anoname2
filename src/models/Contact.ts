import mongoose from 'mongoose';

export interface IContact {
  userId: mongoose.Types.ObjectId;
  telegramId: string;
  contactUserId: mongoose.Types.ObjectId;
  contactTelegramId: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  originChatId: mongoose.Types.ObjectId;
  permanentChatId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new mongoose.Schema<IContact>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  telegramId: {
    type: String,
    required: true
  },
  contactUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contactTelegramId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'blocked'],
    default: 'pending'
  },
  originChatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  permanentChatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat'
  }
}, {
  timestamps: true
});

// Индексы
contactSchema.index({ userId: 1 });
contactSchema.index({ telegramId: 1 });
contactSchema.index({ contactUserId: 1 });
contactSchema.index({ contactTelegramId: 1 });
contactSchema.index({ status: 1 });

// Составной индекс для уникальности пар пользователей
contactSchema.index(
  { 
    userId: 1,
    contactUserId: 1
  },
  { unique: true }
);

// Методы
contactSchema.methods.isBlocked = function(): boolean {
  return this.status === 'blocked';
};

// Статические методы
interface ContactModel extends mongoose.Model<IContact> {
  findExistingContact(
    userId: mongoose.Types.ObjectId,
    contactUserId: mongoose.Types.ObjectId
  ): Promise<IContact | null>;
}

contactSchema.statics.findExistingContact = async function(
  userId: mongoose.Types.ObjectId,
  contactUserId: mongoose.Types.ObjectId
): Promise<IContact | null> {
  return this.findOne({
    $or: [
      { userId, contactUserId },
      { userId: contactUserId, contactUserId: userId }
    ]
  });
};

export default mongoose.model<IContact, ContactModel>('Contact', contactSchema); 