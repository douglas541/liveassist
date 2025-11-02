import OpenAI from 'openai';
import { config } from '../config';
import { SpecificationData, Record, LLMResponse, Food, NutritionInfo } from '../types';
import { logger } from '../utils/logger';

export class LLMOrchestrator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  private getTemperatureConfig(desiredTemperature: number): { temperature?: number } {
    const model = config.openai.model.toLowerCase();
    if (model.includes('gpt-5')) {
      return {};
    }
    return { temperature: desiredTemperature };
  }

  private getReportTemplateInstructions(spec: SpecificationData): string {
    const template = spec.llm_instructions?.response_templates?.daily_report;
    if (!template || typeof template !== 'string') {
      return '';
    }
    return `Formato obrigatório do relatório diário (substitua os placeholders {{ }} pelos valores reais, mantendo emojis, bullets e quebras de linha exatamente como abaixo):\n${template}`;
  }

  async transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<string> {
    try {
      const file = new File([audioBuffer], 'audio.ogg', { type: mimeType });
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: file,
        model: config.openai.whisperModel,
        language: 'pt',
      });

      logger.info('Audio transcribed', { 
        textLength: transcription.text.length 
      });

      return transcription.text;
    } catch (error) {
      logger.error('Error transcribing audio', { error });
      throw error;
    }
  }

  async processMessage(
    userMessage: string,
    spec: SpecificationData,
    recentRecords: Record[],
    userId: number
  ): Promise<LLMResponse> {
    try {
      const systemPrompt = spec.llm_instructions.system_prompt;
      const guidelines = spec.llm_instructions.context_guidelines.join('\n- ');
      const reportTemplateInstruction = this.getReportTemplateInstructions(spec);

      const recordsContext = recentRecords.length > 0
        ? `\n\nRegistros recentes do usuário:\n${recentRecords
            .map((r) => `- ${r.created_at}: ${r.record_json}`)
            .join('\n')}`
        : '';

      const specMetadata = JSON.stringify(
        Object.keys(spec)
          .filter((k) => k !== 'record_model' && k !== 'llm_instructions')
          .reduce((obj, key) => ({ ...obj, [key]: spec[key] }), {})
      );

      const prompt = `${systemPrompt}

Diretrizes:
- ${guidelines}

Especificação atual do usuário:
${specMetadata}

${recordsContext}

Modelo de registro esperado:
${JSON.stringify(spec.record_model, null, 2)}

Mensagem do usuário: "${userMessage}"

Responda em JSON com o seguinte formato:
{
  "action": "create_record | query | update | feedback | create_reminder | setup_spec",
  "data": { /* dados estruturados conforme a ação */ },
  "response": "mensagem amigável para o usuário"
}${reportTemplateInstruction ? `\n\n${reportTemplateInstruction}` : ''}`;

      const completion = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        ...this.getTemperatureConfig(0.7),
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const llmResponse = JSON.parse(content) as LLMResponse;

      logger.info('LLM response processed', {
        userId,
        action: llmResponse.action,
        tokensUsed: completion.usage?.total_tokens,
      });

      return llmResponse;
    } catch (error) {
      logger.error('Error in processMessage', { error, userId });
      throw error;
    }
  }

  async generateFeedback(spec: SpecificationData, records: Record[], query: string): Promise<string> {
    try {
      const systemPrompt = spec.llm_instructions.system_prompt;
      const reportTemplateInstruction = this.getReportTemplateInstructions(spec);

      const recordsData = records.map((r) => JSON.parse(r.record_json));

      const prompt = `${systemPrompt}

Especificação do usuário:
${JSON.stringify(spec, null, 2)}

Registros do período:
${JSON.stringify(recordsData, null, 2)}

Pergunta/pedido do usuário: "${query}"

Gere um feedback ou relatório detalhado baseado nos registros e na especificação do usuário.${reportTemplateInstruction ? `\n\n${reportTemplateInstruction}` : ''}`;

      const completion = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        ...this.getTemperatureConfig(0.7),
      });

      const feedback = completion.choices[0]?.message?.content || 'Não foi possível gerar feedback.';

      logger.info('Feedback generated', { recordCount: records.length });

      return feedback;
    } catch (error) {
      logger.error('Error in generateFeedback', { error });
      throw error;
    }
  }

  async estimateNutrition(foods: Food[]): Promise<NutritionInfo> {
    try {
      const prompt = `Estime os valores nutricionais totais para os seguintes alimentos:

${foods.map((f) => `- ${f.quantity}${f.unit} de ${f.name}`).join('\n')}

Retorne APENAS um JSON no formato:
{
  "calories": número,
  "protein_g": número,
  "carb_g": número,
  "fat_g": número,
  "fiber_g": número
}

Use tabelas nutricionais brasileiras conhecidas. Seja preciso.`;

      const completion = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'Você é um especialista em nutrição. Estime valores nutricionais com precisão.',
          },
          { role: 'user', content: prompt },
        ],
        ...this.getTemperatureConfig(0.3),
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No nutrition data from OpenAI');
      }

      const nutrition = JSON.parse(content) as NutritionInfo;

      logger.debug('Nutrition estimated', { foods: foods.length, nutrition });

      return nutrition;
    } catch (error) {
      logger.error('Error in estimateNutrition', { error });
      throw error;
    }
  }

  async collectSpecificationData(specType: string, userResponses: string[]): Promise<SpecificationData> {
    try {
      const prompt = `Você está ajudando a criar uma especificação de "${specType}" para um usuário.

Respostas do usuário durante o cadastro:
${userResponses.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Com base nas respostas, crie um JSON de especificação completo seguindo este formato:
{
  "metadata": {
    "version": "1.0",
    "description": "descrição do assistente",
    "capabilities": ["lista", "de", "capacidades"]
  },
  "record_model": { /* JSON Schema para registros */ },
  "llm_instructions": {
    "system_prompt": "prompt do sistema",
    "context_guidelines": ["guideline1", "guideline2"]
  },
  /* ... outros campos específicos como target_macros, daily_schedule, etc ... */
}

Extraia valores das respostas do usuário e preencha todos os campos relevantes para o tipo "${specType}".`;

      const completion = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente que estrutura especificações baseadas em respostas de usuários.',
          },
          { role: 'user', content: prompt },
        ],
        ...this.getTemperatureConfig(0.5),
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No specification data from OpenAI');
      }

      const specData = JSON.parse(content) as SpecificationData;

      logger.info('Specification data collected', { specType });

      return specData;
    } catch (error) {
      logger.error('Error in collectSpecificationData', { error, specType });
      throw error;
    }
  }
}

