import { Socket } from 'socket.io';

export interface ServerToClientEvents {
  // Состояние соединения
  'connection:recovered': () => void;

  // Поиск и мэтчинг
  'search:matched': (data: {
    matchedUser: {
      telegramId: string;
      gender: 'male' | 'female';
      age: number;
      chatId: string;
    };
  }) => void;
  'search:expired': () => void;
  'search:status': (data: {
    status: 'searching' | 'cancelled' | 'expired' | 'matched'
  }) => void;
  'search:stats': (data: {
    t: number;  // total searching
    m: number;  // male searching
    f: number;  // female searching
    online: {
      t: number;  // total online
      m: number;  // male online
      f: number;  // female online
    }
  }) => void;

  // Чаты и сообщения
  'chat:message': (data: {
    chatId: string;
    content: string;
    userId: string;
  }) => void;
  'chat:typing': (data: {
    chatId: string;
    userId: string;
  }) => void;
  'chat:read': (data: {
    chatId: string;
    userId: string;
    timestamp: Date;
  }) => void;
  'chat:ended': (data: {
    chatId: string;
    endedBy: string;
    reason?: string;
  }) => void;
  'chat:rated': (data: {
    chatId: string;
    ratedBy: string;
    score: number;
  }) => void;

  // Контакты
  'contact:request': (data: {
    from: string;
    chatId: string;
  }) => void;
  'contact:status': (data: {
    userId: string;
    status: 'accepted' | 'declined' | 'blocked';
  }) => void;

  'error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  // Состояние соединения
  'connection:ack': () => void;

  // Поиск
  'search:start': (data: {
    criteria: {
      gender: 'male' | 'female';
      age: number;
      rating?: number;
      desiredGender: ('male' | 'female' | 'any')[];
      desiredAgeMin: number;
      desiredAgeMax: number;
      minAcceptableRating?: number;
      useGeolocation: boolean;
      location?: {
        longitude: number;
        latitude: number;
      };
      maxDistance?: number;
    };
  }) => void;
  'search:cancel': () => void;

  // Чаты
  'chat:join': (chatId: string) => void;
  'chat:leave': (chatId: string) => void;
  'chat:message': (data: {
    chatId: string;
    content: string;
  }) => void;
  'chat:typing': (chatId: string) => void;
  'chat:read': (data: {
    chatId: string;
    timestamp: Date;
  }) => void;
  'chat:end': (data: {
    chatId: string;
    reason?: string;
  }) => void;
  'chat:rate': (data: {
    chatId: string;
    score: number;
    comment?: string;
  }) => void;

  // Контакты
  'contact:request': (data: {
    to: string;
    chatId: string;
  }) => void;
  'contact:respond': (data: {
    userId: string;
    status: 'accepted' | 'declined' | 'blocked';
  }) => void;

  // Подписка на статистику
  'search:subscribe_stats': () => void;
  'search:unsubscribe_stats': () => void;
}

export interface SocketData {
  user: {
    _id: string | { toString(): string };
    telegramId: string;
  };
  searchCriteria?: {
    desiredGender: ('male' | 'female' | 'any')[];
    desiredAgeRanges: string[];
    useGeolocation: boolean;
    location?: {
      longitude: number;
      latitude: number;
    };
  };
  recovered?: boolean; // флаг восстановления соединения
}

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>, // InterServerEvents - пока не используем
  SocketData
>; 