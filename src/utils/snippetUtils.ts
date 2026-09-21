import { Snippet } from '../types';
import { TranslationFunction } from '../contexts/LanguageContext';

const DEFAULT_SNIPPET_IDS_BY_COMMAND: Record<string, string> = {
  'sudo apt update && sudo apt upgrade -y': 'snip-1',
  'sudo apt autoremove -y && sudo apt clean': 'snip-2',
  'df -h && echo "--- RAM ---" && free -m': 'snip-3',
  'sudo ss -tulpn': 'snip-4',
  'systemctl --failed': 'snip-5',
  'docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"': 'snip-6',
  'docker stats --no-stream': 'snip-7',
  'sudo journalctl -p 3 -xb -n 50 --no-pager': 'snip-8',
};

export function getSnippetTitle(snippet: Snippet, t: TranslationFunction): string {
  const snipId = snippet.id?.startsWith('snip-')
    ? snippet.id
    : DEFAULT_SNIPPET_IDS_BY_COMMAND[snippet.command?.trim()] || snippet.id;

  const key = `snippets.defaultItems.${snipId}.title`;
  const localized = t(key);
  return localized !== key ? localized : snippet.title;
}

export function getSnippetDescription(snippet: Snippet, t: TranslationFunction): string {
  const snipId = snippet.id?.startsWith('snip-')
    ? snippet.id
    : DEFAULT_SNIPPET_IDS_BY_COMMAND[snippet.command?.trim()] || snippet.id;

  const key = `snippets.defaultItems.${snipId}.description`;
  const localized = t(key);
  if (localized !== key) {
    return localized;
  }
  return snippet.description || t('snippets.noDescription');
}
