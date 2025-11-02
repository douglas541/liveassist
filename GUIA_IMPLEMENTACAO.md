# Guia de Implementação - LiveAssist Chatbot

## Visão Geral

Chatbot LLM-first com arquitetura extensível baseada em especificações JSON. Cada módulo (dieta, agenda, exercícios) é uma especificação que define metadados e modelos de dados, permitindo adicionar novos agentes sem modificar código core.

**Stack:** Node.js (TypeScript), SQLite, OpenAI API, Telegram Bot API

## Arquitetura

### Princípios Fundamentais

1. **LLM-First**: Decisões e interpretações feitas pela LLM
2. **Determinismo de Dados**: Estruturas JSON bem definidas e validáveis
3. **Agnosticismo de Especificação**: Código core não conhece domínios específicos
4. **Extensibilidade**: Novos módulos via especificações sem alterar código

### Componentes Principais

```
┌─────────────────┐
│   Telegram Bot  │
└────────┬────────┘
         │
┌────────▼────────────────────────┐
│     Message Handler             │
│  (rota para especificação)      │
└────────┬────────────────────────┘
         │
┌────────▼────────────────────────┐
│   Specification Manager         │
│  (carrega e valida specs)       │
└────────┬────────────────────────┘
         │
┌────────▼────────────────────────┐
│      LLM Orchestrator           │
│  (contexto + spec + histórico)  │
└────────┬────────────────────────┘
         │
┌────────▼────────────────────────┐
│   Generic Record Manager        │
│  (CRUD agnóstico)               │
└────────┬────────────────────────┘
         │
┌────────▼────────────────────────┐
│      SQLite Database            │
└─────────────────────────────────┘
```

## Estrutura do Banco de Dados

### Tabela: `users`

Armazena informações dos usuários.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PRIMARY KEY | ID único do usuário no banco |
| `telegram_id` | TEXT NOT NULL UNIQUE | ID do usuário no Telegram |
| `name` | TEXT | Nome do usuário (nullable) |
| `created_at` | DATETIME | Data de criação do cadastro |

**Índices:**
- `telegram_id` - busca rápida por ID do Telegram (UNIQUE)

### Tabela: `specifications`

Armazena as especificações dos agentes/módulos. Cada usuário tem sua própria especificação com configurações personalizadas.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PRIMARY KEY | ID único |
| `type` | TEXT NOT NULL | Tipo da especificação (ex: 'diet', 'agenda', 'exercise') |
| `user_id` | INTEGER NOT NULL | FK para users.id |
| `created_at` | DATETIME | Data de criação |
| `updated_at` | DATETIME | Última atualização |
| `spec_json` | TEXT NOT NULL | JSON da especificação (metadados + modelo + configurações do usuário) |
| `active` | BOOLEAN | Se está ativa |

**Índices:**
- `(user_id, type)` - busca por usuário e tipo
- `(active, type)` - busca especificações ativas

**Nota:** O `spec_json` contém tanto o modelo genérico quanto as configurações específicas do usuário (ex: `target_macros` para dieta), preenchidas durante o cadastro/criação da especificação.

### Tabela: `records`

Armazena registros seguindo o modelo da especificação.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PRIMARY KEY | ID único |
| `spec_id` | INTEGER NOT NULL | FK para specifications.id |
| `user_id` | INTEGER NOT NULL | FK para users.id |
| `created_at` | DATETIME | Data/hora do registro |
| `record_json` | TEXT NOT NULL | JSON do registro (segue modelo da spec) |
| `processed_at` | DATETIME | Quando foi processado pela LLM |

**Índices:**
- `(spec_id, created_at)` - busca por especificação e data
- `(user_id, created_at)` - busca por usuário e período

### Tabela: `reminders`

Armazena lembretes agendados.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PRIMARY KEY | ID único |
| `spec_id` | INTEGER NOT NULL | FK para specifications.id |
| `user_id` | INTEGER NOT NULL | FK para users.id |
| `reminder_type` | TEXT | Tipo: 'one_time', 'recurring', 'interval' |
| `next_execution` | DATETIME | Próxima execução |
| `reminder_config` | TEXT | JSON com config de recorrência/intervalo (para calcular next_execution) |
| `message_template` | TEXT | Template da mensagem |
| `action_config` | TEXT | JSON com configuração da ação a ser executada (opcional) |
| `record_id` | INTEGER | FK para records.id (opcional, para referência ao registro original) |
| `active` | BOOLEAN | Se está ativo |

