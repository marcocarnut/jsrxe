// English and Brazilian Portuguese. The selector sits in the top left corner.

export const LANGS = { en: "English", pt: "Português" };

export const STRINGS = {
  en: {
    title:            "rxenum",
    subtitle:         "Regular expressions as sets you can count and walk",

    patternLabel:     "Regular expression",
    patternPlace:     "[0-9A-Za-z]{8}   —   flags go inline: (?i) (?s) (?L)",

    library:          "Examples",
    helpers:          "Helpers",
    helpersHint:      "Functions the code section can call, as lib.name. All are pure, so an example behaves the same wherever it runs.",
    bookmarks:        "Bookmarks",
    addBookmark:      "Bookmark this index",
    bmName:           "Name",
    bmAt:             "At index",
    editOne:          "Edit",
    addEdit:          "Edit example",
    libSearch:        "Filter…",
    libFinite:        "Finite",
    libInfinite:      "Infinite",
    libMine:          "Mine",
    addOwn:           "Save current as example",
    addName:          "Name",
    addNote:          "Notes",
    addSave:          "Save",
    addCancel:        "Cancel",
    deleteOne:        "Delete",
    deleteConfirm:    "Delete this example?",
    savedHere:        "Saved in this browser only.",

    size:             "Size of the set",
    sizeInfinite:     "No largest member",
    sizeEmpty:        "Empty — nothing matches",
    approx:           "approximately",
    exact:            "exactly",

    order:            "Enumeration order",
    orderPlace:       "place value",
    orderShortlex:    "shortest first",
    orderDiagonal:    "diagonal",
    orderPlaceHint:   "A finite set is a numeral: the last position varies fastest, so the index reads as a number in another base.",
    orderShortlexHint:"Members come out shortest first. There is no count, but every member still has an exact index.",
    orderDiagonalHint:"A backreference ties two positions' lengths together, so the lengths cannot be counted separately. Every member is still reached, but not shortest first.",

    elements:         "Elements",
    fromIndex:        "From index",
    perPage:          "Per page",
    zeroBased:        "Count from zero",
    zeroHint:         "-z",
    key:              "Shuffle key",
    keyPlace:         "leave empty for index order",
    keyHint:          "-k — walks the whole set in an order that depends on the key, visiting every member exactly once",
    keyNeedsFinite:   "A shuffle key needs a finite set.",

    first:            "First",
    prev:             "Previous",
    next:             "Next",
    last:             "Last",
    random:           "Random",
    randomHint:       "-r",
    randomNeedsFinite:"Random choice needs a finite set.",
    go:               "Go",

    indexCol:         "index",
    valueCol:         "element",
    outputCol:        "output",
    emptyString:      "(empty string)",

    codeTitle:        "Code",
    codeHint:         "JavaScript run on each element. 'value' is the element, 'index' its index, 'lib' a helper with sha256, mod11, checkDigits, keep and toHex. Return what to show. Left empty, the output column is hidden.",
    codePlace:        "return value + lib.checkDigits(lib.keep(value, \"0-9\"), [10,9,8,7,6,5,4,3,2], [11,10,9,8,7,6,5,4,3,2]);",

    working:          "Working…",
    parseError:       "Cannot read that expression",
    pastEnd:          "That index is past the end of the set",
    truncated:        "shown truncated",

    sliderHintFinite: "The slider moves in large jumps through the whole set; the mouse wheel over the list moves a few elements at a time.",
    sliderHintLength: "There is no proportion to slide along, so the slider steps by length instead: each notch jumps to the first element of the next length. The mouse wheel moves a few elements at a time.",
    sliderLength:     "length",
    sliderAt:         "first element of length",

    copy:             "Copy",
    copied:           "Copied",
    repoLib:          "the C library and command-line tool",
    repoApp:          "this page",
    aboutTitle:       "About",
    about:            "This is librxe compiled to WebAssembly — the same C the command-line tool uses, not a reimplementation, so what you see here is exactly what rxenum prints."
  },

  pt: {
    title:            "rxenum",
    subtitle:         "Expressões regulares como conjuntos que se pode contar e percorrer",

    patternLabel:     "Expressão regular",
    patternPlace:     "[0-9A-Za-z]{8}   —   opções inline: (?i) (?s) (?L)",

    library:          "Exemplos",
    helpers:          "Auxiliares",
    helpersHint:      "Funções que a seção de código pode chamar, como lib.nome. Todas são puras, então um exemplo se comporta igual onde quer que rode.",
    bookmarks:        "Marcadores",
    addBookmark:      "Marcar este índice",
    bmName:           "Nome",
    bmAt:             "No índice",
    editOne:          "Editar",
    addEdit:          "Editar exemplo",
    libSearch:        "Filtrar…",
    libFinite:        "Finitos",
    libInfinite:      "Infinitos",
    libMine:          "Meus",
    addOwn:           "Salvar o atual como exemplo",
    addName:          "Nome",
    addNote:          "Observações",
    addSave:          "Salvar",
    addCancel:        "Cancelar",
    deleteOne:        "Excluir",
    deleteConfirm:    "Excluir este exemplo?",
    savedHere:        "Guardado apenas neste navegador.",

    size:             "Tamanho do conjunto",
    sizeInfinite:     "Não há maior elemento",
    sizeEmpty:        "Vazio — nada casa",
    approx:           "aproximadamente",
    exact:            "exatamente",

    order:            "Ordem de enumeração",
    orderPlace:       "valor posicional",
    orderShortlex:    "do mais curto",
    orderDiagonal:    "diagonal",
    orderPlaceHint:   "Um conjunto finito é um numeral: a última posição varia mais rápido, então o índice se lê como um número em outra base.",
    orderShortlexHint:"Os membros saem do mais curto para o mais longo. Não há contagem, mas todo membro ainda tem um índice exato.",
    orderDiagonalHint:"Uma retrorreferência amarra o comprimento de duas posições, então os comprimentos não podem ser contados separadamente. Todo membro ainda é alcançado, mas não do mais curto para o mais longo.",

    elements:         "Elementos",
    fromIndex:        "A partir do índice",
    perPage:          "Por página",
    zeroBased:        "Contar a partir de zero",
    zeroHint:         "-z",
    key:              "Chave de embaralhamento",
    keyPlace:         "vazio para ordem de índice",
    keyHint:          "-k — percorre todo o conjunto numa ordem que depende da chave, visitando cada membro exatamente uma vez",
    keyNeedsFinite:   "A chave de embaralhamento precisa de um conjunto finito.",

    first:            "Início",
    prev:             "Anterior",
    next:             "Próxima",
    last:             "Fim",
    random:           "Aleatório",
    randomHint:       "-r",
    randomNeedsFinite:"A escolha aleatória precisa de um conjunto finito.",
    go:               "Ir",

    indexCol:         "índice",
    valueCol:         "elemento",
    outputCol:        "saída",
    emptyString:      "(cadeia vazia)",

    codeTitle:        "Código",
    codeHint:         "JavaScript executado em cada elemento. 'value' é o elemento, 'index' o índice, 'lib' um auxiliar com sha256, mod11, checkDigits, keep e toHex. Retorne o que exibir. Vazio, a coluna de saída fica oculta.",
    codePlace:        "return value + lib.checkDigits(lib.keep(value, \"0-9\"), [10,9,8,7,6,5,4,3,2], [11,10,9,8,7,6,5,4,3,2]);",

    working:          "Trabalhando…",
    parseError:       "Não consigo ler essa expressão",
    pastEnd:          "Esse índice está além do fim do conjunto",
    truncated:        "mostrado truncado",

    sliderHintFinite: "O cursor deslizante se move em grandes saltos por todo o conjunto; a roda do mouse sobre a lista move poucos elementos por vez.",
    sliderHintLength: "Não há proporção para deslizar, então o cursor avança por comprimento: cada passo salta para o primeiro elemento do comprimento seguinte. A roda do mouse move poucos elementos por vez.",
    sliderLength:     "comprimento",
    sliderAt:         "primeiro elemento de comprimento",

    copy:             "Copiar",
    copied:           "Copiado",
    repoLib:          "a biblioteca em C e a ferramenta de linha de comando",
    repoApp:          "esta página",
    aboutTitle:       "Sobre",
    about:            "Isto é a librxe compilada para WebAssembly — o mesmo C que a ferramenta de linha de comando usa, e não uma reimplementação, de modo que o que se vê aqui é exatamente o que o rxenum imprime."
  }
};

