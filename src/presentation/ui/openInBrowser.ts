import { execFile } from 'node:child_process';

export function openInBrowser(url: string): void {
  var child =
    process.platform === 'darwin'
      ? execFile('open', [url])
      : process.platform === 'win32'
        ? execFile('cmd', ['/c', 'start', '', url])
        : execFile('xdg-open', [url]);
  child.unref();
}
