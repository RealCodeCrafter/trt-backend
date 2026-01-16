import { Controller, Post, Body, Get } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  async sendMessage(@Body() createContactDto: CreateContactDto) {
    return await this.contactService.sendMessage(createContactDto);
  }

  @Get()
  async getContactInfo() {
    return await this.contactService.getContactInfo();
  }
}