// The parser's status codes carry English messages. These are the same
// messages in Portuguese, keyed by the English one, so that nothing has to
// reach into the library's enum from here.
export const ERRORS = {
  pt: {
    "infinite":                        "infinito",
    "extraneous parentheses":          "parênteses sobrando",
    "missing parentheses":             "faltam parênteses",
    "nothing before quantifier":       "nada antes do quantificador",
    "nested quantifiers":              "quantificadores aninhados",
    "unterminated literal":            "literal não terminado",
    "unterminated character class":    "classe de caracteres não terminada",
    "unterminated repetition":         "repetição não terminada",
    "unterminated flags":              "opções não terminadas",
    "bad repetition parameters":       "parâmetros de repetição inválidos",
    "unimplemented":                   "não implementado",
    "invalid backreference":           "retrorreferência inválida",
    "stray non-digit characters in numeric constant":
        "caracteres não numéricos numa constante",
    "unterminated hex constant":       "constante hexadecimal não terminada",
    "backreference into a variably repeated group":
        "retrorreferência a um grupo repetido um número variável de vezes",
    "backreference to the group it is inside":
        "retrorreferência ao próprio grupo que a contém",
    "unbounded repetition of a possibly empty expression":
        "repetição ilimitada de uma expressão possivelmente vazia"
  }
};

export function makeT(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key) => (key in table ? table[key] : STRINGS.en[key] || key);
}

export function translateError(msg, lang) {
  if (lang === "pt" && ERRORS.pt[msg]) return ERRORS.pt[msg];
  return msg;
}
