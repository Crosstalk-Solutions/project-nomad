
/* eslint-disable */
/**
 * ARQUIVO GERADO — NÃO EDITE.
 *
 * Fonte única da verdade: collections/home_remedies.json
 * Gere novamente após editar o JSON: `npm run gen:curated-data` (a partir de admin/).
 * curated_data_sync.standalone.ts falha na CI se este arquivo divergir do JSON.
 *
 * Medidas de cuidados domiciliares e autocuidado não fitoterápicas,
 * provenientes de páginas públicas do governo dos EUA (CDC, NIH/NLM MedlinePlus, FDA).
 * Cada entrada possui sua própria sourceUrl.
 */
import type { NaturalRemediesFile } from '../../types/conditions.js'

export const HOME_REMEDIES_FILE: NaturalRemediesFile = {
  "version": "2026-06-10",
  "source": {
    "name": "Orientações de saúde do governo dos EUA (CDC, NIH/NHLBI, MedlinePlus/NLM, FDA)",
    "url": "https://www.cdc.gov",
    "license": "Domínio público (obras do governo dos EUA)"
  },
  "remedies": [
    {
      "slug": "honey-for-cough",
      "name": "Mel (para tosse)",
      "commonNames": [],
      "conditions": [
        "cough",
        "sore-throat",
        "common-cold"
      ],
      "uses": "O mel pode ser usado para aliviar a tosse em adultos e crianças a partir de 1 ano de idade. Uma ou duas colheres de chá podem ser consumidas diretamente ou misturadas a uma bebida morna (não quente).",
      "how": "Ofereça uma ou duas colheres de chá de mel diretamente pela boca ou misture-o a uma bebida morna (não quente). O CDC recomenda essa medida caseira para a tosse associada ao resfriado comum.",
      "evidence": "O CDC inclui o mel entre as medidas caseiras recomendadas para aliviar a tosse e a dor de garganta associadas ao resfriado comum. Essa é uma das estratégias sem medicamentos mencionadas, juntamente com repouso, ingestão de líquidos e uso de umidificador.",
      "cautions": "Nunca ofereça mel a bebês com menos de 1 ano de idade: ele pode conter esporos de Clostridium botulinum, que causam botulismo infantil, uma doença rara, mas grave. Esse alerta se aplica independentemente do tipo ou da marca do mel.",
      "sourceUrl": "https://www.cdc.gov/common-cold/treatment/index.html"
    },
    {
      "slug": "fluids-and-rest",
      "name": "Líquidos e repouso",
      "commonNames": [],
      "conditions": [
        "common-cold",
        "fever",
        "diarrhea",
        "nausea-vomiting"
      ],
      "uses": "Descansar bastante e beber líquidos em quantidade adequada — como água, caldos claros, sucos ou bebidas esportivas — ajuda na recuperação de resfriados, febre, diarreia e náusea. Adultos com diarreia devem beber água, sucos de frutas, bebidas esportivas, refrigerantes sem cafeína e caldos salgados.",
      "how": "Descanse bastante e beba muitos líquidos. Se estiver difícil manter os líquidos no estômago, tome pequenos goles de água ou chupe pedaços de gelo com frequência, em vez de tentar beber grandes quantidades de uma só vez.",
      "evidence": "O CDC recomenda repouso e ingestão de líquidos como medidas principais de cuidados domiciliares para o resfriado comum. O MedlinePlus (NIH/NIDDK) também os considera fundamentais no autocuidado da diarreia e orienta pessoas com náusea a ingerirem pequenas quantidades de líquidos claros com frequência para manter a hidratação.",
      "cautions": "Pessoas gravemente doentes, com sinais de desidratação — como ausência de urina, olhos fundos ou sede extrema — ou incapazes de manter qualquer líquido no estômago devem procurar atendimento médico rapidamente. Cafeína e álcool não são opções eficazes para reidratação.",
      "sourceUrl": "https://www.cdc.gov/common-cold/treatment/index.html"
    },
    {
      "slug": "oral-rehydration",
      "name": "Solução de reidratação oral (SRO)",
      "commonNames": [
        "SRO",
        "sais de reidratação"
      ],
      "conditions": [
        "dehydration",
        "diarrhea"
      ],
      "uses": "As soluções de reidratação oral repõem líquidos e eletrólitos perdidos por causa da diarreia ou de outras causas de desidratação. Em casos de desidratação leve a moderada, beber água é o primeiro passo. Bebidas esportivas ou soluções de reidratação oral, como Pedialyte, são recomendadas quando também há perda de eletrólitos, especialmente em crianças.",
      "how": "Use uma solução de reidratação oral preparada comercialmente, disponível sem receita, e siga as instruções da embalagem. Em adultos com perda de eletrólitos, bebidas esportivas podem ajudar. Se estiver difícil manter os líquidos no estômago, tome pequenos goles frequentes ou chupe pedaços de gelo, em vez de beber grandes quantidades de uma só vez.",
      "evidence": "O MedlinePlus (NIH/NIDDK) informa que o tratamento da desidratação envolve repor os líquidos e eletrólitos perdidos e que soluções de reidratação oral para crianças estão disponíveis sem receita. A mesma fonte recomenda bebidas esportivas para adultos que perderam eletrólitos juntamente com líquidos.",
      "cautions": "Procure atendimento médico imediato diante de sinais de desidratação grave, como ausência de urina por 8 horas ou mais, batimentos cardíacos acelerados, confusão ou incapacidade de manter líquidos no estômago. Bebês e crianças pequenas com diarreia devem usar uma solução de reidratação oral formulada para esse fim, e não apenas água, para repor eletrólitos com segurança.",
      "sourceUrl": "https://medlineplus.gov/dehydration.html"
    },
    {
      "slug": "cool-compress-fever",
      "name": "Compressa fria (para febre e picadas de insetos)",
      "commonNames": [],
      "conditions": [
        "fever",
        "insect-bites-stings",
        "eye-allergy",
        "eye-irritation"
      ],
      "uses": "Um pano limpo umedecido com água fresca (não gelada) e colocado na testa ou na área da picada pode ajudar a reduzir o desconforto causado pela febre, por picadas de insetos e por sintomas de alergia ocular. Em caso de ferroadas de insetos, deve-se aplicar gelo envolvido em um pano por 10 minutos e retirar por outros 10 minutos.",
      "how": "Umedeça um pano limpo com água fresca, torça-o e coloque-o na testa ou na área afetada. Em caso de ferroadas de insetos, envolva o gelo em um pano e aplique por 10 minutos; depois, retire por 10 minutos. Nunca coloque gelo diretamente sobre a pele.",
      "evidence": "O MedlinePlus (NIH/NIAID) informa que compressas frias são recomendadas para conjuntivite alérgica e ardência ou irritação ocular. Para picadas e ferroadas de insetos, uma compressa fria ou com gelo é uma medida inicial comum de autocuidado, descrita em orientações do MedlinePlus compatíveis com recursos do NIH.",
      "cautions": "Não aplique gelo ou compressas extremamente frias diretamente sobre a pele por períodos prolongados. Envolva o gelo em um pano e limite as aplicações a 10–15 minutos para evitar queimaduras pelo frio ou danos aos tecidos. Em caso de febre, compressas frias são complementares e não substituem medicamentos antitérmicos adequados quando indicados. Consulte um profissional de saúde se a febre for alta, prolongada ou acompanhada de sintomas graves.",
      "sourceUrl": "https://medlineplus.gov/insectbitesandstings.html"
    },
    {
      "slug": "ice-and-elevation",
      "name": "Gelo e elevação (método RICE)",
      "commonNames": [
        "RICE",
        "Repouso-Gelo-Compressão-Elevação"
      ],
      "conditions": [
        "muscle-joint-pain",
        "insect-bites-stings"
      ],
      "uses": "Aplicar gelo envolvido em um pano sobre um músculo distendido, uma entorse ou o local de uma picada, combinando isso com repouso, compressão e elevação da área lesionada, reduz o inchaço e a dor. O gelo deve ser aplicado por 10–15 minutos a cada 1–3 horas durante os primeiros dias após a lesão.",
      "how": "Envolva o gelo em um pano ou toalha e aplique-o na área lesionada por 10–15 minutos de cada vez. Descanse a região, envolva-a firmemente com uma faixa para reduzir o inchaço e, quando possível, mantenha-a elevada acima do nível do coração.",
      "evidence": "O MedlinePlus (NIH/NIAMS) descreve o método RICE como tratamento inicial padrão para entorses e distensões: repousar a região, aplicar gelo, comprimi-la com uma faixa e elevá-la acima do nível do coração quando possível. O uso de gelo durante os primeiros três dias é mencionado especificamente.",
      "cautions": "Nunca aplique gelo diretamente sobre a pele: envolva-o sempre em um pano ou toalha. Se o inchaço piorar significativamente, surgir dormência ou houver suspeita de fratura, procure avaliação médica. Não use calor nas primeiras 48–72 horas após uma lesão aguda dos tecidos moles.",
      "sourceUrl": "https://medlineplus.gov/sprainsandstrains.html"
    },
    {
      "slug": "heating-pad",
      "name": "Bolsa térmica ou compressa morna",
      "commonNames": [],
      "conditions": [
        "menstrual-cramps",
        "muscle-joint-pain",
        "earache"
      ],
      "uses": "Aplicar uma bolsa térmica ou uma bolsa de água quente na parte inferior do abdômen ajuda a aliviar cólicas menstruais. Uma compressa morna sobre o ouvido pode aliviar o desconforto causado pela dor de ouvido. O calor também pode ser usado em músculos distendidos após as primeiras 48–72 horas de uma lesão aguda.",
      "how": "Coloque uma bolsa térmica ou uma bolsa de água quente na parte inferior do abdômen para aliviar cólicas menstruais, ou mantenha um pano morno contra o ouvido afetado. Use uma temperatura baixa ou média e coloque um pano entre a bolsa e a pele para evitar queimaduras.",
      "evidence": "O MedlinePlus (NIH/NLM) recomenda o uso de uma bolsa térmica ou de água quente na parte inferior do abdômen, além de um banho morno, como medidas caseiras para a dor menstrual. Para dor de ouvido, colocar um pano morno sobre o ouvido afetado é listado entre as medidas de conforto em recursos do NIH/NLM sobre autocuidado em casos de infecção aguda do ouvido.",
      "cautions": "Nunca durma com uma bolsa térmica ligada ou aplicada ao corpo, pois isso pode causar queimaduras. Use uma temperatura baixa ou média e coloque um pano entre a bolsa e a pele. Em caso de dor de ouvido, não introduza objetos no canal auditivo. Se a dor for intensa ou vier acompanhada de secreção, perda auditiva ou febre, procure um profissional de saúde para verificar se há uma infecção que exija antibióticos.",
      "sourceUrl": "https://medlineplus.gov/periodpain.html"
    },
    {
      "slug": "humidifier-and-steam",
      "name": "Umidificador ou inalação de vapor",
      "commonNames": [
        "vaporizador de névoa fria",
        "inalação de vapor"
      ],
      "conditions": [
        "nasal-congestion",
        "cough",
        "common-cold"
      ],
      "uses": "Usar um umidificador limpo ou um vaporizador de névoa fria aumenta a umidade do ar e pode ajudar a aliviar a congestão nasal e a tosse. Respirar o vapor de uma tigela com água quente ou de um chuveiro ligado por 2–4 vezes ao dia também pode ajudar a soltar as secreções nasais.",
      "how": "Encha um umidificador limpo ou um vaporizador de névoa fria com água e ligue-o no ambiente. Limpe o aparelho diariamente, seguindo as instruções do fabricante, para evitar o acúmulo de mofo e bactérias.",
      "evidence": "O CDC recomenda o uso de um umidificador limpo ou vaporizador de névoa fria como medida caseira para sintomas do resfriado comum, incluindo congestão e tosse. O MedlinePlus também informa que um umidificador pode ajudar a soltar o muco e que a inalação de vapor durante o banho é uma estratégia reconhecida para aliviar a congestão.",
      "cautions": "Limpe o umidificador diariamente, seguindo as instruções do fabricante, para evitar o crescimento de mofo e bactérias. Para crianças, prefira umidificadores de névoa fria em vez de modelos de névoa quente ou vapor, devido ao risco de queimaduras. Ao inalar vapor de água quente, tenha cuidado para evitar escaldaduras: mantenha uma distância segura e não cubra a cabeça sobre uma panela com água fervente.",
      "sourceUrl": "https://www.cdc.gov/common-cold/treatment/index.html"
    },
    {
      "slug": "saline-nasal-rinse",
      "name": "Lavagem nasal com solução salina",
      "commonNames": [
        "lota nasal",
        "irrigação nasal",
        "lavagem nasal com solução salina"
      ],
      "conditions": [
        "nasal-congestion",
        "common-cold"
      ],
      "uses": "As lavagens nasais com solução salina removem pólen, poeira e excesso de muco das vias nasais, além de adicionar umidade. Podem ser realizadas com uma lota nasal, um frasco de apertar ou uma seringa de bulbo, usando uma solução salina preparada.",
      "how": "Use somente água destilada, estéril ou previamente fervida e resfriada. Nunca use água diretamente da torneira. Após cada uso, enxágue o dispositivo com o mesmo tipo de água segura e deixe-o secar completamente ao ar ou seque-o antes de guardá-lo.",
      "evidence": "O CDC recomenda spray ou gotas nasais de solução salina como medida caseira para o resfriado comum. A FDA confirma que os dispositivos de irrigação nasal geralmente são seguros e eficazes quando usados e limpos corretamente. O requisito essencial de segurança é utilizar o tipo adequado de água.",
      "cautions": "Use somente água destilada, estéril ou previamente fervida e resfriada. Nunca use água da torneira. A FDA alerta que a água da torneira pode conter organismos, incluindo amebas, que são seguros quando ingeridos, mas podem causar infecções graves ou potencialmente fatais nas vias nasais. A água fervida deve ser resfriada até ficar morna e armazenada em um recipiente limpo e fechado por, no máximo, 24 horas. Sempre limpe e seque o dispositivo após cada uso.",
      "sourceUrl": "https://www.fda.gov/consumers/consumer-updates/rinsing-your-sinuses-neti-pots-safe"
    },
    {
      "slug": "oatmeal-bath",
      "name": "Banho de aveia ou banho frio",
      "commonNames": [
        "banho com aveia coloidal"
      ],
      "conditions": [
        "skin-rash-itch",
        "poison-ivy",
        "dry-skin"
      ],
      "uses": "Ficar imerso em um banho morno com aveia ou tomar um banho fresco pode aliviar a coceira e a irritação da pele causadas por erupções cutâneas, hera venenosa, eczema e ressecamento. Produtos para banho com aveia coloidal estão disponíveis em farmácias.",
      "how": "Encha a banheira com água morna, não quente, e adicione um produto de banho com aveia coloidal conforme as instruções da embalagem, ou use água fresca sem aditivos. Depois do banho, seque a pele delicadamente com leves toques e aplique imediatamente um hidratante sem fragrância para conservar a umidade.",
      "evidence": "O MedlinePlus (NLM) recomenda banhos mornos ou com aveia como medida de autocuidado para aliviar a coceira, juntamente com compressas frias e loções hidratantes. Produtos de banho com aveia são mencionados especificamente para aliviar sintomas de eczema e psoríase. Banhos curtos e menos quentes são descritos como melhores do que banhos longos e quentes para problemas de pele.",
      "cautions": "Use água morna, não quente, pois a água quente pode agravar o ressecamento e a irritação da pele. Após o banho, seque a pele delicadamente, sem esfregar, e aplique imediatamente um hidratante sem fragrância. Se a erupção cutânea se espalhar rapidamente, vier acompanhada de febre ou atingir o rosto ou os órgãos genitais, consulte um profissional de saúde.",
      "sourceUrl": "https://medlineplus.gov/itching.html"
    },
    {
      "slug": "cool-running-water-on-burns",
      "name": "Água corrente fresca em queimaduras",
      "commonNames": [],
      "conditions": [
        "burns"
      ],
      "uses": "Em queimaduras leves, coloque imediatamente água corrente fresca, não gelada, sobre a área queimada por 10–15 minutos para interromper o processo de queimadura e reduzir a dor. Depois de resfriar a região, cubra a queimadura com um pano limpo e seco ou uma bandagem estéril.",
      "how": "Deixe água fresca correr lentamente sobre a área queimada por vários minutos e, em seguida, cubra-a com um pano limpo e seco ou uma bandagem. Não aplique gelo, manteiga ou cremes, pois eles podem agravar os danos aos tecidos.",
      "evidence": "Os materiais do CDC sobre primeiros socorros em queimaduras orientam deixar água fresca correr lentamente sobre a região por vários minutos e, depois, cobri-la com um pano limpo e seco ou uma bandagem. O MedlinePlus (NIH/NIGMS) também especifica água corrente fresca por 10–15 minutos, seguida de um curativo estéril seco, como resposta adequada de primeiros socorros para queimaduras leves.",
      "cautions": "Não aplique gelo, água gelada, manteiga, cremes de primeiros socorros, sprays ou remédios caseiros, pois eles podem agravar os danos aos tecidos ou provocar infecções. Não estoure bolhas, a menos que um profissional de saúde oriente isso. Não tente remover roupas ou detritos presos à queimadura. Procure atendimento médico imediato em caso de queimaduras extensas, no rosto, nos olhos, nas mãos ou nos pés, causadas por produtos químicos ou eletricidade, ou acompanhadas de dor extrema, dormência ou danos profundos aos tecidos.",
      "sourceUrl": "https://medlineplus.gov/burns.html"
    },
    {
      "slug": "clean-and-cover-wounds",
      "name": "Limpeza e proteção de feridas e cortes",
      "commonNames": [],
      "conditions": [
        "wounds-cuts"
      ],
      "uses": "Em cortes e arranhões leves, enxágue bem a ferida com água fresca e limpa para remover a sujeira, aplique pressão suave com gaze para interromper o sangramento e cubra com um curativo limpo. Lavar com água e sabão ajuda a reduzir o risco de infecção.",
      "how": "Aplique pressão firme, mas suave, com gaze para interromper o sangramento. Se o sangue atravessar a gaze, coloque mais gaze por cima, sem retirar a primeira camada. Enxágue a ferida com água fresca e limpa e, em seguida, cubra-a com um curativo limpo e seco.",
      "evidence": "As orientações do CDC sobre cuidados com feridas recomendam pressionar um corte com sangramento até que ele pare, despejar água limpa delicadamente sobre a ferida para limpá-la e, em seguida, aplicar um curativo limpo e seco. O MedlinePlus (NLM) também orienta enxaguar cortes com água fresca e aplicar pressão firme, mas suave, para interromper o sangramento.",
      "cautions": "Observe sinais de infecção nos dias seguintes. Aumento da vermelhidão, inchaço, calor, pus ou linhas avermelhadas que se espalham a partir da ferida exigem avaliação médica rápida. Procure atendimento imediato para feridas profundas ou abertas, causadas por mordidas de animais ou pessoas, ou provocadas por objetos potencialmente contaminados, devido ao risco de tétano.",
      "sourceUrl": "https://medlineplus.gov/firstaid.html"
    },
    {
      "slug": "salt-water-gargle",
      "name": "Gargarejo com água salgada",
      "commonNames": [],
      "conditions": [
        "sore-throat",
        "common-cold",
        "canker-sores"
      ],
      "uses": "Fazer gargarejos com água morna e sal várias vezes ao dia pode aliviar a dor de garganta e também ajudar a reduzir o desconforto causado por aftas. Uma preparação comum consiste em dissolver ½ colher de chá (3 gramas) de sal em 1 xícara (240 mL) de água morna.",
      "how": "Dissolva o sal em uma xícara de água morna, coloque um gole na boca, incline a cabeça para trás e faça gargarejo por alguns segundos antes de cuspir a solução. Repita conforme necessário ao longo do dia para ajudar a aliviar a dor de garganta.",
      "evidence": "O MedlinePlus (NLM) informa que fazer gargarejos pode aliviar a dor de garganta e menciona essa medida junto com pastilhas e ingestão de líquidos. A mesma fonte observa que enxágues com água salgada podem ajudar a reduzir o desconforto das aftas, embora enxaguantes bucais que contenham álcool devam ser evitados porque irritam os tecidos.",
      "cautions": "O gargarejo com água salgada oferece apenas alívio dos sintomas e não trata a causa subjacente da dor de garganta. Dor de garganta acompanhada de febre alta, dificuldade para engolir ou respirar, salivação excessiva, rigidez no pescoço ou duração superior a uma semana deve ser avaliada por um profissional de saúde, pois faringite estreptocócica e outras condições exigem tratamentos diferentes.",
      "sourceUrl": "https://medlineplus.gov/sorethroat.html"
    },
    {
      "slug": "fiber-and-water-constipation",
      "name": "Fibras alimentares e água (para prisão de ventre e hemorroidas)",
      "commonNames": [],
      "conditions": [
        "constipation",
        "hemorrhoids"
      ],
      "uses": "Consumir mais frutas, verduras e grãos integrais, que são ricos em fibras, e beber bastante água diariamente são medidas fundamentais de autocuidado para prevenir e aliviar a prisão de ventre e reduzir o desconforto causado pelas hemorroidas.",
      "how": "Consuma mais frutas, verduras e grãos integrais diariamente e beba bastante líquido. Aumente a ingestão de fibras gradualmente para evitar gases e inchaço abdominal.",
      "evidence": "O MedlinePlus (NIH/NIDDK) indica o aumento das fibras alimentares e a ingestão adequada de líquidos como medidas principais de autocuidado tanto para a prisão de ventre quanto para as hemorroidas. A página sobre hemorroidas recomenda especificamente consumir alimentos ricos em fibras e beber líquidos suficientes todos os dias como tratamento caseiro inicial.",
      "cautions": "Aumente a ingestão de fibras gradualmente para evitar gases e inchaço abdominal. Se a prisão de ventre for recente, grave, acompanhada de sangue nas fezes ou associada a perda significativa de peso, procure um profissional de saúde para investigar possíveis causas subjacentes. Sintomas de hemorroidas que persistam por mais de uma semana de tratamento caseiro, assim como qualquer sangramento retal, exigem avaliação médica.",
      "sourceUrl": "https://medlineplus.gov/constipation.html"
    },
    {
      "slug": "sitz-bath",
      "name": "Banho de assento (para hemorroidas)",
      "commonNames": [],
      "conditions": [
        "hemorrhoids"
      ],
      "uses": "O banho de assento, que consiste em sentar em alguns centímetros de água morna por 10–15 minutos, várias vezes ao dia, alivia a dor e a coceira causadas pelas hemorroidas. Uma bacia própria para banho de assento, que se encaixa sobre o vaso sanitário, pode ser encontrada em farmácias.",
      "how": "Encha uma banheira ou bacia própria para banho de assento com alguns centímetros de água confortavelmente morna e permaneça sentado por 10–15 minutos. Repita várias vezes ao dia, mantendo a região limpa e seca entre os banhos.",
      "evidence": "O MedlinePlus (NLM) recomenda banhos mornos várias vezes ao dia, incluindo banhos de assento, como medida caseira para aliviar a dor causada pelas hemorroidas. A recomendação é permanecer sentado em água morna por 10–15 minutos em cada sessão.",
      "cautions": "A água deve estar confortavelmente morna, não quente, para evitar queimaduras. Mantenha a região limpa e seca entre os banhos. Se os sintomas das hemorroidas não melhorarem após uma semana de tratamento caseiro, ou se houver sangramento retal, procure um profissional de saúde.",
      "sourceUrl": "https://medlineplus.gov/hemorrhoids.html"
    },
    {
      "slug": "elevate-head-heartburn",
      "name": "Elevar a cabeceira da cama (para azia)",
      "commonNames": [],
      "conditions": [
        "heartburn",
        "indigestion"
      ],
      "uses": "Elevar a cabeceira da cama em 10–15 cm, usando blocos sob a estrutura da cama ou um suporte em formato de cunha, ajuda a impedir que o ácido do estômago retorne ao esôfago durante o sono, reduzindo a azia noturna e os sintomas da doença do refluxo gastroesofágico (DRGE).",
      "how": "Coloque blocos sob os pés da cabeceira da cama ou use uma cunha de espuma sob o colchão para elevar a superfície de dormir em aproximadamente 15 cm. Usar travesseiros extras apenas sob a cabeça é menos eficaz, pois dobra o corpo na cintura em vez de inclinar todo o tronco.",
      "evidence": "Os materiais do MedlinePlus sobre azia, baseados em fontes do NIH/NIDDK, recomendam elevar a cabeça durante o sono como medida de estilo de vida para azia e DRGE, observando que essa posição ajuda a prevenir o refluxo. Elevar a cabeceira em aproximadamente 15 cm é uma recomendação específica descrita na Enciclopédia Médica.",
      "cautions": "Usar travesseiros extras sob a cabeça é menos eficaz do que elevar toda a parte superior do corpo. Os travesseiros podem causar tensão no pescoço e não alteram suficientemente o ângulo do corpo. Azia frequente ou intensa, ou acompanhada de dificuldade para engolir, perda de peso inexplicada ou vômito com sangue, exige avaliação médica.",
      "sourceUrl": "https://medlineplus.gov/heartburn.html"
    },
    {
      "slug": "bland-small-meals",
      "name": "Refeições pequenas, frequentes e leves",
      "commonNames": [
        "dieta BRAT",
        "dieta leve"
      ],
      "conditions": [
        "nausea-vomiting",
        "indigestion",
        "diarrhea"
      ],
      "uses": "Comer de 6 a 8 pequenas refeições leves ao longo do dia — como biscoitos simples, torradas, frango assado, arroz e batatas — em vez de três refeições grandes pode reduzir a náusea e aliviar a indigestão. Conforme os sintomas da diarreia melhoram, alimentos macios e leves podem ser introduzidos gradualmente.",
      "how": "Faça refeições menores com mais frequência e prefira alimentos leves, evitando opções apimentadas, gordurosas ou muito salgadas. Se estiver difícil manter os alimentos no estômago, comece tomando pequenos goles frequentes de líquidos claros e só acrescente alimentos sólidos leves quando conseguir tolerá-los.",
      "evidence": "O MedlinePlus (NLM) recomenda refeições leves, pequenas e frequentes, além de evitar alimentos apimentados, gordurosos ou salgados, como principais medidas alimentares de autocuidado para náuseas e vômitos. Para indigestão, o MedlinePlus informa que evitar alimentos e situações que desencadeiam os sintomas é a principal estratégia caseira. Em casos de diarreia, recomenda alimentos macios e leves conforme os sintomas melhoram.",
      "cautions": "A dieta BRAT (banana, arroz, purê de maçã e torradas) era tradicionalmente recomendada, mas o MedlinePlus informa que não há evidências fortes de que seja melhor do que uma dieta leve comum; provavelmente não causa danos. Se a náusea ou os vômitos persistirem por mais de 24–48 horas, vierem acompanhados de dor intensa ou impedirem a ingestão adequada de líquidos, procure atendimento médico.",
      "sourceUrl": "https://medlineplus.gov/nauseaandvomiting.html"
    },
    {
      "slug": "dark-quiet-room-headache",
      "name": "Descansar em um ambiente escuro e silencioso (para dor de cabeça)",
      "commonNames": [],
      "conditions": [
        "headache",
        "sleeplessness"
      ],
      "uses": "Descansar com os olhos fechados em um ambiente escuro e silencioso é uma medida de autocuidado sem medicamentos recomendada durante uma dor de cabeça ou enxaqueca. Beber água para prevenir a desidratação e colocar um pano fresco na testa são medidas frequentemente combinadas com esse repouso.",
      "how": "Vá para um ambiente silencioso e escuro, feche os olhos e descanse. Beba água e coloque um pano fresco e úmido na testa para ajudar a aliviar o desconforto.",
      "evidence": "O MedlinePlus (NLM) descreve descansar em um ambiente silencioso e escuro como uma das principais medidas para se sentir melhor durante uma dor de cabeça ou enxaqueca, juntamente com beber água e usar técnicas de relaxamento. Essas recomendações são atribuídas a fontes do NIH sobre o tratamento de dores de cabeça e enxaquecas.",
      "cautions": "Uma dor de cabeça súbita e extremamente intensa, semelhante a uma explosão, ou acompanhada de febre, rigidez no pescoço, confusão ou alterações na visão pode indicar uma condição grave e exige avaliação de emergência. Dores de cabeça frequentes que prejudicam a vida diária devem ser discutidas com um profissional de saúde, em vez de serem tratadas exclusivamente em casa.",
      "sourceUrl": "https://medlineplus.gov/headache.html"
    },
    {
      "slug": "sleep-hygiene",
      "name": "Hábitos de higiene do sono",
      "commonNames": [
        "bons hábitos de sono"
      ],
      "conditions": [
        "sleeplessness"
      ],
      "uses": "Um conjunto consistente de hábitos — horários regulares para dormir e acordar, quarto fresco e escuro, evitar telas e cafeína perto da hora de dormir e praticar exercícios regularmente — ajuda adultos a obter e manter um sono adequado.",
      "how": "Durma e acorde no mesmo horário todos os dias. Mantenha o quarto silencioso, escuro e fresco; desligue os dispositivos eletrônicos pelo menos 30 minutos antes de dormir; evite cafeína à tarde e à noite, bem como refeições grandes ou álcool antes de se deitar.",
      "evidence": "O CDC e o NHLBI recomendam essas práticas para um sono saudável: dormir e acordar no mesmo horário diariamente, manter o quarto silencioso, fresco e escuro, desligar as telas pelo menos 30 minutos antes de dormir, evitar cafeína à tarde e à noite e evitar refeições grandes ou álcool antes de se deitar. O NHLBI observa que esses hábitos são especialmente importantes para trabalhadores em turnos e pessoas com insônia.",
      "cautions": "Uma boa higiene do sono pode ajudar a aliviar a insônia de curto prazo. A insônia persistente por mais de algumas semanas deve ser avaliada por um profissional de saúde. Dificuldades para dormir acompanhadas de ronco, engasgos durante o sono ou sonolência excessiva durante o dia podem indicar apneia obstrutiva do sono, que exige diagnóstico médico.",
      "sourceUrl": "https://www.cdc.gov/sleep/about/index.html"
    },
    {
      "slug": "pinworm-hygiene",
      "name": "Medidas de higiene contra oxiúros",
      "commonNames": [],
      "conditions": [
        "pinworm"
      ],
      "uses": "Lavar bem as mãos com água morna e sabão, especialmente após usar o banheiro e antes de comer; tomar banho todas as manhãs com água e sabão; trocar a roupa íntima diariamente; manter as unhas curtas e limpas; e lavar roupas de cama e pijamas com água quente são medidas essenciais de higiene domiciliar para lidar com a infecção por oxiúros.",
      "how": "Tome banho todas as manhãs ao acordar e lave as mãos regularmente, especialmente após usar o banheiro. Troque a roupa íntima diariamente, lave pijamas e lençóis com frequência e evite roer as unhas para prevenir uma nova infecção.",
      "evidence": "O CDC identifica a lavagem das mãos como a medida mais importante para prevenir a disseminação de oxiúros. O MedlinePlus (NIH/NIAID) recomenda tomar banho ao acordar, lavar pijamas e lençóis frequentemente, lavar as mãos regularmente, trocar a roupa íntima todos os dias e evitar roer as unhas e coçar a região anal como principais medidas preventivas de higiene.",
      "cautions": "Em geral, a higiene isoladamente não consegue eliminar uma infecção ativa por oxiúros. Normalmente é necessário um medicamento antiparasitário vendido sem receita, como o pamoato de pirantel, e todos os moradores da casa devem ser tratados simultaneamente. A dose costuma ser repetida após duas semanas, porque o medicamento mata os vermes, mas não os ovos. A segunda dose trata os vermes que eclodiram após a primeira.",
      "sourceUrl": "https://medlineplus.gov/pinworms.html"
    },
    {
      "slug": "keep-feet-dry-athlete-foot",
      "name": "Manter os pés limpos e secos (para infecções fúngicas)",
      "commonNames": [
        "autocuidado para pé de atleta"
      ],
      "conditions": [
        "fungal-infection"
      ],
      "uses": "Manter os pés limpos, secos e frescos — lavando-os diariamente com água e sabão, secando cuidadosamente entre os dedos, usando meias de algodão limpas e evitando andar descalço em chuveiros públicos ou vestiários — ajuda no tratamento e previne a disseminação do pé de atleta e de outras infecções por tínea.",
      "how": "Mantenha os pés limpos, secos e frescos; use meias limpas e evite andar descalço em locais públicos, como chuveiros de vestiários. Prefira chinelos nesses ambientes. Na maioria dos casos de pé de atleta, aplique um creme antifúngico vendido sem receita conforme as instruções da embalagem.",
      "evidence": "O MedlinePlus, com informações provenientes do CDC, orienta manter os pés limpos, secos e frescos; usar meias limpas; evitar andar descalço em locais públicos; usar chinelos nos chuveiros de vestiários; e manter as unhas dos pés limpas e curtas. Cremes antifúngicos vendidos sem receita funcionam na maioria dos casos de pé de atleta.",
      "cautions": "Se o tratamento antifúngico sem receita não melhorar a infecção em 2–4 semanas, consulte um profissional de saúde. Vermelhidão, calor e inchaço que se espalham ou pioram — especialmente em pessoas com diabetes ou problemas circulatórios — exigem atendimento médico rápido. Infecções fúngicas nas unhas são mais difíceis de tratar do que as infecções da pele e frequentemente exigem tratamento com receita médica.",
      "sourceUrl": "https://medlineplus.gov/athletesfoot.html"
    }
  ]
}
