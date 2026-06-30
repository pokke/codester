import * as prettier from 'prettier/standalone'
import * as babel from 'prettier/plugins/babel'
import * as estree from 'prettier/plugins/estree'
import * as typescript from 'prettier/plugins/typescript'
import * as postcss from 'prettier/plugins/postcss'
import * as html from 'prettier/plugins/html'
import * as markdown from 'prettier/plugins/markdown'
import * as yaml from 'prettier/plugins/yaml'

// Formatering via Prettier (standalone, körs i renderern – inga native-beroenden).
const parserFor: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'babel',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  markdown: 'markdown',
  yaml: 'yaml'
}

const plugins = [babel, estree, typescript, postcss, html, markdown, yaml]

export function canFormat(lang: string): boolean {
  return lang in parserFor
}

export async function formatCode(code: string, lang: string): Promise<string> {
  const parser = parserFor[lang]
  if (!parser) return code
  return prettier.format(code, { parser, plugins })
}
