# Aplicativos do Supply Depot

O Supply Depot é onde você instala aplicativos extras no seu NOMAD, além das ferramentas integradas. Cada aplicativo roda em seu próprio contêiner no seu NOMAD, totalmente offline, e aparece com um botão **Open** assim que termina de instalar.

Esta página aborda o que você precisa saber para começar a usar cada aplicativo *especificamente no NOMAD*: se é necessário fazer login, quais são as credenciais padrão, onde seus arquivos ficam e o que você precisa ter em mãos antes de começar. Ela não aborda como usar os aplicativos em si. Cada aplicativo é um projeto de código aberto independente, com sua própria documentação, e incluímos um link para ela em cada caso.

Uma observação rápida sobre logins: alguns desses aplicativos possuem suas próprias contas, separadas do login do NOMAD. Quando um aplicativo solicitar login, informamos as credenciais iniciais e se você deve alterá-las.

---

## Gerenciando seus aplicativos

Todo aplicativo instalado recebe um menu **Manage** em seu cartão. A partir dele, você pode:

* **Docs** — ir diretamente para as instruções iniciais do NOMAD para esse aplicativo (as mesmas seções específicas de cada aplicativo encontradas abaixo).
* **Edit** — alterar as configurações de um aplicativo: mapeamentos de portas, vinculações de volumes, variáveis de ambiente e limites de memória/CPU. Isso funciona também para aplicativos selecionados do catálogo, não apenas para os personalizados. Suas alterações são mescladas à configuração existente do aplicativo, portanto, configurações avançadas (como acesso à GPU no Assistente de IA) são preservadas, e um aplicativo editado deixa de ser sobrescrito pelas atualizações do catálogo.
* **Logs** e **Stats** — abrir uma visualização em tempo real da saída dos logs de um aplicativo ou de seu uso atual de memória e CPU, algo útil quando alguma coisa não está funcionando como deveria.
* **Update** e **Remove** — obter a versão mais recente de um aplicativo ou removê-lo (opcionalmente excluindo também sua imagem). Se o novo contêiner de uma atualização não conseguir iniciar, o NOMAD automaticamente faz rollback para a versão que estava funcionando.

**Ver qual versão você está executando:** Cada cartão de aplicativo mostra a versão instalada logo ao lado do nome do aplicativo (por exemplo, `Kiwix · 3.7.0`). Quando uma versão mais nova está disponível, um indicador laranja **Update available** aparece no cartão, tornando isso fácil de identificar rapidamente.

**Links personalizados de "Open":** Por padrão, o botão **Open** aponta para o aplicativo no próprio endereço do seu NOMAD. Se você usa um proxy reverso ou DNS local e prefere abrir um aplicativo em um endereço mais amigável (por exemplo, `https://jellyfin.myhomelab.net`), use **Manage › Edit** para definir uma URL de abertura personalizada. O NOMAD mantém seu link original salvo com segurança, para que você possa voltar a ele quando quiser, e a substituição permanece mesmo após as atualizações.

**Mantendo os aplicativos atualizados automaticamente:** Os aplicativos instalados podem se atualizar automaticamente, sem intervenção. Isso é opcional em dois níveis — uma opção principal em **Settings → Updates** e uma opção individual para cada aplicativo no Supply Depot — e somente atualizações menores e de correção são aplicadas automaticamente (versões principais sempre permanecem manuais). Consulte o [guia de atualizações](/docs/updates) para saber todos os detalhes.

---

## Trazendo seu próprio aplicativo

Além do catálogo selecionado, o Supply Depot pode executar **seu próprio contêiner Docker** como um aplicativo gerenciado junto com os demais. Clique em **Add a custom app** e informe ao NOMAD:

* a **imagem** a ser baixada (por exemplo, `ghcr.io/owner/app:1.2.3`);
* quaisquer **mapeamentos de portas**, **vinculações de volumes**, **variáveis de ambiente** e **limites de memória/CPU** necessários.

Enquanto você preenche os dados, o NOMAD executa uma verificação preliminar em tempo real e avisa sobre coisas como conflitos de portas ou configurações arriscadas. Alguns avisos (como um registro não confiável ou uma tag `:latest` que não pode ser acompanhada por versão) são apenas informativos, e você pode escolher **Install anyway**; configurações realmente inseguras são bloqueadas diretamente.

Depois de instalado, um aplicativo personalizado funciona como qualquer outro: recebe o mesmo menu **Manage** (Edit, Logs, Stats, Update, Remove), mostra sua versão no cartão e pode optar por receber atualizações automáticas. O NOMAD reforça a segurança das vinculações de caminhos do host e limita logs e estatísticas aos seus próprios contêineres gerenciados, de modo que um aplicativo personalizado não pode acessar nada além do que você fornecer a ele.

> Um aplicativo personalizado é exatamente isso — seu. O NOMAD o executa e não interfere; ele não fornece documentação de configuração nem suporte para softwares fora do catálogo selecionado. Consulte a documentação do próprio projeto para saber como usá-lo.

