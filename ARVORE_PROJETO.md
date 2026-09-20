# 🌳 Mapeamento Completo da Estrutura — Projeto Errante (Project NOMAD)

> **Visão Holística e Extensiva de Todas as Camadas do Projeto**  
> 📊 **Métricas Gerais:** **82 pastas mapeadas** | **523 arquivos catalogados no total do projeto**  
> 🔗 *Todos os arquivos e diretórios possuem links relativos navegáveis diretamente tanto no GitHub quanto no seu editor local (VS Code/Cursor).*

---

## 📌 Mapa Arquitetural em Camadas

```text
projeto-errante/
├── .github/                       # CI/CD, templates de issues e automações
├── collections/                   # Catálogos de conteúdo offline curados (JSON)
├── install/                       # Shell scripts, Docker Compose e sidecars do host
└── admin/                         # Command Center Fullstack (AdonisJS 6 + React Inertia)
    ├── app/                       # Backend (Controllers, Services, Models, Jobs, Validators)
    ├── bin/                       # Scripts de bootstrap (server, console, test)
    ├── commands/                  # Comandos CLI personalizados via AdonisJS Ace
    ├── config/                    # Configurações de subsistemas (DB, queue, cors, vite)
    ├── constants/                 # Constantes e identificadores globais do sistema
    ├── database/                  # Migrações SQL e seeders da base SQLite
    ├── docs/                      # Artigos técnicos renderizados internamente no painel
    ├── inertia/                   # Frontend SPA (Pages, Components, Hooks, Layouts)
    ├── providers/                 # Providers de ciclo de vida do backend AdonisJS
    ├── public/                    # Arquivos estáticos (imagens, logotipos, favicons)
    ├── resources/                 # Dados geoespaciais e templates Edge de montagem
    ├── scripts/                   # Scripts utilitários de auditoria e manutenção
    ├── start/                     # Rotas, kernel e variáveis de ambiente
    ├── tests/                     # Baterias de testes (unitários, funcionais, standalone)
    ├── types/                     # Interfaces TypeScript e definições de contratos
    └── util/                      # Helpers de baixo nível (ZIM, arquivos, bulas)
```

---

## 📂 Inventário Extensivo por Pasta

### 📁 [`./`](./) — Contém 11 arquivos

> Diretório raiz que centraliza as definições do repositório, licenciamento e automações de contêiner.  
> Serve de ponto de encontro para a montagem dos ambientes de desenvolvimento e produção do NOMAD.  
> Contém arquivos de documentação geral e configurações globais de orquestração do projeto.  

- [`.dockerignore`](.dockerignore): [Configuração | Docker] Arquivos e pastas excluídos do contexto de build da imagem Docker.
- [`.gitignore`](.gitignore): [Configuração | Git] Padrões de arquivos e diretórios locais ignorados pelo versionamento Git.
- [`.releaserc.json`](.releaserc.json): [Configuração | JSON | Semantic Release] Regras de versionamento semântico automatizado e publicação de releases.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md): [Documentação | Markdown] Padrões de conduta comunitária e regras de convivência ética do repositório.
- [`CONTRIBUTING.md`](CONTRIBUTING.md): [Documentação | Markdown] Guia para contribuidores sobre estilo de código, testes e fluxo de Pull Requests.
- [`Dockerfile`](Dockerfile): [Configuração | Docker] Imagem multi-estágio para compilação e execução do container do Command Center.
- [`FAQ.md`](FAQ.md): [Documentação | Markdown] Respostas para perguntas frequentes sobre funcionamento, limitações e uso offline.
- [`LICENSE`](LICENSE): [Licença | Texto] Termos legais da licença de software livre Apache 2.0 que governa o projeto.
- [`README.md`](README.md): [Documentação | Markdown] Apresentação geral do Project NOMAD, requisitos de hardware e guia de início rápido.
- [`package-lock.json`](package-lock.json): [Lockfile | JSON | npm] Travamento exato de versões de pacotes e dependências na raiz.
- [`package.json`](package.json): [Configuração | JSON | Node.js] Metadados do projeto raiz e scripts de orquestração de desenvolvimento.

### 📁 [`.github/`](.github) — Contém 1 arquivo

> Pasta de configuração e padrões para o ecossistema do GitHub.  
> Reúne configurações de dependências automatizadas e templates de interação com a comunidade.  
> Centraliza os recursos que padronizam a governança e o suporte ao repositório.  

- [`dependabot.yaml`](.github/dependabot.yaml): [Configuração | YAML | Dependabot] Configuração de checagem e atualização automática de dependências npm e Docker.

### 📁 [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE) — Contém 3 arquivos

> Templates pré-formatados para abertura de chamados, relatos de bugs e novas sugestões.  
> Padroniza a coleta de informações técnicas críticas para a equipe de desenvolvimento.  
> Garante conformidade e agilidade na triagem de incidentes relatados por usuários.  

- [`bug_report.yml`](.github/ISSUE_TEMPLATE/bug_report.yml): [Formulário | YAML | GitHub] Template com campos estruturados para relato detalhado de falhas e bugs.
- [`config.yml`](.github/ISSUE_TEMPLATE/config.yml): [Configuração | YAML | GitHub] Configurações de links de ajuda externa e desativação de issues em branco.
- [`feature_request.yml`](.github/ISSUE_TEMPLATE/feature_request.yml): [Formulário | YAML | GitHub] Template formatado para sugestões e solicitações de novas funcionalidades.

### 📁 [`.github/scripts/`](.github/scripts) — Contém 1 arquivo

> Scripts utilitários dedicados a tarefas automáticas executadas pelos pipelines de CI/CD.  
> Auxilia na geração de relatórios, notas de versão e preparação de artefatos de deploy.  
> Mantém a consistência de processos operacionais internos do ciclo de release.  

- [`finalize-release-notes.sh`](.github/scripts/finalize-release-notes.sh): [Script Shell | Bash] Script para limpeza, consolidação e formatação das notas de versão nos deploys.

### 📁 [`.github/workflows/`](.github/workflows) — Contém 7 arquivos

> Pipelines de integração contínua e entrega contínua (CI/CD) baseados no GitHub Actions.  
> Executa rotinas automatizadas de compilação, testes, validação de dados e publicação de imagens Docker.  
> Garante a qualidade de código e automação total do ciclo de vida das versões lançadas.  

- [`build-admin-on-pr.yml`](.github/workflows/build-admin-on-pr.yml): [Workflow CI | YAML | GitHub Actions] Compila e valida o projeto admin em Pull Requests para detectar erros.
- [`build-disk-collector.yml`](.github/workflows/build-disk-collector.yml): [Workflow CI/CD | YAML | GitHub Actions] Constrói e envia a imagem do container sidecar coletor de métricas de disco.
- [`build-primary-image.yml`](.github/workflows/build-primary-image.yml): [Workflow CI/CD | YAML | GitHub Actions] Constrói e publica a imagem Docker principal do NOMAD no GitHub Container Registry.
- [`build-sidecar-updater.yml`](.github/workflows/build-sidecar-updater.yml): [Workflow CI/CD | YAML | GitHub Actions] Constrói e publica a imagem do container sidecar responsável pelo auto-updater.
- [`build-translate-proxy.yml`](.github/workflows/build-translate-proxy.yml): [Workflow CI/CD | YAML | GitHub Actions] Pipeline de compilação do container auxiliar de proxy de tradução.
- [`release.yml`](.github/workflows/release.yml): [Workflow CI/CD | YAML | GitHub Actions] Orquestra o lançamento de novas versões, tags e changelogs automáticos.
- [`validate-collection-urls.yml`](.github/workflows/validate-collection-urls.yml): [Workflow CI | YAML | GitHub Actions] Testa a validade e acessibilidade das URLs dos catálogos de coleções offline.

### 📁 [`admin/`](admin) — Contém 10 arquivos

> Diretório raiz da aplicação Command Center, o painel central de administração do sistema.  
> Combina o backend robusto em AdonisJS 6 com uma interface moderna em Inertia.js e React.  
> Reúne scripts de build, dependências de pacotes, linters e regras de compilação TypeScript.  

- [`.editorconfig`](admin/.editorconfig): [Arquivo de Suporte | Texto] Definição e suporte ao módulo '.editorconfig'.
- [`.env.example`](admin/.env.example): [Arquivo de Suporte | EXAMPLE] Definição e suporte ao módulo '.env.example'.
- [`ace.js`](admin/ace.js): [Script CLI | JavaScript | AdonisJS Ace] Ponto de entrada executável para a interface de linha de comando Ace.
- [`adonisrc.ts`](admin/adonisrc.ts): [Configuração | TypeScript | AdonisJS] Configurações fundamentais de providers, comandos e metadados do AdonisJS 6.
- [`eslint.config.js`](admin/eslint.config.js): [Configuração | JavaScript | ESLint] Regras e plugins de linting estático para padronização e qualidade de código.
- [`package-lock.json`](admin/package-lock.json): [Lockfile | JSON | npm] Registro determinístico das versões exatas de dependências instaladas no admin.
- [`package.json`](admin/package.json): [Configuração | JSON | npm/Node.js] Dependências, scripts de build (Adonis/Vite) e bibliotecas do backend e frontend.
- [`tailwind.config.ts`](admin/tailwind.config.ts): [Configuração | TypeScript | Tailwind CSS] Configurações de design tokens, cores, plugins e temas visuais do Tailwind.
- [`tsconfig.json`](admin/tsconfig.json): [Configuração | JSON | TypeScript] Parâmetros de compilação, resolução de módulos e tipagem estrita do TypeScript.
- [`vite.config.ts`](admin/vite.config.ts): [Configuração | TypeScript | Vite] Configurações de bundling, hot-reload e integração com o AdonisJS e Inertia.

### 📁 [`admin/app/`](admin/app) — Contém 0 arquivos

> Coração da camada de aplicação do backend AdonisJS seguindo o padrão arquitetural MVC.  
> Organiza controladores, regras de negócio em serviços, modelos de dados, jobs e validações.  
> Centraliza a lógica de orquestração dos serviços locais de IA, bancos de dados e contêineres Docker.  

*Nenhum arquivo diretamente nesta pasta (apenas subdiretórios).*

### 📁 [`admin/app/controllers/`](admin/app/controllers) — Contém 19 arquivos

> Camada de controladores HTTP responsáveis por receber e responder requisições da web.  
> Intermedeia o fluxo entre as páginas do frontend Inertia e os serviços de negócio do backend.  
> Expõe endpoints REST para gerenciamento de IA, mapas, apps, arquivos e downloads.  

