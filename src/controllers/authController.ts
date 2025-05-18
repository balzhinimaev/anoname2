import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Token from '../models/Token';

const createAndSaveToken = async (
  user: any,
  req: Request
): Promise<string> => {
  // Создаем JWT токен с userId и telegramId
  const token = jwt.sign(
    { 
      userId: user._id,
      telegramId: user.telegramId 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '30d' }
  );

  // Получаем дату истечения токена
  const decoded = jwt.decode(token) as { exp: number };
  const expiresAt = new Date(decoded.exp * 1000);

  // Сохраняем токен в базу данных
  await Token.create({
    token,
    userId: user._id,
    telegramId: user.telegramId,
    expiresAt,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip
  });

  return token;
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const userData = req.body;

    // Проверяем, существует ли пользователь
    const existingUser = await User.findOne({ telegramId: userData.telegramId });
    if (existingUser) {
      res.status(400).json({ error: 'Пользователь с таким Telegram ID уже существует' });
      return;
    }

    // Создаем нового пользователя
    const user = new User(userData);
    await user.save();

    // Создаем и сохраняем токен
    const token = await createAndSaveToken(user, req);

    res.status(201).json({
      token,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        rating: user.rating || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при регистрации пользователя' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { telegramId } = req.body;
    console.log(telegramId)
    // Проверяем существование пользователя
    const user = await User.findOne({ telegramId });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    // Создаем и сохраняем токен
    const token = await createAndSaveToken(user, req);

    res.status(200).json({
      token,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        rating: user.rating || 0
      }
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Ошибка при аутентификации' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Отсутствует токен авторизации' });
      return;
    }

    const token = authHeader.split(' ')[1];
    
    // Инвалидируем токен
    await Token.findOneAndUpdate(
      { token },
      { 
        isValid: false,
        lastUsedAt: new Date()
      }
    );

    res.status(200).json({ message: 'Успешный выход из системы' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при выходе из системы' });
  }
};

export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }
    
    const { telegramId } = req.user;

    // Инвалидируем все токены пользователя
    await Token.updateMany(
      { telegramId },
      { 
        isValid: false,
        lastUsedAt: new Date()
      }
    );

    res.status(200).json({ message: 'Успешный выход из всех сессий' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при выходе из системы' });
  }
}; 