# Quick Start

## ⚠️ Importante para Windows

Se estiver no Windows, consulte primeiro `WINDOWS_SETUP.md` para configurar as build tools necessárias.

## Instalação Rápida

```bash
# 1. Instalar dependências
npm install

# 2. Criar diretórios (Linux/Mac)
mkdir -p data logs

# 2. Criar diretórios (Windows PowerShell)
New-Item -ItemType Directory -Force -Path data,logs

# 3. O arquivo .env já está configurado com suas chaves

# 4. Inicializar banco de dados
npm run db:init

# 5. Executar
npm run dev
```

## Verificar se Está Funcionando

1. Abra o Telegram
2. Procure seu bot (username definido no BotFather)
3. Envie: "Olá"
4. Se receber resposta, está funcionando! ✅

## Primeiro Uso

### Configurar Dieta

```
Você: "Quero começar a registrar minha dieta"
Bot: [fará perguntas sobre suas metas]
```

Responda as perguntas sobre:
- Meta de calorias
- Proteínas
- Carboidratos
- Gorduras
- Horários de refeições

### Registrar Refeição

```
Você: "Comi 100g de arroz, 150g de frango e salada"
Bot: [registra e mostra calorias/macros]
```

### Consultar Progresso

```
Você: "Já bati a meta de proteínas hoje?"
Bot: [analisa registros e responde]
```

### Criar Lembrete

```
Você: "Me lembre de tomar água de 2 em 2 horas das 8h às 22h"
Bot: [cria lembrete com intervalo]
```

## Comandos NPM

```bash
npm run dev      # Desenvolvimento com auto-reload
npm run build    # Compilar TypeScript
npm start        # Executar produção
npm run db:init  # (Re)criar banco de dados
```

## Estrutura de Dados

Tudo é salvo em:
- `data/liveassist.db` - Banco SQLite
- `logs/` - Logs da aplicação

## Parar o Bot

Pressione `Ctrl+C` no terminal onde o bot está rodando.

## Documentação Completa

- `README.md` - Visão geral
- `INSTALL.md` - Instalação detalhada
- `WINDOWS_SETUP.md` - Configuração Windows
- `GUIA_IMPLEMENTACAO.md` - Arquitetura completa

## Troubleshooting

### Bot não responde
- Verifique se está rodando: `npm run dev`
- Veja os logs: `logs/error.log`

### Erro ao instalar dependências
- Windows: veja `WINDOWS_SETUP.md`
- Linux/Mac: instale build-essential/xcode

### Banco de dados não encontrado
```bash
npm run db:init
```

