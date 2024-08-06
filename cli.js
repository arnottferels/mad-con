import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import readline from 'readline';
import chalk from 'chalk';
import { logWithTimestamp, formatFileSize, formatPercentage, getCurrentTime } from './functions.js';

// Set the path to the FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Function to create FFmpeg conversion options array
const getConversionOptions = (format, scale, fps) => {
  const scaleFilter = scale && scale !== 'auto' ? `-vf scale=${scale}` : '-vf scale=-1:-1';
  const fpsFilter = fps && fps !== 'auto' ? `-vf fps=${fps}` : '';

  return [scaleFilter, '-gifflags', 'transdiff', '-y', fpsFilter].filter(Boolean);
};

// Function to convert video to selected format
const convertVideo = async (inputPath, outputPath, format, scale, fps, onProgress) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(getConversionOptions(format, scale, fps))
      .on('end', () => {
        logWithTimestamp(
          `Finished processing ${chalk.greenBright(`${path.basename(inputPath)}`)} ${chalk.dim(
            `(src: ${formatFileSize(fs.statSync(inputPath).size)}, output: ${formatFileSize(
              fs.statSync(outputPath).size
            )})`
          )}`,
          'whiteBright'
        );
        resolve();
      })
      .on('error', (err) => {
        logWithTimestamp(`An error occurred: ${err.message}`, 'redBright');
        reject(err.message);
      })
      .on('progress', (progress) => {
        if (onProgress) {
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          onProgress(path.basename(inputPath), progress);
        }
      })
      .save(outputPath);
  });
};

// Function to get video files from directory
const getVideoFiles = (inputPaths) => {
  const videoFiles = [];

  inputPaths.forEach((inputPath) => {
    logWithTimestamp(`Checking path: ${chalk.yellowBright(inputPath)}`, 'whiteBright');
    const stats = fs.statSync(inputPath);
    const processFiles = (files) => {
      files.forEach((file) => {
        const filePath = path.join(inputPath, file);
        if (fs.statSync(filePath).isFile() && path.extname(filePath).toLowerCase() === '.mp4') {
          videoFiles.push(filePath);
        }
      });
    };

    if (stats.isDirectory()) {
      const files = fs.readdirSync(inputPath);
      logWithTimestamp(`Directory contents:`, 'whiteBright');
      processFiles(files);
    } else if (stats.isFile() && path.extname(inputPath).toLowerCase() === '.mp4') {
      videoFiles.push(inputPath);
    }
  });

  logWithTimestamp(`${chalk.whiteBright(`Video files found`)}:`, 'bgGreen');

  videoFiles.forEach((file, index) => {
    const isLastFile = index === videoFiles.length - 1;
    const symbol = isLastFile ? '└──' : '├──';

    // Split the file path into the directory path, file name, and extension
    const lastBackslashIndex = file.lastIndexOf('\\');
    const path = file.slice(0, lastBackslashIndex);
    const fileWithExtension = file.slice(lastBackslashIndex + 1);
    const [fileName, ext] = fileWithExtension.split(/\.(?=[^.]+$)/);

    // Log the file with dimmed path, normal file name, and cyanBright extension
    logWithTimestamp(
      ` ${chalk.blueBright(symbol)} ${chalk.dim(path + '\\')}${chalk.whiteBright(fileName)}.${chalk.cyanBright(ext)}`,
      'whiteBright'
    );
  });

  return videoFiles;
};

// Function to print directory tree
const printDirectoryTree = (dirPath, level = 0) => {
  const indent = ' '.repeat(level * 2);
  const items = fs.readdirSync(dirPath);

  items.forEach((item) => {
    const fullPath = path.join(dirPath, item);
    const stats = fs.statSync(fullPath);
    const size = formatFileSize(stats.size);

    if (stats.isDirectory()) {
      logWithTimestamp(`${indent}- ${item}/`, 'cyanBright');
      printDirectoryTree(fullPath, level + 1);
    } else {
      logWithTimestamp(`${indent}- ${item} ${size}`, 'whiteBright');
    }
  });
};