**Índices:**
- `(spec_id, next_execution)` - busca por especificação e próxima execução
- `(user_id, next_execution)` - busca por usuário e próxima execução
- `(active, next_execution)` - busca lembretes ativos para execução

## Modelos JSON

### Especificação de Dieta

```json
{
  "metadata": {
    "version": "1.0",
    "description": "Assistente de dieta e nutrição",
    "capabilities": [
      "registrar_refeicao",
      "consultar_macros",
      "relatorio_diario",
      "feedback_nutricional"
    ]
  },
  "target_macros": {
    "calories": null,
    "protein_g": null,
    "carb_g": null,
    "fat_g": null,
    "fiber_g": null,
    "description": "Valores configurados durante cadastro/criação da especificação do usuário"
  },
  "daily_schedule": {
    "breakfast": null,
    "lunch": null,
    "dinner": null,
    "snacks": null,
    "description": "Horários de refeições configurados durante cadastro/criação da especificação do usuário"
  },
  "record_model": {
    "type": "object",
    "required": ["meal_type", "foods", "timestamp"],
    "properties": {
      "meal_type": {
        "type": "string",
        "enum": ["breakfast", "lunch", "dinner", "snack", "other"],
        "description": "Tipo de refeição"
      },
      "foods": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name", "quantity", "unit"],
          "properties": {
            "name": {
              "type": "string",
              "description": "Nome do alimento"
            },
            "quantity": {
              "type": "number",
              "description": "Quantidade"
            },
            "unit": {
              "type": "string",
              "description": "Unidade (g, ml, unidade, etc)"
            }
          }
        }
      },
      "estimated_nutrition": {
        "type": "object",
        "properties": {
          "calories": {"type": "number"},
          "protein_g": {"type": "number"},
          "carb_g": {"type": "number"},
          "fat_g": {"type": "number"},
          "fiber_g": {"type": "number"}
        },
        "description": "Estimativa nutricional calculada pela LLM"
      },
      "timestamp": {
        "type": "string",
        "format": "datetime",
        "description": "Data/hora da refeição"
      },
      "notes": {
        "type": "string",
        "description": "Observações adicionais"
      }
    }
  },
  "llm_instructions": {
    "system_prompt": "Você é um assistente nutricional. Quando o usuário descrever uma refeição, estime os macronutrientes com precisão. Use tabelas nutricionais conhecidas.",
    "context_guidelines": [
      "Sempre estime calorias e macros para cada alimento",
      "Considere preparação (frito, grelhado, etc) ao estimar",
      "Forneça estimativas realistas baseadas em porções comuns brasileiras"
    ]
  }
}
```

### Exemplo de Registro de Dieta

```json
{
  "meal_type": "lunch",
  "foods": [
    {
      "name": "arroz branco cozido",
      "quantity": 100,
      "unit": "g"
    },
    {
      "name": "carne vermelha grelhada",
      "quantity": 150,
      "unit": "g"
    },
    {
      "name": "salada verde mista",
      "quantity": 100,
      "unit": "g"
    }
  ],
  "estimated_nutrition": {
    "calories": 545,
    "protein_g": 38.5,
    "carb_g": 62,
    "fat_g": 14,
    "fiber_g": 2.5
  },
  "timestamp": "2024-01-15T13:30:00",
  "notes": "Refeição completa, sem molhos adicionais"
}
```

### Especificação de Agenda/Lembretes

