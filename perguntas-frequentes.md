# Perguntas Frequentes

## Perguntas Gerais

### O que é o NOMAD?
O NOMAD é um servidor pessoal que dá acesso a conhecimento, educação e assistência de IA sem a necessidade de conexão com a internet. Ele roda no seu próprio hardware, mantendo seus dados privados e acessíveis a qualquer momento.

### Preciso de internet para usar o NOMAD?
Não — esse é justamente o propósito. Uma vez que o conteúdo é baixado, tudo funciona offline. Você só precisa de internet para:
- Baixar novo conteúdo
- Atualizar o software
- Sincronizar as versões mais recentes da Wikipédia, mapas, etc.

### Qual sistema operacional o NOMAD necessita?
Linux baseado em Debian. **Ubuntu 26.04 LTS é o que recomendamos e testamos** para novas instalações.

Ubuntu 24.04 LTS e Debian 12 também são suportados, portanto não há necessidade de reinstalar se você já está em um deles. Usuários Windows podem seguir o [guia WSL2](https://www.projectnomad.us/install/wsl2), que é mantido pela comunidade.

macOS e distribuições não-Debian como Fedora ou Arch não possuem suporte oficial. O NOMAD não precisa de ambiente de desktop, então o Ubuntu Server é uma boa escolha se você está confortável com o terminal.

Para um passo a passo completo incluindo a instalação do Ubuntu, consulte o [Guia de Instalação](https://www.projectnomad.us/install).

### Qual hardware eu preciso?
O NOMAD foi projetado para hardware robusto, especialmente se você deseja usar os recursos de IA. Recomendado:
- CPU moderna com múltiplos núcleos (AMD Ryzen 7 com gráficos Radeon é o favorito da comunidade)
- 16GB+ de RAM (32GB+ para melhor desempenho de IA)
- Armazenamento SSD (o tamanho depende do conteúdo — mínimo de 500GB, 1TB+ recomendado)
- GPU NVIDIA ou AMD recomendada para respostas de IA mais rápidas

**Para recomendações detalhadas de montagem em três faixas de preço ($150–$1.000+), consulte o [Guia de Hardware](https://www.projectnomad.us/hardware).**

### Quanto espaço de armazenamento eu preciso?
Depende do que você baixar:
- Wikipédia completa: ~95GB
- Cursos da Khan Academy: ~50GB
- Referências médicas: ~500MB
- Mapas de estados dos EUA: ~2-3GB cada
- Modelos de IA: 10-40GB dependendo do modelo

Comece com o essencial e adicione mais conforme necessário.

---

## Perguntas sobre Conteúdo

### Como adiciono mais conteúdo da Wikipédia?
1. Vá em **Configurações** (menu hambúrguer → Configurações)
2. Clique em **Explorador de Conteúdo**
3. Navegue pelos pacotes de Wikipédia disponíveis
4. Clique em Baixar nos itens desejados

Você também pode usar o **Explorador de Conteúdo** para navegar por todo o conteúdo ZIM disponível além da Wikipédia.

### Como adiciono mais cursos educacionais?
1. Abra o **Kolibri**
2. Entre como administrador
3. Vá em **Dispositivo → Canais**
4. Navegue e importe os canais disponíveis

### O conteúdo é atualizado?
O conteúdo é tão atual quanto a data do último download. Os snapshots da Wikipédia são atualizados tipicamente uma vez por mês. Verifique os nomes dos arquivos ou descrições para conferir as datas.

### Posso adicionar meus próprios arquivos?
Sim — com a Base de Conhecimento. Envie PDFs, arquivos de texto e outros documentos para a [Base de Conhecimento](/knowledge-base), e a IA poderá referenciá-los ao responder suas perguntas. Isso utiliza busca semântica para encontrar informações relevantes nos seus arquivos enviados.

Para conteúdo Kiwix, o NOMAD utiliza arquivos ZIM padrão. Para conteúdo educacional, o Kolibri utiliza seu próprio formato de canal.

### O que são os níveis de coleções curadas?
Ao selecionar conteúdo no assistente de Configuração Fácil ou no Explorador de Conteúdo, as coleções são organizadas em três níveis:
- **Essencial** — Conteúdo principal da categoria (menor download)
- **Padrão** — Essencial mais conteúdo útil adicional
- **Completo** — Tudo disponível para a categoria (maior download)

Isso ajuda a equilibrar a cobertura de conteúdo com o uso de armazenamento.

---

## Perguntas sobre IA

### Como uso o chat de IA?
1. Vá ao [Chat de IA](/chat) a partir do Centro de Comando
2. Digite sua pergunta ou solicitação
3. A IA responde em estilo conversacional

A IA precisa ser instalada primeiro — ative-a durante a Configuração Fácil ou instale-a pela página do [Depósito de Recursos](/supply-depot).

### Como envio documentos para a Base de Conhecimento?
1. Vá em **[Base de Conhecimento →](/knowledge-base)**
2. Envie seus documentos (PDFs, arquivos de texto, etc.)
3. Os documentos são processados e indexados automaticamente
4. Faça perguntas no Chat de IA — a IA referenciará seus documentos enviados quando relevante

Você também pode remover documentos da Base de Conhecimento quando não forem mais necessários.

A documentação do NOMAD é adicionada automaticamente à Base de Conhecimento quando o Assistente de IA é instalado.

### O que é o Benchmark do Sistema?
O Benchmark do Sistema testa o desempenho do seu hardware e gera uma Pontuação NOMAD — uma composição ponderada de desempenho de CPU, memória, disco e IA. Você pode criar uma Builder Tag (uma identidade temática NOMAD como "Tactical-Llama-1234") e compartilhar seus resultados no [ranking da comunidade](https://benchmark.projectnomad.us).

Vá em **[Benchmark do Sistema →](/settings/benchmark)** para executar um.

### O que é o Canal de Acesso Antecipado?
O Canal de Acesso Antecipado permite que você opte por receber versões candidatas a lançamento com os recursos e melhorias mais recentes antes de chegarem às versões estáveis. Você pode ativá-lo ou desativá-lo em **Configurações → Verificar Atualizações**. Versões de acesso antecipado podem conter bugs — se você prefere estabilidade, permaneça no canal estável.

---

## Solução de Problemas

### Um recurso não carrega ou exibe uma página em branco

**Tente estes passos:**
1. Aguarde 30 segundos — alguns recursos demoram para iniciar
2. Atualize a página (Ctrl+R ou Cmd+R)
3. Volte ao Centro de Comando e tente novamente
4. Verifique em Configurações → Sistema se o serviço está em execução
5. Tente reiniciar o serviço (Parar, depois Iniciar no Depósito de Recursos)

### Os mapas exibem uma área cinza/em branco

O recurso de Mapas requer dados de mapa baixados. Se você vê uma área em branco:
1. Vá em **Configurações → Gerenciador de Mapas**
2. Baixe as regiões de mapa da sua área
3. Aguarde a conclusão dos downloads
4. Retorne aos Mapas e atualize a página

### ERRO: Failed to load the XML library file '/data/kiwix-library.xml'

Isso geralmente significa que o serviço da Biblioteca de Informações iniciou antes de seu índice de biblioteca Kiwix ser totalmente inicializado.

Tente este procedimento de recuperação:
1. Vá ao **[Depósito de Recursos](/supply-depot)**
2. Pare a **Biblioteca de Informações (Kiwix)**
3. Aguarde 10-15 segundos e inicie novamente
4. Se o erro persistir, execute **Forçar Reinstalação** para a Biblioteca de Informações na mesma página

Após a conclusão da reinicialização/reinstalação, atualize a página da Biblioteca de Informações.

### As respostas da IA estão lentas

A IA local requer poder computacional significativo. Para melhorar a velocidade:
- **Adicione uma GPU** — Uma GPU NVIDIA com o NVIDIA Container Toolkit pode melhorar a velocidade da IA em 10-20x ou mais
- Feche outras aplicações no servidor
- Garanta resfriamento adequado (superaquecimento causa limitação de desempenho)
- Considere usar um modelo de IA menor/mais rápido, se disponível

### Como habilito a aceleração por GPU para IA?

O NOMAD detecta automaticamente GPUs NVIDIA quando o NVIDIA Container Toolkit está instalado no sistema hospedeiro. Para configurar a aceleração por GPU:

1. **Instale uma GPU NVIDIA** no seu servidor (se ainda não tiver uma)
2. **Instale o NVIDIA Container Toolkit** no hospedeiro — siga o [guia oficial de instalação](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
3. **Reinstale o Assistente de IA** — Vá ao [Depósito de Recursos](/supply-depot), encontre o Assistente de IA e clique em **Forçar Reinstalação**

O NOMAD detectará a GPU durante a instalação e configurará a IA para usá-la automaticamente. Você verá "NVIDIA container runtime detected" no progresso da instalação.

**Dica:** Execute um [Benchmark do Sistema](/settings/benchmark) antes e depois para ver a diferença. Sistemas com aceleração por GPU tipicamente alcançam 100+ tokens por segundo contra 10-15 apenas com CPU.

### Adicionei/troquei minha GPU, mas a IA continua lenta

Quando você adiciona ou troca uma GPU, o NOMAD precisa reconfigurar o contêiner de IA para usá-la:

1. Certifique-se de que o **NVIDIA Container Toolkit** está instalado no hospedeiro
2. Vá ao **[Depósito de Recursos](/supply-depot)**
3. Encontre o **Assistente de IA** e clique em **Forçar Reinstalação**

Forçar Reinstalação recria o contêiner de IA com suporte a GPU habilitado. Sem este passo, a IA continua rodando apenas na CPU.

### Vejo um aviso "GPU passthrough not working"

O NOMAD verifica se sua GPU está realmente acessível dentro do contêiner de IA. Se uma GPU é detectada no hospedeiro mas não está funcionando dentro do contêiner, você verá um banner de aviso nas páginas de Informações do Sistema e Configurações de IA. Clique no botão **"Fix: Reinstall AI Assistant"** para recriar o contêiner com acesso adequado à GPU. Isso preserva seus modelos de IA baixados.

### Chat de IA indisponível

A página do Chat de IA requer que o Assistente de IA seja instalado primeiro:
1. Vá ao **[Depósito de Recursos](/supply-depot)**
2. Instale o **Assistente de IA**
3. Aguarde a conclusão da instalação
4. O Chat de IA estará então acessível pela tela inicial ou em [Chat](/chat)

### Envio para a Base de Conhecimento travado

Se o envio de um documento parece travado na Base de Conhecimento:
1. Verifique se o Assistente de IA está em execução em **Configurações → Depósito de Recursos**
2. Documentos grandes levam tempo para processar — aguarde alguns minutos
3. Tente enviar um documento menor para verificar se o sistema está funcionando
4. Verifique **Configurações → Sistema** para mensagens de erro

### O benchmark não envia para o ranking

Para compartilhar resultados no ranking da comunidade:
- Você deve executar um **Benchmark Completo** (não apenas Sistema ou apenas IA)
- O benchmark deve incluir resultados de IA (o Assistente de IA deve estar instalado e funcionando)
- Sua pontuação deve ser maior que qualquer envio anterior do mesmo hardware

Se o envio falhar, verifique a mensagem de erro para mais detalhes.

### "Service unavailable" ou erros de conexão

O serviço pode ainda estar inicializando. Aguarde 1-2 minutos e tente novamente.

Se o problema persistir:
1. Vá em **Configurações → Depósito de Recursos**
2. Encontre o serviço problemático
3. Clique em **Reiniciar**
4. Aguarde 30 segundos e tente novamente

### Downloads travados ou falhando

1. Verifique sua conexão com a internet
2. Vá em **Configurações** e verifique o armazenamento disponível
3. Se o armazenamento estiver cheio, exclua conteúdo não utilizado
4. Cancele o download travado e tente novamente

### O servidor não inicia

Se você não consegue acessar o Centro de Comando:
1. Verifique se o hardware do servidor está ligado
2. Verifique a conectividade de rede
3. Tente acessar diretamente pelo endereço IP do servidor
4. Verifique os logs do servidor se você tem acesso ao console

### Esqueci minha senha do Kolibri

As senhas do Kolibri são gerenciadas separadamente:
1. Se você é administrador, pode redefinir senhas de usuários no gerenciamento de usuários do Kolibri
2. Se você esqueceu a senha de administrador, pode ser necessário redefini-la via linha de comando (entre em contato com seu administrador)

---

## Atualizações e Manutenção

### Como atualizo o NOMAD?
1. Vá em **Configurações → Verificar Atualizações**
2. Se uma atualização estiver disponível, clique para instalar
3. O sistema baixará as atualizações e reiniciará automaticamente
4. Isso geralmente leva de 2 a 5 minutos

### Devo atualizar regularmente?
Sim, enquanto você tiver acesso à internet. As atualizações incluem:
- Correções de bugs
- Novos recursos
- Melhorias de segurança
- Melhorias de desempenho

### O NOMAD pode se atualizar automaticamente?
Sim. O NOMAD pode manter seu software, seus aplicativos instalados e seu conteúdo atualizados por conta própria. As atualizações automáticas são **opcionais e desativadas por padrão** — você ativa o que quiser em **Configurações → Atualizações** (e, para aplicativos, um controle individual no Depósito de Recursos). Elas só executam dentro de uma janela de horário que você escolhe, após verificações de segurança, e nunca aplicam saltos de versão principal automaticamente. Consulte o **[guia de Atualizações](/docs/updates)** para um passo a passo completo.

### Como atualizo o conteúdo (Wikipédia, etc.)?
As atualizações de conteúdo são separadas das atualizações de software:
1. Vá em **Configurações → Gerenciador de Conteúdo** ou **Explorador de Conteúdo**
2. Verifique se há versões mais recentes do seu conteúdo instalado
3. Baixe as versões atualizadas conforme necessário

Você também pode ativar **atualizações automáticas de conteúdo** para que bibliotecas Wikipedia/ZIM e regiões de mapa instaladas se atualizem sozinhas durante a noite — consulte o [guia de Atualizações](/docs/updates).

Dica: Novos snapshots da Wikipédia são lançados aproximadamente uma vez por mês.

### O que acontece se uma atualização falhar?
O sistema foi projetado para se recuperar de forma segura. Se uma atualização falhar:
1. A versão anterior deve continuar funcionando
2. Tente a atualização novamente mais tarde
3. Verifique Configurações → Sistema para mensagens de erro

### Manutenção via Linha de Comando

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
*Nota: Isso atualiza apenas o Centro de Comando, não os aplicativos individuais. Atualize os aplicativos pela interface web.*

**Desinstalar o NOMAD:**
```bash
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/uninstall_nomad.sh -o uninstall_nomad.sh
sudo bash uninstall_nomad.sh
```
*Aviso: Isso não pode ser desfeito. Todos os dados serão excluídos.*

---

## Privacidade e Segurança

### Meus dados são privados?
Sim. O NOMAD roda inteiramente no seu hardware. Suas buscas, conversas com IA e dados de uso nunca saem do seu servidor.

### Outras pessoas podem acessar meu servidor?
Por padrão, o NOMAD é acessível na sua rede local. Qualquer pessoa na mesma rede pode acessá-lo. Para redes públicas, considere medidas de segurança adicionais.

### A IA envia dados para algum lugar?
Não. A IA roda completamente de forma local. Suas conversas não são enviadas para nenhum serviço externo. O chat de IA é integrado ao Centro de Comando — não há serviço separado para configurar.

---

## Obtendo Mais Ajuda

### A IA pode ajudar
Tente fazer uma pergunta no [Chat de IA](/chat). A IA local pode responder perguntas sobre diversos tópicos, incluindo solução de problemas técnicos. Se você enviou a documentação do NOMAD para a Base de Conhecimento, ela também pode ajudar com perguntas específicas sobre o NOMAD.

### Consulte a documentação
Você está na documentação agora. Use o menu para encontrar tópicos específicos.

### Junte-se à comunidade
Obtenha ajuda de outros usuários do NOMAD no **[Discord](https://discord.com/invite/crosstalksolutions)**.

### Notas de Versão
Veja o que mudou em cada versão: **[Notas de Versão](/docs/release-notes)**
