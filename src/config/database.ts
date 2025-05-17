import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram-dating';

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: "anoname"
    });
    console.log('MongoDB подключена успешно');
  } catch (error) {
    console.error('Ошибка подключения к MongoDB:', error);
    process.exit(1);
  }
}; 