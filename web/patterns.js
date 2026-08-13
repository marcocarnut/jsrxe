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
    highlight: true,
    pattern: "[0-9A-Za-z]{8}",
    flags: "",
    name: { en: "Eight-Character Passwords",
            pt: "Senhas de Oito Caracteres" },
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
  // -------------------------------------------------------------- tutorial
  // A gentle progression for someone new to regular expressions, built up one
  // idea at a time -- character, string, choice, class, product, repetition,
  // option -- with a couple of genuinely useful sets slipped in so it never
  // feels like a toy.
  {
    id: "one-char",
    tutorial: true,
    pattern: "a",
    flags: "",
    name: { en: "A Single Character", pt: "Um Único Caractere" },
    note: {
      en: "A single character represents itself -- the set with that single " +
          "character, so the set size is 1 and only one line is generated " +
          "with that single lone character.",
      pt: "Um caractere isolado representa ele mesmo -- o conjunto com apenas " +
          "esse caractere, de forma que o tamanho do conjunto é 1 e só uma linha " +
          "é gerada com só esse caractere."
    }
  },
  {
    id: "one-word",
    tutorial: true,
    pattern: { en: "Hello!", pt: "Olá!" },
    flags: "",
    name: { en: "A Single Word", pt: "Uma Única Palavra" },
    note: {
      en: "Adjacent symbols generate cartesian products, but since characters are single-item " +
          "sets, words become themselves. The result is a set of size 1 that generates that word.",
      pt: "Itens adjacentes geram produtos cartesianos, mas como caracteres são conjuntos de " +
          "um caractere só, palavras também se tornam elas mesmas. O resultado é um conjunto " +
          "de tamanho 1 que gera aquela palavra."
    }
  },
  {
    id: "choice",
    tutorial: true,
    pattern: { en: "cat|dog|fish", pt: "gato|cachorro|peixe" },
    flags: "",
    name: { en: "A Choice", pt: "Uma Escolha" },
    note: {
      en: "The vertical bar <tt>|</tt> is typically read as 'or' because it expresses \"alternatives\". "+
          "It actually represents set union, so the resulting set size is the sum of all "+
          "its component sets. Here, <tt>cat</tt> is a set of size 1, and so is <tt>dog</tt> and <tt>fish</tt>, " +
          "resulting in a set of size three.",
      pt: "Lê-se a barra vertical <tt>|</tt> como 'ou' porque ela exprime \"alternativas\". Na verdade, " +
          "ela representa a união de conjuntos: o tamanho do conjunto resultante é a soma de " +
          "todos os conjuntos. Aqui, <tt>gato</tt> é um conjunto de um elemento só, assim como <tt>cachorro</tt> " + 
          "e <tt>peixe</tt>, resultando em um conjunto de três elementos."
    }
  },
  {
    id: "vowels",
    tutorial: true,
    pattern: "[abcdef]",
    flags: "",
    name: { en: "Character Classes", pt: "Classes de Caracteres" },
    note: {
      en: "This is an abbreviated way to write <tt>(a|e|i|o|u)</tt>, so it counts as a " +
          "single character. It can be abbreviated further using ranges: <tt>[a-f]</tt>.",
      pt: "Essa é uma maneira abreviada de escrever <tt>(a|e|i|o|u)</tt>, então conta como " +
          "um único caractere. Pode ser abreviada mais ainda usando intervalos: <tt>[a-f]</tt>."
    }
  },
  {
    id: "chess",
    tutorial: true,
    highlight: true,
    pattern: "[a-h][1-8]",
    flags: "",
    name: { en: "Chessboard Squares", pt: "Casas do Tabuleiro de Xadrez" },
    note: {
      en: "Adjacent sets make cartesian products, so it is easy to generate " +
          "every combination of each element of the first set with every " +
          "element of the other set. We use this here to generate all 64 names " +
          "of chessboard squares under the algebraic notation.",
      pt: "Conjuntos adjacentes geram produtos cartesianos, então é fácil " +
          "gerar todas as combinações de cada elemento do primeiro conjunto com " +
          "todos os elementos do segundo. Valemo-nos disso aqui para gerar todos " +
          "os 64 nomes das casas de tabuleiro de xadrez segundo a notação algébrica." 
    }
  },
  {
    id: "weekdays",
    tutorial: true,
    pattern: {
      en: "(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day",
      pt: "(segunda|terça|quarta|quinta|sexta)-feira"
    },
    flags: "",
    name: { en: "Groups/Subexpressions", pt: "Grupos/Subexpressões" },
    note: {
      en: "Everything within parentheses is considered an independent subset that " +
          "can be combined with everything outside the parentheses. Here, the part inside " +
          "the parentheses is an alternation that generates the seven weekday name prefixes. " + 
          "The <tt>day</tt> is a single element set. One next to the other means cartesian product. " +
          "So the result is a set of 7 x 1 = 7 elements with all full weekday names.",
      pt: "Tudo dentro de parênteses é considerado um subconjunto independente que " +
          "pode ser combinado com tudo fora dos parênteses. Aqui, a parte entre parênteses " +
          "é uma alternação que gera os nomes dos cinco dias úteis. O <tt>feira</tt> é um conjunto "+
          "de um elemento só. Um ao lado do outro significa produto cartesiano, então o " +
          "resultado é um conjunto de 5 x 1 = 5 nomes completos de dias úteis."
    }
  },
  {
    id: "pin",
    tutorial: true,
    pattern: "\\d{4}",
    flags: "",
    name: { en: "Four Digit PINs", pt: "PINs de Quatro Dígitos" },
    note: {
      en: "<tt>\\d</tt> means \"a decimal digit\"; it's an abbreviated form of <tt>[0-9]</tt> (the ten "+
          "characters from zero to nine). <tt>{n}</tt> means \"repeated <i>n</i> times\" -- four "+
          "in this case.",
      pt: "<tt>\\d</tt> significa \"um dígito decimal\"; é uma forma abreviada de <tt>[0-9]</tt> (os dez "+
          "caracteres de zero a nove). <tt>{n}</tt> significa \"repetidos <i>i</i> vezes\" -- quatro, "+
          "nesse caso."
    }
  },
  {
    id: "ranged",
    tutorial: true,
    pattern: "[a-c]{1,3}",
    flags: "",
    name: { en: "A Range of Lengths", pt: "Intervalos de Repetições" },
    note: {
      en: "<tt>{n,m}</tt> means repeat <i>n</i> times, then <i>n+1</i> times, and so on "+
          "up to <i>m</i> times.",
      pt: "<tt>{n,m}</tt> significa repetir <i>n</i> vezes, depois <i>n+1</i> vezes, e "+
          "assim sucessivamente até <i>m</i> vezes."
    }
  },
  {
    id: "optional",
    tutorial: true,
    pattern: {
      en: "colou?r",
      pt: "corrup?ção"
    },
    flags: "",
    name: { en: "An Optional Item", pt: "Um Item Opcional" },
    note: {
      en: "The question mark <tt>?</tt> means that the character or subexpression before it is "+
          "\"optional\". It is equivalent to <tt>{0,1}</tt> (repeat zero to one times).",
      pt: "O ponto de interrogação <tt>?</tt> significa que o caractere ou subexpressão que o precede "+
          "é \"opcional\". É equivalente a <tt>{0,1}</tt> (repita de zero a uma vez)."
    }
  },
  {
    id: "coin",
    tutorial: true,
    pattern: { en: "[HT]{10}", pt: "[Cc]{10}" },
    flags: "",
    name: { en: "Ten Coin Flips", pt: "Dez Lançamentos de Moeda" },
    note: {
      en: "Heads (<tt>H</tt>) or tails (<tt>T</tt>), ten times over: Two possibilities repeated " +
          "ten times (raised to the tenth power) yields 1,024 variations -- our " +
          "first example with a considerable size. You can scroll through them " +
          "using the slider and the navigation controls below.",
      pt: "Cara (<tt>C</tt> maiúsculo) ou coroa (<tt>c</tt> minúsculo), dez vezes seguidas. Duas " +
          "possibilidades repetidas dez vezes (elevadas à décima potência) dão " +
          "1.024 variações -- nosso primeiro exemplo de tamanho considerável. Você " +
          "pode navegar por todas elas mexendo no deslizador e nos demais controles abaixo."
    }
  },
  {
    id: "plus",
    tutorial: true,
    pattern: "\\d+",
    flags: "",
    name: { en: "One or More (+)", pt: "Um ou Mais (+)" },
    note: {
      en: "The <tt>+</tt> means 'one or more', so it is shorthand for <tt>{1,}</tt>: every " +
          "non-empty run of digits. There is no largest one, so the set is " +
          "infinite -- yet every member still has an exact index, and they " +
          "come out shortest first, the index reading as the number itself.",
      pt: "O <tt>+</tt> significa 'um ou mais', então é abreviação de <tt>{1,}</tt>: toda " +
          "sequência não vazia de algarismos. Não há maior elemento, então o " +
          "conjunto é infinito -- mas todo membro ainda tem um índice exato, e " +
          "eles saem do mais curto primeiro, o índice se lendo como o próprio " +
          "número."
    }
  },
  {
    id: "star",
    tutorial: true,
    pattern: "[ab]*",
    flags: "",
    name: { en: "Zero or More (*)", pt: "Zero ou Mais (*)" },
    note: {
      en: "The <tt>*</tt> (star) means 'zero or more', shorthand for <tt>{0,}</tt>. The only difference " +
          "from <tt>+</tt> is that zero is allowed, so the very first member is the " +
          "empty string, before <tt>a</tt>, <tt>b</tt>, <tt>aa</tt>, <tt>ab</tt> and the rest. Still infinite, " +
          "still fully walkable.",
      pt: "O <tt>*</tt> (asterisco) significa 'zero ou mais', abreviação de <tt>{0,}</tt>. A única diferença " +
          "para o <tt>+</tt> é que zero é permitido, então o primeiro membro é a cadeia " +
          "vazia, antes de <tt>a</tt>, <tt>b</tt>, <tt>aa</tt>, <tt>ab</tt> e o resto. Mesmo sendo infinito, esse conjunto " +
          "pode ser percorrido perfeitamente."
    }
  },
  {
    id: "backref",
    tutorial: true,
    pattern: "([0-9]{2})/(\\1)",
    flags: "",
    name: { en: "A Backreference (\\1)", pt: "Uma Retrorreferência (\\1)" },
    note: {
      en: "A hundred elements, not ten thousand: <tt>\\1</tt> does not choose again, it copies " +
          "the exact text the group already chose, so the second pair always " +
          "equals the first. Backreferences are the one thing here a plain " +
          "product of independent positions cannot express. Compare the " +
          "subroutine below, which reuses the rule rather than the text.",
      pt: "Cem elementos, e não dez mil: <tt>\\1</tt> não escolhe de novo, copia o texto exato " +
          "que o grupo já escolheu, então o segundo par é sempre igual ao " +
          "primeiro. Retrorreferências são a única coisa aqui que um produto " +
          "de posições independentes não expressa. Compare com a sub-rotina " +
          "abaixo, que reaproveita a regra, não o texto."
    }
  },
  {
    id: "subroutine",
    tutorial: true,
    pattern: "([0-9]{2}):(?1):(?1)",
    flags: "",
    name: { en: "A Subroutine Call (?1)", pt: "Uma Chamada a Sub-Rotina (?1)" },
    note: {
      en: "A million, not a hundred. <tt>(?1)</tt> looks like a backreference but is " +
          "not: it re-runs group 1's rule -- 'two digits' -- from scratch, so " +
          "each field varies on its own, where <tt>\\1</tt> would have forced them " +
          "equal. It is the subroutine call that lets the IPv4 example write " +
          "one octet once and reuse it with <tt>(?2)</tt>.",
      pt: "Um milhão, e não cem. <tt>(?1)</tt> parece uma retrorreferência, mas não é: " +
          "ele reexecuta a regra do grupo 1 -- 'dois algarismos' -- do zero, " +
          "então cada campo varia por conta própria, onde <tt>\\1</tt> os teria forçado " +
          "iguais. É a chamada de sub-rotina que deixa o exemplo de IPv4 " +
          "escrever um octeto uma vez e reaproveitá-lo com <tt>(?2)</tt>."
    }
  },

  // ------------------------------------------------------ place value and bases
  {
    id: "hex-plain",
    family: { en: "Fixed-Width Numerals", pt: "Numerais de Largura Fixa" },
    pattern: "[0-9A-F]{8}",
    flags: "",
    name: { en: "Eight Hexadecimal Digits", pt: "Oito Dígitos Hexadecimais" },
    note: {
      en: "<tt>[0-9A-F]</tt> generates the 16 possible hexadecimal digits " +
          "and <tt>{8}</tt> repeats them eight times, yielding a set with 4,294,967,296 " +
          "items. By default, repetitions and associativity run right-to-left " +
          "(the same order numbers increase when counting). We can use this to " +
          "do base conversions -- accessing element 3,735,928,559 lands on " +
          "<tt>DEADBEEF</tt>, which is precisely its hexadecimal representation.",
      pt: "<tt>[0-9A-F]</tt> gera os 16 dígitos hexadecimais possíveis e <tt>{8}</tt> " +
          "os repete 8 vezes, resultando em um conjunto com 4.294.967.296 elementos. " +
          "Por padrão, as repetições e associatividade vão da direita para a esquerda " +
          "(a mesma ordem em que os números vão aumentando ao contar). Podemos usar isso " +
          "para fazer conversões de base -- acessar o elemento 3.735.928.559 resulta em " +
          "<tt>DEADBEEF</tt>, que é exatamente sua representação em hexadecimal."
    },
    bookmarks: [
      { name: { en: "DEADBEEF", pt: "DEADBEEF" }, index: "3735928559" }
    ]
  },
  {
    id: "hex",
    highlight: true,
    family: { en: "Fixed-Width Numerals", pt: "Numerais de Largura Fixa" },
    pattern: "[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}",
    flags: "",
    name: { en: "Grouped by a Space", pt: "Agrupado por um Espaço" },
    note: {
      en: "Single-set elements don't mess up the count, so we can add " +
          "spaces between digits for readability: element 280,297,596,648,142 " +
          "is <tt>FEED DEAD FACE</tt>, its hexadecimal representation. Again, this works because " +
          "associativity defaults to right-to-left. Adding <tt>(?L)</tt> to the beginning " +
          "inverts it and the result will be backwards.",
      pt: "Conjuntos de um elemento só não interferem na contagem, então podemos " +
          "adicionar espaços pra facilitar a leitura: o elemento 280.297.596.648.142 " +
          "é <tt>FEED DEAD FACE</tt>, sua representação em hexadecimal. Novamente, isso funciona " +
          "porque a associatividade vai da direita para a esquerda por padrão. Adicionar " +
          "<tt>(?L)</tt> no começo a inverte e o resultado sai ao contrário."
    },
    bookmarks: [
      { name: { en: "FEED DEAD FACE", pt: "FEED DEAD FACE" }, index: "280297596648142" }
    ]
  },
  {
    id: "octal",
    family: { en: "Fixed-Width Numerals", pt: "Numerais de Largura Fixa" },
    pattern: "[0-7]{8}",
    flags: "",
    name: { en: "Eight Octal Digits", pt: "Oito Dígitos Octais" },
    note: {
      en: "Change the base and the count changes with it: eight octal digits " +
          "are 8^8 = 16,777,216, far fewer than the hexadecimal 16^8. Same " +
          "width, smaller alphabet, smaller set.",
      pt: "Mude a base e a contagem muda junto: oito dígitos octais são 8^8 = " +
          "16.777.216, bem menos que os 16^8 do hexadecimal. Mesma largura, " +
          "alfabeto menor, conjunto menor."
    }
  },
  {
    id: "roman",
    highlight: true,
    pattern: "M{0,3}(C{0,3}|CD|DC{0,3}|CM)(X{0,3}|XL|LX{0,3}|XC)" +
             "(I{0,3}|IV|VI{0,3}|IX)",
    flags: "",
    name: { en: "Roman Numerals", pt: "Algarismos Romanos" },
    note: {
      en: "All 4,000 Roman numerals. The index happens " +
          "to be the value: element 3,999 really is <tt>MMMCMXCIX</tt>, " +
          "because the expression is written so that the thousands, " +
          "hundreds, tens and units are in the same order as decimal digits.",
      pt: "Todos os 4.000 algarismos romanos. O índice coincide " +
          "com o valor: o elemento 3.999 é de fato " +
          "<tt>MMMCMXCIX</tt>, porque a expressão está escrita de forma que os milhares, " +
          "centenas, dezenas e unidades ocorram na mesma ordem que os dígitos decimais."
    },
    // Since the index is the value, element 42 is XLII: the Answer to Life,
    // the Universe, and Everything, in Roman.
    bookmarks: [
      { name: { en: "the Answer to Everything", pt: "a Resposta para Tudo" },
        index: "42" }
    ]
  },
  {
    id: "ipv4",
    pattern: "((\\d|[1-9]\\d|1\\d\\d|2[0-4]\\d|25[0-5])\\.){3}(?2)",
    flags: "",
    name: { en: "IPv4 Addresses", pt: "Endereços IPv4" },
    note: {
      en: "All 4,294,967,296 of them, and exactly them: the alternation " +
          "only includes valid numbers. Note <tt>(?2)</tt>, which reuses the second " +
          "parenthesised group as a subroutine rather than writing it out a " +
          "fourth time.",
      pt: "Todos os 4.294.967.296, e exatamente eles: a alternação só inclui " +
          "números válidos. Repare no <tt>(?2)</tt>, que reaproveita o segundo grupo " +
          "entre parênteses como sub-rotina em vez de escrevê-lo uma quarta " +
          "vez."
    }
  },
  {
    id: "placa-antiga",
    highlight: true,
    family: { en: "Brazilian License Plates", pt: "Placas de Carro Brasileiras" },
    pattern: "[A-Z]{3}\\d{4}",
    flags: "",
    name: { en: "Old Standard (pre-2018)", pt: "Padrão Antigo (pré-2018)" },
    note: {
      en: "The pre-2018 Brazilian format: three letters followed by four " +
          "digits: 175,760,000 plates. Compare the count with the Mercosul " +
          "format below -- the new one is larger, which was the point of " +
          "changing it.",
      pt: "O padrão brasileiro anterior a 2018: três letras seguidas de quatro " +
          "dígitos: 175.760.000 placas. Compare a contagem com o padrão " +
          "Mercosul abaixo: o novo é maior, que foi justamente a razão da " +
          "mudança."
    }
  },
  {
    id: "placa-mercosul",
    highlight: true,
    family: { en: "Brazilian License Plates", pt: "Placas de Carro Brasileiras" },
    pattern: "[A-Z]{3}\\d[A-Z]\\d{2}",
    flags: "",
    name: { en: "Mercosul", pt: "Mercosul" },
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
    id: "cnpj-num-all",
    family: { en: "Brazilian Legal Person ID", pt: "CNPJs Brasileiros" },
    pattern: "\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}",
    flags: "",
    name: { en: "Pre-2026: Valid plus Invalid", pt: "Pré-2026: Válidos e Inválidos" },
    note: {
      en: "The Brazilian company number as it stood before 2026: fourteen " +
          "digits, punctuation and all, 10^14 of them. The last two range " +
          "freely over 00 to 99, so only a hundredth carry a valid mod-11 checksum.",
      pt: "O CNPJ como era antes de 2026: catorze algarismos, pontuação e " +
          "tudo, 10^14 deles. Os dois últimos variam livremente de 00 a 99, " +
          "então só um centésimo deles tem o verificador mod 11 válido."
    }
  },
  {
    id: "cnpj-num-valid",
    family: { en: "Brazilian Legal Person ID", pt: "CNPJs Brasileiros" },
    pattern: "\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}",
    flags: "",
    name: { en: "Pre-2026: Valid Digits Only", pt: "Pré-2026: Somente Válidos" },
    note: {
      en: "The regex stops before the checksum and the code computes and appends it, so " +
          "every row is a genuinely valid CNPJ (the Brazilian Legal Person Taxpayer ID).",
      pt: "A expressão termina antes do dígito verificador, que é calculado e acrescido " +
          "no final pelo código auxiliar. Portanto, cada linha é um CNPJ de fato válido."
    },
    code:
      "// Strip the punctuation to the twelve-digit base, then append the two\n" +
      "// check digits computed as Receita Federal specifies.\n" +
      "var base = lib.keep(value, \"0-9\");\n" +
      "return value + \"-\" + lib.checkDigits(base,\n" +
      "  [5,4,3,2,9,8,7,6,5,4,3,2],\n" +
      "  [6,5,4,3,2,9,8,7,6,5,4,3,2]);"
  },
  {
    id: "cnpj-all",
    family: { en: "Brazilian Legal Person ID", pt: "CNPJs Brasileiros" },
    pattern: "[0-9A-Z]{2}\\.[0-9A-Z]{3}\\.[0-9A-Z]{3}/[0-9A-Z]{4}-\\d{2}",
    flags: "",
    name: { en: "Post-2026: Valid plus Invalid", pt: "Pós-2026: Válidos e Inválidos" },
    note: {
      en: "From 2026 the Brazilian company number admits letters as well. The two final " +
          "digits range freely over 00 to 99, so a hundredth of these carry " +
          "the correct checksum.",
      pt: "A partir de 2026 o CNPJ admite letras também. Os dois algarismos finais variam " +
          "livremente de 00 a 99, então só um centésimo destes carrega o " +
          "verificador correto."
    }
  },
  {
    id: "cnpj-valid",
    highlight: true,
    family: { en: "Brazilian Legal Person ID", pt: "CNPJs Brasileiros" },
    pattern: "[0-9A-Z]{2}\\.[0-9A-Z]{3}\\.[0-9A-Z]{3}/[0-9A-Z]{4}",
    flags: "",
    name: { en: "Post-2026: Valid Digits Only", pt: "Pós-2026: Somente Válidos" },
    note: {
      en: "Now the regex stops before the checksum and the code computes it, " +
          "so every row is a genuinely valid CNPJ. The check digit still uses mod 11 " + 
          "over each character's ASCII code point minus 48, which is exactly why it " +
          "survived the letters unchanged.",
      pt: "Agora a expressão termina antes do verificador e o código o calcula, " +
          "então cada linha é um CNPJ de fato válido. O " +
          "dígito continua usando mod 11 sobre o código ASCII de cada caractere " +
          "menos 48 e, por isso, não quebra compatibilidade com o formato pré-2026."
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
    family: { en: "CPF (Brazilian Taxpayer Number)", pt: "CPFs Brasileiros" },
    pattern: "\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}",
    flags: "",
    name: { en: "Valid plus Invalid", pt: "Válidos e Inválidos" },
    note: {
      en: "All 10^11 well-formed CPFs. The last two digits range over 00 to " +
          "99, so only a hundredth carry the correct mod-11 checksum.",
      pt: "Todos os 10^11 CPFs bem formados. Os dois últimos algarismos " +
          "variam de 00 a 99, então só um centésimo tem os dígitos verificadores corretos."
    }
  },
  {
    id: "cpf-valid",
    family: { en: "CPF (Brazilian Taxpayer Number)", pt: "CPFs Brasileiros" },
    pattern: "\\d{3}\\.\\d{3}\\.\\d{3}",
    flags: "",
    name: { en: "Valid Digits Only", pt: "Somente Válidos" },
    note: {
      en: "The regex stops before the checksum and the code appends it, so " +
          "every row is a valid CPF with the correct check digits.",
      pt: "A expressão termina antes do verificador e o código o acrescenta, " +
          "então cada linha é um CPF válido com dígitos verificadores corretos."
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
    name: { en: "CEP (Brazilian Postcode)", pt: "CEP" },
    note: {
      en: "A hundred million of them. Small enough that the whole set could " +
          "be written out, big enough that you would not want to. It is said that " +
          "less than a million of them are actually in use.",
      pt: "Cem milhões deles. Pequeno o bastante para que o conjunto inteiro " +
          "pudesse ser escrito, grande o bastante para que você não queira. " +
          "Menos de um milhão deles estão realmente sendo usados."
    }
  },
  {
    id: "mac",
    pattern: "([0-9A-F]{2}:){5}[0-9A-F]{2}",
    flags: "",
    name: { en: "MAC Addresses", pt: "Endereços MAC" },
    note: {
      en: "281,474,976,710,656 -- 2^48 exactly, which the count panel shows " +
          "with an equals sign rather than a tilde because the power is " +
          "exact. These IDs are used by WiFi, Ethernet and Bluetooth devices.",
      pt: "281.474.976.710.656 — exatamente 2^48, o que o painel de contagem " +
          "mostra com sinal de igual em vez de til, porque a potência é exata. " +
          "Esses identificadores são usados por dispositivos WiFi, Ethernet e Bluetooth."
    }
  },
  {
    id: "uuid4",
    highlight: true,
    pattern: "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-" +
             "[0-9a-f]{12}",
    flags: "",
    name: { en: "UUID Version 4", pt: "UUID Versão 4" },
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
    name: { en: "Koremutake System", pt: "Sistema Koremutake" },
    family: { en: "Pronounceable Passwords", pt: "Senhas Pronunciáveis" },
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
    name: { en: "ISO Dates, 1900 to 2099", pt: "Datas ISO, 1900 a 2099" },
    note: {
      en: "74,400 of them: 200 years times 12 months times 31 days. That is " +
          "more than there are real dates, because a regular expression " +
          "cannot know that February is short or that leap years exist. " +
          "Worth seeing -- the set a pattern describes is often slightly " +
          "wider than the one you meant.",
      pt: "74.400: 200 anos vezes 12 meses vezes 31 dias. É mais do que o " +
          "número de datas reais, porque uma expressão regular não sabe que " +
          "fevereiro é mais curto nem que existem anos bissextos. Vale ver: o " +
          "conjunto que um padrão descreve costuma ser um pouco maior " +
          "que o pretendido."
    }
  },
  {
    id: "webcolor",
    pattern: "#[0-9a-f]{6}",
    flags: "",
    name: { en: "Web Colours", pt: "Cores da Web" },
    note: {
      en: "Every CSS hex colour, <tt>#000000</tt> to <tt>#ffffff</tt>: 16^6 = 16,777,216 of " +
          "them. The index is the colour's 24-bit value, so seeking to " +
          "16,711,680 lands on <tt>#ff0000</tt>, pure red.",
      pt: "Toda cor hexadecimal de CSS, de <tt>#000000</tt> a <tt>#ffffff</tt>: 16^6 = " +
          "16.777.216 delas. O índice é o valor de 24 bits da cor, então ir " +
          "para 16.711.680 cai em <tt>#ff0000</tt>, o vermelho puro."
    },
    bookmarks: [
      { name: { en: "#ff0000 (red)", pt: "#ff0000 (vermelho)" },
        index: "16711680" }
    ]
  },
  {
    id: "clock",
    pattern: "([01]\\d|2[0-3]):[0-5]\\d",
    flags: "",
    name: { en: "Every Minute of a Day", pt: "Todos os Minutos de um Dia" },
    note: {
      en: "1,440 of them: 24 hours times 60 minutes. The alternation in the " +
          "hours earns its keep -- it admits 00 through 23 and nothing higher, " +
          "which a bare <tt>\\d\\d</tt> could not.",
      pt: "1.440 deles: 24 horas vezes 60 minutos. A alternação nas horas faz " +
          "por merecer -- admite de 00 a 23 e nada acima, o que um simples " +
          "<tt>\\d\\d</tt> não conseguiria."
    }
  },
  {
    id: "cards",
    pattern: {
      en: "(Ace|[2-9]|10|Jack|Queen|King) of (Spades|Clubs|Hearts|Diamonds)",
      pt: "(Ás|[2-9]|10|Valete|Dama|Rei) de (Espadas|Paus|Copas|Ouro)"
    },
    flags: "",
    name: { en: "A Deck of Cards", pt: "Um Baralho" },
    note: {
      en: "Fifty-two, written out in full: thirteen ranks by four suits. In " +
          "plain index order it comes out sorted, the Ace of Spades first. " +
          "Add <tt>(?~something)</tt> at the beginning to shuffle, or click on some of the bookmarks.",
      pt: "Cinquenta e duas, escritas por extenso: treze valores por quatro " +
          "naipes. Em ordem de índice sai ordenado, o Ás de Espadas primeiro. " +
          "Acrescente <tt>(?~algumacoisa)</tt> no começo para embaralhar, ou clique em algum dos favoritos."
    },
    bookmarks: [
      { name: { en: "in order", pt: "em ordem" }, index: "0" },
      { name: { en: "shuffle: riffle", pt: "embaralho: riffle" },
        index: "0", key: "riffle" },
      { name: { en: "shuffle: overhand", pt: "embaralho: cascata" },
        index: "0", key: "overhand" },
      { name: { en: "shuffle: casino", pt: "embaralho: cassino" },
        index: "0", key: "casino" }
    ]
  },
  {
    id: "tictactoe",
    pattern: "[XO.]{9}",
    flags: "",
    name: { en: "Tic-Tac-Toe Boards", pt: "Tabuleiros de Jogo da Velha" },
    note: {
      en: "Every board of nine cells, each empty, <tt>X</tt> or <tt>O</tt>: 3^9 = 19,683. Most " +
          "are unreachable in a real game -- the set a pattern describes is " +
          "the whole space of positions, not the ones the rules allow.",
      pt: "Todo tabuleiro de nove casas, cada uma vazia, <tt>X</tt> ou <tt>O</tt>: 3^9 = " +
          "19.683. A maioria é inatingível num jogo real -- o conjunto que um " +
          "padrão descreve é todo o espaço de posições, não as que as regras " +
          "permitem."
    }
  },
  {
    id: "codons",
    pattern: "[ACGT]{3}",
    flags: "",
    name: { en: "Genetic Codons", pt: "Códons Genéticos" },
    note: {
      en: "The 64 codons of the genetic code: three bases from <tt>{A,C,G,T}</tt>. " +
          "Exactly as many as the chessboard has squares, and for the same " +
          "reason -- 4^3 and 8^2 are both 64.",
      pt: "Os 64 códons do código genético: três bases de <tt>{A,C,G,T}</tt>. " +
          "Exatamente tantos quantos o tabuleiro de xadrez tem casas, e pela " +
          "mesma razão -- 4^3 e 8^2 são ambos 64."
    }
  },
  {
    id: "choose-letters",
    highlight: true,
    family: { en: "Combinatorics", pt: "Combinatória" },
    pattern: "[a-z]{{3}}",
    flags: "",
    name: { en: "Three Distinct Letters", pt: "Três Letras Distintas" },
    note: {
      en: "The nonstandard <tt>{{ }}</tt> quantifier chooses from a set rather than " +
          "repeating it. <tt>[a-z]{{3}}</tt> is every unordered set of three distinct " +
          "letters -- C(26,3) = 2,600. Compare <tt>[a-z]{3}</tt>, which is 17,576: " +
          "ordinary repetition allows repeats and counts order.",
      pt: "O quantificador não padrão <tt>{{ }}</tt> escolhe de um conjunto em vez de " +
          "repeti-lo. <tt>[a-z]{{3}}</tt> é todo conjunto não ordenado de três letras " +
          "distintas -- C(26,3) = 2.600. Compare com <tt>[a-z]{3}</tt>, que dá 17.576: " +
          "a repetição comum permite repetições e conta a ordem."
    }
  },
  {
    id: "handshakes",
    family: { en: "Combinatorics", pt: "Combinatória" },
    pattern: "[A-E]{{2}}",
    flags: "",
    name: { en: "Polygons and Their Diagonals", pt: "Polígonos e Suas Diagonais" },
    note: {
      en: "Assigning letters to each vertex of a polygon lists all its edges and diagonals. " +
          "This also numbers all handshakes that would happen in a group of " +
          "people when everyone shakes everyone else's hands.",
      pt: "Atribuindo letras a cada vértice de um polígono, lista todas as suas arestas e diagonais. "+
          "Isso também são todos os apertos de mão que aconteceriam se todos em um grupo cumprimentassem uns aos outros."
    },
    code: {
      pt: "var p = { \"A\": \"Aldo\", \"B\": \"Beto\", \"C\": \"Caio\", \"D\": \"Duda\", \"E\": \"Enio\" }\n"+
          "return p[value[0]] + \" cumprimenta \" + p[value[1]];",
      en: "var p = { \"A\": \"Ariel\", \"B\": \"Bella\", \"C\": \"Cheng\", \"D\": \"Daisy\", \"E\": \"Ellen\" }\n"+
          "return p[value[0]] + \" shakes hands with \" + p[value[1]];"
   }
  },
  {
    id: "anagrams",
    family: { en: "Combinatorics", pt: "Combinatória" },
    pattern: { en: "(S|T|O|P){{*}}", pt: "(A|M|O|R){{*}}" },
    flags: "",
    name: { en: "Anagrams of STOP", pt: "Anagramas de AMOR" },
    note: {
      en: "<tt>{{*}}</tt> is every ordering of the members: 4! = 24 rearrangements " +
          "of <tt>S</tt>, <tt>T</tt>, <tt>O</tt>, <tt>P</tt>, with real words among them -- <tt>POTS</tt>, <tt>TOPS</tt>, <tt>OPTS</tt>, <tt>SPOT</tt>.",
      pt: "<tt>{{*}}</tt> é toda ordenação dos membros: 4! = 24 rearranjos de <tt>A</tt>, <tt>M</tt>, " +
          "<tt>O</tt>, <tt>R</tt>, com palavras reais entre eles -- <tt>ROMA</tt>, <tt>RAMO</tt>, <tt>MORA</tt>, <tt>AMOR</tt>."
    }
  },
  {
    id: "poker",
    highlight: true,
    family: { en: "Combinatorics", pt: "Combinatória" },
    pattern: "([2-9TJQKA][SHDC]){{5}}",
    flags: "",
    name: { en: "Poker Hands", pt: "Mãos de Pôquer" },
    note: {
      en: "Every five-card hand from a 52-card deck: C(52,5) = 2,598,960. " +
          "Seek to any of them instantly, or ask for a random one -- the whole " +
          "space of hands, indexed, without dealing a single card.",
      pt: "Toda mão de cinco cartas de um baralho de 52: C(52,5) = 2.598.960. " +
          "Vá a qualquer uma na hora, ou peça uma aleatória -- todo o espaço " +
          "de mãos, indexado, sem distribuir uma única carta."
    }
  },
  {
    id: "megasena",
    family: { en: "Combinatorics", pt: "Combinatória" },
    pattern: {
      en: "\\[( 0[1-9]| [1-5][0-9]| 6[0-9]){{5}} \\+( 0[1-9]| 1[0-9]| 2[0-6]) \\]",
      pt: "\\[( 0[1-9]| [1-5][0-9]| 60){{6}} \\]"
    },
    flags: "",
    name: { en: "Powerball Tickets", pt: "Jogos da Mega-Sena" },
    note: {
      en: "Five white balls from 1 to 69, unordered, then one red Powerball " +
          "from 1 to 26 -- set off with a <tt>+</tt> because it is drawn separately " +
          "and may repeat a white number. C(69,5) x 26 = 292,201,338 plays, " +
          "every possible Powerball ticket. Each number is two digits wide with " +
          "its own space, and the whole draw sits in brackets.",
      pt: "Seis números de 1 a 60, sem ordem: C(60,6) = 50.063.860 -- todos os " +
          "jogos possíveis da Mega-Sena. Faça seu bolão: troque o 60 por 10, " +
          "jogue os 210 bilhetes listados e se o bilhete premiado tiver quaisquer " +
          "seis dentre esses dez números, o prêmio é seu! Aumente 10 para o quanto " +
          "puder pagar em bilhetes e boa sorte!"
    }
  },
  {
    id: "keyed-shuffle",
    highlight: true,
    family: { en: "Combinatorics", pt: "Combinatória" },
    pattern: "(?~secret:\\d{2})-\\d{2}",
    flags: "",
    name: { en: "Keyed Shuffle of a Field", pt: "Embaralhamento com Chave" },
    note: {
      en: "<tt>(?~key:...)</tt> reorders a subexpression's set by a key. The left " +
          "field visits all of <tt>00-99</tt> in a scrambled but reproducible order, " +
          "while the right one counts up plainly beside it -- same 10,000 " +
          "members, one field shuffled. Change <tt>secret</tt> to any word and the " +
          "left field reshuffles; it is format-preserving encryption in " +
          "miniature. Only finite sets can be shuffled.",
      pt: "<tt>(?~chave:...)</tt> reordena o conjunto de uma subexpressão por uma " +
          "chave. O campo da esquerda percorre todos os <tt>00-99</tt> numa ordem " +
          "embaralhada mas reproduzível, enquanto o da direita conta normalmente " +
          "ao lado -- os mesmos 10.000 membros, um campo embaralhado. Troque " +
          "<tt>secret</tt> por qualquer palavra e a esquerda se reembaralha; é cifra " +
          "que preserva formato em miniatura. Só conjuntos finitos podem ser " +
          "embaralhados."
    }
  },
  {
    id: "celular",
    pattern: "\\+55 \\d{2} 9\\d{4}-\\d{4}",
    flags: "",
    name: { en: "Brazilian Mobile Numbers", pt: "Celulares Brasileiros" },
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
    name: { en: "Chord Names", pt: "Nomes de Acordes" },
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
    highlight: true,
    family: { en: "Passphrases", pt: "Frases-senha" },
    pattern: "[:bip39en:]( [:bip39en:]){11}",
    flags: "",
    name: { en: "BIP-39 Seed, 12 Words", pt: "Semente BIP-39, 12 Palavras" },
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
    name: { en: "Diceware, 6 Words", pt: "Diceware, 6 Palavras" },
    note: {
      en: "Six words from the 1296-word Diceware list, 1296^6, about 4.7 " +
          "times 10^18 or 2^62. Switch the pattern to <tt>[:diceware4ptbr:]</tt> for " +
          "the Brazilian Portuguese list of the same size.",
      pt: "Seis palavras da lista Diceware de 1296, 1296^6, cerca de 4,7 " +
          "vezes 10^18 ou 2^62. Troque o padrão por <tt>[:diceware4ptbr:]</tt> para a " +
          "lista em português brasileiro do mesmo tamanho."
    }
  },
  {
    id: "eff-6",
    family: { en: "Passphrases", pt: "Frases-senha" },
    pattern: "[:efflarge:]( [:efflarge:]){5}",
    flags: "",
    name: { en: "EFF, 6 Words", pt: "EFF, 6 Palavras" },
    note: {
      en: "The EFF's own recommendation: six words from its 7776-word list, " +
          "7776^6, about 2^77. Open the time reveal on the size box to see " +
          "how long guessing them all would take.",
      pt: "A recomendação da própria EFF: seis palavras de sua lista de 7776, " +
          "7776^6, cerca de 2^77. Abra a revelação de tempo na caixa do " +
          "tamanho para ver quanto levaria adivinhar todas."
    }
  },
  {
    id: "months",
    pattern: "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) " +
             "(0[1-9]|[12]\\d|3[01])",
    flags: "",
    name: { en: "Abbreviated Month and Day",
            pt: "Mês Abreviado e Dia" },
    note: {
      en: "An alternation of twelve names against a two-digit day: 372 " +
          "combinations, because a regular expression has no idea that " +
          "February is short. Swap the names for <tt>Jan|Fev|Mar|Abr|Mai|Jun|" +
          "Jul|Ago|Set|Out|Nov|Dez</tt> and the count does not move -- the " +
          "expression is the specification, and twelve alternatives are " +
          "twelve alternatives whatever language they are in.",
      pt: "Uma alternação de doze nomes contra um dia de dois algarismos: " +
          "372 combinações, porque uma expressão regular não faz ideia de " +
          "que fevereiro é curto. Troque os nomes por <tt>Jan|Fev|Mar|Abr|Mai|" +
          "Jun|Jul|Ago|Set|Out|Nov|Dez</tt> e a contagem não muda — a expressão " +
          "é a especificação, e doze alternativas são doze alternativas em " +
          "qualquer idioma."
    }
  },
  // -------------------------------------------------------------- infinite

  {
    id: "naturals",
    pattern: "[1-9][0-9]*",
    flags: "",
    name: { en: "Every Positive Integer", pt: "Todo Inteiro Positivo" },
    note: {
      en: "The set has no largest member, so there is no count -- but there " +
          "is still an exact address for every one. Because members come out " +
          "shortest first, the index is the number itself: element 999,999 " +
          "is <tt>1000000</tt>. The clearest demonstration there is that an infinite " +
          "set can still be walked.",
      pt: "O conjunto não tem maior elemento, então não há contagem — mas " +
          "ainda há um endereço exato para cada um. Como os membros saem do " +
          "mais curto para o mais longo, o índice é o próprio número: o " +
          "elemento 999.999 é <tt>1000000</tt>. É a demonstração mais clara de que um " +
          "conjunto infinito ainda pode ser percorrido."
    }
  },
  {
    id: "binary",
    pattern: "0|1[01]*",
    flags: "",
    name: { en: "Binary Numerals", pt: "Numerais Binários" },
    note: {
      en: "The same trick in base two: no leading zeros, so each number is " +
          "written exactly one way, and the enumeration is counting. Element " +
          "255 is <tt>11111111</tt>.",
      pt: "O mesmo truque na base dois: sem zeros à esquerda, então cada " +
          "número se escreve de exatamente um jeito, e a enumeração é a " +
          "própria contagem. O elemento 255 é <tt>11111111</tt>."
    }
  },
  {
    id: "csv",
    pattern: "(\\d+,)*",
    flags: "",
    name: { en: "Comma-Separated Numbers",
            pt: "Números Separados por Vírgula" },
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
    name: { en: "Simple E-mail Addresses",
            pt: "Endereços de E-mail Simples" },
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
    name: { en: "Hyphenated Words", pt: "Palavras Hifenizadas" },
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
    name: { en: "DNA Sequences of Any Length",
            pt: "Sequências de DNA de Qualquer Comprimento" },
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
    highlight: true,
    pattern: "[a-z]{1,6}",
    flags: "",
    name: { en: "Brute-Force a Hash", pt: "Quebra de Hash por Força Bruta" },
    note: {
      en: "Every lower-case word up to six letters, in order, with its " +
          "SHA-256 in the code column -- a brute-force search laid out as a " +
          "set. The word whose hash is <tt>d0cc4101c015609d3e6e9bff2cfcf643ec4b" +
          "05330949c658472516e2220afae1</tt> is somewhere in here; the code " +
          "flags it. Because the seek is per index, you could hand each of a " +
          "thousand machines a range and none would repeat another's work -- " +
          "which is what the -k key and, in a real tool, a GPU kernel are " +
          "for.",
      pt: "Toda palavra minúscula de até seis letras, em ordem, com seu " +
          "SHA-256 na coluna de código — uma busca por força bruta disposta " +
          "como um conjunto. A palavra cujo hash é <tt>d0cc4101c015609d3e6e9bff2" +
          "cfcf643ec4b05330949c658472516e2220afae1</tt> está em algum lugar aqui; " +
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
