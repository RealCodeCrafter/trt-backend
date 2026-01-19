import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @ApiBody({ type: CreateContactDto })
  async sendMessage(@Body() createContactDto: CreateContactDto) {
    return await this.contactService.sendMessage(createContactDto);
  }

  @Get()
  async getContactInfo() {
    return await this.contactService.getContactInfo();
  }
}