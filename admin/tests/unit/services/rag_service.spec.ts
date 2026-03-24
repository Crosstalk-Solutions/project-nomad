import { test } from '@japa/runner'
import { RagService } from '#services/rag_service'
import { sanitizeFilename, determineFileType } from '../../../app/utils/fs.js'

/**
 * Unit tests for RagService and related RAG utilities.
 *
 * These tests exercise pure logic (sanitisation, file type detection,
 * text processing) without requiring Qdrant, Ollama, or Docker.
 */

// ---------------------------------------------------------------------------
// Helper: build a RagService with stubbed dependencies
// ---------------------------------------------------------------------------
function buildService(): RagService {
  const svc = Object.create(RagService.prototype) as RagService
  // Null out external clients so tests that call private helpers don't
  // accidentally hit real services.
  ;(svc as any).qdrant = null
  ;(svc as any).qdrantInitPromise = null
  ;(svc as any).embeddingModelVerified = false
  ;(svc as any).dockerService = {
    getServiceURL: async () => null,
  }
  ;(svc as any).ollamaService = {
    getModels: async () => [],
    getClient: async () => ({}),
  }
  return svc
}

// ---------------------------------------------------------------------------
// sanitizeFilename (exported utility)
// ---------------------------------------------------------------------------
test.group('sanitizeFilename', () => {
  test('keeps alphanumeric, dots, hyphens, and underscores', ({ assert }) => {
    assert.equal(sanitizeFilename('my-file_v2.txt'), 'my-file_v2.txt')
  })

  test('replaces spaces with underscores', ({ assert }) => {
    assert.equal(sanitizeFilename('my file name.pdf'), 'my_file_name.pdf')
  })

  test('replaces special characters', ({ assert }) => {
    assert.equal(sanitizeFilename('résumé (1).doc'), 'r_sum___1_.doc')
  })

  test('handles empty string', ({ assert }) => {
    assert.equal(sanitizeFilename(''), '')
  })

  test('replaces path traversal characters', ({ assert }) => {
    const result = sanitizeFilename('../../etc/passwd')
    assert.isFalse(result.includes('/'))
    assert.isFalse(result.includes('..'))
  })
})

// ---------------------------------------------------------------------------
// determineFileType (exported utility)
// ---------------------------------------------------------------------------
test.group('determineFileType', () => {
  test('detects image extensions', ({ assert }) => {
    for (const ext of ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp']) {
      assert.equal(determineFileType(`photo${ext}`), 'image')
    }
  })

  test('detects PDF', ({ assert }) => {
    assert.equal(determineFileType('document.pdf'), 'pdf')
  })

  test('detects text-like files', ({ assert }) => {
    for (const ext of ['.txt', '.md', '.docx', '.rtf']) {
      assert.equal(determineFileType(`notes${ext}`), 'text')
    }
  })

  test('detects ZIM files', ({ assert }) => {
    assert.equal(determineFileType('wikipedia.zim'), 'zim')
  })

  test('returns unknown for unrecognised extension', ({ assert }) => {
    assert.equal(determineFileType('archive.tar.gz'), 'unknown')
    assert.equal(determineFileType('binary.exe'), 'unknown')
  })

  test('is case-insensitive', ({ assert }) => {
    assert.equal(determineFileType('PHOTO.JPG'), 'image')
    assert.equal(determineFileType('DOC.PDF'), 'pdf')
  })
})

// ---------------------------------------------------------------------------
// RagService – sanitizeText (private)
// ---------------------------------------------------------------------------
test.group('RagService – sanitizeText', () => {
  test('removes null bytes', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).sanitizeText('hello\x00world')
    assert.equal(result, 'helloworld')
  })

  test('removes control characters but preserves newlines and tabs', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).sanitizeText('line1\nline2\ttab\x01gone')
    assert.equal(result, 'line1\nline2\ttab')  // trimmed, \x01 removed
  })

  test('trims whitespace', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).sanitizeText('  hello  ')
    assert.equal(result, 'hello')
  })

  test('handles empty string', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).sanitizeText('')
    assert.equal(result, '')
  })
})

