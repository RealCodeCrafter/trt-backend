import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private createTransporter() {
    const port = Number(process.env.SMTP_PORT) || 25;
    const useSecure = process.env.SMTP_SECURE === 'true' || port === 465;
    const host = process.env.SMTP_HOST_IP || process.env.SMTP_HOST || '127.0.0.1';

    console.log(`📧 SMTP sozlamalari: ${host}:${port}, secure: ${useSecure}`);

    return nodemailer.createTransport({
      host: host,
      port: port,
      secure: useSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1',
        maxVersion: 'TLSv1.3',
      },
      requireTLS: true,
      ignoreTLS: false,
      logger: process.env.NODE_ENV === 'development',
      debug: process.env.NODE_ENV === 'development',
      connectionTimeout: 300000,
      greetingTimeout: 120000,
      socketTimeout: 300000,
      pool: false,
      maxConnections: 1,
      maxMessages: 1,
    } as any);
  }

  async sendEmail(data: CreateContactDto) {
    const s = (val?: string) => val?.toString().trim() || '—';

    const mailOptions = {
      from: `"TRT-Parts Contact" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_EMAIL,
      subject: `TRT-Parts – Yangi xabar: ${s(data.name)}`,
      html: `
        <h2>TRT-Parts saytidan yangi kontakt so‘rovi</h2>
        <p><strong>Ism:</strong> ${s(data.name)}</p>
        <p><strong>Telefon:</strong> ${s(data.phone)}</p>
        <p><strong>Izoh:</strong></p>
        <div style="background:#f5f5f5;padding:15px;border-left:4px solid #1a1a1a;white-space:pre-line;">
          ${s(data.comment)}
        </div>
        <hr>
        <small><strong>Vaqt:</strong> ${new Date().toLocaleString('uz-UZ')}</small>
      `,
      text: `
TRT-Parts saytidan yangi kontakt so'rovi

Ism: ${s(data.name)}
Telefon: ${s(data.phone)}
Izoh:
${s(data.comment)}

Vaqt: ${new Date().toLocaleString('uz-UZ')}
      `.trim(),
    };

    let lastError: any;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const transporter = this.createTransporter();
      try {
        const info = await transporter.sendMail(mailOptions);
        console.log('📨 TRT-Parts contact email yuborildi:', info.messageId);
        transporter.close();
        return info;
      } catch (error: any) {
        lastError = error;
        console.log(
          `⚠️ TRT-Parts email yuborishda xato (urinish ${attempt}/${maxAttempts}): ${
            error?.message || "Noma'lum xato"
          } (${error?.code || 'UNKNOWN'})`,
        );

        try {
          transporter.close();
        } catch {}

        if (attempt < maxAttempts) {
          const waitTime = attempt * 5000;
          console.log(`   ${waitTime / 1000}s keyin qayta urinilmoqda...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error('❌ TRT-Parts email yuborishda barcha urinishlar muvaffaqiyatsiz:', lastError);
    throw lastError;
  }

  async sendEmailAsync(data: CreateContactDto) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      name: data.name,
      phone: data.phone,
    };

    try {
      this.logEmail('START', logData, 'TRT-Parts email yuborish boshlandi');
      const info = await this.sendEmail(data);
      this.logEmail('SUCCESS', logData, `Email muvaffaqiyatli yuborildi: ${info.messageId}`);
      return info;
    } catch (error: any) {
      const fullError = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
      this.logEmail(
        'ERROR',
        logData,
        `Xato: ${error?.message || "Noma'lum xato"} | Code: ${error?.code || 'UNKNOWN'} | Response: ${
          error?.response || "yo'q"
        }`,
      );
      console.error('❌ TRT-Parts EMAIL YUBORISHDAGI XATO:', fullError);
    }
  }

  private logEmail(status: 'START' | 'SUCCESS' | 'ERROR', data: any, message: string) {
    try {
      const logsDir = join(__dirname, '..', '..', 'logs');
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

      const logFile = join(
        logsDir,
        `contact-trt-${new Date().toISOString().split('T')[0]}.log`,
      );
      const logMessage = `[${data.timestamp}] [${status}] ${data.name} | ${data.phone} | ${message}\n`;
      appendFileSync(logFile, logMessage, 'utf8');
    } catch (logError) {
      console.error('TRT-Parts contact log yozishda xato:', logError);
    }
  }
}