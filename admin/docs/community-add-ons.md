# Complementos da Comunidade
Projeto NOMAD possui um conjunto selecionado de ferramentas integradas e conteúdo, mas a comunidade começou a desenvolver complementos que estendem a plataforma com pacotes de conteúdo offline especializados. Estes são projetos de terceiros, não são mantidos pela equipe do NOMAD. Instale-os por sua conta e risco e, por favor, envie quaisquer relatos de bugs ou solicitações de recursos para o repositório do próprio complemento.

Criou um complemento para o Projeto NOMAD? Abra uma issue no [Project NOMAD GitHub repository](https://github.com/Crosstalk-Solutions/project-nomad/issues/new) ou envie-nos uma mensagem por meio do [formulário de contato em projectnomad.us](https://www.projectnomad.us/contact) e nós o avaliaremos para inclusão nesta página.

---

## Pacotes de Conteúdo ZIM

Os pacotes de conteúdo ZIM adicionam materiais de referência offline à sua biblioteca Kiwix existente. Eles normalmente vêm com um script install.sh que baixa o material de origem, cria um arquivo ZIM com o zimwriterfs e o registra no seu contêiner Kiwix em execução.

---

### Manuais de Campo Militares dos EUA

**Repositório:** [github.com/jrsphoto/ZIM-military-field-manuals](https://github.com/jrsphoto/ZIM-military-field-manuals)

Cerca de 180 manuais de campo militares dos EUA em domínio público, abrangendo medicina de campo, sobrevivência, primeiros socorros em combate, leitura de mapas e muito mais. Eles são compilados em um arquivo ZIM pesquisável que pode ser adicionado à sua biblioteca Kiwix.

O arquivo ZIM final tem aproximadamente 2 GB. Durante a compilação, o processo baixa cerca de 2 GB de PDFs de origem do archive.org.

---

### Arquivo de Programação W3Schools

**Repositório:** [github.com/kennethbrewer3/ZIM-w3schools-offline](https://github.com/kennethbrewer3/ZIM-w3schools-offline)

Uma cópia completa e offline dos tutoriais de programação do W3Schools, abrangendo HTML, CSS, JavaScript, Python, SQL e muito mais. É útil para aprender a programar, consultar sintaxe ou ensinar programação em um ambiente sem acesso à internet.

O tamanho final do arquivo ZIM é de aproximadamente 700 MB. Durante a compilação, o processo baixa cerca de 6 GB de arquivos de origem de um espelho do GitHub.

---

## Instalando um Complemento da Comunidade

Cada complemento possui suas próprias instruções de instalação, mas a maioria dos pacotes ZIM segue o mesmo processo:

1. Clone o repositório do complemento no seu host do NOMAD usando SSH.
2. Consulte o README para verificar as dependências necessárias para a compilação. A maioria precisa de `git`, `python3`, `unzip` e `zim-tools`.
3. Execute o `install.sh` incluído com a opção `--deploy`, indicando o caminho da sua biblioteca Kiwix (`/opt/project-nomad/storage/zim`) e o nome do seu contêiner Kiwix (`nomad_kiwix_server`).
4. O script cria o arquivo ZIM, copia-o para a sua biblioteca Kiwix, registra-o no Kiwix e reinicia o contêiner Kiwix.

Quando o script terminar, o novo conteúdo aparecerá na sua Biblioteca de Informações na próxima vez que você carregá-la.

A compilação inicial pode levar de alguns minutos a uma hora ou mais, dependendo do tamanho do complemento e do processador do seu host.

---

## Uma Observação sobre Suporte

Esses complementos são desenvolvidos e mantidos pela comunidade. Se algo der errado com um script de instalação ou com o conteúdo de um arquivo ZIM, abra uma issue no próprio repositório do complemento, em vez de no repositório do Project NOMAD.

Teremos prazer em ajudar se o problema estiver relacionado ao próprio NOMAD, por exemplo, se o Kiwix não estiver reconhecendo um novo ZIM após a instalação. No entanto, não podemos manter ou oferecer suporte a conteúdos de terceiros.
