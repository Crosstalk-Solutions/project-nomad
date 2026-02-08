import { Archive, Entry } from '@openzim/libzim'
import * as cheerio from 'cheerio'
import { HTML_SELECTORS_TO_REMOVE, NON_CONTENT_HEADING_PATTERNS } from '../../constants/zim_extraction.js'
import logger from '@adonisjs/core/services/logger'
import { ExtractZIMChunkingStrategy, ExtractZIMContentOptions, ZIMContentChunk, ZIMArchiveMetadata } from '../../types/zim.js'
import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'

export class ZIMExtractionService {

    private extractArchiveMetadata(archive: Archive): ZIMArchiveMetadata {
        try {
            return {
                title: archive.getMetadata('Title') || archive.getMetadata('Name') || 'Unknown',
                creator: archive.getMetadata('Creator') || 'Unknown',
                publisher: archive.getMetadata('Publisher') || 'Unknown',
                date: archive.getMetadata('Date') || 'Unknown',
                language: archive.getMetadata('Language') || 'Unknown',
                description: archive.getMetadata('Description') || '',
            }
        } catch (error) {
            logger.warn('[ZIMExtractionService]: Could not extract all metadata, using defaults', error)
            return {
                title: 'Unknown',
                creator: 'Unknown',
                publisher: 'Unknown',
                date: 'Unknown',
                language: 'Unknown',
                description: '',
            }
        }
    }

    /**
     * Breaks out a ZIM file's entries into their structured content form
     * to facilitate better indexing and retrieval.
     * Returns enhanced chunks with full article context and metadata.
     * 
     * @param filePath - Path to the ZIM file
     * @param opts - Options including maxArticles, strategy, onProgress, startOffset, and batchSize
     */
    async extractZIMContent(filePath: string, opts: ExtractZIMContentOptions = {}): Promise<ZIMContentChunk[]> {
        try {
            logger.info(`[ZIMExtractionService]: Processing ZIM file at path: ${filePath}`)
            
            // defensive - check if file still exists before opening
            // could have been deleted by another process or batch
            try {
                await access(filePath)
            } catch (error) {
                logger.error(`[ZIMExtractionService]: ZIM file not accessible: ${filePath}`)
                throw new Error(`ZIM file not found or not accessible: ${filePath}`)
            }
            
            const archive = new Archive(filePath)

            // Extract archive-level metadata once
            const archiveMetadata = this.extractArchiveMetadata(archive)
            logger.info(`[ZIMExtractionService]: Archive metadata - Title: ${archiveMetadata.title}, Language: ${archiveMetadata.language}`)

            let articlesProcessed = 0
            let articlesSkipped = 0
            const processedPaths = new Set<string>()
            const toReturn: ZIMContentChunk[] = []

            // Support batch processing to avoid lock timeouts on large ZIM files
            const startOffset = opts.startOffset || 0
            const batchSize = opts.batchSize || (opts.maxArticles || Infinity)

            for (const entry of archive.iterByPath()) {
                // Skip articles until we reach the start offset
                if (articlesSkipped < startOffset) {
                    if (this.isArticleEntry(entry) && !processedPaths.has(entry.path)) {
                        articlesSkipped++
                    }
                    continue
                }

                if (articlesProcessed >= batchSize) {
                    break
                }

                if (!this.isArticleEntry(entry)) {
                    logger.debug(`[ZIMExtractionService]: Skipping non-article entry at path: ${entry.path}`)
                    continue
                }

                if (processedPaths.has(entry.path)) {
                    logger.debug(`[ZIMExtractionService]: Skipping duplicate entry at path: ${entry.path}`)
                    continue
                }
                processedPaths.add(entry.path)

                const item = entry.item
                const blob = item.data
                const html = this.getCleanedHTMLString(blob.data)

                const strategy = opts.strategy || this.chooseChunkingStrategy(html);
                logger.debug(`[ZIMExtractionService]: Chosen chunking strategy for path ${entry.path}: ${strategy}`)

                // Generate a unique document ID. All chunks from same article will share it
                const documentId = randomUUID()
                const articleTitle = entry.title || entry.path

                let chunks: ZIMContentChunk[]

                if (strategy === 'structured') {
                    const structured = this.extractStructuredContent(html)
                    chunks = structured.sections.map(s => ({
                        text: s.text,
                        articleTitle,
                        articlePath: entry.path,
                        sectionTitle: s.heading,
                        fullTitle: `${articleTitle} - ${s.heading}`,
                        hierarchy: `${articleTitle} > ${s.heading}`,
                        sectionLevel: s.level,
                        documentId,
                        archiveMetadata,
                        strategy,
                    }))
                } else {
                    // Simple strategy - entire article as one chunk
                    const text = this.extractTextFromHTML(html) || ''
                    chunks = [{
                        text,
                        articleTitle,
                        articlePath: entry.path,
                        sectionTitle: articleTitle, // Same as article for simple strategy
                        fullTitle: articleTitle,
                        hierarchy: articleTitle,
                        documentId,
                        archiveMetadata,
                        strategy,
                    }]
                }

                logger.debug(`Extracted ${chunks.length} chunks from article at path: ${entry.path} using strategy: ${strategy}`)

                const nonEmptyChunks = chunks.filter(c => c.text.trim().length > 0)
                logger.debug(`After filtering empty chunks, ${nonEmptyChunks.length} chunks remain for article at path: ${entry.path}`)
                toReturn.push(...nonEmptyChunks)
                articlesProcessed++

                if (opts.onProgress) {
                    opts.onProgress(articlesProcessed, archive.articleCount)
                }
            }

            logger.info(`[ZIMExtractionService]: Completed processing ZIM file. Total articles processed: ${articlesProcessed}`)
            logger.debug("Final structured content sample:", toReturn.slice(0, 3).map(c => ({
                articleTitle: c.articleTitle,
                sectionTitle: c.sectionTitle,
                hierarchy: c.hierarchy,
                textPreview: c.text.substring(0, 100)
            })))
            logger.debug("Total structured sections extracted:", toReturn.length)
            return toReturn
        } catch (error) {
            logger.error('Error processing ZIM file:', error)
            throw error
        }
    }

