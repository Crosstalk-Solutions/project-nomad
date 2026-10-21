
/* eslint-disable */
/**
 * ARQUIVO GERADO — NÃO EDITAR.
 *
 * Fonte única da verdade: collections/natural_remedies.json
 * Gere novamente após editar o JSON: `npm run gen:curated-data` (a partir de admin/).
 * curated_data_sync.standalone.ts faz a CI falhar se este arquivo divergir do JSON.
 *
 * Subconjunto selecionado manualmente de "Herbs at a Glance" do NCCIH (nccih.nih.gov),
 * mapeado para a estrutura de condições. Domínio público / governo dos EUA; a atribuição
 * da fonte está no campo `source` do arquivo e na observação exibida pela interface.
 */
import type { NaturalRemediesFile } from '../../types/conditions.js'

export const NATURAL_REMEDIES_FILE: NaturalRemediesFile = {
  "version": "2026-06-10",
  "source": {
    "name": "NCCIH — Ervas em Destaque",
    "url": "https://www.nccih.nih.gov/health/herbsataglance",
    "license": "Domínio público (obra do governo dos EUA; NCCIH)"
  },
  "remedies": [
    {
      "slug": "aloe-vera",
      "name": "Babosa",
      "commonNames": [
        "Aloe barbadensis miller"
      ],
      "conditions": [
        "burns",
        "acne",
        "dry-skin"
      ],
      "uses": "O gel de babosa é aplicado topicamente para queimaduras, acne e diversas condições de pele, incluindo psoríase e danos cutâneos relacionados à radiação. O uso oral é promovido para problemas digestivos, embora as aplicações tópicas tenham maior respaldo em pesquisas.",
      "how": "Aplique o gel da parte interna da folha da babosa (ou um gel de babosa preparado comercialmente) diretamente na área afetada da pele. O uso tópico é a aplicação com maior respaldo científico; produtos de babosa para uso oral apresentam riscos mais graves e não devem ser utilizados sem consultar um profissional de saúde.",
      "evidence": "Pesquisas sugerem que o gel tópico de babosa pode acelerar a cicatrização de queimaduras e reduzir a dor relacionada a elas. Dois pequenos estudos indicam que o gel de babosa, combinado com outros tratamentos, pode melhorar a acne; as evidências para outros usos na pele são limitadas.",
      "cautions": "O uso tópico geralmente é bem tolerado, embora possam ocorrer ocasionalmente ardência ou coceira. O uso oral apresenta riscos mais graves: o látex da planta pode causar dor abdominal e diarreia, extratos orais foram associados a casos de hepatite aguda e estudos em animais relacionaram extratos não descoloridos ao câncer gastrointestinal. O uso provavelmente não é seguro durante a gravidez; pode interagir com medicamentos, como a digoxina.",
      "sourceUrl": "https://www.nccih.nih.gov/health/aloe-vera"
    },
    {
      "slug": "boswellia",
      "name": "Boswellia",
      "commonNames": [
        "Boswellia serrata",
        "Indian frankincense"
      ],
      "conditions": [
        "muscle-joint-pain"
      ],
      "uses": "O extrato da resina de boswellia é tradicionalmente utilizado para reduzir a inflamação e a dor, sendo promovido como suplemento alimentar para favorecer a saúde e a mobilidade das articulações, especialmente em casos de osteoartrite.",
      "how": "A boswellia é ingerida por via oral como suplemento alimentar. Ensaios clínicos utilizaram doses de até 1.000 mg por dia durante períodos de até 6 meses; siga as instruções do rótulo e consulte um profissional de saúde antes de começar a utilizá-la.",
      "evidence": "Alguns estudos sugerem que a boswellia oral pode ajudar a reduzir a inflamação e a dor associadas à osteoartrite, mas são necessários ensaios maiores e mais rigorosos; não há evidências suficientes sobre a eficácia do uso tópico.",
      "cautions": "Extratos em doses de até 1.000 mg por dia foram utilizados com segurança em ensaios clínicos com duração de até 6 meses. Consulte um profissional de saúde antes de utilizar o produto, especialmente se estiver grávida, amamentando, tratando asma ou tomando medicamentos, pois as possíveis interações ainda não estão bem esclarecidas.",
      "sourceUrl": "https://www.nccih.nih.gov/health/boswellia"
    },
    {
      "slug": "bromelain",
      "name": "Bromelina",
      "commonNames": [
        "pineapple enzyme",
        "Ananas comosus extract"
      ],
      "conditions": [
        "muscle-joint-pain",
        "nasal-congestion"
      ],
      "uses": "A bromelina, uma enzima extraída do abacaxi, é promovida para reduzir a dor e o inchaço após cirurgias, tratar sinusite e osteoartrite e aliviar dores musculares provocadas por exercícios. Uma formulação tópica foi aprovada pela FDA para o desbridamento de queimaduras graves.",
      "evidence": "Alguns estudos sugerem que a bromelina oral pode reduzir determinados sintomas após a cirurgia de extração dos dentes do siso; as evidências para sinusite são insuficientes. A formulação tópica tem sido utilizada com sucesso por profissionais de saúde no desbridamento de queimaduras como alternativa ao procedimento cirúrgico.",
      "cautions": "A bromelina oral geralmente é bem tolerada; os efeitos colaterais mais comuns são desconforto estomacal e diarreia. Converse com um profissional de saúde antes de utilizá-la junto com medicamentos, pois podem ocorrer interações prejudiciais. A segurança durante a gravidez e a amamentação não está esclarecida.",
      "sourceUrl": "https://www.nccih.nih.gov/health/bromelain"
    },
    {
      "slug": "butterbur",
      "name": "Petasites",
      "commonNames": [
        "Petasites hybridus"
      ],
      "conditions": [
        "headache",
        "allergic-reaction"
      ],
      "uses": "O extrato da raiz de petasites é utilizado na prevenção da enxaqueca e na redução dos sintomas da rinite alérgica (febre do feno). A planta foi estudada para reduzir a frequência das crises de enxaqueca em adultos e crianças.",
      "how": "O petasites é ingerido por via oral como extrato da raiz para prevenir a enxaqueca ou como extrato das folhas para aliviar os sintomas da rinite alérgica. Utilize somente produtos certificados e identificados como livres de alcaloides pirrolizidínicos (PA-free), pois a planta não tratada contém compostos capazes de causar danos ao fígado.",
      "evidence": "Estudos de um extrato da raiz de petasites sugerem que ele pode reduzir a frequência das crises de enxaqueca; um extrato das folhas pode ajudar a aliviar os sintomas da rinite alérgica. Entretanto, a Academia Americana de Neurologia retirou, em 2015, sua recomendação de 2012 devido a preocupações com a segurança.",
      "cautions": "A planta contém naturalmente alcaloides pirrolizidínicos (APs), que podem causar danos ao fígado e aos pulmões e aumentar o risco de câncer; somente produtos certificados e livres desses compostos devem ser utilizados. Mesmo produtos sem APs foram associados a casos raros de lesão hepática. Os efeitos colaterais incluem arrotos, diarreia, sonolência, erupções cutâneas e desconforto estomacal. Evite durante a gravidez; pessoas alérgicas à ambrósia ou a plantas relacionadas apresentam maior risco de reações.",
      "sourceUrl": "https://www.nccih.nih.gov/health/butterbur"
    },
    {
      "slug": "chamomile",
      "name": "Camomila",
      "commonNames": [
        "Matricaria chamomilla",
        "German chamomile",
        "Chamaemelum nobile"
      ],
      "conditions": [
        "sleeplessness",
        "indigestion",
        "common-cold",
        "sore-throat",
        "skin-rash-itch"
      ],
      "uses": "A camomila é promovida para insônia, indigestão, ansiedade, resfriado comum e cólicas em bebês. Também é utilizada topicamente para problemas de pele e como enxaguante bucal para inflamações na boca.",
      "how": "A camomila é comumente consumida como chá (considerado seguro nas quantidades normalmente encontradas nessas bebidas), ingerida como suplemento oral, aplicada topicamente na pele ou utilizada como enxaguante bucal para inflamações na boca. Consulte um profissional de saúde antes de utilizar suplementos orais em vez do chá.",
      "evidence": "As evidências são limitadas: alguns estudos preliminares sugerem que suplementos de camomila podem ajudar com a ansiedade, e produtos combinados podem ajudar no tratamento da diarreia infantil e das cólicas em bebês. Uma revisão de 2019 encontrou poucas evidências para o tratamento da insônia, com um estudo que não demonstrou benefícios. As evidências em pessoas para o uso contra resfriados, dor de garganta e problemas de pele são insuficientes.",
      "cautions": "Geralmente é considerada segura nas quantidades habituais. Os efeitos colaterais podem incluir náusea, tontura e reações alérgicas, inclusive hipersensibilidade grave; o risco é maior para pessoas sensíveis à ambrósia, crisântemos, calêndulas ou margaridas. Pode interagir com anticoagulantes, pílulas anticoncepcionais, sedativos e medicamentos metabolizados pelo fígado. A segurança durante a gravidez e a amamentação é desconhecida.",
      "sourceUrl": "https://www.nccih.nih.gov/health/chamomile"
    },
    {
      "slug": "echinacea",
      "name": "Equinácea",
      "commonNames": [
        "Echinacea purpurea",
        "purple coneflower"
      ],
      "conditions": [
        "common-cold"
      ],
      "uses": "A equinácea é comercializada principalmente para o resfriado comum e infecções do trato respiratório superior, com base na ideia de que pode favorecer o funcionamento do sistema imunológico.",
      "evidence": "Estudos indicam que o uso de equinácea pode reduzir ligeiramente as chances de contrair um resfriado, embora as evidências sobre a redução da duração dos sintomas sejam inconclusivas. As evidências para outras condições, incluindo eczema, não são claras.",
      "cautions": "Os extratos de E. purpurea parecem ser seguros para adultos quando utilizados por períodos curtos; podem ocorrer reações alérgicas, sendo os sintomas digestivos os mais comuns. Crianças podem apresentar erupções cutâneas possivelmente relacionadas a reações alérgicas. Existem possíveis interações teóricas com imunossupressores e determinados outros medicamentos; consulte um profissional de saúde antes de utilizá-la junto com medicamentos. Há poucos dados sobre a segurança no início da gravidez.",
      "sourceUrl": "https://www.nccih.nih.gov/health/echinacea"
    },
    {
      "slug": "elderberry",
      "name": "Sabugueiro",
      "commonNames": [
        "Sambucus nigra"
      ],
      "conditions": [
        "common-cold"
      ],
      "uses": "O sabugueiro é utilizado na medicina popular para tratar resfriados e gripe e é promovido como suplemento alimentar para resfriados, gripe e outras infecções do trato respiratório superior.",
      "how": "O sabugueiro deve ser utilizado na forma de suplemento alimentar preparado (xarope, cápsula ou pastilha), e não como fruto cru. Nunca consuma sabugueiros crus ou verdes: eles contêm substâncias que liberam cianeto e podem causar náuseas, vômitos e diarreia grave. O cozimento dos frutos elimina essa toxina.",
      "evidence": "Um pequeno número de estudos sugere que o sabugueiro pode aliviar sintomas de gripe, resfriados ou outras infecções do trato respiratório superior; entretanto, as evidências gerais são limitadas e insuficientes para a maioria dos outros benefícios alegados.",
      "cautions": "Sabugueiros crus ou verdes contêm substâncias que liberam cianeto e podem causar náuseas, vômitos e diarreia grave; o cozimento elimina essa toxina. Consulte um profissional de saúde antes de utilizar o produto, especialmente se estiver tomando medicamentos. Há poucos dados sobre a segurança durante a gravidez e a amamentação.",
      "sourceUrl": "https://www.nccih.nih.gov/health/elderberry"
    },
    {
      "slug": "feverfew",
      "name": "Tanaceto",
      "commonNames": [
        "Tanacetum parthenium"
      ],
      "conditions": [
        "headache"
      ],
      "uses": "O tanaceto é promovido para prevenir enxaquecas e aliviar dores leves na cabeça e dores tensionais. Também é comercializado para aplicação tópica contra coceira e irritação da pele.",
      "evidence": "Uma revisão sistemática de 2020, que analisou sete estudos sobre enxaqueca, encontrou resultados inconsistentes, embora algumas evidências sugiram que o tanaceto pode reduzir a frequência das crises e sintomas associados, como náusea e sensibilidade à luz. Há poucas evidências ou nenhuma evidência que sustente seu uso para outras condições de saúde.",
      "cautions": "Os efeitos colaterais incluem náusea, problemas digestivos, inchaço abdominal e feridas na boca ao mastigar folhas frescas. Pessoas sensíveis à ambrósia podem apresentar reações alérgicas. O tanaceto pode retardar a coagulação sanguínea e deve ser suspenso pelo menos duas semanas antes de uma cirurgia programada. Pode interagir com medicamentos para enxaqueca e deve ser evitado durante a gravidez devido aos possíveis efeitos sobre as contrações uterinas.",
      "sourceUrl": "https://www.nccih.nih.gov/health/feverfew"
    },
    {
      "slug": "ginger",
      "name": "Gengibre",
      "commonNames": [
        "Zingiber officinale"
      ],
      "conditions": [
        "nausea-vomiting",
        "menstrual-cramps",
        "indigestion"
      ],
      "uses": "O gengibre é tradicionalmente utilizado e comumente consumido para aliviar náuseas, vômitos, indigestão, cólicas menstruais e sintomas da osteoartrite.",
      "evidence": "Pesquisas mostram que o gengibre pode ser útil para náuseas e vômitos associados à gravidez. Estudos sugerem que suplementos alimentares de gengibre podem ajudar a reduzir a intensidade das cólicas menstruais e os sintomas da osteoartrite do joelho; sua eficácia contra náuseas relacionadas à quimioterapia ou a cirurgias permanece incerta.",
      "cautions": "Os efeitos colaterais do uso oral incluem desconforto abdominal, azia, diarreia e irritação da boca e da garganta. Existem possíveis interações com medicamentos; consulte um profissional de saúde antes de utilizá-lo, especialmente durante a gravidez ou a amamentação.",
      "sourceUrl": "https://www.nccih.nih.gov/health/ginger"
    },
    {
      "slug": "goldenseal",
      "name": "Hidraste",
      "commonNames": [
        "Hydrastis canadensis"
      ],
      "conditions": [
        "common-cold",
        "diarrhea",
        "wounds-cuts"
      ],
      "uses": "O hidraste é comercializado para resfriados comuns, infecções do trato respiratório superior, diarreia, constipação e outros problemas digestivos. Historicamente, povos indígenas norte-americanos o utilizavam para distúrbios digestivos, feridas e problemas de pele.",
      "evidence": "Não há evidências suficientes para determinar se o hidraste é útil para qualquer condição de saúde; não foram realizados estudos rigorosos em seres humanos. Uma quantidade muito pequena do composto ativo berberina é absorvida quando o hidraste é ingerido por via oral, o que significa que os resultados de estudos sobre a berberina podem não ser aplicáveis ao hidraste.",
      "cautions": "O uso por curto prazo, em aproximadamente 3 gramas por dia, parece não causar efeitos adversos graves, embora a segurança do uso prolongado seja incerta. O hidraste afeta significativamente o metabolismo de medicamentos; um estudo constatou que ele reduziu os níveis de metformina em cerca de 25%. Alguns produtos comerciais contêm ingredientes não declarados ou substituem a erva por outras plantas. Evite durante a gravidez, a amamentação e em bebês devido aos possíveis danos causados pela berberina.",
      "sourceUrl": "https://www.nccih.nih.gov/health/goldenseal"
    },
    {
      "slug": "horse-chestnut",
      "name": "Castanha-da-índia",
      "commonNames": [
        "Aesculus hippocastanum"
      ],
      "conditions": [
        "hemorrhoids"
      ],
      "uses": "O extrato das sementes da castanha-da-índia é promovido para tratar a insuficiência venosa crônica (dor e inchaço nas pernas decorrentes da má circulação) e, historicamente, foi utilizado para hemorroidas, artrite e cólicas menstruais.",
      "how": "Utilize somente extratos padronizados das sementes da castanha-da-índia, comercializados como suplementos alimentares. Nunca ingira sementes, cascas, flores ou folhas cruas, pois são tóxicas quando consumidas por via oral. Pesquisas utilizaram extratos padronizados por períodos de até 12 semanas; siga as instruções do rótulo e consulte um profissional de saúde antes de utilizá-los.",
      "evidence": "Uma revisão sistemática de 2012 constatou que o extrato das sementes da castanha-da-índia pode melhorar os sintomas da insuficiência venosa crônica, com resultados comparáveis aos das meias de compressão em um estudo; entretanto, são necessários ensaios mais rigorosos. As evidências para outros usos, incluindo hemorroidas, são insuficientes.",
      "cautions": "Sementes, cascas, flores e folhas cruas não são seguras para ingestão devido à presença de componentes tóxicos. Somente extratos padronizados dos quais a toxina foi removida devem ser utilizados; pesquisas indicam segurança por até 12 semanas. Os efeitos colaterais incluem tontura, desconforto digestivo, dor de cabeça e coceira. A segurança durante a gravidez e a amamentação é desconhecida; consulte um profissional de saúde antes de utilizar o produto.",
      "sourceUrl": "https://www.nccih.nih.gov/health/horse-chestnut"
    },
    {
      "slug": "lavender",
      "name": "Lavanda",
      "commonNames": [
        "Lavandula angustifolia"
      ],
      "conditions": [
        "sleeplessness"
      ],
      "uses": "A lavanda é promovida como suplemento oral e recurso de aromaterapia para acalmar a ansiedade, o estresse e as dificuldades para dormir. Também é utilizada topicamente e na aromaterapia para sintomas de depressão e dores.",
      "how": "A lavanda pode ser utilizada como suplemento oral (cápsula ou chá), como óleo de aromaterapia (inalado ou difundido no ambiente) ou aplicada topicamente na pele. Produtos de óleo de lavanda para uso oral foram estudados para a ansiedade; a aromaterapia envolve inalar o aroma de um difusor ou de algumas gotas aplicadas em um tecido.",
      "evidence": "Estudos sugerem que o óleo de lavanda por via oral pode ser benéfico para a ansiedade, inclusive quando acompanhada de depressão. As evidências para melhorar o sono são insuficientes, e não está claro se a aromaterapia com lavanda beneficia a ansiedade, o estresse ou a depressão.",
      "cautions": "Produtos orais de lavanda podem causar diarreia, dor de cabeça, náusea ou arrotos. A aplicação tópica pode provocar reações alérgicas na pele. Possíveis interações com medicamentos sedativos devem ser discutidas com um profissional de saúde. A segurança durante a gravidez e a amamentação é desconhecida.",
      "sourceUrl": "https://www.nccih.nih.gov/health/lavender"
    },
    {
      "slug": "licorice-root",
      "name": "Raiz de alcaçuz",
      "commonNames": [
        "Glycyrrhiza glabra"
      ],
      "conditions": [
        "canker-sores",
        "sore-throat",
        "burns",
        "skin-rash-itch"
      ],
      "uses": "A raiz de alcaçuz é promovida para auxiliar a saúde digestiva e respiratória e é utilizada topicamente para problemas de pele. As pesquisas se concentraram em enxaguantes bucais para aftas, gargarejos ou pastilhas para prevenir dor de garganta e géis tópicos para eczema e cicatrização de queimaduras.",
      "how": "Para aftas, o alcaçuz é utilizado como enxaguante bucal ou gargarejo; para prevenir dor de garganta relacionada a cirurgias, como gargarejo ou pastilha; e para eczema ou cicatrização de queimaduras, como gel aplicado diretamente na pele. Evite o uso oral prolongado ou em doses elevadas devido aos riscos cardiovasculares graves.",
      "evidence": "Estudos preliminares sugerem que enxaguantes bucais de alcaçuz podem reduzir a dor e o tamanho das aftas, e que pastilhas ou gargarejos podem prevenir a dor de garganta após a intubação cirúrgica. Géis tópicos apresentam resultados promissores para sintomas de eczema e cicatrização de queimaduras, embora sejam necessárias mais pesquisas. Não existem evidências de alta qualidade suficientes para sustentar seu uso na maioria das condições.",
      "cautions": "O alcaçuz contém glicirrizina, que pode causar efeitos adversos graves, incluindo batimentos cardíacos irregulares e parada cardíaca, especialmente com o uso prolongado ou em doses elevadas. Mesmo pequenas quantidades podem ser arriscadas para pessoas com pressão alta, consumo elevado de sal ou problemas cardíacos ou renais. O consumo de grandes quantidades durante a gravidez aumenta o risco de aborto espontâneo e é considerado inseguro. Foram documentadas interações com corticosteroides; consulte um profissional de saúde antes de utilizar o produto.",
      "sourceUrl": "https://www.nccih.nih.gov/health/licorice-root"
    },
    {
      "slug": "passionflower",
      "name": "Maracujá",
      "commonNames": [
        "Passiflora incarnata"
      ],
      "conditions": [
        "sleeplessness"
      ],
      "uses": "O maracujá é comercializado como suplemento alimentar para ansiedade, problemas de sono e estresse.",
      "how": "O maracujá pode ser consumido como chá (estudado por até 7 noites) ou como extrato oral em suplemento (estudado por até 8 semanas). Siga as instruções da embalagem e consulte um profissional de saúde antes de utilizá-lo, especialmente se estiver tomando outros medicamentos ou tiver uma cirurgia programada.",
      "evidence": "Algumas pesquisas sugerem que o maracujá por via oral pode ajudar a reduzir os sintomas de ansiedade e aumentar o tempo total de sono em adultos com insônia, embora os resultados sobre adormecer ou permanecer dormindo sejam variados e as conclusões não sejam definitivas.",
      "cautions": "O uso do maracujá junto com anestésicos ou outros medicamentos utilizados em cirurgias pode desacelerar excessivamente o sistema nervoso; evite utilizá-lo antes de cirurgias. Não deve ser utilizado durante a gravidez, pois pode provocar contrações uterinas. Os possíveis efeitos colaterais incluem sonolência, tontura e confusão. Converse com um profissional de saúde antes de combiná-lo com medicamentos.",
      "sourceUrl": "https://www.nccih.nih.gov/health/passionflower"
    },
    {
      "slug": "peppermint-oil",
      "name": "Óleo de hortelã-pimenta",
      "commonNames": [
        "Mentha x piperita"
      ],
      "conditions": [
        "headache",
        "nausea-vomiting",
        "indigestion"
      ],
      "uses": "O óleo de hortelã-pimenta é promovido para a síndrome do intestino irritável, indigestão, dores de cabeça, tensão muscular e náuseas. A aplicação tópica é utilizada para dores de cabeça tensionais, enquanto a inalação do óleo é utilizada para aliviar náuseas.",
      "how": "Para a síndrome do intestino irritável, o óleo de hortelã-pimenta é ingerido em cápsulas com revestimento entérico, que reduzem a azia em comparação com cápsulas comuns. Para dores de cabeça tensionais, aplique o óleo topicamente na pele. Para náuseas, utilize o óleo por inalação na aromaterapia.",
      "evidence": "Uma revisão de 2022 constatou que o óleo de hortelã-pimenta foi mais eficaz do que o placebo para melhorar os sintomas gerais da síndrome do intestino irritável e a dor abdominal. Uma revisão de 2024 concluiu que a inalação do óleo foi particularmente eficaz na redução de náuseas e vômitos em pacientes com câncer. As evidências sugerem possíveis benefícios para dores de cabeça tensionais quando aplicado topicamente, embora o óleo ingerido isoladamente possa piorar a indigestão em algumas pessoas.",
      "cautions": "Os efeitos colaterais do uso oral podem incluir azia, náusea, dor abdominal e boca seca; cápsulas com revestimento entérico reduzem o risco de azia. Nunca aplique o produto topicamente no rosto de bebês ou crianças pequenas, pois o mentol pode afetar a respiração. O uso tópico pode causar irritação na pele. Consulte um profissional de saúde antes de utilizá-lo junto com medicamentos, pois podem ocorrer interações.",
      "sourceUrl": "https://www.nccih.nih.gov/health/peppermint-oil"
    },
    {
      "slug": "tea-tree-oil",
      "name": "Óleo de melaleuca",
      "commonNames": [
        "Melaleuca alternifolia"
      ],
      "conditions": [
        "fungal-infection",
        "acne",
        "wounds-cuts",
        "insect-bites-stings",
        "burns"
      ],
      "uses": "O óleo de melaleuca é comercializado para uso externo, inclusive para acne, pé de atleta, fungos nas unhas dos pés e piolhos. Entre os usos tradicionais dos povos aborígenes estavam o tratamento de feridas, queimaduras e picadas de insetos.",
      "how": "Aplique o óleo de melaleuca somente na área afetada da pele. Para acne ou pé de atleta, utilize um produto que contenha óleo de melaleuca de acordo com as instruções do rótulo. Nunca ingira o óleo de melaleuca; a ingestão pode causar sintomas graves, incluindo confusão, falta de coordenação e coma.",
      "evidence": "Uma quantidade limitada de pesquisas sugere que o óleo de melaleuca pode ser útil para acne e pé de atleta (infecção fúngica), embora sejam necessários mais estudos. As evidências para fungos nas unhas, piolhos, inflamação das pálpebras e usos relacionados à saúde bucal são insuficientes ou incertas. Os usos tradicionais para feridas, queimaduras e picadas de insetos não contam com pesquisas clínicas rigorosas.",
      "cautions": "Aviso importante: o óleo de melaleuca não deve ser ingerido. A ingestão pode causar sintomas graves, incluindo confusão, falta de coordenação, incapacidade de caminhar e coma. O uso tópico geralmente é seguro para a maioria dos adultos, embora algumas pessoas apresentem vermelhidão ou irritação na pele. Produtos antigos ou expostos ao calor, à luz ou ao ar podem aumentar o risco de reações. Os produtos parecem ser seguros durante a gravidez e a amamentação quando utilizados exclusivamente por via tópica.",
      "sourceUrl": "https://www.nccih.nih.gov/health/tea-tree-oil"
    },
    {
      "slug": "turmeric",
      "name": "Cúrcuma",
      "commonNames": [
        "Curcuma longa",
        "curcumin"
      ],
      "conditions": [
        "muscle-joint-pain",
        "indigestion",
        "skin-rash-itch"
      ],
      "uses": "A cúrcuma é promovida para osteoartrite, coceira, depressão, alergias e colesterol alto; as aplicações tópicas são direcionadas à dor nas articulações. Historicamente, foi utilizada na medicina tradicional para indigestão, resfriados, infecções de pele e doenças hepáticas.",
      "how": "A cúrcuma pode ser ingerida como suplemento alimentar ou aplicada topicamente na pele. Suplementos orais convencionais de cúrcuma ou curcumina são considerados provavelmente seguros nas quantidades recomendadas por até 2 a 3 meses; siga as instruções do rótulo e consulte um profissional de saúde antes de utilizá-los.",
      "evidence": "Para a osteoartrite, as evidências iniciais são positivas quanto ao alívio da dor no joelho e à melhora da função articular, embora sejam necessárias pesquisas de maior qualidade. Para a maioria dos outros usos alegados, os pesquisadores não conseguem confirmar definitivamente a eficácia da cúrcuma, e as evidências gerais permanecem inconclusivas.",
      "cautions": "As formulações convencionais de cúrcuma provavelmente são seguras nas quantidades recomendadas por até 2 a 3 meses. Os efeitos colaterais comuns incluem náusea, vômito, refluxo ácido e problemas digestivos. Produtos com maior biodisponibilidade causaram danos ao fígado em alguns usuários; os sintomas incluem fadiga, urina escura e icterícia. O uso durante a gravidez pode ser inseguro; a segurança durante a amamentação não está esclarecida. Consulte um profissional de saúde antes de utilizá-la junto com medicamentos.",
      "sourceUrl": "https://www.nccih.nih.gov/health/turmeric"
    },
    {
      "slug": "valerian",
      "name": "Valeriana",
      "commonNames": [
        "Valeriana officinalis"
      ],
      "conditions": [
        "sleeplessness"
      ],
      "uses": "A valeriana é promovida para insônia, ansiedade, estresse e depressão; historicamente, também foi utilizada para enxaqueca, fadiga e problemas estomacais.",
      "how": "A valeriana é ingerida por via oral como suplemento alimentar; estudos clínicos utilizaram doses de 300 a 600 mg por dia durante períodos de até 6 semanas. Siga as instruções do rótulo e consulte um profissional de saúde antes de utilizá-la, especialmente se for combiná-la com sedativos ou álcool.",
      "evidence": "As evidências são limitadas e inconsistentes. A Academia Americana de Medicina do Sono recomendou que a valeriana não fosse utilizada para tratar insônia crônica em adultos (2017). Estudos sobre ansiedade, cólicas menstruais e outras condições apresentam evidências insuficientes de benefícios.",
      "cautions": "A valeriana parece geralmente segura para uso de curto prazo em doses de 300 a 600 mg por dia durante até 6 semanas; a segurança do uso prolongado é desconhecida. Os efeitos colaterais comuns incluem dor de cabeça, desconforto estomacal, redução da clareza mental e sonhos vívidos. A interrupção abrupta após uso prolongado pode causar sintomas de abstinência, incluindo ansiedade e insônia. Evite combiná-la com álcool ou sedativos. A segurança durante a gravidez e a amamentação não está esclarecida.",
      "sourceUrl": "https://www.nccih.nih.gov/health/valerian"
    }
  ]
}
