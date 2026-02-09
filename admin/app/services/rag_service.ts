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
import { OllamaService } from './ollama_service.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import { removeStopwords } from 'stopword'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import KVStore from '#models/kv_store'
import { parseBoolean } from '../utils/misc.js'
import { ZIMExtractionService } from './zim_extraction_service.js'
import { ZIM_BATCH_SIZE } from '../../constants/zim_extraction.js'

@inject()
export class RagService {
  private qdrant: QdrantClient | null = null
  private qdrantInitPromise: Promise<void> | null = null
  public static UPLOADS_STORAGE_PATH = 'storage/kb_uploads'
  public static CONTENT_COLLECTION_NAME = 'nomad_knowledge_base'
  public static EMBEDDING_MODEL = 'nomic-embed-text:v1.5'
  public static EMBEDDING_DIMENSION = 768 // Nomic Embed Text v1.5 dimension is 768
  public static MODEL_CONTEXT_LENGTH = 2048 // nomic-embed-text has 2K token context
  public static MAX_SAFE_TOKENS = 1800 // Leave buffer for prefix and tokenization variance
  public static TARGET_TOKENS_PER_CHUNK = 1700 // Target 1700 tokens per chunk for embedding
  public static PREFIX_TOKEN_BUDGET = 10 // Reserve ~10 tokens for prefixes
  public static CHAR_TO_TOKEN_RATIO = 3 // Approximate chars per token
  // Nomic Embed Text v1.5 uses task-specific prefixes for optimal performance
  public static SEARCH_DOCUMENT_PREFIX = 'search_document: '
  public static SEARCH_QUERY_PREFIX = 'search_query: '

  constructor(
    private dockerService: DockerService,
    private ollamaService: OllamaService
  ) { }

