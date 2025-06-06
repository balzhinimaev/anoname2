import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { socketAuth } from './middleware/auth';
import { ClientToServerEvents, ServerToClientEvents, SocketData, TypedSocket } from './types';
import { ChatService } from '../services/ChatService';
import { SearchService, SearchCriteria, SearchResult } from '../services/SearchService';
import { wsLogger } from '../utils/logger';
import { metricsCollector } from '../utils/metrics';
import { CircuitBreaker } from '../utils/CircuitBreaker';
import User from '../models/User';
import { RatingService } from '../services/RatingService';

// Создаем статическую карту для хранения таймаутов
const pendingSearchCancellations = new Map<string, NodeJS.Timeout>();

export class WebSocketManager {
  public io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private userRooms: Map<string, Set<string>> = new Map(); // userId -> Set of room names
  private chatCircuitBreaker: CircuitBreaker;
  private searchCircuitBreaker: CircuitBreaker;

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3001',
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Authorization', 'Content-Type']
      },
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
      },
      pingTimeout: 20000,
      pingInterval: 25000,
      transports: ['websocket'],
      allowEIO3: true,
      path: '/socket.io/',
      serveClient: false,
      maxHttpBufferSize: 1e6, // 1MB
      httpCompression: {
        threshold: 1024 // Сжимать данные больше 1KB
      }
    });

    // Добавляем обработчик ошибок соединения
    this.io.engine.on('connection_error', (err) => {
      wsLogger.error('system', 'socket.io', new Error(err.message), {
        code: err.code,
        context: err.context
      });
    });

    this.chatCircuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenMaxAttempts: 3
    });

    this.searchCircuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 60000,
      halfOpenMaxAttempts: 2
    });

    this.io.use(socketAuth);
    this.initializeEventHandlers();
  }

  private initializeEventHandlers() {
    this.io.on('connection', (socket: TypedSocket) => {
      const userId = socket.data.user._id.toString();
      const isReconnection = socket.recovered;
      const connectionStart = Date.now();
      
      // Метрики подключения
      metricsCollector.connectionOpened();
      
      // Обновляем статус активности пользователя
      User.findByIdAndUpdate(userId, {
        isActive: true,
        lastActive: new Date()
      }).then(() => {
        // Обновляем статистику после изменения статуса
        SearchService.broadcastSearchStats().catch((error: unknown) => {
          wsLogger.error('update_stats', userId, error as Error);
        });
      }).catch((error: unknown) => {
        wsLogger.error('update_activity', userId, error as Error);
      });

      // Устанавливаем интервал обновления активности
      const activityInterval = setInterval(() => {
        User.findByIdAndUpdate(userId, {
          lastActive: new Date()
        }).then(() => {
          // Обновляем статистику после каждого обновления активности
          SearchService.broadcastSearchStats().catch((error: unknown) => {
            wsLogger.error('update_stats', userId, error as Error);
          });
        }).catch((error: unknown) => {
          wsLogger.error('update_activity', userId, error as Error);
        });
      }, 10000); // Обновляем каждые 10 секунд

      // Логируем подключение
      wsLogger.connection(userId, socket.id, {
        isReconnection,
        telegramId: socket.data.user.telegramId
      });

      // Подписка на статистику
      socket.on('search:subscribe_stats', async () => {
        socket.join('search_stats_room');
        
        // Отправляем текущую статистику сразу после подписки
        try {
          // Получаем текущую статистику
          const stats = await SearchService.getSearchStats();
          
          // Проверяем, находится ли пользователь в активном поиске
          const userSearch = await SearchService.getUserActiveSearch(userId);
          
          // Если пользователь уже в поиске, но не включен в статистику - учитываем его
          if (userSearch && userSearch.status === 'searching') {
            const userGender = userSearch.gender || 'unknown';
            if (userGender === 'male') {
              stats.m += 1;
              stats.t += 1;
            } else if (userGender === 'female') {
              stats.f += 1;
              stats.t += 1;
            }
          }
          
          socket.emit('search:stats', stats);
        } catch (error) {
          wsLogger.error('stats_initial', userId, error as Error);
        }
      });

      socket.on('search:unsubscribe_stats', () => {
        socket.leave('search_stats_room');
      });

      // Добавляем сокет в мапу пользователя
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)?.add(socket.id);

      // Инициализируем хранилище комнат пользователя при первом подключении
      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, new Set());
      }

      // При переподключении восстанавливаем комнаты
      if (isReconnection) {
        const rooms = this.userRooms.get(userId);
        if (rooms) {
          rooms.forEach(room => {
            socket.join(room);
            wsLogger.event('room_rejoin', userId, socket.id, { room });
          });
        }
        
        // Очищаем таймер отмены поиска, если пользователь переподключился
        const cancelTimeout = pendingSearchCancellations.get(userId);
        if (cancelTimeout) {
          clearTimeout(cancelTimeout);
          pendingSearchCancellations.delete(userId);
        }
        
        socket.emit('connection:recovered');
      }

      // Обработчики поиска с логированием
      socket.on('search:start', (data) => {
        const startTime = Date.now();
        metricsCollector.searchStarted();
        wsLogger.event('search_start', userId, socket.id, { criteria: data.criteria });
        this.handleSearchStart(socket, data).then(() => {
          const duration = Date.now() - startTime;
          metricsCollector.messageProcessed(duration);
          metricsCollector.searchCompleted(true);
        }).catch(error => {
          metricsCollector.errorOccurred(error as Error);
          metricsCollector.searchCompleted(false);
          wsLogger.error(userId, socket.id, error as Error, { event: 'search_start' });
        });
      });

      socket.on('search:cancel', () => {
        const startTime = Date.now();
        wsLogger.event('search_cancel', userId, socket.id);
        
        this.handleSearchCancel(socket).then(() => {
          const duration = Date.now() - startTime;
          metricsCollector.messageProcessed(duration);
          metricsCollector.searchCompleted(false);
        }).catch(error => {
          metricsCollector.errorOccurred(error as Error);
          wsLogger.error(userId, socket.id, error as Error, { event: 'search_cancel' });
        });
      });

      // Обработчики чатов с сохранением комнат
      socket.on('chat:join', (chatId) => {
        const roomName = `chat:${chatId}`;
        socket.join(roomName);
        this.userRooms.get(userId)?.add(roomName);
        wsLogger.event('chat_join', userId, socket.id, { chatId });
      });
      
      socket.on('chat:leave', (chatId) => {
        const roomName = `chat:${chatId}`;
        socket.leave(roomName);
        this.userRooms.get(userId)?.delete(roomName);
        wsLogger.event('chat_leave', userId, socket.id, { chatId });
      });

      socket.on('chat:message', (data) => {
        const startTime = Date.now();
        wsLogger.event('chat_message', userId, socket.id, { chatId: data.chatId });
        this.handleChatMessage(socket, data).then(() => {
          const duration = Date.now() - startTime;
          metricsCollector.messageProcessed(duration);
        }).catch(error => {
          metricsCollector.errorOccurred(error as Error);
          wsLogger.error(userId, socket.id, error as Error, { 
            event: 'chat_message', 
            chatId: data.chatId 
          });
        });
      });

      socket.on('chat:typing', (chatId) => {
        wsLogger.event('chat_typing', userId, socket.id, { chatId });
        this.handleChatTyping(socket, chatId);
      });

      socket.on('chat:read', (data) => {
        wsLogger.event('chat_read', userId, socket.id, { chatId: data.chatId });
        this.handleChatRead(socket, data).catch(error => {
          wsLogger.error(userId, socket.id, error as Error, { event: 'chat_read', chatId: data.chatId });
        });
      });

      // Новый обработчик завершения чата
      socket.on('chat:end', async (data) => {
        const startTime = Date.now();
        wsLogger.event('chat_end', userId, socket.id, { 
          chatId: data.chatId,
          reason: data.reason 
        });

        try {
          await ChatService.endChat(data.chatId, userId, data.reason);
          const duration = Date.now() - startTime;
          metricsCollector.messageProcessed(duration);
        } catch (error) {
          metricsCollector.errorOccurred(error as Error);
          wsLogger.error(userId, socket.id, error as Error, { 
            event: 'chat_end', 
            chatId: data.chatId 
          });
          socket.emit('error', { message: 'Failed to end chat' });
        }
      });

      // Новый обработчик оценки чата
      socket.on('chat:rate', async (data) => {
        const startTime = Date.now();
        wsLogger.event('chat_rate', userId, socket.id, { 
          chatId: data.chatId,
          score: data.score 
        });

        try {
          await RatingService.rateUser(
            data.chatId,
            userId,
            data.score,
            data.comment
          );
          const duration = Date.now() - startTime;
          metricsCollector.messageProcessed(duration);
        } catch (error) {
          metricsCollector.errorOccurred(error as Error);
          wsLogger.error(userId, socket.id, error as Error, { 
            event: 'chat_rate', 
            chatId: data.chatId 
          });
          socket.emit('error', { message: 'Failed to rate chat' });
        }
      });

      // Обработчики контактов
      socket.on('contact:request', (data) => this.handleContactRequest(socket, data));
      socket.on('contact:respond', (data) => this.handleContactResponse(socket, data));

      // Обработка отключения
      socket.on('disconnect', (reason) => {
        // Очищаем интервал обновления активности
        clearInterval(activityInterval);

        const duration = Date.now() - connectionStart;
        metricsCollector.connectionClosed();
        
        this.userSockets.get(userId)?.delete(socket.id);
        
        // Если это последний сокет пользователя
        if (!this.userSockets.get(userId)?.size) {
          this.userSockets.delete(userId);
          
          // Получаем статус активного поиска
          SearchService.getUserActiveSearch(userId).then(activeSearch => {
            if (activeSearch && activeSearch.status === 'searching') {
              // Логируем информацию о потенциальной отмене поиска
              wsLogger.info('search_disconnect_detected', 'Обнаружено отключение пользователя в поиске', {
                userId,
                searchId: activeSearch._id?.toString(),
                disconnectReason: reason
              });
              
              // Даем время на переподключение (10 секунд) прежде чем отменить поиск
              const searchCancelTimeout = setTimeout(async () => {
                // Проверяем, не переподключился ли пользователь за это время
                if (!this.userSockets.has(userId)) {
                  try {
                    // Повторно проверяем, существует ли еще активный поиск
                    const currentSearch = await SearchService.getUserActiveSearch(userId);
                    if (currentSearch && currentSearch.status === 'searching') {
                      wsLogger.info('search_auto_cancel', 'Автоматическая отмена поиска после таймаута', {
                        userId,
                        searchId: currentSearch._id?.toString(),
                        disconnectReason: reason,
                        disconnectDuration: Date.now() - connectionStart
                      });
                      
                      await SearchService.cancelSearch(userId);
                    }
                  } catch (error) {
                    wsLogger.error('search_auto_cancel', userId, error as Error);
                  }
                }
              }, 10000); // 10 секунд на переподключение
              
              // Сохраняем таймаут в объект для возможности очистки при переподключении
              pendingSearchCancellations.set(userId, searchCancelTimeout);
            }
          }).catch(error => {
            wsLogger.error('get_active_search', userId, error as Error);
          });
          
          // Обновляем статус активности
          User.findByIdAndUpdate(userId, {
            isActive: false,
            lastActive: new Date()
          }).then(() => {
            // Обновляем статистику после изменения статуса
            SearchService.broadcastSearchStats().catch((error: unknown) => {
              wsLogger.error('update_stats_on_disconnect', userId, error as Error);
            });
          }).catch((error: unknown) => {
            wsLogger.error('update_activity', userId, error as Error);
          });
          
          // При полном отключении сохраняем состояние на 2 минуты
          setTimeout(() => {
            if (!this.userSockets.has(userId)) {
              this.userRooms.delete(userId);
            }
          }, 2 * 60 * 1000);
        }

        wsLogger.disconnection(userId, socket.id, reason, {
          duration,
          remainingSockets: this.userSockets.get(userId)?.size || 0
        });
      });
    });
  }

  // Методы для отправки событий конкретному пользователю
  public sendToUser<E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    const userSocketIds = this.userSockets.get(userId);
    if (userSocketIds) {
      userSocketIds.forEach(socketId => {
        this.io.to(socketId).emit(event, ...args);
      });
    }
  }

  private async handleChatMessage(socket: TypedSocket, data: { chatId: string; content: string }) {
    try {
      await this.chatCircuitBreaker.execute(
        async () => {
          await ChatService.sendMessage(
            data.chatId,
            socket.data.user._id.toString(),
            data.content
          );
        },
        async () => {
          // Fallback: сохраняем сообщение локально и пытаемся отправить позже
          socket.emit('error', { 
            message: 'Message queued for delivery due to service degradation'
          });
          // TODO: Добавить механизм очереди сообщений
        }
      );
    } catch (error) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  private async handleChatTyping(socket: TypedSocket, chatId: string) {
    socket.to(`chat:${chatId}`).emit('chat:typing', {
      chatId,
      userId: socket.data.user.telegramId
    });
  }

  private async handleChatRead(socket: TypedSocket, data: { chatId: string; timestamp: Date }) {
    try {
      await ChatService.markAsRead(
        data.chatId,
        socket.data.user._id.toString(),
        data.timestamp
      );
    } catch (error) {
      socket.emit('error', { message: 'Failed to mark messages as read' });
    }
  }

  // Остальные обработчики будут реализованы позже
  private async handleSearchStart(socket: TypedSocket, data: { criteria: SearchCriteria }) {
    const userId = socket.data.user._id.toString();
    try {
      // Детальное логирование полученных критериев поиска, включая геолокацию
      wsLogger.info('search_criteria_received', 'Получены критерии поиска', {
        userId,
        socketId: socket.id,
        telegramId: socket.data.user.telegramId,
        criteria: {
          ...data.criteria,
          // Логируем особенно геолокационные данные
          useGeolocation: data.criteria.useGeolocation,
          hasLocation: !!data.criteria.location,
          location: data.criteria.location ? {
            longitude: data.criteria.location.longitude,
            latitude: data.criteria.location.latitude
          } : null,
          maxDistance: data.criteria.maxDistance
        }
      });

      // Добавляем прямой вывод в консоль для отладки
      console.log('📡 WEBSOCKET RECEIVED SEARCH:', {
        userId, 
        telegramId: socket.data.user.telegramId,
        useGeolocation: data.criteria.useGeolocation,
        hasLocation: !!data.criteria.location,
        location: data.criteria.location,
        criteria: data.criteria
      });

      await this.searchCircuitBreaker.execute(
        async () => {
          const telegramId = socket.data.user.telegramId;
          socket.join(`search:${userId}`);

          const search: SearchResult = await SearchService.startSearch(
            userId,
            telegramId,
            data.criteria
          );

          if (search.status === 'searching') {
            socket.emit('search:status', { status: 'searching' });
          } else if (search.status === 'cancelled' || search.status === 'expired') {
            socket.emit('search:expired');
            socket.leave(`search:${userId}`);
          }
        },
        async () => {
          socket.emit('error', { 
            message: 'Search service is temporarily unavailable. Please try again later.'
          });
          socket.leave(`search:${userId}`);
        }
      );
    } catch (error) {
      socket.emit('error', {
        message: error instanceof Error ? error.message : 'Failed to start search'
      });
      socket.leave(`search:${userId}`);
    }
  }

  private async handleSearchCancel(socket: TypedSocket) {
    try {
      const userId = socket.data.user._id.toString();
      
      // Отменяем поиск через сервис
      const cancelledSearch = await SearchService.cancelSearch(userId);
      
      if (cancelledSearch) {
        // Удаляем пользователя из комнаты поиска
        socket.leave(`search:${userId}`);
        socket.emit('search:status', { status: 'cancelled' });
        
        // Обновляем статус активности пользователя, чтобы убедиться что он остается активным
        User.findByIdAndUpdate(userId, {
          isActive: true,
          lastActive: new Date()
        }).catch((error: unknown) => {
          wsLogger.error('update_activity_after_cancel', userId, error as Error);
        });
      }

    } catch (error) {
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Failed to cancel search'
      });
    }
  }

  private async handleContactRequest(socket: TypedSocket, data: any) {
    const fromUserId = socket.data.user._id.toString();
    this.sendToUser(data.to, 'contact:request', {
      from: fromUserId,
      chatId: data.chatId
    });
  }

  private async handleContactResponse(socket: TypedSocket, data: any) {
    const responderId = socket.data.user._id.toString();
    this.sendToUser(data.userId, 'contact:status', {
      userId: responderId,
      status: data.status
    });
  }
} 