```json
{
  "metadata": {
    "version": "1.0",
    "description": "Assistente de agenda e lembretes",
    "capabilities": [
      "criar_lembrete",
      "listar_lembretes",
      "cancelar_lembrete",
      "lembrete_intervalo",
      "lembrete_recorrente"
    ]
  },
  "record_model": {
    "type": "object",
    "required": ["reminder_type", "title"],
    "properties": {
      "reminder_type": {
        "type": "string",
        "enum": ["one_time", "recurring", "interval"],
        "description": "Tipo de lembrete"
      },
      "title": {
        "type": "string",
        "description": "Título/descrição do lembrete"
      },
      "message": {
        "type": "string",
        "description": "Mensagem a ser enviada"
      },
      "scheduled_time": {
        "type": "string",
        "format": "datetime",
        "description": "Para one_time e recurring: data/hora"
      },
      "recurrence": {
        "type": "object",
        "properties": {
          "frequency": {
            "type": "string",
            "enum": ["daily", "weekly", "monthly"],
            "description": "Frequência de repetição"
          },
          "days_of_week": {
            "type": "array",
            "items": {"type": "integer", "minimum": 0, "maximum": 6},
            "description": "Para weekly: dias da semana (0=domingo)"
          },
          "end_date": {
            "type": "string",
            "format": "date",
            "description": "Data de término (opcional)"
          }
        }
      },
      "interval_config": {
        "type": "object",
        "properties": {
          "interval_hours": {
            "type": "number",
            "description": "Intervalo em horas"
          },
          "start_time": {
            "type": "string",
            "format": "time",
            "description": "Hora de início (HH:mm)"
          },
          "end_time": {
            "type": "string",
            "format": "time",
            "description": "Hora de término (HH:mm)"
          },
          "total_count": {
            "type": "integer",
            "description": "Número total de lembretes"
          },
          "message_per_reminder": {
            "type": "string",
            "description": "Mensagem para cada lembrete"
          }
        },
        "description": "Configuração para lembretes em intervalo"
      },
      "created_at": {
        "type": "string",
        "format": "datetime"
      },
      "status": {
        "type": "string",
        "enum": ["active", "completed", "cancelled"],
        "description": "Status do lembrete"
      }
    }
  },
  "llm_instructions": {
    "system_prompt": "Você é um assistente de agenda. Interprete pedidos de lembretes e crie registros estruturados. Entenda recorrências, intervalos e horários.",
    "context_guidelines": [
      "Traduza linguagem natural em configurações estruturadas",
      "Valide horários e intervalos",
      "Para intervalos, calcule quantos lembretes serão necessários"
    ]
  }
}
```

### Exemplo de Registro de Agenda (Intervalo)

```json
{
  "reminder_type": "interval",
  "title": "Tomar água",
  "message": "Lembrete: hora de tomar água!",
  "interval_config": {
    "interval_hours": 2,
    "start_time": "08:00",
    "end_time": "22:00",
    "total_count": 8,
    "message_per_reminder": "Beba água agora! Você já bebeu X de 3000ml hoje."
  },
  "created_at": "2024-01-15T08:00:00",
  "status": "active"
}
```

## Fluxos de Trabalho

### 1. Processamento de Mensagem do Usuário

```
1. Recebe mensagem do Telegram
2. Busca ou cria usuário pelo telegram_id, obtém user_id (ID interno)
3. LLM determina intenção e tipo de especificação
4. Busca especificação ativa do tipo identificado para o usuário
5. Se não existe:
   - LLM pode sugerir criar especificação
   - Ou criar automaticamente iniciando processo de cadastro
   - Durante cadastro, LLM coleta informações específicas do usuário
     (ex: target_macros para dieta) e cria spec_json com configurações
6. Carrega especificação (spec_json) com configurações do usuário
7. Busca registros recentes relacionados (contexto)
8. Monta prompt com:
   - System prompt da especificação
   - Histórico de registros (últimos N)
   - Mensagem do usuário
   - Modelo JSON esperado
9. LLM processa e retorna:
   - Ação: "create_record", "query", "update", "feedback", etc
   - Dados estruturados (se aplicável)
   - Resposta ao usuário
10. Executa ação determinística
11. Envia resposta ao usuário
```

### 2. Criação de Registro

