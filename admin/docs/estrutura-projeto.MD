> pode me ajudar a entender toda a estrutura de pastas e me dar de uma modo didatico

● Bash(find . -maxdepth 3 -not -path '*/.*' | sort) (ctrl+o to expand)

▸ Thought for 2s, 327 tokens
  The project's structure includes a fullstack application (`admin`) built with a specific framework and libraries. It also has content collections stored as JSON and installation scripts with deployment conf...

● Bash(ls admin/app/controllers admin/app/services) (ctrl+o to expand)

▸ Thought for 5s, 1.9k tokens
  `Projeto-errante` (NOMAD) is a self-contained, offline-first server for knowledge, education, AI, and services. The goal is a clear, didactic explanation of the folder structure. The focus must be on an app...

● Bash(ls admin/app/models admin/app/jobs) (ctrl+o to expand)

▸ Thought for 3s, 863 tokens
  The administrative panel employs a full-stack architecture with AdonisJS 6 backend and an Inertia.js/React frontend. The backend handles HTTP requests, orchestrates business logic (including container manag...
  O Project NOMAD (Projeto Errante) é um servidor de conhecimento e assistência totalmente voltado para uso offline. Ele reúne em um só lugar ferramentas como:

  • IA local e RAG (Ollama + Qdrant para chat e busca semântica em documentos)
  • Bibliotecas offline (Kiwix para Wikipedia, guias médicos e livros)
  • Mapas offline (ProtoMaps)
  • Educação (Kolibri / Khan Academy)
  • Catálogo de aplicativos conteinerizados (Supply Depot gerenciado via Docker)

  Abaixo está o mapa completo da arquitetura e o detalhamento didático de cada pasta.
  ──────
  ### 🗺️ Visão Panorâmica da Estrutura

  ┌────────────────────────────┐
  │                            │
  │ 📁 projeto-errante/ (Raiz) ├───┬───────────────┐
  │                            │   │               │
  └──────────────┬─────────────┘   └───────────────┼────────────────────────────────────┬───────────────────────────────────┐
                 │                                 │                                    │                                   │
                 ▼                                 ▼                                    ▼                                   ▼
  ┌────────────────────────────┐   ┌───────────────────────────────┐   ┌─────────────────────────────────┐   ┌────────────────────────────┐
  │                            │   │                               │   │                                 │   │                            │
  │    Install["📁 install/    │   │                               │   │         📁 collections/         │   │         📁 admin/          │
  │                            │   │           Docker)"]           │   │                                 │ ┌─┤                            ├──────────────────┐
  │    (Scripts do Sistema     │   │                               │   │ (Metadados e Catálogos Offline) │ │ │ (Command Center Fullstack) │                  │
  │                            │   │                               │   │                                 │ │ │                            │                  │
  └────────────────────────────┘   └───────────────────────────────┘   └─────────────────────────────────┘ │ └──────────────┬─────────────┘                  │
                                                                                                           │                │                                │
                 ▼─────────────────────────────────▼────────────────────────────────────▼──────────────────┘                ▼                                ▼
  ┌────────────────────────────┐   ┌───────────────────────────────┐   ┌─────────────────────────────────┐   ┌────────────────────────────┐   ┌────────────────────────────┐
  │                            │   │                               │   │                                 │   │                            │   │                            │
  │          📁 app/           │   │          📁 inertia/          │   │                                 │   │           start/           │   │        📁 database/        │
  │                            │   │                               │   │     AdminConfig["📁 config/     │   │                            │   │                            │
  │    (Backend AdonisJS 6)    │   │ (Frontend React / Inertia.js) │   │                                 │   │ (Rotas e Configurações)"]  │   │ (Migrações e Seeds SQLite) │
  │                            │   │                               │   │                                 │   │                            │   │                            │
  └────────────────────────────┘   └───────────────────────────────┘   └─────────────────────────────────┘   └────────────────────────────┘   └────────────────────────────┘
  ──────
  ### 1. Raiz do Projeto (/)

  Arquivos globais de configuração e documentação:

  • Dockerfile: Receita de construção da imagem Docker do container administrativo (Command Center).
  • package.json: Gerencia dependências do repositório raiz e orquestra a aplicação.
  • README.md e FAQ.md: Documentação detalhada sobre instalação, hardware recomendado e arquitetura.
  • CONTRIBUTING.md e CODE_OF_CONDUCT.md: Regras de colaboração da comunidade.
  ──────
  ### 2. Pasta install — Infraestrutura e Instalação

  Essa pasta contém tudo que diz respeito ao sistema operacional, Docker e ciclo de vida do NOMAD na máquina do usuário:

  • Scripts de Ciclo de Vida do Servidor:
      • install_nomad.sh: Script mestre executado pelo usuário no terminal para instalar o Docker, configurar permissões e inicializar a infraestrutura.
      • start_nomad.sh e stop_nomad.sh: Inicializam e encerram os containers.
      • update_nomad.sh e uninstall_nomad.sh: Atualizam a aplicação ou removem o sistema.
  • Orquestração Docker:
      • management_compose.yaml: O Docker Compose central que sobe o painel web administrativo e seus serviços essenciais.
  • Sidecars (Serviços Auxiliares):
      • sidecar-disk-collector: Container leve que monitora o espaço livre em disco do host para evitar que downloads grandes estourem o armazenamento.
      • sidecar-updater: Container responsável por aplicar atualizações automáticas do sistema em segundo plano de forma segura.

  ──────
  ### 3. Pasta collections — Catálogos de Conteúdo Offline

  Esta pasta guarda os manifestos (arquivos JSON) com informações sobre conteúdos que o sistema pode baixar e disponibilizar sem internet:

  • wikipedia.json: Seleções curadas de arquivos .zim da Wikipedia em vários idiomas e tamanhos (mini, tópicos específicos, completa).
  • maps.json: Catálogo de regiões e cidades do mundo em formato PMTiles para visualização de mapas vetoriais offline.
  • kiwix-categories.json: Catálogo de módulos do Kiwix (Stack Exchange, Gutenberg, enciclopédias).
  • conditions.json, natural_remedies.json e home_remedies.json: Base de dados curada sobre condições médicas de emergência e primeiros socorros para situações onde não há hospitais ou internet.
  • creator-packs.json: Pacotes de conteúdo temáticos montados pela comunidade.
  ──────
  ### 4. Pasta admin — O "Cérebro" (Command Center)

  Esta é a maior parte do código-fonte. Trata-se de uma aplicação fullstack moderna construída com:

  • Backend: AdonisJS 6 https://adonisjs.com/ (Node.js + TypeScript)
  • Frontend: Inertia.js https://inertiajs.com/ com React 19 e Tailwind CSS
  • Banco de dados: SQLite gerenciado via Lucid ORM

  Aqui está como ela é dividida internamente:

  #### 4.1. O Backend (app)

  Segue a arquitetura MVC com padrão de Services e Jobs assíncronos:

  • **controllers**: Ponto de entrada das requisições web.
      • chats_controller.ts: Gerencia o chat com IA e as sessões.
      • rag_controller.ts: Upload e busca semântica em documentos do usuário.
      • supply_depot_controller.ts: Instalação e controle dos apps Docker adicionais.
      • maps_controller.ts: Gerenciamento dos arquivos de mapa.
      • benchmark_controller.ts: Medição de desempenho do hardware local.
  • **services**: Toda a lógica de negócio pesada e integrações com o sistema:
      • docker_service.ts: Comunica-se diretamente com o socket Docker para subir/derrubar containers de apps.
      • ollama_service.ts: Faz a ponte com os modelos locais de IA (Llama 3, Mistral, etc.).
      • rag_service.ts: Comunica-se com o banco vetorial Qdrant para gerar embeddings e responder perguntas com base em arquivos.
      • download_service.ts: Gerenciador resiliente de downloads de gigabytes de dados offline.
  • **jobs**: Filas de tarefas em segundo plano (background workers).
      • embed_file_job.ts: Extrai texto e vetoriza documentos sem travar a navegação do usuário.
      • download_model_job.ts: Faz download assíncrono de modelos de IA grandes para o Ollama.
  • **models**: Tabelas do banco de dados (SQLite):
      • chat_session.ts, chat_message.ts: Histórico de conversas.
      • installed_resource.ts: Registro do que já foi baixado (mapas, zims).
      • service.ts: Status dos containers do Supply Depot.


  #### 4.2. O Frontend (inertia)

  Construído com React integrado via Inertia.js (sem necessidade de criar APIs REST manuais para telas):

  • **pages**: As telas da interface:
      • chat.tsx: Interface de conversa com a IA e envio de anexos RAG.
      • maps.tsx: Visualizador de mapa vetorial offline.
      • supply-depot.tsx: Loja de aplicativos em containers (estilo "app store" offline).
      • home.tsx e about.tsx: Painel inicial e informações gerais.
      • easy-setup: Assistente passo a passo para o primeiro uso.
      • settings: Configurações avançadas (modelos de IA, atualizações, diagnósticos).
  • **components**: Componentes visuais reutilizáveis:
      • Modais de download, barras de progresso de espaço em disco, seletores de países, cartões de pacotes e renderizador de Markdown.


  #### 4.3. Estruturas de Suporte do admin/

  • **start**:
      • routes.ts: Onde todas as rotas e URLs do sistema estão registradas.
      • kernel.ts: Middlewares globais e de rota.
  • **config**: Configurações de banco, sessão, fila (queue), CORS, etc.
  • **database**: Migrações SQL para criação e evolução das tabelas.
  • **commands**: Comandos de terminal node ace (ex: rodar filas, simular auto-updates com dry-run, rodar benchmarks).
  • **types**: Definições de tipagem TypeScript compartilhadas pelo backend e frontend.
  ──────
  ### 💡 Como tudo se conecta na prática (Exemplo do Chat com IA)

  1. Você acessa a tela de chat no navegador → Carregada via chat.tsx.
  2. Você envia uma pergunta ou anexa um PDF → A requisição vai para chats_controller.ts ou rag_controller.ts.
  3. O controller aciona rag_service.ts (que consulta o Qdrant) e ollama_service.ts (que se comunica com o container do Ollama).
  4. O histórico é salvo no SQLite via chat_session.ts e a resposta volta em tempo real para a sua tela.
  ──────
  ### 📌 Resumo Rápido: Onde mexer?

   Se você quiser...                                                                                     | Vá para a pasta
  -------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------
   Criar ou alterar telas visuais                                                                        | pages ou components
   Criar uma nova rota ou endpoint                                                                       | routes.ts e controllers
   Alterar a integração com Docker ou Ollama                                                             | services
   Adicionar novas coleções ou listas de dados offline                                                   | collections
   Modificar a inicialização, Docker Compose ou scripts bash                                             | install

