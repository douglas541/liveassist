import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { logger } from '../utils/logger';
import { MessageHandler } from './MessageHandler';
import { LLMOrchestrator } from '../llm/LLMOrchestrator';
import axios from 'axios';

export class LiveAssistBot {
  private bot: TelegramBot;
  private messageHandler: MessageHandler;
  private llmOrchestrator: LLMOrchestrator;

  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, { polling: true });
    this.messageHandler = new MessageHandler();
    this.llmOrchestrator = new LLMOrchestrator();
    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id.toString();
      const userName = msg.from?.first_name;

      if (!userId) {
        logger.warn('Message without user ID received');
        return;
      }

      try {
        let messageText = msg.text;

        if (!messageText && (msg.voice || msg.audio)) {
          await this.sendMessage(chatId, '🎤 Processando áudio...');
          messageText = await this.handleAudioMessage(msg);
          if (!messageText) {
            await this.sendMessage(chatId, 'Não consegui transcrever o áudio. Tente novamente.');
            return;
          }
          logger.info('Audio transcribed', { userId, chatId, text: messageText });
        }

        if (!messageText) {
          return;
        }

        logger.info('Message received', { userId, chatId, text: messageText });

        const response = await this.messageHandler.handleMessage(userId, userName || '', messageText);

        await this.sendMessage(chatId, response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error('Error handling message', { 
          error: errorMessage, 
          stack: errorStack,
          userId, 
          chatId 
        });
        await this.sendMessage(
          chatId,
          'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.'
        );
      }
    });

    this.bot.on('polling_error', (error) => {
      logger.error('Polling error', { error });
    });

    logger.info('Telegram bot handlers setup complete');
  }

  private async handleAudioMessage(msg: TelegramBot.Message): Promise<string | undefined> {
    try {
      const fileId = msg.voice?.file_id || msg.audio?.file_id;
      if (!fileId) {
        return undefined;
      }

      const file = await this.bot.getFile(fileId);
      if (!file.file_path) {
        logger.error('No file path for audio', { fileId });
        return undefined;
      }

      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const audioBuffer = Buffer.from(response.data);

      const mimeType = msg.voice ? 'audio/ogg' : (msg.audio?.mime_type || 'audio/mpeg');
      const transcription = await this.llmOrchestrator.transcribeAudio(audioBuffer, mimeType);

      return transcription;
    } catch (error) {
      logger.error('Error handling audio message', { error });
      return undefined;
    }
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    try {
      await this.bot.sendMessage(chatId, text);
      logger.debug('Message sent', { chatId });
    } catch (error) {
      logger.error('Failed to send message', {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async sendMessageToUser(telegramId: string, text: string): Promise<void> {
    try {
      await this.bot.sendMessage(telegramId, text, { parse_mode: 'Markdown' });
      logger.debug('Message sent to user', { telegramId });
    } catch (error) {
      logger.error('Error sending message to user', { error, telegramId });
      throw error;
    }
  }

  start() {
    logger.info('Telegram bot started', { botToken: config.telegram.botToken.substring(0, 10) + '...' });
  }

  stop() {
    this.bot.stopPolling();
    logger.info('Telegram bot stopped');
  }
}