```
1. LLM retorna ação "create_record" com JSON válido
2. Valida JSON contra record_model da especificação (validação leve)
3. Insere em records:
   - spec_id
   - user_id
   - created_at (pode vir do JSON ou usar agora)
   - record_json (JSON completo)
4. Se o registro JSON contiver informações de agendamento/lembrete, 
   LLM pode indicar ação adicional "create_reminder" que cria entrada
   em reminders usando:
   - spec_id do registro
   - reminder_type apropriado
   - reminder_config extraído do registro (recurrence ou interval_config)
   - record_id (referência ao registro)
5. Retorna confirmação
```

### 3. Consulta/Relatório

```
1. LLM identifica ação "query" ou "report"
2. Determina período (hoje, semana, mês, etc)
3. Busca registros do spec_id no período
4. Monta contexto com:
   - Especificação completa (inclui configurações do usuário como target_macros)
   - Todos os registros do período
5. LLM gera relatório/feedback usando as configurações do usuário
6. Retorna ao usuário
```

### 4. Lembretes Agendados

```
1. Worker/scheduler verifica reminders onde next_execution <= agora
2. Para cada lembrete ativo:
   - Busca especificação pelo spec_id
   - Busca usuário pelo user_id para obter telegram_id
   - Lê reminder_config (para calcular próximo next_execution)
   - Lê action_config (se presente, define ação a executar)
   - Monta contexto conforme necessário (pode incluir registros recentes da especificação se action_config especificar)
   - LLM gera mensagem personalizada usando instruções da especificação (se necessário)
   - Executa ação definida (enviar mensagem, gerar relatório, etc)
   - Envia mensagem via Telegram usando telegram_id
   - Atualiza next_execution conforme reminder_type usando reminder_config:
     * one_time: marca como completed (active = false)
     * recurring: calcula próximo baseado em reminder_config (frequency, days_of_week, etc)
     * interval: incrementa contador, se < total_count calcula próximo baseado em reminder_config (interval_hours, etc)
```

## Operações Genéricas (Agnósticas)

### UserManager

```typescript
class UserManager {
    async getOrCreateUser(telegramId: string, name?: string): Promise<number>
    async getUserByTelegramId(telegramId: string): Promise<User>
    async getUser(userId: number): Promise<User>
    async updateUser(userId: number, name?: string): Promise<void>
}
```

### SpecificationManager

```typescript
class SpecificationManager {
    async getSpec(userId: number, specType: string): Promise<Specification>
    async createSpec(userId: number, specType: string, specJson: object): Promise<number>
    async updateSpec(specId: number, specJson: object): Promise<void>
    async listSpecs(userId: number): Promise<Specification[]>
}
```

### RecordManager

```typescript
class RecordManager {
    async createRecord(specId: number, userId: number, recordJson: object): Promise<number>
    async getRecords(
        specId: number, 
        startDate: Date, 
        endDate: Date
    ): Promise<Record[]>
    async getRecentRecords(specId: number, limit: number = 10): Promise<Record[]>
    async updateRecord(recordId: number, recordJson: object): Promise<void>
}
```

### LLMOrchestrator

```typescript
class LLMOrchestrator {
    async processMessage(
        userMessage: string,
        spec: Specification,
        recentRecords: Record[],
        userId: number
    ): Promise<{ action: string; data?: object; response: string }>
    
    async generateFeedback(
        spec: Specification,
        records: Record[],
        query: string
    ): Promise<string>
    
    async estimateNutrition(foods: Food[]): Promise<NutritionInfo>
}
```

## Extensibilidade

### Adicionar Novo Módulo

1. Criar `spec_json` com:
   - metadata (descrição, capabilities)
   - record_model (JSON Schema)
   - llm_instructions (system prompt, guidelines)
   - Qualquer metadado específico do domínio

2. Inserir especificação no banco (manualmente ou via comando)

3. Código core não precisa mudar - LLM interpreta a nova especificação

### Compatibilidade de Versões

- Especificações têm `version` em metadata
- LLM recebe histórico completo e pode interpretar registros antigos
- Validação de `record_model` é flexível (aceita campos extras)
- Migração de dados pode ser feita via script quando necessário

## Processo de Cadastro de Especificação

Quando uma especificação não existe para o usuário, o sistema inicia um processo de cadastro onde a LLM coleta informações específicas do usuário através de perguntas. Os campos coletados variam conforme o tipo de especificação.

