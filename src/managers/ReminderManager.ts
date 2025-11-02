import { getQuery, runQuery, getOne } from '../database';
import { Reminder } from '../types';
import { logger } from '../utils/logger';

export class ReminderManager {
  async createReminder(
    specId: number,
    userId: number,
    reminderType: 'one_time' | 'recurring' | 'interval',
    nextExecution: Date,
    reminderConfig: object,
    messageTemplate?: string,
    actionConfig?: object,
    recordId?: number
  ): Promise<number> {
    try {
      await runQuery(
        `INSERT INTO reminders 
         (spec_id, user_id, reminder_type, next_execution, reminder_config, message_template, action_config, record_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          specId,
          userId,
          reminderType,
          nextExecution.toISOString(),
          JSON.stringify(reminderConfig),
          messageTemplate || null,
          actionConfig ? JSON.stringify(actionConfig) : null,
          recordId || null,
        ]
      );

      const reminder = await getOne(
        'SELECT id FROM reminders WHERE spec_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
        [specId, userId]
      );
      const reminderId = reminder?.id as number;

      logger.info('Reminder created', { reminderId, specId, userId, reminderType });
      return reminderId;
    } catch (error) {
      logger.error('Error in createReminder', { error, specId, userId });
      throw error;
    }
  }

  async getDueReminders(): Promise<Reminder[]> {
    try {
      const now = new Date().toISOString();
      const reminders = await getQuery(
        'SELECT * FROM reminders WHERE active = 1 AND next_execution <= ? ORDER BY next_execution ASC',
        [now]
      );

      return reminders as Reminder[];
    } catch (error) {
      logger.error('Error in getDueReminders', { error });
      throw error;
    }
  }

  async updateNextExecution(reminderId: number, nextExecution: Date): Promise<void> {
    try {
      await runQuery('UPDATE reminders SET next_execution = ? WHERE id = ?', [nextExecution.toISOString(), reminderId]);
      logger.debug('Reminder next execution updated', { reminderId, nextExecution });
    } catch (error) {
      logger.error('Error in updateNextExecution', { error, reminderId });
      throw error;
    }
  }

  async markAsCompleted(reminderId: number): Promise<void> {
    try {
      await runQuery('UPDATE reminders SET active = 0 WHERE id = ?', [reminderId]);
      logger.info('Reminder marked as completed', { reminderId });
    } catch (error) {
      logger.error('Error in markAsCompleted', { error, reminderId });
      throw error;
    }
  }

  async getUserReminders(userId: number, active: boolean = true): Promise<Reminder[]> {
    try {
      const reminders = await getQuery(
        'SELECT * FROM reminders WHERE user_id = ? AND active = ? ORDER BY next_execution ASC',
        [userId, active ? 1 : 0]
      );

      return reminders as Reminder[];
    } catch (error) {
      logger.error('Error in getUserReminders', { error, userId });
      throw error;
    }
  }

  async cancelReminder(reminderId: number): Promise<void> {
    try {
      await runQuery('UPDATE reminders SET active = 0 WHERE id = ?', [reminderId]);
      logger.info('Reminder cancelled', { reminderId });
    } catch (error) {
      logger.error('Error in cancelReminder', { error, reminderId });
      throw error;
    }
  }
}
