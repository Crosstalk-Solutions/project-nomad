# Referência de Medicamentos

A Referência de Medicamentos é um banco de dados offline e pesquisável de **bulas de medicamentos da FDA**, contendo as informações oficiais que acompanham medicamentos de venda livre e de prescrição. Depois de instalada, você pode pesquisar um medicamento pelo nome, partir de uma situação para encontrar os medicamentos indicados para tratá-la e colocar duas bulas lado a lado, tudo sem conexão com a internet.

É um complemento opcional. Uma instalação nova do NOMAD não o possui até que você escolha instalá-lo, pois o conjunto de dados é grande.

> **Estas são informações de saúde, não aconselhamento médico.** A Referência de Medicamentos exibe o texto da bula da FDA fornecido pelo fabricante e relaciona situações a opções de medicamentos de venda livre. Ela não substitui um médico, farmacêutico ou enfermeiro. Sempre siga as instruções do produto que você possui e, em uma emergência real, procure ajuda profissional se possível.

Na primeira vez que você abrir a Referência de Medicamentos em um navegador, verá este aviso em uma caixa de diálogo que deverá ser reconhecida antes que a página seja carregada. Essa confirmação é lembrada por navegador, portanto, outro navegador ou dispositivo exibirá o aviso novamente.

---

## Instalando

Há duas maneiras de obter os dados, e ambas os colocam no mesmo local.

**Pelo Explorador de Conteúdo**, como parte de uma coleção:

1. Na tela inicial, abra o **Explorador de Conteúdo**.
2. Escolha a categoria **Medicina**.
3. Selecione o nível **Padrão**. O conteúdo está listado no cartão, e você verá **Referência de Medicamentos da FDA** entre eles.
4. Confirme o download.

**Pela própria página da Referência de Medicamentos.** Abra **Referência de Medicamentos** na tela inicial. Se nenhum dado estiver instalado, você verá um painel "Ainda não há dados de medicamentos da FDA" com o botão **Baixar dados de medicamentos da FDA**, que inicia o mesmo processo.

De qualquer maneira, o processo ocorre em duas etapas em segundo plano:

* **Download** — O NOMAD baixa o conjunto de dados de bulas de medicamentos do openFDA, com cerca de **1,7 GB** compactados, dividido em várias partes. Se sua conexão cair, o download continua de onde parou.
* **Indexação** — O NOMAD importa essas bulas para um banco de dados de pesquisa offline rápido. Esta é a etapa mais demorada, e os dados ocupam aproximadamente **8 a 10 GB** no disco.

Você não precisa ficar acompanhando o processo. Pode sair da página e ele continuará em execução; a pesquisa será ativada automaticamente quando a indexação terminar. A página mostra o progresso das duas etapas enquanto elas estão em andamento.

---

## Como navegar

Tudo fica disponível por meio de um único bloco **Referência de Medicamentos** na tela inicial. Depois que os dados forem instalados, a página terá três abas.

### Pesquisar por medicamento

Digite o nome de um medicamento, marca ou princípio ativo, e o NOMAD mostrará as bulas da FDA correspondentes: para que o medicamento é utilizado, dosagem, advertências e ingredientes, diretamente da bula oficial fornecida pelo fabricante.

Os resultados são **agrupados por princípio ativo**, em vez de serem listados como centenas de produtos quase idênticos. Uma pesquisa por um analgésico comum, por exemplo, retorna um grupo para cada princípio ativo, em vez de mostrar separadamente cada marca comercial, permitindo que você veja o que realmente está escolhendo.

### Por situação

Comece pelo problema em vez do produto. Selecione uma ou mais situações, como queimadura, febre ou diarreia, e o NOMAD listará os medicamentos cujas bulas da FDA abrangem essas situações.

Ao selecionar mais de uma situação, o sistema primeiro procura medicamentos que atendam a **todas** elas e, depois, mostra os resultados de cada situação separadamente. Isso é útil quando você está lidando com mais de um sintoma ao mesmo tempo e quer encontrar um único produto, caso exista um.

### Dados da FDA

Mostra a origem dos dados e seu estado atual: se foram baixados, indexados e quantas bulas estão carregadas. Também é nessa seção que você pode executar novamente um download ou reiniciar a indexação caso seja necessário.

---

## Comparando dois medicamentos

Na página de detalhes de um medicamento, use **Comparar advertências das bulas** para colocar duas bulas lado a lado e ler o que cada uma informa.

Isso coloca as seções de advertências dos dois fabricantes lado a lado. **Não** calcula interações medicamentosas e não informa se uma combinação é segura. Decidir se dois medicamentos podem ser tomados juntos é exatamente o tipo de questão que deve ser direcionada a um farmacêutico ou médico.

---

## Mantendo os dados atualizados

As bulas da FDA mudam com o tempo. Se você ativou as **atualizações automáticas de conteúdo** (Configurações → Atualizações), o NOMAD verifica periodicamente se o openFDA publicou um conjunto de dados mais recente e atualiza a Referência de Medicamentos automaticamente, da mesma forma que faz com os outros conteúdos offline.

Com as atualizações automáticas desativadas, os dados permanecem exatamente como estavam quando você os instalou, o que é adequado para uso offline. Você pode executar novamente o download a qualquer momento pela aba **Dados da FDA** para obter a versão mais recente.

---

## Uma observação sobre armazenamento

A Referência de Medicamentos é o maior item individual da coleção Medicina → Padrão. Reserve aproximadamente **8 a 10 GB** de espaço em disco para ela após a indexação, além dos 1,7 GB necessários para o download.

Se o espaço de armazenamento estiver limitado, o Explorador de Conteúdo mostra o tamanho total de um nível antes de você confirmar, permitindo visualizar quanto espaço será necessário.
