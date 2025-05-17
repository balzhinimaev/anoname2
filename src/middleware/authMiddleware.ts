import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Token from '../models/Token';

// Расширяем интерфейс Request, чтобы добавить пользователя
declare global {
  namespace Express {
    interface Request {
      user?: {
        telegramId: string;
        // Добавьте другие нужные поля
      };
      token?: string;
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({ error: 'Отсутствует токен авторизации' });
      return;
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    
    if (!token) {
      res.status(401).json({ error: 'Неверный формат токена' });
      return;
    }

    // Проверяем токен в базе данных
    const tokenDoc = await Token.findOne({ token, isValid: true });
    if (!tokenDoc) {
      res.status(401).json({ error: 'Токен недействителен или отозван' });
      return;
    }

    // Проверяем срок действия токена
    if (tokenDoc.expiresAt < new Date()) {
      await Token.findOneAndUpdate({ token }, { isValid: false });
      res.status(401).json({ error: 'Срок действия токена истек' });
      return;
    }

    // Верифицируем JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as {
      telegramId: string;
    };

    // Обновляем время последнего использования
    await Token.findOneAndUpdate(
      { token },
      { lastUsedAt: new Date() }
    );

    req.user = decoded;
    req.token = token;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Недействительный токен' });
      return;
    }
    res.status(500).json({ error: 'Ошибка при проверке токена' });
  }
}; 