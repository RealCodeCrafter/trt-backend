import { Controller, Get, Post, Body, Param, Query, Delete, Put, UseInterceptors, UploadedFiles, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
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

@ApiTags('Products')
@Controller('products')
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Post()
  @ApiBearerAuth('bearer')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sku', 'translations', 'trtCode', 'brand'],
      properties: {
        sku: { type: 'string', example: 'SKU-001' },
        translations: {
          type: 'string',
          description: 'JSON string. Example: {"en":{"name":"Brake Pad"},"ru":{"name":"Колодка тормозная"}}',
        },
        trtCode: { type: 'string', example: 'TRT-001' },
        brand: { type: 'string', example: 'Toyota' },
        carName: { type: 'string', description: 'JSON array string. Example: ["Camry","Corolla"]' },
        model: { type: 'string', description: 'JSON array string. Example: ["2020","2021"]' },
        oem: { type: 'string', description: 'JSON array string. Example: ["OEM123","OEM456"]' },
        years: { type: 'string', description: 'JSON array string. Example: ["2020","2021"]' },
        categories: { type: 'string', description: 'JSON number array string. Example: [1,2]' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
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
  @ApiParam({ name: 'id', required: true, type: Number })
  async findOne(@Param('id') id: string) {
    return await this.partsService.findOne(+id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('superAdmin', 'admin')
  @Put(':id')
  @ApiBearerAuth('bearer')
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', required: true, type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sku: { type: 'string' },
        translations: {
          type: 'string',
          description: 'JSON string. Example: {"en":{"name":"Updated"},"ru":{"name":"Обновлено"}}',
        },
        trtCode: { type: 'string' },
        brand: { type: 'string' },
        carName: { type: 'string', description: 'JSON array string' },
        model: { type: 'string', description: 'JSON array string' },
        oem: { type: 'string', description: 'JSON array string' },
        years: { type: 'string', description: 'JSON array string' },
        categories: { type: 'string', description: 'JSON number array string' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
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
  @ApiBearerAuth('bearer')
  @ApiParam({ name: 'id', required: true, type: Number })
  async remove(@Param('id') id: string) {
    return await this.partsService.remove(+id);
  }

  @Get('oem/all')
  async getAllOem() {
    return await this.partsService.getAllOem();
  }

  @Get('oem/:oem')
  @ApiParam({ name: 'oem', required: true, type: String })
  async getOemId(@Param('oem') oem: string) {
    return await this.partsService.getOemId(oem);
  }

  @Get('trt/:trt')
  @ApiParam({ name: 'trt', required: true, type: String })
  async getTrtCode(@Param('trt') trt: string) {
    return await this.partsService.getTrtCode(trt);
  }

  @Get('brand/:brand')
  @ApiParam({ name: 'brand', required: true, type: String })
  async getBrand(@Param('brand') brand: string) {
    return await this.partsService.getBrand(brand);
  }

  @Get('part/search')
  @ApiQuery({ name: 'oem', required: false, type: String })
  @ApiQuery({ name: 'trt', required: false, type: String })
  @ApiQuery({ name: 'brand', required: false, type: String })
  @ApiQuery({ name: 'model', required: false, type: String })
  async search(
    @Query('oem') oem: string,
    @Query('trt') trt: string,
    @Query('brand') brand: string,
    @Query('model') model: string,
  ) {
    return await this.partsService.search(oem, trt, brand, model);
  }

  @Get('part/category/:categoryId')
  @ApiParam({ name: 'categoryId', required: true, type: Number })
  async getPartsByCategory(@Param('categoryId') categoryId: string) {
    return await this.partsService.getPartsByCategory(+categoryId);
  }

  @Get('uploads/:imageName')
  @ApiParam({ name: 'imageName', required: true, type: String })
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
  @ApiQuery({ name: 'value', required: false, type: String })
  async searchByName(@Query('value') name?: string) {
    // Swagger/frontend /products ni query'siz chaqirganda ham 500 bo'lmasin
    if (!name || !name.trim()) {
      return await this.partsService.findAll();
    }
    return await this.partsService.searchByName(name);
  }

  @Get('all/count')
  async getTotalCount() {
    return await this.partsService.getTotalCount();
  }
}