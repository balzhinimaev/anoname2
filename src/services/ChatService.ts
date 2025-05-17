import Chat from '../models/Chat';
import { wsManager } from '../server';
import mongoose from 'mongoose';

export class ChatService {
  static async sendMessage(chatId: string, userId: string, content: string) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    if (!chat.participants.some(p => p.toString() === userId)) {
      throw new Error('User is not a participant of this chat');
    }

    const message = {
      sender: new mongoose.Types.ObjectId(userId),
      content,
      timestamp: new Date(),
      isRead: false
    };

    chat.messages.push(message);
    chat.lastMessage = message;
    await chat.save();

    // Отправляем сообщение всем участникам чата
    wsManager.io.to(`chat:${chatId}`).emit('chat:message', {
      chatId,
      message: {
        content,
        sender: userId,
        timestamp: message.timestamp
      }
    });

    return message;
  }

  static async markAsRead(chatId: string, userId: string, timestamp: Date) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Обновляем статус прочтения сообщений
    chat.messages = chat.messages.map(msg => {
      if (msg.timestamp <= timestamp && msg.sender.toString() !== userId) {
        msg.isRead = true;
      }
      return msg;
    });
    await chat.save();

    // Уведомляем других участников
    wsManager.io.to(`chat:${chatId}`).emit('chat:read', {
      chatId,
      userId,
      lastReadTimestamp: timestamp
    });
  }
} 