### Exemplo: Cadastro de Especificação de Dieta

**Interação de Cadastro:**

```
Usuário: "Quero começar a registrar minha dieta"
Bot: "Ótimo! Vou te ajudar. Primeiro, preciso de algumas informações:
      1. Qual sua meta diária de calorias? (ex: 2000 kcal)
      2. Quantos gramas de proteína por dia? (ex: 150g)
      3. Quantos gramas de carboidratos? (ex: 200g)
      4. Quantos gramas de gordura? (ex: 67g)
      5. Quantos gramas de fibra? (ex: 25g)"

Usuário: "2000 calorias, 150g proteína, 200g carboidratos, 67g gordura, 25g fibra"

Bot: "Perfeito! Agora me diga seus horários de refeições:
      - Café da manhã (ex: 07:00-09:00)
      - Almoço (ex: 12:00-14:00)
      - Jantar (ex: 19:00-21:00)
      - Lanches (ex: 10:00-11:00, 16:00-17:00)"

Usuário: "Café 7h-9h, almoço 12h-14h, jantar 19h-21h, lanches 10h e 16h"

Bot: "Configuração concluída! Sua especificação de dieta foi criada.
      Agora você pode começar a registrar suas refeições!"
```

**JSON Resultante (spec_json):**

```json
{
  "metadata": {
    "version": "1.0",
    "description": "Assistente de dieta e nutrição",
    "capabilities": ["registrar_refeicao", "consultar_macros", "relatorio_diario", "feedback_nutricional"]
  },
  "target_macros": {
    "calories": 2000,
    "protein_g": 150,
    "carb_g": 200,
    "fat_g": 67,
    "fiber_g": 25
  },
  "daily_schedule": {
    "breakfast": "07:00-09:00",
    "lunch": "12:00-14:00",
    "dinner": "19:00-21:00",
    "snacks": ["10:00-11:00", "16:00-17:00"]
  },
  "record_model": { /* ... modelo JSON ... */ },
  "llm_instructions": { /* ... instruções ... */ }
}
```

### Outros Campos Personalizados (Exemplos)

#### Para Especificação de Exercícios (Futuro)

Campos que seriam coletados durante cadastro:

```json
{
  "target_macros": { /* ... */ },
  "daily_schedule": { /* ... */ },
  "physical_profile": {
    "age": null,
    "height_cm": null,
    "weight_kg": null,
    "activity_level": null,
    "fitness_goals": null,
    "description": "Informações físicas coletadas durante cadastro"
  },
  "exercise_preferences": {
    "training_frequency_per_week": null,
    "preferred_exercises": null,
    "equipment_available": null,
    "injuries_or_limitations": null,
    "description": "Preferências e limitações coletadas durante cadastro"
  }
}
```

#### Campos Personalizados Gerais

Qualquer especificação pode ter campos personalizados preenchidos durante cadastro:

- **Informações demográficas**: idade, altura, peso
- **Metas e objetivos**: targets, goals, preferences
- **Preferências**: schedules, routines, aversions
- **Limitações**: restrições, alergias, lesões
- **Histórico relevante**: histórico médico, histórico de treinos, etc.

## Exemplos de Interações

### Dieta - Cadastro Inicial

**Usuário:** "Quero começar a usar o assistente de dieta"

**Fluxo:**
1. Sistema detecta que não existe especificação de dieta para o usuário
2. LLM inicia processo de cadastro interativo
3. LLM faz perguntas sobre target_macros, daily_schedule, etc.
4. Usuário responde de forma natural
5. LLM extrai informações e monta spec_json completo
6. Sistema cria especificação com spec_json preenchido
7. Bot confirma criação: "Configuração concluída! Agora você pode registrar suas refeições."

### Dieta - Registrar Refeição

**Usuário:** "Comi 100g de arroz, 150g de carne vermelha e 100g de salada verde"

**Fluxo:**
1. LLM identifica: ação = "create_record", spec_type = "diet"
2. LLM estrutura JSON seguindo record_model
3. LLM estima nutrição usando conhecimentos
4. Sistema cria registro
5. Resposta: "Registrado! ~545 kcal, 38.5g proteína, 62g carboidratos..."

