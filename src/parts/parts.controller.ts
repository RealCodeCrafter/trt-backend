import { Controller, Get, Post, Body, Param, Query, Delete, Put, UseInterceptors, UploadedFiles, Res, UseGuards } from '@nestjs/common';
import { PartsService } from './parts.service';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decarotor';

@Controller('products')
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Post()
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'parts');
          const fs = require('fs');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          callback(null, 'part-' + uniqueSuffix + extname(file.originalname));
        },
      }),
    }),
  )
  async create(
    @Body() createPartDto: CreatePartDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return await this.partsService.create(createPartDto, files);
  }

  @Get('all')
  async findAll() {
    return await this.partsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.partsService.findOne(+id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Put(':id')
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads', 'parts');
          const fs = require('fs');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          callback(null, 'part-' + uniqueSuffix + extname(file.originalname));
        },
      }),
    }),
  )
  async update(
    @Param('id') id: string,
    @Body() updatePartDto: UpdatePartDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return await this.partsService.update(+id, updatePartDto, files);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.partsService.remove(+id);
  }

  @Get('oem/all')
  async getAllOem() {
    return await this.partsService.getAllOem();
  }

  @Get('oem/:oem')
  async getOemId(@Param('oem') oem: string) {
    return await this.partsService.getOemId(oem);
  }

  @Get('trt/:trt')
  async getTrtCode(@Param('trt') trt: string) {
    return await this.partsService.getTrtCode(trt);
  }

  @Get('brand/:brand')
  async getBrand(@Param('brand') brand: string) {
    return await this.partsService.getBrand(brand);
  }

  @Get('part/search')
  async search(
    @Query('oem') oem: string,
    @Query('trt') trt: string,
    @Query('brand') brand: string,
    @Query('model') model: string,
  ) {
    return await this.partsService.search(oem, trt, brand, model);
  }

  @Get('part/category/:categoryId')
  async getPartsByCategory(@Param('categoryId') categoryId: string) {
    return await this.partsService.getPartsByCategory(+categoryId);
  }

  @Get('uploads/:imageName')
  async getImage(@Param('imageName') imageName: string, @Res() res: Response) {
    const imagePath = await this.partsService.getImagePath(imageName);
    if (imagePath) {
      return res.sendFile(imagePath);
    }
    return res.status(404).send('Rasm topilmadi');
  }

  @Get('parts/categories')
  async getCategories() {
    return await this.partsService.getCategories();
  }

  @Get()
  async searchByName(@Query('value') name: string) {
    return await this.partsService.searchByName(name);
  }

  @Get('all/count')
  async getTotalCount() {
    return await this.partsService.getTotalCount();
  }
}