- [`benchmark_controller.ts`](admin/app/controllers/benchmark_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'benchmark'.
- [`chats_controller.ts`](admin/app/controllers/chats_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'chats'.
- [`collection_updates_controller.ts`](admin/app/controllers/collection_updates_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'collection updates'.
- [`conditions_controller.ts`](admin/app/controllers/conditions_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'conditions'.
- [`creator_packs_controller.ts`](admin/app/controllers/creator_packs_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'creator packs'.
- [`docs_controller.ts`](admin/app/controllers/docs_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'docs'.
- [`downloads_controller.ts`](admin/app/controllers/downloads_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'downloads'.
- [`drug_reference_controller.ts`](admin/app/controllers/drug_reference_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'drug reference'.
- [`easy_setup_controller.ts`](admin/app/controllers/easy_setup_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'easy setup'.
- [`home_controller.ts`](admin/app/controllers/home_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'home'.
- [`maps_controller.ts`](admin/app/controllers/maps_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'maps'.
- [`nomad_md_controller.ts`](admin/app/controllers/nomad_md_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'nomad md'.
- [`ollama_controller.ts`](admin/app/controllers/ollama_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'ollama'.
- [`openapi_controller.ts`](admin/app/controllers/openapi_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'openapi'.
- [`rag_controller.ts`](admin/app/controllers/rag_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'rag'.
- [`settings_controller.ts`](admin/app/controllers/settings_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'settings'.
- [`supply_depot_controller.ts`](admin/app/controllers/supply_depot_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'supply depot'.
- [`system_controller.ts`](admin/app/controllers/system_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'system'.
- [`zim_controller.ts`](admin/app/controllers/zim_controller.ts): [Controller | TypeScript | AdonisJS] Gerencia endpoints HTTP, parâmetros de entrada e respostas do módulo 'zim'.

### 📁 [`admin/app/data/`](admin/app/data) — Contém 3 arquivos

> Repositório de dados estáticos e curados diretamente embutidos no código da aplicação.  
> Disponibiliza estruturas em memória para consulta rápida de condições médicas e tratamentos.  
> Garante disponibilidade imediata de dados vitais mesmo sem acesso a bancos externos.  

- [`conditions.ts`](admin/app/data/conditions.ts): [Dados Tipados | TypeScript] Base tipada de dados clínicos compilada para busca ultrarrápida em memória.
- [`home_remedies.ts`](admin/app/data/home_remedies.ts): [Dados Tipados | TypeScript] Tabela compilada de tratamentos e intervenções paliativas caseiras.
- [`natural_remedies.ts`](admin/app/data/natural_remedies.ts): [Dados Tipados | TypeScript] Tabela em memória de princípios ativos e opções fitoterápicas de socorro.

### 📁 [`admin/app/exceptions/`](admin/app/exceptions) — Contém 2 arquivos

> Tratamento centralizado de erros e exceções customizadas disparadas pelo sistema.  
> Padroniza mensagens de falha, códigos HTTP de retorno e rotinas de log para auditoria.  
> Previne falhas não tratadas na execução do servidor administrativo.  

- [`handler.ts`](admin/app/exceptions/handler.ts): [Manipulador de Erros | TypeScript | AdonisJS] Captura centralizada de exceções HTTP e resposta padronizada.
- [`internal_server_error_exception.ts`](admin/app/exceptions/internal_server_error_exception.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'internal_server_error_exception.ts'.

### 📁 [`admin/app/jobs/`](admin/app/jobs) — Contém 12 arquivos

> Tarefas de processamento assíncrono executadas em filas em segundo plano.  
> Gerencia operações demoradas como geração de embeddings RAG, download de modelos e benchmarks.  
> Evita o bloqueio da interface do usuário durante operações de alta demanda computacional.  

- [`app_auto_update_job.ts`](admin/app/jobs/app_auto_update_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'app auto update'.
- [`auto_update_job.ts`](admin/app/jobs/auto_update_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'auto update'.
- [`check_service_updates_job.ts`](admin/app/jobs/check_service_updates_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'check service updates'.
- [`check_update_job.ts`](admin/app/jobs/check_update_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'check update'.
- [`content_auto_update_job.ts`](admin/app/jobs/content_auto_update_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'content auto update'.
- [`download_drug_data_job.ts`](admin/app/jobs/download_drug_data_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'download drug data'.
- [`download_model_job.ts`](admin/app/jobs/download_model_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'download model'.
- [`embed_file_job.ts`](admin/app/jobs/embed_file_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'embed file'.
- [`ingest_drug_data_job.ts`](admin/app/jobs/ingest_drug_data_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'ingest drug data'.
- [`run_benchmark_job.ts`](admin/app/jobs/run_benchmark_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'run benchmark'.
- [`run_download_job.ts`](admin/app/jobs/run_download_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'run download'.
- [`run_extract_pmtiles_job.ts`](admin/app/jobs/run_extract_pmtiles_job.ts): [Job em Fila | TypeScript | AdonisJS Queue] Tarefa em segundo plano para processamento assíncrono de 'run extract pmtiles'.

### 📁 [`admin/app/middleware/`](admin/app/middleware) — Contém 4 arquivos

> Filtros intermediários interceptadores do ciclo de vida das requisições HTTP.  
> Executam validações de cabeçalhos, tratamento de rotas protegidas e monitoramento de tráfego.  
> Garantem que apenas requisições válidas e em conformidade cheguem aos controladores.  

- [`compression_middleware.ts`](admin/app/middleware/compression_middleware.ts): [Middleware HTTP | TypeScript | AdonisJS] Filtro intermediário de requisições web para verificação de 'compression middleware'.
- [`container_bindings_middleware.ts`](admin/app/middleware/container_bindings_middleware.ts): [Middleware HTTP | TypeScript | AdonisJS] Filtro intermediário de requisições web para verificação de 'container bindings middleware'.
- [`force_json_response_middleware.ts`](admin/app/middleware/force_json_response_middleware.ts): [Middleware HTTP | TypeScript | AdonisJS] Filtro intermediário de requisições web para verificação de 'force json response middleware'.
- [`maps_static_middleware.ts`](admin/app/middleware/maps_static_middleware.ts): [Middleware HTTP | TypeScript | AdonisJS] Filtro intermediário de requisições web para verificação de 'maps static middleware'.

### 📁 [`admin/app/models/`](admin/app/models) — Contém 14 arquivos

> Modelos de dados mapeados pelo ORM Lucid para a base de dados relacional SQLite.  
> Definem esquemas de tabelas, relacionamentos, tipagem e propriedades dos registros persistidos.  
> Representam entidades como mensagens de chat, configurações, catálogo de serviços e registros.  

- [`benchmark_result.ts`](admin/app/models/benchmark_result.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'benchmark result' no banco SQLite com tipos e relações.
- [`benchmark_setting.ts`](admin/app/models/benchmark_setting.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'benchmark setting' no banco SQLite com tipos e relações.
- [`chat_message.ts`](admin/app/models/chat_message.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'chat message' no banco SQLite com tipos e relações.
- [`chat_session.ts`](admin/app/models/chat_session.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'chat session' no banco SQLite com tipos e relações.
- [`collection_manifest.ts`](admin/app/models/collection_manifest.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'collection manifest' no banco SQLite com tipos e relações.
- [`custom_library_source.ts`](admin/app/models/custom_library_source.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'custom library source' no banco SQLite com tipos e relações.
- [`drug_label.ts`](admin/app/models/drug_label.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'drug label' no banco SQLite com tipos e relações.
- [`installed_resource.ts`](admin/app/models/installed_resource.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'installed resource' no banco SQLite com tipos e relações.
- [`kb_ingest_state.ts`](admin/app/models/kb_ingest_state.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'kb ingest state' no banco SQLite com tipos e relações.
- [`kb_ratio_registry.ts`](admin/app/models/kb_ratio_registry.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'kb ratio registry' no banco SQLite com tipos e relações.
- [`kv_store.ts`](admin/app/models/kv_store.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'kv store' no banco SQLite com tipos e relações.
- [`map_marker.ts`](admin/app/models/map_marker.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'map marker' no banco SQLite com tipos e relações.
- [`service.ts`](admin/app/models/service.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'service' no banco SQLite com tipos e relações.
- [`wikipedia_selection.ts`](admin/app/models/wikipedia_selection.ts): [Model ORM | TypeScript | Lucid ORM] Mapeia a tabela relacional 'wikipedia selection' no banco SQLite com tipos e relações.

### 📁 [`admin/app/services/`](admin/app/services) — Contém 28 arquivos

> Camada de serviços de domínio onde reside a lógica de negócios e integrações pesadas.  
> Comunica-se com Docker Socket, servidor Ollama, banco vetorial Qdrant e leitores de arquivos ZIM.  
> Centraliza regras de atualização automática, telemetria de hardware e processamento de mapas.  

- [`app_auto_update_service.ts`](admin/app/services/app_auto_update_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'app auto update'.
- [`auto_update_service.ts`](admin/app/services/auto_update_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'auto update'.
- [`benchmark_service.ts`](admin/app/services/benchmark_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'benchmark'.
- [`benchmark_telemetry.ts`](admin/app/services/benchmark_telemetry.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'benchmark telemetry'.
- [`chat_service.ts`](admin/app/services/chat_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'chat'.
- [`collection_manifest_service.ts`](admin/app/services/collection_manifest_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'collection manifest'.
- [`collection_update_service.ts`](admin/app/services/collection_update_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'collection update'.
- [`condition_service.ts`](admin/app/services/condition_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'condition'.
- [`container_registry_service.ts`](admin/app/services/container_registry_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'container registry'.
- [`content_auto_update_service.ts`](admin/app/services/content_auto_update_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'content auto update'.
- [`countries_service.ts`](admin/app/services/countries_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'countries'.
- [`creator_pack_service.ts`](admin/app/services/creator_pack_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'creator pack'.
- [`custom_app_guard.ts`](admin/app/services/custom_app_guard.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'custom app guard'.
- [`docker_service.ts`](admin/app/services/docker_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'docker'.
- [`docs_service.ts`](admin/app/services/docs_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'docs'.
- [`download_service.ts`](admin/app/services/download_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'download'.
- [`drug_reference_service.ts`](admin/app/services/drug_reference_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'drug reference'.
- [`kiwix_catalog_service.ts`](admin/app/services/kiwix_catalog_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'kiwix catalog'.
- [`kiwix_library_service.ts`](admin/app/services/kiwix_library_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'kiwix library'.
- [`map_service.ts`](admin/app/services/map_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'map'.
- [`nomad_md_service.ts`](admin/app/services/nomad_md_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'nomad md'.
- [`ollama_service.ts`](admin/app/services/ollama_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'ollama'.
- [`queue_service.ts`](admin/app/services/queue_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'queue'.
- [`rag_service.ts`](admin/app/services/rag_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'rag'.
- [`system_service.ts`](admin/app/services/system_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'system'.
- [`system_update_service.ts`](admin/app/services/system_update_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'system update'.
- [`zim_extraction_service.ts`](admin/app/services/zim_extraction_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'zim extraction'.
- [`zim_service.ts`](admin/app/services/zim_service.ts): [Serviço de Negócio | TypeScript | AdonisJS] Encapsula lógica de negócios, integrações de sistema e regras de 'zim'.

### 📁 [`admin/app/utils/`](admin/app/utils) — Contém 21 arquivos

> Coleção de funções utilitárias e rotinas auxiliares de apoio ao backend.  
> Contém algoritmos de sanitização, formatação de arquivos, manipulação de streams e hashes.  
> Evita duplicidade de código fornecendo ferramentas puras reutilizáveis por serviços e jobs.  

- [`affirmative_remedies.ts`](admin/app/utils/affirmative_remedies.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'affirmative remedies'.
- [`amd_hsa_override.ts`](admin/app/utils/amd_hsa_override.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'amd hsa override'.
- [`content_auto_update_backoff.ts`](admin/app/utils/content_auto_update_backoff.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'content auto update backoff'.
- [`content_reindex_decision.ts`](admin/app/utils/content_reindex_decision.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'content reindex decision'.
- [`downloads.ts`](admin/app/utils/downloads.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'downloads'.
- [`fs.ts`](admin/app/utils/fs.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'fs'.
- [`hosted_content.ts`](admin/app/utils/hosted_content.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'hosted content'.
- [`hosted_content_auth.ts`](admin/app/utils/hosted_content_auth.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'hosted content auth'.
- [`image_disk_preflight.ts`](admin/app/utils/image_disk_preflight.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'image disk preflight'.
- [`kb_ingest_decision.ts`](admin/app/utils/kb_ingest_decision.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'kb ingest decision'.
- [`kb_job_health.ts`](admin/app/utils/kb_job_health.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'kb job health'.
- [`kb_ratio_lookup.ts`](admin/app/utils/kb_ratio_lookup.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'kb ratio lookup'.
- [`kb_warning_decision.ts`](admin/app/utils/kb_warning_decision.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'kb warning decision'.
- [`misc.ts`](admin/app/utils/misc.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'misc'.
- [`platform_metadata.ts`](admin/app/utils/platform_metadata.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'platform metadata'.
- [`superseded_resource.ts`](admin/app/utils/superseded_resource.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'superseded resource'.
- [`update_window.ts`](admin/app/utils/update_window.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'update window'.
- [`version.ts`](admin/app/utils/version.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'version'.
- [`zim_download_resolution.ts`](admin/app/utils/zim_download_resolution.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'zim download resolution'.
- [`zim_filename.ts`](admin/app/utils/zim_filename.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'zim filename'.
- [`zim_html.ts`](admin/app/utils/zim_html.ts): [Função Utilitária | TypeScript] Rotinas auxiliares e helpers matemáticos ou operacionais para 'zim html'.

### 📁 [`admin/app/validators/`](admin/app/validators) — Contém 13 arquivos

> Esquemas de validação estrita de dados de entrada de formulários e requisições HTTP via VineJS.  
> Assegura integridade e tipagem estrita de payloads antes que atinjam a camada de negócio.  
> Previne injeções de dados maliciosos e inconsistências operacionais na API.  

- [`benchmark.ts`](admin/app/validators/benchmark.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'benchmark'.
- [`chat.ts`](admin/app/validators/chat.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'chat'.
- [`common.ts`](admin/app/validators/common.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'common'.
- [`conditions.ts`](admin/app/validators/conditions.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'conditions'.
- [`curated_collections.ts`](admin/app/validators/curated_collections.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'curated collections'.
- [`download.ts`](admin/app/validators/download.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'download'.
- [`drug_reference.ts`](admin/app/validators/drug_reference.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'drug reference'.
- [`nomad_md.ts`](admin/app/validators/nomad_md.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'nomad md'.
- [`ollama.ts`](admin/app/validators/ollama.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'ollama'.
- [`rag.ts`](admin/app/validators/rag.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'rag'.
- [`settings.ts`](admin/app/validators/settings.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'settings'.
- [`system.ts`](admin/app/validators/system.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'system'.
- [`zim.ts`](admin/app/validators/zim.ts): [Schema Validador | TypeScript | VineJS] Regras estritas de validação para dados recebidos no módulo 'zim'.

### 📁 [`admin/app/validators/responses/`](admin/app/validators/responses) — Contém 2 arquivos

> Esquemas de validação e estruturação para saídas e respostas retornadas por provedores externos.  
> Garante conformidade de payloads recebidos de APIs de IA ou catálogos remotos.  
> Valida que as respostas externas estejam no formato esperado antes do processamento.  

- [`chat.ts`](admin/app/validators/responses/chat.ts): [Schema Validador | TypeScript | VineJS] Valida integridade e formatação de respostas externas de 'chat'.
- [`common.ts`](admin/app/validators/responses/common.ts): [Schema Validador | TypeScript | VineJS] Valida integridade e formatação de respostas externas de 'common'.

### 📁 [`admin/bin/`](admin/bin) — Contém 3 arquivos

> Scripts de inicialização e bootstrapping da aplicação servidora AdonisJS.  
> Contém pontos de partida para o servidor web HTTP, console de comandos e runners de teste.  
> Configura o ambiente de execução e prepara os providers antes de atender requisições.  

- [`console.ts`](admin/bin/console.ts): [Ponto de Entrada | TypeScript | AdonisJS Ace] Inicializador do ambiente de linha de comando para comandos Ace.
- [`server.ts`](admin/bin/server.ts): [Ponto de Entrada | TypeScript | AdonisJS] Script de inicialização do servidor web HTTP em produção e desenvolvimento.
- [`test.ts`](admin/bin/test.ts): [Ponto de Entrada | TypeScript | Japa Test Runner] Script de bootstrap e execução de testes automatizados.

### 📁 [`admin/commands/`](admin/commands) — Contém 0 arquivos

> Comandos personalizados de terminal integrados à CLI oficial Ace do AdonisJS.  
> Permite executar rotinas administrativas, manutenções, inspeções e tarefas agendadas via shell.  
> Agrupa comandos por domínio funcional para atualização, filas e testes de hardware.  

*Nenhum arquivo diretamente nesta pasta (apenas subdiretórios).*

### 📁 [`admin/commands/app_auto_update/`](admin/commands/app_auto_update) — Contém 1 arquivo

> Comando de terminal dedicado ao gerenciamento do ciclo de auto-atualização do Command Center.  
> Executa checagens de novas versões e aciona a transição de imagens em segundo plano.  
> Possibilita a automação de patches sem intervenção manual do usuário.  

- [`dry_run.ts`](admin/commands/app_auto_update/dry_run.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'dry_run.ts'.

### 📁 [`admin/commands/auto_update/`](admin/commands/auto_update) — Contém 1 arquivo

> Comandos para validação, simulação e execução do pipeline de atualização do sistema.  
> Oferece modo dry-run para testar cenários de atualização sem alterar o ambiente real.  
> Garante previsibilidade e segurança antes da aplicação definitiva de novas versões.  

- [`dry_run.ts`](admin/commands/auto_update/dry_run.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'dry_run.ts'.

### 📁 [`admin/commands/benchmark/`](admin/commands/benchmark) — Contém 3 arquivos

> Comandos CLI para execução de rotinas de benchmark de hardware e geração de pontuações.  
> Avalia capacidade de CPU, GPU, memória e velocidade de inferência de IA na máquina host.  
> Permite submeter resultados de testes ao placar comunitário oficial do projeto.  

- [`results.ts`](admin/commands/benchmark/results.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'results.ts'.
- [`run.ts`](admin/commands/benchmark/run.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'run.ts'.
- [`submit.ts`](admin/commands/benchmark/submit.ts): [Comando Ace | TypeScript | AdonisJS] Comando CLI para submeter resultados de testes ao placar público da comunidade.

### 📁 [`admin/commands/content_auto_update/`](admin/commands/content_auto_update) — Contém 1 arquivo

> Rotina de terminal para verificação e download de novos catálogos de conteúdo offline.  
> Atualiza definições de pacotes Kiwix, novos mapas e bases médicas sem necessidade de reinstalação.  
> Mantém os acervos de conhecimento sincronizados quando há conectividade pontual.  

- [`dry_run.ts`](admin/commands/content_auto_update/dry_run.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'dry_run.ts'.

### 📁 [`admin/commands/queue/`](admin/commands/queue) — Contém 1 arquivo

> Comandos responsáveis por iniciar e monitorar os workers de processamento de filas.  
> Permite executar consumidores dedicados para downloads, modelos de IA ou benchmarks.  
> Possibilita o balanceamento e escalonamento de tarefas concorrentes em segundo plano.  

- [`work.ts`](admin/commands/queue/work.ts): [Comando Ace | TypeScript | AdonisJS] Worker CLI contínuo que processa tarefas assíncronas nas filas configuradas.

### 📁 [`admin/config/`](admin/config) — Contém 13 arquivos

> Arquivos de configuração centralizada dos diversos subsistemas e pacotes do AdonisJS.  
> Define opções para banco de dados, CORS, sessões, filas, Inertia, Vite e segurança Shield.  
> Permite customizar o comportamento da infraestrutura através de variáveis de ambiente.  

- [`app.ts`](admin/config/app.ts): [Configuração | TypeScript | AdonisJS] Configurações gerais da aplicação como chaves de criptografia e fuso horário.
- [`bodyparser.ts`](admin/config/bodyparser.ts): [Configuração | TypeScript | AdonisJS] Limites de tamanho e decodificação de payloads e uploads multipart.
- [`cors.ts`](admin/config/cors.ts): [Configuração | TypeScript | AdonisJS] Regras de Cross-Origin Resource Sharing para requisições na API.
- [`database.ts`](admin/config/database.ts): [Configuração | TypeScript | Lucid ORM] Configurações de conexão e pool com o banco relacional SQLite.
- [`hash.ts`](admin/config/hash.ts): [Configuração | TypeScript | AdonisJS] Algoritmos de hashing para proteção de dados sensíveis.
- [`inertia.ts`](admin/config/inertia.ts): [Configuração | TypeScript | Inertia.js] Configuração da view raiz e compartilhamento de props globais no frontend.
- [`logger.ts`](admin/config/logger.ts): [Configuração | TypeScript | Pino Logger] Níveis de verbosidade, saídas e formatos de log do sistema.
- [`queue.ts`](admin/config/queue.ts): [Configuração | TypeScript | AdonisJS Queue] Configurações de filas de jobs em segundo plano e prioridades.
- [`session.ts`](admin/config/session.ts): [Configuração | TypeScript | AdonisJS] Parâmetros de gerenciamento de sessões, cookies e ciclo de vida de login.
- [`shield.ts`](admin/config/shield.ts): [Configuração | TypeScript | AdonisJS Shield] Políticas de segurança de proteção contra ataques CSRF e XSS.
- [`static.ts`](admin/config/static.ts): [Configuração | TypeScript | AdonisJS] Configuração de serviço de arquivos estáticos da pasta public.
- [`transmit.ts`](admin/config/transmit.ts): [Configuração | TypeScript | AdonisJS Transmit] Configurações de mensageria em tempo real via Server-Sent Events (SSE).
- [`vite.ts`](admin/config/vite.ts): [Configuração | TypeScript | Vite] Definição de caminhos de build e ativos compilados para o servidor web.

### 📁 [`admin/constants/`](admin/constants) — Contém 10 arquivos

> Declarações de constantes imutáveis, dicionários estáticos e parâmetros operacionais globais.  
> Define identificadores de coleções, limites de extração ZIM, nomes de serviços e portas padrão.  
> Elimina valores literais mágicos espalhados pelo código-fonte, garantindo consistência.  

- [`broadcast.ts`](admin/constants/broadcast.ts): [Constantes | TypeScript] Nomes de canais de mensageria SSE transmitidos aos clientes conectados.
- [`kb_collections.ts`](admin/constants/kb_collections.ts): [Constantes | TypeScript] Nomes de coleções vetoriais reservadas no banco semântico Qdrant.
- [`kiwix.ts`](admin/constants/kiwix.ts): [Constantes | TypeScript] Parâmetros operacionais e URLs padrão para o ecossistema Kiwix.
- [`kv_store.ts`](admin/constants/kv_store.ts): [Constantes | TypeScript] Chaves reservadas para armazenamento chave-valor de preferências no banco.
- [`map_regions.ts`](admin/constants/map_regions.ts): [Constantes | TypeScript] Relação estruturada de nomes de continentes, países e regiões de mapas.
- [`misc.ts`](admin/constants/misc.ts): [Constantes | TypeScript] Constantes utilitárias gerais, timeouts e configurações padrão do sistema.
- [`ollama.ts`](admin/constants/ollama.ts): [Constantes | TypeScript] Modelos padrão recomendados e configurações de conexão com o servidor Ollama.
- [`service_names.ts`](admin/constants/service_names.ts): [Constantes | TypeScript] Identificadores padronizados dos containers de serviços (Kiwix, Ollama, Qdrant, Kolibri).
- [`supply_depot_docs.ts`](admin/constants/supply_depot_docs.ts): [Constantes | TypeScript] Metadados e links de documentação dos aplicativos do Supply Depot.
- [`zim_extraction.ts`](admin/constants/zim_extraction.ts): [Constantes | TypeScript] Parâmetros e limites de extração de metadados em arquivos ZIM.

### 📁 [`admin/database/`](admin/database) — Contém 0 arquivos

> Diretório raiz da camada de banco de dados relacional gerida pelo Lucid ORM.  
> Abriga o histórico evolutivo de schemas relacionais e scripts de povoamento da base SQLite.  
> Assegura a persistência e reprodutibilidade do estado de dados da aplicação.  

*Nenhum arquivo diretamente nesta pasta (apenas subdiretórios).*

### 📁 [`admin/database/migrations/`](admin/database/migrations) — Contém 43 arquivos

> Histórico sequencial de migrações estruturais do banco de dados relacional.  
> Registra alterações graduais nas tabelas como criação de campos, índices e relacionamentos.  
> Permite versionar e sincronizar o banco de dados de maneira determinística entre atualizações.  

- [`1751086751801_create_services_table.ts`](admin/database/migrations/1751086751801_create_services_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create services table'.
- [`1763499145832_update_services_table.ts`](admin/database/migrations/1763499145832_update_services_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'update services table'.
- [`1764912210741_create_curated_collections_table.ts`](admin/database/migrations/1764912210741_create_curated_collections_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create curated collections table'.
- [`1764912270123_create_curated_collection_resources_table.ts`](admin/database/migrations/1764912270123_create_curated_collection_resources_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create curated collection resources table'.
- [`1768170944482_update_services_add_installation_statuses_table.ts`](admin/database/migrations/1768170944482_update_services_add_installation_statuses_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'update services add installation statuses table'.
- [`1768453747522_update_services_add_icon.ts`](admin/database/migrations/1768453747522_update_services_add_icon.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'update services add icon'.
- [`1769097600001_create_benchmark_results_table.ts`](admin/database/migrations/1769097600001_create_benchmark_results_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create benchmark results table'.
- [`1769097600002_create_benchmark_settings_table.ts`](admin/database/migrations/1769097600002_create_benchmark_settings_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create benchmark settings table'.
- [`1769300000001_add_powered_by_and_display_order_to_services.ts`](admin/database/migrations/1769300000001_add_powered_by_and_display_order_to_services.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add powered by and display order to services'.
- [`1769300000002_update_services_friendly_names.ts`](admin/database/migrations/1769300000002_update_services_friendly_names.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'update services friendly names'.
- [`1769324448000_add_builder_tag_to_benchmark_results.ts`](admin/database/migrations/1769324448000_add_builder_tag_to_benchmark_results.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add builder tag to benchmark results'.
- [`1769400000001_create_installed_tiers_table.ts`](admin/database/migrations/1769400000001_create_installed_tiers_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create installed tiers table'.
- [`1769400000002_create_kv_store_table.ts`](admin/database/migrations/1769400000002_create_kv_store_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create kv store table'.
- [`1769500000001_create_wikipedia_selection_table.ts`](admin/database/migrations/1769500000001_create_wikipedia_selection_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create wikipedia selection table'.
- [`1769646771604_create_create_chat_sessions_table.ts`](admin/database/migrations/1769646771604_create_create_chat_sessions_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create create chat sessions table'.
- [`1769646798266_create_create_chat_messages_table.ts`](admin/database/migrations/1769646798266_create_create_chat_messages_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create create chat messages table'.
- [`1769700000001_create_zim_file_metadata_table.ts`](admin/database/migrations/1769700000001_create_zim_file_metadata_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create zim file metadata table'.
- [`1770269324176_add_unique_constraint_to_curated_collection_resources_table.ts`](admin/database/migrations/1770269324176_add_unique_constraint_to_curated_collection_resources_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add unique constraint to curated collection resources table'.
- [`1770273423670_drop_installed_tiers_table.ts`](admin/database/migrations/1770273423670_drop_installed_tiers_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'drop installed tiers table'.
- [`1770849108030_create_create_collection_manifests_table.ts`](admin/database/migrations/1770849108030_create_create_collection_manifests_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create create collection manifests table'.
- [`1770849119787_create_create_installed_resources_table.ts`](admin/database/migrations/1770849119787_create_create_installed_resources_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create create installed resources table'.
- [`1770850092871_create_drop_legacy_curated_tables_table.ts`](admin/database/migrations/1770850092871_create_drop_legacy_curated_tables_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create drop legacy curated tables table'.
- [`1771000000001_add_update_fields_to_services.ts`](admin/database/migrations/1771000000001_add_update_fields_to_services.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add update fields to services'.
- [`1771000000002_pin_latest_service_images.ts`](admin/database/migrations/1771000000002_pin_latest_service_images.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'pin latest service images'.
- [`1771100000001_migrate_kiwix_to_library_mode.ts`](admin/database/migrations/1771100000001_migrate_kiwix_to_library_mode.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'migrate kiwix to library mode'.
- [`1771200000001_create_map_markers_table.ts`](admin/database/migrations/1771200000001_create_map_markers_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create map markers table'.
- [`1772000000001_add_supply_depot_fields_to_services.ts`](admin/database/migrations/1772000000001_add_supply_depot_fields_to_services.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add supply depot fields to services'.
- [`1772000000002_add_user_modified_to_services.ts`](admin/database/migrations/1772000000002_add_user_modified_to_services.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add user modified to services'.
- [`1772000000003_add_app_auto_update_fields_to_services.ts`](admin/database/migrations/1772000000003_add_app_auto_update_fields_to_services.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add app auto update fields to services'.
- [`1775100000001_create_custom_library_sources_table.ts`](admin/database/migrations/1775100000001_create_custom_library_sources_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create custom library sources table'.
- [`1776000000001_create_kb_ingest_state_table.ts`](admin/database/migrations/1776000000001_create_kb_ingest_state_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create kb ingest state table'.
- [`1776100000001_create_kb_ratio_registry_table.ts`](admin/database/migrations/1776100000001_create_kb_ratio_registry_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create kb ratio registry table'.
- [`1776200000001_add_content_auto_update_fields_to_installed_resources.ts`](admin/database/migrations/1776200000001_add_content_auto_update_fields_to_installed_resources.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add content auto update fields to installed resources'.
- [`1776200000001_add_custom_url_to_services.ts`](admin/database/migrations/1776200000001_add_custom_url_to_services.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add custom url to services'.
- [`1776300000001_deprecate_legacy_kolibri.ts`](admin/database/migrations/1776300000001_deprecate_legacy_kolibri.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'deprecate legacy kolibri'.
- [`1776400000001_add_benchmark_harness_metadata.ts`](admin/database/migrations/1776400000001_add_benchmark_harness_metadata.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add benchmark harness metadata'.
- [`1776400000001_add_collection_to_kb_ingest_state.ts`](admin/database/migrations/1776400000001_add_collection_to_kb_ingest_state.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add collection to kb ingest state'.
- [`1776400000001_sunset_meshtastic_daemon.ts`](admin/database/migrations/1776400000001_sunset_meshtastic_daemon.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'sunset meshtastic daemon'.
- [`1776400000002_add_benchmark_score_v2.ts`](admin/database/migrations/1776400000002_add_benchmark_score_v2.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add benchmark score v2'.
- [`1776400000003_add_benchmark_platform_metadata.ts`](admin/database/migrations/1776400000003_add_benchmark_platform_metadata.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add benchmark platform metadata'.
- [`1778600000004_create_drug_labels_table.ts`](admin/database/migrations/1778600000004_create_drug_labels_table.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'create drug labels table'.
- [`1778600000006_add_indications_fulltext_index.ts`](admin/database/migrations/1778600000006_add_indications_fulltext_index.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add indications fulltext index'.
- [`1778700000006_add_ingested_at_default_drug_labels.ts`](admin/database/migrations/1778700000006_add_ingested_at_default_drug_labels.ts): [Migração SQL | TypeScript | Lucid ORM] Script evolutivo de estrutura de banco para 'add ingested at default drug labels'.

### 📁 [`admin/database/seeders/`](admin/database/seeders) — Contém 1 arquivo

> Scripts de inicialização de dados que alimentam tabelas essenciais no primeiro boot.  
> Cadastra registros padrão, configurações iniciais e referências fundamentais no SQLite.  
> Garante que uma nova instalação esteja pronta para operar imediatamente.  

- [`service_seeder.ts`](admin/database/seeders/service_seeder.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'service_seeder.ts'.

### 📁 [`admin/docs/`](admin/docs) — Contém 12 arquivos

> Documentação técnica interna do sistema escrita em arquivos Markdown com Markdoc.  
> Alimenta a base de guias e tutoriais renderizados diretamente dentro da interface do Command Center.  
> Cobre primeiros passos, referências de API, farmácia, catálogo de apps e solução de dúvidas.  

- [`about.md`](admin/docs/about.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'About' renderizado no Command Center.
- [`api-reference.md`](admin/docs/api-reference.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Api Reference' renderizado no Command Center.
- [`community-add-ons.md`](admin/docs/community-add-ons.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Community Add Ons' renderizado no Command Center.
- [`drug-reference.md`](admin/docs/drug-reference.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Drug Reference' renderizado no Command Center.
- [`estrutura-projeto.MD`](admin/docs/estrutura-projeto.MD): [Arquivo de Suporte | MD] Definição e suporte ao módulo 'estrutura-projeto.MD'.
- [`faq.md`](admin/docs/faq.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Faq' renderizado no Command Center.
- [`getting-started.md`](admin/docs/getting-started.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Getting Started' renderizado no Command Center.
- [`home.md`](admin/docs/home.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Home' renderizado no Command Center.
- [`release-notes.md`](admin/docs/release-notes.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Release Notes' renderizado no Command Center.
- [`supply-depot-apps.md`](admin/docs/supply-depot-apps.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Supply Depot Apps' renderizado no Command Center.
- [`updates.md`](admin/docs/updates.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Updates' renderizado no Command Center.
- [`use-cases.md`](admin/docs/use-cases.md): [Documentação Interna | Markdown] Artigo explicativo sobre 'Use Cases' renderizado no Command Center.

### 📁 [`admin/docs/i18n/`](admin/docs/i18n) — Contém 1 arquivo

> Módulos para internacionalização e tradução dos guias de documentação da aplicação.  
> Facilita a disponibilização do acervo explicativo para múltiplos idiomas e públicos.  
> Suporta a expansão global do projeto mantendo uma estrutura padronizada de arquivos.  

- [`implementation_plan.md`](admin/docs/i18n/implementation_plan.md): [Arquivo de Suporte | MD] Definição e suporte ao módulo 'implementation_plan.md'.

### 📁 [`admin/inertia/`](admin/inertia) — Contém 1 arquivo

> Diretório raiz do frontend moderno desenvolvido com a arquitetura Inertia.js.  
> Conecta as respostas do backend diretamente a componentes React sem necessidade de APIs manuais.  
> Organiza views, componentes estilizados, hooks customizados e layouts visuais da aplicação.  

- [`tsconfig.json`](admin/inertia/tsconfig.json): [Configuração | JSON | TypeScript] Configurações de compilação estrita para o código frontend React.

### 📁 [`admin/inertia/app/`](admin/inertia/app) — Contém 1 arquivo

> Ponto de entrada no navegador para a aplicação cliente em React.  
> Configura a inicialização do Inertia, montagem da árvore DOM e registro de estilos globais.  
> Estabelece o canal de hidratação e reatividade da interface web.  

- [`app.tsx`](admin/inertia/app/app.tsx): [Ponto de Entrada | React TSX | Inertia] Inicialização do cliente Inertia, injeção de provedores e montagem no DOM.

### 📁 [`admin/inertia/components/`](admin/inertia/components) — Contém 39 arquivos

> Biblioteca de componentes React reutilizáveis compartilhados por todas as telas.  
> Inclui elementos de feedback visual, cards de produtos, barras de progresso e modais de ação.  
> Padroniza a identidade visual e simplifica a manutenção da interface.  

- [`ActiveDownloads.tsx`](admin/inertia/components/ActiveDownloads.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ActiveDownloads'.
- [`ActiveEmbedJobs.tsx`](admin/inertia/components/ActiveEmbedJobs.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ActiveEmbedJobs'.
- [`ActiveModelDownloads.tsx`](admin/inertia/components/ActiveModelDownloads.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ActiveModelDownloads'.
- [`Alert.tsx`](admin/inertia/components/Alert.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Alert'.
- [`AppUrlModal.tsx`](admin/inertia/components/AppUrlModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'AppUrlModal'.
- [`BouncingDots.tsx`](admin/inertia/components/BouncingDots.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'BouncingDots'.
- [`BouncingLogo.tsx`](admin/inertia/components/BouncingLogo.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'BouncingLogo'.
- [`BuilderTagSelector.tsx`](admin/inertia/components/BuilderTagSelector.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'BuilderTagSelector'.
- [`CategoryCard.tsx`](admin/inertia/components/CategoryCard.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CategoryCard'.
- [`CountryPickerModal.tsx`](admin/inertia/components/CountryPickerModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CountryPickerModal'.
- [`CreatorPackCard.tsx`](admin/inertia/components/CreatorPackCard.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CreatorPackCard'.
- [`CreatorPacksSection.tsx`](admin/inertia/components/CreatorPacksSection.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CreatorPacksSection'.
- [`CuratedCollectionCard.tsx`](admin/inertia/components/CuratedCollectionCard.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CuratedCollectionCard'.
- [`CustomAppModal.tsx`](admin/inertia/components/CustomAppModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CustomAppModal'.
- [`DebugInfoModal.tsx`](admin/inertia/components/DebugInfoModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'DebugInfoModal'.
- [`DownloadURLModal.tsx`](admin/inertia/components/DownloadURLModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'DownloadURLModal'.
- [`DynamicIcon.tsx`](admin/inertia/components/DynamicIcon.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'DynamicIcon'.
- [`Footer.tsx`](admin/inertia/components/Footer.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Footer'.
- [`HorizontalBarChart.tsx`](admin/inertia/components/HorizontalBarChart.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'HorizontalBarChart'.
- [`InfoTooltip.tsx`](admin/inertia/components/InfoTooltip.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'InfoTooltip'.
- [`InstallActivityFeed.tsx`](admin/inertia/components/InstallActivityFeed.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'InstallActivityFeed'.
- [`KbGuardrailModal.tsx`](admin/inertia/components/KbGuardrailModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'KbGuardrailModal'.
- [`LoadingSpinner.tsx`](admin/inertia/components/LoadingSpinner.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'LoadingSpinner'.
- [`MarkdocRenderer.tsx`](admin/inertia/components/MarkdocRenderer.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'MarkdocRenderer'.
- [`MarkdownEditor.tsx`](admin/inertia/components/MarkdownEditor.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'MarkdownEditor'.
- [`ProgressBar.tsx`](admin/inertia/components/ProgressBar.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ProgressBar'.
- [`ServiceLogsModal.tsx`](admin/inertia/components/ServiceLogsModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ServiceLogsModal'.
- [`ServiceStatsModal.tsx`](admin/inertia/components/ServiceStatsModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ServiceStatsModal'.
- [`StorageProjectionBar.tsx`](admin/inertia/components/StorageProjectionBar.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'StorageProjectionBar'.
- [`StyledButton.tsx`](admin/inertia/components/StyledButton.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'StyledButton'.
- [`StyledModal.tsx`](admin/inertia/components/StyledModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'StyledModal'.
- [`StyledSectionHeader.tsx`](admin/inertia/components/StyledSectionHeader.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'StyledSectionHeader'.
- [`StyledSidebar.tsx`](admin/inertia/components/StyledSidebar.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'StyledSidebar'.
- [`StyledTable.tsx`](admin/inertia/components/StyledTable.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'StyledTable'.
- [`ThemeToggle.tsx`](admin/inertia/components/ThemeToggle.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ThemeToggle'.
- [`TierSelectionModal.tsx`](admin/inertia/components/TierSelectionModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'TierSelectionModal'.
- [`UpdateServiceModal.tsx`](admin/inertia/components/UpdateServiceModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'UpdateServiceModal'.
- [`WhatsNewBanner.tsx`](admin/inertia/components/WhatsNewBanner.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'WhatsNewBanner'.
- [`WikipediaSelector.tsx`](admin/inertia/components/WikipediaSelector.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'WikipediaSelector'.

### 📁 [`admin/inertia/components/ZimUploader/`](admin/inertia/components/ZimUploader) — Contém 1 arquivo

> Componente dedicado ao upload e validação de arquivos compactados no formato ZIM.  
> Oferece feedback de progresso e validação de integridade de arquivos de enciclopédias.  
> Permite que usuários adicionem seus próprios pacotes Kiwix manualmente.  

- [`index.tsx`](admin/inertia/components/ZimUploader/index.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'index'.

### 📁 [`admin/inertia/components/benchmark/`](admin/inertia/components/benchmark) — Contém 7 arquivos

> Componentes visuais especializados em exibir métricas e resultados de desempenho da máquina.  
> Renderiza gráficos de barras comparativos, pontuações de hardware e tags de montagem do sistema.  
> Fornece interface amigável para envio de testes ao placar público global.  

- [`BenchmarkRunView.tsx`](admin/inertia/components/benchmark/BenchmarkRunView.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'BenchmarkRunView'.
- [`CoreGrid.tsx`](admin/inertia/components/benchmark/CoreGrid.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CoreGrid'.
- [`LiveReadout.tsx`](admin/inertia/components/benchmark/LiveReadout.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'LiveReadout'.
- [`ResultsSoFar.tsx`](admin/inertia/components/benchmark/ResultsSoFar.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ResultsSoFar'.
- [`ScoreReveal.tsx`](admin/inertia/components/benchmark/ScoreReveal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ScoreReveal'.
- [`Sparkline.tsx`](admin/inertia/components/benchmark/Sparkline.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Sparkline'.
- [`StageRail.tsx`](admin/inertia/components/benchmark/StageRail.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'StageRail'.

### 📁 [`admin/inertia/components/chat/`](admin/inertia/components/chat) — Contém 12 arquivos

> Elementos de interface que compõem o ambiente de conversação com o modelo de inteligência artificial.  
> Inclui caixa de diálogo, renderizador de mensagens em markdown, lista de sessões e indicador de digitação.  
> Oferece controles para alternar modelos e anexar arquivos de contexto via RAG.  

- [`ChatAssistantAvatar.tsx`](admin/inertia/components/chat/ChatAssistantAvatar.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ChatAssistantAvatar'.
- [`ChatButton.tsx`](admin/inertia/components/chat/ChatButton.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ChatButton'.
- [`ChatInterface.tsx`](admin/inertia/components/chat/ChatInterface.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ChatInterface'.
- [`ChatMessageBubble.tsx`](admin/inertia/components/chat/ChatMessageBubble.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ChatMessageBubble'.
- [`ChatModal.tsx`](admin/inertia/components/chat/ChatModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ChatModal'.
- [`ChatSidebar.tsx`](admin/inertia/components/chat/ChatSidebar.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ChatSidebar'.
- [`CollectionCombobox.tsx`](admin/inertia/components/chat/CollectionCombobox.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CollectionCombobox'.
- [`CollectionsManager.tsx`](admin/inertia/components/chat/CollectionsManager.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CollectionsManager'.
- [`KbPolicyPromptBanner.tsx`](admin/inertia/components/chat/KbPolicyPromptBanner.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'KbPolicyPromptBanner'.
- [`KnowledgeBaseModal.tsx`](admin/inertia/components/chat/KnowledgeBaseModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'KnowledgeBaseModal'.
- [`NomadMdModal.tsx`](admin/inertia/components/chat/NomadMdModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'NomadMdModal'.
- [`index.tsx`](admin/inertia/components/chat/index.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'index'.

### 📁 [`admin/inertia/components/conditions/`](admin/inertia/components/conditions) — Contém 2 arquivos

> Componentes focados na visualização e navegação pelo catálogo de condições médicas.  
> Exibe detalhes de sintomas, alertas de emergência e condutas recomendadas.  
> Facilita a localização rápida de informações clínicas em momentos de crise.  

- [`RemedySafetyNote.tsx`](admin/inertia/components/conditions/RemedySafetyNote.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'RemedySafetyNote'.
- [`SafetyBanner.tsx`](admin/inertia/components/conditions/SafetyBanner.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'SafetyBanner'.

### 📁 [`admin/inertia/components/drug-reference/`](admin/inertia/components/drug-reference) — Contém 6 arquivos

> Componentes voltados para consulta e detalhamento de bulas de medicamentos.  
> Apresenta posologias, advertências, contraindicações e interações medicamentosas de forma clara.  
> Auxilia profissionais e leigos no entendimento seguro do uso de fármacos.  

- [`DrugDisclaimerModal.tsx`](admin/inertia/components/drug-reference/DrugDisclaimerModal.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'DrugDisclaimerModal'.
- [`DrugResultRow.tsx`](admin/inertia/components/drug-reference/DrugResultRow.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'DrugResultRow'.
- [`IngestStatus.tsx`](admin/inertia/components/drug-reference/IngestStatus.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'IngestStatus'.
- [`IngredientGroup.tsx`](admin/inertia/components/drug-reference/IngredientGroup.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'IngredientGroup'.
- [`InteractionColumn.tsx`](admin/inertia/components/drug-reference/InteractionColumn.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'InteractionColumn'.
- [`LabelBlocks.tsx`](admin/inertia/components/drug-reference/LabelBlocks.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'LabelBlocks'.

### 📁 [`admin/inertia/components/file-uploader/`](admin/inertia/components/file-uploader) — Contém 2 arquivos

> Mecanismo visual interativo para seleção e envio de arquivos por arrastar-e-soltar (drag-and-drop).  
> Oferece pré-visualização, barra de progresso em tempo real e controle de formatos aceitos.  
> Usado em fluxos de importação de documentos para a base de conhecimento semântica.  

- [`index.css`](admin/inertia/components/file-uploader/index.css): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'index.css'.
- [`index.tsx`](admin/inertia/components/file-uploader/index.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'index'.

### 📁 [`admin/inertia/components/inputs/`](admin/inertia/components/inputs) — Contém 3 arquivos

> Coleção de controles de formulário customizados e estilizados com Tailwind CSS.  
> Agrupa seletores de opções, inputs de texto com validação e botões de alternância.  
> Garante acessibilidade e uniformidade em toda a coleta de dados de formulários.  

- [`Input.tsx`](admin/inertia/components/inputs/Input.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Input'.
- [`Select.tsx`](admin/inertia/components/inputs/Select.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Select'.
- [`Switch.tsx`](admin/inertia/components/inputs/Switch.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Switch'.

### 📁 [`admin/inertia/components/layout/`](admin/inertia/components/layout) — Contém 1 arquivo

> Componentes estruturais permanentes da carcaça visual do aplicativo.  
> Engloba barras de navegação lateral (sidebars), menus superiores e rodapés informativos.  
> Garante navegação consistente e responsiva em dispositivos móveis e desktops.  

- [`BackToHomeHeader.tsx`](admin/inertia/components/layout/BackToHomeHeader.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'BackToHomeHeader'.

### 📁 [`admin/inertia/components/maps/`](admin/inertia/components/maps) — Contém 5 arquivos

> Componentes para renderização de mapas interativos vetoriais offline via biblioteca MapLibre.  
> Permite aplicar zoom, navegar geograficamente e visualizar pontos de interesse sem sinal de internet.  
> Inclui seletores de camadas de mapa e painéis de metadados regionais.  

- [`CoordinateOverlay.tsx`](admin/inertia/components/maps/CoordinateOverlay.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CoordinateOverlay'.
- [`MapComponent.tsx`](admin/inertia/components/maps/MapComponent.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'MapComponent'.
- [`MarkerPanel.tsx`](admin/inertia/components/maps/MarkerPanel.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'MarkerPanel'.
- [`MarkerPin.tsx`](admin/inertia/components/maps/MarkerPin.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'MarkerPin'.
- [`ScaleUnitToggle.tsx`](admin/inertia/components/maps/ScaleUnitToggle.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ScaleUnitToggle'.

### 📁 [`admin/inertia/components/markdoc/`](admin/inertia/components/markdoc) — Contém 5 arquivos

> Adaptadores e renderizadores de nós e tags customizadas para a sintaxe Markdoc.  
> Converte documentos Markdown ricos em componentes React com suporte a alertas, links e tabelas.  
> Torna os artigos da documentação integrados nativamente com a interface do sistema.  

- [`Heading.tsx`](admin/inertia/components/markdoc/Heading.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Heading'.
- [`Image.tsx`](admin/inertia/components/markdoc/Image.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Image'.
- [`List.tsx`](admin/inertia/components/markdoc/List.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'List'.
- [`ListItem.tsx`](admin/inertia/components/markdoc/ListItem.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ListItem'.
- [`Table.tsx`](admin/inertia/components/markdoc/Table.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'Table'.

### 📁 [`admin/inertia/components/systeminfo/`](admin/inertia/components/systeminfo) — Contém 3 arquivos

> Monitores gráficos de telemetria de hardware e saúde do servidor em tempo real.  
> Apresenta uso de memória RAM, porcentagem de CPU, temperatura e espaço restante em disco.  
> Ajuda a prevenir sobrecargas durante tarefas pesadas de inferência de IA.  

- [`CircularGauge.tsx`](admin/inertia/components/systeminfo/CircularGauge.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CircularGauge'.
- [`InfoCard.tsx`](admin/inertia/components/systeminfo/InfoCard.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'InfoCard'.
- [`StatusCard.tsx`](admin/inertia/components/systeminfo/StatusCard.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'StatusCard'.

### 📁 [`admin/inertia/components/updates/`](admin/inertia/components/updates) — Contém 4 arquivos

> Elementos visuais que notificam e detalham o progresso de atualizações de software.  
> Exibe banners de novidades, modais de confirmação de release e registro de downloads.  
> Mantém o usuário ciente de melhorias disponíveis e do status do sistema.  

- [`AppAutoUpdateSection.tsx`](admin/inertia/components/updates/AppAutoUpdateSection.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'AppAutoUpdateSection'.
- [`ContentAutoUpdateSection.tsx`](admin/inertia/components/updates/ContentAutoUpdateSection.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ContentAutoUpdateSection'.
- [`ContentUpdatesSection.tsx`](admin/inertia/components/updates/ContentUpdatesSection.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'ContentUpdatesSection'.
- [`CoreAutoUpdateSection.tsx`](admin/inertia/components/updates/CoreAutoUpdateSection.tsx): [Componente UI | React TSX | Tailwind] Elemento de interface visual modular e reutilizável para 'CoreAutoUpdateSection'.

### 📁 [`admin/inertia/context/`](admin/inertia/context) — Contém 2 arquivos

> Provedores de Context API do React para gerenciamento de estado global no frontend.  
> Compartilha preferências de tema escuro/claro e notificações globais entre telas.  
> Evita prop drilling facilitando o consumo de estados compartilhados.  

- [`ModalContext.ts`](admin/inertia/context/ModalContext.ts): [Contexto React | React TSX] Provedor de contexto global para compartilhamento de estado de 'ModalContext'.
- [`NotificationContext.ts`](admin/inertia/context/NotificationContext.ts): [Contexto React | React TSX] Provedor de contexto global para compartilhamento de estado de 'NotificationContext'.

### 📁 [`admin/inertia/css/`](admin/inertia/css) — Contém 1 arquivo

> Folha de estilos mestre da aplicação e diretivas de compilação do Tailwind CSS.  
> Define regras de fontes tipográficas, animações suaves e temas de alto contraste.  
> Responsável pela harmonia visual e responsividade estética de todo o Command Center.  

- [`app.css`](admin/inertia/css/app.css): [Estilos Globais | CSS | Tailwind] Importação de diretivas Tailwind, fontes de sistema e ajustes de tema visual.

### 📁 [`admin/inertia/hooks/`](admin/inertia/hooks) — Contém 21 arquivos

> Coleção de hooks personalizados do React para consumo de rotas, eventos e estado reativo.  
> Integra requisições com React Query para cache inteligente e sincronização em segundo plano.  
> Encapsula lógicas complexas de formulários, controle de websockets e SSE.  

- [`useAppAutoUpdateStatus.ts`](admin/inertia/hooks/useAppAutoUpdateStatus.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useAppAutoUpdateStatus'.
- [`useAutoUpdateStatus.ts`](admin/inertia/hooks/useAutoUpdateStatus.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useAutoUpdateStatus'.
- [`useBenchmarkRerunBanner.ts`](admin/inertia/hooks/useBenchmarkRerunBanner.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useBenchmarkRerunBanner'.
- [`useBenchmarkRun.ts`](admin/inertia/hooks/useBenchmarkRun.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useBenchmarkRun'.
- [`useContentAutoUpdateStatus.ts`](admin/inertia/hooks/useContentAutoUpdateStatus.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useContentAutoUpdateStatus'.
- [`useCreatorPacks.ts`](admin/inertia/hooks/useCreatorPacks.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useCreatorPacks'.
- [`useDebounce.ts`](admin/inertia/hooks/useDebounce.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useDebounce'.
- [`useDiskDisplayData.ts`](admin/inertia/hooks/useDiskDisplayData.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useDiskDisplayData'.
- [`useDownloads.ts`](admin/inertia/hooks/useDownloads.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useDownloads'.
- [`useEmbedJobs.ts`](admin/inertia/hooks/useEmbedJobs.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useEmbedJobs'.
- [`useErrorNotification.ts`](admin/inertia/hooks/useErrorNotification.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useErrorNotification'.
- [`useInternetStatus.ts`](admin/inertia/hooks/useInternetStatus.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useInternetStatus'.
- [`useMapMarkers.ts`](admin/inertia/hooks/useMapMarkers.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useMapMarkers'.
- [`useMapRegionFiles.ts`](admin/inertia/hooks/useMapRegionFiles.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useMapRegionFiles'.
- [`useOllamaModelDownloads.ts`](admin/inertia/hooks/useOllamaModelDownloads.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useOllamaModelDownloads'.
- [`useServiceInstallationActivity.ts`](admin/inertia/hooks/useServiceInstallationActivity.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useServiceInstallationActivity'.
- [`useServiceInstalledStatus.tsx`](admin/inertia/hooks/useServiceInstalledStatus.tsx): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useServiceInstalledStatusx'.
- [`useSystemInfo.ts`](admin/inertia/hooks/useSystemInfo.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useSystemInfo'.
- [`useSystemSetting.ts`](admin/inertia/hooks/useSystemSetting.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useSystemSetting'.
- [`useTheme.ts`](admin/inertia/hooks/useTheme.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useTheme'.
- [`useUpdateAvailable.ts`](admin/inertia/hooks/useUpdateAvailable.ts): [Custom React Hook | TypeScript | React Query] Hook reativo de gerenciamento de estado ou mutação de 'useUpdateAvailable'.

### 📁 [`admin/inertia/layouts/`](admin/inertia/layouts) — Contém 4 arquivos

> Layouts mestres que encapsulam e estruturam a renderização das páginas.  
> Define cascas visuais distintas para navegação interna com sidebar ou telas cheias imersivas.  
> Preserva cabeçalhos e navegações ativas entre trocas de páginas sem recarregar a tela inteira.  

- [`AppLayout.tsx`](admin/inertia/layouts/AppLayout.tsx): [Layout Mestre | React TSX | Tailwind] Estrutura de casca e posicionamento visual da página para 'AppLayout'.
- [`DocsLayout.tsx`](admin/inertia/layouts/DocsLayout.tsx): [Layout Mestre | React TSX | Tailwind] Estrutura de casca e posicionamento visual da página para 'DocsLayout'.
- [`MapsLayout.tsx`](admin/inertia/layouts/MapsLayout.tsx): [Layout Mestre | React TSX | Tailwind] Estrutura de casca e posicionamento visual da página para 'MapsLayout'.
- [`SettingsLayout.tsx`](admin/inertia/layouts/SettingsLayout.tsx): [Layout Mestre | React TSX | Tailwind] Estrutura de casca e posicionamento visual da página para 'SettingsLayout'.

### 📁 [`admin/inertia/lib/`](admin/inertia/lib) — Contém 13 arquivos

> Bibliotecas auxiliares, utilitários puros e funções de cálculo do ecossistema frontend.  
> Oferece formatação de datas, conversão de bytes, clientes de API HTTP e filtros de busca.  
> Provê funções de apoio transversais sem dependência direta de ciclo de vida de componentes.  

- [`api.ts`](admin/inertia/lib/api.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'api'.
- [`benchmarkScore.ts`](admin/inertia/lib/benchmarkScore.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'benchmarkScore'.
- [`builderTagWords.ts`](admin/inertia/lib/builderTagWords.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'builderTagWords'.
- [`classNames.ts`](admin/inertia/lib/classNames.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'classNames'.
- [`collections.ts`](admin/inertia/lib/collections.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'collections'.
- [`global_map_banner.ts`](admin/inertia/lib/global_map_banner.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'global map banner'.
- [`i18n.ts`](admin/inertia/lib/i18n.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'i18n'.
- [`icons.ts`](admin/inertia/lib/icons.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'icons'.
- [`kb_file_grouping.ts`](admin/inertia/lib/kb_file_grouping.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'kb file grouping'.
- [`kb_guardrail.ts`](admin/inertia/lib/kb_guardrail.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'kb guardrail'.
- [`kb_job_health_display.ts`](admin/inertia/lib/kb_job_health_display.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'kb job health display'.
- [`navigation.ts`](admin/inertia/lib/navigation.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'navigation'.
- [`util.ts`](admin/inertia/lib/util.ts): [Biblioteca Utilitária | TypeScript] Funções utilitárias, clientes HTTP e helpers frontend para 'util'.

### 📁 [`admin/inertia/pages/`](admin/inertia/pages) — Contém 5 arquivos

> Páginas principais de nível superior renderizadas pelas respostas dos controladores Inertia.  
> Reúne as telas de chat com IA, mapas interativos, loja de serviços e painel de boas-vindas.  
> Atua como ponto de partida da experiência de navegação do usuário no navegador.  

- [`about.tsx`](admin/inertia/pages/about.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'about'.
- [`chat.tsx`](admin/inertia/pages/chat.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'chat'.
- [`home.tsx`](admin/inertia/pages/home.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'home'.
- [`maps.tsx`](admin/inertia/pages/maps.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'maps'.
- [`supply-depot.tsx`](admin/inertia/pages/supply-depot.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'supply-depot'.

### 📁 [`admin/inertia/pages/conditions/`](admin/inertia/pages/conditions) — Contém 1 arquivo

> Páginas dedicadas à busca, listagem e navegação detalhada pelo guia clínico de condições de saúde.  
> Organiza sintomas e protocolos terapêuticos de forma visual e intuitiva para situações de campo.  
> Permite acesso célere a procedimentos sem necessidade de conexão externa.  

- [`show.tsx`](admin/inertia/pages/conditions/show.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'show'.

### 📁 [`admin/inertia/pages/docs/`](admin/inertia/pages/docs) — Contém 1 arquivo

> Página dedicada ao leitor interativo de documentação interna e manuais de uso.  
> Apresenta índice dinâmico, mecanismo de busca textual e visualizador de conteúdo técnico formatado.  
> Serve de hub central de aprendizado sobre as ferramentas do ecossistema NOMAD.  

- [`show.tsx`](admin/inertia/pages/docs/show.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'show'.

### 📁 [`admin/inertia/pages/drug-reference/`](admin/inertia/pages/drug-reference) — Contém 3 arquivos

> Telas para consulta do dicionário farmacêutico e bulário completo.  
> Permite pesquisar medicamentos por nome comercial ou princípio ativo e verificar interações.  
> Fornece suporte essencial em cenários médicos onde o acesso a fontes online é inexistente.  

- [`index.tsx`](admin/inertia/pages/drug-reference/index.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'index'.
- [`interactions.tsx`](admin/inertia/pages/drug-reference/interactions.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'interactions'.
- [`show.tsx`](admin/inertia/pages/drug-reference/show.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'show'.

### 📁 [`admin/inertia/pages/easy-setup/`](admin/inertia/pages/easy-setup) — Contém 2 arquivos

> Telas do assistente guiado de primeira configuração (onboarding wizard).  
> Orienta o usuário no download dos primeiros pacotes de mapas, idiomas e modelos de IA recomendados.  
> Garante uma experiência inicial suave sem configurações manuais complexas.  

- [`complete.tsx`](admin/inertia/pages/easy-setup/complete.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'complete'.
- [`index.tsx`](admin/inertia/pages/easy-setup/index.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'index'.

### 📁 [`admin/inertia/pages/errors/`](admin/inertia/pages/errors) — Contém 2 arquivos

> Páginas personalizadas de erro amigáveis para falhas HTTP como rotas não encontradas (404) ou servidor (500).  
> Oferece opções claras para retorno seguro ao painel inicial sem deixar o usuário sem rumo.  
> Preserva a coesão visual mesmo durante cenários anômalos de navegação.  

- [`not_found.tsx`](admin/inertia/pages/errors/not_found.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'not found'.
- [`server_error.tsx`](admin/inertia/pages/errors/server_error.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'server error'.

### 📁 [`admin/inertia/pages/settings/`](admin/inertia/pages/settings) — Contém 10 arquivos

> Páginas de controle e personalização fina das configurações operacionais da plataforma.  
> Permite gerenciar contêineres Docker, definir servidores remotos de IA, auditar discos e agendar updates.  
> Centraliza as permissões e parâmetros avançados de funcionamento do sistema.  

- [`advanced.tsx`](admin/inertia/pages/settings/advanced.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'advanced'.
- [`apps.tsx`](admin/inertia/pages/settings/apps.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'apps'.
- [`benchmark.tsx`](admin/inertia/pages/settings/benchmark.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'benchmark'.
- [`creator-packs.tsx`](admin/inertia/pages/settings/creator-packs.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'creator-packs'.
- [`legal.tsx`](admin/inertia/pages/settings/legal.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'legal'.
- [`maps.tsx`](admin/inertia/pages/settings/maps.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'maps'.
- [`models.tsx`](admin/inertia/pages/settings/models.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'models'.
- [`support.tsx`](admin/inertia/pages/settings/support.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'support'.
- [`system.tsx`](admin/inertia/pages/settings/system.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'system'.
- [`update.tsx`](admin/inertia/pages/settings/update.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'update'.

### 📁 [`admin/inertia/pages/settings/zim/`](admin/inertia/pages/settings/zim) — Contém 2 arquivos

> Telas especializadas no gerenciamento das bibliotecas de arquivos ZIM e pacotes Kiwix.  
> Lista conteúdos instalados, monitora consumo de armazenamento e permite exclusão ou adição de livros.  
> Dá controle total sobre o acervo enciclopédico residente no servidor.  

- [`index.tsx`](admin/inertia/pages/settings/zim/index.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'index'.
- [`remote-explorer.tsx`](admin/inertia/pages/settings/zim/remote-explorer.tsx): [Página Web | React TSX | Inertia] Interface visual e interativa completa para a tela 'remote-explorer'.

### 📁 [`admin/inertia/providers/`](admin/inertia/providers) — Contém 3 arquivos

> Componentes provedores de infraestrutura e dependências contextuais do React.  
> Inicializa o cliente do TanStack Query, temas visuais e listeners de eventos da janela.  
> Envolve a árvore de componentes injetando recursos fundamentais para o frontend.  

- [`ModalProvider.tsx`](admin/inertia/providers/ModalProvider.tsx): [Provider React | React TSX] Provedor de dependências contextuais e infraestrutura para 'ModalProvider'.
- [`NotificationProvider.tsx`](admin/inertia/providers/NotificationProvider.tsx): [Provider React | React TSX] Provedor de dependências contextuais e infraestrutura para 'NotificationProvider'.
- [`ThemeProvider.tsx`](admin/inertia/providers/ThemeProvider.tsx): [Provider React | React TSX] Provedor de dependências contextuais e infraestrutura para 'ThemeProvider'.

### 📁 [`admin/providers/`](admin/providers) — Contém 5 arquivos

> Provedores de serviço (Service Providers) do ciclo de vida da aplicação AdonisJS no backend.  
> Registram bindings no contêiner IoC, orquestram migrações na inicialização e configuram rotas estáticas.  
> Garantem que os recursos nativos do sistema estejam disponíveis antes da chegada de requisições.  

- [`gpu_passthrough_remediation_provider.ts`](admin/providers/gpu_passthrough_remediation_provider.ts): [Service Provider | TypeScript | AdonisJS] Detecta e ajusta configurações de GPU para compatibilidade com contêineres de IA.
- [`kiwix_migration_provider.ts`](admin/providers/kiwix_migration_provider.ts): [Service Provider | TypeScript | AdonisJS] Provider que realiza a migração e indexação da biblioteca Kiwix no boot.
- [`map_static_provider.ts`](admin/providers/map_static_provider.ts): [Service Provider | TypeScript | AdonisJS] Configura rotas virtuais para servir arquivos estáticos de mapas offline.
- [`qdrant_restart_policy_provider.ts`](admin/providers/qdrant_restart_policy_provider.ts): [Service Provider | TypeScript | AdonisJS] Garante a política correta de reinicialização do container vetorial Qdrant.
- [`version_check_provider.ts`](admin/providers/version_check_provider.ts): [Service Provider | TypeScript | AdonisJS] Verifica na inicialização a versão atual e integridade dos bancos locais.

### 📁 [`admin/public/`](admin/public) — Contém 10 arquivos

> Diretório raiz de arquivos estáticos servidos diretamente pelo servidor web sem processamento prévio.  
> Armazena favicons de diversos tamanhos, logotipos, emblemas da marca e banners de parceiros.  
> Garante entrega rápida de assets gráficos essenciais ao carregamento inicial da página.  

- [`favicon-16x16.png`](admin/public/favicon-16x16.png): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'favicon-16x16.png'.
- [`favicon-180x180.png`](admin/public/favicon-180x180.png): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'favicon-180x180.png'.
- [`favicon-192x192.png`](admin/public/favicon-192x192.png): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'favicon-192x192.png'.
- [`favicon-32x32.png`](admin/public/favicon-32x32.png): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'favicon-32x32.png'.
- [`favicon-512x512 - Copy.png`](admin/public/favicon-512x512 - Copy.png): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'favicon-512x512 - Copy.png'.
- [`favicon-512x512.png`](admin/public/favicon-512x512.png): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'favicon-512x512.png'.
- [`powered_by_crosstalk.svg`](admin/public/powered_by_crosstalk.svg): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'powered_by_crosstalk.svg'.
- [`powered_by_crosstalk.webp`](admin/public/powered_by_crosstalk.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'powered_by_crosstalk.webp'.
- [`project_nomad_logo.webp`](admin/public/project_nomad_logo.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'project_nomad_logo.webp'.
- [`rogue-support-banner.webp`](admin/public/rogue-support-banner.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'rogue-support-banner.webp'.

### 📁 [`admin/public/creator-packs/`](admin/public/creator-packs) — Contém 3 arquivos

> Imagens de capa e banners promocionais dos pacotes de conteúdo curados por criadores parceiros.  
> Exibidos na vitrine de conteúdo para enriquecer a apresentação visual das coleções recomendadas.  
> Facilita a identificação rápida dos temas e autores de cada pacote.  

- [`crosstalk-solutions.webp`](admin/public/creator-packs/crosstalk-solutions.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'crosstalk-solutions.webp'.
- [`modern-rogue.webp`](admin/public/creator-packs/modern-rogue.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'modern-rogue.webp'.
- [`project-nomad.webp`](admin/public/creator-packs/project-nomad.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'project-nomad.webp'.

### 📁 [`admin/public/docs/`](admin/public/docs) — Contém 8 arquivos

> Ilustrações, esquemas e diagramas gráficos inseridos nas páginas de documentação interna.  
> Auxilia na compreensão visual de arquiteturas, diagramas de rede e tutoriais passo a passo.  
> Enriquece os artigos informativos oferecendo recursos visuais didáticos.  

- [`ai-chat.webp`](admin/public/docs/ai-chat.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'ai-chat.webp'.
- [`benchmark.webp`](admin/public/docs/benchmark.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'benchmark.webp'.
- [`content-explorer.webp`](admin/public/docs/content-explorer.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'content-explorer.webp'.
- [`dashboard.webp`](admin/public/docs/dashboard.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'dashboard.webp'.
- [`easy-setup-step1.webp`](admin/public/docs/easy-setup-step1.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'easy-setup-step1.webp'.
- [`easy-setup-tiers.webp`](admin/public/docs/easy-setup-tiers.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'easy-setup-tiers.webp'.
- [`knowledge-base.webp`](admin/public/docs/knowledge-base.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'knowledge-base.webp'.
- [`maps.webp`](admin/public/docs/maps.webp): [Ativo Estático | Imagem/Vetor] Recurso gráfico de logotipo, favicon ou ilustração para 'maps.webp'.

### 📁 [`admin/resources/`](admin/resources) — Contém 0 arquivos

> Recursos de suporte brutos e arquivos estáticos utilizados internamente pelo backend.  
> Abriga dados geoespaciais e templates de visualização do servidor.  
> Serve de repositório de recursos que alimentam rotinas de compilação ou leitura dinâmica.  

*Nenhum arquivo diretamente nesta pasta (apenas subdiretórios).*

### 📁 [`admin/resources/geodata/`](admin/resources/geodata) — Contém 1 arquivo

> Arquivos de dados geoespaciais em formato GeoJSON ou binários para demarcações de regiões.  
> Usado para determinar fronteiras de países e regiões nos seletores interativos de mapas.  
> Permite indexação espacial precisa sem necessidade de consultas a serviços de mapas externos.  

- [`ne_50m_admin_0_countries.geojson`](admin/resources/geodata/ne_50m_admin_0_countries.geojson): [Arquivo de Suporte | GEOJSON] Definição e suporte ao módulo 'ne_50m_admin_0_countries.geojson'.

### 📁 [`admin/resources/views/`](admin/resources/views) — Contém 1 arquivo

> Arquivos de modelo de visualização compilados pelo motor de templates do backend.  
> Guarda a casca HTML fundamental sobre a qual a aplicação Inertia é montada no navegador.  
> Configura tags meta, cabeçalhos de fontes e scripts de inicialização.  

- [`inertia_layout.edge`](admin/resources/views/inertia_layout.edge): [Template HTML | Edge Engine] Layout HTML fundamental que carrega scripts, estilos e a raiz do Inertia React.

### 📁 [`admin/scripts/`](admin/scripts) — Contém 2 arquivos

> Scripts de manutenção, auditoria de segurança e geração de dados estáticos do projeto.  
> Inclui ferramentas em Python e TypeScript para verificar portas de contêineres e sincronizar dados médicos.  
> Auxilia a equipe em rotinas operacionais periódicas de desenvolvimento.  

- [`audit_catalog_ports.py`](admin/scripts/audit_catalog_ports.py): [Script Auxiliar | Python] Script de auditoria para detectar conflitos de portas nos serviços do Supply Depot.
- [`generate_curated_data.ts`](admin/scripts/generate_curated_data.ts): [Script Auxiliar | TypeScript] Transforma os arquivos JSON de coleções médicas em código TypeScript tipado.

### 📁 [`admin/start/`](admin/start) — Contém 3 arquivos

> Arquivos responsáveis pela inicialização, roteamento e ambiente de execução do AdonisJS.  
> Contém a definição do mapa mestre de rotas da aplicação, registro de middlewares e variáveis globais.  
> Define o fluxo por onde todas as mensagens de entrada no servidor devem transitar.  

- [`env.ts`](admin/start/env.ts): [Validação Env | TypeScript | AdonisJS] Validação estrita de variáveis de ambiente com schemas VineJS.
- [`kernel.ts`](admin/start/kernel.ts): [Kernel | TypeScript | AdonisJS] Registro e ordenação de middlewares globais e de rota da aplicação.
- [`routes.ts`](admin/start/routes.ts): [Roteamento | TypeScript | AdonisJS] Definição de todas as rotas web, endpoints REST e controladores associados.

### 📁 [`admin/start/openapi/`](admin/start/openapi) — Contém 2 arquivos

> Especificações da API REST estruturadas no padrão OpenAPI / Swagger.  
> Documenta detalhadamente todos os contratos de requisição e resposta expostos pelo servidor.  
> Permite que desenvolvedores e clientes externos integrem-se à API de forma padronizada.  

- [`documented.ts`](admin/start/openapi/documented.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'documented.ts'.
- [`generator.ts`](admin/start/openapi/generator.ts): [Arquivo de Suporte | TS] Definição e suporte ao módulo 'generator.ts'.

### 📁 [`admin/tests/`](admin/tests) — Contém 1 arquivo

> Configurações gerais e arquivos de bootstrapping para o framework de testes Japa.  
> Inicializa banco de dados temporário, emuladores e asserções antes da bateria de testes.  
> Assegura um ambiente controlado e confiável para a execução das suítes de teste.  

- [`bootstrap.ts`](admin/tests/bootstrap.ts): [Configuração | TypeScript | Japa] Inicializador e configurador do ambiente e plugins de teste.

### 📁 [`admin/tests/functional/`](admin/tests/functional) — Contém 1 arquivo

> Testes automatizados de nível funcional que simulam fluxos completos de navegação e chamadas de API.  
> Garante que requisições HTTP reais recebam respostas condizentes de controladores e banco.  
> Valida o comportamento integrado de múltiplos módulos do sistema.  

- [`openapi.spec.ts`](admin/tests/functional/openapi.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'openapi'.

### 📁 [`admin/tests/standalone/`](admin/tests/standalone) — Contém 6 arquivos

> Testes isolados executáveis diretamente via terminal sem a necessidade do servidor completo rodando.  
> Avalia scripts específicos, validações de pipelines de auto-update e verificadores de hardware.  
> Útil para validações rápidas e diagnósticos pontuais em pipelines de CI/CD.  

- [`conditions.standalone.ts`](admin/tests/standalone/conditions.standalone.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'conditions.standalone'.
- [`curated_data_sync.standalone.ts`](admin/tests/standalone/curated_data_sync.standalone.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'curated data sync.standalone'.
- [`drug_ingest_status.standalone.ts`](admin/tests/standalone/drug_ingest_status.standalone.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'drug ingest status.standalone'.
- [`drug_interactions.standalone.ts`](admin/tests/standalone/drug_interactions.standalone.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'drug interactions.standalone'.
- [`drug_tier_rework.standalone.ts`](admin/tests/standalone/drug_tier_rework.standalone.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'drug tier rework.standalone'.
- [`natural_remedies.standalone.ts`](admin/tests/standalone/natural_remedies.standalone.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'natural remedies.standalone'.

### 📁 [`admin/tests/unit/`](admin/tests/unit) — Contém 24 arquivos

> Suíte de testes unitários focados na validação isolada de funções puras e regras de negócio.  
> Cobre serviços de arquivos, extratores ZIM, utilitários matemáticos e validações de tipos.  
> Garante a estabilidade das fundações algorítmicas do sistema contra regressões.  

- [`amd_hsa_override.spec.ts`](admin/tests/unit/amd_hsa_override.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'amd hsa override'.
- [`app_auto_update.spec.ts`](admin/tests/unit/app_auto_update.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'app auto update'.
- [`cloud_metadata_url.spec.ts`](admin/tests/unit/cloud_metadata_url.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'cloud metadata url'.
- [`content_auto_update.spec.ts`](admin/tests/unit/content_auto_update.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'content auto update'.
- [`content_auto_update_backoff.spec.ts`](admin/tests/unit/content_auto_update_backoff.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'content auto update backoff'.
- [`content_reindex_decision.spec.ts`](admin/tests/unit/content_reindex_decision.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'content reindex decision'.
- [`curated_resource_schema.spec.ts`](admin/tests/unit/curated_resource_schema.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'curated resource schema'.
- [`custom_app_guard.spec.ts`](admin/tests/unit/custom_app_guard.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'custom app guard'.
- [`drug_ingest_status.spec.ts`](admin/tests/unit/drug_ingest_status.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'drug ingest status'.
- [`drug_interactions.spec.ts`](admin/tests/unit/drug_interactions.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'drug interactions'.
- [`drug_labels.spec.ts`](admin/tests/unit/drug_labels.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'drug labels'.
- [`global_map_banner.spec.ts`](admin/tests/unit/global_map_banner.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'global map banner'.
- [`kb_file_grouping.spec.ts`](admin/tests/unit/kb_file_grouping.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'kb file grouping'.
- [`kb_guardrail.spec.ts`](admin/tests/unit/kb_guardrail.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'kb guardrail'.
- [`kb_ingest_decision.spec.ts`](admin/tests/unit/kb_ingest_decision.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'kb ingest decision'.
- [`kb_job_health.spec.ts`](admin/tests/unit/kb_job_health.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'kb job health'.
- [`kb_ratio_lookup.spec.ts`](admin/tests/unit/kb_ratio_lookup.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'kb ratio lookup'.
- [`kb_warning_decision.spec.ts`](admin/tests/unit/kb_warning_decision.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'kb warning decision'.
- [`platform_metadata.spec.ts`](admin/tests/unit/platform_metadata.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'platform metadata'.
- [`private_url.spec.ts`](admin/tests/unit/private_url.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'private url'.
- [`superseded_resource.spec.ts`](admin/tests/unit/superseded_resource.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'superseded resource'.
- [`zim_download_resolution.spec.ts`](admin/tests/unit/zim_download_resolution.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'zim download resolution'.
- [`zim_filename.spec.ts`](admin/tests/unit/zim_filename.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'zim filename'.
- [`zim_html.spec.ts`](admin/tests/unit/zim_html.spec.ts): [Teste Automatizado | TypeScript | Japa] Bateria de testes de validação funcional ou unitária para 'zim html'.

### 📁 [`admin/types/`](admin/types) — Contém 17 arquivos

> Declaração centralizada de interfaces e definições de tipo estático em TypeScript.  
> Padroniza formatos de dados para chats, downloads, contêineres Docker, mapas e telemetria.  
> Garante consistência e previsibilidade em toda a comunicação entre backend e frontend.  

- [`benchmark.ts`](admin/types/benchmark.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'benchmark'.
- [`chat.ts`](admin/types/chat.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'chat'.
- [`collections.ts`](admin/types/collections.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'collections'.
- [`conditions.ts`](admin/types/conditions.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'conditions'.
- [`docker.ts`](admin/types/docker.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'docker'.
- [`downloads.ts`](admin/types/downloads.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'downloads'.
- [`drug_reference.ts`](admin/types/drug_reference.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'drug reference'.
- [`files.ts`](admin/types/files.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'files'.
- [`kb_ingest_state.ts`](admin/types/kb_ingest_state.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'kb ingest state'.
- [`kv_store.ts`](admin/types/kv_store.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'kv store'.
- [`maps.ts`](admin/types/maps.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'maps'.
- [`ollama.ts`](admin/types/ollama.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'ollama'.
- [`rag.ts`](admin/types/rag.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'rag'.
- [`services.ts`](admin/types/services.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'services'.
- [`system.ts`](admin/types/system.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'system'.
- [`util.ts`](admin/types/util.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'util'.
- [`zim.ts`](admin/types/zim.ts): [Contrato de Tipos | TypeScript] Interfaces, enums e tipagem forte compartilhada para 'zim'.

### 📁 [`admin/util/`](admin/util) — Contém 7 arquivos

> Coleção de módulos auxiliares voltados para manipulação de arquivos específicos e dados clínicos.  
> Fornece rotinas para conferência de hashes ZIM, leitura de bulas e comparação de identificadores.  
> Facilita o reaproveitamento de rotinas complexas em múltiplos pontos da aplicação.  

- [`compare_ids.ts`](admin/util/compare_ids.ts): [Utilitário | TypeScript] Função de ordenação e comparação alfanumérica consistente de identificadores.
- [`conditions.ts`](admin/util/conditions.ts): [Utilitário | TypeScript] Módulos de filtragem e busca rápida na base curada de condições de saúde.
- [`docs.ts`](admin/util/docs.ts): [Utilitário | TypeScript] Funções para leitura e processamento de arquivos de documentação técnica interna.
- [`drug_interactions.ts`](admin/util/drug_interactions.ts): [Utilitário | TypeScript] Módulo para conferência de interações perigosas entre pares de medicamentos.
- [`drug_labels.ts`](admin/util/drug_labels.ts): [Utilitário | TypeScript] Algoritmos de busca e formatação de seções de bulas de medicamentos.
- [`files.ts`](admin/util/files.ts): [Utilitário | TypeScript] Utilitários para contagem de bytes, leitura de diretórios e cálculo de espaço.
- [`zim.ts`](admin/util/zim.ts): [Utilitário | TypeScript] Funções para extração de cabeçalhos, títulos e metadados de arquivos ZIM.

### 📁 [`admin/views/`](admin/views) — Contém 1 arquivo

> Template HTML principal do motor Edge utilizado pelo AdonisJS.  
> Define a estrutura do documento raiz, inclusão de assets do Vite e ponto de ancoragem do Inertia.  
> Serve como o recipiente onde todos os componentes visuais em React são injetados.  

- [`inertia_layout.edge`](admin/views/inertia_layout.edge): [Template HTML | Edge Engine] Layout HTML fundamental que carrega scripts, estilos e a raiz do Inertia React.

### 📁 [`collections/`](collections) — Contém 9 arquivos

> Manifestos e catálogos em formato JSON com acervos selecionados para download offline.  
> Inclui seleções de artigos da Wikipedia, arquivos PMTiles de mapas e bancos de saúde de emergência.  
> Define os pacotes que os usuários podem baixar com um clique através do assistente do sistema.  

- [`CATEGORIES-TODO.md`](collections/CATEGORIES-TODO.md): [Documentação | Markdown] Lista de tarefas e planejamento de futuras categorias e expansões de acervo.
- [`conditions.json`](collections/conditions.json): [Dados | JSON | Catálogo] Base estruturada de enfermidades clínicas com sintomas, causas e condutas recomendadas.
- [`creator-pack-license.md`](collections/creator-pack-license.md): [Documentação | Markdown] Termos de permissão e licenciamento para o uso e distribuição dos Creator Packs.
- [`creator-packs.json`](collections/creator-packs.json): [Dados | JSON | Catálogo] Relação de pacotes temáticos de conhecimento montados por criadores da comunidade.
- [`home_remedies.json`](collections/home_remedies.json): [Dados | JSON | Catálogo] Guia de soluções caseiras e cuidados paliativos para uso fora da rede hospitalar.
- [`kiwix-categories.json`](collections/kiwix-categories.json): [Dados | JSON | Catálogo] Mapeamento de categorias e módulos Kiwix (ciência, literatura, programação e medicina).
- [`maps.json`](collections/maps.json): [Dados | JSON | Catálogo] Catálogo de pacotes de mapas vetoriais regionais em formato PMTiles para visualização offline.
- [`natural_remedies.json`](collections/natural_remedies.json): [Dados | JSON | Catálogo] Referência de fitoterápicos e tratamentos naturais para situações de emergência.
- [`wikipedia.json`](collections/wikipedia.json): [Dados | JSON | Catálogo] Catálogo de pacotes ZIM curados da Wikipedia em múltiplos idiomas para download.

### 📁 [`install/`](install) — Contém 13 arquivos

> Scripts de shell, templates de Docker Compose e recursos de infraestrutura do sistema operacional.  
> Gerencia os processos de instalação, inicialização, parada e atualização de contêineres na máquina.  
> Contém arquivos auxiliares como bibliotecas vazias e pacotes de demonstração offline.  

- [`collect_disk_info.sh`](install/collect_disk_info.sh): [Script Shell | Bash] Script de inspeção de partições de armazenamento e espaço livre em disco.
- [`entrypoint.sh`](install/entrypoint.sh): [Script Shell | Bash] Script de entrada da imagem Docker do Admin que roda migrações e inicia o servidor Node.
- [`install_nomad.sh`](install/install_nomad.sh): [Script Shell | Bash] Instalador unificado que configura Docker, diretórios de dados e sobe o NOMAD no host.
- [`management_compose.yaml`](install/management_compose.yaml): [Configuração | YAML | Docker Compose] Definição de contêineres essenciais (Admin Command Center e sidecars).
- [`migrate-disk-collector.md`](install/migrate-disk-collector.md): [Documentação | Markdown] Instruções detalhadas para execução e validação da migração do coletor de disco.
- [`migrate-disk-collector.sh`](install/migrate-disk-collector.sh): [Script Shell | Bash] Rotina para migrar a coleta de dados de disco do host para o modelo de container sidecar.
- [`run_updater_fixes.sh`](install/run_updater_fixes.sh): [Script Shell | Bash] Procedimentos de ajuste pós-atualização para garantir integridade das permissões.
- [`start_nomad.sh`](install/start_nomad.sh): [Script Shell | Bash] Script utilitário para iniciar todos os contêineres e serviços do ecossistema.
- [`stop_nomad.sh`](install/stop_nomad.sh): [Script Shell | Bash] Script utilitário para parar graciosamente a execução de todos os contêineres.
- [`uninstall_nomad.sh`](install/uninstall_nomad.sh): [Script Shell | Bash] Script de remoção completa de contêineres, redes e dados persistidos do NOMAD.
- [`update_nomad.sh`](install/update_nomad.sh): [Script Shell | Bash] Script de atualização de imagens Docker, execução de migrações e reinicialização.
- [`wikipedia_en_100_mini_2025-06.zim`](install/wikipedia_en_100_mini_2025-06.zim): [Dados Binários | Formato ZIM] Pacote compacto de demonstração offline dos 100 maiores artigos da Wikipedia (versão 2025).
- [`wikipedia_en_100_mini_2026-01.zim`](install/wikipedia_en_100_mini_2026-01.zim): [Dados Binários | Formato ZIM] Pacote compacto de demonstração offline dos 100 maiores artigos da Wikipedia (versão 2026).

### 📁 [`install/calibre-empty-library/`](install/calibre-empty-library) — Contém 2 arquivos

> Estrutura mínima de banco de dados SQLite pré-configurada para o servidor de e-books Calibre-web.  
> Permite que o serviço de biblioteca de livros suba imediatamente sem erros de inicialização.  
> Serve de ponto de partida limpo para o armazenamento de livros digitais adicionados pelo usuário.  

- [`README.md`](install/calibre-empty-library/README.md): [Documentação | Markdown] Explicação sobre o propósito do banco de dados vazio pré-gerado do Calibre.
- [`metadata.db`](install/calibre-empty-library/metadata.db): [Base de Dados | SQLite] Estrutura mínima de banco relacional vazia para o serviço de e-books Calibre-web.

### 📁 [`install/sidecar-disk-collector/`](install/sidecar-disk-collector) — Contém 2 arquivos

> Arquivos de definição e scripts de execução do contêiner auxiliar coletor de métricas de disco.  
> Monitora o armazenamento local do host e comunica a disponibilidade de espaço ao Command Center.  
> Garante que operações pesadas de download não esgotem o disco inesperadamente.  

- [`Dockerfile`](install/sidecar-disk-collector/Dockerfile): [Configuração | Docker] Imagem minimalista do sidecar responsável por coletar dados de disco do host.
- [`collect-disk-info.sh`](install/sidecar-disk-collector/collect-disk-info.sh): [Script Shell | Bash] Loop contínuo que lê estatísticas de disco e disponibiliza métricas em arquivo compartilhado.

### 📁 [`install/sidecar-updater/`](install/sidecar-updater) — Contém 2 arquivos

> Arquivos e scripts dedicados ao contêiner de atualização automática contínua do ecossistema.  
> Executa em contêiner independente para conseguir pausar, atualizar e reiniciar a aplicação principal.  
> Garante alta resiliência e independência durante atualizações de versão de imagem Docker.  

- [`Dockerfile`](install/sidecar-updater/Dockerfile): [Configuração | Docker] Imagem do container independente encarregado de orquestrar a auto-atualização do admin.
- [`update-watcher.sh`](install/sidecar-updater/update-watcher.sh): [Script Shell | Bash] Monitor que executa chamadas Docker para atualizar a imagem principal e reiniciar o serviço.
