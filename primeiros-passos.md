# Primeiros Passos com o NOMAD

Este guia vai ajudá-lo a aproveitar ao máximo seu servidor NOMAD.

---

## Requisitos do Sistema

Se você já tem o NOMAD em execução, pode pular esta seção. Ela está aqui para quando você estiver planejando um segundo servidor, migrando para um hardware diferente ou ajudando outra pessoa a se configurar.

### Sistema Operacional

O NOMAD roda em Linux baseado em Debian.

| Nível de suporte | Sistema operacional |
|---|---|
| **Recomendado** | Ubuntu 26.04 LTS |
| **Também suportado** | Ubuntu 24.04 LTS, Debian 12 |
| **Suporte da comunidade** | Windows via WSL2, outros derivados Debian |

Ubuntu 26.04 LTS é a versão na qual testamos e a que recomendamos para novas instalações. Se você já está usando 24.04 LTS ou Debian 12, não há necessidade de reinstalar, ambos ainda são suportados.

Ubuntu Desktop é a escolha mais amigável se você vem do Windows ou macOS. Ubuntu Server funciona igualmente bem se você está confortável com o terminal, e o NOMAD não precisa de ambiente de desktop de qualquer forma, já que tudo é acessado pelo navegador.

macOS e distribuições não-Debian como Fedora ou Arch não possuem suporte oficial.

### Hardware

O NOMAD em si é leve. O que determina seus requisitos é o conteúdo e as ferramentas que você escolhe instalar, e se deseja rodar IA localmente.

**Mínimo, sem IA local:**

- Processador dual-core de 2 GHz
- 4 GB de RAM
- 5 GB de espaço livre em disco, mais espaço para o conteúdo que você baixar

**Recomendado, com IA local:**

- AMD Ryzen 7 ou Intel Core i7 ou superior
- 32 GB de RAM
- NVIDIA RTX 3060 ou equivalente AMD, mais VRAM permite rodar modelos maiores
- 250 GB ou mais de espaço livre em disco, preferencialmente um SSD

Uma conexão estável com a internet é necessária apenas durante a instalação. Depois disso, o NOMAD foi projetado para funcionar totalmente offline.

### Uma nota sobre drivers de GPU

O instalador configura o Docker e o NVIDIA Container Toolkit para você, mas **não** instala o driver de GPU em si. Você precisa tê-lo no hospedeiro previamente.

No Ubuntu, a maneira mais fácil é marcar **"Instalar drivers de terceiros para gráficos e hardware Wi-Fi"** durante a instalação. Se você pulou essa etapa, ou adicionou a GPU depois, instale o driver primeiro e então use **Forçar Reinstalação** no Assistente de IA no [Depósito de Recursos](/supply-depot) para detectá-lo.

Sem uma GPU, o Assistente de IA ainda funciona. Ele apenas roda na CPU, o que é consideravelmente mais lento.

---

## Assistente de Configuração Fácil

Se esta é sua primeira vez usando o NOMAD, o assistente de Configuração Fácil vai ajudá-lo a configurar tudo.

**[Iniciar Configuração Fácil →](/easy-setup)**

![Assistente de Configuração Fácil — Passo 1: Escolha suas capacidades](/docs/easy-setup-step1.webp)

O assistente guia você por quatro passos simples:
1. **Capacidades** — Escolha o que habilitar: Biblioteca de Informações, Assistente de IA, Plataforma Educacional, Mapas, Ferramentas de Dados e Notas
2. **Mapas** — Selecione regiões geográficas para mapas offline
3. **Conteúdo** — Escolha coleções curadas de conteúdo nos níveis Essencial, Padrão ou Completo

![Níveis de conteúdo — Essencial, Padrão e Completo](/docs/easy-setup-tiers.webp)
4. **Revisão** — Confirme suas seleções e inicie os downloads

Dependendo do que você selecionou, os downloads podem demorar. Você pode acompanhar o progresso na área de Configurações, continuar usando recursos já instalados ou deixar o servidor ligado durante a noite para downloads grandes.

---

## Conhecendo Suas Ferramentas

### Biblioteca de Informações — Conhecimento Offline (Kiwix)

A Biblioteca de Informações armazena versões compactadas de sites e referências que funcionam sem internet.

**O que está incluído:**
- Wikipédia completa (milhões de artigos)
- Referências médicas e guias de primeiros socorros
- Guias práticos e informações de sobrevivência
- Livros clássicos do Projeto Gutenberg

**Como usar:**
1. Clique em **Biblioteca de Informações** na tela inicial do Centro de Comando ou no [Depósito de Recursos](/supply-depot)
2. Escolha uma coleção (como a Wikipédia)
3. Pesquise ou navegue como no site normal

