# Primeiros Passos com o NOMAD

Este guia ajudará você a aproveitar ao máximo seu servidor NOMAD.

---

## Requisitos do Sistema

Se você já tem o NOMAD funcionando, pode pular esta seção. Ela é destinada a quem está planejando um segundo servidor, migrando para um hardware diferente ou ajudando outra pessoa a configurar o sistema.

### Sistema Operacional

O NOMAD funciona em Linux baseado em Debian.

| Nível de suporte              | Sistema operacional                          |
| ----------------------------- | -------------------------------------------- |
| **Recomendado**               | Ubuntu 26.04 LTS                             |
| **Também compatível**         | Ubuntu 24.04 LTS, Debian 12                  |
| **Com suporte da comunidade** | Windows via WSL2, outros derivados do Debian |

O Ubuntu 26.04 LTS é a versão que testamos e recomendamos para novas instalações. Se você já estiver usando o Ubuntu 24.04 LTS ou o Debian 12, não é necessário reinstalar, pois ambos continuam sendo compatíveis.

O Ubuntu Desktop é uma opção mais amigável se você estiver migrando do Windows ou macOS. O Ubuntu Server funciona igualmente bem se você estiver confortável usando o terminal, e o NOMAD não precisa de um ambiente de desktop, pois tudo é acessado por meio de um navegador.

macOS e distribuições que não são baseadas em Debian, como Fedora ou Arch, não são oficialmente compatíveis.

### Hardware

O próprio NOMAD é leve. O que determina os requisitos é o conteúdo e as ferramentas que você escolher instalar, além de decidir se deseja executar a IA localmente.

**Mínimo, sem IA local:**

* Processador dual-core de 2 GHz
* 4 GB de RAM
* 5 GB de espaço livre em disco, além do espaço necessário para o conteúdo que você baixar

**Recomendado, com IA local:**

* AMD Ryzen 7 ou Intel Core i7 ou superior
* 32 GB de RAM
* NVIDIA RTX 3060 ou equivalente da AMD; mais VRAM permite executar modelos maiores
* 250 GB ou mais de espaço livre em disco, preferencialmente um SSD

É necessária uma conexão estável com a internet apenas durante a instalação. Depois disso, o NOMAD foi desenvolvido para funcionar completamente offline.

### Uma observação sobre os drivers da GPU

O instalador configura o Docker e o NVIDIA Container Toolkit para você, mas **não instala o driver da GPU**. Você precisa ter o driver instalado no host anteriormente.

No Ubuntu, a maneira mais fácil é marcar **"Instalar drivers de terceiros para hardware gráfico e Wi-Fi"** durante a configuração. Se você pulou essa etapa ou adicionou a GPU posteriormente, instale primeiro o driver e depois use **Forçar reinstalação** no Assistente de IA no [Depósito de Suprimentos](/supply-depot) para que ele seja reconhecido.

Sem uma GPU, o Assistente de IA ainda funciona. Ele simplesmente será executado na CPU, o que é consideravelmente mais lento.

---

## Assistente de Configuração Fácil

Se esta for a primeira vez que você utiliza o NOMAD, o assistente de Configuração Fácil ajudará a configurar tudo.

**[Iniciar Configuração Fácil →](/easy-setup)**

![Assistente de Configuração Fácil — Etapa 1: Escolha seus recursos](/docs/easy-setup-step1.webp)

O assistente orienta você por quatro etapas simples:

1. **Recursos** — Escolha o que deseja ativar: Biblioteca de Informações, Assistente de IA, Plataforma Educacional, Mapas, Ferramentas de Dados e Notas
2. **Mapas** — Selecione as regiões geográficas para os mapas offline
3. **Conteúdo** — Escolha coleções de conteúdo selecionadas nos níveis Essencial, Padrão ou Completo

![Níveis de conteúdo — Essencial, Padrão e Completo](/docs/easy-setup-tiers.webp)

4. **Revisão** — Confirme suas escolhas e comece os downloads

Dependendo do que você selecionou, os downloads podem levar algum tempo. Você pode acompanhar o progresso na área de Configurações, continuar usando os recursos que já estão instalados ou deixar o servidor ligado durante a noite para downloads grandes.

---

## Conhecendo suas Ferramentas

### Biblioteca de Informações — Conhecimento Offline (Kiwix)

A Biblioteca de Informações armazena versões compactadas de sites e referências que funcionam sem internet.

**O que está incluído:**

* Wikipédia completa (milhões de artigos)
* Referências médicas e guias de primeiros socorros
* Guias de instruções e informações sobre sobrevivência
* Livros clássicos do Project Gutenberg

**Como usar:**

1. Clique em **Biblioteca de Informações** na tela inicial do Centro de Comando ou no [Depósito de Suprimentos](/supply-depot)
2. Escolha uma coleção (como a Wikipédia)
3. Pesquise ou navegue como faria no site normal

