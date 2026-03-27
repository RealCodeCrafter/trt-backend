import { Controller, Post, Body } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @ApiBody({ type: CreateContactDto })
  async submit(@Body() createContactDto: CreateContactDto) {
    this.contactService.sendEmailAsync(createContactDto).catch((error) => {
      console.error('Background email yuborishda xato:', error);
    });

    return {
      success: true,
      message: 'Xabar qabul qilindi va yuborilmoqda!',
    };
  }
}