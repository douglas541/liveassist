import { getQuery, runQuery, getOne } from '../database';
import { Specification, SpecificationData } from '../types';
import { logger } from '../utils/logger';
import { getCurrentTimestamp } from '../utils/datetime';
import NodeCache from 'node-cache';

export class SpecificationManager {
  private cache = new NodeCache({ stdTTL: 3600 });

  async getSpec(userId: number, specType: string): Promise<SpecificationData | null> {
    const cacheKey = `spec_${userId}_${specType}`;

    try {
      const cached = this.cache.get<SpecificationData>(cacheKey);
      if (cached) {
        return cached;
      }

      const spec = await getOne(
        'SELECT * FROM specifications WHERE user_id = ? AND type = ? AND active = 1',
        [userId, specType]
      );

      if (!spec) {
        return null;
      }

      const specData = JSON.parse(spec.spec_json) as SpecificationData;
      this.cache.set(cacheKey, specData);

      return specData;
    } catch (error) {
      logger.error('Error in getSpec', { error, userId, specType });
      throw error;
    }
  }

  async getSpecWithId(userId: number, specType: string): Promise<{ id: number; data: SpecificationData } | null> {
    try {
      const spec = await getOne(
        'SELECT * FROM specifications WHERE user_id = ? AND type = ? AND active = 1',
        [userId, specType]
      );

      if (!spec) {
        return null;
      }

      const specData = JSON.parse(spec.spec_json) as SpecificationData;
      return { id: spec.id, data: specData };
    } catch (error) {
      logger.error('Error in getSpecWithId', { error, userId, specType });
      throw error;
    }
  }

  async createSpec(userId: number, specType: string, specJson: SpecificationData): Promise<number> {
    try {
      const timestamp = getCurrentTimestamp();
      await runQuery('INSERT INTO specifications (user_id, type, spec_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
        userId,
        specType,
        JSON.stringify(specJson),
        timestamp,
        timestamp,
      ]);

      const spec = await getOne('SELECT id FROM specifications WHERE user_id = ? AND type = ?', [userId, specType]);
      const specId = spec?.id as number;

      this.cache.del(`spec_${userId}_${specType}`);

      logger.info('Specification created', { specId, userId, specType });
      return specId;
    } catch (error) {
      logger.error('Error in createSpec', { error, userId, specType });
      throw error;
    }
  }

  async updateSpec(specId: number, specJson: SpecificationData): Promise<void> {
    try {
      const timestamp = getCurrentTimestamp();
      await runQuery('UPDATE specifications SET spec_json = ?, updated_at = ? WHERE id = ?', [
        JSON.stringify(specJson),
        timestamp,
        specId,
      ]);

      const spec = await getOne('SELECT user_id, type FROM specifications WHERE id = ?', [specId]);

      if (spec) {
        this.cache.del(`spec_${spec.user_id}_${spec.type}`);
      }

      logger.info('Specification updated', { specId });
    } catch (error) {
      logger.error('Error in updateSpec', { error, specId });
      throw error;
    }
  }

  async listSpecs(userId: number): Promise<Specification[]> {
    try {
      const specs = await getQuery('SELECT * FROM specifications WHERE user_id = ? AND active = 1', [userId]);
      return specs as Specification[];
    } catch (error) {
      logger.error('Error in listSpecs', { error, userId });
      throw error;
    }
  }
}
