import { Controller, Post, UploadedFile, UploadedFiles, UseInterceptors, BadRequestException, UseGuards } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { FilesService } from './files.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decarotor';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Post('upload')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Bitta fayl yuklash (500 MB limit)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Har qanday turdagi fayl (500 MB gacha)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Fayl muvaffaqiyatli yuklandi' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 500 * 1024 * 1024, // 500 MB
      },
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'files');
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          callback(null, 'file-' + uniqueSuffix + extname(file.originalname));
        },
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Fayl yuborilmadi');
    }
    return await this.filesService.uploadFile(file);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Post('upload/multiple')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Bir nechta fayl yuklash (har biri 500 MB limit)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Har qanday turdagi fayllar (har biri 500 MB gacha)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Fayllar muvaffaqiyatli yuklandi' })
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: {
        fileSize: 500 * 1024 * 1024, // 500 MB
      },
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'files');
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          callback(null, 'file-' + uniqueSuffix + extname(file.originalname));
        },
      }),
    }),
  )
  async uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Fayllar yuborilmadi');
    }
    return await this.filesService.uploadFiles(files);
  }
}
