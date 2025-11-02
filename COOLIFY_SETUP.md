# Setup Rápido no Coolify

## ⚡ Configuração em 5 Minutos

### 1️⃣ Criar Aplicação no Coolify

```
New Resource → Application → Git Repository
```

### 2️⃣ Configurações de Build

- **Build Pack**: `Dockerfile`
- **Dockerfile Location**: `/Dockerfile`
- **Port**: ❌ Deixe vazio (não é webapp)
- **Health Check**: ❌ Desabilitar

### 3️⃣ Variáveis de Ambiente (OBRIGATÓRIAS)

Copie e cole no Coolify (Environment Variables):

```env
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
OPENAI_MODEL=gpt-5-mini
OPENAI_WHISPER_MODEL=whisper-1
TZ=America/Sao_Paulo
NODE_ENV=production
LOG_LEVEL=info
DATABASE_PATH=/app/data/liveassist.db
```

### 4️⃣ Volume Persistente (IMPORTANTE!)

**⚠️ Sem isso, o banco de dados será perdido a cada deploy!**

No Coolify, adicione volume:
- **Source Path**: `liveassist-data` (ou caminho no servidor)
- **Destination Path**: `/app/data`
- **Type**: Persistent Volume

### 5️⃣ Deploy

Clique em **Deploy** e aguarde ~2-3 minutos.

## ✅ Verificar se Funcionou

### Logs devem mostrar:

```
Starting LiveAssist Chatbot...
Configuration validated
Database initialized
Telegram bot handlers setup complete
LiveAssist Chatbot is running
```

### Testar no Telegram:

1. Abra conversa com o bot
2. Envie: `oi`
3. Bot deve responder: `Olá [Seu Nome]! 👋 ...`

## 🚨 Problemas Comuns

### ❌ Error: TELEGRAM_BOT_TOKEN is required
→ Falta configurar a variável de ambiente

### ❌ Error: 401 Unauthorized (Telegram)
→ Token do Telegram inválido. Pegue novo no @BotFather

### ❌ Error: Incorrect API key (OpenAI)
→ OpenAI API Key inválido ou sem créditos

### ❌ Bot perde memória após redeploy
→ Volume persistente não configurado! Veja passo 4️⃣

## 📊 Recursos Necessários

- **CPU**: 0.5 core (mínimo)
- **RAM**: 512 MB (recomendado 1 GB)
- **Disco**: 1 GB (banco cresce com uso)

## 🔄 Auto-Deploy (Opcional)

No Coolify, ative **Automatic Deployment**:
- Webhook do GitHub/GitLab
- Deploy automático a cada push

## 💰 Custos Estimados

### OpenAI (variável por uso):
- **gpt-5-mini**: ~$0.03 por 1K mensagens
- **whisper-1**: ~$0.006 por minuto de áudio

### Servidor (Coolify/VPS):
- VPS básico: $5-10/mês
- Suficiente para uso pessoal/pequeno

## 🔐 Segurança em Produção

✅ Nunca commite `.env` no git  
✅ Use variáveis de ambiente no Coolify  
✅ Rotacione tokens periodicamente  
✅ Configure rate limiting se público  

## 📞 Onde Conseguir Tokens

### OpenAI API Key:
1. Acesse: https://platform.openai.com/api-keys
2. Create new secret key
3. Copie e guarde (aparece só uma vez!)

### Telegram Bot Token:
1. Abra Telegram → procure @BotFather
2. `/newbot`
3. Siga instruções
4. Copie o token fornecido

## 🎯 Próximos Passos

Após deploy funcionando:
1. Configure sua dieta: envie `dieta` no Telegram
2. Registre refeições: texto ou áudio
3. Peça relatórios: `quantas calorias injeri hoje?`

---

**Dica**: Teste primeiro localmente com `yarn dev` antes de fazer deploy!

