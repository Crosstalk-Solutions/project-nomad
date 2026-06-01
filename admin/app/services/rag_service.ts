import { QdrantClient } from '@qdrant/js-client-rest'
import { DockerService } from './docker_service.js'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import { TokenChunker } from '@chonkiejs/core'
import sharp from 'sharp'
import { deleteFileIfExists, determineFileType, getFile, getFileStatsIfExists, listDirectoryContentsRecursive, ZIM_STORAGE_PATH } from '../utils/fs.js'
import { PDFParse } from 'pdf-parse'
import { createWorker } from 'tesseract.js'
import { fromBuffer } from 'pdf2pic'
import JSZip from 'jszip'
import * as cheerio from 'cheerio'
import { OllamaService } from './ollama_service.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { removeStopwords } from 'stopword'
import { randomUUID } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import KVStore from '#models/kv_store'
import KbIngestState from '#models/kb_ingest_state'
import { decideScanAction, type IngestPolicy } from '../utils/kb_ingest_decision.js'
import KbRatioRegistry from '#models/kb_ratio_registry'
import { decideWarnings } from '../utils/kb_warning_decision.js'
import type { FileWarning, FileWarningsResult, StoredFileInfo } from '../../types/rag.js'
import type { KbIngestStateValue } from '../../types/kb_ingest_state.js'
import { ZIMExtractionService } from './zim_extraction_service.js'
import { ZIM_BATCH_SIZE } from '../../constants/zim_extraction.js'
import { EMBEDDING_MODEL_NAME } from '../../constants/ollama.js'
import { ProcessAndEmbedFileResponse, ProcessZIMFileResponse, RAGResult, RerankedRAGResult } from '../../types/rag.js'

export type EmbedSingleFileFailureCode =
  | 'not_found'
  | 'inflight'
  | 'delete_failed'
  | 'dispatch_failed'

export type EmbedSingleFileResult =
  | { success: true; message: string }
  | { success: false; code: EmbedSingleFileFailureCode; message: string }

@inject()
export class RagService {
  private qdrant: QdrantClient | null = null
  private qdrantInitPromise: Promise<void> | null = null
  private embeddingModelVerified = false
  private resolvedEmbeddingModel: string | null = null
  public static UPLOADS_STORAGE_PATH = 'storage/kb_uploads'
  public static CONTENT_COLLECTION_NAME = 'nomad_knowledge_base'
  public static EMBEDDING_DIMENSION = 768 // Nomic Embed Text v1.5 dimension is 768
  public static MODEL_CONTEXT_LENGTH = 2048 // nomic-embed-text has 2K token context
  public static MAX_SAFE_TOKENS = 1600 // Leave buffer for prefix and tokenization variance
  public static TARGET_TOKENS_PER_CHUNK = 1500 // Target 1500 tokens per chunk for embedding
  public static PREFIX_TOKEN_BUDGET = 10 // Reserve ~10 tokens for prefixes
  public static CHAR_TO_TOKEN_RATIO = 2 // Conservative chars-per-token estimate; technical docs
                                         // (numbers, symbols, abbreviations) tokenize denser
                                         // than plain prose (~3), so 2 avoids context overflows
  // Nomic Embed Text v1.5 uses task-specific prefixes for optimal performance
  public static SEARCH_DOCUMENT_PREFIX = 'search_document: '
  public static SEARCH_QUERY_PREFIX = 'search_query: '
  public static EMBEDDING_BATCH_SIZE = 8 // Conservative batch size for low-end hardware

  constructor(
    private dockerService: DockerService,
    private ollamaService: OllamaService
  ) { }

  private async _initializeQdrantClient() {
    if (!this.qdrantInitPromise) {
      this.qdrantInitPromise = (async () => {
        const qdrantUrl = await this.dockerService.getServiceURL(SERVICE_NAMES.QDRANT)
        if (!qdrantUrl) {
          throw new Error('Qdrant vector database is offline. Restart the AI Assistant service in Settings to restore the Knowledge Base.')
        }
        this.qdrant = new QdrantClient({ url: qdrantUrl })
      })().catch((err) => {
        this.qdrantInitPromise = null
        this.qdrant = null
        throw err
      })
    }
    return this.qdrantInitPromise
  }

  public async checkQdrantHealth(): Promise<{ online: boolean; message?: string }> {
    try {
      await this._ensureDependencies()
      await this.qdrant!.getCollections()
      return { online: true }
    } catch {
      this.qdrant = null
      this.qdrantInitPromise = null
      return {
        online: false,
        message: 'Qdrant vector database is offline. Restart the AI Assistant service in Settings to restore the Knowledge Base.',
      }
    }
  }

  private async _ensureDependencies() {
    if (!this.qdrant) {
      await this._initializeQdrantClient()
    }
  }

  private async _ensureCollection(
    collectionName: string,
    dimensions: number = RagService.EMBEDDING_DIMENSION
  ) {
    try {
      await this._ensureDependencies()
      const collections = await this.qdrant!.getCollections()
      const collectionExists = collections.collections.some((col) => col.name === collectionName)

      if (!collectionExists) {
        await this.qdrant!.createCollection(collectionName, {
          vectors: {
            size: dimensions,
            distance: 'Cosine',
          },
        })
      }

      // Create payload indexes for faster filtering (idempotent — Qdrant ignores duplicates)
      await this.qdrant!.createPayloadIndex(collectionName, {
        field_name: 'source',
        field_schema: 'keyword',
      })
      await this.qdrant!.createPayloadIndex(collectionName, {
        field_name: 'content_type',
        field_schema: 'keyword',
      })
    } catch (error) {
      logger.error('Error ensuring Qdrant collection:', error)
      throw error
    }
  }

  /**
   * Sanitizes text to ensure it's safe for JSON encoding and Qdrant storage.
   * Removes problematic characters that can cause "unexpected end of hex escape" errors:
   * - Null bytes (\x00)
   * - Invalid Unicode sequences
   * - Control characters (except newlines, tabs, and carriage returns)
   */
  private sanitizeText(text: string): string {
    return text
      // Null bytes
      .replace(/\x00/g, '')
      // Problematic control characters (keep \n, \r, \t)
      .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      // Invalid Unicode surrogates
      .replace(/[\uD800-\uDFFF]/g, '')
      // Trim extra whitespace
      .trim()
  }

  /**
   * Estimates token count for text. This is a conservative approximation:
   * - English text: ~1 token per 3 characters
   * - Adds buffer for special characters and tokenization variance
   *
   * Note: This is approximate and realistic english
   * tokenization is ~4 chars/token, but we use 3 here to be safe.
   * Actual tokenization may differ, but being
   * conservative prevents context length errors.
   */
  private estimateTokenCount(text: string): number {
    // This accounts for special characters, numbers, and punctuation
    return Math.ceil(text.length / RagService.CHAR_TO_TOKEN_RATIO)
  }

  /**
   * Truncates text to fit within token limit, preserving word boundaries.
   * Ensures the text + prefix won't exceed the model's context window.
   */
  private truncateToTokenLimit(text: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokenCount(text)

    if (estimatedTokens <= maxTokens) {
      return text
    }

    // Calculate how many characters we can keep using our ratio
    const maxChars = Math.floor(maxTokens * RagService.CHAR_TO_TOKEN_RATIO)

    // Truncate at word boundary
    let truncated = text.substring(0, maxChars)
    const lastSpace = truncated.lastIndexOf(' ')

    if (lastSpace > maxChars * 0.8) {
      // If we found a space in the last 20%, use it
      truncated = truncated.substring(0, lastSpace)
    }

    logger.warn(
      `[RAG] Truncated text from ${text.length} to ${truncated.length} chars (est. ${estimatedTokens} → ${this.estimateTokenCount(truncated)} tokens)`
    )

    return truncated
  }

  /**
   * Preprocesses a query to improve retrieval by expanding it with context.
   * This helps match documents even when using different terminology.
   * TODO: We could probably move this to a separate QueryPreprocessor class if it grows more complex, but for now it's manageable here.
   */
  private static QUERY_EXPANSION_DICTIONARY: Record<string, string> = {
    'bob': 'bug out bag',
    'bov': 'bug out vehicle',
    'bol': 'bug out location',
    'edc': 'every day carry',
    'mre': 'meal ready to eat',
    'shtf': 'shit hits the fan',
    'teotwawki': 'the end of the world as we know it',
    'opsec': 'operational security',
    'ifak': 'individual first aid kit',
    'ghb': 'get home bag',
    'ghi': 'get home in',
    'wrol': 'without rule of law',
    'emp': 'electromagnetic pulse',
    'ham': 'ham amateur radio',
    'nbr': 'nuclear biological radiological',
    'cbrn': 'chemical biological radiological nuclear',
    'sar': 'search and rescue',
    'comms': 'communications radio',
    'fifo': 'first in first out',
    'mylar': 'mylar bag food storage',
    'paracord': 'paracord 550 cord',
    'ferro': 'ferro rod fire starter',
    'bivvy': 'bivvy bivy emergency shelter',
    'bdu': 'battle dress uniform',
    'gmrs': 'general mobile radio service',
    'frs': 'family radio service',
    'nbc': 'nuclear biological chemical',
  }