    private chooseChunkingStrategy(html: string, options = {
        forceStrategy: null as ExtractZIMChunkingStrategy | null,
    }): ExtractZIMChunkingStrategy {
        const {
            forceStrategy = null,
        } = options;

        if (forceStrategy) return forceStrategy;

        // Use a simple analysis to determin if the HTML has any meaningful structure
        // that we can leverage for better chunking. If not, we'll just chunk it as one big piece of text.
        return this.hasStructuredHeadings(html) ? 'structured' : 'simple';
    }

    private getCleanedHTMLString(buff: Buffer<ArrayBufferLike>): string {
        const rawString = buff.toString('utf-8');
        const $ = cheerio.load(rawString);

        HTML_SELECTORS_TO_REMOVE.forEach((selector) => {
            $(selector).remove()
        });

        return $.html();
    }

    private extractTextFromHTML(html: string): string | null {
        try {
            const $ = cheerio.load(html)

            // Search body first, then root if body is absent
            const text = $('body').length ? $('body').text() : $.root().text()

            return text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim()
        } catch (error) {
            logger.error('Error extracting text from HTML:', error)
            return null
        }
    }

    private extractStructuredContent(html: string) {
        const $ = cheerio.load(html);

        const title = $('h1').first().text().trim() || $('title').text().trim();

        // Extract sections with their headings and heading levels
        const sections: Array<{ heading: string; text: string; level: number }> = [];
        let currentSection = { heading: 'Introduction', content: [] as string[], level: 2 };

        $('body').children().each((_, element) => {
            const $el = $(element);
            const tagName = element.tagName?.toLowerCase();

            if (['h2', 'h3', 'h4'].includes(tagName)) {
                // Save current section if it has content
                if (currentSection.content.length > 0) {
                    sections.push({
                        heading: currentSection.heading,
                        text: currentSection.content.join(' ').replace(/\s+/g, ' ').trim(),
                        level: currentSection.level,
                    });
                }
                // Start new section
                const level = parseInt(tagName.substring(1)); // Extract number from h2, h3, h4
                currentSection = {
                    heading: $el.text().replace(/\[edit\]/gi, '').trim(),
                    content: [],
                    level,
                };
            } else if (['p', 'ul', 'ol', 'dl', 'table'].includes(tagName)) {
                const text = $el.text().trim();
                if (text.length > 0) {
                    currentSection.content.push(text);
                }
            }
        });

        // Push the last section if it has content
        if (currentSection.content.length > 0) {
            sections.push({
                heading: currentSection.heading,
                text: currentSection.content.join(' ').replace(/\s+/g, ' ').trim(),
                level: currentSection.level,
            });
        }

        return {
            title,
            sections,
            fullText: sections.map(s => `${s.heading}\n${s.text}`).join('\n\n'),
        };
    }

    private hasStructuredHeadings(html: string): boolean {
        const $ = cheerio.load(html);

        const headings = $('h2, h3').toArray();

        // Consider it structured if it has at least 2 headings to break content into meaningful sections
        if (headings.length < 2) return false;

        // Check that headings have substantial content between them
        let sectionsWithContent = 0;

        for (const heading of headings) {
            const $heading = $(heading);
            const headingText = $heading.text().trim();

            // Skip empty or very short headings, likely not meaningful
            if (headingText.length < 3) continue;

            // Skip common non-content headings
            if (NON_CONTENT_HEADING_PATTERNS.some(pattern => pattern.test(headingText))) {
                continue;
            }

            // Content until next heading
            let contentLength = 0;
            let $next = $heading.next();

            while ($next.length && !$next.is('h1, h2, h3, h4')) {
                contentLength += $next.text().trim().length;
                $next = $next.next();
            }

            // Consider it a real section if it has at least 100 chars of content
            if (contentLength >= 100) {
                sectionsWithContent++;
            }
        }

        // Require at least 2 sections with substantial content
        return sectionsWithContent >= 2;
    }

    private isArticleEntry(entry: Entry): boolean {
        try {
            if (entry.isRedirect) return false;

            const item = entry.item;
            const mimeType = item.mimetype;

            return mimeType === 'text/html' || mimeType === 'application/xhtml+xml';
        } catch {
            return false;
        }
    }
}