---

### Plataforma Educacional — Cursos Offline (Kolibri)

A Plataforma Educacional oferece cursos educacionais completos que funcionam offline.

**O que está incluído:**

* Cursos em vídeo da Khan Academy
* Matemática, ciências, leitura e muito mais
* Acompanhamento do progresso dos alunos
* Funciona para todas as idades

**Como usar:**

1. Clique em **Plataforma Educacional** na tela inicial do Centro de Comando ou no [Depósito de Suprimentos](/supply-depot)
2. Entre ou crie uma conta de aluno
3. Navegue pelos cursos e comece a estudar

**Dica:** O Kolibri permite vários usuários. Crie uma conta para cada membro da família para acompanhar o progresso individual.

---

### Assistente de IA — Chat Integrado

![Interface do Chat de IA](/docs/ai-chat.webp)

O NOMAD inclui uma interface de chat de IA integrada, desenvolvida com o Ollama. Ela funciona completamente no seu servidor — sem necessidade de internet e sem enviar dados para nenhum lugar.

**O que ele pode fazer:**

* Responder perguntas sobre qualquer assunto
* Explicar conceitos complexos de maneira simples
* Ajudar com escrita e edição
* Consultar seus documentos enviados por meio da Base de Conhecimento
* Gerar ideias e ajudar na resolução de problemas

**Como usar:**

1. Clique em **Chat de IA** no Centro de Comando ou acesse [Chat](/chat)
2. Digite sua pergunta ou solicitação
3. A IA responderá em formato de conversa

**Dica:** Seja específico nas suas perguntas. Em vez de "fale sobre plantas", tente "quais vegetais crescem bem na sombra?"

**Observação:** O Assistente de IA precisa ser instalado primeiro. Ative-o durante a Configuração Fácil ou instale-o pelo [Depósito de Suprimentos](/supply-depot).

**Aceleração por GPU:** Se o seu servidor tiver uma GPU NVIDIA, o instalador do NOMAD configura o suporte à GPU para você (ele instala o [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) e configura o Docker automaticamente). Você só precisa ter o driver NVIDIA instalado no host, que no Ubuntu pode ser obtido ativando a opção "Instalar drivers de terceiros" durante a configuração. Com uma GPU, as respostas da IA ficam significativamente mais rápidas (melhoria de 10 a 20 vezes). Se você adicionar uma GPU posteriormente, acesse o [Depósito de Suprimentos](/supply-depot) e use **Forçar reinstalação** no Assistente de IA para ativá-la.

---

### Base de Conhecimento — IA com Consciência dos Documentos

![Interface de envio da Base de Conhecimento](/docs/knowledge-base.webp)

A Base de Conhecimento permite enviar documentos para que a IA possa consultá-los ao responder às suas perguntas. Ela utiliza pesquisa semântica (RAG via Qdrant) para encontrar informações relevantes nos arquivos enviados.

**Tipos de arquivos compatíveis:**

* PDFs, arquivos de texto e outros formatos de documentos
* A documentação do NOMAD é carregada automaticamente quando o Assistente de IA é instalado

**Como usar:**

1. Acesse **[Base de Conhecimento →](/knowledge-base)**
2. Envie seus documentos (PDFs, arquivos de texto etc.)
3. Os documentos são processados e indexados automaticamente
4. Faça perguntas no Chat de IA — a IA consultará seus documentos quando forem relevantes
5. Remova os documentos que não precisar mais — eles serão excluídos do índice e do armazenamento local

**Casos de uso:**

* Enviar planos de emergência para consulta rápida durante uma crise
* Carregar manuais técnicos e procedimentos operacionais padrão para locais de trabalho offline
* Adicionar guias curriculares para educação domiciliar
* Armazenar artigos de pesquisa para trabalhos acadêmicos

---

### Mapas — Navegação Offline

![Visualizador de mapas offline](/docs/maps.webp)

Visualize mapas sem internet. Baixe as regiões necessárias antes de ficar offline.

**Como usar:**

1. Clique em **Mapas** no Centro de Comando
2. Navegue arrastando e usando o zoom
3. Pesquise locais utilizando a barra de pesquisa

**Para adicionar mais regiões de mapas:**

1. Vá para **Configurações → Gerenciador de Mapas**
2. Selecione as regiões necessárias
3. Clique em Baixar

**Dica:** Baixe mapas das áreas para as quais você viaja com frequência, além das regiões vizinhas, por precaução.

**[Abrir Mapas →](/maps)**

---

## Gerenciando seu Servidor

### Adicionando Mais Conteúdo

À medida que suas necessidades mudarem, você poderá adicionar mais conteúdo a qualquer momento:

