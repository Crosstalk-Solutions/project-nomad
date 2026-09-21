# Implementação da Camada de Internacionalização (i18n) — Projeto Errante

## Contexto

O **Projeto Errante** é um fork do **Project N.O.M.A.D.**, uma aplicação full-stack composta por:

- **Backend**: AdonisJS v6 (Node.js, TypeScript)
- **Frontend**: React 19 via Inertia.js (SPA com server-driven routing)
- **Estilização**: TailwindCSS v4

**Escopo identificado pelo levantamento:**

| Categoria | Arquivos | Volume aprox. |
|---|---|---|
| Pages (`.tsx`) | 26 arquivos | ~400 KB |
| Components (`.tsx`) | 89 arquivos | ~430 KB |
| Layouts (`.tsx`) | 4 arquivos | ~6 KB |
| Hooks (`.ts`) | 21 arquivos | ~29 KB |
| Providers (`.tsx`) | 3 arquivos | ~5 KB |
| Backend Controllers (`.ts`) | 19 arquivos | ~130 KB |
| Edge Templates (`.edge`) | 1 arquivo | ~2 KB |
| **Total frontend traduzível** | **~124 arquivos .tsx** | **~870 KB** |

Atualmente, **100% dos textos estão hardcoded em inglês** diretamente nos componentes e páginas. Não existe nenhuma infraestrutura de i18n.
7
> **Estratégia**: Implementaremos a camada de i18n mantendo o idioma base como **inglês (en)**, extraindo todas as strings para arquivos de tradução `.json`. A tradução para `pt-BR` será feita **depois**, por uma equipe de tradutores, usando os arquivos gerados como base. Todo o trabalho será feito no **fork próprio** do repositório.

## Decisões de Design

### Biblioteca escolhida: `react-i18next`

Justificativa:
- O frontend é 100% React via Inertia — a tradução acontece inteiramente no lado do cliente
- `react-i18next` é o padrão de mercado para React, com 10M+ downloads/semana
- Suporta namespaces (permite dividir traduções por módulo/página), interpolação, pluralização e carregamento sob demanda (lazy loading)
- Não exige SSR (o projeto não usa SSR, conforme [`config/inertia.ts`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/config/inertia.ts) — `ssr.enabled: false`)
- Desacopla completamente do framework backend — não cria dependência do `@adonisjs/i18n`

### Estrutura de namespaces

As traduções serão organizadas em **namespaces** correspondentes a agrupamentos funcionais de UI, para facilitar o carregamento sob demanda e a organização da equipe de tradução:

```
admin/inertia/locales/
├── en/
│   ├── common.json          ← Strings compartilhadas (botões, labels genéricos, navegação)
│   ├── home.json             ← Dashboard / Command Center
│   ├── settings.json         ← Páginas de Settings (system, advanced, models, etc.)
│   ├── chat.json             ← Chat / AI Assistant
│   ├── supply_depot.json     ← Supply Depot
│   ├── maps.json             ← Maps
│   ├── drug_reference.json   ← Drug Reference
│   ├── easy_setup.json       ← Easy Setup Wizard
│   ├── benchmark.json        ← Benchmark
│   ├── content.json          ← ZIM / Content Manager / Remote Explorer
│   ├── updates.json          ← Update / Auto-update sections
│   ├── errors.json           ← Páginas de erro (404, 500)
│   └── docs.json             ← Documentação inline
└── pt-BR/                    ← (futuramente, mesma estrutura)
    ├── common.json
    ├── home.json
    └── ...
```

### Convenção de chaves de tradução

```
namespace:secao.subsecao.descricao_curta
```

Exemplos:
- `common:buttons.save` → "Save"
- `home:system_items.easy_setup.description` → "Not sure where to start? Use the setup wizard..."
- `settings:navigation.check_for_updates` → "Check for Updates"
- `chat:knowledge_base.modal.title` → "Knowledge Base"

---

## User Review Required

> [!IMPORTANT]
> **Sobre a equipe de tradução**: O plano assume que a equipe de tradutores recebe os arquivos `.json` em inglês já prontos e trabalha apenas preenchendo os valores em `pt-BR`. É isso mesmo? Ou os tradutores também participariam da extração de strings?

> [!IMPORTANT]
> **Prioridade de módulos**: A ordem proposta abaixo (Core → Home → Settings → Features complexas) faz sentido para vocês? Existe algum módulo que deveria ter prioridade diferente?

