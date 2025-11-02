import { getQuery, runQuery, getOne } from '../database';
import { Specification, SpecificationData } from '../types';
import { logger } from '../utils/logger';
import { getCurrentTimestamp } from '../utils/datetime';
import NodeCache from 'node-cache';

const DIET_DAILY_REPORT_TEMPLATE =
  '\uD83D\uDCC5Relat\u00f3rio dieta hoje, {{data}}\n\n' +
  '- Calorias: {{calorias_consumidas}} / {{calorias_meta}} kcal\n' +
  '- Prote\u00edna: {{proteina_consumida}} g / {{proteina_meta}} g\n' +
  '- Carboidratos: {{carboidratos_consumidos}} g / {{carboidratos_meta}} g\n' +
  '- Gorduras: {{gorduras_consumidas}} g / {{gorduras_meta}} g\n\n' +
  '\u23F0 \u00daltima refei\u00e7\u00e3o: {{hora_ultima_refeicao}} ({{status_janela}})\n\n' +
  '\uD83C\uDF7D\uFE0F Faltam: {{calorias_restantes}} kcal';

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
      const specWithDefaults = this.applyDefaultResponseTemplates(specType, specJson);
      const timestamp = getCurrentTimestamp();
      await runQuery('INSERT INTO specifications (user_id, type, spec_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
        userId,
        specType,
        JSON.stringify(specWithDefaults),
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

  private applyDefaultResponseTemplates(specType: string, specJson: SpecificationData): SpecificationData {
    if (specType !== 'diet') {
      return specJson;
    }

    const specCopy: SpecificationData = { ...specJson };
    const llmInstructions = {
      ...(specCopy.llm_instructions ?? { system_prompt: '', context_guidelines: [] }),
    };

    const responseTemplates = { ...(llmInstructions.response_templates ?? {}) };

    if (!responseTemplates.daily_report) {
      responseTemplates.daily_report = DIET_DAILY_REPORT_TEMPLATE;
    }

    llmInstructions.response_templates = responseTemplates;
    specCopy.llm_instructions = llmInstructions;

    return specCopy;
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