// ---------------------------------------------------------------------------
// RagService – estimateTokenCount (private)
// ---------------------------------------------------------------------------
test.group('RagService – estimateTokenCount', () => {
  test('estimates tokens at ~3 chars per token', ({ assert }) => {
    const svc = buildService()
    // 9 chars -> ceil(9/3) = 3
    assert.equal((svc as any).estimateTokenCount('123456789'), 3)
  })

  test('rounds up fractional token counts', ({ assert }) => {
    const svc = buildService()
    // 10 chars -> ceil(10/3) = 4
    assert.equal((svc as any).estimateTokenCount('1234567890'), 4)
  })

  test('returns 0 for empty string', ({ assert }) => {
    const svc = buildService()
    assert.equal((svc as any).estimateTokenCount(''), 0)
  })
})

// ---------------------------------------------------------------------------
// RagService – truncateToTokenLimit (private)
// ---------------------------------------------------------------------------
test.group('RagService – truncateToTokenLimit', () => {
  test('returns text unchanged when within limit', ({ assert }) => {
    const svc = buildService()
    const text = 'short text'
    const result = (svc as any).truncateToTokenLimit(text, 100)
    assert.equal(result, text)
  })

  test('truncates long text at word boundary', ({ assert }) => {
    const svc = buildService()
    // maxTokens = 3 means max ~9 chars. "hello wor" -> should truncate to "hello"
    const text = 'hello world, this is a long sentence'
    const result = (svc as any).truncateToTokenLimit(text, 3)
    assert.isBelow(result.length, text.length)
    // Should not end mid-word
    assert.isFalse(result.endsWith('worl'))
  })
})

// ---------------------------------------------------------------------------
// RagService – preprocessQuery (private)
// ---------------------------------------------------------------------------
test.group('RagService – preprocessQuery', () => {
  test('expands known abbreviations', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).preprocessQuery('bob essentials')
    assert.include(result, 'bug out bag')
  })

  test('preserves original query when no abbreviations found', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).preprocessQuery('water purification')
    assert.equal(result, 'water purification')
  })

  test('handles multiple abbreviations', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).preprocessQuery('edc bob')
    assert.include(result, 'every day carry')
    assert.include(result, 'bug out bag')
  })

  test('trims whitespace', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).preprocessQuery('  hello  ')
    assert.equal(result, 'hello')
  })
})

// ---------------------------------------------------------------------------
// RagService – extractKeywords (private)
// ---------------------------------------------------------------------------
test.group('RagService – extractKeywords', () => {
  test('removes stopwords and short tokens', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).extractKeywords('how to purify water in the wild')
    // "how", "to", "in", "the" are stopwords or short; "purify", "water", "wild" remain
    assert.include(result, 'purify')
    assert.include(result, 'water')
    assert.include(result, 'wild')
    assert.notInclude(result, 'how')
    assert.notInclude(result, 'the')
  })

  test('returns unique keywords', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).extractKeywords('water water everywhere')
    const waterCount = result.filter((w: string) => w === 'water').length
    assert.equal(waterCount, 1)
  })
})

// ---------------------------------------------------------------------------
// RagService – _ensureDependencies error handling
// ---------------------------------------------------------------------------
test.group('RagService – dependency initialization', () => {
  test('throws when Qdrant URL cannot be resolved', async ({ assert }) => {
    const svc = buildService()
    // dockerService.getServiceURL returns null -> should throw
    await assert.rejects(
      () => (svc as any)._ensureDependencies(),
      /Qdrant service is not installed or running/
    )
  })

  test('caches initialization promise (singleton pattern)', async ({ assert }) => {
    const svc = buildService()
    let callCount = 0
    ;(svc as any).dockerService = {
      getServiceURL: async () => {
        callCount++
        return 'http://localhost:6333'
      },
    }

    // Call twice; should only invoke getServiceURL once
    await (svc as any)._initializeQdrantClient()
    await (svc as any)._initializeQdrantClient()
    assert.equal(callCount, 1)
  })
})

