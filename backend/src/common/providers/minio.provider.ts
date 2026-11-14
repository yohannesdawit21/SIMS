import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

export const MINIO_CLIENT = 'MINIO_CLIENT';

export const MinioProvider: Provider = {
  provide: MINIO_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Minio.Client => {
    return new Minio.Client({
      endPoint: configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(configService.get<string>('MINIO_PORT', '9000'), 10),
      accessKey: configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
      useSSL: configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
    });
  },
};
