#!/usr/bin/env bash
#
# finalize-release-notes.sh
#
# Adiciona a versão e a data à seção "## Unreleased" de um arquivo
# de notas de lançamento e extrai o conteúdo da seção para uso
# em lançamentos no GitHub ou em e-mails.
# Também inclui todos os commits desde a última versão lançada,
# garantindo transparência completa.
#
# Uso: finalize-release-notes.sh <versão> <caminho-do-arquivo>
#
# Códigos de saída:
#   0 - Sucesso: seção atualizada e conteúdo extraído
#   1 - Seção "## Unreleased" não encontrada (ignora normalmente)
#   2 - Seção Unreleased existe, mas está vazia (ignora normalmente)

set -euo pipefail

VERSION="${1:?Uso: finalize-release-notes.sh <versão> <caminho-do-arquivo>}"
FILE="${2:?Uso: finalize-release-notes.sh <versão> <caminho-do-arquivo>}"

if [[ ! -f "$FILE" ]]; then
  echo "Erro: Arquivo não encontrado: $FILE" >&2
  exit 1
fi

# Encontra o número da linha do cabeçalho ## Unreleased
# (sem diferenciar letras maiúsculas de minúsculas).
HEADER_LINE=$(grep -inm1 '^## unreleased' "$FILE" | cut -d: -f1)

if [[ -z "$HEADER_LINE" ]]; then
  echo "Seção '## Unreleased' não encontrada. Ignorando."
  exit 1
fi

TOTAL_LINES=$(wc -l < "$FILE")

# Encontra o próximo cabeçalho de seção (## Versão ...)
# ou o separador --- após o cabeçalho Unreleased.
NEXT_SECTION_LINE=""
if [[ $HEADER_LINE -lt $TOTAL_LINES ]]; then
  NEXT_SECTION_LINE=$(tail -n +"$((HEADER_LINE + 1))" "$FILE" \
    | grep -nm1 '^## \|^---$' \
    | cut -d: -f1)
fi

if [[ -n "$NEXT_SECTION_LINE" ]]; then
  # Converte o número relativo da linha para um número absoluto.
  END_LINE=$((HEADER_LINE + NEXT_SECTION_LINE - 1))
else
  # A seção vai até o final do arquivo.
  END_LINE=$TOTAL_LINES
fi

# Define o intervalo de linhas do conteúdo da seção.
CONTENT_START=$((HEADER_LINE + 1))
CONTENT_END=$END_LINE

# Extrai o conteúdo entre o cabeçalho e a próxima seção.
SECTION_BODY=$(sed -n "${CONTENT_START},${CONTENT_END}p" "$FILE" | sed '/^$/N;/^\n$/d')

# Verifica se há conteúdo real: remove linhas vazias e
# linhas que contêm apenas cabeçalhos Markdown (###...).
TRIMMED=$(echo "$SECTION_BODY" | sed '/^[[:space:]]*$/d')
HAS_CONTENT=$(echo "$SECTION_BODY" | sed '/^[[:space:]]*$/d' | grep -v '^###' || true)

if [[ -z "$TRIMMED" || -z "$HAS_CONTENT" ]]; then
  echo "A seção Unreleased está vazia. Ignorando."
  exit 2
fi

# Formata a data como "Mês Dia, Ano".
DATE_STAMP=$(date +'%B %-d, %Y')
NEW_HEADER="## Version ${VERSION} - ${DATE_STAMP}"

# Monta o arquivo substituto, mantendo o restante intacto.
{
  # Linhas anteriores ao cabeçalho Unreleased.
  if [[ $HEADER_LINE -gt 1 ]]; then
    head -n "$((HEADER_LINE - 1))" "$FILE"
  fi

  # Novo cabeçalho com a versão.
  echo "$NEW_HEADER"

  # Conteúdo entre o cabeçalho e a próxima seção.
  sed -n "${CONTENT_START},${CONTENT_END}p" "$FILE"

  # Restante do arquivo após a seção.
  if [[ $END_LINE -lt $TOTAL_LINES ]]; then
    tail -n +"$((END_LINE + 1))" "$FILE"
  fi
} > "${FILE}.tmp"

mv "${FILE}.tmp" "$FILE"

# Obtém os commits desde a última versão lançada.
LAST_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
COMMIT_LIST=""

if [[ -n "$LAST_TAG" ]]; then
  echo "Buscando commits desde ${LAST_TAG}..."

  # Obtém os commits entre a última tag e o HEAD,
  # excluindo commits de merge e commits que ignoram o CI.
  COMMIT_LIST=$(git log "${LAST_TAG}..HEAD" \
    --no-merges \
    --pretty=format:"- %s ([%h](https://github.com/${GITHUB_REPOSITORY}/commit/%H))" \
    --grep="\[skip ci\]" --invert-grep \
    || echo "")
else
  echo "Nenhuma tag anterior encontrada. Buscando todos os commits..."

  COMMIT_LIST=$(git log \
    --no-merges \
    --pretty=format:"- %s ([%h](https://github.com/${GITHUB_REPOSITORY}/commit/%H))" \
    --grep="\[skip ci\]" --invert-grep \
    || echo "")
fi

# Grava o conteúdo extraído da seção
# (para a descrição do lançamento no GitHub ou futuros e-mails).
{
  echo "$NEW_HEADER"
  echo ""

  if [[ -n "$TRIMMED" ]]; then
    echo "$TRIMMED"
    echo ""
  fi

  # Adiciona o histórico de commits, se disponível.
  if [[ -n "$COMMIT_LIST" ]]; then
    echo "---"
    echo ""
    echo "### 📝 Todas as alterações"
    echo ""
    echo "$COMMIT_LIST"
  fi
} > "${FILE}.section"

echo "Notas de lançamento da versão v${VERSION} finalizadas."
echo "  Atualizado: ${FILE}"
echo "  Extraído: ${FILE}.section"
exit 0
