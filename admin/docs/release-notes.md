# Notas de Lançamento

## Versão 1.34.0 - 4 de agosto de 2026

### Recursos

* **IA**: `nomad.md` para instruções personalizadas (#1127). Obrigado @jakeaturner pela contribuição!
* **IA**: alternância de raciocínio por modelo com padrão global (desativado) (#1079). Obrigado @chriscrosstalk pela contribuição!
* **Documentação da API**: geração automática da documentação OpenAPI com Scalar UI (#1128). Obrigado @jakeaturner pela contribuição!
* **Benchmark**: sysbench oficial para múltiplas arquiteturas, digest resolvido e metadados da plataforma (#1158). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: fixar a referência de IA do Score v2 em 13.2 (valor medido, anteriormente era um placeholder) (#1097). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: banner no painel solicitando uma nova execução do Score v2 (#1096). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: cliente do aplicativo Score v2 — dados brutos, pontuação sem limite, payload v2 + interface. Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: fortalecimento do sistema de testes — falhar de forma explícita + fixar versão do sysbench + registrar procedência (#1089). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: exibição da pontuação ao final da execução + sobreposição de utilização da GPU NVIDIA (#1087). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: números oficiais do sysbench durante o teste + faixa de resultados (#1085). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: telemetria em tempo real durante as execuções do benchmark (#1082) (#1084). Obrigado @chriscrosstalk pela contribuição!
* **Coleções**: suporte a downloads protegidos para conteúdo selecionado hospedado pelo próprio usuário (#1172). Obrigado @chriscrosstalk pela contribuição!
* **Pacotes de Criadores**: pacotes de vídeos individuais por criador, protegidos e disponíveis offline via Kiwix (#1106). Obrigado @chriscrosstalk pela contribuição!
* **Painel**: adicionar banner dispensável de "Novidades" para a v1.34 (#1112). Obrigado @chriscrosstalk pela contribuição!
* **Painel**: completar os destaques de "Novidades" da v1.34 (#1197). Obrigado @chriscrosstalk pela contribuição!
* **Informações de Depuração**: adicionar diagnósticos de armazenamento, Docker, saúde da GPU e atualização automática (#1102). Obrigado @chriscrosstalk pela contribuição!
* **Referência de Medicamentos**: adicionar referência offline de medicamentos da FDA (rótulos, visualização de interações, condições e tratamentos) (#1040). Obrigado @caweis pela contribuição!
* **Biblioteca Kiwix**: adicionar linhas expansíveis ao navegador da Biblioteca Kiwix (#1060). Obrigado @jarvisxyz pela contribuição!
* **Mapas**: adicionar campo de observações ao pop-up de posicionamento de marcadores no mapa (#926). Obrigado @chriscrosstalk pela contribuição!
* **RAG**: adicionar organização por assunto/coleção à base de conhecimento (#1063). Obrigado @just-jbc pela contribuição!

### Correções de Bugs

* **IA**: transmitir o raciocínio a partir do campo `/v1 reasoning` + interromper quando o cliente se desconectar (#1078). Obrigado @chriscrosstalk pela contribuição!
* **IA**: deixar de forçar `HSA_OVERRIDE=11.0.0` em iGPUs AMD com suporte nativo (#1076). Obrigado @chriscrosstalk pela contribuição!
* **IA**: definir `OLLAMA_IGPU_ENABLE` durante o provisionamento da AMD para que as iGPUs sejam utilizadas (#1074). Obrigado @chriscrosstalk pela contribuição!
* **IA**: forçar `gfx1103` (780M) para `HSA_OVERRIDE 11.0.0` para mantê-la na GPU (#1134). Obrigado @jakeaturner pela contribuição!
* **Benchmark**: corrigir vários erros de TypeScript. Obrigado @jakeaturner pela contribuição!
* **Benchmark**: execuções parciais não são o NOMAD Score (renomear + renormalizar) (#1088). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: remover atualizador de progresso obsoleto (#1136). Obrigado @NgoQuocViet2001 pela contribuição!
* **Benchmark**: exibir um motivo claro quando o envio para o ranking falhar (#1138). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: aquecer o modelo de IA antes das execuções cronometradas para obter pontuações reproduzíveis (#1140). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: bloquear o envio para o ranking quando a IA estiver sendo executada em um host remoto (#1157). Obrigado @chriscrosstalk pela contribuição!
* **Benchmark**: não bloquear o envio quando o host da IA for esta própria máquina (#1166). Obrigado @chriscrosstalk pela contribuição!
* **Chat**: tornar o layout das conversas responsivo (#1090). Obrigado @Bortlesboat pela contribuição!
* **Chat**: abrir o chat completo no mesmo local em vez de uma nova janela (#1181). Obrigado @chriscrosstalk pela contribuição!
* **Conteúdo**: resolver a URL atual do ZIM antes do download (#1091). Obrigado @NgoQuocViet2001 pela contribuição!
* **Conteúdo**: atualizar os ZIMs instalados quando um download for concluído para remover entradas fantasmas (#1099). Obrigado @chriscrosstalk pela contribuição!
* **Pacotes de Criadores**: adicionar o recurso de banner ausente do Modern Rogue (#1147). Obrigado @chriscrosstalk pela contribuição!
* **Downloads**: enviar um User-Agent descritivo para que os mirrors da Wikimedia não retornem erro 403 (#1114). Obrigado @chriscrosstalk pela contribuição!
* **Downloads**: adicionar botão de tentar novamente e link para baixar o recurso em downloads com falha (#1059). Obrigado @jarvisxyz pela contribuição!
* **Downloads**: não retornar erro 500 no endpoint de tarefas devido a uma tarefa órfã do BullMQ (#1191). Obrigado @chriscrosstalk pela contribuição!
* **Downloads**: não tentar novamente uma autorização rejeitada durante quatro horas (#1205). Obrigado @chriscrosstalk pela contribuição!
* **Downloads**: permitir que downloads de conteúdo interrompidos sejam retomados (#1202). Obrigado @chriscrosstalk pela contribuição!
* **Configuração Fácil**: simplificar o assistente + recomendações de modelos mais robustas (#1110). Obrigado @chriscrosstalk pela contribuição!
* **Instalação**: definir `header_red` e cores ausentes nos scripts de desinstalação/atualização (#1098). Obrigado @chriscrosstalk pela contribuição!
* **KB**: impedir que o menu suspenso de coleções seja cortado e aumentar a largura do modal (#1198). Obrigado @chriscrosstalk pela contribuição!
* **KB**: manter a coleção quando um arquivo for indexado após sua atribuição (#1200). Obrigado @chriscrosstalk pela contribuição!
* **KVStore**: corrigir a chave `apps.homebox` ausente. Obrigado @jakeaturner pela contribuição!
* **Mapas**: avisar quando o mapa-base mundial estiver ausente em vez de exibir silenciosamente um mapa cinza (#1104). Obrigado @not-knope pela contribuição!
* **RAG**: adicionar extração adequada de texto `.docx` usando mammoth (#1100). Obrigado @just-jbc pela contribuição!
* **RAG**: parar de recriar índices de payload para cada documento incorporado (#1135). Obrigado @bragaus pela contribuição!
* **Conteúdo**: respeitar a política de ingestão quando um ZIM for enviado localmente (#1184). Obrigado @chriscrosstalk pela contribuição!
* **Supply Depot**: gerar o pepper da chave da API do Homebox para impedir que ele entre em um ciclo contínuo de falhas (#1077). Obrigado @chriscrosstalk pela contribuição!
* **UI**: adicionar link para a referência da API na barra lateral de Configurações. Obrigado @jakeaturner pela contribuição!
* **Atualizador**: remover imagens substituídas após a atualização para recuperar espaço em disco (#1101). Obrigado @chriscrosstalk pela contribuição!

### Melhorias

* **Marca**: adicionar ™ ao nome Project NOMAD nas áreas de maior destaque. Obrigado @chriscrosstalk pela contribuição!
* **Marca**: padronizar o nome da marca como Project NOMAD e aposentar o acrônimo retroativo. Obrigado @chriscrosstalk pela contribuição!
* **Build**: executar a etapa de geração de código da referência de medicamentos (#1132). Obrigado @jakeaturner pela contribuição!
* **Supply Depot**: remover o cartão órfão do Meshtastic Daemon (#1049). Obrigado @chriscrosstalk pela contribuição!
* **Catálogo**: adicionar o pacote do criador The Modern Rogue (dev) (#1146). Obrigado @chriscrosstalk pela contribuição!
* **CI**: corrigir a validação de URLs das coleções. Obrigado @jakeaturner pela contribuição!
* **Coleções**: atualizar URLs desatualizadas (#1148). Obrigado @jakeaturner pela contribuição!
* **Coleções**: corrigir quatro URLs de download do Wikipedia que estavam indisponíveis (#1189). Obrigado @chriscrosstalk pela contribuição!
* **Gerenciador de Conteúdo**: filtrar seções que não são de conteúdo + renderizar tabelas na extração de ZIM (#1044). Obrigado @chriscrosstalk pela contribuição!
* **Dependências**: atualizar tar, vite e dockerode no admin. Obrigado @jakeaturner pela contribuição!
* **Dependências**: atualizar axios e systeminformation no admin. Obrigado @jakeaturner pela contribuição!
* **Documentação**: tornar as orientações sobre realocação de armazenamento precisas e consistentes (#1103). Obrigado @chriscrosstalk pela contribuição!
* **Documentação**: adicionar seção de Consistência da UI (#1080). Obrigado @chriscrosstalk pela contribuição!
* **Documentação**: recomendar Ubuntu 26.04 LTS como base padrão (#1141). Obrigado @chriscrosstalk pela contribuição!
* **Documentação**: direcionar o MeshCore Web para o site oficial meshcore.io (#1142). Obrigado @chriscrosstalk pela contribuição!
* **Referência de Medicamentos**: tornar o JSON de coleções a única fonte para os dados selecionados (#1130). Obrigado @caweis pela contribuição!
* **Referência de Medicamentos**: reformulação com abas, pesquisa agrupada, seleção múltipla de situações e tela de confirmação de aviso (#1137). Obrigado @chriscrosstalk pela contribuição!
Claro. Continuando exatamente de onde parei:

## Versão 1.33.0 - 23 de junho de 2026

### Melhorias

* **Licença e Documentação**: corrigidos os metadados da licença do pacote para `Apache-2.0` (o projeto já utilizava Apache-2.0 há algum tempo), adicionada uma descrição real do projeto e corrigido um link quebrado de Solução de Problemas, além de vários erros de digitação no README. Obrigado @aqilaziz pela contribuição!
* **Documentação**: corrigidos alguns erros de digitação e pontuação no README. Obrigado @teccdev pela contribuição!
* **Dependências**: atualizados React e React DOM. Obrigado @jakeaturner pela contribuição!
* **Dependências**: atualizado autoprefixer. Obrigado @jakeaturner pela contribuição!
* **Dependências**: atualizado BullMQ para 5.77.6 e ajustadas as chamadas de tarefas afetadas para o novo formato de argumentos. Obrigado @jakeaturner pela contribuição!
* **Supply Depot**: fixadas todas as versões das imagens selecionadas para garantir implantações consistentes. Obrigado @jakeaturner pela contribuição!
* **Supply Depot**: atualizadas as versões padrão do CyberChef para 10.24.0 e do Ollama para 0.24.0. Obrigado @jakeaturner pela contribuição!
* **Privacidade**: adicionada a variável de ambiente apropriada para desativar a telemetria do container Qdrant. Isso só terá efeito em novas instalações ou se o container Qdrant for reinstalado à força em instalações existentes. Obrigado @berkdamerc pela descoberta e @chriscrosstalk pela contribuição!

## Versão 1.31.0 - 3 de abril de 2026

### Recursos

* **Assistente de IA**: adicionado suporte a hosts remotos compatíveis com OpenAI (por exemplo, Ollama, LM Studio etc.), permitindo executar modelos em hardware separado do host do Command Center. Obrigado @hestela pela contribuição!
* **Assistente de IA**: suporte ao Ollama Cloud desativado (incompatível com a arquitetura do NOMAD) e adicionado suporte ao `flash_attn` para melhorar o desempenho de modelos compatíveis. Obrigado @hestela pela contribuição!
* **Biblioteca de Informações (Kiwix)**: o container Kiwix agora utiliza uma abordagem baseada em arquivo XML da biblioteca em vez de uma abordagem baseada em glob para informar ao container Kiwix quais arquivos ZIM estão disponíveis. Isso permite um tratamento muito mais robusto dos arquivos ZIM e evita problemas em que o container não consegue iniciar devido à presença de arquivos ZIM incompletos/corrompidos no diretório de armazenamento. Obrigado @jakeaturner pela contribuição!
* **RAG**: adicionado suporte à incorporação de arquivos EPUB na Base de Conhecimento. Obrigado @arn6694 pela contribuição!
* **RAG**: adicionado suporte ao envio de vários arquivos (até 5, 100 MB cada) para a Base de Conhecimento. Obrigado @jakeaturner pela contribuição!
* **Mapas**: adicionado suporte a marcadores de localização personalizáveis no mapa, com persistência no banco de dados. Obrigado @chriscrosstalk pela contribuição!
* **Mapas**: o arquivo do mapa global agora pode ser baixado diretamente do PMTiles para usuários que desejam o mapa completo e/ou regiões fora dos EUA que ainda não foram adicionadas às coleções selecionadas. Obrigado @bgauger pela contribuição!
* **Mapas**: adicionada uma escala ao visualizador de mapas, com opções imperial e métrica. Obrigado @chriscrosstalk pela contribuição!
* **Downloads**: adicionados suporte/melhorias para progresso detalhado, nomes amigáveis, cancelamento e atualizações de status em tempo real para downloads ativos na interface. Obrigado @chriscrosstalk pela contribuição!
* **UI**: todos os PNGs foram convertidos para WEBP para reduzir o tamanho das imagens e melhorar o desempenho. Obrigado @hestela pela contribuição!
* **UI**: adicionada uma seção de Modelos Instalados às configurações do Assistente de IA. Obrigado @chriscrosstalk pela contribuição!

### Correções de Bugs

* **Mapas**: os endpoints da API de mapas agora verificam corretamente `X-Forwarded-Proto` para oferecer suporte a cenários em que o Command Center está atrás de um proxy reverso que termina o TLS. Obrigado @davidgross pela correção!
* **Mapas**: corrigido um problema em que os endpoints da API de mapas poderiam falhar com um erro interno quando um hostname era usado para acessar o Command Center em vez de um endereço IP ou localhost. Obrigado @jakeaturner pela correção!
* **Fila**: aumentado o `lockDuration` do BullMQ para evitar que tarefas sejam encerradas prematuramente em sistemas mais lentos. Obrigado @bgauger pela contribuição!
* **Fila**: adicionado melhor tratamento para downloads muito grandes e cancelamentos iniciados pelo usuário. Obrigado @bgauger pela contribuição!
* **Instalação**: o script de instalação agora verifica a presença do `gpg` (necessário para instalar o toolkit NVIDIA) e tenta instalá-lo automaticamente caso esteja ausente. Obrigado @chriscrosstalk pela correção!
* **Segurança**: adicionada validação de chaves ao endpoint da API de leitura das configurações. Obrigado @LuisMIguelFurlanettoSousa pela correção!
* **Segurança**: melhorada a lógica de validação de URLs para downloads de ZIM, evitando vulnerabilidades de SSRF. Obrigado @sebastiondev pela correção!
* **UI**: corrigida a altura do feed de atividades na Configuração Fácil e adicionada rolagem automática para a mensagem mais recente durante a instalação. Obrigado @chriscrosstalk pela contribuição!

### Melhorias

* **Dependências**: atualizadas várias dependências para corrigir vulnerabilidades de segurança e melhorar a estabilidade.
* **Docker**: o NOMAD agora adiciona os rótulos `'com.docker.compose.project': 'project-nomad-managed'` e `'io.project-nomad.managed': 'true'` a todos os containers instalados pelo Command Center, melhorando a compatibilidade com outras ferramentas de gerenciamento Docker e facilitando a identificação e o gerenciamento dos containers do NOMAD. Obrigado @techyogi pela contribuição!
* **Docs**: adicionada uma referência simples da API para usuários avançados e desenvolvedores. Obrigado @hestela pela contribuição!
* **Docs**: reformatação do comando de instalação rápida em várias linhas para melhorar a legibilidade no README. Obrigado @samsara-02 pela contribuição!
* **Docs**: atualizados os guias CONTRIBUTING e FAQ com as informações mais recentes e esclarecidas algumas dúvidas comuns. Obrigado @jakeaturner pela contribuição!
* **Ops**: atualizadas as GitHub Actions para suas versões mais recentes. Obrigado @salmanmkc pela contribuição!
* **Performance**: reduzido significativamente o tamanho do bundle da interface do Command Center por meio da otimização de dependências e tree-shaking, resultando em tempos de carregamento mais rápidos e uma experiência mais ágil. Obrigado @jakeaturner pela contribuição!
* **Performance**: implementada compressão gzip por padrão para todas as rotas HTTP registradas pelo backend do Command Center, melhorando ainda mais o desempenho, especialmente em conexões mais lentas. A variável de ambiente `DISABLE_COMPRESSION` pode ser usada para desativar esse recurso, se necessário. Obrigado @jakeaturner pela contribuição!
* **Performance**: adicionado cache leve para determinadas interações com o socket do Docker e para a resolução personalizada do nome do Assistente de IA, melhorando o desempenho e reduzindo chamadas redundantes à API do Docker. Obrigado @jakeaturner pela contribuição!
* **Performance**: utilização de chamadas de navegação do roteador Inertia quando apropriado, aproveitando o cache integrado e as otimizações de desempenho do Inertia para uma experiência mais fluida. Obrigado @jakeaturner pela contribuição!

## Versão 1.30.3 - 25 de março de 2026

### Recursos

### Correções de Bugs

* **Benchmark**: corrigido um problema em que as pontuações de CPU e gravação em disco poderiam ser exibidas como 0 caso os valores medidos fossem inferiores à metade do valor de referência. Obrigado @bortlesboat pela correção!
* **Gerenciador de Conteúdo**: corrigido um método ausente do cliente da API que fazia com que a exclusão de arquivos ZIM falhasse. Obrigado @LuisMIguelFurlanettoSousa pela correção!
* **Instalação**: corrigido um problema em que o script de instalação poderia informar incorretamente que o runtime NVIDIA do Docker estava ausente. Obrigado @brenex pela correção!
* **Apoie o Projeto**: corrigido um link quebrado para o Rogue Support. Obrigado @chriscrosstalk pela correção!

### Melhorias

* **Assistente de IA**: melhorados os relatórios e o tratamento de erros durante downloads de modelos. Obrigado @chriscrosstalk pela contribuição!
* **Assistente de IA**: atualizada a versão padrão do Ollama instalado para v0.18.1, aproveitando as melhorias de desempenho e correções de bugs mais recentes.
* **Aplicativos**: melhorados os relatórios e o tratamento de erros para falhas na instalação de serviços. Obrigado @trek-e pela contribuição!
* **Coleções**: atualizados vários links de coleções selecionadas para suas versões mais recentes. Obrigado @builder555 pela contribuição!
* **CyberChef**: atualizada a versão padrão instalada do CyberChef para v10.22.1, aproveitando os recursos e correções de bugs mais recentes.
* **Docs**: adicionado um link para o guia de instalação passo a passo e para o tutorial em vídeo. Obrigado @chriscrosstalk pela contribuição!
* **Instalação**: aumentado o limite de tentativas do serviço MySQL no Docker Compose para melhorar a estabilidade durante a instalação em sistemas com desempenho mais baixo. Obrigado @dx4956 pela contribuição!
* **Instalação**: corrigido um problema em que dados antigos poderiam causar incompatibilidade de credenciais no MySQL durante uma reinstalação. Obrigado @chriscrosstalk pela correção!

## Versão 1.30.0 - 20 de março de 2026

### Recursos

* **Night Ops**: adicionado o recurso mais solicitado — um tema de modo escuro para a interface do Command Center! Ative-o pelo rodapé e aproveite o novo visual durante suas missões noturnas. Obrigado @chriscrosstalk pela contribuição!
* **Informações de Depuração**: adicionado um novo modal "Informações de Depuração", acessível pelo rodapé, que fornece informações detalhadas do sistema e do aplicativo para solução de problemas e suporte. Obrigado @chriscrosstalk pela contribuição!
* **Apoie o Projeto**: adicionada uma nova página "Apoie o Projeto" nas configurações, com links para recursos da comunidade, opções de doação e formas de contribuir.
* **Instalação**: a imagem principal do NOMAD agora é totalmente independente e pode ser utilizada diretamente com Docker Compose, permitindo instalações mais flexíveis e personalizáveis sem depender de scripts externos. A imagem continua totalmente compatível com instalações existentes, e o script de instalação foi atualizado para refletir o processo de implantação simplificado.

### Correções de Bugs

* **Configurações**: a exibição do uso de armazenamento agora prioriza dispositivos de bloco reais em vez de tempfs. Obrigado @Bortlesboat pela correção!
* **Configurações**: corrigido um problema em que a lógica de correspondência de dispositivos e deduplicação das entradas de montagem poderia causar relatórios incorretos de uso de armazenamento e dispositivos ausentes nas exibições de armazenamento.
* **Mapas**: a página de Mapas agora respeita o protocolo da solicitação (http vs https) para garantir que os blocos do mapa sejam carregados corretamente. Obrigado @davidgross pelo relatório de bug!
* **Base de Conhecimento**: corrigido um problema em que tarefas de embedding de arquivos poderiam causar uma tempestade de tentativas quando o serviço Ollama estivesse indisponível. Obrigado @skyam25 pelo relatório de bug!
* **Coleções Selecionadas**: corrigidos alguns links quebrados nas definições das coleções selecionadas (mapas e arquivos ZIM), que faziam alguns recursos não conseguirem ser baixados.
* **Configuração Fácil**: corrigido um problema em que o indicador "Comece Aqui" permanecia mesmo depois de visitar o Assistente de Configuração Fácil pela primeira vez. Obrigado @chriscrosstalk pela correção!
* **UI**: corrigido um problema em que o indicador de carregamento poderia apresentar uma aparência estranha em determinadas situações.
* **Atualizações do Sistema**: corrigido um problema em que o banner de atualização permanecia mesmo depois que o sistema era atualizado com sucesso. Obrigado @chriscrosstalk pela correção!
* **Performance**: várias pequenas correções de vazamentos de memória e melhorias de desempenho em toda a interface para garantir uma experiência mais fluida.

### Melhorias

* **Ollama**: melhorada a lógica de detecção de GPU para garantir que a configuração mais recente da GPU seja sempre enviada ao container Ollama durante uma atualização.
* **Ollama**: o tipo de GPU detectado agora é armazenado no banco de dados para uma configuração e solução de problemas mais confiáveis entre atualizações e reinicializações. Obrigado @chriscrosstalk pela contribuição!
* **Downloads**: os usuários agora podem dispensar notificações de downloads com falha para reduzir a desorganização na interface. Obrigado @chriscrosstalk pela contribuição!
* **Logging**: alterado o nível padrão de log para "info" para reduzir ruídos e concentrar-se em mensagens importantes. Obrigado @traxeon pela sugestão!
* **Logging**: o logger interno do NOMAD agora cria seu próprio diretório de logs durante a inicialização caso ele ainda não exista, evitando erros em novas instalações em que o diretório de logs ainda não foi criado.
* **Dozzle**: acesso ao shell do Dozzle e ações sobre containers agora são desativados por padrão. Obrigado @traxeon pela recomendação!
* **MySQL & Redis**: removida a exposição de portas ao host por padrão para melhorar a segurança. As portas ainda podem ser expostas manualmente quando necessário. Obrigado @traxeon pela recomendação!
* **Dependências**: várias atualizações de dependências para corrigir vulnerabilidades de segurança e melhorar a estabilidade.
* **Scripts Utilitários**: adicionada uma verificação da versão esperada do Docker Compose (v2) em todos os scripts utilitários, fornecendo mensagens de erro e orientações mais claras caso o ambiente não esteja configurado corretamente.
* **Scripts Utilitários**: adicionada uma advertência extra ao script de instalação informando sobre a possibilidade de sobrescrever configurações personalizadas existentes e sobre a importância de fazer backup dos dados antes de executar novamente o script de instalação.
* **Documentação**: atualizadas as instruções de instalação para refletir a nova opção de implantação manual via Docker Compose sem o script de instalação.

## Versão 1.29.0 - 11 de março de 2026

### Recursos

* **Assistente de IA**: adicionadas orientações aprimoradas ao usuário para solucionar problemas de passagem da GPU.
* **Assistente de IA**: o último modelo utilizado agora é selecionado automaticamente quando um novo chat é iniciado.
* **Configurações**: o NOMAD agora realiza automaticamente verificações noturnas em busca de atualizações disponíveis dos aplicativos, e os usuários podem selecionar e aplicar atualizações na página de Aplicativos em Configurações.

### Correções de Bugs

* **Configurações**: corrigido um problema em que a página de configurações do Assistente de IA aparecia na navegação mesmo quando o Assistente de IA não estava instalado, causando erros 404 ao ser selecionada.
* **Segurança**: implementadas proteções contra path traversal e SSRF.
* **Assistente de IA**: corrigido um problema que causava falhas intermitentes ao salvar títulos das sessões de chat.

### Melhorias

* **Assistente de IA**: melhorias extensas de desempenho e aprimoramento da inteligência do RAG/uso de contexto.

## Versão 1.28.0 - 5 de março de 2026

### Recursos

* **RAG**: adicionado suporte para visualizar tarefas de embedding ativas na fila de processamento e melhorado o acompanhamento do progresso das tarefas com atualizações de status mais detalhadas.
* **RAG**: adicionado suporte para remover documentos da base de conhecimento (exclusão do Qdrant e do armazenamento local).

### Correções de Bugs

* **Instalação**: corrigidas URLs quebradas no script de instalação e atualizado o processo para solicitar a aceitação da licença Apache 2.0.
* **Docs**: atualizados os avisos legais para refletir a licença Apache 2.0 e adicionada a atribuição ao Qdrant.
* **Dependências**: várias pequenas atualizações de dependências para corrigir vulnerabilidades de segurança.

### Melhorias

* **Licença**: adicionado o arquivo de licença Apache 2.0 ao repositório para maior clareza e conformidade legal.

## Versão 1.27.0 - 4 de março de 2026

### Recursos

* **Configurações**: adicionado suporte à paginação na lista de modelos do Ollama.
* **Canal de Acesso Antecipado**: permite que os usuários optem por receber versões de acesso antecipado com os recursos e melhorias mais recentes antes de chegarem às versões estáveis.

### Correções de Bugs

### Melhorias

* **Assistente de IA**: melhorado o desempenho do chat por meio da otimização da reescrita de consultas e da lógica de transmissão das respostas.
* **CI/CD**: atualizados os fluxos de lançamento para oferecer suporte a versões candidatas a lançamento.
* **KV Store**: melhorada a segurança de tipos na implementação do KV Store.

## Versão 1.26.0 - 19 de fevereiro de 2026

### Recursos

* **Assistente de IA**: adicionado suporte à exibição do fluxo de raciocínio para modelos com recursos de pensamento.
* **Assistente de IA**: adicionado suporte à transmissão de respostas para melhorar a experiência do usuário.

### Correções de Bugs

### Melhorias

## Versão 1.25.2 - 18 de fevereiro de 2026

### Recursos

### Correções de Bugs

* **Assistente de IA**: corrigido um erro nas sugestões de chat quando nenhum modelo Ollama está instalado.
* **Assistente de IA**: melhorada a lógica de detecção de GPUs dedicadas.
* **UI**: links antigos para `/docs` e `/knowledge-base` agora redirecionam corretamente para as páginas correspondentes em vez de mostrar erros 404.

### Melhorias

* **Assistente de IA**: as sugestões de chat agora ficam desativadas por padrão para evitar sobrecarregar configurações de hardware menores.

## Versão 1.25.1 - 12 de fevereiro de 2026

### Recursos

### Correções de Bugs

* **Configurações**: corrigido um possível problema de cache desatualizado durante a verificação de atualizações do sistema.
* **Configurações**: melhoradas as orientações ao usuário durante as atualizações do sistema.

### Melhorias

## Versão 1.25.0 - 12 de fevereiro de 2026

### Recursos

* **Coleções**: reformulação completa do gerenciamento de coleções com manifests dinâmicos, rastreamento no banco de dados dos recursos instalados e interface aprimorada para gerenciar arquivos ZIM e recursos de mapas.
* **Coleções**: adicionado suporte à verificação de versões mais recentes dos recursos instalados com base nos dados do manifest.

### Correções de Bugs

* **Benchmark**: melhorado o tratamento de erros e a propagação de códigos de status para fornecer um feedback melhor ao usuário em falhas de envio.
* **Benchmark**: corrigida uma condição de corrida no gerenciamento do container sysbench que poderia causar falhas nos testes de benchmark.

### Melhorias

---

## Versão 1.24.0 - 10 de fevereiro de 2026

### 🚀 Recursos

* **Assistente de IA**: reescrita de consultas para melhorar a recuperação de contexto.
* **Assistente de IA**: permitir a verificação e ressincronização manual da Base de Conhecimento.
* **Assistente de IA**: interface da Base de Conhecimento integrada à página do Assistente de IA.
* **Assistente de IA**: incorporação de conteúdo ZIM na Base de Conhecimento.
* **Downloads**: exibição do progresso de download dos modelos.
* **Sistema**: tarefa Cron para verificações automáticas de atualização.
* **Docs**: renderização aprimorada da documentação com componentes inspirados no tema desértico.

### 🐛 Correções de Bugs

* **Assistente de IA**: melhorias no desempenho das sugestões de chat.
* **Assistente de IA**: renderização de código inline.
* **GPU**: detecção de GPUs NVIDIA por meio da API do Docker em vez de `lspci`.
* **Instalação**: melhoria da configuração de GPU do Docker.
* **Sistema**: correção do cálculo da porcentagem de uso de memória.
* **Sistema**: exibição do sistema operacional do host, hostname e GPU em vez das informações do container.
* **Coleções**: correção dos nomes de arquivos ZIM do devdocs em Computação e Tecnologia.
* **Downloads**: ordenação dos downloads ativos por progresso decrescente.
* **Docs**: correção de vários links internos e referências de rotas quebrados.

### ✨ Melhorias

* **Docs**: reformulação da documentação dentro do aplicativo com ordenação da barra lateral.
* **Docs**: atualização do README com visão geral dos recursos.
* **GPU**: utilitário reutilizável para executar `nvidia-smi`.

---

## Versão 1.23.0 - 5 de fevereiro de 2026

### 🚀 Recursos

* **Mapas**: os Mapas agora utilizam a página inteira por padrão.
* **Navegação**: adicionado link "Voltar para o Início" às páginas com cabeçalho padrão.
* **IA**: pesquisa aproximada na lista de modelos de IA.
* **UI**: melhorado o relatório global de erros com notificações ao usuário.

### 🐛 Correções de Bugs

* **Kiwix**: evitar reiniciar o container Kiwix enquanto houver tarefas de download em execução.
* **Docker**: garantir que os containers sejam completamente removidos quando a instalação de um serviço falhar.
* **IA**: filtrar modelos na nuvem da resposta da API e da lista de modelos de fallback.
* **Coleções Selecionadas**: impedir recursos duplicados ao buscar as coleções mais recentes.
* **Níveis de Conteúdo**: reformular o sistema de níveis para determinar dinamicamente o status de instalação no lado do servidor.

### ✨ Melhorias

* **Docs**: adicionada renderização aprimorada para tabelas Markdown nas páginas de documentação.

---

## Versão 1.22.0 - 4 de fevereiro de 2026

### 🚀 Recursos

* **Gerenciador de Conteúdo**: exibir nomes amigáveis (Título e Resumo) em vez dos nomes brutos dos arquivos ZIM.
* **Base de Conhecimento de IA**: adicionar automaticamente a documentação do NOMAD à Base de Conhecimento de IA durante a instalação.

### 🐛 Correções de Bugs

* **Mapas**: garantir que as URLs dos recursos dos mapas sejam resolvidas corretamente quando acessadas por hostname.
* **Wikipedia**: impedir a sobreposição do indicador de carregamento durante o download.
* **Configuração Fácil**: rolar para o topo ao navegar entre as etapas do assistente.
* **Chat de IA**: ocultar o botão e a página de chat caso o Assistente de IA não esteja realmente instalado.
* **Configurações**: renomear a coluna confusa "Porta" para "Localização" nas Configurações de Aplicativos.

### ✨ Melhorias

* **Ollama**: limpeza da lógica de download de modelos e melhoria do acompanhamento do progresso.

---

## Versão 1.21.0 - 2 de fevereiro de 2026

### 🚀 Recursos

* **Assistente de IA**: interface de chat de IA integrada — não é mais necessário instalar o aplicativo Open WebUI separadamente.
* **Base de Conhecimento**: envio de documentos com OCR, pesquisa semântica (RAG) e respostas de IA contextuais por meio do Qdrant.
* **Seletor da Wikipedia**: gerenciamento dedicado de conteúdo da Wikipedia com seleção inteligente de pacotes.
* **Suporte a GPU**: passagem de GPUs NVIDIA e AMD para o Ollama (inferência de IA mais rápida).

### 🐛 Correções de Bugs

* **Benchmark**: detecção de Intel Arc Graphics nos processadores Core Ultra.
* **Configuração Fácil**: removido o Benchmark do Sistema integrado do assistente (agora está em Configurações).
* **Ícones**: mudança para Tabler Icons por consistência e remoção de bibliotecas de ícones não utilizadas.
* **Docker**: evitar baixar novamente imagens existentes durante a instalação.

### ✨ Melhorias

* **Ollama**: lista alternativa de modelos recomendados caso api.projectnomad.us esteja indisponível.
* **Ollama/Qdrant**: imagens Docker fixadas em versões específicas para maior estabilidade.
* **README**: adicionados links para o site e para a comunidade.
* Removido o Open WebUI como aplicativo instalável separado (substituído pelo Chat de IA integrado).

---

## Versão 1.20.0 - 28 de janeiro de 2026

### 🚀 Recursos

* **Coleções**: categorias selecionadas ampliadas com mais conteúdo e UX aprimorada no modal de seleção de níveis.
* **Legal**: Avisos Legais ampliados e movidos para a parte inferior da barra lateral de Configurações.

### 🐛 Correções de Bugs

* **Instalação**: tratamento da dependência `curl` ausente em novas instalações do Ubuntu.
* **Migrações**: correção da ordenação de timestamps para a migração `builder_tag`.

---

## Versão 1.19.0 - 28 de janeiro de 2026

### 🚀 Recursos

* **Benchmark**: sistema Builder Tag — reivindique posições no ranking usando tags com tema NOMAD (por exemplo, `"Tactical-Llama-1234"`).
* **Benchmark**: benchmark completo com IA agora é obrigatório para compartilhamento com a comunidade; envios assinados com HMAC.
* **Notas de Lançamento**: inscrição para receber notas de lançamento por e-mail.
* **Mapas**: download automático dos recursos do mapa-base caso estejam ausentes.

### 🐛 Correções de Bugs

* **Informações do Sistema**: usar `fsSize` como fallback quando o array de discos estiver vazio (corrige "Nenhum dispositivo de armazenamento detectado").

---

## Versão 1.18.0 - 24 de janeiro de 2026

### 🚀 Recursos

* **Coleções**: melhoria da experiência das coleções selecionadas com seleção persistente de nível e fluxo de envio para confirmação.

### 🐛 Correções de Bugs

* **Benchmark**: corrigida a conectividade do benchmark de IA (o container Docker não conseguia acessar o Ollama no host).
* **Open WebUI**: corrigido o indicador de status da instalação.

### ✨ Melhorias

* **Docker**: utilitário de resolução de URLs de containers e melhorias de rede.

---

## Versão 1.17.0 - 23 de janeiro de 2026

### 🚀 Recursos

* **Benchmark do Sistema**: pontuação de hardware com NOMAD Score, medidores circulares e envio para o ranking da comunidade.
* **Painel**: nomes amigáveis para aplicativos com atribuição de código aberto "Powered by".
* **Configurações**: nomenclatura atualizada e adição de coleções de conteúdo em níveis às páginas de Configurações.
* **Filas**: suporte para trabalhar com todas as filas usando um único comando.

### 🐛 Correções de Bugs

* **Configuração Fácil**: selecionar o disco primário válido para a barra de projeção de armazenamento.
* **Docs**: remover links de serviços quebrados que apontavam para rotas inválidas.
* **Notificações**: melhoria do estilo.
* **UI**: remover a tela de abertura.
* **Mapas**: correção da resolução de caminhos estáticos.

---

## Versão 1.16.0 - 20 de janeiro de 2026

### 🚀 Recursos

* **Aplicativos**: opção de reinstalação forçada para aplicativos instalados.
* **Open WebUI**: gerenciamento direto dos modelos Ollama pelo Command Center.
* **Configuração Fácil**: exibir o tamanho do modelo de IA selecionado na barra de projeção de armazenamento.

### ✨ Melhorias

* **Categorias Selecionadas**: melhoria da busca no GitHub.
* **Build**: adicionado arquivo dockerignore.

---

## Versão 1.15.0 - 19 de janeiro de 2026

### 🚀 Recursos

* **Assistente de Configuração Fácil**: etapa 1 redesenhada com cartões de recursos fáceis de entender em vez de nomes de aplicativos.
* **Coleções em Níveis**: coleções de conteúdo baseadas em categorias com níveis Essencial, Padrão e Completo.
* **Barra de Projeção de Armazenamento**: indicador visual de uso do disco mostrando as adições previstas durante a Configuração Fácil.
* **Suporte ao Windows**: suporte ao Docker Desktop para desenvolvimento local com detecção de plataforma e variável de ambiente `NOMAD_STORAGE_PATH`.
* **Documentação**: documentação completa dentro do aplicativo (Início, Primeiros Passos, FAQ e Casos de Uso).

### ✨ Melhorias

* **Configuração Fácil**: renomeado o rótulo da etapa 3 de "Arquivos ZIM" para "Conteúdo".
* **Notificações**: corrigido o fechamento automático que não funcionava devido a um closure desatualizado.
* Adicionadas as categorias de conteúdo Sobrevivência e Preparação e Educação e Referência.

---

## Versão 1.14.0 - 16 de janeiro de 2026

### 🚀 Recursos

* **Coleções**: busca automática das coleções selecionadas mais recentes no GitHub.

### 🐛 Correções de Bugs

* **Docker**: melhoria do gerenciamento do estado dos containers.

---

## Versão 1.13.0 - 15 de janeiro de 2026

### 🚀 Recursos

* **Assistente de Configuração Fácil**: implementação inicial da experiência guiada de configuração na primeira execução.
* **Mapas**: melhorias nos avisos de recursos ausentes.
* **Aplicativos**: cartões de aplicativos aprimorados com ícones personalizados.

### 🐛 Correções de Bugs

* **Coleções Selecionadas**: ajustes na UI.
* **Instalação**: alterado o `pull_policy` do container admin para `always`.

---

## Versão 1.12.0 - 1.12.3 - 24 de dezembro de 2025 - 13 de janeiro de 2026

### 🚀 Recursos

* **Sistema**: verificação do status da internet no backend com suporte a uma URL de teste personalizada.

### 🐛 Correções de Bugs

* **Admin**: melhoria do gerenciamento do status de instalação de serviços.
* **Admin**: melhoria do tratamento de solicitações de instalação duplicadas.
* **Admin**: correção da URL de download dos recursos do mapa-base.
* **Admin**: correção do mapeamento de porta para o Open WebUI.
* **Admin**: melhoria dos indicadores de uso de memória.
* **Admin**: adição de favicons.
* **Admin**: correção do healthcheck do container.
* **Admin**: correção do método ausente do cliente da API de download de ZIM.
* **Instalação**: correção da montagem do arquivo de informações do disco e melhorias de estabilidade.
* **Instalação**: garantir que o script de atualização sempre baixe as imagens mais recentes.
* **Instalação**: utilizar o comando moderno `docker compose` no script de atualização.
* **Instalação**: garantir que o script de atualização tenha permissão de execução.
* **Scripts**: remover o arquivo de informações do disco durante a desinstalação.

---

## Versão 1.11.0 - 1.11.1 - 24 de dezembro de 2025

### 🚀 Recursos

* **Mapas**: coleções selecionadas de regiões de mapas.
* **Coleções**: definições de coleções de regiões de mapas.

### 🐛 Correções de Bugs

* **Mapas**: corrigidos downloads personalizados de arquivos pmtiles.
* **Docs**: correções no renderizador da documentação.

---

## Versão 1.10.1 - 5 de dezembro de 2025

### ✨ Melhorias

* **Kiwix**: melhorias no caminho de armazenamento dos ZIMs.

---

## Versão 1.10.0 - 5 de dezembro de 2025

### 🚀 Recursos

* Monitoramento das informações do disco.

### ✨ Melhorias

* **Instalação**: adicionadas variáveis de ambiente do Redis ao arquivo compose.
* **Kiwix**: download e configuração inicial.

---

## Versão 1.9.0 - 5 de dezembro de 2025

### 🚀 Recursos

* Gerenciamento de tarefas em segundo plano com BullMQ.

### ✨ Melhorias

* **Instalação**: escape de caracteres nas variáveis de ambiente.
* **Instalação**: variável de ambiente do host.

---

## Versão 1.8.0 - 5 de dezembro de 2025

### 🚀 Recursos

* Redesign dos estilos de alertas e botões.
* Redesign da página de informações do sistema.
* **Coleções**: coleções ZIM selecionadas com suporte a slug, ícone e idioma.
* Downloads personalizados de mapas e arquivos ZIM (WIP).
* Novo sistema de mapas (WIP).

### ✨ Melhorias

* **DockerService**: limpeza de componentes antigos do OSM.
* **Instalação**: padronização dos nomes dos arquivos compose.

---

## Versão 1.7.0 - 5 de dezembro de 2025

### 🚀 Recursos

* Redesign dos estilos de alertas e botões.
* Redesign da página de informações do sistema.
* **Coleções**: coleções ZIM selecionadas.
* Downloads personalizados de mapas e arquivos ZIM (WIP).
* Novo sistema de mapas (WIP).

### ✨ Melhorias

* **DockerService**: limpeza de componentes antigos do OSM.
* **Instalação**: padronização dos nomes dos arquivos compose.

---

## Versão 1.6.0 - 18 de novembro de 2025

### 🚀 Recursos

* Adicionado Kolibri à biblioteca padrão de aplicativos.

### ✨ Melhorias

* Padronização dos nomes dos containers no `management-compose`.

---

## Versão 1.5.0 - 18 de novembro de 2025

### 🚀 Recursos

* Rodapé com versão e correção do gerenciamento de versão do CI.

---

## Versão 1.4.0 - 18 de novembro de 2025

### 🚀 Recursos

* **Serviços**: nomes e descrições amigáveis.

### ✨ Melhorias

* **Scripts**: melhorias na criação do diretório de logs.
* **Scripts**: correção de erro de digitação no caminho do arquivo `management-compose`.

---

## Versão 1.3.0 - 9 de outubro de 2025

### 🚀 Novos Recursos

* O script de desinstalação agora remove containers de aplicativos NOMAD que não são de gerenciamento.

### ✨ Melhorias

* **OpenStreetMap**: aplicação mais robusta das correções de permissões de diretórios.

---

## Versão 1.2.0 - 7 de outubro de 2025

### 🚀 Novos Recursos

* Adicionado CyberChef à biblioteca padrão de aplicativos.
* Adicionado Dozzle aos containers principais para melhorar logs e métricas.
* Adicionado FlatNotes à biblioteca padrão de aplicativos.
* Script auxiliar de desinstalação disponível.

### ✨ Melhorias

* **OpenStreetMap**:

  * Corrigidos caminhos de diretórios e problemas de acesso.
  * Melhorado o tratamento de erros.
  * Corrigidas permissões dos arquivos do renderizador.
  * Corrigido problema com caminho absoluto do host.
* **ZIM Manager**:

  * O download inicial do ZIM agora é hospedado no repositório GitHub do Project NOMAD para melhorar a disponibilidade.

---

## Versão 1.1.0 - 20 de agosto de 2025

### 🚀 Novos Recursos

**Instalação do OpenStreetMap**

* Adicionado OpenStreetMap aos aplicativos instaláveis.
* Baixa e importa automaticamente a região do Pacífico dos EUA durante a instalação.
* Suporta cache de blocos renderizados para melhorar o desempenho.

### ✨ Melhorias

* **Aplicativos**: adicionados controles de iniciar/parar/reiniciar para cada container de aplicativo nas configurações.
* **ZIM Manager**: downloads com tratamento de erros e possibilidade de retomada + interface aprimorada.
* **Sistema**: agora é possível visualizar informações do sistema, como CPU, RAM e estatísticas do disco, nas configurações.
* **Legal**: adicionados avisos legais nas configurações.
* **UI**: adicionadas melhorias gerais na interface, como alertas e caixas de diálogo de erro.
* Padronização dos nomes dos containers para reduzir possíveis conflitos com containers existentes no sistema host.

### ⚠️ Alterações que Quebram Compatibilidade

* **Nomenclatura de Containers**: como resultado da padronização dos nomes dos containers, é recomendado realizar uma nova instalação do Project NOMAD e dos aplicativos para evitar possíveis conflitos/duplicações de containers.

### 📚 Documentação

* Adicionada página de notas de lançamento.

---

## Versão 1.0.1 - 11 de julho de 2025

### 🐛 Correções de Bugs

* **Docs**: corrigida a renderização da documentação.
* **Instalação**: corrigidas as URLs do script de instalação.
* **OpenWebUI**: corrigida a conexão com o Ollama.

---

## Versão 1.0.0 - 11 de julho de 2025

### 🚀 Novos Recursos

* Lançamento inicial em alpha para instalação de aplicativos e documentação.
* Instalação do OpenWebUI, Ollama e Kiwix.
* Downloads e gerenciamento de ZIM.

---

## Suporte

* **Discord:** [Entrar na Comunidade](https://discord.com/invite/crosstalksolutions) — Obtenha ajuda, compartilhe suas configurações e conecte-se com outros usuários do NOMAD.
* **Relatórios de Bugs:** [GitHub Issues](https://github.com/Crosstalk-Solutions/project-nomad/issues)
* **Site:** [www.projectnomad.us](https://www.projectnomad.us)

---

*Para ver o changelog completo, consulte os [lançamentos do GitHub](https://github.com/Crosstalk-Solutions/project-nomad/releases).*
