export function isNpmGlobalInstall(): boolean {
  return process.env.npm_config_global === 'true';
}
