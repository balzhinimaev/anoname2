import Chat from '../models/Chat';
import { wsManager } from '../server';
import mongoose from 'mongoose';
import { wsLogger } from '../utils/logger';

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
      content,
      userId
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
      timestamp
    });
  }

  static async endChat(chatId: string, userId: string, reason?: string): Promise<void> {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    if (!chat.participants.some(p => p.toString() === userId)) {
      throw new Error('User is not a participant of this chat');
    }

    // Проверяем, не завершен ли уже чат
    if (!chat.isActive) {
      throw new Error('Chat is already ended');
    }

    // Обновляем статус чата
    chat.isActive = false;
    chat.endedAt = new Date();
    chat.endedBy = new mongoose.Types.ObjectId(userId);
    chat.endReason = reason;
    await chat.save();

    // Уведомляем всех участников о завершении чата
    wsManager.io.to(`chat:${chatId}`).emit('chat:ended', {
      chatId,
      endedBy: userId,
      reason
    });

    wsLogger.info('chat_ended', `Chat ${chatId} ended by user ${userId}`, {
      reason
    });
  }
} 