// Function to prompt user input for scale with validation and retry
const promptUserScale = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const validateScale = (input) => {
    if (input === '' || input === 'auto') return 'auto';
    const scaleValue = parseFloat(input);
    if (!isNaN(scaleValue) && scaleValue >= 0.25 && scaleValue <= 3.0) {
      return input;
    } else {
      logWithTimestamp(
        `${chalk.redBright(`Invalid scale value.`)} ${chalk.bgRed(
          `Please enter a number between 0.25 and 3.0, or "auto" for source dimensions.`
        )}`,
        'white'
      );
      return null;
    }
  };

  let scale;
  while (!scale) {
    logWithTimestamp(
      `Enter the scale (e.g., 0.25, 1, 1.5, 2, 3) ${chalk.cyanBright(
        'or'
      )} "auto" for source dimensions ${chalk.cyanBright('or')} Enter for default: `,
      'whiteBright'
    );

    const answer = await new Promise((resolve) => rl.question('', resolve));
    scale = validateScale(answer.trim());
  }

  rl.close();
  return scale;
};

// Function to prompt user input for FPS with validation and retry
const promptUserFps = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const validateFps = (input) => {
    if (input === '' || input === 'auto') return 'auto';
    const fpsValue = parseInt(input, 10);
    if (!isNaN(fpsValue) && fpsValue >= 8 && fpsValue <= 60) {
      return input;
    } else {
      logWithTimestamp(
        `${chalk.redBright(`Invalid FPS value.`)} ${chalk.bgRed(
          `Please enter a number between 8 and 60, or "auto" for source FPS.`
        )}`,
        'white'
      );

      return null;
    }
  };

  let fps;
  while (!fps) {
    logWithTimestamp(
      `Enter the FPS (8-60) ${chalk.cyanBright('or')} "auto" for source FPS ${chalk.cyanBright(
        'or'
      )} Enter for default: `,
      'whiteBright'
    );

    const answer = await new Promise((resolve) => rl.question('', resolve));
    fps = validateFps(answer.trim());
  }

  rl.close();
  return fps;
};

// Function to prompt user input for format with options and retry
const promptUserFormat = async () => {
  const message =
    `${chalk.yellowBright(`Select the output format:`)}\n` +
    `- Press 1 for GIF\n` +
    `- Press 2 for MP4\n` +
    `- Press 3 for WebM\n` +
    `- Press 4 for MOV\n` +
    `- Press 5 for AVI`;

  // Split the message into individual lines and log each one
  message.split('\n').forEach((line) => {
    logWithTimestamp(line, 'whiteBright');
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('', (answer) => {
      rl.close();
      const trimmedAnswer = answer.trim();
      switch (trimmedAnswer) {
        case '1':
          resolve('gif');
          break;
        case '2':
          resolve('mp4');
          break;
        case '3':
          resolve('webm');
          break;
        case '4':
          resolve('mov');
          break;
        case '5':
          resolve('avi');
          break;
        default:
          logWithTimestamp(
            `${chalk.whiteBright('Invalid format selected. Please select a valid option.')}`,
            'redBright'
          );
          resolve(null);
      }
    });
  });
};

// Command line arguments parsing
const parseArguments = () => {
  const args = process.argv.slice(2);

  const inputPaths = args.filter((arg) => fs.existsSync(arg) && fs.statSync(arg).isDirectory());

  return { inputPaths };
};

const promptStartConversion = async () => {
  const message =
    `${chalk.yellowBright(`Ready to start the conversion?`)}\n` +
    `- Press 1 to start now\n` +
    `- Press 2 to restart the process\n` +
    `- Press 3 to exit`;

  // Split the message into individual lines and log each one
  message.split('\n').forEach((line) => {
    logWithTimestamp(line, 'whiteBright');
  });

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('', (answer) => {
      rl.close();
      const trimmedAnswer = answer.trim();
      switch (trimmedAnswer) {
        case '1':
          resolve(true); // Start the conversion
          break;
        case '2':
          resolve(false); // Restart the process
          break;
        case '3':
          logWithTimestamp(`${chalk.whiteBright(`Exiting the process. ${chalk.bgRed(`Goodbye!`)} `)}`, 'redBright');
          process.exit(0); // Exit the process
        default:
          logWithTimestamp(
            `${chalk.whiteBright(
              `Invalid selection. ${chalk.bgYellow(`${chalk.whiteBright(`Please choose a valid option.`)}`)}`
            )}`,
            'redBright'
          );
          promptStartConversion().then(resolve); // Prompt again
      }
    });
  });
};

