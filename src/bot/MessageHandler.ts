import { UserManager } from '../managers/UserManager';
import { SpecificationManager } from '../managers/SpecificationManager';
import { RecordManager } from '../managers/RecordManager';
import { ReminderManager } from '../managers/ReminderManager';
import { LLMOrchestrator } from '../llm/LLMOrchestrator';
import { logger } from '../utils/logger';
import { SpecificationData } from '../types';

export class MessageHandler {
  private userManager = new UserManager();
  private specManager = new SpecificationManager();
  private recordManager = new RecordManager();
  private reminderManager = new ReminderManager();
  private llmOrchestrator = new LLMOrchestrator();
  private setupSessions = new Map<number, { specType: string; responses: string[] }>();
  private lastSpecPerUser = new Map<number, string>();

  async handleMessage(telegramId: string, userName: string, message: string): Promise<string> {
    try {
      const userId = await this.userManager.getOrCreateUser(telegramId, userName);

      if (this.setupSessions.has(userId)) {
        return await this.handleSetupSession(userId, message);
      }

      if (this.isGreeting(message)) {
        return this.getGreetingResponse(userName);
      }

      let specType = await this.detectSpecType(message);

      if (!specType) {
        specType = this.lastSpecPerUser.get(userId) ?? null;
        if (!specType) {
          return 'Desculpe, não consegui entender sua mensagem. Você pode me dizer sobre dieta, agenda/lembretes?';
        }
      }

      const specRecord = await this.specManager.getSpecWithId(userId, specType);

      if (!specRecord) {
        return await this.initiateSetup(userId, specType);
      }

      const { id: specId, data: specData } = specRecord;

      const recentRecords = await this.recordManager.getTodayRecords(specId);

      const llmResponse = await this.llmOrchestrator.processMessage(
        message,
        specData,
        recentRecords,
        userId
      );

      await this.executeAction(llmResponse, userId, specId, specType, specData);

      this.lastSpecPerUser.set(userId, specType);

      return llmResponse.response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Error in handleMessage', { 
        error: errorMessage, 
        stack: errorStack,
        telegramId 
      });
      throw error;
    }
  }

  private isGreeting(message: string): boolean {
    const lowerMsg = message.toLowerCase().trim();
    const greetings = [
      'oi', 'olá', 'ola', 'opa', 'eae', 'e aí', 'e ai',
      'hi', 'hello', 'hey', 'hey there',
      'bom dia', 'boa tarde', 'boa noite',
      'tudo bem', 'tudo bom', 'td bem', 'td bom'
    ];
    return greetings.some((greeting) => lowerMsg === greeting || lowerMsg.startsWith(greeting + ' '));
  }

  private getGreetingResponse(userName?: string): string {
    const name = userName ? `, ${userName}` : '';
    return `Oi${name}! 👋\n\nSou o LiveAssist e posso te ajudar com:\n\n• 📊 **Dieta**: Acompanhar suas refeições e macronutrientes\n• 📅 **Agenda/Lembretes**: Criar e gerenciar seus lembretes\n\nComo posso te ajudar hoje?`;
  }

  private async detectSpecType(message: string): Promise<string | null> {
    const lowerMsg = message.toLowerCase();
    const normalized = lowerMsg
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    const keywords = {
      diet: [
        'comi',
        'comida',
        'refeicao',
        'refeicoes',
        'dieta',
        'caloria',
        'calorias',
        'proteina',
        'proteinas',
        'macro',
        'macros',
        'alimento',
        'alimentos',
        'almoco',
        'almocar',
        'janta',
        'jantar',
        'lanche',
        'lanchar',
        'cafe da manha',
      ],
      agenda: [
        'lembrete',
        'lembretes',
        'lembra',
        'lembre',
        'lembrar',
        'lembro',
        'lembre-me',
        'agenda',
        'agendar',
        'aviso',
        'avisar',
        'avise',
        'notificacao',
        'notificar',
        'horario',
        'horarios',
        'hora',
        'horas',
        'compromisso',
        'compromissos',
        'evento',
        'eventos',
        'reuniao',
        'alarme',
        'alarmes',
        'escovar',
        'escove',
        'remover lembrete',
        'remova o lembrete',
        'cancelar lembrete',
        'ativar lembrete',
        'desativar lembrete',
      ],
    } as const;

    for (const [type, words] of Object.entries(keywords)) {
      if (words.some((word) => normalized.includes(word))) {
        return type;
      }
    }

    const timePattern = /\b\d{1,2}[:h]\d{2}\b/;
    if (timePattern.test(normalized)) {
      return 'agenda';
    }

    if (/\brefeicao(es)?\b/.test(normalized) || /\bquantas calorias\b/.test(normalized)) {
      return 'diet';
    }

    return null;
  }

  private async initiateSetup(userId: number, specType: string): Promise<string> {
    const questions = this.getSetupQuestions(specType);
    this.setupSessions.set(userId, { specType, responses: [] });

    return `Ótimo! Vamos configurar seu assistente de ${specType === 'diet' ? 'dieta' : 'agenda'}.\n\n${questions[0]}`;
  }

  private getSetupQuestions(specType: string): string[] {
    if (specType === 'diet') {
      return [
        'Qual sua meta diária de calorias? (ex: 2000 kcal)',
        'Quantos gramas de proteína por dia? (ex: 150g)',
        'Quantos gramas de carboidratos? (ex: 200g)',
        'Quantos gramas de gordura? (ex: 67g)',
        'Seus horários de refeições? (ex: Café 7h-9h, Almoço 12h-14h, Jantar 19h-21h)',
      ];
    } else if (specType === 'agenda') {
      return ['Pronto! Seu assistente de agenda está configurado. Você pode criar lembretes agora.'];
    }
    return [];
  }

  private async handleSetupSession(userId: number, message: string): Promise<string> {
    const session = this.setupSessions.get(userId)!;
    session.responses.push(message);

    const questions = this.getSetupQuestions(session.specType);

    if (session.responses.length < questions.length) {
      return questions[session.responses.length];
    }

    try {
      const specData = await this.llmOrchestrator.collectSpecificationData(
        session.specType,
        session.responses
      );

      await this.specManager.createSpec(userId, session.specType, specData);
      this.lastSpecPerUser.set(userId, session.specType);

      this.setupSessions.delete(userId);

      return `✅ Configuração concluída! Seu assistente de ${session.specType === 'diet' ? 'dieta' : 'agenda'} está pronto.\n\nAgora você pode começar a usá-lo!`;
    } catch (error) {
      this.setupSessions.delete(userId);
      throw error;
    }
  }

  private async handleSetupSpecAction(
    userId: number,
    specId: number,
    specType: string,
    currentSpec: SpecificationData,
    data: any
  ): Promise<void> {
    if (!data) {
      logger.warn('setup_spec triggered without data', { userId, specId, specType });
      return;
    }

    if (data.start_setup) {
      this.setupSessions.set(userId, { specType, responses: [] });
      return;
    }

    const updatePayload = this.extractSpecUpdates(data);

    if (!updatePayload) {
      logger.warn('setup_spec data did not contain updates', { userId, specId, specType, data });
      return;
    }

    const updatedSpec = JSON.parse(JSON.stringify(currentSpec));
    this.mergeDeep(updatedSpec, updatePayload);

    await this.specManager.updateSpec(specId, updatedSpec);
    logger.info('Specification updated via setup_spec', {
      specId,
      specType,
      updatedKeys: Object.keys(updatePayload),
    });
  }

  private extractSpecUpdates(data: any): any | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    if (data.spec && typeof data.spec === 'object') {
      return data.spec;
    }

    if (data.updates && typeof data.updates === 'object') {
      return data.updates;
    }

    if (data.spec_updates && typeof data.spec_updates === 'object') {
      return data.spec_updates;
    }

    const cloned = { ...data };
    delete cloned.spec_type;
    delete cloned.start_setup;
    delete cloned.mode;

    return Object.keys(cloned).length > 0 ? cloned : null;
  }

  private mergeDeep(target: any, source: any): void {
    for (const key of Object.keys(source)) {
      const value = source[key];

      if (Array.isArray(value)) {
        target[key] = value.slice();
        continue;
      }

      if (value && typeof value === 'object') {
        if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
          target[key] = {};
        }
        this.mergeDeep(target[key], value);
        continue;
      }

      target[key] = value;
    }
  }

  private async executeAction(
    llmResponse: any,
    userId: number,
    specId: number,
    specType: string,
    specData: SpecificationData
  ): Promise<void> {
    const { action, data } = llmResponse;

    switch (action) {
      case 'create_reminder':
        await this.handleCreateReminderAction(userId, specId, specData, data, llmResponse.response);
        break;

      case 'create_record':
        await this.handleCreateRecordAction(userId, specId, specType, specData, data, llmResponse.response);
        break;

      case 'setup_spec':
        await this.handleSetupSpecAction(userId, specId, specType, specData, data);
        break;

      case 'query':
        break;

      case 'feedback':
        break;

      default:
        logger.warn('Unknown action', { action });
    }
  }

  private async handleCreateReminderAction(
    userId: number,
    specId: number,
    specData: SpecificationData,
    data: any,
    llmResponseText?: string
  ): Promise<void> {
    const normalized = this.normalizeReminderPayload(data, specData);

    if (!normalized) {
      logger.warn('create_reminder payload missing required fields', { userId, specId, data });
      return;
    }

    await this.persistReminder(userId, specId, normalized, llmResponseText);
  }

  private async handleCreateRecordAction(
    userId: number,
    specId: number,
    specType: string,
    specData: SpecificationData,
    data: any,
    llmResponseText?: string
  ): Promise<void> {
    if (specType === 'agenda') {
      let normalized = this.normalizeReminderPayload(data, specData);
      if (!normalized && data && typeof data === 'object' && data.record) {
        normalized = this.normalizeReminderPayload(data.record, specData);
      }

      if (normalized) {
        await this.persistReminder(userId, specId, normalized, llmResponseText);
        return;
      }
    }

    const recordPayload = data && typeof data === 'object' && data.record ? data.record : data;

    await this.recordManager.createRecord(specId, userId, {
      ...recordPayload,
      llm_response: llmResponseText ?? null,
    });
  }

  private async persistReminder(
    userId: number,
    specId: number,
    normalized: {
      reminderType: 'one_time' | 'recurring' | 'interval';
      nextExecution: Date;
      reminderConfig: any;
      messageTemplate?: string;
      actionConfig?: any;
      recordPayload: any;
    },
    llmResponseText?: string
  ): Promise<void> {
    const recordId = await this.recordManager.createRecord(specId, userId, {
      ...normalized.recordPayload,
      llm_response: llmResponseText ?? null,
    });

    await this.reminderManager.createReminder(
      specId,
      userId,
      normalized.reminderType,
      normalized.nextExecution,
      normalized.reminderConfig,
      normalized.messageTemplate,
      normalized.actionConfig,
      recordId
    );

    logger.info('Reminder created', {
      userId,
      specId,
      reminderType: normalized.reminderType,
      nextExecution: normalized.nextExecution,
      offsets: normalized.reminderConfig?.reminder_offsets_minutes,
    });
  }

  private normalizeReminderPayload(data: any, specData: SpecificationData):
    | {
        reminderType: 'one_time' | 'recurring' | 'interval';
        nextExecution: Date;
        reminderConfig: any;
        messageTemplate?: string;
        actionConfig?: any;
        recordPayload: any;
      }
    | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const payload = data.reminder && typeof data.reminder === 'object' ? data.reminder : data;

    const datetimeValue =
      payload.datetime_iso ||
      payload.datetime ||
      payload.date_time ||
      payload.next_execution ||
      payload.start ||
      payload.start_at ||
      payload.when;

    if (!datetimeValue) {
      return null;
    }

    const parsedDate = new Date(datetimeValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    const reminderType =
      payload.reminder_type ||
      payload.type ||
      (payload.repeat && payload.repeat !== 'none' ? 'recurring' : 'one_time');

    const reminderConfig: any = {
      title: payload.title,
      description: payload.description,
      timezone: payload.timezone,
      reminder_offsets_minutes: undefined,
      repeat: payload.repeat,
      repeat_rule: payload.repeat_rule,
      metadata: payload.metadata,
    };

    if (data.notification_settings && typeof data.notification_settings === 'object') {
      reminderConfig.notification_settings = data.notification_settings;
    }

    if (!reminderConfig.reminder_offsets_minutes && data.reminder_offsets_minutes) {
      reminderConfig.reminder_offsets_minutes = data.reminder_offsets_minutes;
    }

    if (!reminderConfig.reminder_offsets_minutes && Array.isArray(payload.reminders)) {
      const offsets = payload.reminders
        .map((item: any) => Number(item.minutes_before))
        .filter((value: number) => Number.isFinite(value) && value >= 0);
      if (offsets.length > 0) {
        reminderConfig.reminder_offsets_minutes = offsets;
      }
    }

    if (!reminderConfig.reminder_offsets_minutes && specData?.notification_settings?.default_reminder_offsets_minutes) {
      reminderConfig.reminder_offsets_minutes = specData.notification_settings.default_reminder_offsets_minutes;
    }

    if (!reminderConfig.reminder_offsets_minutes) {
      reminderConfig.reminder_offsets_minutes = [15];
    }

    const messageTemplate = data.message_template || payload.message_template || undefined;
    const actionConfig = data.action_config || payload.action_config || undefined;

    const recordPayload = {
      reminder_id: payload.id,
      title: payload.title,
      datetime: parsedDate.toISOString(),
      timezone: payload.timezone,
      reminder_offsets_minutes: reminderConfig.reminder_offsets_minutes,
      raw_payload: payload,
    };

    return {
      reminderType: reminderType === 'interval' ? 'interval' : reminderType === 'recurring' ? 'recurring' : 'one_time',
      nextExecution: parsedDate,
      reminderConfig,
      messageTemplate,
      actionConfig,
      recordPayload,
    };
  }
}