  private preprocessQuery(query: string): string {
    let expanded = query.trim()

    // Expand known domain abbreviations/acronyms
    const words = expanded.toLowerCase().split(/\s+/)
    const expansions: string[] = []

    for (const word of words) {
      const cleaned = word.replace(/[^\w]/g, '')
      if (RagService.QUERY_EXPANSION_DICTIONARY[cleaned]) {
        expansions.push(RagService.QUERY_EXPANSION_DICTIONARY[cleaned])
      }
    }

    if (expansions.length > 0) {
      expanded = `${expanded} ${expansions.join(' ')}`
      logger.debug(`[RAG] Query expanded with domain terms: "${expanded}"`)
    }

    logger.debug(`[RAG] Original query: "${query}"`)
    logger.debug(`[RAG] Preprocessed query: "${expanded}"`)
    return expanded
  }

  /**
   * Extract keywords from query for hybrid search
   */
  private extractKeywords(query: string): string[] {
    const split = query.split(' ')
    const noStopWords = removeStopwords(split)

    // Future: This is basic normalization, could be improved with stemming/lemmatization later
    const keywords = noStopWords
      .map((word) => word.replace(/[^\w]/g, '').toLowerCase())
      .filter((word) => word.length > 2)

    return [...new Set(keywords)]
  }

  public async embedAndStoreText(
    text: string,
    metadata: Record<string, any> = {},
    onProgress?: (percent: number) => Promise<void>
  ): Promise<{ chunks: number } | null> {
    try {
      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      if (!this.embeddingModelVerified) {
        const allModels = await this.ollamaService.getModels(true)
        const embeddingModel =
          allModels.find((model) => model.name === EMBEDDING_MODEL_NAME) ??
          allModels.find((model) => model.name.toLowerCase().includes('nomic-embed-text'))

        if (!embeddingModel) {
          try {
            const downloadResult = await this.ollamaService.downloadModel(EMBEDDING_MODEL_NAME)
            if (!downloadResult.success) {
              throw new Error(downloadResult.message || 'Unknown error during model download')
            }
          } catch (modelError) {
            logger.error(
              `[RAG] Embedding model ${EMBEDDING_MODEL_NAME} not found locally and failed to download:`,
              modelError
            )
            this.embeddingModelVerified = false
            return null
          }
        }
        this.resolvedEmbeddingModel = embeddingModel?.name ?? EMBEDDING_MODEL_NAME
        this.embeddingModelVerified = true
      }

      // TokenChunker uses character-based tokenization (1 char = 1 token)
      // We need to convert our embedding model's token counts to character counts
      // since nomic-embed-text tokenizer uses ~3 chars per token
      const targetCharsPerChunk = Math.floor(RagService.TARGET_TOKENS_PER_CHUNK * RagService.CHAR_TO_TOKEN_RATIO)
      const overlapChars = Math.floor(150 * RagService.CHAR_TO_TOKEN_RATIO)

      const chunker = await TokenChunker.create({
        chunkSize: targetCharsPerChunk,
        chunkOverlap: overlapChars,
      })

      const chunkResults = await chunker.chunk(text)

      if (!chunkResults || chunkResults.length === 0) {
        throw new Error('No text chunks generated for embedding.')
      }

      // Extract text from chunk results
      const chunks = chunkResults.map((chunk) => chunk.text)

      // Prepare all chunk texts with prefix and truncation
      const prefixedChunks: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        let chunkText = chunks[i]

        // Final safety check: ensure chunk + prefix fits
        const prefixText = RagService.SEARCH_DOCUMENT_PREFIX
        const withPrefix = prefixText + chunkText
        const estimatedTokens = this.estimateTokenCount(withPrefix)

        if (estimatedTokens > RagService.MAX_SAFE_TOKENS) {
          const prefixTokens = this.estimateTokenCount(prefixText)
          const maxTokensForText = RagService.MAX_SAFE_TOKENS - prefixTokens
          logger.warn(
            `[RAG] Chunk ${i} estimated at ${estimatedTokens} tokens (${chunkText.length} chars), truncating to ${maxTokensForText} tokens`
          )
          chunkText = this.truncateToTokenLimit(chunkText, maxTokensForText)
        }

        prefixedChunks.push(RagService.SEARCH_DOCUMENT_PREFIX + chunkText)
      }

      // Batch embed chunks for performance
      const embeddings: number[][] = []
      const batchSize = RagService.EMBEDDING_BATCH_SIZE
      const totalBatches = Math.ceil(prefixedChunks.length / batchSize)

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const batchStart = batchIdx * batchSize
        const batch = prefixedChunks.slice(batchStart, batchStart + batchSize)

        logger.debug(`[RAG] Embedding batch ${batchIdx + 1}/${totalBatches} (${batch.length} chunks)`)

        const response = await this.ollamaService.embed(this.resolvedEmbeddingModel ?? EMBEDDING_MODEL_NAME, batch)

        embeddings.push(...response.embeddings)

        if (onProgress) {
          const progress = ((batchStart + batch.length) / prefixedChunks.length) * 100
          await onProgress(progress)
        }
      }

      const timestamp = Date.now()
      const points = chunks.map((chunkText, index) => {
        // Sanitize text to prevent JSON encoding errors
        const sanitizedText = this.sanitizeText(chunkText)

        // Extract keywords from content
        const contentKeywords = this.extractKeywords(sanitizedText)

        // For ZIM content, also extract keywords from structural metadata
        let structuralKeywords: string[] = []
        if (metadata.full_title) {
          structuralKeywords = this.extractKeywords(metadata.full_title as string)
        } else if (metadata.article_title) {
          structuralKeywords = this.extractKeywords(metadata.article_title as string)
        }

        // Combine and dedup keywords
        const allKeywords = [...new Set([...structuralKeywords, ...contentKeywords])]

        logger.debug(`[RAG] Extracted keywords for chunk ${index}: [${allKeywords.join(', ')}]`)
        if (structuralKeywords.length > 0) {
          logger.debug(`[RAG]   - Structural: [${structuralKeywords.join(', ')}], Content: [${contentKeywords.join(', ')}]`)
        }

        // Sanitize source metadata as well
        const sanitizedSource = typeof metadata.source === 'string'
          ? this.sanitizeText(metadata.source)
          : 'unknown'

        return {
          id: randomUUID(), // qdrant requires either uuid or unsigned int
          vector: embeddings[index],
          payload: {
            ...metadata,
            text: sanitizedText,
            chunk_index: index,
            total_chunks: chunks.length,
            keywords: allKeywords.join(' '), // store as space-separated string for text search
            char_count: sanitizedText.length,
            created_at: timestamp,
            source: sanitizedSource
          },
        }
      })

      await this.qdrant!.upsert(RagService.CONTENT_COLLECTION_NAME, { points })

      logger.debug(`[RAG] Successfully embedded and stored ${chunks.length} chunks`)
      logger.debug(`[RAG] First chunk preview: "${chunks[0].substring(0, 100)}..."`)

