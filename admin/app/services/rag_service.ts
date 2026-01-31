import { QdrantClient } from '@qdrant/js-client-rest'
import { DockerService } from './docker_service.js'
import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import { chunk } from 'llm-chunk'
import sharp from 'sharp'
import { determineFileType, getFile } from '../utils/fs.js'
import { PDFParse } from 'pdf-parse'
import { createWorker } from 'tesseract.js'
import { fromBuffer } from 'pdf2pic'
import { OllamaService } from './ollama_service.js'

@inject()
export class RagService {
  private qdrant: QdrantClient | null = null
  private qdrantInitPromise: Promise<void> | null = null
  public static CONTENT_COLLECTION_NAME = 'open-webui_knowledge' // This is the collection name OWUI uses for uploaded knowledge
  public static EMBEDDING_MODEL = 'nomic-embed-text:v1.5'
  public static EMBEDDING_DIMENSION = 768 // Nomic Embed Text v1.5 dimension is 768

  constructor(
    private dockerService: DockerService,
    private ollamaService: OllamaService
  ) {}

  private async _initializeQdrantClient() {
    if (!this.qdrantInitPromise) {
      this.qdrantInitPromise = (async () => {
        const qdrantUrl = await this.dockerService.getServiceURL(DockerService.QDRANT_SERVICE_NAME)
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

      // TODO: Attempt to download the embedding model if not found
      if (!embeddingModel) {
        throw new Error(`${RagService.EMBEDDING_MODEL} does not exist and could not be downloaded.`)
      }

      const chunks = chunk(text, {
        // These settings should provide a good balance between context and precision
        minLength: 512,
        maxLength: 1024,
        overlap: 200,
      })

      if (!chunks || chunks.length === 0) {
        throw new Error('No text chunks generated for embedding.')
      }

      const embeddings: number[][] = []
      const ollamaClient = await this.ollamaService.getClient()
      for (const chunkText of chunks) {
        const response = await ollamaClient.embeddings({
          model: RagService.EMBEDDING_MODEL,
          prompt: chunkText,
        })

        embeddings.push(response.embedding)
      }

      const points = chunks.map((chunkText, index) => ({
        id: `${Date.now()}_${index}`,
        vector: embeddings[index],
        payload: {
          ...metadata,
          text: chunkText,
          chunk_index: index,
        },
      }))

      await this.qdrant!.upsert(RagService.CONTENT_COLLECTION_NAME, { points })

      return { chunks: chunks.length }
    } catch (error) {
      logger.error('Error embedding text:', error)
      return null
    }
  }

  /**
   * Preprocess an image to enhance text extraction quality.
   * Normalizes, grayscales, sharpens, and resizes the image to a manageable size.
   * @param filebuffer Buffer of the image file
   * @returns - Processed image buffer
   */
  private async preprocessImage(filebuffer: Buffer): Promise<Buffer> {
    return await sharp(filebuffer)
      .grayscale()
      .normalize()
      .sharpen()
      .resize({ width: 2000, fit: 'inside' })
      .toBuffer()
  }

  /**
   * If the original PDF has little to no extractable text,
   * we can use this method to convert each page to an image for OCR processing.
   * @param filebuffer - Buffer of the PDF file
   * @returns - Array of image buffers, one per page
   */
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

  /**
   * Extract text from a PDF file using pdf-parse.
   * @param filebuffer - Buffer of the PDF file
   * @returns - Extracted text
   */
  private async extractPDFText(filebuffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: filebuffer })
    const data = await parser.getText()
    await parser.destroy()
    return data.text
  }

  /**
   * Extract text from a plain text file.
   * @param filebuffer - Buffer of the text file
   * @returns - Extracted text
   */
  private async extractTXTText(filebuffer: Buffer): Promise<string> {
    return filebuffer.toString('utf-8')
  }

  /**
   * Extract text from an image file using Tesseract.js OCR.
   * @param filebuffer - Buffer of the image file
   * @returns - Extracted text
   */
  private async extractImageText(filebuffer: Buffer): Promise<string> {
    const worker = await createWorker('eng')
    const result = await worker.recognize(filebuffer)
    await worker.terminate()
    return result.data.text
  }