> [!WARNING]
> **Strings dinâmicas do backend**: Algumas mensagens de erro e textos vêm dos controllers AdonisJS (ex: mensagens de validação, nomes de serviços). Na Fase 1, estas **não** serão traduzidas — apenas as strings visíveis no frontend React. A tradução do backend pode ser uma fase futura, se desejado.

## Open Questions

1. **Detecção de idioma**: O idioma será detectado automaticamente via `navigator.language` do navegador, ou o usuário terá um seletor manual de idioma na interface (ex: no footer ou sidebar)?
2. **Fallback**: Se uma chave de tradução não existir em `pt-BR`, devemos exibir o texto original em inglês (fallback silencioso) ou marcar visualmente como "não traduzido"?
3. **Nomes de serviços e apps**: Labels como "Supply Depot", "Drug Reference", "Creator Packs" devem ser traduzidos ou mantidos em inglês como nomes próprios?
4. **Documentação inline (Docs)**: O conteúdo da seção `/docs` é renderizado via Markdoc. Esse conteúdo também entra no escopo de tradução, ou apenas a UI ao redor?

---

## Proposed Changes

### Estrutura Épico > Feature > Story > Tasks

---

# ÉPICO 1: Fundação da Infraestrutura i18n

> **Objetivo**: Configurar toda a base técnica necessária para que qualquer componente React do projeto possa consumir strings traduzíveis. Nenhuma string de UI é extraída ainda neste épico.

---

## Feature 1.1: Setup do `react-i18next`

### Story 1.1.1: Instalar e configurar as dependências de i18n
**Tipo**: Technical Story

#### Tasks:
- [ ] Instalar `react-i18next`, `i18next` e `i18next-browser-languagedetector` via npm
- [ ] Criar arquivo de configuração `admin/inertia/lib/i18n.ts` com:  
  - Inicialização do i18next
  - Plugin de detecção de idioma do navegador
  - Configuração de fallback language (`en`)
  - Registro de namespaces padrão (`common`)
  - Interpolação com escape padrão
- [ ] Importar `i18n.ts` no entry point [`admin/inertia/app/app.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/app/app.tsx)

### Story 1.1.2: Criar a estrutura de pastas e arquivos de tradução
**Tipo**: Technical Story

#### Tasks:
- [ ] Criar diretório `admin/inertia/locales/en/`
- [ ] Criar arquivo `common.json` com estrutura inicial (botões, labels genéricos, navegação)
- [ ] Criar arquivos JSON vazios (scaffolding) para cada namespace: `home`, `settings`, `chat`, `supply_depot`, `maps`, `drug_reference`, `easy_setup`, `benchmark`, `content`, `updates`, `errors`, `docs`
- [ ] Criar diretório `admin/inertia/locales/pt-BR/` com os mesmos arquivos (vazios, prontos para a equipe de tradução)

### Story 1.1.3: Integrar i18next no pipeline de providers React
**Tipo**: Technical Story

#### Tasks:
- [ ] Envolver a árvore de componentes com `I18nextProvider` em [`app.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/app/app.tsx)
- [ ] Criar hook utilitário `useTranslation` re-exportado (wrapper fino para manter imports consistentes)
- [ ] Criar componente `LanguageSwitcher` básico (toggle `en`/`pt-BR`) — pode ficar oculto na UI, mas funcional para testes

---

## Feature 1.2: Tooling e DX (Developer Experience)

### Story 1.2.1: Configurar ferramentas de apoio ao desenvolvimento
**Tipo**: Technical Story

#### Tasks:
- [ ] Adicionar script npm `i18n:check` que valida se todas as chaves em `en/*.json` existem em `pt-BR/*.json` (script Node simples)
- [ ] Documentar no README ou em `docs/i18n-guide.md`:
  - Como adicionar novas strings traduzíveis
  - Convenção de nomenclatura de chaves
  - Como testar a troca de idioma
  - Guia para a equipe de tradução

### Story 1.2.2: Criar componente piloto para validar a infraestrutura
**Tipo**: Technical Story

