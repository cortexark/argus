/**
 * Chalk-colored logger for argus.
 * Levels: info (blue), warn (yellow), alert (red bold), debug (gray)
 * Format: [timestamp] LEVEL message
 */

import chalk from 'chalk';

function formatLine(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${level} ${message}`;
}

export function info(message) {
  console.log(chalk.blue(formatLine('INFO ', message)));
}

export function warn(message) {
  console.log(chalk.yellow(formatLine('WARN ', message)));
}

export function alert(message) {
  console.log(chalk.red.bold(formatLine('ALERT', message)));
}

export function debug(message) {
  console.log(chalk.gray(formatLine('DEBUG', message)));
}

export default { info, warn, alert, debug };
