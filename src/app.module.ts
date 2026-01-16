import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { Part } from './parts/entities/part.entity';
import { User } from './auth/entities/auth.entity';
import { Category } from './categories/entities/category.entity';

import { AuthModule } from './auth/auth.module';
import { PartsModule } from './parts/parts.module';
import { CategoriesModule } from './categories/categories.module';
import { ContactModule } from './contact/contact.module';
import { AuthService } from './auth/auth.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get<string>('DB_TYPE') as any;
        const dbHost = configService.get<string>('DB_HOST');
        const dbPort = parseInt(configService.get<string>('DB_PORT') || '43482');
        const dbUsername = configService.get<string>('DB_USERNAME');
        const dbPassword = configService.get<string>('DB_PASSWORD');
        const dbDatabase = configService.get<string>('DB_DATABASE');
        const useSSL = configService.get<string>('DB_SSL') === 'true';

        const config: any = {
          type: dbType,
          host: dbHost,
          port: dbPort,
          username: dbUsername,
          password: dbPassword,
          database: dbDatabase,
          entities: [Part, User, Category],
          synchronize: true,
          autoLoadEntities: true,
        };

        // SSL faqat kerak bo'lganda qo'shiladi
        if (useSSL) {
          config.ssl = {
            rejectUnauthorized: false
          };
        }

        return config;
      },
      inject: [ConfigService],
    }),
    PartsModule,
    AuthModule,
    CategoriesModule,
    ContactModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}

  async onModuleInit() {
    await this.authService.createSuperAdminIfNotExists();
  }
}