* **Mais aplicativos:** Configurações → Depósito de Suprimentos
* **Mais referências:** Configurações → Explorador de Conteúdo ou Gerenciador de Conteúdo
* **Mais regiões de mapas:** Configurações → Gerenciador de Mapas
* **Mais conteúdo educacional:** Pelo navegador de conteúdo integrado do Kolibri

### Seletor da Wikipédia

![Explorador de Conteúdo — navegue e baixe pacotes da Wikipédia e coleções selecionadas](/docs/content-explorer.webp)

O NOMAD inclui uma ferramenta específica de gerenciamento de conteúdo da Wikipédia para navegar e baixar pacotes da Wikipédia.

**Como usar:**

1. Acesse **[Explorador de Conteúdo →](/settings/zim/remote-explorer)**
2. Navegue pelos pacotes da Wikipédia disponíveis por idioma e tamanho
3. Selecione e baixe os pacotes desejados

**Observação:** Selecionar um pacote diferente da Wikipédia substitui a versão baixada anteriormente. Apenas uma seleção da Wikipédia fica ativa por vez.

### Benchmark do Sistema

![Benchmark do Sistema com Pontuação NOMAD e Tag de Construtor](/docs/benchmark.webp)

Teste o desempenho do seu hardware e veja como sua configuração do NOMAD se compara à comunidade.

**Como usar:**

1. Acesse **[Benchmark do Sistema →](/settings/benchmark)**
2. Escolha um tipo de benchmark: Completo, Apenas Sistema ou Apenas IA
3. Veja sua Pontuação NOMAD (uma pontuação composta e ponderada do desempenho da CPU, memória, disco e IA)
4. Crie uma Tag de Construtor (sua identidade com tema do NOMAD, como "Tactical-Llama-1234")
5. Compartilhe seus resultados no [ranking da comunidade](https://benchmark.projectnomad.us)

**Observação:** Apenas Benchmarks Completos com dados de IA podem ser compartilhados no ranking da comunidade.

### Mantendo tudo atualizado

Enquanto você tiver internet, verifique periodicamente se há atualizações:

1. Vá para **Configurações → Verificar atualizações**
2. Se houver atualizações disponíveis, clique para instalá-las
3. Aguarde a conclusão da atualização (seu servidor será reiniciado)

As atualizações de conteúdo (Wikipédia, mapas etc.) podem ser gerenciadas separadamente das atualizações de software.

**Atualizações automáticas:** O NOMAD também pode se manter atualizado sem que você precise verificar manualmente. O software, os aplicativos instalados e o conteúdo podem ser configurados individualmente para atualização automática, de forma opcional, com verificações de segurança e um período definido por você. Consulte o **[Guia de Atualizações](/docs/updates)** para obter todas as informações.

**Canal de Acesso Antecipado:** Quer ter acesso aos recursos mais recentes antes que cheguem à versão estável? Ative o Canal de Acesso Antecipado na página Verificar atualizações para receber versões candidatas (*release candidates*). Você pode voltar ao canal estável a qualquer momento.

### Monitorando a Saúde do Sistema

Verifique seu servidor a qualquer momento:

1. Vá para **Configurações → Sistema**
2. Visualize o uso da CPU, memória e armazenamento
3. Verifique o tempo de atividade e o status do sistema

---

## Dicas para obter os melhores resultados

### Antes de ficar offline

* **Atualize tudo** — Execute as atualizações de software e conteúdo
* **Baixe o que precisa** — Mapas, referências e conteúdo educacional
* **Teste tudo** — Certifique-se de que os recursos funcionam enquanto você ainda possui internet para solucionar possíveis problemas

### Gerenciamento de Armazenamento

Seu servidor possui espaço de armazenamento limitado. Dê prioridade a:

* Conteúdo que você realmente utilizará
* Referências importantes (medicina, sobrevivência)
* Mapas da sua região
* Conteúdo educacional adequado às suas necessidades

Verifique o uso do armazenamento em **Configurações → Sistema**.

### Obtendo Ajuda

* **Documentação no aplicativo:** você está lendo-a agora
* **Assistente de IA:** faça uma pergunta no [Chat de IA](/chat)
* **Notas de lançamento:** veja as novidades de cada versão

---

## Próximos Passos

Você está pronto para usar o NOMAD. Aqui estão algumas coisas que você pode experimentar:

1. **Pesquise alguma coisa** — Procure um assunto na Biblioteca de Informações
2. **Aprenda algo novo** — Comece um curso da Khan Academy na Plataforma Educacional
3. **Faça uma pergunta** — Converse com a IA no [Chat de IA](/chat)
4. **Explore os mapas** — Encontre seu bairro no visualizador de Mapas
5. **Envie um documento** — Adicione um PDF à [Base de Conhecimento](/knowledge-base) e faça perguntas à IA sobre ele

Aproveite seu servidor de conhecimento offline!