      return { chunks: chunks.length }
    } catch (error) {
      console.error(error)
      logger.error('[RAG] Error embedding text:', error)
      return null
    }
  }

  private async preprocessImage(filebuffer: Buffer): Promise<Buffer> {
    return await sharp(filebuffer)
      .grayscale()
      .normalize()
      .sharpen()
      .resize({ width: 2000, fit: 'inside' })
      .toBuffer()
  }

  private async convertPDFtoImages(filebuffer: Buffer): Promise<Buffer[]> {
    const converted = await fromBuffer(filebuffer, {
      quality: 50,
      density: 200,
      format: 'png',
    }).bulk(-1, {
      responseType: 'buffer',
    })
    return converted.filter((res) => res.buffer).map((res) => res.buffer!)
  }

  private async extractPDFText(filebuffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: filebuffer })
    const data = await parser.getText()
    await parser.destroy()
    return data.text
  }

  private async extractTXTText(filebuffer: Buffer): Promise<string> {
    return filebuffer.toString('utf-8')
  }

  private async extractImageText(filebuffer: Buffer): Promise<string> {
    const worker = await createWorker('eng')
    const result = await worker.recognize(filebuffer)
    await worker.terminate()
    return result.data.text
  }

  private async processImageFile(fileBuffer: Buffer): Promise<string> {
    const preprocessedBuffer = await this.preprocessImage(fileBuffer)
    return await this.extractImageText(preprocessedBuffer)
  }

  /**
   * Will process the PDF and attempt to extract text.
   * If the extracted text is minimal, it will fallback to OCR on each page.
   */
  private async processPDFFile(fileBuffer: Buffer): Promise<string> {
    let extractedText = await this.extractPDFText(fileBuffer)

    // Check if there was no extracted text or it was very minimal
    if (!extractedText || extractedText.trim().length < 100) {
      logger.debug('[RAG] PDF text extraction minimal, attempting OCR on pages')
      // Convert PDF pages to images for OCR if text extraction was poor
      const imageBuffers = await this.convertPDFtoImages(fileBuffer)
      extractedText = ''

      for (const imgBuffer of imageBuffers) {
        const preprocessedImg = await this.preprocessImage(imgBuffer)
        const pageText = await this.extractImageText(preprocessedImg)
        extractedText += pageText + '\n'
      }
    }

    return extractedText
  }

  /**
   * Process a ZIM file: extract content with metadata and embed each chunk.
   * Returns early with complete result since ZIM processing is self-contained.
   * Supports batch processing to prevent lock timeouts on large ZIM files.
   */
  private async processZIMFile(
    filepath: string,
    deleteAfterEmbedding: boolean,
    batchOffset?: number,
    onProgress?: (percent: number) => Promise<void>
  ): Promise<ProcessZIMFileResponse> {
    const zimExtractionService = new ZIMExtractionService()

    // Process in batches to avoid lock timeout
    const startOffset = batchOffset || 0

    logger.info(
      `[RAG] Extracting ZIM content (batch: offset=${startOffset}, size=${ZIM_BATCH_SIZE})`
    )

    const { chunks: zimChunks, totalArticles } = await zimExtractionService.extractZIMContent(
      filepath,
      { startOffset, batchSize: ZIM_BATCH_SIZE }
    )

    logger.info(
      `[RAG] Extracted ${zimChunks.length} chunks from ZIM file with enhanced metadata (file totalArticles=${totalArticles})`
    )

    // Process each chunk individually with its metadata
    let totalChunks = 0
    for (let i = 0; i < zimChunks.length; i++) {
      const zimChunk = zimChunks[i]
      const result = await this.embedAndStoreText(zimChunk.text, {
        source: filepath,
        content_type: 'zim_article',

        // Article-level context
        article_title: zimChunk.articleTitle,
        article_path: zimChunk.articlePath,

        // Section-level context
        section_title: zimChunk.sectionTitle,
        full_title: zimChunk.fullTitle,
        hierarchy: zimChunk.hierarchy,
        section_level: zimChunk.sectionLevel,

        // Use the same document ID for all chunks from the same article for grouping in search results
        document_id: zimChunk.documentId,

        // Archive metadata
        archive_title: zimChunk.archiveMetadata.title,
        archive_creator: zimChunk.archiveMetadata.creator,
        archive_publisher: zimChunk.archiveMetadata.publisher,
        archive_date: zimChunk.archiveMetadata.date,
        archive_language: zimChunk.archiveMetadata.language,
        archive_description: zimChunk.archiveMetadata.description,

        // Extraction metadata - not overly relevant for search, but could be useful for debugging and future features...
        extraction_strategy: zimChunk.strategy,
      })

      if (result) {
        totalChunks += result.chunks
      }

      if (onProgress) {
        await onProgress(((i + 1) / zimChunks.length) * 100)
      }
    }

    // Count unique articles processed in this batch. hasMoreBatches gates on the article
    // count — zimChunks.length counts section-level chunks (multiple per article under the
    // 'structured' strategy), so comparing it to ZIM_BATCH_SIZE (an article limit) caps
    // processing at the first batch for any real archive.
    const articlesInBatch = new Set(zimChunks.map((c) => c.documentId)).size
    const hasMoreBatches = articlesInBatch >= ZIM_BATCH_SIZE

    logger.info(
      `[RAG] Successfully embedded ${totalChunks} total chunks from ${articlesInBatch} articles (hasMore: ${hasMoreBatches})`
    )

    // Only delete the file when:
    // 1. deleteAfterEmbedding is true (caller wants deletion)
    // 2. No more batches remain (this is the final batch)
    // This prevents race conditions where early batches complete after later ones
    const shouldDelete = deleteAfterEmbedding && !hasMoreBatches
    if (shouldDelete) {
      logger.info(`[RAG] Final batch complete, deleting ZIM file: ${filepath}`)
      await deleteFileIfExists(filepath)
    } else if (!hasMoreBatches) {
      logger.info(`[RAG] Final batch complete, but file deletion was not requested`)
    }

    return {
      success: true,
      message: hasMoreBatches
        ? 'ZIM batch processed successfully. More batches remain.'
        : 'ZIM file processed and embedded successfully with enhanced metadata.',
      chunks: totalChunks,
      hasMoreBatches,
      articlesProcessed: articlesInBatch,
      totalArticles,
    }
  }

  private async processTextFile(fileBuffer: Buffer): Promise<string> {
    return await this.extractTXTText(fileBuffer)
  }

  /**
   * Extract text content from an EPUB file.
   * EPUBs are ZIP archives containing XHTML content files.
   * Reads the OPF manifest to determine reading order, then extracts
   * text from each content document in sequence.
   */
  private async processEPUBFile(fileBuffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(fileBuffer)

    // Read container.xml to find the OPF file path
    const containerXml = await zip.file('META-INF/container.xml')?.async('text')
    if (!containerXml) {
      throw new Error('Invalid EPUB: missing META-INF/container.xml')
    }

    // Parse container.xml to get the OPF rootfile path
    const $container = cheerio.load(containerXml, { xml: true })
    const opfPath = $container('rootfile').attr('full-path')
    if (!opfPath) {
      throw new Error('Invalid EPUB: no rootfile found in container.xml')
    }

    // Determine the base directory of the OPF file for resolving relative paths
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''

    // Read and parse the OPF file
    const opfContent = await zip.file(opfPath)?.async('text')
    if (!opfContent) {
      throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`)
    }

    const $opf = cheerio.load(opfContent, { xml: true })

    // Build a map of manifest items (id -> href)
    const manifestItems = new Map<string, string>()
    $opf('manifest item').each((_, el) => {
      const id = $opf(el).attr('id')
      const href = $opf(el).attr('href')
      const mediaType = $opf(el).attr('media-type') || ''
      // Only include XHTML/HTML content documents
      if (id && href && (mediaType.includes('html') || mediaType.includes('xml'))) {
        manifestItems.set(id, href)
      }
    })

    // Get the reading order from the spine
    const spineOrder: string[] = []
    $opf('spine itemref').each((_, el) => {
      const idref = $opf(el).attr('idref')
      if (idref && manifestItems.has(idref)) {
        spineOrder.push(manifestItems.get(idref)!)
      }
    })

    // If no spine found, fall back to all manifest items
    const contentFiles = spineOrder.length > 0
      ? spineOrder
      : Array.from(manifestItems.values())

    // Extract text from each content file in order
    const textParts: string[] = []
    for (const href of contentFiles) {
      const fullPath = opfDir + href
      const content = await zip.file(fullPath)?.async('text')
      if (content) {
        const $ = cheerio.load(content)
        // Remove script and style elements
        $('script, style').remove()
        const text = $('body').text().trim()
        if (text) {
          textParts.push(text)
        }
      }
    }

    const fullText = textParts.join('\n\n')
    logger.debug(`[RAG] EPUB extracted ${textParts.length} chapters, ${fullText.length} characters total`)
    return fullText
  }

  private async embedTextAndCleanup(
    extractedText: string,
    filepath: string,
    deleteAfterEmbedding: boolean = false,
    onProgress?: (percent: number) => Promise<void>
  ): Promise<{ success: boolean; message: string; chunks?: number }> {
    if (!extractedText || extractedText.trim().length === 0) {
      return { success: false, message: 'Process completed succesfully, but no text was found to embed.' }
    }

    const embedResult = await this.embedAndStoreText(extractedText, {
      source: filepath
    }, onProgress)

    if (!embedResult) {
      return { success: false, message: 'Failed to embed and store the extracted text.' }
    }

    if (deleteAfterEmbedding) {
      logger.info(`[RAG] Embedding complete, deleting uploaded file: ${filepath}`)
      await deleteFileIfExists(filepath)
    }

    return {
      success: true,
      message: 'File processed and embedded successfully.',
      chunks: embedResult.chunks,
    }
  }

  /**
   * Main pipeline to process and embed an uploaded file into the RAG knowledge base.
   * This includes text extraction, chunking, embedding, and storing in Qdrant.
   * 
   * Orchestrates file type detection and delegates to specialized processors.
   * For ZIM files, supports batch processing via batchOffset parameter.
   */
  public async processAndEmbedFile(
    filepath: string,
    deleteAfterEmbedding: boolean = false,
    batchOffset?: number,
    onProgress?: (percent: number) => Promise<void>
  ): Promise<ProcessAndEmbedFileResponse> {
    try {
      const fileType = determineFileType(filepath)
      logger.debug(`[RAG] Processing file: ${filepath} (detected type: ${fileType})`)

      if (fileType === 'unknown') {
        return { success: false, message: 'Unsupported file type.' }
      }

      // Read file buffer (not needed for ZIM as it reads directly)
      const fileBuffer = fileType !== 'zim' ? await getFile(filepath, 'buffer') : null
      if (fileType !== 'zim' && !fileBuffer) {
        return { success: false, message: 'Failed to read the uploaded file.' }
      }

      // Process based on file type
      // ZIM files are handled specially since they have their own embedding workflow
      if (fileType === 'zim') {
        return await this.processZIMFile(filepath, deleteAfterEmbedding, batchOffset, onProgress)
      }

      // Extract text based on file type
      // Report ~10% when extraction begins; actual embedding progress follows via callback
      if (onProgress) await onProgress(10)
      let extractedText: string
      switch (fileType) {
        case 'image':
          extractedText = await this.processImageFile(fileBuffer!)
          break
        case 'pdf':
          extractedText = await this.processPDFFile(fileBuffer!)
          break
        case 'epub':
          extractedText = await this.processEPUBFile(fileBuffer!)
          break
        case 'text':
        default:
          extractedText = await this.processTextFile(fileBuffer!)
          break
      }

      // Extraction done — scale remaining embedding progress from 15% to 100%
      if (onProgress) await onProgress(15)
      const scaledProgress = onProgress
        ? (p: number) => onProgress(15 + p * 0.85)
        : undefined

      // Embed extracted text and cleanup
      return await this.embedTextAndCleanup(extractedText, filepath, deleteAfterEmbedding, scaledProgress)
    } catch (error) {
      logger.error('[RAG] Error processing and embedding file:', error)
      return { success: false, message: 'Error processing and embedding file.' }
    }
  }

  /**
   * Search for documents similar to the query text in the Qdrant knowledge base.
   * Uses a hybrid approach combining semantic similarity and keyword matching.
   * Implements adaptive thresholds and result reranking for optimal retrieval.
   * @param query - The search query text
   * @param limit - Maximum number of results to return (default: 5)
   * @param scoreThreshold - Minimum similarity score threshold (default: 0.3, much lower than before)
   * @returns Array of relevant text chunks with their scores
   */
  public async searchSimilarDocuments(
    query: string,
    limit: number = 5,
    scoreThreshold: number = 0.3 // Lower default threshold - was 0.7, now 0.3
  ): Promise<Array<{ text: string; score: number; metadata?: Record<string, any> }>> {
    try {
      logger.debug(`[RAG] Starting similarity search for query: "${query}"`)

      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      // Check if collection has any points
      const collectionInfo = await this.qdrant!.getCollection(RagService.CONTENT_COLLECTION_NAME)
      const pointCount = collectionInfo.points_count || 0
      logger.debug(`[RAG] Knowledge base contains ${pointCount} document chunks`)

      if (pointCount === 0) {
        logger.debug('[RAG] Knowledge base is empty. Could not perform search.')
        return []
      }

      if (!this.embeddingModelVerified) {
        const allModels = await this.ollamaService.getModels(true)
        const embeddingModel =
          allModels.find((model) => model.name === EMBEDDING_MODEL_NAME) ??
          allModels.find((model) => model.name.toLowerCase().includes('nomic-embed-text'))

        if (!embeddingModel) {
          logger.warn(
            `[RAG] ${EMBEDDING_MODEL_NAME} not found. Cannot perform similarity search.`
          )
          this.embeddingModelVerified = false
          return []
        }
        this.resolvedEmbeddingModel = embeddingModel.name
        this.embeddingModelVerified = true
      }

      // Preprocess query for better matching
      const processedQuery = this.preprocessQuery(query)
      const keywords = this.extractKeywords(processedQuery)
      logger.debug(`[RAG] Extracted keywords: [${keywords.join(', ')}]`)

      // Generate embedding for the query with search_query prefix
      // Ensure query doesn't exceed token limit
      const prefixTokens = this.estimateTokenCount(RagService.SEARCH_QUERY_PREFIX)
      const maxQueryTokens = RagService.MAX_SAFE_TOKENS - prefixTokens
      const truncatedQuery = this.truncateToTokenLimit(processedQuery, maxQueryTokens)

      const prefixedQuery = RagService.SEARCH_QUERY_PREFIX + truncatedQuery
      logger.debug(`[RAG] Generating embedding with prefix: "${RagService.SEARCH_QUERY_PREFIX}"`)

      // Validate final token count
      const queryTokenCount = this.estimateTokenCount(prefixedQuery)
      if (queryTokenCount > RagService.MAX_SAFE_TOKENS) {
        logger.error(
          `[RAG] Query too long even after truncation: ${queryTokenCount} tokens (max: ${RagService.MAX_SAFE_TOKENS})`
        )
        return []
      }

      const response = await this.ollamaService.embed(this.resolvedEmbeddingModel ?? EMBEDDING_MODEL_NAME, [prefixedQuery])

      // Perform semantic search with a higher limit to enable reranking
      const searchLimit = limit * 3 // Get more results for reranking
      logger.debug(
        `[RAG] Searching for top ${searchLimit} semantic matches (threshold: ${scoreThreshold})`
      )

      const searchResults = await this.qdrant!.search(RagService.CONTENT_COLLECTION_NAME, {
        vector: response.embeddings[0],
        limit: searchLimit,
        score_threshold: scoreThreshold,
        with_payload: true,
      })

      logger.debug(`[RAG] Found ${searchResults.length} results above threshold ${scoreThreshold}`)

      // Map results with metadata for reranking
      const resultsWithMetadata: RAGResult[] = searchResults.map((result) => ({
        text: (result.payload?.text as string) || '',
        score: result.score,
        keywords: (result.payload?.keywords as string) || '',
        chunk_index: (result.payload?.chunk_index as number) || 0,
        created_at: (result.payload?.created_at as number) || 0,
        // Enhanced ZIM metadata (likely be undefined for non-ZIM content)
        article_title: result.payload?.article_title as string | undefined,
        section_title: result.payload?.section_title as string | undefined,
        full_title: result.payload?.full_title as string | undefined,
        hierarchy: result.payload?.hierarchy as string | undefined,
        document_id: result.payload?.document_id as string | undefined,
        content_type: result.payload?.content_type as string | undefined,
        source: result.payload?.source as string | undefined,
      }))

      const rerankedResults = this.rerankResults(resultsWithMetadata, keywords, query)

      logger.debug(`[RAG] Top 3 results after reranking:`)
      rerankedResults.slice(0, 3).forEach((result, idx) => {
        logger.debug(
          `[RAG]   ${idx + 1}. Score: ${result.finalScore.toFixed(4)} (semantic: ${result.score.toFixed(4)}) - "${result.text.substring(0, 100)}..."`
        )
      })

      // Apply source diversity penalty to avoid all results from the same document
      const diverseResults = this.applySourceDiversity(rerankedResults)

      // Return top N results with enhanced metadata
      return diverseResults.slice(0, limit).map((result) => ({
        text: result.text,
        score: result.finalScore,
        metadata: {
          chunk_index: result.chunk_index,
          created_at: result.created_at,
          semantic_score: result.score,
          // Enhanced ZIM metadata (likely be undefined for non-ZIM content)
          article_title: result.article_title,
          section_title: result.section_title,
          full_title: result.full_title,
          hierarchy: result.hierarchy,
          document_id: result.document_id,
          content_type: result.content_type,
        },
      }))
    } catch (error) {
      logger.error('[RAG] Error searching similar documents:', error)
      return []
    }
  }

  /**
   * Rerank search results using hybrid scoring that combines:
   * 1. Semantic similarity score (primary signal)
   * 2. Keyword overlap bonus (conservative, quality-gated)
   * 3. Direct term matches (conservative)
   *
   * Tries to boost only already-relevant results, not promote
   * low-quality results just because they have keyword matches.
   *
   * Future: this is a decent feature-based approach, but we could
   * switch to a python-based reranker in the future if the benefits
   * outweigh the overhead.
   */
  private rerankResults(
    results: Array<RAGResult>,
    queryKeywords: string[],
    originalQuery: string
  ): Array<RerankedRAGResult> {
    return results
      .map((result) => {
        let finalScore = result.score

        // Quality gate: Only apply boosts if semantic score is reasonable
        // Try to prevent promoting irrelevant results that just happen to have keyword matches
        const MIN_SEMANTIC_THRESHOLD = 0.35

        if (result.score < MIN_SEMANTIC_THRESHOLD) {
          // For low-scoring results, use semantic score as-is
          // This prevents false positives from keyword gaming
          logger.debug(
            `[RAG] Skipping boost for low semantic score: ${result.score.toFixed(3)} (threshold: ${MIN_SEMANTIC_THRESHOLD})`
          )
          return {
            ...result,
            finalScore,
          }
        }

        // Boost score based on keyword overlap (diminishing returns - overlap goes down, so does boost)
        const docKeywords = result.keywords
          .toLowerCase()
          .split(' ')
          .filter((k) => k.length > 0)
        const matchingKeywords = queryKeywords.filter(
          (kw) =>
            docKeywords.includes(kw.toLowerCase()) ||
            result.text.toLowerCase().includes(kw.toLowerCase())
        )
        const keywordOverlap = matchingKeywords.length / Math.max(queryKeywords.length, 1)

        // Use square root for diminishing returns: 100% overlap = sqrt(1.0) = 1.0, 25% = 0.5
        // Then scale conservatively (max 10% boost instead of 20%)
        const keywordBoost = Math.sqrt(keywordOverlap) * 0.1 * result.score

        if (keywordOverlap > 0) {
          logger.debug(
            `[RAG] Keyword overlap: ${matchingKeywords.length}/${queryKeywords.length} - Boost: ${keywordBoost.toFixed(3)}`
          )
        }

        // Boost if original query terms appear in text (case-insensitive)
        // Scale boost proportionally to base score to avoid over-promoting weak matches
        const queryTerms = originalQuery
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 3)
        const directMatches = queryTerms.filter((term) =>
          result.text.toLowerCase().includes(term)
        ).length

        if (queryTerms.length > 0) {
          const directMatchRatio = directMatches / queryTerms.length
          // Conservative boost: max 7.5% of the base score
          const directMatchBoost = Math.sqrt(directMatchRatio) * 0.075 * result.score

          if (directMatches > 0) {
            logger.debug(
              `[RAG] Direct term matches: ${directMatches}/${queryTerms.length} - Boost: ${directMatchBoost.toFixed(3)}`
            )
            finalScore += directMatchBoost
          }
        }

        // Boost when query keywords match the chunk's section/article heading. ZIM
        // content carries this structural metadata (already fetched, no extra cost),
        // and a query term appearing in a heading is a strong relevance signal that
        // body-text matching alone misses. Same conservative, score-scaled, diminishing
        // -returns shape as the boosts above, so it can't promote a weak match.
        const headingText = [result.full_title, result.section_title, result.article_title]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (headingText) {
          const headingHits = queryKeywords.filter((kw) =>
            headingText.includes(kw.toLowerCase())
          ).length
          if (headingHits > 0) {
            const headingRatio = headingHits / Math.max(queryKeywords.length, 1)
            const headingBoost = Math.sqrt(headingRatio) * 0.1 * result.score
            logger.debug(
              `[RAG] Heading match: ${headingHits}/${queryKeywords.length} - Boost: ${headingBoost.toFixed(3)}`
            )
            finalScore += headingBoost
          }
        }

        finalScore = Math.min(1.0, finalScore + keywordBoost)

        return {
          ...result,
          finalScore,
        }
      })
      .sort((a, b) => b.finalScore - a.finalScore)
  }

  /**
   * Applies a diversity penalty so results from the same source are down-weighted.
   * Uses greedy selection: for each result, apply 0.85^n penalty where n is the
   * number of results already selected from the same source.
   */
  private applySourceDiversity(
    results: Array<RerankedRAGResult>
  ) {
    const sourceCounts = new Map<string, number>()
    const DIVERSITY_PENALTY = 0.85

    return results
      .map((result) => {
        const sourceKey = result.document_id || result.source || 'unknown'
        const count = sourceCounts.get(sourceKey) || 0
        const penalty = Math.pow(DIVERSITY_PENALTY, count)
        const diverseScore = result.finalScore * penalty

        sourceCounts.set(sourceKey, count + 1)

        if (count > 0) {
          logger.debug(
            `[RAG] Source diversity penalty for "${sourceKey}": ${result.finalScore.toFixed(4)} → ${diverseScore.toFixed(4)} (seen ${count}x)`
          )
        }

        return { ...result, finalScore: diverseScore }
      })
      .sort((a, b) => b.finalScore - a.finalScore)
  }

  /**
   * Retrieve all unique source files that have been stored in the knowledge base.
   * @returns Array of unique full source paths
   */
  public async hasDocuments(): Promise<boolean> {
    try {
      await this._ensureCollection(RagService.CONTENT_COLLECTION_NAME, RagService.EMBEDDING_DIMENSION)
      const collectionInfo = await this.qdrant!.getCollection(RagService.CONTENT_COLLECTION_NAME)
      return (collectionInfo.points_count ?? 0) > 0
    } catch {
      return false
    }
  }

  public async getStoredFiles(): Promise<StoredFileInfo[]> {
    try {
      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      const sources = new Set<string>()
      let offset: string | number | null | Record<string, unknown> = null
      const batchSize = 100

      // Scroll through all points in the collection (only fetch source field)
      do {
        const scrollResult = await this.qdrant!.scroll(RagService.CONTENT_COLLECTION_NAME, {
          limit: batchSize,
          offset: offset,
          with_payload: ['source'],
          with_vector: false,
        })

        // Extract unique source values from payloads
        scrollResult.points.forEach((point) => {
          const source = point.payload?.source
          if (source && typeof source === 'string') {
            sources.add(source)
          }
        })

        offset = scrollResult.next_page_offset || null
      } while (offset !== null)

      // Union the Qdrant-derived list with the disk-backed file paths the
      // state machine has tracked. Without this, files known to the scanner
      // but with zero embedded chunks (video-only ZIMs, failed-before-first-
      // chunk ingestions, browse_only opt-outs) never get a row in Stored
      // Files — which means warnings keyed off those files (#895 zero_chunks
      // in particular) have no row to attach to. The state machine is the
      // authoritative "what's on disk?" view; Qdrant is "what made it into
      // the vector store?". Both are needed to render the KB UI honestly.
      const stateByPath = new Map<string, { state: KbIngestStateValue; chunks_embedded: number }>()
      try {
        const stateRows = await KbIngestState.query().select('file_path', 'state', 'chunks_embedded')
        for (const row of stateRows) {
          sources.add(row.file_path)
          stateByPath.set(row.file_path, {
            state: row.state,
            chunks_embedded: row.chunks_embedded,
          })
        }
      } catch (error) {
        // Non-fatal: if the state machine query fails for any reason we'd
        // rather return the Qdrant-derived list than 500 the whole panel.
        logger.warn(
          { err: error },
          '[RagService.getStoredFiles] state-machine union skipped; returning Qdrant-only list'
        )
      }

      return Array.from(sources).map((source) => {
        const row = stateByPath.get(source)
        return {
          source,
          state: row?.state ?? null,
          chunksEmbedded: row?.chunks_embedded ?? 0,
        }
      })
    } catch (error) {
      logger.error('Error retrieving stored files:', error)
      return []
    }
  }

  /**
   * Compute whether the first-chat JIT prompt should fire and surface the file
   * count the banner uses in its copy ("Index your N existing files?"). The
   * banner appears when the user hasn't yet picked a global ingest policy
   * (`rag.defaultIngestPolicy` unset) and the scanner has actually seen at
   * least one embeddable file — i.e., the prompt is actionable, not theoretical
   * on a freshly-installed empty NOMAD.
   *
   * Once the user picks a policy (Always or Manual) via the banner buttons or
   * the KB modal toggle, `shouldPrompt` flips to false for good.
   */
  public async getPolicyPromptState(): Promise<{
    shouldPrompt: boolean
    hasContent: boolean
    totalFiles: number
  }> {
    const policy = await KVStore.getValue('rag.defaultIngestPolicy')
    const countRow = await KbIngestState.query().count('* as total').first()
    const totalFiles = Number((countRow as any)?.$extras?.total ?? 0)
    return {
      shouldPrompt: policy === null && totalFiles > 0,
      hasContent: totalFiles > 0,
      totalFiles,
    }
  }

  /**
   * Compute conditional warnings (RFC #883 §6) for every source the scanner
   * sees on disk. Returns `{ ok, warnings }` — `ok: false` distinguishes a
   * computation failure (Qdrant unreachable, DB outage, FS error) from the
   * healthy-but-empty case, which is critical because the whole point of this
   * surface is to expose silent failures; reporting "everything healthy" when
   * we couldn't actually check would reintroduce the bug we set out to fix.
   *
   * Per-source chunk counts come from a single Qdrant scroll over the
   * collection's points; expected-chunk estimates come from the ratio
   * registry. Files in the scanner's directories that have no qdrant points
   * at all show up with `chunksInQdrant: 0` so Warning A can fire.
   */
  public async computeFileWarnings(): Promise<FileWarningsResult> {
    try {
      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      // Per-source chunk count from a single scroll. We deliberately don't
      // assume `kb_ingest_state.chunks_embedded` here so this PR stays
      // independent of the state-machine PR (#888) — but a future cleanup can
      // read from there for efficiency once both have landed.
      const chunksBySource = new Map<string, number>()
      let offset: string | number | null | Record<string, unknown> = null
      const batchSize = 100
      do {
        const scrollResult = await this.qdrant!.scroll(RagService.CONTENT_COLLECTION_NAME, {
          limit: batchSize,
          offset,
          with_payload: ['source'],
          with_vector: false,
        })
        for (const point of scrollResult.points) {
          const source = point.payload?.source
          if (source && typeof source === 'string') {
            chunksBySource.set(source, (chunksBySource.get(source) ?? 0) + 1)
          }
        }
        offset = scrollResult.next_page_offset || null
      } while (offset !== null)

      // Scan the filesystem the same way scanAndSyncStorage does so Warning A
      // can fire on files with zero qdrant points (the headline "video-only
      // ZIM" case).
      const KB_UPLOADS_PATH = join(process.cwd(), RagService.UPLOADS_STORAGE_PATH)
      const ZIM_PATH = join(process.cwd(), ZIM_STORAGE_PATH)
      const allSources = new Set<string>(chunksBySource.keys())
      const sizeByPath = new Map<string, number>()

      for (const dir of [KB_UPLOADS_PATH, ZIM_PATH]) {
        try {
          const entries = await listDirectoryContentsRecursive(dir)
          for (const entry of entries) {
            if (entry.type !== 'file') continue
            allSources.add(entry.key)
            const stat = await getFileStatsIfExists(entry.key)
            if (stat) sizeByPath.set(entry.key, Number(stat.size))
          }
        } catch (error: any) {
          if (error?.code !== 'ENOENT') throw error
        }
      }

      const out: Record<string, FileWarning[]> = {}
      for (const source of allSources) {
        const fileSizeBytes = sizeByPath.get(source) ?? 0
        const chunksInQdrant = chunksBySource.get(source) ?? 0
        const fileName = source.split(/[/\\]/).pop() ?? source
        const expectedChunks =
          fileSizeBytes > 0
            ? await KbRatioRegistry.estimateChunks(fileName, fileSizeBytes)
            : null

        const warnings = decideWarnings({ fileSizeBytes, chunksInQdrant, expectedChunks })
        if (warnings.length > 0) out[source] = warnings
      }

      return { ok: true, warnings: out }
    } catch (error) {
      logger.error('[RAG] Error computing file warnings:', error)
      return { ok: false, warnings: {} }
    }
  }

  /**
   * Delete all Qdrant points associated with a given source path and remove
   * the corresponding file from disk if it lives under the uploads directory.
   * @param source - Full source path as stored in Qdrant payloads
   */
  public async deleteFileBySource(source: string): Promise<{ success: boolean; message: string }> {
    try {
      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      await this.qdrant!.delete(RagService.CONTENT_COLLECTION_NAME, {
        filter: {
          must: [{ key: 'source', match: { value: source } }],
        },
      })

      logger.info(`[RAG] Deleted all points for source: ${source}`)

      /** Delete the physical file only if it lives inside the uploads directory.
      * resolve() normalises path traversal sequences (e.g. "/../..") before the
      * check to prevent path traversal vulns
      * The trailing sep is to ensure a prefix like "kb_uploads_{something_incorrect}" can't slip through.
      */
      const uploadsAbsPath = join(process.cwd(), RagService.UPLOADS_STORAGE_PATH)
      const resolvedSource = resolve(source)
      if (resolvedSource.startsWith(uploadsAbsPath + sep)) {
        await deleteFileIfExists(resolvedSource)
        logger.info(`[RAG] Deleted uploaded file from disk: ${resolvedSource}`)
      } else {
        logger.warn(`[RAG] File was removed from knowledge base but doesn't live in Nomad's uploads directory, so it can't be safely removed. Skipping deletion of physical file...`)
      }

      // Drop the ingest state row last so the file disappears entirely. Without
      // this, the next scanAndSyncStorage would see `indexed + no chunks` for a
      // path that no longer exists in storage and try to re-embed nothing.
      await KbIngestState.remove(source)

      return { success: true, message: 'File removed from knowledge base.' }
    } catch (error) {
      logger.error('[RAG] Error deleting file from knowledge base:', error)
      return { success: false, message: 'Error deleting file from knowledge base.' }
    }
  }

  public async discoverNomadDocs(force?: boolean): Promise<{ success: boolean; message: string }> {
    try {
      const README_PATH = join(process.cwd(), 'README.md')
      const DOCS_DIR = join(process.cwd(), 'docs')

      const alreadyEmbeddedRaw = await KVStore.getValue('rag.docsEmbedded')
      if (alreadyEmbeddedRaw && !force) {
        logger.info('[RAG] Nomad docs have already been discovered and queued. Skipping.')
        return { success: true, message: 'Nomad docs have already been discovered and queued. Skipping.' }
      }

      const filesToEmbed: Array<{ path: string; source: string }> = []

      const readmeExists = await getFileStatsIfExists(README_PATH)
      if (readmeExists) {
        filesToEmbed.push({ path: README_PATH, source: 'README.md' })
      }

      const dirContents = await listDirectoryContentsRecursive(DOCS_DIR)
      for (const entry of dirContents) {
        if (entry.type === 'file') {
          filesToEmbed.push({ path: entry.key, source: join('docs', entry.name) })
        }
      }

      logger.info(`[RAG] Discovered ${filesToEmbed.length} Nomad doc files to embed`)

      // Import EmbedFileJob dynamically to avoid circular dependencies
      const { EmbedFileJob } = await import('#jobs/embed_file_job')

      // Dispatch an EmbedFileJob for each discovered file
      for (const fileInfo of filesToEmbed) {
        try {
          logger.info(`[RAG] Dispatching embed job for: ${fileInfo.source}`)
          await EmbedFileJob.dispatch({
            filePath: fileInfo.path,
            fileName: fileInfo.source,
          })
          logger.info(`[RAG] Successfully dispatched job for ${fileInfo.source}`)
        } catch (fileError) {
          logger.error(
            `[RAG] Error dispatching job for file ${fileInfo.source}:`,
            fileError
          )
        }
      }

      // Update KV store to mark docs as discovered so we don't redo this unnecessarily
      await KVStore.setValue('rag.docsEmbedded', true)

      return { success: true, message: `Nomad docs discovery completed. Dispatched ${filesToEmbed.length} embedding jobs.` }
    } catch (error) {
      logger.error('Error discovering Nomad docs:', error)
      return { success: false, message: 'Error discovering Nomad docs.' }
    }
  }

  /**
   * Walk kb_uploads and zim storage directories, returning the full path of
   * every embeddable file. Non-embeddable types (e.g. kiwix-library.xml) are
   * filtered out so they aren't dispatched only to fail with "Unsupported file
   * type" and retry on every sync.
   */
  private async _discoverKbFiles(): Promise<string[]> {
    const KB_UPLOADS_PATH = join(process.cwd(), RagService.UPLOADS_STORAGE_PATH)
    const ZIM_PATH = join(process.cwd(), ZIM_STORAGE_PATH)
    const filesInStorage: string[] = []

    for (const [label, dirPath] of [
      [RagService.UPLOADS_STORAGE_PATH, KB_UPLOADS_PATH] as const,
      [ZIM_STORAGE_PATH, ZIM_PATH] as const,
    ]) {
      try {
        const contents = await listDirectoryContentsRecursive(dirPath)
        contents.forEach((entry) => {
          if (entry.type === 'file') filesInStorage.push(entry.key)
        })
        logger.debug(`[RAG] Found ${contents.length} files in ${label}`)
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.debug(`[RAG] ${label} directory does not exist, skipping`)
        } else {
          throw error
        }
      }
    }

    return filesInStorage.filter((f) => determineFileType(f) !== 'unknown')
  }

  /**
   * Dispatch one EmbedFileJob per file path. Returns honest counts: `queuedCount`
   * is jobs newly enqueued, `dedupedCount` is jobs that hit BullMQ's per-file
   * jobId dedupe (an existing :completed/:waiting/etc. entry was returned
   * instead of a new enqueue), and `failedPaths` lists files whose dispatch
   * threw. Pass `force: true` for bulk callers that need to bypass dedupe
   * entirely. Per-file errors are logged but don't abort the batch — callers
   * must inspect `failedPaths` to surface partial failure to the operator.
   */
  private async _dispatchEmbedJobsFor(
    filePaths: string[],
    options?: { force?: boolean }
  ): Promise<{ queuedCount: number; dedupedCount: number; failedPaths: string[] }> {
    const { EmbedFileJob } = await import('#jobs/embed_file_job')
    let queuedCount = 0
    let dedupedCount = 0
    const failedPaths: string[] = []
    for (const filePath of filePaths) {
      try {
        const fileName = filePath.split(/[/\\]/).pop() || filePath
        const stats = await getFileStatsIfExists(filePath)
        const result = await EmbedFileJob.dispatch(
          {
            filePath,
            fileName,
            fileSize: stats?.size,
          },
          { force: options?.force }
        )
        if (result.created) {
          queuedCount++
        } else {
          dedupedCount++
        }
      } catch (fileError) {
        failedPaths.push(filePath)
        logger.error(`[RAG] Error dispatching job for file ${filePath}:`, fileError)
      }
    }
    return { queuedCount, dedupedCount, failedPaths }
  }

  /**
   * Dispatch an embed job for a single stored file. Wraps `_dispatchEmbedJobsFor`
   * with the safety checks needed for a user-triggered per-row action:
   *   1. The source must be known to the scanner OR have a state row — prevents
   *      arbitrary path dispatch from the public API.
   *   2. We refuse if any inflight job (waiting/active/delayed/paused) already
   *      targets this filePath. Otherwise a double-click or a rapid retry could
   *      enqueue duplicate jobs, producing duplicate chunks.
   *   3. When `force` is true (Re-embed of an already-indexed file), we
   *      pre-delete the prior Qdrant points so the new run doesn't stack on
   *      top of the old ones. For force=false (Index of a never-embedded file),
   *      there's nothing to clear.
   */
  public async embedSingleFile(
    source: string,
    force: boolean = false
  ): Promise<EmbedSingleFileResult> {
    const stateRow = await KbIngestState.query().where('file_path', source).first()
    if (!stateRow) {
      const knownFiles = await this._discoverKbFiles()
      if (!knownFiles.includes(source)) {
        return {
          success: false,
          code: 'not_found',
          message: 'File is not a tracked knowledge-base source.',
        }
      }
    }

    const { EmbedFileJob } = await import('#jobs/embed_file_job')
    const { QueueService } = await import('#services/queue_service')
    const queue = QueueService.getInstance().getQueue(EmbedFileJob.queue)
    const inflight = await queue.getJobs(['waiting', 'active', 'delayed', 'paused'])
    if (inflight.some((j) => j.data?.filePath === source)) {
      return {
        success: false,
        code: 'inflight',
        message: 'A job for this file is already in progress. Wait for it to finish before re-queuing.',
      }
    }

    if (force) {
      try {
        await this._deletePointsBySource(source)
      } catch (err) {
        logger.error(`[RAG] Failed to delete prior points for ${source}; aborting re-embed:`, err)
        return {
          success: false,
          code: 'delete_failed',
          message: 'Failed to clear prior embeddings before re-embed.',
        }
      }
    }

    const result = await this._dispatchEmbedJobsFor([source], { force })
    if (result.failedPaths.length > 0) {
      return {
        success: false,
        code: 'dispatch_failed',
        message: 'Failed to dispatch embed job for this file.',
      }
    }
    return {
      success: true,
      message: force ? 'Re-embed queued for this file.' : 'Indexing queued for this file.',
    }
  }

  /**
   * Delete all Qdrant points whose `source` payload matches the given path.
   * Unlike deleteFileBySource(), this does NOT touch the file on disk — used
   * by reembedAll() where the file must remain so it can be re-ingested.
   */
  private async _deletePointsBySource(source: string): Promise<void> {
    await this._ensureCollection(
      RagService.CONTENT_COLLECTION_NAME,
      RagService.EMBEDDING_DIMENSION
    )
    await this.qdrant!.delete(RagService.CONTENT_COLLECTION_NAME, {
      filter: { must: [{ key: 'source', match: { value: source } }] },
    })
  }

  /**
   * Returns true if the file-embeddings queue has any in-flight work
   * (waiting, active, delayed, or paused). Bulk re-embed actions use this
   * to refuse mid-flight to avoid racing with deletes/dispatches already
   * in progress.
   */
  private async _hasInflightEmbedJobs(): Promise<boolean> {
    const { EmbedFileJob } = await import('#jobs/embed_file_job')
    const { QueueService } = await import('#services/queue_service')
    const queue = QueueService.getInstance().getQueue(EmbedFileJob.queue)
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'paused')
    return (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0) + (counts.paused || 0) > 0
  }

  /**
   * Scans the knowledge base storage directories and syncs with Qdrant.
   * Identifies files that exist in storage but haven't been embedded yet,
   * and dispatches EmbedFileJob for each missing file.
   */
  public async scanAndSyncStorage(): Promise<{
    success: boolean
    message: string
    filesScanned?: number
    filesQueued?: number
  }> {
    try {
      logger.info('[RAG] Starting knowledge base sync scan')

      await this.discoverNomadDocs(true).catch((error) => {
        logger.error('[RAG] Error during Nomad docs discovery in sync process:', error)
      })

      const filesInStorage = await this._discoverKbFiles()
      logger.info(`[RAG] Found ${filesInStorage.length} embeddable files in storage`)

      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      // Collect every unique `source` already in Qdrant so we can skip files
      // that have already been embedded.
      const sourcesInQdrant = new Set<string>()
      let offset: string | number | null | Record<string, unknown> = null
      do {
        const scrollResult = await this.qdrant!.scroll(RagService.CONTENT_COLLECTION_NAME, {
          limit: 100,
          offset,
          with_payload: ['source'],
          with_vector: false,
        })
        scrollResult.points.forEach((point) => {
          const source = point.payload?.source
          if (source && typeof source === 'string') sourcesInQdrant.add(source)
        })
        offset = scrollResult.next_page_offset || null
      } while (offset !== null)

      logger.info(`[RAG] Found ${sourcesInQdrant.size} unique sources in Qdrant`)

      // Load all known per-file ingest states. The state row is authoritative
      // over the "any chunks in Qdrant" heuristic — it captures user choices
      // (browse_only) and terminal outcomes (failed, stalled) that aren't visible
      // from Qdrant alone. See RFC #883 for the full state machine.
      const stateRows = await KbIngestState.all()
      const stateByPath = new Map(stateRows.map((row) => [row.file_path, row]))

      // Non-embeddable files (e.g. kiwix-library.xml in /storage/zim) would otherwise
      // be dispatched to EmbedFileJob, fail with "Unsupported file type", and retry
      // on every sync — filter them out before state decisions.
      const embeddableFiles = filesInStorage.filter(
        (filePath) => determineFileType(filePath) !== 'unknown'
      )

      // Read the global ingest policy. Unset is treated as 'Always' so legacy
      // installs keep their current behavior until the user explicitly opts
      // into Manual mode from the KB panel.
      const policyRaw = await KVStore.getValue('rag.defaultIngestPolicy')
      const policy: IngestPolicy = policyRaw === 'Manual' ? 'Manual' : 'Always'

      const filesToEmbed: string[] = []
      let backfilled = 0
      let createdRows = 0
      let createdPending = 0
      let skipped = 0

      for (const filePath of embeddableFiles) {
        const stateRow = stateByPath.get(filePath) ?? null
        const action = decideScanAction(stateRow, sourcesInQdrant.has(filePath), policy)

        switch (action.kind) {
          case 'skip':
            skipped++
            break
          case 'backfill_indexed':
            // Pre-RFC install (or a fresh admin pointed at an existing Qdrant volume):
            // chunks already exist with no state row, so trust Qdrant and record
            // `indexed` without re-embedding. chunks_embedded is left 0 because
            // we don't count points-per-source during the scroll above.
            await KbIngestState.create({
              file_path: filePath,
              state: 'indexed',
              chunks_embedded: 0,
            })
            backfilled++
            break
          case 'create_pending':
            // Manual mode: record that we've seen the file but don't dispatch.
            // The KB panel surfaces a per-card "Index" affordance for these.
            await KbIngestState.create({
              file_path: filePath,
              state: 'pending_decision',
              chunks_embedded: 0,
            })
            createdPending++
            break
          case 'dispatch':
            if (action.createStateRow) {
              await KbIngestState.create({
                file_path: filePath,
                state: 'pending_decision',
                chunks_embedded: 0,
              })
              createdRows++
            }
            filesToEmbed.push(filePath)
            break
        }
      }

      logger.info(
        `[RAG] Scan results (policy=${policy}): ${filesToEmbed.length} to embed, ${backfilled} backfilled, ${createdRows} new pending, ${createdPending} waiting on user, ${skipped} skipped`
      )

      if (filesToEmbed.length === 0) {
        return {
          success: true,
          message: 'Knowledge base is already in sync',
          filesScanned: filesInStorage.length,
          filesQueued: 0,
        }
      }

      const { queuedCount, dedupedCount } = await this._dispatchEmbedJobsFor(filesToEmbed)
      const dedupeNote = dedupedCount > 0 ? ` (${dedupedCount} already queued)` : ''
      return {
        success: true,
        message: `Scanned ${filesInStorage.length} files, queued ${queuedCount} for embedding${dedupeNote}`,
        filesScanned: filesInStorage.length,
        filesQueued: queuedCount,
      }
    } catch (error) {
      logger.error('[RAG] Error scanning and syncing knowledge base:', error)
      return { success: false, message: 'Error scanning and syncing knowledge base' }
    }
  }

  /**
   * Re-embed every file on disk (per-file replace). For each discovered file:
   * delete its existing Qdrant points by `source` match, then dispatch a fresh
   * EmbedFileJob. Files are NOT removed from disk. Any orphan points (points
   * whose source file no longer exists) are intentionally preserved — use
   * resetAndRebuild() if a clean slate is required.
   *
   * Refuses to run if the embeddings queue already has in-flight work.
   */
  public async reembedAll(): Promise<{
    success: boolean
    message: string
    filesScanned?: number
    filesQueued?: number
    failedPaths?: string[]
  }> {
    try {
      if (await this._hasInflightEmbedJobs()) {
        return {
          success: false,
          message: 'Embed jobs are already in progress. Wait for the queue to drain (or clean up failed jobs) before triggering a bulk re-embed.',
        }
      }

      logger.info('[RAG] Starting full re-embed (per-file replace)')

      await this.discoverNomadDocs(true).catch((error) => {
        logger.error('[RAG] Error re-running Nomad docs discovery during re-embed:', error)
      })

      const filesInStorage = await this._discoverKbFiles()

      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      // Per-file: delete-then-dispatch. We tried dispatch-then-delete but that
      // opens a race where a fast worker can write new points before our
      // delete-by-source runs, wiping both. Instead we delete first, then
      // dispatch — and if dispatch fails, we surface the failed paths in the
      // response so the operator knows which files dropped out (rather than
      // silently leaving them unindexed). A subsequent sync rescan picks them
      // back up. Note: a delete-failure aborts the per-file pair (we don't
      // dispatch a job whose old points are still present, since they'd live
      // alongside the new vectors forever).
      const { EmbedFileJob } = await import('#jobs/embed_file_job')
      let queuedCount = 0
      const failedPaths: string[] = []
      for (const filePath of filesInStorage) {
        try {
          await this._deletePointsBySource(filePath)
        } catch (err) {
          logger.error(`[RAG] Failed to delete prior points for ${filePath}; skipping dispatch:`, err)
          failedPaths.push(filePath)
          continue
        }
        try {
          const fileName = filePath.split(/[/\\]/).pop() || filePath
          const stats = await getFileStatsIfExists(filePath)
          const result = await EmbedFileJob.dispatch(
            { filePath, fileName, fileSize: stats?.size },
            { force: true }
          )
          if (result.created) queuedCount++
        } catch (fileError) {
          // Old points already deleted but the new job never made it onto the
          // queue. Logged + surfaced so an operator can rerun a sync.
          logger.error(`[RAG] Re-embed dispatch failed for ${filePath} after delete; file is now unindexed until next sync:`, fileError)
          failedPaths.push(filePath)
        }
      }

      logger.info(
        `[RAG] Re-embed dispatched ${queuedCount}/${filesInStorage.length} files` +
          (failedPaths.length > 0 ? ` (${failedPaths.length} failed)` : '')
      )

      const failureSuffix =
        failedPaths.length > 0
          ? ` ${failedPaths.length} file${failedPaths.length === 1 ? '' : 's'} failed to dispatch and are temporarily unindexed — run a sync rescan to recover.`
          : ''

      return {
        success: failedPaths.length === 0,
        message:
          `Re-embedding ${queuedCount} file${queuedCount === 1 ? '' : 's'}. Existing points were replaced.` +
          failureSuffix,
        filesScanned: filesInStorage.length,
        filesQueued: queuedCount,
        ...(failedPaths.length > 0 ? { failedPaths } : {}),
      }
    } catch (error) {
      logger.error('[RAG] Error during re-embed:', error)
      return { success: false, message: 'Error during re-embed' }
    }
  }

  /**
   * Destructive rebuild. Drops the entire Qdrant collection (wiping every
   * point including orphans), recreates it with the correct dimension, clears
   * the Nomad-docs discovery flag, then dispatches an EmbedFileJob for every
   * file currently on disk.
   *
   * Refuses to run if the embeddings queue already has in-flight work.
   */
  public async resetAndRebuild(): Promise<{
    success: boolean
    message: string
    filesScanned?: number
    filesQueued?: number
    failedPaths?: string[]
  }> {
    try {
      if (await this._hasInflightEmbedJobs()) {
        return {
          success: false,
          message: 'Embed jobs are already in progress. Wait for the queue to drain (or clean up failed jobs) before triggering a reset.',
        }
      }

      logger.info('[RAG] Starting destructive reset & rebuild')

      await this._initializeQdrantClient()
      try {
        await this.qdrant!.deleteCollection(RagService.CONTENT_COLLECTION_NAME)
        logger.info(`[RAG] Dropped collection ${RagService.CONTENT_COLLECTION_NAME}`)
      } catch (err) {
        // Collection may not exist yet on a fresh install — log and continue.
        logger.warn(`[RAG] deleteCollection failed (may not exist): ${(err as Error).message}`)
      }

      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      // Force Nomad docs to be re-dispatched.
      await KVStore.setValue('rag.docsEmbedded', false)
      await this.discoverNomadDocs(true).catch((error) => {
        logger.error('[RAG] Error re-running Nomad docs discovery after reset:', error)
      })

      const filesInStorage = await this._discoverKbFiles()
      const { queuedCount, failedPaths } = await this._dispatchEmbedJobsFor(filesInStorage, {
        force: true,
      })

      logger.info(
        `[RAG] Reset complete — dispatched ${queuedCount}/${filesInStorage.length} files` +
          (failedPaths.length > 0 ? ` (${failedPaths.length} failed)` : '')
      )

      // Collection was already dropped, so dispatch failures here mean the
      // file is gone from Qdrant with no pending job to repopulate it. Surface
      // the count + paths so the operator can rerun a sync rescan to recover.
      const failureSuffix =
        failedPaths.length > 0
          ? ` ${failedPaths.length} file${failedPaths.length === 1 ? '' : 's'} failed to dispatch and are temporarily unindexed — run a sync rescan to recover.`
          : ''

      return {
        success: failedPaths.length === 0,
        message:
          `Collection wiped. Queued ${queuedCount} file${queuedCount === 1 ? '' : 's'} for a full rebuild.` +
          failureSuffix,
        filesScanned: filesInStorage.length,
        filesQueued: queuedCount,
        ...(failedPaths.length > 0 ? { failedPaths } : {}),
      }
    } catch (error) {
      logger.error('[RAG] Error during reset & rebuild:', error)
      return { success: false, message: 'Error during reset & rebuild' }
    }
  }
}
