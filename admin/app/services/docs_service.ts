import Markdoc from '@markdoc/markdoc';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export class DocsService {
  async getDocs() {
    const docsPath = join(process.cwd(), '/docs');
    console.log(`Resolving docs path: ${docsPath}`);

    const files = await readdir(docsPath, { withFileTypes: true });
    const docs = files
      .filter(file => file.isFile() && file.name.endsWith('.md'))
      .map(file => file.name);
    return docs;
  }

  parse(content: string) {
    const ast = Markdoc.parse(content);
    const config = this.getConfig();
    const errors = Markdoc.validate(ast, config);

    if (errors.length > 0) {
      throw new Error(`Markdoc validation errors: ${errors.map(e => e.error).join(', ')}`);
    }

    return Markdoc.transform(ast, config);
  }

  async parseFile(filename: string) {
    const fullPath = join(process.cwd(), '/docs', filename);
    console.log(`Resolving file path: ${fullPath}`);
    const content = await readFile(fullPath, 'utf-8')
    return this.parse(content);
  }

  private getConfig() {
    return {
      tags: {
        callout: {
          render: 'Callout',
          attributes: {
            type: {
              type: String,
              default: 'info',
              matches: ['info', 'warning', 'error', 'success']
            },
            title: {
              type: String
            }
          }
        },
      },
      nodes: {
        heading: {
          render: 'Heading',
          attributes: {
            level: { type: Number, required: true },
            id: { type: String }
          }
        }
      }
    }
  }
}