### Dieta - Consulta

**Usuário:** "Já bati a meta de proteínas hoje?"

**Fluxo:**
1. LLM identifica: ação = "query", spec_type = "diet", período = "today"
2. Busca especificação de dieta do usuário (contém target_macros configurados)
3. Busca registros de hoje
4. Soma proteínas de todos os registros
5. Compara com target_macros.protein_g da especificação do usuário
6. LLM gera resposta: "Sim! Você já consumiu 165g de proteína hoje, acima da meta de 150g."

### Agenda - Criar Lembrete Intervalo

**Usuário:** "Me lembre de tomar água de 2 em 2 horas começando às 8h da manhã para eu tomar 3l de água no dia até as 22h"

**Fluxo:**
1. LLM identifica: ação = "create_record", spec_type = "agenda"
2. Busca spec_id da especificação de agenda do usuário
3. LLM calcula: 8h até 22h = 14 horas, intervalo de 2h = 8 lembretes
4. LLM estrutura JSON com interval_config
5. Sistema cria registro na tabela records (com spec_id da agenda) e obtém record_id
6. Sistema cria entrada em reminders com:
   - spec_id da agenda
   - reminder_type="interval"
   - reminder_config extraído do interval_config do registro (interval_hours, start_time, end_time, total_count)
   - record_id (referência ao registro original)
   - next_execution calculado (primeira execução às 8h)
7. Resposta: "Lembrete criado! Você receberá 8 lembretes de 2 em 2 horas das 8h às 22h."

### Integração entre Módulos

**Usuário:** "Às 22h todos os dias, me envie um relatório com as calorias e macros que consumi no dia"

**Fluxo:**
1. LLM identifica duas ações:
   - Criar lembrete recorrente (agenda)
   - Lembrete que executa consulta de dieta
2. Busca spec_id da especificação de agenda do usuário
3. Busca spec_id da especificação de dieta do usuário
4. Cria registro em agenda com reminder_type="recurring" e obtém record_id
5. Cria entrada em reminders com:
   - spec_id (da agenda)
   - reminder_type="recurring"
   - reminder_config extraído do recurrence do registro (frequency, days_of_week, end_date)
   - record_id (referência ao registro original)
   - action_config contendo:
     * action: "generate_report"
     * target_spec_id: (spec_id da dieta)
     * período: "today"
6. Worker às 22h:
   - Lê action_config do lembrete
   - Busca especificação de dieta usando target_spec_id do action_config
   - Busca registros de dieta do dia
   - Gera relatório via LLM
   - Envia ao usuário

## Considerações de Implementação

### Validação JSON

- Validação leve: apenas estrutura básica (campos obrigatórios, tipos)
- Usar bibliotecas como `zod` ou `ajv` para validação de schemas
- LLM é responsável por preencher corretamente
- Aceita campos extras para compatibilidade futura

### Performance

- Cache de especificações (são pouco alteradas) - usar `node-cache` ou Redis
- Índices no banco para queries por data
- Limitar histórico enviado à LLM (ex: últimos 20 registros ou últimos 7 dias)
- Usar `better-sqlite3` para performance de leitura
- Considerar connection pooling para operações assíncronas

### Segurança

- Validação de user_id em todas as operações
- Sanitização de dados antes de enviar à LLM
- Rate limiting por usuário (usar `express-rate-limit` ou similar)
- Validação de entrada do Telegram
- Armazenar chaves de API em variáveis de ambiente

### Logs e Debugging

- Usar `winston` ou `pino` para logging estruturado
- Logar todas as interações LLM (prompts e respostas)
- Logar operações de banco
- Manter histórico de erros de parsing JSON
- Usar TypeScript para type safety

## Próximos Passos (Futuro)

### Assistente de Exercícios

Especificação similar com:
- `record_model` para treinos executados
- Metadados: frequência semanal, objetivos, histórico de lesões
- Capacidades: montar treino, ajustar carga, dar feedback

### Multiplataforma

- Abstrair `MessageSender` (interface)
- Implementações: `TelegramSender`, `WhatsAppSender`
- Bot core permanece agnóstico

