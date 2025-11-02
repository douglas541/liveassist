import { getQuery, runQuery, getOne } from '../database';
import { Record } from '../types';
import { logger } from '../utils/logger';
import { getCurrentTimestamp } from '../utils/datetime';
import { config } from '../config';

export class RecordManager {
  async createRecord(specId: number, userId: number, recordJson: object): Promise<number> {
    try {
      const timestamp = getCurrentTimestamp();
      await runQuery(
        'INSERT INTO records (spec_id, user_id, record_json, created_at, processed_at) VALUES (?, ?, ?, ?, ?)',
        [specId, userId, JSON.stringify(recordJson), timestamp, timestamp]
      );

      const record = await getOne(
        'SELECT id FROM records WHERE spec_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
        [specId, userId]
      );
      const recordId = record?.id as number;

      logger.info('Record created', { recordId, specId, userId });
      return recordId;
    } catch (error) {
      logger.error('Error in createRecord', { error, specId, userId });
      throw error;
    }
  }

  async getRecords(specId: number, startDate: Date, endDate: Date): Promise<Record[]> {
    try {
      const records = await getQuery(
        'SELECT * FROM records WHERE spec_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC',
        [specId, startDate.toISOString(), endDate.toISOString()]
      );

      return records as Record[];
    } catch (error) {
      logger.error('Error in getRecords', { error, specId });
      throw error;
    }
  }

  async getRecentRecords(specId: number, limit: number = 10): Promise<Record[]> {
    try {
      const records = await getQuery(
        'SELECT * FROM records WHERE spec_id = ? ORDER BY created_at DESC LIMIT ?',
        [specId, limit.toString()]
      );

      return records as Record[];
    } catch (error) {
      logger.error('Error in getRecentRecords', { error, specId });
      throw error;
    }
  }

  async getTodayRecords(specId: number): Promise<Record[]> {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: config.app.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      
      const todayDate = formatter.format(new Date());

      const records = await getQuery(
        `SELECT * FROM records 
         WHERE spec_id = ? 
         AND (
           created_at LIKE ? 
           OR DATE(created_at) = ?
         )
         ORDER BY created_at DESC`,
        [specId, `${todayDate}%`, todayDate]
      );

      return records as Record[];
    } catch (error) {
      logger.error('Error in getTodayRecords', { error, specId });
      throw error;
    }
  }

  async updateRecord(recordId: number, recordJson: object): Promise<void> {
    try {
      await runQuery('UPDATE records SET record_json = ? WHERE id = ?', [JSON.stringify(recordJson), recordId]);
      logger.info('Record updated', { recordId });
    } catch (error) {
      logger.error('Error in updateRecord', { error, recordId });
      throw error;
    }
  }

  async getRecordsByUserId(userId: number, specType: string, startDate: Date, endDate: Date): Promise<Record[]> {
    try {
      const records = await getQuery(
        `SELECT r.* FROM records r
         JOIN specifications s ON r.spec_id = s.id
         WHERE r.user_id = ? AND s.type = ? 
         AND r.created_at BETWEEN ? AND ?
         ORDER BY r.created_at DESC`,
        [userId, specType, startDate.toISOString(), endDate.toISOString()]
      );

      return records as Record[];
    } catch (error) {
      logger.error('Error in getRecordsByUserId', { error, userId, specType });
      throw error;
    }
  }
}
