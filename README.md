# LiveAssist Chatbot

Chatbot LLM-first com arquitetura extensível baseada em especificações JSON para assistente de vida (dieta, agenda, exercícios).

## Stack

- **Node.js** (TypeScript)
- **SQLite** (better-sqlite3)
- **OpenAI API** (GPT-4)
- **Telegram Bot API**

## Características

- 🤖 **LLM-First**: Decisões e interpretações feitas pela LLM
- 📊 **Determinismo de Dados**: Estruturas JSON bem definidas e validáveis
- 🔌 **Extensível**: Novos módulos via especificações sem alterar código core
- 🎯 **Agnóstico**: Código core não conhece domínios específicos

## Instalação

```bash
npm install
```

## Configuração

1. Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```

2. Preencha as variáveis de ambiente no arquivo `.env`:
```env
OPENAI_API_KEY=sua-chave-openai
TELEGRAM_BOT_TOKEN=seu-token-telegram
```

3. Inicialize o banco de dados:
```bash
npm run db:init
```

## Execução

### Desenvolvimento
```bash
npm run dev
```

### Produção
```bash
npm run build
npm start
```

## Estrutura do Projeto

```
src/
├── bot/              # Telegram Bot e handlers
├── config/           # Configurações
├── database/         # Database schema e conexão
├── llm/              # LLM Orchestrator
├── managers/         # Managers (User, Spec, Record, Reminder)
├── scheduler/        # Scheduler de lembretes
├── scripts/          # Scripts utilitários
├── types/            # TypeScript types
└── utils/            # Utilitários (logger, etc)
```

## Módulos Disponíveis

### Dieta
- Registrar refeições
- Consultar macros
- Relatórios diários
- Feedback nutricional

### Agenda/Lembretes
- Criar lembretes únicos
- Lembretes recorrentes (diário, semanal, mensal)
- Lembretes em intervalo
- Integração com outros módulos

## Como Usar

1. Inicie uma conversa com o bot no Telegram
2. Digite uma mensagem relacionada ao módulo desejado (ex: "Quero registrar minha dieta")
3. O bot iniciará o processo de cadastro se necessário
4. Após o cadastro, você pode usar o assistente normalmente

### Exemplos

**Dieta:**
- "Comi 100g de arroz, 150g de frango e salada"
- "Já bati a meta de proteínas hoje?"
- "Me mostre um relatório da semana"

**Agenda:**
- "Me lembre de tomar água de 2 em 2 horas"
- "Crie um lembrete às 22h todos os dias para me enviar relatório de dieta"
- "Liste meus lembretes ativos"

## Logs

Os logs são salvos em:
- `logs/combined.log` - Todos os logs
- `logs/error.log` - Apenas erros

## Documentação

Consulte o arquivo `GUIA_IMPLEMENTACAO.md` para detalhes completos da arquitetura e implementação.

## Licença

MIT

