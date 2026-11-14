import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const logger = new Logger('RedisProvider');
    const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');

    // Upstash and other cloud Redis providers use rediss:// (TLS)
    const isTls = redisUrl.startsWith('rediss://');
    const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':***@');

    const client = new Redis(redisUrl, {
      tls: isTls ? { rejectUnauthorized: false } : undefined,
      // Stop retrying after 3 attempts to prevent DNS lookup thrashing & thread starvation
      retryStrategy: () => 15000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    // Attach explicit error handler so ioredis never throws an Unhandled error event
    client.on('error', (err) => {
      logger.warn(`Redis connection warning (${maskedUrl}): ${err.message}`);
    });

    client.on('connect', () => {
      logger.log('[RedisProvider] Connected to Redis successfully.');
    });

    return client;
  },
};
