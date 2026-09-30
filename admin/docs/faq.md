# Perguntas Frequentes

## Perguntas Gerais

### O que é o NOMAD?

O NOMAD é um servidor pessoal que oferece acesso a conhecimento, educação e assistência de IA sem exigir uma conexão com a internet. Ele funciona no seu próprio hardware, mantendo seus dados privados e acessíveis a qualquer momento.

### Preciso de internet para usar o NOMAD?

Não — esse é justamente o objetivo. Depois que o conteúdo é baixado, tudo funciona offline. Você só precisa de internet para:

* Baixar novos conteúdos
* Atualizar o software
* Sincronizar as versões mais recentes da Wikipédia, mapas etc.

### Qual sistema operacional o NOMAD precisa?

Linux baseado em Debian. **Ubuntu 26.04 LTS é o sistema que recomendamos e testamos** para novas instalações.

O Ubuntu 24.04 LTS e o Debian 12 também são compatíveis, portanto não é necessário reinstalar o sistema se você já estiver usando uma dessas versões. Usuários do Windows podem seguir o [guia do WSL2](https://www.projectnomad.us/install/wsl2), que conta com suporte da comunidade.

macOS e distribuições que não são baseadas em Debian, como Fedora ou Arch, não são oficialmente compatíveis. O NOMAD não precisa de um ambiente gráfico, então o Ubuntu Server é uma boa opção se você estiver confortável usando o terminal.

Para um passo a passo completo, incluindo a instalação do Ubuntu, consulte o [Guia de Instalação](https://www.projectnomad.us/install).

### De qual hardware eu preciso?

O NOMAD foi desenvolvido para hardware com boa capacidade, especialmente se você quiser utilizar os recursos de IA. Recomendado:

* CPU moderna com vários núcleos (AMD Ryzen 7 com gráficos Radeon é o ponto ideal segundo a comunidade)
* 16 GB ou mais de RAM (32 GB ou mais para melhor desempenho de IA)
* Armazenamento SSD (o tamanho depende do conteúdo — mínimo de 500 GB, recomendado 1 TB ou mais)
* GPU NVIDIA ou AMD recomendada para respostas de IA mais rápidas

**Para recomendações detalhadas de hardware em três faixas de preço (US$ 150–US$ 1.000+), consulte o [Guia de Hardware](https://www.projectnomad.us/hardware).**

### Quanto espaço de armazenamento eu preciso?

Depende do que você baixar:

* Wikipédia completa: ~95 GB
* Cursos da Khan Academy: ~50 GB
* Referências médicas: ~500 MB
* Mapas dos estados dos EUA: ~2–3 GB cada
* Modelos de IA: 10–40 GB, dependendo do modelo

Comece com o essencial e adicione mais conteúdo conforme necessário.

---

## Perguntas sobre Conteúdo

### Como adiciono mais conteúdo da Wikipédia?

1. Vá para **Configurações** (menu hambúrguer → Configurações)
2. Clique em **Explorador de Conteúdo**
3. Navegue pelos pacotes disponíveis da Wikipédia
4. Clique em Baixar nos itens desejados

Você também pode usar o **Explorador de Conteúdo** para navegar por todo o conteúdo ZIM disponível, além da Wikipédia.

### Como adiciono mais cursos educacionais?

1. Abra o **Kolibri**
2. Entre como administrador
3. Vá para **Dispositivo → Canais**
4. Navegue e importe os canais disponíveis

### Quão atualizado está o conteúdo?

O conteúdo está tão atualizado quanto estava no momento em que foi baixado pela última vez. Os arquivos da Wikipédia normalmente são atualizados mensalmente. Verifique os nomes ou descrições dos arquivos para consultar as datas.

### Posso adicionar meus próprios arquivos?

Sim — usando a **Base de Conhecimento**. Envie PDFs, arquivos de texto e outros documentos para a [Base de Conhecimento](/knowledge-base), e a IA poderá consultá-los ao responder às suas perguntas. Isso utiliza pesquisa semântica para encontrar informações relevantes nos arquivos enviados.

Para conteúdos do Kiwix, o NOMAD utiliza arquivos ZIM padrão. Para conteúdos educacionais, o Kolibri utiliza seu próprio formato de canal.

### O que são os níveis de coleção selecionados?

Ao selecionar conteúdo no assistente de Configuração Fácil ou no Explorador de Conteúdo, as coleções são organizadas em três níveis:

* **Essencial** — Conteúdo principal da categoria (menor download)
* **Padrão** — Conteúdo essencial mais conteúdos adicionais úteis
* **Completo** — Todo o conteúdo disponível para a categoria (maior download)

Isso ajuda a equilibrar a quantidade de conteúdo disponível com o espaço de armazenamento utilizado.

---

## Perguntas sobre IA

### Como uso o chat de IA?

1. Vá para [Chat de IA](/chat) no Centro de Comando
2. Digite sua pergunta ou solicitação
3. A IA responderá em formato de conversa

A IA precisa ser instalada primeiro — ative-a durante a Configuração Fácil ou instale-a pela página do [Depósito de Suprimentos](/supply-depot).

### Como envio documentos para a Base de Conhecimento?

1. Vá para **[Base de Conhecimento →](/knowledge-base)**
2. Envie seus documentos (PDFs, arquivos de texto etc.)
3. Os documentos serão processados e indexados automaticamente
4. Faça perguntas no Chat de IA — a IA consultará seus documentos quando forem relevantes

Você também pode remover documentos da Base de Conhecimento quando não precisar mais deles.

A documentação do NOMAD é adicionada automaticamente à Base de Conhecimento quando o Assistente de IA é instalado.

### O que é o Benchmark do Sistema?

O Benchmark do Sistema testa o desempenho do seu hardware e gera uma Pontuação NOMAD — uma pontuação composta e ponderada de desempenho da CPU, memória, disco e IA. Você pode criar uma Tag de Construtor (uma identidade com tema do NOMAD, como "Tactical-Llama-1234") e compartilhar seus resultados com o [ranking da comunidade](https://benchmark.projectnomad.us).

Vá para **[Benchmark do Sistema →](/settings/benchmark)** para executar um.

### O que é o Canal de Acesso Antecipado?

O Canal de Acesso Antecipado permite que você opte por receber versões candidatas (*release candidates*) com os recursos e melhorias mais recentes antes que cheguem às versões estáveis. Você pode ativá-lo ou desativá-lo em **Configurações → Verificar atualizações**. As versões de acesso antecipado podem conter bugs — se você prefere estabilidade, permaneça no canal estável.

---

## Solução de Problemas

### Um recurso não está carregando ou mostra uma página em branco

**Tente estas etapas:**

1. Aguarde 30 segundos — alguns recursos levam tempo para iniciar
2. Atualize a página (Ctrl+R ou Cmd+R)
3. Volte ao Centro de Comando e tente novamente
4. Verifique **Configurações → Sistema** para saber se o serviço está em execução
5. Tente reiniciar o serviço (Parar e depois Iniciar no Depósito de Suprimentos)

### Os mapas mostram uma área cinza/em branco

O recurso de Mapas precisa dos dados de mapas baixados. Se você vir uma área em branco:

1. Vá para **Configurações → Gerenciador de Mapas**
2. Baixe as regiões de mapas da sua área
3. Aguarde a conclusão dos downloads
4. Volte para Mapas e atualize a página

### ERRO: Falha ao carregar o arquivo de biblioteca XML '/data/kiwix-library.xml'

Isso normalmente significa que o serviço da Biblioteca de Informações foi iniciado antes que o índice da biblioteca Kiwix fosse totalmente inicializado.

Tente este procedimento:

1. Vá para o [**Depósito de Suprimentos**](/supply-depot)
2. Pare **Biblioteca de Informações (Kiwix)**
3. Aguarde de 10 a 15 segundos e inicie-a novamente
4. Se o erro persistir, execute **Forçar reinstalação** da Biblioteca de Informações na mesma página

Depois que a reinicialização/reinstalação for concluída, atualize a página da Biblioteca de Informações.

### As respostas da IA estão lentas

A IA local exige bastante poder computacional. Para melhorar a velocidade:

* **Adicione uma GPU** — uma GPU NVIDIA com o NVIDIA Container Toolkit pode aumentar a velocidade da IA em 10–20 vezes ou mais
* Feche outros aplicativos no servidor
* Garanta uma refrigeração adequada (o superaquecimento causa redução de desempenho)
* Considere usar um modelo de IA menor/mais rápido, se disponível

### Como ativo a aceleração de GPU para a IA?

O NOMAD detecta automaticamente GPUs NVIDIA quando o NVIDIA Container Toolkit está instalado no sistema host. Para configurar a aceleração de GPU:

1. **Instale uma GPU NVIDIA** no seu servidor (caso ainda não tenha)
2. **Instale o NVIDIA Container Toolkit** no host — siga o [guia oficial de instalação](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
3. **Reinstale o Assistente de IA** — vá para o [Depósito de Suprimentos](/supply-depot), encontre o Assistente de IA e clique em **Forçar reinstalação**

O NOMAD detectará a GPU durante a instalação e configurará a IA para utilizá-la automaticamente. Você verá "NVIDIA container runtime detected" durante o processo de instalação.

**Dica:** Execute um [Benchmark do Sistema](/settings/benchmark) antes e depois para verificar a diferença. Sistemas com aceleração por GPU normalmente alcançam mais de 100 tokens por segundo, enquanto sistemas utilizando apenas CPU ficam em torno de 10–15 tokens por segundo.

### Adicionei/troquei minha GPU, mas a IA continua lenta

Quando você adiciona ou troca uma GPU, o NOMAD precisa reconfigurar o contêiner de IA para utilizá-la:

1. Certifique-se de que o **NVIDIA Container Toolkit** está instalado no host
2. Vá para o [**Depósito de Suprimentos**](/supply-depot)
3. Encontre o **Assistente de IA** e clique em **Forçar reinstalação**

A Forçar reinstalação recria o contêiner de IA com o suporte à GPU ativado. Sem essa etapa, a IA continuará funcionando apenas na CPU.

### Vejo um aviso "GPU passthrough not working"

O NOMAD verifica se a GPU está realmente acessível dentro do contêiner de IA. Se uma GPU for detectada no host, mas não estiver funcionando dentro do contêiner, um aviso será exibido nas páginas de Informações do Sistema e Configurações de IA. Clique no botão **"Corrigir: Reinstalar Assistente de IA"** para recriar o contêiner com acesso adequado à GPU. Isso preserva os modelos de IA que você já baixou.

### O Chat de IA não está disponível

A página do Chat de IA exige que o Assistente de IA esteja instalado primeiro:

1. Vá para o [**Depósito de Suprimentos**](/supply-depot)
2. Instale o **Assistente de IA**
3. Aguarde a conclusão da instalação
4. O Chat de IA ficará acessível pela tela inicial ou pelo [Chat](/chat)

### O envio para a Base de Conhecimento está travado

Se o envio de um documento parecer travado na Base de Conhecimento:

1. Verifique se o Assistente de IA está funcionando em **Configurações → Depósito de Suprimentos**
2. Documentos grandes levam tempo para serem processados — aguarde alguns minutos
3. Tente enviar um documento menor para verificar se o sistema está funcionando
4. Verifique **Configurações → Sistema** em busca de mensagens de erro

### O Benchmark não consegue enviar os resultados para o ranking

Para compartilhar os resultados com o ranking da comunidade:

* Você precisa executar um **Benchmark Completo** (não apenas Sistema ou apenas IA)
* O benchmark precisa incluir resultados de IA (o Assistente de IA deve estar instalado e funcionando)
* Sua pontuação deve ser maior que qualquer envio anterior feito pelo mesmo hardware

Se o envio falhar, verifique a mensagem de erro para obter mais detalhes.

### "Serviço indisponível" ou erros de conexão

O serviço pode ainda estar iniciando. Aguarde de 1 a 2 minutos e tente novamente.

Se o problema persistir:

1. Vá para **Configurações → Depósito de Suprimentos**
2. Encontre o serviço com problema
3. Clique em **Reiniciar**
4. Aguarde 30 segundos e tente novamente

### Os downloads estão travados ou falhando

1. Verifique sua conexão com a internet
2. Vá para **Configurações** e verifique o espaço de armazenamento disponível
3. Se o armazenamento estiver cheio, exclua conteúdos que não são utilizados
4. Cancele o download travado e tente novamente

### O servidor não inicia

Se você não conseguir acessar o Centro de Comando:

1. Verifique se o hardware do servidor está ligado
2. Verifique a conectividade da rede
3. Tente acessar diretamente pelo endereço IP do servidor
4. Verifique os logs do servidor se tiver acesso ao console

### Esqueci minha senha do Kolibri

As senhas do Kolibri são gerenciadas separadamente:

1. Se você for administrador, poderá redefinir as senhas dos usuários no gerenciamento de usuários do Kolibri
2. Se você esqueceu a senha de administrador, pode ser necessário redefini-la pela linha de comando (entre em contato com o administrador)

---

## Atualizações e Manutenção

### Como atualizo o NOMAD?

1. Vá para **Configurações → Verificar atualizações**
2. Se houver uma atualização disponível, clique para instalá-la
3. O sistema baixará as atualizações e reiniciará automaticamente
4. Isso normalmente leva de 2 a 5 minutos

### Devo atualizar regularmente?

Sim, enquanto você tiver acesso à internet. As atualizações incluem:

* Correções de bugs
* Novos recursos
* Melhorias de segurança
* Melhorias de desempenho

### O NOMAD pode se atualizar automaticamente?

Sim. O NOMAD pode manter seu software, aplicativos instalados e conteúdo atualizados automaticamente. As atualizações automáticas são **opcionais e vêm desativadas por padrão** — você escolhe o que deseja ativar em **Configurações → Atualizações** (e, para aplicativos, há uma opção individual para cada aplicativo no Depósito de Suprimentos).

Elas são executadas somente dentro de um período definido por você, após verificações de segurança, e nunca aplicam automaticamente grandes mudanças de versão. Consulte o **[Guia de Atualizações](/docs/updates)** para obter um passo a passo completo.

### Como atualizo o conteúdo (Wikipédia etc.)?

As atualizações de conteúdo são separadas das atualizações de software:

1. Vá para **Configurações → Gerenciador de Conteúdo** ou **Explorador de Conteúdo**
2. Verifique se há versões mais recentes do conteúdo instalado
3. Baixe as versões atualizadas conforme necessário

Você também pode ativar as **atualizações automáticas de conteúdo** para que as bibliotecas Wikipédia/ZIM instaladas e as regiões de mapas sejam atualizadas automaticamente durante a noite — consulte o [Guia de Atualizações](/docs/updates).

**Dica:** Novas versões da Wikipédia são lançadas aproximadamente uma vez por mês.

### O que acontece se uma atualização falhar?

O sistema foi projetado para se recuperar automaticamente. Se uma atualização falhar:

1. A versão anterior deve continuar funcionando
2. Tente atualizar novamente mais tarde
3. Verifique **Configurações → Sistema** em busca de mensagens de erro

### Manutenção pela Linha de Comando

Para solução de problemas avançada ou quando você não consegue acessar a interface web, o NOMAD inclui scripts auxiliares em `/opt/project-nomad`:

**Iniciar todos os serviços:**

```bash
sudo bash /opt/project-nomad/start_nomad.sh
```

**Parar todos os serviços:**

```bash
sudo bash /opt/project-nomad/stop_nomad.sh
```

**Atualizar o Centro de Comando:**

```bash
sudo bash /opt/project-nomad/update_nomad.sh
```

*Observação: isso atualiza apenas o Centro de Comando, não os aplicativos individuais. Atualize os aplicativos pela interface web.*

**Desinstalar o NOMAD:**

```bash
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/uninstall_nomad.sh -o uninstall_nomad.sh
sudo bash uninstall_nomad.sh
```

*Aviso: essa ação não pode ser desfeita. Todos os dados serão excluídos.*

---

## Privacidade e Segurança

### Meus dados são privados?

Sim. O NOMAD funciona inteiramente no seu hardware. Suas pesquisas, conversas com a IA e dados de uso nunca saem do seu servidor.

### Outras pessoas podem acessar meu servidor?

Por padrão, o NOMAD fica acessível na sua rede local. Qualquer pessoa na mesma rede pode acessá-lo. Para redes públicas, considere medidas de segurança adicionais.

### A IA envia dados para algum lugar?

Não. A IA funciona completamente de forma local. Suas conversas não são enviadas para nenhum serviço externo. O chat de IA está integrado ao Centro de Comando — não há um serviço separado para configurar.

---

## Obtendo Mais Ajuda

### A IA pode ajudar

Tente fazer uma pergunta no [Chat de IA](/chat). A IA local pode responder a perguntas sobre diversos assuntos, incluindo solução de problemas técnicos. Se você tiver enviado a documentação do NOMAD para a Base de Conhecimento, ela também poderá ajudar com perguntas específicas sobre o NOMAD.

### Consulte a documentação

Você está na documentação agora. Use o menu para encontrar tópicos específicos.

### Participe da comunidade

Obtenha ajuda de outros usuários do NOMAD no **[Discord](https://discord.com/invite/crosstalksolutions)**.

### Notas de Lançamento

Veja o que mudou em cada versão: **[Notas de Lançamento](/docs/release-notes)**.
