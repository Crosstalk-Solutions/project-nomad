<div align="center">
<img src="admin/public/project_nomad_logo.webp" width="200" height="200"/>

# Projeto Errante
### Conhecimento que Nunca Fica Offline

<!-- Espaço para adicionar links futuros: Website, Discord e Benchmark -->
<!-- [![Website](https://img.shields.io/badge/Website-Em_Breve-blue)]() -->
<!-- [![Discord](https://img.shields.io/badge/Discord-Comunidade-5865F2)]() -->
<!-- [![Benchmark](https://img.shields.io/badge/Benchmark-Placar-green)]() -->

</div>

---

O **Projeto Errante** é um servidor de educação e conhecimento autônomo e *offline-first*, equipado com ferramentas essenciais, biblioteca de conteúdo e inteligência artificial para manter você informado e capacitado — a qualquer hora, em qualquer lugar.

> [!NOTE]
> **Sobre este projeto:** O **Projeto Errante** é um *fork* da iniciativa [Project NOMAD](https://github.com/Crosstalk-Solutions/project-nomad) da [Crosstalk Solutions](https://www.projectnomad.us), traduzido e adaptado para a comunidade de língua portuguesa sob a licença [Apache 2.0](LICENSE).

## Instalação e Início Rápido

O **Projeto Errante** pode ser instalado em qualquer sistema operacional baseado em Debian (recomendamos o Ubuntu 26.04 LTS; o 24.04 LTS e o Debian 12 também são suportados). A instalação é totalmente feita via terminal, e todas as ferramentas e recursos foram projetados para serem acessados pelo navegador — portanto, não é necessária uma interface gráfica de desktop caso prefira configurá-lo como um "servidor" e acessá-lo a partir de outros dispositivos na rede.

*Nota: são necessários privilégios de administrador (sudo/root) para executar o script de instalação.*

### Instalação Rápida (Apenas sistemas baseados em Debian)
```bash
sudo apt-get update && \
sudo apt-get install -y curl && \
curl -fsSL https://raw.githubusercontent.com/caioffx/projeto-errante/refs/heads/main/install/install_nomad.sh \
  -o install_nomad.sh && \
sudo bash install_nomad.sh
```

O Projeto Errante agora está instalado no seu dispositivo! Abra o navegador e acesse `http://localhost:8080` (ou `http://IP_DO_DISPOSITIVO:8080`) para começar a explorar!

Para um passo a passo completo (incluindo a instalação do Ubuntu), consulte o [Guia de Instalação](https://www.projectnomad.us/install). Usuários de Windows podem consultar o [Guia de instalação via WSL2](https://www.projectnomad.us/install/wsl2) — rota mantida pela comunidade cobrindo o Docker nativo e o Docker Desktop.

### Instalação Avançada
Para maior controle sobre o processo de instalação, copie o [modelo do Docker Compose](https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/management_compose.yaml) para um arquivo `docker-compose.yml` e personalize-o conforme sua preferência (lembre-se de preencher as variáveis com seus valores reais). Em seguida, execute `docker compose up -d` para iniciar a Central de Comando e suas dependências. *Nota: este método é recomendado apenas para usuários avançados, pois exige familiaridade com Docker e configuração manual prévia.*

## Como Funciona

O sistema é composto por uma interface de gerenciamento ("Central de Comando") e uma API que orquestra um conjunto de ferramentas e recursos conteinerizados via [Docker](https://www.docker.com/). Ele cuida de toda a instalação, configuração e atualizações — para que você não precise se preocupar com isso.

**Os recursos integrados incluem:**
- **Chat com IA e Base de Conhecimento:** IA local integrada via [Ollama](https://ollama.com/) (ou através de ferramentas compatíveis com a API da OpenAI, como LM Studio e llama.cpp), com upload de documentos e busca semântica (RAG via [Qdrant](https://qdrant.tech/)).
- **Biblioteca de Informações:** Wikipédia offline, referências médicas, guias de sobrevivência, livros digitais e muito mais via [Kiwix](https://kiwix.org/).
- **Plataforma de Educação:** Cursos da Khan Academy com acompanhamento de progresso via [Kolibri](https://learningequality.org/kolibri/).
- **Mapas Offline:** Mapas regionais para download e navegação offline via [ProtoMaps](https://protomaps.com).
- **Ferramentas de Dados:** Criptografia, codificação, hash e análise de dados via [CyberChef](https://gchq.github.io/CyberChef/).
- **Bloco de Notas:** Anotações locais com suporte a Markdown via [FlatNotes](https://github.com/dullage/flatnotes).
- **Benchmark do Sistema:** Pontuação de desempenho do hardware com ranking comunitário.
- **Depósito de Suprimentos (*Supply Depot*):** Catálogo de aplicativos instaláveis com um clique (ferramentas de PDF, gerenciador de arquivos, leitor de e-books, cofre de senhas e mais), além do suporte para rodar seus próprios contêineres Docker personalizados.
- **Atualizações Automáticas:** Atualizações automáticas e configuráveis do sistema, aplicativos instalados e conteúdos offline, no horário que você definir.
- **Assistente de Configuração Inicial:** Passo a passo guiado para a primeira inicialização com coleções de conteúdo já selecionadas.

O sistema também inclui ferramentas integradas como seletor de conteúdo da Wikipédia, gerenciador de bibliotecas ZIM e explorador de conteúdo.

## O Que Está Incluído

| Recurso | Desenvolvido com | O Que Você Recebe |
|---------|------------------|-------------------|
| Biblioteca de Informações | Kiwix | Wikipédia offline, manuais médicos, guias de sobrevivência, e-books |
| Assistente de IA | Ollama + Qdrant | Chat integrado com upload de arquivos e busca semântica |
| Plataforma Educacional | Kolibri | Cursos da Khan Academy, acompanhamento de progresso e múltiplos usuários |
| Mapas Offline | ProtoMaps | Mapas regionais para download, busca e visualização offline |
| Ferramentas de Dados | CyberChef | Criptografia, codificação, hashing e análise forense |
| Bloco de Notas | FlatNotes | Anotações locais simples e eficientes em Markdown |
| Benchmark do Sistema | Nativo | Pontuação de hardware, Builder Tags e placar comparativo |
| Depósito de Suprimentos | Nativo | Catálogo de aplicativos em um clique + suporte a contêineres Docker próprios |

## Requisitos de Hardware

Embora muitos computadores de sobrevivência *offline* sejam projetados para rodar em hardware extremamente básico, o Projeto Errante vai além. Para instalar e aproveitar ao máximo as ferramentas de Inteligência Artificial disponíveis, recomendamos fortemente o uso de uma máquina potente com placa de vídeo dedicada (GPU).

Em sua essência, no entanto, a Central de Comando em si é muito leve. Para uma instalação básica do aplicativo de gerenciamento, as seguintes especificações mínimas são necessárias:

*Nota: O projeto não é patrocinado por nenhum fabricante de hardware e foi projetado para ser o mais independente de plataforma possível. Os componentes listados abaixo servem apenas como referência comparativa.*

#### Especificações Mínimas
- **Processador:** Dual-core de 2 GHz ou superior
- **Memória RAM:** 4 GB de memória do sistema
- **Armazenamento:** Pelo menos 5 GB de espaço livre em disco
- **Sistema Operacional:** Baseado em Debian (recomendamos Ubuntu 26.04 LTS ou 24.04 LTS)
- **Conexão de Internet estável:** (necessária apenas durante a instalação inicial)

Para rodar modelos de linguagem (LLMs) e outras ferramentas de IA incluídas:

#### Especificações Recomendadas (Ideais)
- **Processador:** AMD Ryzen 7, Intel Core i7 ou superior
- **Memória RAM:** 32 GB de memória do sistema
- **Placa de Vídeo (GPU):** NVIDIA RTX 3060, equivalente AMD ou superior (quanto mais VRAM, maiores os modelos suportados)
- **Armazenamento:** Pelo menos 250 GB livres em disco (de preferência em SSD)
- **Sistema Operacional:** Baseado em Debian (Ubuntu 26.04 LTS ou 24.04 LTS)
- **Conexão de Internet estável:** (necessária apenas durante a instalação inicial)

**Para recomendações detalhadas de montagem em três faixas de custo, consulte o [Guia de Hardware](https://www.projectnomad.us/hardware) da documentação original.**

Vale reforçar: o sistema base em si é muito leve — são as ferramentas, pacotes de conteúdo e modelos que você escolher instalar que determinarão os requisitos reais da sua máquina.

#### Executando modelos de IA em outra máquina (Host remoto)
Por padrão, o instalador tenta configurar o Ollama na própria máquina em que o Assistente de IA for instalado. No entanto, se você preferir rodar os modelos de IA em outro computador da rede, basta acessar as configurações do Assistente de IA na interface e informar a URL de um servidor Ollama ou compatível com a API da OpenAI (como o LM Studio).  
*Atenção:* se você usar o Ollama em outra máquina, certifique-se de iniciar o servidor com a variável `OLLAMA_HOST=0.0.0.0` para liberar o acesso na rede local.  
O Ollama é o método preferencial para o assistente de IA, pois oferece recursos integrados como o download de modelos via interface (algo que a API padrão da OpenAI não suporta). Ao usar o LM Studio, por exemplo, você precisará baixar os modelos diretamente por ele. A configuração e manutenção do servidor de IA na outra máquina ficam sob sua responsabilidade.

## Perguntas Frequentes (FAQ)
Para respostas às dúvidas mais comuns sobre o projeto, consulte a nossa página de [FAQ](FAQ.md).

## Uso de Internet e Privacidade
O Projeto Errante foi desenvolvido prioritariamente para uso *offline*. Uma conexão com a internet só é necessária durante a instalação inicial (para baixar dependências e imagens) ou caso você decida baixar ferramentas adicionais e novos pacotes de conteúdo mais tarde. Fora isso, o sistema opera de forma 100% autônoma e possui **ZERO telemetria** integrada.

Para verificar se há conexão ativa com a internet, o sistema tenta primeiro fazer uma requisição ao endpoint utilitário da Cloudflare: `https://1.1.1.1/cdn-cgi/trace`. Caso esse endereço esteja inacessível (por exemplo, se sua rede bloquear o IP `1.1.1.1`), ele tenta outros endpoints que a aplicação já costuma contatar (como a API do GitHub) e considera o dispositivo conectado se algum deles responder.

Você pode personalizar o endereço usado para esse teste de duas formas:
1. Pela interface gráfica em **Configurações → Avançado** (salvo localmente na sua instância).
2. Pela variável de ambiente `INTERNET_STATUS_TEST_URL` (que sempre tem precedência sobre o valor configurado na interface). Se nenhuma for definida, os padrões acima são utilizados.

## Segurança
Por concepção, o projeto foi pensado para ser aberto e acessível na rede local sem barreiras — ele **não inclui sistema de autenticação ou login**. Caso conecte seu dispositivo à rede local após a instalação para permitir que outros aparelhos acessem seus recursos, você pode liberar ou bloquear portas no firewall para controlar quais serviços ficam expostos.

**Será adicionado suporte a login/autenticação no futuro?**
Possivelmente. A equipe original do upstream tem essa funcionalidade em votação no roteiro público de desenvolvimento (para casos de uso familiar com controle parental ou salas de aula com contas de professores/alunos).

Por enquanto, recomendamos usar controles no nível da rede (como firewalls ou VPNs locais) para gerenciar o acesso caso exponha a sua instância a outros dispositivos. O sistema **não** foi projetado para ser exposto diretamente à internet pública, e desaconselhamos fortemente que isso seja feito sem medidas rigorosas de segurança de rede.

## Contribuição
Contribuições são muito bem-vindas! Consulte o arquivo [CONTRIBUTING.md](CONTRIBUTING.md) para ver as diretrizes e instruções de como colaborar com o projeto.

### Testando Atualizações Automáticas (Simulação / Dry Run)

A Central de Comando pode instalar automaticamente atualizações de versão **menor/patch** dentro de uma janela de horário configurável, após um período de estabilidade (*cool-off*), e somente quando as verificações prévias forem aprovadas (espaço suficiente em disco para a nova imagem, sem downloads ou instalações em andamento). Versões maiores (*major*) sempre exigem atualização manual.

Como testar essa lógica criando versões reais seria impraticável, criamos um comando Ace que executa **todo o fluxo de tomada de decisão sem nunca disparar uma atualização real**. Execute-o a partir da pasta `admin/`:

```bash
# 1) Suíte de cenários determinísticos — não requer rede, banco de dados ou Docker.
#    Testa todos os ramos (apenas versões maiores, período de espera, versões prévias, janela de horário...)
#    e retorna erro caso algum falhe, sendo ideal para integração contínua (CI):
node ace auto-update:dry-run --scenarios

# 2) Simular "o que aconteceria se eu estivesse rodando a versão 1.32.0 agora?"
#    contra as releases REAIS do GitHub e com checagens de disco reais:
node ace auto-update:dry-run --current=1.32.0 --force-enabled

# 3) Simulação totalmente offline com uma lista local de releases e relógio fixo:
node ace auto-update:dry-run --current=1.32.0 --force-enabled \
  --releases-file=./fixtures/releases.json --now=2026-06-04T21:00:00Z \
  --window-start=20:00 --window-end=23:00 --cooloff=72 --skip-preflight
```

O comando exibe o diagnóstico completo — versão atual, se o relógio está dentro da janela permitida, a versão de destino aplicável (se houver) e eventuais impeditivos —, finalizando com um veredito claro como `ATUALIZARIA → v1.33.2` ou `NÃO ATUALIZARIA (fora da janela): …`. **Nenhuma alteração real é feita no sistema.**

| Parâmetro / Flag | Descrição |
|------------------|-----------|
| `--scenarios` | Executa a suíte de cenários determinísticos integrada e encerra |
| `--current=<versão>` | Simula que o sistema está rodando nesta versão (ex.: `1.32.0`) |
| `--force-enabled` | Força a atualização automática como ativada, ignorando a configuração salva |
| `--cooloff=<horas>` | Substitui o tempo de espera pós-lançamento (*cool-off*) |
| `--window-start=<HH:MM>` / `--window-end=<HH:MM>` | Define manualmente o início e fim da janela de atualização |
| `--now=<timestamp ISO>` | Simula o relógio do sistema em uma data/hora específica |
| `--releases-file=<caminho>` | Usa um arquivo JSON local com as releases em vez do GitHub (modo offline) |
| `--skip-preflight` | Pula as verificações prévias de Docker, disco e fila |

## Comunidade e Recursos

- **FAQ:** [FAQ.md](FAQ.md) — Respostas para as dúvidas mais frequentes.
- **Código de Conduta:** [CODIGO_DE_CONDUTA.md](CODIGO_DE_CONDUTA.md) — Diretrizes de convivência da nossa comunidade.
- **Licença Explicada:** [LICENCA_EXPLICADA.md](LICENCA_EXPLICADA.md) — Guia didático sobre os termos da licença Apache 2.0.
- **Complementos da Comunidade:** [admin/docs/community-add-ons.md](admin/docs/community-add-ons.md) — Pacotes de conteúdo desenvolvidos pela comunidade.
<!-- Espaço para canais futuros: -->
<!-- - **Website:** [Em breve]() -->
<!-- - **Discord:** [Em breve]() -->
<!-- - **Placar de Benchmark:** [Em breve]() -->

## Licença

O Projeto Errante é distribuído sob os termos da licença [Apache License 2.0](LICENSE).  
Para entender seus direitos, deveres e permissões de forma simples e prática, consulte nosso guia [LICENCA_EXPLICADA.md](LICENCA_EXPLICADA.md).

## Scripts Utilitários
Após a instalação, o projeto disponibiliza alguns scripts auxiliares caso você precise diagnosticar problemas ou realizar manutenções que não possam ser feitas pela Central de Comando.

> [!NOTE]
> **Compatibilidade:** Por compatibilidade com a estrutura herdada do upstream, o diretório padrão de instalação no sistema operacional atualmente é `/opt/project-nomad`. A transição gradual dos caminhos e contêineres para `/opt/projeto-errante` está planejada para as próximas etapas de refatoração do fork.

###### Script de Inicialização — Inicia todos os contêineres instalados do projeto
```bash
sudo bash /opt/project-nomad/start_nomad.sh
```

###### Script de Parada — Interrompe todos os contêineres em execução
```bash
sudo bash /opt/project-nomad/stop_nomad.sh
```

###### Script de Atualização — Tenta baixar as imagens mais recentes da Central de Comando e dependências (como MySQL) e recriar os contêineres. *Nota: isso atualiza apenas os contêineres centrais, não os aplicativos opcionais (que devem ser atualizados pela interface web).*
```bash
sudo bash /opt/project-nomad/update_nomad.sh
```

###### Script de Desinstalação — Precisa recomeçar do zero? Utilize o script de desinstalação. *Atenção: essa ação não pode ser desfeita!*
```bash
curl -fsSL https://raw.githubusercontent.com/caioffx/projeto-errante/refs/heads/main/install/uninstall_nomad.sh -o uninstall_nomad.sh && sudo bash uninstall_nomad.sh
```
