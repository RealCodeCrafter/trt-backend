import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as cors from 'cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.use(cors({
    origin: '*',
    credentials: true,
  }));

  const port = configService.get<number>('PORT') || 7000;
  const host = configService.get<string>('HOST') || '0.0.0.0';
  await app.listen(port, host);
}
bootstrap();