import mongoose from 'mongoose';
import User from '../models/User';
import config from '../config';
import jwt from 'jsonwebtoken';

async function createTestUser() {
  try {
    // Подключаемся к MongoDB
    await mongoose.connect(config.mongoUri, {
      dbName: "anoname"
    });
    console.log('Connected to MongoDB');

    // Проверяем, существует ли пользователь
    let testUser = await User.findOne({ telegramId: 127227574 });

    if (testUser) {
      console.log('Пользователь уже существует, обновляем токен');
    } else {
      // Создаем тестового пользователя
      testUser = await User.create({
        telegramId: 127227574,
        username: "testuser",
        firstName: "Test",
        lastName: "User",
        gender: "male",
        age: 25,
        isActive: true,
        preferences: {
          gender: "any",
          ageRange: {
            min: 18,
            max: 50
          }
        }
      });
      console.log('Создан новый тестовый пользователь');
    }

    // Создаем JWT токен
    const token = jwt.sign(
      { userId: testUser._id },
      config.jwtSecret,
      { expiresIn: '30d' }
    );

    console.log('\nИнформация для тестирования:');
    console.log('ID:', testUser._id);
    console.log('Telegram ID:', testUser.telegramId);
    console.log('\nJWT Token для Socket.IO:');
    console.log(token);
    console.log('\nДля использования в Postman:');
    console.log('1. Создайте новый Socket.IO запрос');
    console.log('2. URL: http://localhost:3001');
    console.log('3. В Socket.IO Config добавьте:');
    console.log(JSON.stringify({
      transports: ["websocket"],
      path: "/socket.io/"
    }, null, 2));
    console.log('\n4. Есть три способа передать токен:');
    console.log('\nСпособ 1 - Через Auth:');
    console.log(JSON.stringify({
      token: token
    }, null, 2));
    console.log('\nСпособ 2 - Через Headers:');
    console.log(JSON.stringify({
      token: token
    }, null, 2));
    console.log('\nСпособ 3 - Через Authorization Header:');
    console.log(JSON.stringify({
      Authorization: `Bearer ${token}`
    }, null, 2));
    console.log('\nВыберите один из способов. Рекомендуется использовать Способ 1 (Auth)');

    await mongoose.disconnect();
    console.log('\nОтключено от MongoDB');
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

createTestUser(); 