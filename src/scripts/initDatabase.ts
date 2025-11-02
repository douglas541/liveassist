import { initializeDatabase } from '../database';
import { logger } from '../utils/logger';

(async () => {
  try {
    logger.info('Initializing database...');
    await initializeDatabase();
    logger.info('Database initialization complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error initializing database', { error });
    process.exit(1);
  }
})();
