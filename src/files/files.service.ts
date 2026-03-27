import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

@Injectable()
export class FilesService {
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'files');

  constructor(private readonly configService: ConfigService) {
    // Upload papkani yaratish
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  getFileUrl(filename: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:7000';
    return `${baseUrl}/files/view/${filename}`;
  }

  async uploadFile(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('Fayl yuborilmadi');
    }

    return {
      url: this.getFileUrl(file.filename),
    };
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<Array<{ url: string }>> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Fayllar yuborilmadi');
    }

    return files.map(file => ({
      url: this.getFileUrl(file.filename),
    }));
  }

  getFilePath(fileName: string): string | null {
    if (!fileName) {
      return null;
    }
    const filePath = resolve(this.uploadsDir, fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
    return null;
  }
}
