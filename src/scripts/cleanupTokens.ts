import dotenv from 'dotenv';
import { connectDB } from '../config/database';
import Token from '../models/Token';

dotenv.config();

const cleanupTokens = async () => {
  try {
    await connectDB();
    const deletedCount = await Token.cleanupExpiredTokens();
    console.log(`Удалено ${deletedCount} устаревших токенов`);
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при очистке токенов:', error);
    process.exit(1);
  }
};

// Запускаем очистку
cleanupTokens(); 