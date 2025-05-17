import { Request, Response } from 'express';
import User from '../models/User';

export const createOrUpdateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userData = req.body;
    const user = await User.findOneAndUpdate(
      { telegramId: userData.telegramId },
      userData,
      { new: true, upsert: true }
    );
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при создании/обновлении пользователя' });
  }
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { telegramId } = req.params;
    const user = await User.findOne({ telegramId });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении пользователя' });
  }
};

export const getPotentialMatches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { telegramId } = req.params;
    const user = await User.findOne({ telegramId });
    
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const query: any = {
      telegramId: { $ne: telegramId },
      isActive: true
    };

    if (user.preferences?.gender && user.preferences.gender !== 'any') {
      query.gender = user.preferences.gender;
    }

    if (user.preferences?.ageRange) {
      query.age = {
        $gte: user.preferences.ageRange.min,
        $lte: user.preferences.ageRange.max
      };
    }

    const potentialMatches = await User.find(query).limit(20);
    res.status(200).json(potentialMatches);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при поиске потенциальных партнеров' });
  }
};

export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const { telegramId } = req.params;
    const preferences = req.body;
    
    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: { preferences } },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при обновлении предпочтений' });
  }
};

export const uploadPhotos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { telegramId } = req.params;
    const { photos } = req.body;

    const user = await User.findOneAndUpdate(
      { telegramId },
      { $push: { photos: { $each: photos } } },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при загрузке фотографий' });
  }
};

export const deletePhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const { telegramId, photoId } = req.params;

    const user = await User.findOneAndUpdate(
      { telegramId },
      { $pull: { photos: photoId } },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при удалении фотографии' });
  }
}; 