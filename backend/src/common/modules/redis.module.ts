import { Global, Module } from '@nestjs/common';
import { RedisProvider, REDIS_CLIENT } from '../providers/redis.provider';

@Global()
@Module({
  providers: [RedisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