#### Tasks:
- [ ] Escolher um componente simples e isolado (ex: [`Footer.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/Footer.tsx)) como piloto
- [ ] Extrair strings hardcoded para `common.json`
- [ ] Substituir textos por chamadas `t('common:footer.project_name')`, etc.
- [ ] Validar que a troca de idioma funciona corretamente no componente piloto
- [ ] Documentar o padrão aplicado como referência para as próximas fases

---

### 📅 Entrega Semana 1
> - Infraestrutura completa instalada e configurada
> - Estrutura de pastas e arquivos de tradução criada
> - Componente piloto (Footer) traduzido e funcionando
> - Documentação de guia i18n para devs e tradutores
> - Validação de troca de idioma end-to-end

---

# ÉPICO 2: Extração de Strings — Camada Comum e Navegação

> **Objetivo**: Traduzir todos os elementos de UI compartilhados e visíveis em todas as páginas: layouts, sidebar, navegação, modais genéricos e componentes de input reutilizáveis. Ao final deste épico, toda a "casca" da aplicação estará traduzível.

---

## Feature 2.1: Layouts e Navegação Global

### Story 2.1.1: Extrair strings dos layouts
**Tipo**: User Story — *"Como usuário, quero que os elementos de navegação global (header, sidebar, footer) estejam traduzíveis."*

#### Tasks:
- [ ] [`AppLayout.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/layouts/AppLayout.tsx): Extrair "Back to Home", "Command Center", alt text do logo
- [ ] [`SettingsLayout.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/layouts/SettingsLayout.tsx): Extrair todos os nomes de navegação ("Supply Depot", "Benchmark", "Content Explorer", "Content Manager", "Maps Manager", "Service Logs & Metrics", "Check for Updates", "System", "Advanced", "API Reference", "Support the Project", "Legal Notices", "Settings")
- [ ] [`DocsLayout.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/layouts/DocsLayout.tsx): Extrair strings visíveis
- [ ] [`MapsLayout.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/layouts/MapsLayout.tsx): Extrair strings visíveis

### Story 2.1.2: Extrair strings da sidebar e do footer
**Tipo**: User Story

#### Tasks:
- [ ] [`StyledSidebar.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/StyledSidebar.tsx): Extrair título "Settings" e quaisquer labels
- [ ] `Footer.tsx`: Já feito no piloto (Épico 1) — revisar se completo

---

## Feature 2.2: Componentes Reutilizáveis de UI

### Story 2.2.1: Extrair strings dos componentes de input e feedback
**Tipo**: Technical Story

#### Tasks:
- [ ] [`Alert.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/Alert.tsx): Extrair textos padrão de alertas
- [ ] [`StyledButton.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/StyledButton.tsx): Verificar labels padrão
- [ ] [`StyledModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/StyledModal.tsx): Extrair "Close", "Cancel", "Confirm" etc.
- [ ] [`StyledTable.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/StyledTable.tsx): Extrair labels de cabeçalho, paginação, "No results"
- [ ] [`LoadingSpinner.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/LoadingSpinner.tsx): Extrair "Loading..." e similares
- [ ] [`InfoTooltip.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/InfoTooltip.tsx): Revisar textos
- [ ] Componentes de input em [`inputs/`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/inputs): Extrair placeholders e labels

### Story 2.2.2: Extrair strings dos modais genéricos
**Tipo**: Technical Story

#### Tasks:
- [ ] [`AppUrlModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/AppUrlModal.tsx)
- [ ] [`DebugInfoModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/DebugInfoModal.tsx)
- [ ] [`DownloadURLModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/DownloadURLModal.tsx)
- [ ] [`ServiceLogsModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/ServiceLogsModal.tsx)
- [ ] [`ServiceStatsModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/ServiceStatsModal.tsx)
- [ ] [`UpdateServiceModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/UpdateServiceModal.tsx)
- [ ] [`WhatsNewBanner.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/WhatsNewBanner.tsx)

---

### 📅 Entrega Semana 2
> - Todos os layouts traduzíveis
> - Sidebar e navegação completa traduzível
> - Componentes reutilizáveis de UI (botões, modais, tabelas, alertas, inputs) traduzíveis
> - Namespace `common.json` e `settings.json` parcialmente populados

---

# ÉPICO 3: Extração de Strings — Páginas Principais

> **Objetivo**: Traduzir as páginas que formam o fluxo principal de uso: Home/Dashboard, Easy Setup e páginas de erro.

---

## Feature 3.1: Home / Command Center

### Story 3.1.1: Extrair strings da Home page
**Tipo**: User Story — *"Como usuário, quero que o painel principal (Command Center) esteja traduzível."*

#### Tasks:
- [ ] [`home.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/home.tsx): Extrair labels ("Maps", "Drug Reference", "Easy Setup", "Supply Depot", "Docs", "Settings"), descriptions, títulos de alerta ("An update is available...", "Your benchmark can be re-scored..."), botões ("Go to Settings", "Re-run benchmark"), badge "Start here!"
- [ ] [`CategoryCard.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/CategoryCard.tsx): Extrair labels
- [ ] [`InstallActivityFeed.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/InstallActivityFeed.tsx): Extrair textos de status

---

## Feature 3.2: Easy Setup Wizard

### Story 3.2.1: Extrair strings do fluxo de Easy Setup
**Tipo**: User Story — *"Como usuário novo, quero que o wizard de configuração inicial esteja traduzível."*

#### Tasks:
- [ ] [`easy-setup/index.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/easy-setup/index.tsx) (~60KB — arquivo grande, muitas strings): Extrair todos os textos do wizard, labels de steps, descrições de opções, botões de navegação
- [ ] [`easy-setup/complete.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/easy-setup/complete.tsx): Extrair mensagem de conclusão
- [ ] [`TierSelectionModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/TierSelectionModal.tsx): Extrair nomes de tiers e descrições
- [ ] [`WikipediaSelector.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/WikipediaSelector.tsx): Extrair labels
- [ ] [`CountryPickerModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/CountryPickerModal.tsx): Extrair labels de busca e seleção

---

## Feature 3.3: Páginas de Erro

### Story 3.3.1: Extrair strings das páginas de erro
**Tipo**: User Story

#### Tasks:
- [ ] [`errors/not_found.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/errors/not_found.tsx): Extrair "Page Not Found" e similares
- [ ] [`errors/server_error.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/errors/server_error.tsx): Extrair "Server Error" e similares

---

### 📅 Entrega Semana 3
> - Dashboard / Command Center traduzível
> - Easy Setup Wizard completo traduzível
> - Páginas de erro traduzíveis
> - Namespaces `home.json`, `easy_setup.json`, `errors.json` populados em `en`

---

# ÉPICO 4: Extração de Strings — Settings e Supply Depot

> **Objetivo**: Traduzir todo o módulo de configurações e o Supply Depot (loja de apps).

---

## Feature 4.1: Páginas de Settings (parte 1)

### Story 4.1.1: System, Advanced e Support
**Tipo**: User Story — *"Como administrador, quero que as telas de configuração do sistema estejam traduzíveis."*

#### Tasks:
- [ ] [`settings/system.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/system.tsx) (~15KB): Extrair labels de monitoramento, cards de info, status
- [ ] [`settings/advanced.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/advanced.tsx): Extrair labels e descrições
- [ ] [`settings/support.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/support.tsx): Extrair textos
- [ ] [`settings/legal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/legal.tsx): Extrair títulos (manter textos legais em inglês)
- [ ] Componentes de [`systeminfo/`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/systeminfo): Extrair labels dos cards de informação

### Story 4.1.2: Updates
**Tipo**: User Story

#### Tasks:
- [ ] [`settings/update.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/update.tsx) (~22KB): Extrair textos de atualização
- [ ] [`updates/AppAutoUpdateSection.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/updates/AppAutoUpdateSection.tsx)
- [ ] [`updates/ContentAutoUpdateSection.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/updates/ContentAutoUpdateSection.tsx)
- [ ] [`updates/ContentUpdatesSection.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/updates/ContentUpdatesSection.tsx)
- [ ] [`updates/CoreAutoUpdateSection.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/updates/CoreAutoUpdateSection.tsx)

---

## Feature 4.2: Supply Depot

### Story 4.2.1: Extrair strings do Supply Depot
**Tipo**: User Story — *"Como usuário, quero que a loja de aplicativos esteja traduzível."*

#### Tasks:
- [ ] [`supply-depot.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/supply-depot.tsx) (~48KB — maior arquivo do projeto): Extrair todos os labels, descrições, categorias, status, botões
- [ ] [`CustomAppModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/CustomAppModal.tsx) (~20KB): Extrair formulário e labels
- [ ] [`CreatorPackCard.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/CreatorPackCard.tsx)
- [ ] [`CreatorPacksSection.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/CreatorPacksSection.tsx)
- [ ] [`CuratedCollectionCard.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/CuratedCollectionCard.tsx)
- [ ] [`BuilderTagSelector.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/BuilderTagSelector.tsx)
- [ ] [`StorageProjectionBar.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/StorageProjectionBar.tsx)

---

### 📅 Entrega Semana 4
> - Todas as páginas de Settings (System, Advanced, Support, Legal, Updates) traduzíveis
> - Supply Depot completo traduzível
> - Namespaces `settings.json`, `updates.json`, `supply_depot.json` populados em `en`

---

# ÉPICO 5: Extração de Strings — Features Complexas

> **Objetivo**: Traduzir os módulos de funcionalidades especializadas: AI Chat, Maps, Benchmark, Content Manager, Drug Reference e Models.

---

## Feature 5.1: AI Chat

### Story 5.1.1: Extrair strings do módulo de chat
**Tipo**: User Story — *"Como usuário, quero que a interface de chat com o assistente de IA esteja traduzível."*

#### Tasks:
- [ ] [`chat/index.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/index.tsx) (~25KB)
- [ ] [`chat/ChatInterface.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/ChatInterface.tsx)
- [ ] [`chat/ChatMessageBubble.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/ChatMessageBubble.tsx)
- [ ] [`chat/ChatSidebar.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/ChatSidebar.tsx)
- [ ] [`chat/ChatModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/ChatModal.tsx)
- [ ] [`chat/ChatButton.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/ChatButton.tsx)
- [ ] [`chat/CollectionCombobox.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/CollectionCombobox.tsx)
- [ ] [`chat/CollectionsManager.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/CollectionsManager.tsx)
- [ ] [`chat/KbPolicyPromptBanner.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/KbPolicyPromptBanner.tsx)
- [ ] [`chat/KnowledgeBaseModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/KnowledgeBaseModal.tsx) (~48KB — segundo maior arquivo)
- [ ] [`chat/NomadMdModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/chat/NomadMdModal.tsx)
- [ ] [`KbGuardrailModal.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/KbGuardrailModal.tsx)
- [ ] Página [`chat.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/chat.tsx)

---

## Feature 5.2: Maps e Content Manager

### Story 5.2.1: Extrair strings do módulo de mapas
**Tipo**: User Story

#### Tasks:
- [ ] [`maps.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/maps.tsx) (page)
- [ ] [`settings/maps.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/maps.tsx) (~16KB)
- [ ] Componentes em [`components/maps/`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/maps)

### Story 5.2.2: Extrair strings do Content Manager e Remote Explorer
**Tipo**: User Story

#### Tasks:
- [ ] [`settings/zim/index.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/zim/index.tsx)
- [ ] [`settings/zim/remote-explorer.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/zim/remote-explorer.tsx) (~38KB)
- [ ] Componentes em [`components/ZimUploader/`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/ZimUploader)
- [ ] [`components/file-uploader/`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/file-uploader)

---

### 📅 Entrega Semana 5
> - AI Chat completo traduzível
> - Maps (visualização e gerenciamento) traduzível
> - Content Manager e Remote Explorer traduzíveis
> - Namespaces `chat.json`, `maps.json`, `content.json` populados em `en`

---

## Feature 5.3: Benchmark, Drug Reference e Models

### Story 5.3.1: Extrair strings do Benchmark
**Tipo**: User Story

#### Tasks:
- [ ] [`settings/benchmark.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/benchmark.tsx) (~47KB)
- [ ] Componentes em [`components/benchmark/`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/benchmark)

### Story 5.3.2: Extrair strings do Drug Reference
**Tipo**: User Story

#### Tasks:
- [ ] [`drug-reference/index.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/drug-reference/index.tsx) (~43KB)
- [ ] [`drug-reference/show.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/drug-reference/show.tsx)
- [ ] [`drug-reference/interactions.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/drug-reference/interactions.tsx)
- [ ] Componentes em [`components/drug-reference/`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/drug-reference)
- [ ] [`conditions/show.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/conditions/show.tsx)
- [ ] Componentes em [`components/conditions/`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/conditions)

### Story 5.3.3: Extrair strings do Models / AI Settings
**Tipo**: User Story

#### Tasks:
- [ ] [`settings/models.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/models.tsx) (~24KB)
- [ ] [`settings/apps.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/apps.tsx) (~17KB)
- [ ] [`settings/creator-packs.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/settings/creator-packs.tsx)
- [ ] [`ActiveDownloads.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/ActiveDownloads.tsx)
- [ ] [`ActiveModelDownloads.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/ActiveModelDownloads.tsx)
- [ ] [`ActiveEmbedJobs.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/ActiveEmbedJobs.tsx)

---

### 📅 Entrega Semana 6
> - Benchmark, Drug Reference e Models traduzíveis
> - Namespaces `benchmark.json`, `drug_reference.json` populados em `en`
> - **100% das strings do frontend extraídas para arquivos de tradução**

---

# ÉPICO 6: Componentes Restantes, Polimento e Documentação

> **Objetivo**: Cobrir quaisquer componentes menores remanescentes, documentação Markdoc, QA final e preparação para a equipe de tradução.

---

## Feature 6.1: Componentes e Páginas Restantes

### Story 6.1.1: Varredura final de componentes
**Tipo**: Technical Story

#### Tasks:
- [ ] [`about.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/about.tsx)
- [ ] [`docs/show.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/pages/docs/show.tsx)
- [ ] [`MarkdocRenderer.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/MarkdocRenderer.tsx)
- [ ] [`MarkdownEditor.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/MarkdownEditor.tsx)
- [ ] [`ThemeToggle.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/ThemeToggle.tsx)
- [ ] [`ProgressBar.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/ProgressBar.tsx)
- [ ] [`BouncingDots.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/BouncingDots.tsx) / [`BouncingLogo.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/BouncingLogo.tsx)
- [ ] [`HorizontalBarChart.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/HorizontalBarChart.tsx)
- [ ] [`DynamicIcon.tsx`](file:///c:/Users/caiof/Documents/GitHub/projeto-errante/projeto-errante-main/admin/inertia/components/DynamicIcon.tsx)
- [ ] Quaisquer componentes em subpastas ainda não cobertos

---

## Feature 6.2: QA e Polimento

### Story 6.2.1: Auditoria de cobertura
**Tipo**: Technical Story

#### Tasks:
- [ ] Executar script `i18n:check` — validar que toda chave em `en/` tem correspondente em `pt-BR/` (mesmo que vazio)
- [ ] Fazer grep global por strings hardcoded residuais em arquivos `.tsx` (procurar padrões de texto entre `>` e `<` que não usem `t()`)
- [ ] Revisar pluralizações e interpolações (ex: `{count.toLocaleString()} labels`, `v{appVersion}`)
- [ ] Testar troca de idioma em todas as páginas principais, verificando quebras de layout

### Story 6.2.2: Preparar pacote para a equipe de tradução
**Tipo**: Technical Story

#### Tasks:
- [ ] Gerar relatório com contagem total de chaves por namespace
- [ ] Criar guia específico para tradutores (`docs/translators-guide.md`) explicando:
  - Como clonar o repositório
  - Quais arquivos editar (apenas `locales/pt-BR/*.json`)
  - Regras: manter placeholders `{{variavel}}` intactos, não traduzir chaves
  - Como testar localmente
  - Processo de PR e review
- [ ] Criar template de PR para contribuições de tradução

---

### 📅 Entrega Semana 7
> - Auditoria de cobertura completa — 0 strings hardcoded residuais
> - Documentação para equipe de tradução finalizada
> - Pacote de arquivos `en/*.json` pronto para distribuição à equipe de tradução
> - Release interna no fork com tag `i18n-ready`

---

## Resumo do Cronograma Semanal

| Semana | Épico | Entregável Principal |
|--------|-------|---------------------|
| **1** | Épico 1 — Fundação | Infraestrutura i18n + componente piloto funcionando |
| **2** | Épico 2 — Camada Comum | Layouts, navegação e componentes reutilizáveis traduzíveis |
| **3** | Épico 3 — Páginas Principais | Home, Easy Setup e páginas de erro traduzíveis |
| **4** | Épico 4 — Settings e Supply Depot | Todas as Settings + Supply Depot traduzíveis |
| **5** | Épico 5 (parte 1) — Features: Chat, Maps, Content | AI Chat, Maps, Content Manager traduzíveis |
| **6** | Épico 5 (parte 2) — Features: Benchmark, Drug Ref, Models | Benchmark, Drug Reference, Models traduzíveis |
| **7** | Épico 6 — Polimento e Entrega | Auditoria final, docs para tradutores, release `i18n-ready` |

> [!TIP]
> A partir da Semana 8, a equipe de tradução pode iniciar o trabalho nos arquivos `pt-BR/*.json`, trabalhando em paralelo namespace por namespace.

---

## Verification Plan

### Automated Tests
- `npm run i18n:check` — Verifica paridade de chaves entre `en/` e `pt-BR/`
- Grep automatizado por strings hardcoded residuais em `.tsx`
- `npm run typecheck` — Garantir que as refatorações não quebraram o TypeScript

### Manual Verification
- Testar troca de idioma em cada página após cada entrega semanal
- Verificar que nenhuma string fica em branco ou mostra chave de tradução crua
- Testar responsividade — textos traduzidos mais longos (pt-BR tende a ser ~20-30% mais longo que en) não devem quebrar layout
