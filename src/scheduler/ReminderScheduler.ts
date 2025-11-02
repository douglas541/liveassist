import { ReminderManager } from '../managers/ReminderManager';
import { SpecificationManager } from '../managers/SpecificationManager';
import { UserManager } from '../managers/UserManager';
import { RecordManager } from '../managers/RecordManager';
import { LLMOrchestrator } from '../llm/LLMOrchestrator';
import { LiveAssistBot } from '../bot/TelegramBot';
import { logger } from '../utils/logger';
import { getTodayBounds } from '../utils/datetime';
import { config } from '../config';

export class ReminderScheduler {
  private reminderManager = new ReminderManager();
  private specManager = new SpecificationManager();
  private userManager = new UserManager();
  private recordManager = new RecordManager();
  private llmOrchestrator = new LLMOrchestrator();
  private bot: LiveAssistBot;
  private intervalId?: NodeJS.Timeout;
  private checkIntervalMs = 60000;

  constructor(bot: LiveAssistBot) {
    this.bot = bot;
  }

  start() {
    this.intervalId = setInterval(() => {
      this.processReminders().catch((error) => {
        logger.error('Error in reminder scheduler', { error });
      });
    }, this.checkIntervalMs);

    logger.info('Reminder scheduler started', { checkIntervalMs: this.checkIntervalMs });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Reminder scheduler stopped');
    }
  }

  private async processReminders() {
    try {
      const dueReminders = await this.reminderManager.getDueReminders();

      logger.info('Processing due reminders', { count: dueReminders.length });

      for (const reminder of dueReminders) {
        try {
          await this.processReminder(reminder);
        } catch (error) {
          logger.error('Error processing reminder', { error, reminderId: reminder.id });
        }
      }
    } catch (error) {
      logger.error('Error getting due reminders', { error });
    }
  }

  private async processReminder(reminder: any) {
    const user = await this.userManager.getUser(reminder.user_id);
    if (!user) {
      logger.warn('User not found for reminder', { reminderId: reminder.id, userId: reminder.user_id });
      return;
    }

    const spec = await this.specManager.getSpecWithId(reminder.user_id, 'agenda');
    if (!spec) {
      logger.warn('Spec not found for reminder', { reminderId: reminder.id });
      return;
    }

    const reminderConfig = JSON.parse(reminder.reminder_config);
    const actionConfig = reminder.action_config ? JSON.parse(reminder.action_config) : null;

    let message = reminder.message_template || 'Lembrete!';

    if (actionConfig?.action === 'generate_report') {
      const targetSpecId = actionConfig.target_spec_id;
      const period = actionConfig.period || 'today';

      const { startDate, endDate } = this.getPeriodDates(period);
      const records = await this.recordManager.getRecords(targetSpecId, startDate, endDate);

      const targetSpec = await this.specManager.getSpecWithId(reminder.user_id, 'diet');
      if (targetSpec && records.length > 0) {
        message = await this.llmOrchestrator.generateFeedback(
          targetSpec.data,
          records,
          'Gere um relatório do período'
        );
      }
    }

    await this.bot.sendMessageToUser(user.telegram_id, message);

    await this.updateReminderNextExecution(reminder, reminderConfig);

    logger.info('Reminder processed', { reminderId: reminder.id, userId: reminder.user_id });
  }

  private async updateReminderNextExecution(reminder: any, config: any) {
    if (reminder.reminder_type === 'one_time') {
      await this.reminderManager.markAsCompleted(reminder.id);
      return;
    }

    if (reminder.reminder_type === 'recurring') {
      const nextExecution = this.calculateNextRecurring(config);
      if (nextExecution) {
        await this.reminderManager.updateNextExecution(reminder.id, nextExecution);
      } else {
        await this.reminderManager.markAsCompleted(reminder.id);
      }
      return;
    }

    if (reminder.reminder_type === 'interval') {
      const nextExecution = this.calculateNextInterval(reminder.next_execution, config);
      if (nextExecution) {
        await this.reminderManager.updateNextExecution(reminder.id, nextExecution);
      } else {
        await this.reminderManager.markAsCompleted(reminder.id);
      }
      return;
    }
  }

  private calculateNextRecurring(config: any): Date | null {
    const now = new Date();
    
    if (config.frequency === 'daily') {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      return next;
    }

    if (config.frequency === 'weekly') {
      const next = new Date(now);
      next.setDate(next.getDate() + 7);
      return next;
    }

    if (config.frequency === 'monthly') {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);
      return next;
    }

    return null;
  }

  private calculateNextInterval(currentExecution: string, config: any): Date | null {
    const current = new Date(currentExecution);
    const intervalHours = config.interval_hours || 1;
    
    const next = new Date(current);
    next.setHours(next.getHours() + intervalHours);

    if (config.end_time) {
      const endParts = config.end_time.split(':');
      const endHour = parseInt(endParts[0]);
      
      if (next.getHours() > endHour) {
        return null;
      }
    }

    return next;
  }

  private getPeriodDates(period: string): { startDate: Date; endDate: Date } {
    if (period === 'today') {
      const { start, end } = getTodayBounds(config.app.timezone);
      return { startDate: start, endDate: end };
    }

    const { start: todayStart, end: todayEnd } = getTodayBounds(config.app.timezone);
    let startDate = new Date(todayStart);
    const endDate = new Date(todayEnd);

    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    return { startDate, endDate };
  }
}

