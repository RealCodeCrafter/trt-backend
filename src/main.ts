import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as cors from 'cors';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';

function parseCorsOrigins(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizePathSegment(value: string): string {
  // '/docs/' -> 'docs'
  const normalized = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized || 'docs';
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function createSwaggerBasicAuthMiddleware(user: string, pass: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
      return res.status(401).send('Authentication required');
    }

    const base64 = header.substring('Basic '.length);
    let decoded = '';
    try {
      decoded = Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
      return res.status(401).send('Authentication required');
    }

    const idx = decoded.indexOf(':');
    const providedUser = idx >= 0 ? decoded.slice(0, idx) : '';
    const providedPass = idx >= 0 ? decoded.slice(idx + 1) : '';

    if (!timingSafeEqualString(providedUser, user) || !timingSafeEqualString(providedPass, pass)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
      return res.status(401).send('Authentication required');
    }

    return next();
  };
}

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

  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const corsOrigins = parseCorsOrigins(configService.get<string>('CORS_ORIGIN'));
  if (isProd && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must be set in production (comma-separated list)');
  }
  const allowAllOrigins = corsOrigins.includes('*');

  app.use(
    cors({
      // CORS_ORIGIN=* bo'lsa hamma originlarga ruxsat beriladi (lekin credentials mumkin emas)
      origin: allowAllOrigins ? '*' : isProd ? corsOrigins : '*',
      // Wildcard origin bilan credentials ishlatish xavfli va brauzerlar bloklaydi
      credentials: allowAllOrigins ? false : isProd,
    }),
  );

  const swaggerEnabled = !isProd || configService.get<string>('SWAGGER_ENABLE') === 'true';
  if (swaggerEnabled) {
    const swaggerPath = normalizePathSegment(configService.get<string>('SWAGGER_PATH') || 'docs');
    const swaggerMountPath = `/${swaggerPath}`;

    // Production'da Swagger'ni Basic Auth bilan himoyalash tavsiya qilinadi
    const swaggerUser = configService.get<string>('SWAGGER_USER');
    const swaggerPass = configService.get<string>('SWAGGER_PASS');
    if (isProd) {
      if (!swaggerUser || !swaggerPass) {
        throw new Error('SWAGGER_USER and SWAGGER_PASS must be set when SWAGGER is enabled in production');
      }
      const swaggerAuth = createSwaggerBasicAuthMiddleware(swaggerUser, swaggerPass);
      // UI va OpenAPI JSON ham himoyalansin
      app.use(swaggerMountPath, swaggerAuth);
      app.use(`${swaggerMountPath}-json`, swaggerAuth);
    }

    const swaggerConfig = new DocumentBuilder()
      .setTitle('TRT-Parts API')
      .setDescription('TRT-Parts backend API (admin/superAdmin only).')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          in: 'header',
        },
        'bearer',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerMountPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = configService.get<number>('PORT') || 7000;
  const host = configService.get<string>('HOST') || '0.0.0.0';
  await app.listen(port, host);
}
bootstrap();