---

### Plataforma Educacional — Cursos Offline (Kolibri)

A Plataforma Educacional oferece cursos educacionais completos que funcionam offline.

**O que está incluído:**
- Cursos em vídeo da Khan Academy
- Matemática, ciências, leitura e mais
- Acompanhamento de progresso para alunos
- Funciona para todas as idades

**Como usar:**
1. Clique em **Plataforma Educacional** na tela inicial do Centro de Comando ou no [Depósito de Recursos](/supply-depot)
2. Entre ou crie uma conta de aluno
3. Navegue pelos cursos e comece a aprender

**Dica:** O Kolibri suporta múltiplos usuários. Crie contas para cada membro da família para acompanhar o progresso individual.

---

### Assistente de IA — Chat Integrado

![Interface do Chat de IA](/docs/ai-chat.webp)

O NOMAD inclui uma interface de chat de IA integrada, alimentada pelo Ollama. Ela roda inteiramente no seu servidor — sem necessidade de internet, sem dados enviados para lugar nenhum.

**O que ela pode fazer:**
- Responder perguntas sobre qualquer assunto
- Explicar conceitos complexos de forma simples
- Ajudar com redação e edição
- Referenciar seus documentos enviados via Base de Conhecimento
- Gerar ideias e auxiliar na resolução de problemas

**Como usar:**
1. Clique em **Chat de IA** no Centro de Comando ou vá em [Chat](/chat)
2. Digite sua pergunta ou solicitação
3. A IA responde em estilo conversacional

**Dica:** Seja específico nas suas perguntas. Em vez de "me fale sobre plantas", tente "quais vegetais crescem bem na sombra?"

**Nota:** O Assistente de IA precisa ser instalado primeiro. Ative-o durante a Configuração Fácil ou instale-o pelo [Depósito de Recursos](/supply-depot).

**Aceleração por GPU:** Se seu servidor tem uma GPU NVIDIA, o instalador do NOMAD configura o suporte a GPU para você (ele instala o [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) e configura o Docker automaticamente). Você só precisa ter o driver NVIDIA presente no hospedeiro, que no Ubuntu você obtém habilitando "Instalar drivers de terceiros" durante a instalação. Com uma GPU, as respostas da IA são dramaticamente mais rápidas (melhoria de 10-20x). Se você adicionar uma GPU depois, vá ao [Depósito de Recursos](/supply-depot) e use **Forçar Reinstalação** no Assistente de IA para habilitá-lo.

---

### Base de Conhecimento — IA com Reconhecimento de Documentos

![Interface de envio da Base de Conhecimento](/docs/knowledge-base.webp)

A Base de Conhecimento permite que você envie documentos para que a IA possa referenciá-los ao responder suas perguntas. Ela utiliza busca semântica (RAG via Qdrant) para encontrar informações relevantes nos seus arquivos enviados.

**Tipos de arquivo suportados:**
- PDFs, arquivos de texto e outros formatos de documento
- A documentação do NOMAD é carregada automaticamente quando o Assistente de IA é instalado

**Como usar:**
1. Vá em **[Base de Conhecimento →](/knowledge-base)**
2. Envie seus documentos (PDFs, arquivos de texto, etc.)
3. Os documentos são processados e indexados automaticamente
4. Faça perguntas no Chat de IA — a IA referenciará seus documentos enviados quando relevante
5. Remova documentos que não precisa mais — eles serão excluídos do índice e do armazenamento local

**Casos de uso:**
- Envie planos de emergência para consulta rápida durante uma crise
- Carregue manuais técnicos e POPs para locais de trabalho offline
- Adicione guias curriculares para ensino domiciliar
- Armazene artigos de pesquisa para trabalho acadêmico

---

### Mapas — Navegação Offline

![Visualizador de mapas offline](/docs/maps.webp)

Visualize mapas sem internet. Baixe as regiões necessárias antes de ficar offline.

**Como usar:**
1. Clique em **Mapas** no Centro de Comando
2. Navegue arrastando e ampliando
3. Pesquise locais usando a barra de busca

**Para adicionar mais regiões de mapa:**
1. Vá em **Configurações → Gerenciador de Mapas**
2. Selecione as regiões necessárias
3. Clique em Baixar

**Dica:** Baixe mapas das áreas que você frequenta, além de regiões vizinhas por precaução.

**[Abrir Mapas →](/maps)**

---

## Gerenciando Seu Servidor

### Adicionando Mais Conteúdo

Conforme suas necessidades mudam, você pode adicionar mais conteúdo a qualquer momento:

