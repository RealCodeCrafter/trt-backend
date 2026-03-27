import { Controller, Post, Get, UploadedFile, UploadedFiles, UseInterceptors, BadRequestException, UseGuards, Param, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Response } from 'express';
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

  @Get('view/:fileName')
  @ApiOperation({ summary: 'Faylni ko\'rish (telefonda ham ishlaydi)' })
  @ApiParam({ name: 'fileName', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Fayl muvaffaqiyatli yuklandi' })
  async viewFile(@Param('fileName') fileName: string, @Res() res: Response) {
    const filePath = this.filesService.getFilePath(fileName);
    if (!filePath) {
      throw new NotFoundException('Fayl topilmadi');
    }
    
    // Telefonda ko'rish uchun to'g'ri headerlar
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Type', this.getContentType(fileName));
    
    return res.sendFile(filePath);
  }

  private getContentType(fileName: string): string {
    const ext = extname(fileName).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
