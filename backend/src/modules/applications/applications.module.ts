import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StudentApplication } from '../../entities/student-application.entity';
import { Programme } from '../../entities/programme.entity';
import { MinioModule } from '../../common/modules/minio.module';
import { AuditModule } from '../audit/audit.module';
import { StudentsModule } from '../students/students.module';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudentApplication, Programme]),
    MinioModule,
    AuditModule,
    StudentsModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
