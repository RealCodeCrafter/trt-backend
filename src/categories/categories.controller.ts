import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { CategoryService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decarotor';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoryService: CategoryService) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Post()
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'categories');
          const fs = require('fs');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          callback(null, 'category-' + uniqueSuffix + extname(file.originalname));
        },
      }),
    }),
  )
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return await this.categoryService.create(createCategoryDto, files);
  }

  @Get()
  async findAll() {
    return await this.categoryService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.categoryService.findOne(+id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Patch(':id')
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'categories');
          const fs = require('fs');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          callback(null, 'category-' + uniqueSuffix + extname(file.originalname));
        },
      }),
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return await this.categoryService.updateCategory(+id, updateCategoryDto, files);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.categoryService.remove(+id);
  }
}