import { Global, Module } from '@nestjs/common';
import { MinioProvider, MINIO_CLIENT } from '../providers/minio.provider';

@Global()
@Module({
  providers: [MinioProvider],
  exports: [MINIO_CLIENT],
})
export class MinioModule {}
