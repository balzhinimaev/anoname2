/**
 * Документация WebSocket API
 * @module websocket/docs
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     WebSocketEvent:
 *       type: object
 *       required:
 *         - type
 *         - payload
 *       properties:
 *         type:
 *           type: string
 *           description: Тип события
 *         payload:
 *           type: object
 *           description: Данные события
 *     WebSocketError:
 *       type: object
 *       required:
 *         - code
 *         - message
 *       properties:
 *         code:
 *           type: string
 *           description: Код ошибки
 *         message:
 *           type: string
 *           description: Описание ошибки
 */

/**
 * @swagger
 * tags:
 *   name: WebSocket
 *   description: WebSocket API для реал-тайм коммуникации
 */

/**
 * @swagger
 * /ws:
 *   get:
 *     tags: [WebSocket]
 *     summary: WebSocket соединение
 *     description: Устанавливает WebSocket соединение
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: JWT токен для аутентификации
 *     responses:
 *       101:
 *         description: WebSocket соединение установлено
 *       401:
 *         description: Неверный токен аутентификации
 */

/**
 * Клиентские события (от клиента к серверу)
 * @swagger
 * components:
 *   schemas:
 *     ClientEvents:
 *       type: object
 *       properties:
 *         join_chat:
 *           type: object
 *           required:
 *             - chatId
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата для подключения
 *         leave_chat:
 *           type: object
 *           required:
 *             - chatId
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата для отключения
 *         typing:
 *           type: object
 *           required:
 *             - chatId
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата, в котором пользователь печатает
 *         message:
 *           type: object
 *           required:
 *             - chatId
 *             - content
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата
 *             content:
 *               type: string
 *               description: Текст сообщения
 */

/**
 * Серверные события (от сервера к клиенту)
 * @swagger
 * components:
 *   schemas:
 *     ServerEvents:
 *       type: object
 *       properties:
 *         chat_joined:
 *           type: object
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата
 *             participants:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *         chat_left:
 *           type: object
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата
 *             userId:
 *               type: string
 *               format: mongoId
 *               description: ID пользователя, который покинул чат
 *         user_typing:
 *           type: object
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата
 *             userId:
 *               type: string
 *               format: mongoId
 *               description: ID пользователя, который печатает
 *         message_received:
 *           type: object
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата
 *             message:
 *               $ref: '#/components/schemas/Message'
 *         message_read:
 *           type: object
 *           properties:
 *             chatId:
 *               type: string
 *               format: mongoId
 *               description: ID чата
 *             messageId:
 *               type: string
 *               format: mongoId
 *               description: ID прочитанного сообщения
 *             userId:
 *               type: string
 *               format: mongoId
 *               description: ID пользователя, прочитавшего сообщение
 *         error:
 *           $ref: '#/components/schemas/WebSocketError'
 */

export const wsDocsInfo = {
  title: 'WebSocket API',
  version: '1.0.0',
  description: 'WebSocket API для реал-тайм коммуникации в анонимном чате'
}; 