- **Mais aplicativos:** Configurações → Depósito de Recursos
- **Mais referências:** Configurações → Explorador de Conteúdo ou Gerenciador de Conteúdo
- **Mais regiões de mapa:** Configurações → Gerenciador de Mapas
- **Mais conteúdo educacional:** Pelo navegador de conteúdo integrado do Kolibri

### Seletor de Wikipédia

![Explorador de Conteúdo — navegue e baixe pacotes de Wikipédia e coleções curadas](/docs/content-explorer.webp)

O NOMAD inclui uma ferramenta dedicada de gerenciamento de conteúdo da Wikipédia para navegar e baixar pacotes da Wikipédia.

**Como usar:**
1. Vá em **[Explorador de Conteúdo →](/settings/zim/remote-explorer)**
2. Navegue pelos pacotes de Wikipédia disponíveis por idioma e tamanho
3. Selecione e baixe os pacotes desejados

**Nota:** Selecionar um pacote de Wikipédia diferente substitui a versão baixada anteriormente. Apenas uma seleção de Wikipédia fica ativa por vez.

### Benchmark do Sistema

![Benchmark do Sistema com Pontuação NOMAD e Builder Tag](/docs/benchmark.webp)

Teste o desempenho do seu hardware e veja como sua montagem NOMAD se compara com a comunidade.

**Como usar:**
1. Vá em **[Benchmark do Sistema →](/settings/benchmark)**
2. Escolha um tipo de benchmark: Completo, Apenas Sistema ou Apenas IA
3. Veja sua Pontuação NOMAD (uma composição ponderada de desempenho de CPU, memória, disco e IA)
4. Crie uma Builder Tag (sua identidade temática NOMAD, como "Tactical-Llama-1234")
5. Compartilhe seus resultados no [ranking da comunidade](https://benchmark.projectnomad.us)

**Nota:** Apenas Benchmarks Completos com dados de IA podem ser compartilhados no ranking da comunidade.

### Mantendo Tudo Atualizado

Enquanto você tiver internet, verifique atualizações periodicamente:

1. Vá em **Configurações → Verificar Atualizações**
2. Se houver atualizações disponíveis, clique para instalar
3. Aguarde a conclusão da atualização (seu servidor será reiniciado)

As atualizações de conteúdo (Wikipédia, mapas, etc.) podem ser gerenciadas separadamente das atualizações de software.

**Atualizações automáticas:** O NOMAD também pode se manter atualizado sem que você precise verificar. Software, aplicativos instalados e conteúdo podem ser configurados para atualizar automaticamente de forma opcional, com verificações de segurança e uma janela de horário que você controla. Consulte o **[guia de Atualizações](/docs/updates)** para o panorama completo.

**Canal de Acesso Antecipado:** Quer os recursos mais recentes antes de chegarem à versão estável? Habilite o Canal de Acesso Antecipado na página Verificar Atualizações para receber versões candidatas a lançamento. Você pode voltar ao canal estável a qualquer momento.

### Monitorando a Saúde do Sistema

Verifique seu servidor a qualquer momento:

1. Vá em **Configurações → Sistema**
2. Veja o uso de CPU, memória e armazenamento
3. Verifique o tempo de atividade e o status do sistema

---

## Dicas para Melhores Resultados

### Antes de Ficar Offline

- **Atualize tudo** — Execute atualizações de software e conteúdo
- **Baixe o que você precisa** — Mapas, referências, conteúdo educacional
- **Teste tudo** — Certifique-se de que os recursos funcionam enquanto você ainda tem internet para solucionar problemas

### Gerenciamento de Armazenamento

Seu servidor tem armazenamento limitado. Priorize:
- Conteúdo que você realmente vai usar
- Referências críticas (médicas, sobrevivência)
- Mapas da sua região
- Conteúdo educacional adequado às suas necessidades

Verifique o uso de armazenamento em **Configurações → Sistema**.

### Obtendo Ajuda

- **Documentação do app:** Você está lendo agora
- **Assistente de IA:** Faça uma pergunta no [Chat de IA](/chat)
- **Notas de versão:** Veja as novidades de cada versão

---

## Próximos Passos

Você está pronto para usar o NOMAD! Aqui estão algumas coisas para experimentar:

1. **Pesquise algo** — Busque um tópico na Biblioteca de Informações
2. **Aprenda algo** — Comece um curso da Khan Academy na Plataforma Educacional
3. **Faça uma pergunta** — Converse com a IA no [Chat de IA](/chat)
4. **Explore mapas** — Encontre seu bairro no visualizador de Mapas
5. **Envie um documento** — Adicione um PDF à [Base de Conhecimento](/knowledge-base) e pergunte à IA sobre ele

Aproveite seu servidor de conhecimento offline!