  /**
   * Main pipeline to process and embed an uploaded file into the RAG knowledge base.
   * This includes text extraction, chunking, embedding, and storing in Qdrant.
   */
  public async processAndEmbedFile(
    filepath: string
  ): Promise<{ success: boolean; message: string; chunks?: number }> {
    try {
      const fileType = determineFileType(filepath)
      if (fileType === 'unknown') {
        return { success: false, message: 'Unsupported file type.' }
      }

      const origFileBuffer = await getFile(filepath, 'buffer')
      if (!origFileBuffer) {
        return { success: false, message: 'Failed to read the uploaded file.' }
      }

      let extractedText = ''

      if (fileType === 'image') {
        const preprocessedBuffer = await this.preprocessImage(origFileBuffer)
        extractedText = await this.extractImageText(preprocessedBuffer)
      } else if (fileType === 'pdf') {
        extractedText = await this.extractPDFText(origFileBuffer)
        // Check if there was no extracted text or it was very minimal
        if (!extractedText || extractedText.trim().length < 100) {
          // Convert PDF pages to images for OCR
          const imageBuffers = await this.convertPDFtoImages(origFileBuffer)
          for (const imgBuffer of imageBuffers) {
            const preprocessedImg = await this.preprocessImage(imgBuffer)
            const pageText = await this.extractImageText(preprocessedImg)
            extractedText += pageText + '\n'
          }
        }
      } else {
        extractedText = await this.extractTXTText(origFileBuffer)
      }

      if (!extractedText || extractedText.trim().length === 0) {
        return { success: false, message: 'No text could be extracted from the file.' }
      }

      const embedResult = await this.embedAndStoreText(extractedText, {})

      return {
        success: true,
        message: 'File processed and embedded successfully.',
        chunks: embedResult?.chunks,
      }
    } catch (error) {
      logger.error('Error processing and embedding file:', error)
      return { success: false, message: 'Error processing and embedding file.' }
    }
  }

  /**
   * Search for documents similar to the query text in the Qdrant knowledge base.
   * Returns the most relevant text chunks based on semantic similarity.
   * @param query - The search query text
   * @param limit - Maximum number of results to return (default: 5)
   * @param scoreThreshold - Minimum similarity score threshold (default: 0.7)
   * @returns Array of relevant text chunks with their scores
   */
  public async searchSimilarDocuments(
    query: string,
    limit: number = 5,
    scoreThreshold: number = 0.7
  ): Promise<Array<{ text: string; score: number }>> {
    try {
      await this._ensureCollection(
        RagService.CONTENT_COLLECTION_NAME,
        RagService.EMBEDDING_DIMENSION
      )

      const allModels = await this.ollamaService.getModels(true)
      const embeddingModel = allModels.find((model) => model.name === RagService.EMBEDDING_MODEL)

      if (!embeddingModel) {
        logger.warn(
          `${RagService.EMBEDDING_MODEL} not found. Cannot perform similarity search.`
        )
        return []
      }

      // Generate embedding for the query
      const ollamaClient = await this.ollamaService.getClient()
      const response = await ollamaClient.embeddings({
        model: RagService.EMBEDDING_MODEL,
        prompt: query,
      })

      // Search for similar vectors in Qdrant
      const searchResults = await this.qdrant!.search(RagService.CONTENT_COLLECTION_NAME, {
        vector: response.embedding,
        limit: limit,
        score_threshold: scoreThreshold,
        with_payload: true,
      })

      console.log("Got search results:", searchResults);

      return searchResults.map((result) => ({
        text: (result.payload?.text as string) || '',
        score: result.score,
      }))
    } catch (error) {
      logger.error('Error searching similar documents:', error)
      return []
    }
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
          const metadata = point.payload?.metadata
          if (metadata && typeof metadata === 'object' && 'source' in metadata) {
            const source = metadata.source as string
            sources.add(source)
          }
        })

        offset = scrollResult.next_page_offset || null
      } while (offset !== null)

      return Array.from(sources)
    } catch (error) {
      logger.error('Error retrieving stored files:', error)
      return []
    }
  }
}
