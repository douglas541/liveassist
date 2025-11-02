import { validateConfig } from './config';
import { initializeDatabase } from './database';
import { LiveAssistBot } from './bot/TelegramBot';
import { ReminderScheduler } from './scheduler/ReminderScheduler';
import { logger } from './utils/logger';

async function main() {
  try {
    logger.info('Starting LiveAssist Chatbot...');

    validateConfig();
    logger.info('Configuration validated');

    await initializeDatabase();
    logger.info('Database initialized');

    const bot = new LiveAssistBot();
    bot.start();

    const scheduler = new ReminderScheduler(bot);
    scheduler.start();

    logger.info('LiveAssist Chatbot is running');

    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      scheduler.stop();
      bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      scheduler.stop();
      bot.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Fatal error during startup', { error });
    process.exit(1);
  }
}

main();