// Function to prompt user input for confirmation
const promptUserConfirmation = async (message) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Split the message into individual lines and log each one
  message.split('\n').forEach((line) => {
    logWithTimestamp(line, 'whiteBright');
  });

  return new Promise((resolve) => {
    rl.question('', (answer) => {
      rl.close();
      const trimmedAnswer = answer.trim();
      switch (trimmedAnswer) {
        case '1':
          logWithTimestamp(`${chalk.whiteBright('Option selected:')} Overwrite`, 'cyanBright');
          break;
        case '2':
          logWithTimestamp(`${chalk.whiteBright('Option selected:')} Overwrite all`, 'cyanBright');
          break;
        case '3':
          logWithTimestamp(`${chalk.whiteBright('Option selected:')} Skip this file`, 'yellowBright');
          break;
        case '4':
          logWithTimestamp(`${chalk.whiteBright('Option selected:')} Skip all remaining files`, 'yellowBright');
          break;
        case '0':
          logWithTimestamp(`${chalk.whiteBright('Option selected:')} Cancel`, 'redBright');
          break;
        default:
          logWithTimestamp(`${chalk.whiteBright('Invalid option selected')}`, 'redBright');
          break;
      }
      resolve(trimmedAnswer);
    });
  });
};

// Main execution
(async () => {
  let restart;
  do {
    const { inputPaths } = parseArguments();
    const finalScale = await promptUserScale();
    const finalFps = await promptUserFps();
    const format = await promptUserFormat();

    logWithTimestamp(`Input paths: ${chalk.cyanBright(inputPaths.join(', '))}`, 'whiteBright');
    logWithTimestamp(`Scale: ${chalk.cyanBright(finalScale)}`, 'whiteBright');
    logWithTimestamp(`FPS: ${chalk.cyanBright(finalFps)}`, 'whiteBright');
    logWithTimestamp(`Format: ${chalk.cyanBright(format)}`, 'whiteBright');

    if (!format) {
      logWithTimestamp('Invalid format. Restarting.', 'redBright');
      restart = true;
      continue;
    }

    const videoFiles = getVideoFiles(inputPaths);

    if (videoFiles.length === 0) {
      logWithTimestamp('No video files found.', 'redBright');
      return;
    }

    const outputFolder = path.dirname(videoFiles[0]);
    let completedFiles = 0;
    let overwriteAll = false;
    let skipAll = false;

    // Prompt to start conversion
    const startConversion = await promptStartConversion();
    if (!startConversion) {
      logWithTimestamp('Restarting conversion process.', 'cyanBright');
      restart = true;
      continue;
    }

    for (const file of videoFiles) {
      const outputFile = path.join(outputFolder, path.basename(file, path.extname(file)) + `.${format}`);

      if (fs.existsSync(outputFile)) {
        if (!overwriteAll && !skipAll) {
          const userResponse = await promptUserConfirmation(
            `File ${chalk.cyanBright(`${path.basename(outputFile)}`)} already exists.\n` +
              `- Press 1 to overwrite\n` +
              `- Press 2 to overwrite all\n` +
              `- Press 3 to skip this file\n` +
              `- Press 4 to skip all remaining files\n` +
              `- Press 0 to cancel`
          );

          switch (userResponse) {
            case '0':
              logWithTimestamp('Process canceled by user.', 'redBright');
              process.exit(1);
            case '2':
              overwriteAll = true;
              break;
            case '4':
              skipAll = true;
              continue;
            case '3':
              logWithTimestamp(`Skipping ${path.basename(outputFile)}`, 'yellowBright');
              continue;
            case '1':
            default:
              break;
          }
        }
      }

      if (skipAll) continue;

      try {
        await convertVideo(file, outputFile, format, finalScale, finalFps, (fileName, progress) => {
          process.stdout.write(
            `${getCurrentTime()} ▶ Processing ${fileName}: ${chalk.cyanBright(
              formatPercentage(progress.percent)
            )} complete\r`
          );
        });
        completedFiles++;
        logWithTimestamp(`Completed ${completedFiles} out of ${videoFiles.length} files.`, 'cyanBright');
      } catch (err) {
        logWithTimestamp(`Failed to convert ${file}: ${err}`, 'redBright');
      }
    }

    logWithTimestamp('All files processed successfully.', 'cyanBright');
    restart = false;
  } while (restart);
})();