  private async _initializeQdrantClient() {
    if (!this.qdrantInitPromise) {
      this.qdrantInitPromise = (async () => {
        const qdrantUrl = await this.dockerService.getServiceURL(SERVICE_NAMES.QDRANT)
        if (!qdrantUrl) {
          throw new Error('Qdrant service is not installed or running.')
        }
        this.qdrant = new QdrantClient({ url: qdrantUrl })
      })()
    }
    return this.qdrantInitPromise
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
   */
  private preprocessQuery(query: string): string {
    // Future: this is a placeholder for more advanced query expansion techniques.
    // For now, we simply trim whitespace. Improvements could include:
    // - Synonym expansion using a thesaurus
    // - Adding related terms based on domain knowledge
    // - Using a language model to rephrase or elaborate the query
    const expanded = query.trim()
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
    metadata: Record<string, any> = {}
  ): Promise<{ chunks: number } | null> {
    try {
      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      const allModels = await this.ollamaService.getModels(true)
      const embeddingModel = allModels.find((model) => model.name === RagService.EMBEDDING_MODEL)

      if (!embeddingModel) {
        try {
          const downloadResult = await this.ollamaService.downloadModel(RagService.EMBEDDING_MODEL)
          if (!downloadResult.success) {
            throw new Error(downloadResult.message || 'Unknown error during model download')
          }
        } catch (modelError) {
          logger.error(
            `[RAG] Embedding model ${RagService.EMBEDDING_MODEL} not found locally and failed to download:`,
            modelError
          )
          return null
        }
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

      const ollamaClient = await this.ollamaService.getClient()

      const embeddings: number[][] = []
      for (let i = 0; i < chunks.length; i++) {
        let chunkText = chunks[i]

        // Final safety check: ensure chunk + prefix fits
        const prefixText = RagService.SEARCH_DOCUMENT_PREFIX
        const withPrefix = prefixText + chunkText
        const estimatedTokens = this.estimateTokenCount(withPrefix)

        if (estimatedTokens > RagService.MAX_SAFE_TOKENS) {
          // This should be rare - log for debugging if it's occurring frequently
          const prefixTokens = this.estimateTokenCount(prefixText)
          const maxTokensForText = RagService.MAX_SAFE_TOKENS - prefixTokens
          logger.warn(
            `[RAG] Chunk ${i} estimated at ${estimatedTokens} tokens (${chunkText.length} chars), truncating to ${maxTokensForText} tokens`
          )
          chunkText = this.truncateToTokenLimit(chunkText, maxTokensForText)
        }

        logger.debug(`[RAG] Generating embedding for chunk ${i + 1}/${chunks.length}`)

        const response = await ollamaClient.embeddings({
          model: RagService.EMBEDDING_MODEL,
          prompt: RagService.SEARCH_DOCUMENT_PREFIX + chunkText,
        })

        embeddings.push(response.embedding)
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
    batchOffset?: number
  ): Promise<{
    success: boolean
    message: string
    chunks?: number
    hasMoreBatches?: boolean
    articlesProcessed?: number
    totalArticles?: number
  }> {
    const zimExtractionService = new ZIMExtractionService()

    // Process in batches to avoid lock timeout
    const startOffset = batchOffset || 0

    logger.info(
      `[RAG] Extracting ZIM content (batch: offset=${startOffset}, size=${ZIM_BATCH_SIZE})`
    )

    const zimChunks = await zimExtractionService.extractZIMContent(filepath, {
      startOffset,
      batchSize: ZIM_BATCH_SIZE,
    })

    logger.info(
      `[RAG] Extracted ${zimChunks.length} chunks from ZIM file with enhanced metadata`
    )

    // Process each chunk individually with its metadata
    let totalChunks = 0
    for (const zimChunk of zimChunks) {
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
    }

    // Count unique articles processed in this batch
    const articlesInBatch = new Set(zimChunks.map((c) => c.documentId)).size
    const hasMoreBatches = zimChunks.length === ZIM_BATCH_SIZE

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
    }
  }

  private async processTextFile(fileBuffer: Buffer): Promise<string> {
    return await this.extractTXTText(fileBuffer)
  }

  private async embedTextAndCleanup(
    extractedText: string,
    filepath: string,
    deleteAfterEmbedding: boolean = false
  ): Promise<{ success: boolean; message: string; chunks?: number }> {
    if (!extractedText || extractedText.trim().length === 0) {
      return { success: false, message: 'Process completed succesfully, but no text was found to embed.' }
    }

    const embedResult = await this.embedAndStoreText(extractedText, {
      source: filepath
    })

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
    batchOffset?: number
  ): Promise<{
    success: boolean
    message: string
    chunks?: number
    hasMoreBatches?: boolean
    articlesProcessed?: number
    totalArticles?: number
  }> {
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
        return await this.processZIMFile(filepath, deleteAfterEmbedding, batchOffset)
      }

      // Extract text based on file type
      let extractedText: string
      switch (fileType) {
        case 'image':
          extractedText = await this.processImageFile(fileBuffer!)
          break
        case 'pdf':
          extractedText = await this.processPDFFile(fileBuffer!)
          break
        case 'text':
        default:
          extractedText = await this.processTextFile(fileBuffer!)
          break
      }

      // Embed extracted text and cleanup
      return await this.embedTextAndCleanup(extractedText, filepath, deleteAfterEmbedding)
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

      const allModels = await this.ollamaService.getModels(true)
      const embeddingModel = allModels.find((model) => model.name === RagService.EMBEDDING_MODEL)

      if (!embeddingModel) {
        logger.warn(
          `[RAG] ${RagService.EMBEDDING_MODEL} not found. Cannot perform similarity search.`
        )
        return []
      }

      // Preprocess query for better matching
      const processedQuery = this.preprocessQuery(query)
      const keywords = this.extractKeywords(processedQuery)
      logger.debug(`[RAG] Extracted keywords: [${keywords.join(', ')}]`)

      // Generate embedding for the query with search_query prefix
      const ollamaClient = await this.ollamaService.getClient()

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

      const response = await ollamaClient.embeddings({
        model: RagService.EMBEDDING_MODEL,
        prompt: prefixedQuery,
      })

      // Perform semantic search with a higher limit to enable reranking
      const searchLimit = limit * 3 // Get more results for reranking
      logger.debug(
        `[RAG] Searching for top ${searchLimit} semantic matches (threshold: ${scoreThreshold})`
      )

      const searchResults = await this.qdrant!.search(RagService.CONTENT_COLLECTION_NAME, {
        vector: response.embedding,
        limit: searchLimit,
        score_threshold: scoreThreshold,
        with_payload: true,
      })

      logger.debug(`[RAG] Found ${searchResults.length} results above threshold ${scoreThreshold}`)

      // Map results with metadata for reranking
      const resultsWithMetadata = searchResults.map((result) => ({
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
      }))

      const rerankedResults = this.rerankResults(resultsWithMetadata, keywords, query)

      logger.debug(`[RAG] Top 3 results after reranking:`)
      rerankedResults.slice(0, 3).forEach((result, idx) => {
        logger.debug(
          `[RAG]   ${idx + 1}. Score: ${result.finalScore.toFixed(4)} (semantic: ${result.score.toFixed(4)}) - "${result.text.substring(0, 100)}..."`
        )
      })

      // Return top N results with enhanced metadata
      return rerankedResults.slice(0, limit).map((result) => ({
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
    results: Array<{
      text: string
      score: number
      keywords: string
      chunk_index: number
      created_at: number
      article_title?: string
      section_title?: string
      full_title?: string
      hierarchy?: string
      document_id?: string
      content_type?: string
    }>,
    queryKeywords: string[],
    originalQuery: string
  ): Array<{
    text: string
    score: number
    finalScore: number
    chunk_index: number
    created_at: number
    article_title?: string
    section_title?: string
    full_title?: string
    hierarchy?: string
    document_id?: string
    content_type?: string
  }> {
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

        finalScore = Math.min(1.0, finalScore + keywordBoost)

        return {
          ...result,
          finalScore,
        }
      })
      .sort((a, b) => b.finalScore - a.finalScore)
  }

  /**
   * Retrieve all unique source files that have been stored in the knowledge base.
   * @returns Array of unique source file identifiers
   */
  public async getStoredFiles(): Promise<string[]> {
    try {
      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      const sources = new Set<string>()
      let offset: string | number | null | Record<string, unknown> = null
      const batchSize = 100

      // Scroll through all points in the collection
      do {
        const scrollResult = await this.qdrant!.scroll(RagService.CONTENT_COLLECTION_NAME, {
          limit: batchSize,
          offset: offset,
          with_payload: true,
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

      const sourcesArr = Array.from(sources)

      // The source is a full path - only extract the filename for display
      return sourcesArr.map((src) => {
        const parts = src.split(/[/\\]/)
        return parts[parts.length - 1] // Return the last part as filename
      })
    } catch (error) {
      logger.error('Error retrieving stored files:', error)
      return []
    }
  }

  public async discoverNomadDocs(force?: boolean): Promise<{ success: boolean; message: string }> {
    try {
      const README_PATH = join(process.cwd(), 'README.md')
      const DOCS_DIR = join(process.cwd(), 'docs')

      const alreadyEmbeddedRaw = await KVStore.getValue('rag.docsEmbedded')
      if (parseBoolean(alreadyEmbeddedRaw) && !force) {
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
      await KVStore.setValue('rag.docsEmbedded', 'true')

      return { success: true, message: `Nomad docs discovery completed. Dispatched ${filesToEmbed.length} embedding jobs.` }
    } catch (error) {
      logger.error('Error discovering Nomad docs:', error)
      return { success: false, message: 'Error discovering Nomad docs.' }
    }
  }

  /**
   * Scans the knowledge base storage directories and syncs with Qdrant.
   * Identifies files that exist in storage but haven't been embedded yet,
   * and dispatches EmbedFileJob for each missing file.
   *
   * @returns Object containing success status, message, and counts of scanned/queued files
   */
  public async scanAndSyncStorage(): Promise<{
    success: boolean
    message: string
    filesScanned?: number
    filesQueued?: number
  }> {
    try {
      logger.info('[RAG] Starting knowledge base sync scan')

      const KB_UPLOADS_PATH = join(process.cwd(), RagService.UPLOADS_STORAGE_PATH)
      const ZIM_PATH = join(process.cwd(), ZIM_STORAGE_PATH)

      const filesInStorage: string[] = []

      // Force resync of Nomad docs
      await this.discoverNomadDocs(true).catch((error) => {
        logger.error('[RAG] Error during Nomad docs discovery in sync process:', error)
      })

      // Scan kb_uploads directory
      try {
        const kbContents = await listDirectoryContentsRecursive(KB_UPLOADS_PATH)
        kbContents.forEach((entry) => {
          if (entry.type === 'file') {
            filesInStorage.push(entry.key)
          }
        })
        logger.debug(`[RAG] Found ${kbContents.length} files in ${RagService.UPLOADS_STORAGE_PATH}`)
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.debug(`[RAG] ${RagService.UPLOADS_STORAGE_PATH} directory does not exist, skipping`)
        } else {
          throw error
        }
      }

      // Scan zim directory
      try {
        const zimContents = await listDirectoryContentsRecursive(ZIM_PATH)
        zimContents.forEach((entry) => {
          if (entry.type === 'file') {
            filesInStorage.push(entry.key)
          }
        })
        logger.debug(`[RAG] Found ${zimContents.length} files in ${ZIM_STORAGE_PATH}`)
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.debug(`[RAG] ${ZIM_STORAGE_PATH} directory does not exist, skipping`)
        } else {
          throw error
        }
      }

      logger.info(`[RAG] Found ${filesInStorage.length} total files in storage directories`)

      // Get all stored sources from Qdrant
      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      const sourcesInQdrant = new Set<string>()
      let offset: string | number | null | Record<string, unknown> = null
      const batchSize = 100

      // Scroll through all points to get sources
      do {
        const scrollResult = await this.qdrant!.scroll(RagService.CONTENT_COLLECTION_NAME, {
          limit: batchSize,
          offset: offset,
          with_payload: ['source'], // Only fetch source field for efficiency
          with_vector: false,
        })

        scrollResult.points.forEach((point) => {
          const source = point.payload?.source
          if (source && typeof source === 'string') {
            sourcesInQdrant.add(source)
          }
        })

        offset = scrollResult.next_page_offset || null
      } while (offset !== null)

      logger.info(`[RAG] Found ${sourcesInQdrant.size} unique sources in Qdrant`)

      // Find files that are in storage but not in Qdrant
      const filesToEmbed = filesInStorage.filter((filePath) => !sourcesInQdrant.has(filePath))

      logger.info(`[RAG] Found ${filesToEmbed.length} files that need embedding`)

      if (filesToEmbed.length === 0) {
        return {
          success: true,
          message: 'Knowledge base is already in sync',
          filesScanned: filesInStorage.length,
          filesQueued: 0,
        }
      }

      // Import EmbedFileJob dynamically to avoid circular dependencies
      const { EmbedFileJob } = await import('#jobs/embed_file_job')

      // Dispatch jobs for files that need embedding
      let queuedCount = 0
      for (const filePath of filesToEmbed) {
        try {
          const fileName = filePath.split(/[/\\]/).pop() || filePath
          const stats = await getFileStatsIfExists(filePath)

          logger.info(`[RAG] Dispatching embed job for: ${fileName}`)
          await EmbedFileJob.dispatch({
            filePath: filePath,
            fileName: fileName,
            fileSize: stats?.size,
          })
          queuedCount++
          logger.debug(`[RAG] Successfully dispatched job for ${fileName}`)
        } catch (fileError) {
          logger.error(`[RAG] Error dispatching job for file ${filePath}:`, fileError)
        }
      }

      return {
        success: true,
        message: `Scanned ${filesInStorage.length} files, queued ${queuedCount} for embedding`,
        filesScanned: filesInStorage.length,
        filesQueued: queuedCount,
      }
    } catch (error) {
      logger.error('[RAG] Error scanning and syncing knowledge base:', error)
      return {
        success: false,
        message: 'Error scanning and syncing knowledge base',
      }
    }
  }
}
