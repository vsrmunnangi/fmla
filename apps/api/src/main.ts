import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import './common/bigint-json';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // apps/web runs on its own origin (Vite dev server) — never talks to processor or the
  // DB directly (§9), but it does call this api cross-origin.
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen(process.env.PORT || 3001);
}

bootstrap();
