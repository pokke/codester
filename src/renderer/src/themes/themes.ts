// Temasystem för Codester.
// Varje tema är en uppsättning CSS-variabler. Vi applicerar dem på :root
// så att hela appen (och senare editorns syntaxfärger) följer valt tema.
// Det här är kärnan i "populär standard-synlighet" + anpassningsbarhet.

export interface Theme {
  id: string
  name: string
  type: 'dark' | 'light'
  colors: {
    bg: string // appens bakgrund
    bgElevated: string // paneler, sidofält
    bgInput: string // inmatningsfält
    border: string // avgränsare
    text: string // primär text
    textMuted: string // sekundär text
    accent: string // accentfärg (knappar, markering)
    accentText: string // text ovanpå accent
    added: string // git: tillagda rader
    removed: string // git: borttagna rader
    // Syntaxfärger – matchar populära teman för igenkänning
    synKeyword: string
    synString: string
    synComment: string
    synFunction: string
    synNumber: string
    synType: string
  }
}

export const themes: Theme[] = [
  {
    id: 'dark-plus',
    name: 'Dark+ (standard)',
    type: 'dark',
    colors: {
      bg: '#1e1e1e',
      bgElevated: '#252526',
      bgInput: '#3c3c3c',
      border: '#333333',
      text: '#d4d4d4',
      textMuted: '#858585',
      accent: '#0e639c',
      accentText: '#ffffff',
      added: '#487e02',
      removed: '#a31515',
      synKeyword: '#569cd6',
      synString: '#ce9178',
      synComment: '#6a9955',
      synFunction: '#dcdcaa',
      synNumber: '#b5cea8',
      synType: '#4ec9b0'
    }
  },
  {
    id: 'light-plus',
    name: 'Light+ (standard)',
    type: 'light',
    colors: {
      bg: '#ffffff',
      bgElevated: '#f3f3f3',
      bgInput: '#ffffff',
      border: '#e0e0e0',
      text: '#1f1f1f',
      textMuted: '#6e6e6e',
      accent: '#005fb8',
      accentText: '#ffffff',
      added: '#28a745',
      removed: '#d73a49',
      synKeyword: '#0000ff',
      synString: '#a31515',
      synComment: '#008000',
      synFunction: '#795e26',
      synNumber: '#098658',
      synType: '#267f99'
    }
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    type: 'dark',
    colors: {
      bg: '#282c34',
      bgElevated: '#21252b',
      bgInput: '#1b1d23',
      border: '#181a1f',
      text: '#abb2bf',
      textMuted: '#5c6370',
      accent: '#61afef',
      accentText: '#282c34',
      added: '#98c379',
      removed: '#e06c75',
      synKeyword: '#c678dd',
      synString: '#98c379',
      synComment: '#5c6370',
      synFunction: '#61afef',
      synNumber: '#d19a66',
      synType: '#e5c07b'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    type: 'dark',
    colors: {
      bg: '#282a36',
      bgElevated: '#21222c',
      bgInput: '#1e1f29',
      border: '#191a21',
      text: '#f8f8f2',
      textMuted: '#6272a4',
      accent: '#bd93f9',
      accentText: '#282a36',
      added: '#50fa7b',
      removed: '#ff5555',
      synKeyword: '#ff79c6',
      synString: '#f1fa8c',
      synComment: '#6272a4',
      synFunction: '#50fa7b',
      synNumber: '#bd93f9',
      synType: '#8be9fd'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    type: 'dark',
    colors: {
      bg: '#2e3440',
      bgElevated: '#272c36',
      bgInput: '#3b4252',
      border: '#3b4252',
      text: '#d8dee9',
      textMuted: '#7b88a1',
      accent: '#88c0d0',
      accentText: '#2e3440',
      added: '#a3be8c',
      removed: '#bf616a',
      synKeyword: '#81a1c1',
      synString: '#a3be8c',
      synComment: '#616e88',
      synFunction: '#88c0d0',
      synNumber: '#b48ead',
      synType: '#8fbcbb'
    }
  },
  {
    id: 'monokai',
    name: 'Monokai',
    type: 'dark',
    colors: {
      bg: '#272822',
      bgElevated: '#1e1f1c',
      bgInput: '#3e3d32',
      border: '#1e1f1c',
      text: '#f8f8f2',
      textMuted: '#75715e',
      accent: '#a6e22e',
      accentText: '#272822',
      added: '#a6e22e',
      removed: '#f92672',
      synKeyword: '#f92672',
      synString: '#e6db74',
      synComment: '#75715e',
      synFunction: '#a6e22e',
      synNumber: '#ae81ff',
      synType: '#66d9ef'
    }
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    type: 'dark',
    colors: {
      bg: '#002b36',
      bgElevated: '#073642',
      bgInput: '#073642',
      border: '#073642',
      text: '#93a1a1',
      textMuted: '#586e75',
      accent: '#268bd2',
      accentText: '#fdf6e3',
      added: '#859900',
      removed: '#dc322f',
      synKeyword: '#859900',
      synString: '#2aa198',
      synComment: '#586e75',
      synFunction: '#268bd2',
      synNumber: '#d33682',
      synType: '#b58900'
    }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    type: 'light',
    colors: {
      bg: '#fdf6e3',
      bgElevated: '#eee8d5',
      bgInput: '#ffffff',
      border: '#ddd6c1',
      text: '#586e75',
      textMuted: '#93a1a1',
      accent: '#268bd2',
      accentText: '#fdf6e3',
      added: '#859900',
      removed: '#dc322f',
      synKeyword: '#859900',
      synString: '#2aa198',
      synComment: '#93a1a1',
      synFunction: '#268bd2',
      synNumber: '#d33682',
      synType: '#b58900'
    }
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    type: 'dark',
    colors: {
      bg: '#0d1117',
      bgElevated: '#161b22',
      bgInput: '#21262d',
      border: '#30363d',
      text: '#c9d1d9',
      textMuted: '#8b949e',
      accent: '#58a6ff',
      accentText: '#0d1117',
      added: '#3fb950',
      removed: '#f85149',
      synKeyword: '#ff7b72',
      synString: '#a5d6ff',
      synComment: '#8b949e',
      synFunction: '#d2a8ff',
      synNumber: '#79c0ff',
      synType: '#ffa657'
    }
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    type: 'dark',
    colors: {
      bg: '#282828',
      bgElevated: '#1d2021',
      bgInput: '#3c3836',
      border: '#3c3836',
      text: '#ebdbb2',
      textMuted: '#928374',
      accent: '#fabd2f',
      accentText: '#282828',
      added: '#b8bb26',
      removed: '#fb4934',
      synKeyword: '#fb4934',
      synString: '#b8bb26',
      synComment: '#928374',
      synFunction: '#fabd2f',
      synNumber: '#d3869b',
      synType: '#8ec07c'
    }
  }
]

export const defaultThemeId = 'dark-plus'

export function getTheme(id: string): Theme {
  return themes.find((t) => t.id === id) ?? themes[0]
}