---

## Stirling PDF {% #stirling-pdf %}

Uma caixa de ferramentas completa para trabalhar com PDFs, tudo em seu próprio hardware. Mescle e divida arquivos, converta de e para PDF, compacte, gire, adicione ou remova senhas, use OCR em documentos digitalizados para torná-los pesquisáveis, assine, carimbe e oculte informações. São mais de 50 ferramentas, e como ele roda localmente, nenhum dos seus documentos sai do seu NOMAD.

**Site oficial:** [stirlingpdf.com](https://stirlingpdf.com) · **Código-fonte:** [github.com/Stirling-Tools/Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF)

**Na primeira vez que você abrir:** Ele abre diretamente nas ferramentas, sem necessidade de login. Configuramos o Stirling para ignorar sua tela de login, já que em um NOMAD ele é uma ferramenta pessoal em sua própria rede e uma barreira de senha apenas atrapalharia. Você verá "Guest" no canto inferior esquerdo, o que é normal.

**Atenção, ele demora para iniciar:** O Stirling PDF é uma grande aplicação Java. Depois de instalá-lo, aguarde de 30 a 60 segundos para que ele termine de iniciar antes de carregá-lo normalmente. Ele também precisa de uma boa quantidade de memória (cerca de um gigabyte), portanto funciona melhor em um NOMAD com memória disponível.

**Quer colocar uma senha?** Se você preferir que o Stirling exija um login (por exemplo, se algumas pessoas compartilham seu NOMAD e você quer proteger este aplicativo), pode reativar o login pelo NOMAD:

1. Na página do Supply Depot, encontre o Stirling PDF e clique em **Manage > Edit**.
2. Em **Environment Variables**, altere `SECURITY_ENABLELOGIN=false` para `SECURITY_ENABLELOGIN=true`.
3. Salve. O NOMAD reconstrói o aplicativo e a tela de login volta a aparecer.

Na primeira vez que fizer login depois disso, use o nome de usuário `admin` e a senha `stirling`. O Stirling fará com que você defina sua própria senha imediatamente. Observe que essa é a única maneira de reativar o login: o menu de configurações do próprio Stirling fica bloqueado enquanto você não estiver conectado, portanto, quando o login estiver desativado, você deve ativá-lo pela tela **Edit** do NOMAD, e não de dentro do Stirling.

**Seus dados:** Suas configurações ficam na pasta `storage/stirling-pdf` do seu NOMAD. Os PDFs com os quais você trabalha são enviados para realizar a operação e baixados de volta para seu próprio dispositivo. O Stirling não é uma biblioteca de longo prazo, portanto não mantém seus documentos armazenados.

**De onde vêm seus PDFs (e por que você não vê os arquivos do seu NOMAD):** O Stirling trabalha com arquivos do dispositivo que você estiver usando — notebook, celular ou tablet. Você clica em "Open from computer", escolhe um PDF, trabalha nele e depois baixa o resultado de volta para o dispositivo. O Stirling não consegue acessar arquivos armazenados em outras partes do seu NOMAD, portanto ele não mostrará sua pasta de livros, seus documentos da Base de Conhecimento ou qualquer coisa armazenada no File Browser. Se o PDF que você quer já estiver no seu NOMAD, baixe-o primeiro de onde estiver (do File Browser, por exemplo) e depois abra essa cópia no Stirling. É uma etapa extra, mas também é por isso que seus arquivos permanecem exatamente onde você os colocou, em vez de serem transferidos para outro aplicativo.

**Funciona offline:** Todas as ferramentas de PDF são executadas localmente no seu NOMAD, portanto a própria caixa de ferramentas funciona totalmente offline. Alguns recursos secundários acessam a internet e não funcionarão quando você estiver desconectado: a opção de importação do "Google Drive" e os links no rodapé (Survey, Discord, GitHub). Nenhum deles é necessário para trabalhar com PDFs. O único recurso principal que possui uma parte online é o OCR, que lê texto de páginas digitalizadas: ele já vem com o inglês instalado, e adicionar outros idiomas é a única parte que precisaria de uma conexão.

## File Browser {% #file-browser %}

Um gerenciador de arquivos baseado na web para seu NOMAD. Navegue pelas pastas, envie e baixe arquivos, crie pastas, renomeie, mova e exclua arquivos, tudo pelo navegador e sem precisar instalar nada no computador. É uma maneira prática de mover arquivos de e para o dispositivo ou organizar as coisas sem precisar usar uma linha de comando.

**Site oficial:** [filebrowser.org](https://filebrowser.org) · **Código-fonte:** [github.com/filebrowser/filebrowser](https://github.com/filebrowser/filebrowser)

**Na primeira vez que você abrir:** Você verá uma tela de login. Entre com o nome de usuário `admin` e a senha `nomad`. **Altere essa senha imediatamente.** Ela é a mesma senha padrão em todos os NOMADs, portanto, até que você a altere, qualquer pessoa na sua rede que saiba dela poderá entrar. Clique no ícone de engrenagem das configurações, abra as configurações do seu perfil e defina uma nova senha.

Diferentemente da maioria dos aplicativos daqui, o File Browser mantém seu login propositalmente. Ele pode renomear e excluir arquivos reais do seu NOMAD, portanto uma senha é a escolha certa mesmo em sua própria rede.

**O que você pode ver:** O File Browser mostra as pastas de conteúdo do seu NOMAD em um único lugar:

* **books** - e-books, incluindo qualquer conteúdo que você queira que o Calibre-Web leia
* **maps** - dados de mapas baixados
* **media** - vídeos, músicas e fotos, incluindo qualquer conteúdo que você queira que o Jellyfin disponibilize
* **zim** - conteúdo offline baixado, como a Wikipédia e outras bibliotecas de referência
* **kb_uploads** - documentos que você adicionou à Base de Conhecimento

Você pode enviar, baixar, renomear, mover e excluir arquivos dentro dessas pastas, e qualquer coisa que você colocar no nível superior também será salva. As pastas internas usadas pelos aplicativos para funcionar (como os modelos de IA, o índice de pesquisa e o cofre de senhas) são deliberadamente mantidas fora do File Browser, para que você não possa navegar até elas ou excluí-las acidentalmente.

> **Uma observação sobre exclusões:** o que você excluir aqui realmente será apagado, não existe lixeira. A maior parte do conteúdo pode ser substituída (você pode baixar novamente um mapa ou uma biblioteca da Wikipédia), mas se excluir um livro ou vídeo que você adicionou pessoalmente, essa cópia será perdida. Exclua arquivos com o mesmo cuidado que teria em seu próprio computador.

**Funciona offline:** Totalmente offline. O File Browser roda inteiramente no seu NOMAD e não acessa a internet para nada, portanto funciona exatamente da mesma forma conectado ou não.

## Calibre-Web {% #calibre-web %}

Um leitor e gerenciador de biblioteca baseado na web para sua coleção de e-books. Leia livros diretamente no navegador, organize-os por autor, série e tags e envie-os para um Kindle ou outro leitor digital. Ele funciona junto com a pasta books do seu NOMAD, portanto toda a sua biblioteca fica no dispositivo e acompanha você para onde ele for.

**Site oficial:** [github.com/janeczku/calibre-web](https://github.com/janeczku/calibre-web)

**Na primeira vez que você abrir:** O Calibre-Web precisa de uma biblioteca para apontar, e o NOMAD configura uma vazia para você durante a instalação, então você não ficará preso a um erro de configuração. Veja o procedimento inicial:

1. Abra o Calibre-Web. Ele exibirá uma tela de **Database Configuration**.
2. Na caixa **Location of Calibre Database**, digite `/books` e clique em **Save**. Você verá "Database Settings updated" e sua biblioteca (vazia) será aberta.
3. Pronto. Sua biblioteca está pronta para ser preenchida.

Se ele pedir para você fazer login em algum momento, o login padrão é `admin` / `admin123`. **Altere essa senha** depois de entrar (clique em `admin` no canto superior direito e depois em Edit). É a mesma senha padrão em todos os NOMADs.

**Adicionando livros:** O envio de arquivos pela página web está desativado por padrão. Para ativá-lo, vá até **Admin** (canto superior direito) e edite a configuração básica para permitir uploads; depois disso, aparecerá um botão Upload. Você também pode colocar arquivos de e-book diretamente na pasta books usando o File Browser e, em seguida, usar o recurso "scan" do Calibre-Web para encontrá-los.

**Seus dados:** Sua biblioteca fica na pasta `books` do seu NOMAD (a mesma `books` que você vê no File Browser). Cada livro adicionado é armazenado ali, portanto fazer backup dessa única pasta faz backup de toda a sua coleção.

**Funciona offline:** Ler e gerenciar sua biblioteca funciona totalmente offline. O único recurso que acessa a internet é "fetch metadata", que busca capas e descrições dos livros em fontes online. Essa parte não funcionará quando você estiver offline, mas isso não afeta a leitura ou organização dos livros que você já possui.

## IT Tools {% #it-tools %}

Uma coleção com mais de 100 pequenos utilitários que você normalmente teria que procurar na internet: geradores de hash, codificadores base64 e de URL, formatadores de JSON e SQL, geradores de UUID, um criador de QR Code, conversores de cores e muito mais. Tudo roda localmente no seu NOMAD, então você pode usá-lo sem conexão com a internet.

**Site oficial:** [it-tools.tech](https://it-tools.tech) · **Código-fonte:** [github.com/CorentinTh/it-tools](https://github.com/CorentinTh/it-tools)

**Na primeira vez que você abrir:** Ele abre diretamente nas ferramentas. Sem login, sem conta e sem configuração. Escolha uma ferramenta na barra lateral e use-a.

**Seus dados:** Não há nada para gerenciar. O IT Tools não armazena nada no seu NOMAD entre as sessões, portanto não existem arquivos, biblioteca para configurar ou credenciais para acompanhar. É o aplicativo mais simples do Supply Depot.

**Funciona offline:** Cada ferramenta roda diretamente no seu navegador usando a cópia presente no seu NOMAD. Nada aqui acessa a internet, então tudo continua funcionando quando você estiver offline.

## Excalidraw {% #excalidraw %}

Uma lousa virtual para criar rapidamente diagramas e esboços com aparência desenhada à mão. Desenhe caixas, setas e formas à mão livre, adicione textos e imagens e monte um fluxograma, um diagrama de rede ou uma ideia inicial em poucos segundos. Tudo tem uma aparência amigável, como se tivesse sido desenhado em um guardanapo, e roda diretamente no navegador.

**Site oficial:** [excalidraw.com](https://excalidraw.com) · **Código-fonte:** [github.com/excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)

**Na primeira vez que você abrir:** Ele abre diretamente em uma tela em branco. Sem login, sem conta e sem configuração. Escolha uma forma na barra de ferramentas e comece a desenhar. Você verá uma pequena mensagem de boas-vindas lembrando que seu trabalho é salvo no navegador, o que leva ao ponto mais importante para entender sobre o Excalidraw no NOMAD.

**Onde seus desenhos ficam (leia esta parte):** Esta versão do Excalidraw não possui armazenamento no seu NOMAD. Seu desenho é salvo dentro do navegador que você está usando, naquele dispositivo específico. Isso traz algumas consequências:

* Seu desenho **não é compartilhado entre dispositivos**. O que você desenhar no notebook não aparecerá quando abrir o Excalidraw no celular, porque cada navegador mantém sua própria cópia.
* Se você **limpar os dados do navegador** ou usar uma janela privada/anônima, o desenho será perdido. Não existe uma cópia no NOMAD para recuperar.
* Portanto, **salve seu trabalho em um arquivo.** Use o menu (canto superior esquerdo) para **Save to...** um arquivo `.excalidraw` e coloque-o em um local seguro, por exemplo, na pasta de mídia ou documentos usando o File Browser. Para continuar trabalhando nele depois, use **Open** e carregue esse arquivo. Essa é a única maneira de manter um desenho por longo prazo ou movê-lo para outro dispositivo.

**Seus dados:** Como tudo permanece no navegador, não há pastas ou credenciais do NOMAD para gerenciar no Excalidraw. Os arquivos que você salvar ficarão onde você escolher colocá-los.

**Funciona offline:** A lousa funciona offline; você pode desenhar, editar e salvar arquivos sem internet. Três coisas devem ser observadas:

* **A fonte característica de desenho à mão vem da internet.** Quando seu NOMAD estiver offline, o Excalidraw não conseguirá buscá-la e usará uma fonte simples como alternativa, então seus diagramas parecerão um pouco menos desenhados à mão. Seus desenhos não são afetados; apenas a fonte exibida na tela muda.
* **O Excalidraw envia análises de uso anônimas quando seu NOMAD está online.** Os desenvolvedores do aplicativo incluem um rastreamento básico de visualizações de página (por meio de um serviço chamado Simple Analytics) que registra que o aplicativo foi aberto. Ele não vê seus desenhos e não consegue acessar nada quando seu NOMAD está offline, mas queremos que você saiba que isso existe, já que o NOMAD foi desenvolvido para manter esse tipo de comunicação ao mínimo.
* **Alguns botões são recursos de nuvem que não funcionam no NOMAD.** "Live collaboration", "Sign up" e "Excalidraw+" apontam para o serviço online pago dos desenvolvedores e precisam de internet. Eles não fazem parte da lousa offline, então você pode ignorá-los. O mesmo vale para o navegador da **Library** de formas, que busca conteúdo de uma galeria online.

## Homebox {% #homebox %}

Um sistema de inventário doméstico para manter o controle de tudo o que você possui. Catalogue seus pertences por locais e etiquetas, adicione fotos, registre números de série, preços de compra, datas de garantia e recibos e encontre qualquer coisa usando a pesquisa. É uma ferramenta realmente útil para registros de seguro, acompanhamento de garantias e para saber o que você possui e onde está.

**Site oficial:** [homebox.software](https://homebox.software) · **Código-fonte:** [github.com/sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox)

**Na primeira vez que você abrir:** O Homebox exibirá uma tela de login, mas você ainda não possui uma conta, então deverá criar uma. Clique em **Register** e preencha:

* **seu e-mail** (usado como nome de usuário para fazer login);
* **seu nome**;
* **uma senha** (o Homebox mostra um indicador de força e não permitirá o cadastro até que a senha seja forte o suficiente, então use uma senha de verdade).

Clique em **Register** e faça login com esse e-mail e senha. A primeira conta criada será o **proprietário** deste Homebox. Não existem credenciais padrão para alterar; a conta é sua desde o início.

**Compartilhando seu NOMAD com outras pessoas?** Por padrão, o Homebox permite que qualquer pessoa que consiga acessá-lo crie sua própria conta. Isso é adequado se você estiver sozinho ou confiar em todos na sua rede. Se preferir bloqueá-lo para que ninguém mais possa se cadastrar depois que você criar sua conta:

1. Crie primeiro sua conta de proprietário (acima).
2. Na página do Supply Depot, encontre o Homebox e clique em **Manage > Edit**.
3. Em **Environment Variables**, adicione `HBOX_OPTIONS_ALLOW_REGISTRATION=false`.
4. Salve. O NOMAD reconstrói o aplicativo e o botão Register deixa de criar novas contas. Você ainda poderá fazer login normalmente.

**Seus dados:** Tudo o que o Homebox armazena fica em uma única pasta do seu NOMAD, `storage/homebox`, como um único arquivo de banco de dados (além de quaisquer fotos e recibos anexados). Fazer backup dessa única pasta faz backup de todo o seu inventário.

**Funciona offline:** Totalmente offline. O Homebox roda inteiramente no seu NOMAD, mantém todos os seus dados localmente e não possui rastreamento de uso, portanto funciona exatamente da mesma maneira com ou sem conexão. Os links no cabeçalho (GitHub, Discord e o site do projeto) precisam de internet, mas são apenas atalhos para as páginas do projeto e não têm nenhuma relação com seu inventário.

## Vaultwarden {% #vaultwarden %}

Um gerenciador de senhas privado que roda no seu próprio NOMAD. Ele é compatível com o Bitwarden, portanto você pode armazenar logins, notas seguras e dados de cartões em um cofre criptografado e usar as extensões oficiais do navegador e aplicativos de celular do Bitwarden para acessá-los, tudo apontando para seu NOMAD em vez da nuvem de outra pessoa.

**Site oficial:** [bitwarden.com](https://bitwarden.com) (para os aplicativos e extensões) · **Código-fonte:** [github.com/dani-garcia/vaultwarden](https://github.com/dani-garcia/vaultwarden)

**Na primeira vez que você abrir, verá um aviso de segurança. Isso é esperado; veja o motivo:** Um gerenciador de senhas só funcionará por meio de uma conexão segura (HTTPS), então o NOMAD configura o Vaultwarden automaticamente com HTTPS. Como seu NOMAD é seu próprio dispositivo privado e não um site público, ele usa um certificado de segurança autoassinado, e os navegadores exibem um aviso na primeira vez que encontram um. Parece preocupante, mas é normal para um dispositivo em sua própria rede. Para passar por isso uma vez:

1. Clique em **Open** no cartão do Vaultwarden. Seu navegador exibirá algo como *"Your connection is not private"* ou *"Not secure."*
2. Clique em **Advanced** e depois em **Proceed to (your NOMAD's address)**. (Em alguns navegadores, o botão aparece como "Continue" ou "Accept the Risk.")
3. Você chegará ao cofre do Vaultwarden. Seu navegador lembrará da escolha, portanto o aviso não aparecerá novamente nesse dispositivo.

**Criando seu cofre:** Na página de login, clique em **Create account** e defina seu **e-mail** e uma **senha mestra**.

> **Sua senha mestra não pode ser recuperada.** O Vaultwarden não possui e-mail de "esqueci minha senha" nem redefinição, por design, porque ele nunca vê sua senha. Se você esquecê-la, o cofre e tudo o que estiver nele ficarão bloqueados para sempre. Escolha algo forte que você não perderá e considere anotá-la em algum lugar fisicamente seguro.

**Compartilhando seu NOMAD com outras pessoas?** Por padrão, qualquer pessoa que consiga acessar o Vaultwarden pode criar sua própria conta (cada conta é separada e criptografada). Se preferir impedir que outras pessoas se cadastrem depois de configurar sua conta:

1. Crie primeiro sua própria conta.
2. Na página do Supply Depot, encontre o Vaultwarden e clique em **Manage > Edit**.
3. Em **Environment Variables**, adicione `SIGNUPS_ALLOWED=false`.
4. Salve. O NOMAD reconstrói o aplicativo e novos cadastros são desativados; as contas existentes continuam funcionando.

**Usando no celular e no navegador:** Instale o aplicativo oficial do Bitwarden ou a extensão do navegador e, na tela de login, escolha **self-hosted** (ou "Server URL") e informe `https://(your NOMAD's address):8480`. Observe que alguns aplicativos de celular são mais rigorosos com certificados autoassinados e podem se recusar a conectar; o cofre web que você abre pelo NOMAD sempre funciona.

**Seus dados:** Seu cofre criptografado fica na pasta `storage/vaultwarden` do seu NOMAD. Fazer backup dessa pasta faz backup de tudo. (O painel administrativo integrado fica desativado, a menos que você defina um token de administrador, algo de que a maioria das pessoas não precisa.)

**Funciona offline:** Totalmente offline e privado. O Vaultwarden roda inteiramente no seu NOMAD, armazena seu cofre localmente e não envia informações para nenhum servidor externo. Os aplicativos e extensões do Bitwarden também mantêm uma cópia local do seu cofre, portanto podem ler suas senhas mesmo quando o NOMAD ou seu celular estiver offline.

## Jellyfin {% #jellyfin %}

Seu próprio servidor de mídia. Aponte o Jellyfin para uma pasta de filmes, séries, músicas e fotos no seu NOMAD, e ele organiza tudo com capas e informações e transmite o conteúdo para um navegador, celular, tablet, Smart TV ou para os aplicativos do Jellyfin. É uma alternativa privada e offline aos grandes serviços de streaming para as mídias que você já possui.

**Site oficial:** [jellyfin.org](https://jellyfin.org) · **Código-fonte:** [github.com/jellyfin/jellyfin](https://github.com/jellyfin/jellyfin)

**Na primeira vez que você abrir, passará por um assistente de configuração.** São algumas telas rápidas:

1. **Idioma** - escolha o idioma de exibição e clique em Next.
2. **Crie sua conta de administrador** - informe um nome de usuário e uma senha. Essa é a conta principal que controla o servidor, portanto use uma senha real e mantenha-a guardada. (Você poderá adicionar mais usuários, incluindo usuários com acesso limitado para crianças, posteriormente pelo Dashboard.)
3. **Adicione sua mídia** - clique em **Add Media Library** e escolha um tipo de conteúdo. Para facilitar, o NOMAD já criou uma pasta correspondente para cada tipo dentro da sua pasta de mídia, então basta apontar cada biblioteca para a pasta apropriada:

   * Biblioteca **Movies** → a pasta `Movies`
   * Biblioteca **Shows** → a pasta `TV Shows`
   * Biblioteca **Music** → a pasta `Music`
   * Biblioteca **Photos** → a pasta `Photos`

   **Aponte cada biblioteca para sua própria pasta, e não para a pasta `media` inteira.** Isso é importante: se você apontar uma biblioteca para a própria pasta `media` (que contém todas as outras) e outra biblioteca para, por exemplo, `Music` dentro dela, o Jellyfin verá os mesmos arquivos duas vezes, identificará isso como um "duplicate path" e sua música silenciosamente não aparecerá. Uma pasta por biblioteca mantém tudo organizado e funcionando. Você também pode pular esta etapa e adicionar bibliotecas posteriormente pelo Dashboard.
4. **Metadados, acesso remoto, finalização** - aceite as opções padrão nas telas restantes e conclua. Depois, faça login com a conta que acabou de criar.

**Colocando sua mídia:** Coloque seus arquivos na subpasta correspondente da pasta **media** no seu NOMAD (a mesma pasta `media` que você vê no File Browser): filmes em **Movies**, séries em **TV Shows**, músicas em **Music** (uma pasta por álbum funciona muito bem) e imagens em **Photos**. O fluxo mais fácil é enviar os arquivos pelo File Browser (ou colocá-los como preferir) e depois clicar em **Scan Library** no Jellyfin para que sejam encontrados. O Jellyfin lê subpastas, portanto uma pasta inteira de álbum colocada em **Music** será adicionada como um único álbum. Ele também funciona melhor quando os arquivos possuem nomes claros (por exemplo, `Movie Name (2020).mp4`), o que ajuda a encontrar a capa e as informações corretas.

**Seus dados:** Sua mídia fica em `storage/media`. As próprias configurações do Jellyfin, contas de usuários e capas que ele baixa ficam em `storage/jellyfin`. Seus arquivos de mídia nunca são modificados; o Jellyfin apenas os lê.

**Funciona offline:** Transmitir sua própria mídia funciona totalmente offline — esse é justamente o objetivo. A única parte que usa a internet é a **busca de metadados**: quando o Jellyfin adiciona um filme ou série, ele tenta baixar uma imagem de capa, descrição e informações do elenco a partir de bancos de dados online. Offline, ele não consegue fazer isso, então os itens aparecem apenas com nomes simples e sem capas, mas continuam sendo reproduzidos normalmente. Quando você voltar a ficar online, uma verificação da biblioteca preencherá as capas que estavam faltando.

> **Uma observação sobre o desempenho da reprodução:** O Jellyfin reproduz a maioria dos arquivos sem dificuldades, mas se o formato de um vídeo não for compatível com seu dispositivo, o Jellyfin precisará convertê-lo em tempo real ("transcoding"), o que exige bastante do processador. O NOMAD não configura aceleração por placa de vídeo para isso por padrão, portanto vídeos muito grandes ou de alta resolução podem apresentar travamentos em um NOMAD mais modesto. Reproduzir arquivos em um formato amplamente compatível (como MP4/H.264) evita o transcoding e proporciona a reprodução mais fluida.

## Meshtastic Web {% #meshtastic-web %}

Um painel de controle baseado no navegador para dispositivos [Meshtastic](https://meshtastic.org). Meshtastic é um sistema de mensagens de rádio de longo alcance e fora da rede convencional: pequenos rádios LoRa baratos que formam sua própria rede mesh e enviam mensagens de texto e localizações GPS por quilômetros, sem serviço de celular, sem internet e sem tarifas. Este aplicativo permite configurar esses rádios e ler e enviar mensagens usando uma tela grande.

**Site oficial:** [meshtastic.org](https://meshtastic.org) · **Código-fonte:** [github.com/meshtastic/web](https://github.com/meshtastic/web)

**Você precisa de um rádio Meshtastic para usar este aplicativo.** Este aplicativo é apenas o painel de controle. Sozinho, ele abre em uma tela "No devices connected", porque o trabalho de fato acontece em um dispositivo Meshtastic físico (e na rede de outros rádios com os quais ele se comunica). Se você ainda não possui um, o aplicativo não fará muita coisa.

**Na primeira vez que você abrir:** Ele abre diretamente, sem login. Clique em **New Connection** e você verá três maneiras de conectar seu rádio:

* **HTTP** - conecta-se a um rádio que já esteja conectado à sua rede Wi-Fi, informando o endereço IP dele. **Este é o método que deve ser usado no NOMAD** (veja abaixo).
* **Bluetooth** - emparelha com um rádio próximo por Bluetooth.
* **Serial** - conecta-se a um rádio conectado a uma porta USB.

**A particularidade do NOMAD (Bluetooth e Serial precisam de HTTPS):** Os navegadores só permitem que um site use Bluetooth ou USB quando a página é carregada por uma conexão segura (HTTPS). O NOMAD disponibiliza o Meshtastic Web por HTTP simples, portanto, no NOMAD, as opções **Bluetooth** e **Serial** não conseguirão se conectar, pois o navegador as bloqueia. A opção que funciona é **HTTP**: conecte seu rádio Meshtastic à mesma rede Wi-Fi (os rádios Meshtastic podem se conectar ao Wi-Fi) e conecte-se a ele aqui usando seu endereço IP. Se você precisar especificamente fazer o pareamento por USB ou Bluetooth, faça isso pelo aplicativo oficial do Meshtastic para celular ou pelo site do Meshtastic.

**Seus dados:** Não há nada para configurar ou armazenar no seu NOMAD para este aplicativo. As configurações do seu rádio ficam no próprio rádio, e as preferências deste aplicativo ficam no seu navegador. Não há nenhuma pasta do NOMAD para gerenciar.

**Funciona offline:** Totalmente offline, que é justamente o objetivo do Meshtastic. O aplicativo é servido pelo seu NOMAD, e a comunicação com seus rádios acontece pela sua rede local ou pelo próprio rádio, nunca pela internet. As únicas partes online são os links no rodapé (Vercel, legal), que não fazem diferença para usar sua rede mesh.

## Plataforma de Educação (Kolibri) {% #kolibri %}

Uma plataforma completa de aprendizado offline da Learning Equality. O Kolibri reúne aulas em vídeo, exercícios e leituras em canais estruturados, organiza-os em turmas e lições, acompanha o progresso dos alunos e funciona inteiramente no seu NOMAD sem internet. Ele foi desenvolvido para escolas e alunos em locais com pouca ou nenhuma conectividade.

**Site oficial:** [learningequality.org/kolibri](https://learningequality.org/kolibri) · **Código-fonte:** [github.com/learningequality/kolibri](https://github.com/learningequality/kolibri)

**Na primeira vez que você abrir, passará por um rápido assistente de configuração.** Escolha o tipo da sua instituição e crie a **conta de administrador** (este é o superusuário que gerencia todo o dispositivo, portanto use uma senha real e mantenha-a guardada). Depois de entrar, você importa o conteúdo educacional como **canais**.

**Importando conteúdo:** O conteúdo do Kolibri é distribuído como canais que você importa. Abra **Device → Channels → Import** e escolha entre obter canais do Kolibri Studio (online) ou importar de uma unidade local ou de outro dispositivo Kolibri caso você já tenha os arquivos de conteúdo. Há muito conteúdo disponível, portanto importe apenas os canais necessários; eles podem ser grandes.

**Migrando conteúdo da Plataforma de Educação (Gen 1):** As versões anteriores do NOMAD incluíam uma versão muito mais antiga do Kolibri (a imagem `treehouses/kolibri:0.12.8`). A Plataforma de Educação "Gen 2" é uma versão mais nova e oficial do Kolibri e é instalada **do zero** — seus canais antigos e dados dos alunos **não são transferidos automaticamente**, porque as duas versões armazenam os dados de maneiras muito diferentes para que uma migração segura seja possível. Se você estava usando a versão antiga e deseja importar seus canais existentes para a nova, siga este processo:

1. Instale a "Education Platform (Gen 2)" pelo catálogo (ela funciona junto com a antiga em uma porta diferente, portanto nada é interrompido enquanto você a configura).
2. Inicie a nova versão, siga o assistente de configuração e, no menu lateral, navegue até **Device > Channels > Import**. Escolha a opção "Local network or internet" e depois "Add new device". Na janela exibida, informe o endereço IP do seu NOMAD com a porta da antiga Education Platform (8300 por padrão, por exemplo, `http://192.168.1.36:8300`), dê um nome a ela (qualquer nome que desejar), clique em "Add" e depois em "Continue".
3. Agora você pode selecionar canais individuais da antiga Education Platform ou escolher "Select entire channels instead" para importar tudo de uma vez. Clique em "Import" quando estiver pronto e a transferência começará.
4. Quando estiver satisfeito com a nova instalação e tiver copiado o conteúdo necessário, desinstale a antiga Education Platform pelo cartão dela (ela possui um indicador **legacy**). Também é recomendado escolher a remoção da imagem e do volume de dados antigos ao desinstalar para evitar confusão e liberar espaço, mas se quiser mantê-la por algum tempo, apenas por segurança, não há problema.

**Seus dados:** Seus canais importados, turmas e progresso dos alunos ficam na pasta `storage/kolibri-gen2` do seu NOMAD. Fazer backup dessa pasta faz backup de todo o seu Kolibri.

**Funciona offline:** Totalmente offline depois que o conteúdo for importado — é para isso que o Kolibri existe. A única etapa que usa a internet é importar canais do Kolibri Studio; depois disso, navegar pelas lições, fazer exercícios e acompanhar o progresso funciona inteiramente no seu NOMAD.

## MeshCore Web {% #meshcore-web %}

Um cliente baseado no navegador para rádios [MeshCore](https://meshcore.io). MeshCore é outra opção de comunicação mesh LoRa de longo alcance e fora da rede convencional, semelhante ao Meshtastic: pequenos rádios que formam sua própria rede e transmitem textos e localização por quilômetros, sem serviço de celular, sem internet e sem tarifas. Este aplicativo permite configurar um rádio MeshCore e ler e enviar mensagens usando uma tela grande. Se você ainda não utiliza equipamentos MeshCore, o cliente Meshtastic acima é o ponto de partida mais comum. Este está aqui para quem utiliza MeshCore.

**Site oficial:** [meshcore.io](https://meshcore.io) · **Código-fonte:** [github.com/aXistem-dev/meshcore-web](https://github.com/aXistem-dev/meshcore-web) (uma versão empacotada do cliente MeshCore de Liam Cottle)

**Você precisa de um rádio MeshCore para usar este aplicativo.** Assim como o cliente Meshtastic, este é apenas o painel de controle. Sem um rádio conectado, não há nada com que ele possa se comunicar.

**Na primeira vez que você abrir, verá um aviso de segurança. Isso é esperado; veja o motivo:** O MeshCore se conecta ao seu rádio por USB ou Bluetooth, e os navegadores só permitem que uma página use USB ou Bluetooth quando ela é carregada por uma conexão segura (HTTPS). Por isso, o NOMAD disponibiliza este aplicativo por HTTPS e, como seu NOMAD é um dispositivo privado sem um endereço web público, ele utiliza um certificado autoassinado que os navegadores avisam na primeira vez que o encontram. Para passar por isso uma vez:

1. Clique em **Open** no cartão do MeshCore Web. Seu navegador exibirá algo como *"Your connection is not private"* ou *"Not secure."*
2. Clique em **Advanced** e depois em **Proceed to (your NOMAD's address)**. (Em alguns navegadores, o botão aparece como "Continue" ou "Accept the Risk.")
3. Você chegará ao MeshCore Web. Seu navegador lembrará da escolha, portanto o aviso não aparecerá novamente nesse dispositivo.

**Conectando seu rádio:** Use **Chrome** ou **Edge**, que possuem o melhor suporte para USB e Bluetooth no navegador. Conecte o rádio ao computador que você está usando para navegar (USB) ou mantenha-o próximo (Bluetooth) e conecte-o de dentro do aplicativo. O rádio se conecta **ao computador que você está usando**, não ao próprio NOMAD, portanto conecte-se a partir de um dispositivo que tenha o rádio conectado ou esteja dentro do alcance do Bluetooth. Alguns celulares são mais rigorosos com certificados autoassinados e podem se recusar a conectar; um computador desktop com Chrome ou Edge é a opção mais confiável.

**Seus dados:** Não há nada para configurar ou armazenar no seu NOMAD para este aplicativo. As configurações do seu rádio ficam no próprio rádio, e as preferências do aplicativo ficam no seu navegador. Não há nenhuma pasta do NOMAD para gerenciar.

**Funciona offline:** Totalmente offline, que é justamente o objetivo do MeshCore. O aplicativo é servido pelo seu NOMAD e se comunica diretamente com seu rádio por USB ou Bluetooth, nunca pela internet.
