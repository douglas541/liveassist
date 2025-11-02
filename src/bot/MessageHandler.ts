import { UserManager } from '../managers/UserManager';
import { SpecificationManager } from '../managers/SpecificationManager';
import { RecordManager } from '../managers/RecordManager';
import { ReminderManager } from '../managers/ReminderManager';
import { LLMOrchestrator } from '../llm/LLMOrchestrator';
import { logger } from '../utils/logger';

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

      const spec = await this.specManager.getSpecWithId(userId, specType);

      if (!spec) {
        return await this.initiateSetup(userId, specType);
      }

            const recentRecords = await this.recordManager.getTodayRecords(spec.id);

      const llmResponse = await this.llmOrchestrator.processMessage(
        message,
        spec.data,
        recentRecords,
        userId
      );

      await this.executeAction(llmResponse, userId, spec.id, specType);

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

  private async executeAction(
    llmResponse: any,
    userId: number,
    specId: number,
    _specType: string
  ): Promise<void> {
    const { action, data } = llmResponse;

    switch (action) {
      case 'create_record':
        await this.recordManager.createRecord(specId, userId, data);
        break;

      case 'create_reminder':
        if (data.reminder_type && data.next_execution && data.reminder_config) {
          const recordId = await this.recordManager.createRecord(specId, userId, data);
          
          await this.reminderManager.createReminder(
            specId,
            userId,
            data.reminder_type,
            new Date(data.next_execution),
            data.reminder_config,
            data.message_template,
            data.action_config,
            recordId
          );
        }
        break;

      case 'query':
        break;

      case 'feedback':
        break;

      default:
        logger.warn('Unknown action', { action });
    }
  }
}

