import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateContactDto } from './dto/create-contact.dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ContactService {
  constructor(private readonly configService: ConfigService) {}

  async sendMessage(createContactDto: CreateContactDto) {
    try {
      const transporter = nodemailer.createTransport({
        service: this.configService.get('EMAIL_SERVICE') || 'gmail',
        auth: {
          user: this.configService.get('EMAIL_USER'),
          pass: this.configService.get('EMAIL_PASS'),
        },
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1a1a1a; color: #fff; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
            .info-row { margin: 15px 0; padding: 10px; background-color: #fff; border-left: 4px solid #1a1a1a; }
            .label { font-weight: bold; color: #1a1a1a; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>TRT-Parts</h1>
              <p>Yangi xabar</p>
            </div>
            <div class="content">
              <div class="info-row">
                <span class="label">Ism:</span> ${createContactDto.name}
              </div>
              <div class="info-row">
                <span class="label">Telefon:</span> ${createContactDto.phone}
              </div>
              <div class="info-row">
                <span class="label">Izoh:</span><br>
                ${createContactDto.comment.replace(/\n/g, '<br>')}
              </div>
            </div>
            <div class="footer">
              <p>Bu xabar TRT-Parts veb-sayti orqali yuborilgan</p>
              <p>&copy; ${new Date().getFullYear()} TRT-Parts. Barcha huquqlar himoyalangan.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: `"TRT-Parts" <${this.configService.get('EMAIL_FROM')}>`,
        to: this.configService.get('EMAIL_TO'),
        subject: `TRT-Parts - Yangi xabar: ${createContactDto.name}`,
        text: `
TRT-Parts - Yangi xabar

Ism: ${createContactDto.name}
Telefon: ${createContactDto.phone}
Izoh: ${createContactDto.comment}

---
Bu xabar TRT-Parts veb-sayti orqali yuborilgan
        `,
        html: htmlContent,
      };

      await transporter.sendMail(mailOptions);
      return { message: 'Xabar muvaffaqiyatli yuborildi' };
    } catch (error) {
      throw new InternalServerErrorException('Xabar yuborishda xatolik yuz berdi');
    }
  }

  async getContactInfo() {
    return {
      title: 'Biz bilan bog\'lanish',
      contacts: 'Kontaktlar',
      description: 'Biz bilan bog\'lanish uchun quyidagi ma\'lumotlarni ishlating',
      phone_label: 'Telefon',
      phone: this.configService.get('CONTACT_PHONE') || '+998901234567',
      email: this.configService.get('CONTACT_EMAIL') || 'contact@trt-parts.com',
      address: this.configService.get('CONTACT_ADDRESS') || 'Toshkent, Chilanzar, 45-uy',
      form_title: 'Xabar yuborish',
      name_label: 'Ism',
      phone_label_form: 'Telefon raqami',
      comment_label: 'Izoh',
      submit_button: 'Yuborish',
      data_processing_consent: 'Ma\'lumotlarimni qayta ishlashga roziman',
      company_name: 'TRT-Parts',
      company_description: 'Avtomobil ehtiyot qismlari yetkazib beruvchi kompaniya',
    };
  }
}