// ---------------------------------------------------------------------------
// RagService – static configuration constants
// ---------------------------------------------------------------------------
test.group('RagService – static constants', () => {
  test('EMBEDDING_DIMENSION is 768', ({ assert }) => {
    assert.equal(RagService.EMBEDDING_DIMENSION, 768)
  })

  test('EMBEDDING_MODEL is nomic-embed-text:v1.5', ({ assert }) => {
    assert.equal(RagService.EMBEDDING_MODEL, 'nomic-embed-text:v1.5')
  })

  test('SEARCH_DOCUMENT_PREFIX is set', ({ assert }) => {
    assert.isTrue(RagService.SEARCH_DOCUMENT_PREFIX.length > 0)
  })

  test('SEARCH_QUERY_PREFIX is set', ({ assert }) => {
    assert.isTrue(RagService.SEARCH_QUERY_PREFIX.length > 0)
  })

  test('MAX_SAFE_TOKENS is less than MODEL_CONTEXT_LENGTH', ({ assert }) => {
    assert.isBelow(RagService.MAX_SAFE_TOKENS, RagService.MODEL_CONTEXT_LENGTH)
  })

  test('TARGET_TOKENS_PER_CHUNK is less than MAX_SAFE_TOKENS', ({ assert }) => {
    assert.isBelow(RagService.TARGET_TOKENS_PER_CHUNK, RagService.MAX_SAFE_TOKENS)
  })

  test('UPLOADS_STORAGE_PATH is set', ({ assert }) => {
    assert.isTrue(RagService.UPLOADS_STORAGE_PATH.length > 0)
  })

  test('CONTENT_COLLECTION_NAME is set', ({ assert }) => {
    assert.equal(RagService.CONTENT_COLLECTION_NAME, 'nomad_knowledge_base')
  })
})

// ---------------------------------------------------------------------------
// sanitizeFilename – additional edge cases
// ---------------------------------------------------------------------------
test.group('sanitizeFilename – additional cases', () => {
  test('replaces unicode characters', ({ assert }) => {
    const result = sanitizeFilename('文件名.txt')
    assert.isFalse(/[^\x00-\x7F]/.test(result))
    assert.isTrue(result.endsWith('.txt'))
  })

  test('preserves dots in multi-dot filenames', ({ assert }) => {
    assert.equal(sanitizeFilename('file.backup.tar.gz'), 'file.backup.tar.gz')
  })

  test('handles very long filenames', ({ assert }) => {
    const longName = 'a'.repeat(255) + '.txt'
    const result = sanitizeFilename(longName)
    assert.equal(result, longName) // all valid chars, should be unchanged
  })

  test('replaces backslashes', ({ assert }) => {
    const result = sanitizeFilename('path\\to\\file.txt')
    assert.isFalse(result.includes('\\'))
  })

  test('replaces colons', ({ assert }) => {
    const result = sanitizeFilename('file:name.txt')
    assert.isFalse(result.includes(':'))
  })
})

// ---------------------------------------------------------------------------
// determineFileType – additional edge cases
// ---------------------------------------------------------------------------
test.group('determineFileType – additional cases', () => {
  test('handles files with no extension', ({ assert }) => {
    assert.equal(determineFileType('README'), 'unknown')
  })

  test('handles files with only a dot', ({ assert }) => {
    assert.equal(determineFileType('.hidden'), 'unknown')
  })

  test('handles mixed-case extensions', ({ assert }) => {
    assert.equal(determineFileType('photo.PNG'), 'image')
    assert.equal(determineFileType('doc.Pdf'), 'pdf')
    assert.equal(determineFileType('notes.TXT'), 'text')
    assert.equal(determineFileType('wiki.ZIM'), 'zim')
  })

  test('detects TIFF images', ({ assert }) => {
    assert.equal(determineFileType('scan.tiff'), 'image')
  })

  test('detects WEBP images', ({ assert }) => {
    assert.equal(determineFileType('photo.webp'), 'image')
  })

  test('detects markdown as text', ({ assert }) => {
    assert.equal(determineFileType('readme.md'), 'text')
  })

  test('detects docx as text', ({ assert }) => {
    assert.equal(determineFileType('document.docx'), 'text')
  })

  test('detects rtf as text', ({ assert }) => {
    assert.equal(determineFileType('letter.rtf'), 'text')
  })
})

