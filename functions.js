import chalk from 'chalk';

export function getCurrentTime() {
  return new Date().toTimeString().split(' ')[0];
}

export function logWithTimestamp(message, color = 'whiteBright') {
  const time = getCurrentTime();
  console.log(`${chalk.dim(time)} ${chalk.greenBright('▶')} ${chalk[color](message) || chalk.whiteBright(message)}`);
}

export function formatFileSize(size) {
  // Example function that returns file size as a string without parentheses
  const bytes = size;
  const kilobytes = bytes / 1024;
  const megabytes = kilobytes / 1024;

  if (megabytes > 1) {
    return `${megabytes.toFixed(2)} MB`;
  } else if (kilobytes > 1) {
    return `${kilobytes.toFixed(2)} KB`;
  } else {
    return `${bytes} bytes`;
  }
}

export function formatPercentage(percent) {
  return `${percent.toFixed(2)}%`;
}
