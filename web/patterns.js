// The built-in example library.
//
// Every one of these was checked against the library before being written
// down: it parses, it reports the cardinality shown, and it enumerates. The
// notes are the point as much as the expressions are -- an example nobody can
// explain teaches nothing -- so each carries a paragraph in both languages
// saying what the set is and why it is worth looking at.
//
// 'flags' matches the parse options: i caseless, s dotall, L left to right.

export const BUILTIN = [

  // ---------------------------------------------------------------- finite

  {
    id: "passwords",
    pattern: "[0-9A-Za-z]{8}",
    flags: "",
    name: { en: "Eight-character passwords",
            pt: "Senhas de oito caracteres" },
    note: {
      en: "Every string of eight letters and digits: 218,340,105,584,896 of " +
          "them, about 2^47.6. Counting them is instant, which is the first " +
          "thing this library does that grep and friends cannot. Try seeking " +
          "to an index near the end -- it is no slower than the beginning, " +
          "because the mapping is arithmetic rather than a search.",
      pt: "Toda cadeia de oito letras e algarismos: 218.340.105.584.896 " +
          "delas, cerca de 2^47,6. Contá-las é instantâneo, e essa é a " +
          "primeira coisa que esta biblioteca faz e que o grep e afins não " +
          "fazem. Experimente ir para um índice perto do fim: não é mais " +
          "lento que o começo, porque o mapeamento é aritmético e não uma " +
          "busca."
    }
  },
  {
    id: "hex",
    pattern: "([0-9A-F]{4} ){2}",
    flags: "",
    name: { en: "Eight hex digits", pt: "Oito dígitos hexadecimais" },
    note: {
      en: "The enumeration runs right to left, so the last position varies " +
          "fastest, exactly as the last digit of an ordinary numeral does. " +
          "That makes the index a number written in another base: ask for " +
          "element 3,735,928,559 and you get DEAD BEEF. Turn on (?L) and the " +
          "order reverses to FEEB DAED.",
      pt: "A enumeração corre da direita para a esquerda, então a última " +
          "posição varia mais rápido, exatamente como o último algarismo de " +
          "um numeral comum. Isso faz do índice um número escrito em outra " +
          "base: peça o elemento 3.735.928.559 e você recebe DEAD BEEF. " +
          "Ligue (?L) e a ordem inverte para FEEB DAED."
    }
  },
  {
    id: "roman",
    pattern: "M{0,3}(C{0,3}|CD|DC{0,3}|CM)(X{0,3}|XL|LX{0,3}|XC)" +
             "(I{0,3}|IV|VI{0,3}|IX)",
    flags: "",
    name: { en: "Roman numerals", pt: "Algarismos romanos" },
    note: {
      en: "All 4,000 Roman numerals from the empty string to MMMCMXCIX. The " +
          "index happens to be the value: element 3,999 really is MMMCMXCIX, " +
          "because the expression is written so that the thousands, " +
          "hundreds, tens and units are separate positions in that order.",
      pt: "Os 4.000 algarismos romanos, da cadeia vazia até MMMCMXCIX. O " +
          "índice coincide com o valor: o elemento 3.999 é de fato " +
          "MMMCMXCIX, porque a expressão está escrita de modo que milhares, " +
          "centenas, dezenas e unidades sejam posições separadas nessa ordem."
    }
  },
  {
    id: "ipv4",
    pattern: "((\\d|[1-9]\\d|1\\d\\d|2[0-4]\\d|25[0-5])\\.){3}(?2)",
    flags: "",
    name: { en: "IPv4 addresses", pt: "Endereços IPv4" },
    note: {
      en: "All 4,294,967,296 of them, and exactly them: the alternation " +
          "rules out 256 and above. Note (?2), which reuses the second " +
          "parenthesised group as a subroutine rather than writing it out a " +
          "fourth time.",
      pt: "Todos os 4.294.967.296, e exatamente eles: a alternação exclui " +
          "256 e acima. Repare no (?2), que reaproveita o segundo grupo " +
          "entre parênteses como sub-rotina em vez de escrevê-lo uma quarta " +
          "vez."
    }
  },
  {
    id: "placa-antiga",
    pattern: "[A-Z]{3}-\\d{4}",
    flags: "",
    name: { en: "Brazilian licence plates (old)",
            pt: "Placas brasileiras (padrão antigo)" },
    note: {
      en: "The pre-2018 Brazilian format: three letters, a hyphen, four " +
          "digits. 175,760,000 plates. Compare the count with the Mercosul " +
          "format below -- the new one is larger, which was the point of " +
          "changing it.",
      pt: "O padrão brasileiro anterior a 2018: três letras, hífen, quatro " +
          "algarismos. 175.760.000 placas. Compare a contagem com o padrão " +
          "Mercosul abaixo: o novo é maior, que era justamente a razão da " +
          "mudança."
    }
  },
  {
    id: "placa-mercosul",
    pattern: "[A-Z]{3}\\d[A-Z]\\d{2}",
    flags: "",
    name: { en: "Brazilian licence plates (Mercosul)",
            pt: "Placas brasileiras (padrão Mercosul)" },
    note: {
      en: "Three letters, a digit, a letter, two digits: 456,976,000 plates, " +
          "against 175,760,000 for the old format. The fifth character being " +
          "a letter rather than a digit is what multiplies it by 2.6.",
      pt: "Três letras, um algarismo, uma letra, dois algarismos: " +
          "456.976.000 placas, contra 175.760.000 do padrão antigo. O quinto " +
          "caractere ser letra em vez de algarismo é o que multiplica por 2,6."
    }
  },
  {
    id: "cnpj-all",
    family: { en: "CNPJ, alphanumeric (2026)", pt: "CNPJ alfanumérico (2026)" },
    pattern: "[0-9A-Z]{2}\\.[0-9A-Z]{3}\\.[0-9A-Z]{3}/[0-9A-Z]{4}-\\d{2}",
    flags: "",
    name: { en: "every check digit", pt: "todo verificador" },
    note: {
      en: "From 2026 the Brazilian company number admits letters. This is " +
          "the set of well-formed ones, punctuation and all: the two final " +
          "digits range freely over 00 to 99, so a hundredth of these carry " +
          "the correct checksum. Root and branch both vary " +
          "small; the branch varies over all four characters here. Some 4.7 " +
          "times 10^20 of them (36^12 times 100). Switch to the valid " +
          "variant to see the checksum computed instead of enumerated.",
      pt: "A partir de 2026 o CNPJ admite letras. Este é o conjunto dos bem " +
          "formados, pontuação e tudo: os dois algarismos finais variam " +
          "livremente de 00 a 99, então um centésimo destes carrega o " +
          "verificador correto. Raiz e filial variam " +
          "conjunto pequeno; aqui a filial varia nos quatro caracteres. " +
          "Cerca de 4,7 vezes 10^20 (36^12 vezes 100). Troque para a " +
          "variante válida para ver o verificador calculado em vez de " +
          "válida para ver o verificador calculado em vez de enumerado."
    }
  },
  {
    id: "cnpj-valid",
    family: { en: "CNPJ, alphanumeric (2026)", pt: "CNPJ alfanumérico (2026)" },
    pattern: "[0-9A-Z]{2}\\.[0-9A-Z]{3}\\.[0-9A-Z]{3}/[0-9A-Z]{4}",
    flags: "",
    name: { en: "valid check digit (code)", pt: "verificador válido (código)" },
    note: {
      en: "Now the regex stops before the checksum and the code computes it, " +
          "so every row is a genuinely valid CNPJ rather than one in a " +
          "hundred. The check digit still uses mod 11 over each character's " +
          "code point minus 48, which is exactly why it survived the letters " +
          "unchanged -- a digit is worth itself, a letter carries on from " +
          "A = 17. The bookmark lands on 12.ABC.345/01DE, whose digits are " +
          "35, the example in Receita Federal's own note.",
      pt: "Agora a expressão para antes do verificador e o código o calcula, " +
          "então cada linha é um CNPJ de fato válido, e não um em cem. O " +
          "dígito continua usando mod 11 sobre o código de cada caractere " +
          "menos 48, e é por isso que sobreviveu às letras sem mudança — um " +
          "algarismo vale ele mesmo, uma letra segue a partir de A = 17. O " +
          "marcador cai em 12.ABC.345/01DE, cujos dígitos são 35, o exemplo " +
          "da nota da Receita Federal."
    },
    code:
      "// Strip the punctuation to the twelve-character base, then append\n" +
      "// the two check digits computed as Receita Federal specifies.\n" +
      "var base = lib.keep(value, \"0-9A-Z\");\n" +
      "return value + \"-\" + lib.checkDigits(base,\n" +
      "  [5,4,3,2,9,8,7,6,5,4,3,2],\n" +
      "  [6,5,4,3,2,9,8,7,6,5,4,3,2]);",
    bookmarks: [
      // 12.ABC.345/01DE, base 12ABC34501DE in [0-9A-Z]{12}, whose check
      // digits are 35 -- the worked example in Receita Federal's note.
      { name: { en: "the RFB example", pt: "o exemplo da RFB" },
        index: "139981599648639986" }
    ]
  },
  {
    id: "cpf-all",
    family: { en: "CPF (Brazilian taxpayer number)", pt: "CPF" },
    pattern: "\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}",
    flags: "",
    name: { en: "every check digit", pt: "todo verificador" },
    note: {
      en: "All 10^11 well-formed CPFs. The last two digits range over 00 to " +
          "99, so only a hundredth carry the mod-11 checksum a regular " +
          "expression cannot express. Switch to the valid variant to have " +
          "the code compute it instead.",
      pt: "Todos os 10^11 CPFs bem formados. Os dois últimos algarismos " +
          "variam de 00 a 99, então só um centésimo carrega o verificador " +
          "mod 11 que uma expressão regular não expressa. Troque para a " +
          "variante válida para que o código o calcule."
    }
  },
  {
    id: "cpf-valid",
    family: { en: "CPF (Brazilian taxpayer number)", pt: "CPF" },
    pattern: "\\d{3}\\.\\d{3}\\.\\d{3}",
    flags: "",
    name: { en: "valid check digit (code)", pt: "verificador válido (código)" },
    note: {
      en: "The regex stops before the checksum and the code appends it, so " +
          "every row is a valid CPF rather than one in a hundred. This is " +
          "the pattern that prompted the whole code feature.",
      pt: "A expressão para antes do verificador e o código o acrescenta, " +
          "então cada linha é um CPF válido, e não um em cem. Foi este " +
          "padrão que originou todo o recurso de código."
    },
    code:
      "// Strip the dots to the nine-digit base, append the two check\n" +
      "// digits, computed mod 11 exactly as Receita Federal specifies.\n" +
      "var base = lib.keep(value, \"0-9\");\n" +
      "return value + \"-\" + lib.checkDigits(base,\n" +
      "  [10,9,8,7,6,5,4,3,2],\n" +
      "  [11,10,9,8,7,6,5,4,3,2]);"
  },
  {
    id: "cep",
    pattern: "\\d{5}-\\d{3}",
    flags: "",
    name: { en: "CEP (Brazilian postcode)", pt: "CEP" },
    note: {
      en: "A hundred million of them. Small enough that the whole set could " +
          "be written out, big enough that you would not want to.",
      pt: "Cem milhões deles. Pequeno o bastante para que o conjunto inteiro " +
          "pudesse ser escrito, grande o bastante para que você não queira."
    }
  },
  {
    id: "mac",
    pattern: "([0-9A-F]{2}:){5}[0-9A-F]{2}",
    flags: "",
    name: { en: "MAC addresses", pt: "Endereços MAC" },
    note: {
      en: "281,474,976,710,656 -- 2^48 exactly, which the count panel shows " +
          "with an equals sign rather than a tilde because the power is " +
          "exact.",
      pt: "281.474.976.710.656 — exatamente 2^48, o que o painel de contagem " +
          "mostra com sinal de igual em vez de til, porque a potência é exata."
    }
  },
  {
    id: "uuid4",
    pattern: "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-" +
             "[0-9a-f]{12}",
    flags: "",
    name: { en: "UUID version 4", pt: "UUID versão 4" },
    note: {
      en: "The shape of a random UUID, with the version nibble pinned to 4 " +
          "and the variant to one of 8, 9, a, b. That leaves 2^122 of them, " +
          "a 37-digit number -- which is why the index box takes a string " +
          "rather than a number.",
      pt: "O formato de um UUID aleatório, com o nibble de versão fixo em 4 " +
          "e o de variante em 8, 9, a ou b. Restam 2^122, um número de 37 " +
          "algarismos — e é por isso que a caixa de índice aceita texto e " +
          "não um número."
    }
  },
  {
    id: "koremutake",
    pattern: "(([bdfghjklmnprstv]|[bdfgp]r|st)[aeiouy]|tra|tre){4}",
    flags: "",
    name: { en: "Pronounceable passwords", pt: "Senhas pronunciáveis" },
    note: {
      en: "Four syllables, each a consonant or cluster followed by a vowel. " +
          "268,435,456 of them, which is exactly 2^28, so one of these " +
          "carries 28 bits. Press Random a few times: they all look like " +
          "words.",
      pt: "Quatro sílabas, cada uma uma consoante ou grupo consonantal " +
          "seguido de vogal. 268.435.456 delas, exatamente 2^28, então uma " +
          "destas carrega 28 bits. Aperte Aleatório algumas vezes: todas " +
          "parecem palavras."
    }
  },
  {
    id: "chess",
    pattern: "[a-h][1-8]",
    flags: "",
    name: { en: "Chessboard squares", pt: "Casas do tabuleiro de xadrez" },
    note: {
      en: "Sixty-four. A good one to start with, because the whole set fits " +
          "on the screen and you can watch the index line up with the board.",
      pt: "Sessenta e quatro. Um bom ponto de partida, porque o conjunto " +
          "inteiro cabe na tela e dá para ver o índice acompanhar o tabuleiro."
    }
  },
  {
    id: "dna8",
    pattern: "[ACGT]{8}",
    flags: "",
    name: { en: "DNA 8-mers", pt: "8-meros de DNA" },
    note: {
      en: "65,536 of them, one for every 16-bit number, since each base is " +
          "two bits. Bioinformatics counts these constantly.",
      pt: "65.536 deles, um para cada número de 16 bits, já que cada base " +
          "vale dois bits. A bioinformática conta estes o tempo todo."
    }
  },
  {
    id: "dates",
    pattern: "(19|20)\\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])",
    flags: "",
    name: { en: "ISO dates, 1900 to 2099", pt: "Datas ISO, 1900 a 2099" },
    note: {
      en: "74,400 of them: 200 years times 12 months times 31 days. That is " +
          "more than there are real dates, because a regular expression " +
          "cannot know that February is short or that leap years exist. " +
          "Worth seeing -- the set a pattern describes is often slightly " +
          "wider than the one you meant.",
      pt: "74.400: 200 anos vezes 12 meses vezes 31 dias. É mais do que o " +
          "número de datas reais, porque uma expressão regular não sabe que " +
          "fevereiro é curto nem que existem anos bissextos. Vale ver: o " +
          "conjunto que um padrão descreve costuma ser um pouco mais largo " +
          "que o pretendido."
    }
  },
  {
    id: "celular",
    pattern: "\\+55 \\d{2} 9\\d{4}-\\d{4}",
    flags: "",
    name: { en: "Brazilian mobile numbers", pt: "Celulares brasileiros" },
    note: {
      en: "Ten billion, though most area codes do not exist. Set the page " +
          "size to a few hundred and jump around with the index box to see " +
          "how the digits behave like an odometer.",
      pt: "Dez bilhões, embora a maioria dos DDDs não exista. Ponha o " +
          "tamanho de página em algumas centenas e salte pelo campo de " +
          "índice para ver os algarismos se comportarem como um hodômetro."
    }
  },
  {
    id: "chords",
    pattern: "[A-G][#b]?(maj|min|dim|aug)?(/[A-G][#b]?)?",
    flags: "",
    name: { en: "Chord names", pt: "Nomes de acordes" },
    note: {
      en: "A root, an optional accidental, an optional quality and an " +
          "optional bass note: 2,310 names. This is the shape that used to " +
          "be rejected -- a quantified group after another quantified thing " +
          "-- until writing this library of examples turned the bug up.",
      pt: "Uma fundamental, um acidente opcional, uma qualidade opcional e " +
          "um baixo opcional: 2.310 nomes. Esta é a forma que costumava ser " +
          "rejeitada — um grupo quantificado depois de outra coisa " +
          "quantificada — até que montar esta biblioteca de exemplos revelou " +
          "o defeito."
    }
  },
  {
    id: "bip39-12",
    family: { en: "Passphrases", pt: "Frases-senha" },
    pattern: "[:bip39en:]( [:bip39en:]){11}",
    flags: "",
    name: { en: "BIP-39 seed, 12 words", pt: "Semente BIP-39, 12 palavras" },
    note: {
      en: "Twelve words from the 2048-word Bitcoin list, which is 2048^12 -- " +
          "about 5.4 times 10^39, or 2^132. This is the shape the dictionary " +
          "feature was built for: a keyspace made of real words rather than " +
          "characters. Every seed has an exact index, so -f jumps to one and " +
          "-k walks them in a scattered order. See the Dictionaries tab.",
      pt: "Doze palavras da lista de 2048 do Bitcoin, o que dá 2048^12 -- " +
          "cerca de 5,4 vezes 10^39, ou 2^132. É a forma para a qual o " +
          "recurso de dicionários foi feito: um espaço de chaves feito de " +
          "palavras reais, não de caracteres. Cada semente tem um índice " +
          "exato, então -f salta para uma e -k as percorre numa ordem " +
          "espalhada. Veja a aba Dicionários."
    }
  },
  {
    id: "diceware-6",
    family: { en: "Passphrases", pt: "Frases-senha" },
    pattern: "[:diceware4en:]( [:diceware4en:]){5}",
    flags: "",
    name: { en: "Diceware, 6 words", pt: "Diceware, 6 palavras" },
    note: {
      en: "Six words from the 1296-word Diceware list, 1296^6, about 4.7 " +
          "times 10^18 or 2^62. Switch the pattern to [:diceware4ptbr:] for " +
          "the Brazilian Portuguese list of the same size.",
      pt: "Seis palavras da lista Diceware de 1296, 1296^6, cerca de 4,7 " +
          "vezes 10^18 ou 2^62. Troque o padrão por [:diceware4ptbr:] para a " +
          "lista em português brasileiro do mesmo tamanho."
    }
  },
  {
    id: "months",
    pattern: "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) " +
             "(0[1-9]|[12]\\d|3[01])",
    flags: "",
    name: { en: "Abbreviated month and day",
            pt: "Mês abreviado e dia" },
    note: {
      en: "An alternation of twelve names against a two-digit day: 372 " +
          "combinations, because a regular expression has no idea that " +
          "February is short. Swap the names for Jan|Fev|Mar|Abr|Mai|Jun|" +
          "Jul|Ago|Set|Out|Nov|Dez and the count does not move -- the " +
          "expression is the specification, and twelve alternatives are " +
          "twelve alternatives whatever language they are in.",
      pt: "Uma alternação de doze nomes contra um dia de dois algarismos: " +
          "372 combinações, porque uma expressão regular não faz ideia de " +
          "que fevereiro é curto. Troque os nomes por Jan|Fev|Mar|Abr|Mai|" +
          "Jun|Jul|Ago|Set|Out|Nov|Dez e a contagem não muda — a expressão " +
          "é a especificação, e doze alternativas são doze alternativas em " +
          "qualquer idioma."
    }
  },
  {
    id: "backref",
    pattern: "([0-9]{2})/(\\1)",
    flags: "",
    name: { en: "Backreference: a repeated pair",
            pt: "Retrorreferência: um par repetido" },
    note: {
      en: "A hundred, not ten thousand: \\1 does not choose again, it copies " +
          "what the group already chose. Backreferences are the one thing " +
          "here that a plain product of independent positions cannot express.",
      pt: "Cem, e não dez mil: \\1 não escolhe de novo, copia o que o grupo " +
          "já escolheu. Retrorreferências são a única coisa aqui que um " +
          "produto de posições independentes não consegue expressar."
    }
  },

  // -------------------------------------------------------------- infinite

  {
    id: "naturals",
    pattern: "[1-9][0-9]*",
    flags: "",
    name: { en: "Every positive integer", pt: "Todo inteiro positivo" },
    note: {
      en: "The set has no largest member, so there is no count -- but there " +
          "is still an exact address for every one. Because members come out " +
          "shortest first, the index is the number itself: element 999,999 " +
          "is 1000000. The clearest demonstration there is that an infinite " +
          "set can still be walked.",
      pt: "O conjunto não tem maior elemento, então não há contagem — mas " +
          "ainda há um endereço exato para cada um. Como os membros saem do " +
          "mais curto para o mais longo, o índice é o próprio número: o " +
          "elemento 999.999 é 1000000. É a demonstração mais clara de que um " +
          "conjunto infinito ainda pode ser percorrido."
    }
  },
  {
    id: "binary",
    pattern: "0|1[01]*",
    flags: "",
    name: { en: "Binary numerals", pt: "Numerais binários" },
    note: {
      en: "The same trick in base two: no leading zeros, so each number is " +
          "written exactly one way, and the enumeration is counting. Element " +
          "255 is 11111111.",
      pt: "O mesmo truque na base dois: sem zeros à esquerda, então cada " +
          "número se escreve de exatamente um jeito, e a enumeração é a " +
          "própria contagem. O elemento 255 é 11111111."
    }
  },
  {
    id: "csv",
    pattern: "(\\d+,)*",
    flags: "",
    name: { en: "Comma-separated numbers",
            pt: "Números separados por vírgula" },
    note: {
      en: "A list of any length, of numbers of any length: two unbounded " +
          "quantifiers, one inside the other. Counting the members of each " +
          "length is what makes it walkable -- there are 1 of length 0, 10 " +
          "of length 2, 100 of length 3 and 1,100 of length 4, so the first " +
          "two-element list sits at index 1,111. Try index 1000000000.",
      pt: "Uma lista de qualquer tamanho, de números de qualquer tamanho: " +
          "dois quantificadores ilimitados, um dentro do outro. Contar os " +
          "membros de cada comprimento é o que torna isso percorrível — há 1 " +
          "de comprimento 0, 10 de comprimento 2, 100 de comprimento 3 e " +
          "1.100 de comprimento 4, então a primeira lista de dois elementos " +
          "fica no índice 1.111. Experimente o índice 1000000000."
    }
  },
  {
    id: "emails",
    pattern: "[a-z]+@[a-z]+\\.(com|org|br)",
    flags: "",
    name: { en: "Simple e-mail addresses",
            pt: "Endereços de e-mail simples" },
    note: {
      en: "Two unbounded quantifiers side by side. Watch the length panel: " +
          "the shortest is five characters, and the number of addresses of " +
          "each length grows by a factor of 26 per character on each side.",
      pt: "Dois quantificadores ilimitados lado a lado. Observe o painel de " +
          "comprimentos: o menor tem cinco caracteres, e a quantidade de " +
          "endereços de cada comprimento cresce por um fator de 26 por " +
          "caractere de cada lado."
    }
  },
  {
    id: "slugs",
    pattern: "[a-z]+(-[a-z]+)*",
    flags: "",
    name: { en: "Hyphenated words", pt: "Palavras hifenizadas" },
    note: {
      en: "A word, or several joined by hyphens -- the shape of a URL slug. " +
          "A repetition whose body is itself unbounded, which is the hardest " +
          "case and the reason the whole enumeration is organised by length.",
      pt: "Uma palavra, ou várias unidas por hífens — o formato de um slug " +
          "de URL. Uma repetição cujo corpo é ele mesmo ilimitado, que é o " +
          "caso mais difícil e a razão de toda a enumeração ser organizada " +
          "por comprimento."
    }
  },
  {
    id: "dna",
    pattern: "[ACGT]+",
    flags: "",
    name: { en: "DNA sequences of any length",
            pt: "Sequências de DNA de qualquer comprimento" },
    note: {
      en: "Every sequence there is. There are 4^n of length n, so the index " +
          "grows fast: element one million is only ten bases long. A good " +
          "one for the length panel.",
      pt: "Toda sequência que existe. Há 4^n de comprimento n, então o " +
          "índice cresce depressa: o elemento um milhão tem apenas dez " +
          "bases. Bom para ver no painel de comprimentos."
    }
  },
  {
    id: "crack",
    pattern: "[a-z]{1,6}",
    flags: "",
    name: { en: "Brute-force a hash", pt: "Quebra de hash por força bruta" },
    note: {
      en: "Every lower-case word up to six letters, in order, with its " +
          "SHA-256 in the code column -- a brute-force search laid out as a " +
          "set. The word whose hash is d0cc4101c015609d3e6e9bff2cfcf643ec4b" +
          "05330949c658472516e2220afae1 is somewhere in here; the code " +
          "flags it. Because the seek is per index, you could hand each of a " +
          "thousand machines a range and none would repeat another's work -- " +
          "which is what the -k key and, in a real tool, a GPU kernel are " +
          "for.",
      pt: "Toda palavra minúscula de até seis letras, em ordem, com seu " +
          "SHA-256 na coluna de código — uma busca por força bruta disposta " +
          "como um conjunto. A palavra cujo hash é d0cc4101c015609d3e6e9bff2" +
          "cfcf643ec4b05330949c658472516e2220afae1 está em algum lugar aqui; " +
          "o código a assinala. Como a busca é por índice, dava para entregar " +
          "a cada uma de mil máquinas uma faixa e nenhuma repetiria o " +
          "trabalho da outra — que é para o que servem a chave -k e, numa " +
          "ferramenta real, um núcleo de GPU."
    },
    code:
      "// Flag the row whose hash matches the target.\n" +
      "var target = \"d0cc4101c015609d3e6e9bff2cfcf643\" +\n" +
      "             \"ec4b05330949c658472516e2220afae1\";\n" +
      "var h = lib.sha256(value);\n" +
      "return h === target ? \"*** \" + value + \" ***\" : h.slice(0, 16);",
    bookmarks: [
      { name: { en: "the hit: kiko", pt: "o acerto: kiko" }, index: "199720" }
    ]
  },
  {
    id: "abba",
    pattern: "(ab|ba)*",
    flags: "",
    name: { en: "Pairs of a and b", pt: "Pares de a e b" },
    note: {
      en: "Only even lengths exist, so half the entries in the length panel " +
          "are zero. A neat illustration that the counts really are per " +
          "length rather than a smooth curve.",
      pt: "Só existem comprimentos pares, então metade das entradas do " +
          "painel de comprimentos é zero. Uma boa ilustração de que as " +
          "contagens são mesmo por comprimento e não uma curva suave."
    }
  }
];