// ---------------------------------------------------------------------------
// RagService – sanitizeText additional edge cases
// ---------------------------------------------------------------------------
test.group('RagService – sanitizeText edge cases', () => {
  test('removes invalid Unicode surrogates', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).sanitizeText('hello\uD800world')
    assert.equal(result, 'helloworld')
  })

  test('preserves carriage returns', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).sanitizeText('line1\r\nline2')
    assert.include(result, '\r\n')
  })

  test('handles text with only control characters', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).sanitizeText('\x01\x02\x03')
    assert.equal(result, '')
  })

  test('handles mixed valid and invalid content', ({ assert }) => {
    const svc = buildService()
    const result = (svc as any).sanitizeText('valid\x00text\x01here')
    assert.equal(result, 'validtexthere')
  })
})

// ---------------------------------------------------------------------------
// RagService – _ensureDependencies additional error handling
// ---------------------------------------------------------------------------
test.group('RagService – error handling', () => {
  test('_initializeQdrantClient throws when docker service returns null URL', async ({ assert }) => {
    const svc = buildService()
    ;(svc as any).dockerService = {
      getServiceURL: async () => null,
    }
    // Reset promise so it re-initializes
    ;(svc as any).qdrantInitPromise = null

    await assert.rejects(
      () => (svc as any)._initializeQdrantClient(),
      /Qdrant service is not installed or running/
    )
  })

  test('_ensureDependencies calls _initializeQdrantClient when qdrant is null', async ({ assert }) => {
    const svc = buildService()
    let initCalled = false
    ;(svc as any).qdrant = null
    ;(svc as any).qdrantInitPromise = null
    ;(svc as any).dockerService = {
      getServiceURL: async () => {
        initCalled = true
        return 'http://localhost:6333'
      },
    }

    await (svc as any)._ensureDependencies()
    assert.isTrue(initCalled)
    assert.isNotNull((svc as any).qdrant)
  })

  test('_ensureDependencies skips init when qdrant already set', async ({ assert }) => {
    const svc = buildService()
    const fakeClient = { fake: true }
    ;(svc as any).qdrant = fakeClient
    let initCalled = false
    ;(svc as any)._initializeQdrantClient = async () => { initCalled = true }

    await (svc as any)._ensureDependencies()
    assert.isFalse(initCalled)
  })
})

// ---------------------------------------------------------------------------
// RagService – QUERY_EXPANSION_DICTIONARY
// ---------------------------------------------------------------------------
test.group('RagService – query expansion dictionary', () => {
  test('dictionary contains common preparedness abbreviations', ({ assert }) => {
    const dict = (RagService as any).QUERY_EXPANSION_DICTIONARY
    assert.property(dict, 'bob')
    assert.property(dict, 'edc')
    assert.property(dict, 'shtf')
    assert.property(dict, 'emp')
    assert.property(dict, 'ifak')
  })

  test('all dictionary values are non-empty strings', ({ assert }) => {
    const dict = (RagService as any).QUERY_EXPANSION_DICTIONARY
    for (const [key, value] of Object.entries(dict)) {
      assert.isString(value, `Value for '${key}' should be a string`)
      assert.isAbove((value as string).length, 0, `Value for '${key}' should not be empty`)
    }
  })
})
