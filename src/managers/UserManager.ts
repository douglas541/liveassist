import { runQuery, getOne } from '../database';
import { User } from '../types';
import { logger } from '../utils/logger';

export class UserManager {
  async getOrCreateUser(telegramId: string, name?: string): Promise<number> {
    try {
      let existing = await getOne('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
      
      logger.debug('Checking existing user', { telegramId, existing, existingId: existing?.id });

      if (existing && (existing.id !== undefined && existing.id !== null)) {
        const userId = Number(existing.id);
        if (!isNaN(userId) && userId > 0) {
          logger.debug('Returning existing user', { userId, telegramId });
          return userId;
        }
      }

      try {
        await runQuery('INSERT INTO users (telegram_id, name) VALUES (?, ?)', [telegramId, name || null]);
        logger.debug('User inserted successfully', { telegramId });
      } catch (insertError) {
        logger.debug('Insert failed, checking error type', { 
          telegramId, 
          error: insertError instanceof Error ? insertError.message : String(insertError) 
        });
        
        const errorMessage = insertError instanceof Error ? insertError.message : String(insertError);
        if (errorMessage.includes('UNIQUE constraint') || errorMessage.includes('UNIQUE')) {
          logger.debug('UNIQUE constraint detected, fetching existing user', { telegramId });
          
          for (let attempt = 0; attempt < 3; attempt++) {
            existing = await getOne('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
            logger.debug(`Fetched existing user after UNIQUE error (attempt ${attempt + 1})`, { 
              telegramId, 
              existing,
              existingType: typeof existing,
              existingKeys: existing ? Object.keys(existing) : null,
              existingId: existing?.id,
              existingIdType: typeof existing?.id
            });
            
            if (existing) {
              let userId: number | null = null;
              
              const idValue = existing.id;
              
              if (idValue !== undefined && idValue !== null) {
                if (Array.isArray(idValue) && idValue.length > 0) {
                  userId = Number(idValue[0]);
                } else if (Array.isArray(idValue) && idValue.length === 0) {
                  logger.debug('ID is empty array, trying to get value differently', { existing, telegramId });
                  continue;
                } else {
                  userId = Number(idValue);
                }
              } else {
                const firstKey = Object.keys(existing)[0];
                if (firstKey) {
                  const firstValue = existing[firstKey];
                  if (Array.isArray(firstValue) && firstValue.length > 0) {
                    userId = Number(firstValue[0]);
                  } else if (!Array.isArray(firstValue)) {
                    userId = Number(firstValue);
                  }
                }
              }
              
              if (userId !== null && !isNaN(userId) && userId > 0) {
                logger.info('User already exists, returned existing user', { userId, telegramId });
                return userId;
              }
            }
            
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          
          throw new Error(`User exists but could not retrieve ID after 3 attempts. telegramId: ${telegramId}, existing: ${JSON.stringify(existing)}`);
        }
        throw insertError;
      }

      const user = await getOne('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
      if (!user || user.id === undefined || user.id === null) {
        throw new Error(`Failed to create or retrieve user with telegram_id: ${telegramId}`);
      }

      const userId = Number(user.id);
      if (isNaN(userId)) {
        throw new Error(`Invalid user ID returned from database: ${user.id}`);
      }

      logger.info('User created', { userId, telegramId });
      return userId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Error in getOrCreateUser', { 
        error: errorMessage, 
        stack: errorStack,
        telegramId 
      });
      throw error;
    }
  }

  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    try {
      const user = await getOne('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
      return user as User | null;
    } catch (error) {
      logger.error('Error in getUserByTelegramId', { error, telegramId });
      throw error;
    }
  }

  async getUser(userId: number): Promise<User | null> {
    try {
      const user = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
      return user as User | null;
    } catch (error) {
      logger.error('Error in getUser', { error, userId });
      throw error;
    }
  }

  async updateUser(userId: number, name?: string): Promise<void> {
    try {
      await runQuery('UPDATE users SET name = ? WHERE id = ?', [name || null, userId]);
      logger.info('User updated', { userId, name });
    } catch (error) {
      logger.error('Error in updateUser', { error, userId });
      throw error;
    }
  }
}
