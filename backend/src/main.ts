import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';


// Gracefully handle unhandled Redis connection/DNS rejections so the process never crashes on Render
process.on('uncaughtException', (err: any) => {
  const msg = err?.message || String(err);
  if (err?.code === 'ENOTFOUND' || msg.includes('getaddrinfo') || msg.includes('Redis') || msg.includes('upstash')) {
    console.warn('[Process] Caught Redis network error gracefully (running without cache):', msg);
    return;
  }
  console.error('[Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason: any) => {
  const msg = (reason && (reason.message || reason.stack)) ? String(reason.message || reason.stack) : String(reason);
  if (msg.includes('getaddrinfo') || msg.includes('ENOTFOUND') || msg.includes('Redis') || msg.includes('upstash')) {
    console.warn('[Process] Caught unhandled Redis promise rejection gracefully (running without cache):', msg);
    return;
  }
  console.error('[Process] Unhandled Rejection:', reason);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS — allow Netlify frontend and local dev
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:80',
      /\.netlify\.app$/,
      /\.netlify\.live$/,
      process.env.FRONTEND_URL ?? '',
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global API prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', ''],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Listen on 0.0.0.0 so Render can detect the open port
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application running on port ${port}`);
}

bootstrap();
