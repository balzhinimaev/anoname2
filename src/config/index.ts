import dotenv from 'dotenv';

dotenv.config();

export default {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram-dating',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiration: process.env.JWT_EXPIRATION || '24h',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000'
}; 