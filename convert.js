import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import chalk from 'chalk';

// Set the path to the FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Utility functions
const log = (message, color = 'white') => {
  console.log(chalk[color](message));
};

const getConversionOptions = (format, scale, fps) => {
  const scaleFilter = scale && scale !== 'auto' ? `-vf scale=${scale}` : '';
  const fpsFilter = fps && fps !== 'auto' ? `-vf fps=${fps}` : '';
  return [scaleFilter, '-gifflags', 'transdiff', '-y', fpsFilter].filter(Boolean);
};

const convertMedia = (inputPath, outputPath, format, scale, fps) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(getConversionOptions(format, scale, fps))
      .on('end', () => {
        log(`Finished processing ${chalk.greenBright(path.basename(inputPath))}`);
        resolve();
      })
      .on('error', (err) => {
        log(`Error: ${err.message}`, 'redBright');
        reject(err.message);
      })
      .on('progress', (progress) => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(
          `Processing ${path.basename(inputPath)}: ${chalk.cyanBright((progress.percent || 0).toFixed(2))}% complete\r`
        );
      })
      .save(outputPath);
  });
};

const getMediaFiles = (inputPaths) => {
  const mediaFiles = [];
  const extensions = ['.mp4', '.avi', '.jpg', '.jpeg', '.png'];

  inputPaths.forEach((inputPath) => {
    log(`Checking ${inputPath}`);
    const stats = fs.statSync(inputPath);

    if (stats.isDirectory()) {
      fs.readdirSync(inputPath).forEach((file) => {
        const filePath = path.join(inputPath, file);
        if (fs.statSync(filePath).isFile() && extensions.includes(path.extname(filePath).toLowerCase())) {
          mediaFiles.push(filePath);
        }
      });
    } else if (stats.isFile() && extensions.includes(path.extname(inputPath).toLowerCase())) {
      mediaFiles.push(inputPath);
    }
  });

  log(`Media files found:`);
  mediaFiles.forEach((file) => {
    log(` ${chalk.blueBright('├──')} ${chalk.whiteBright(path.basename(file))}`);
  });

  return mediaFiles;
};

// Main execution
const main = async () => {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  if (args.length < 4) {
    log('Usage: node script.js <inputPaths> <outputFormat> <scale> <fps>', 'redBright');
    process.exit(1);
  }

  const inputPaths = args.slice(0, -3);
  const format = args[args.length - 3].toLowerCase();
  const scale = args[args.length - 2];
  const fps = args[args.length - 1];

  if (!['gif', 'mp4', 'webm', 'mov', 'avi'].includes(format)) {
    log('Invalid format. Valid formats: gif, mp4, webm, mov, avi.', 'redBright');
    process.exit(1);
  }

  log(`Input paths: ${chalk.cyanBright(inputPaths.join(', '))}`);
  log(`Format: ${chalk.cyanBright(format)}`);
  log(`Scale: ${chalk.cyanBright(scale)}`);
  log(`FPS: ${chalk.cyanBright(fps)}`);

  const mediaFiles = getMediaFiles(inputPaths);
  if (mediaFiles.length === 0) {
    log('No media files found.', 'redBright');
    process.exit(1);
  }

  const outputFolder = path.dirname(mediaFiles[0]);
  let completedFiles = 0;

  for (const file of mediaFiles) {
    const outputFile = path.join(outputFolder, path.basename(file, path.extname(file)) + `.${format}`);

    if (fs.existsSync(outputFile)) {
      log(`File ${chalk.cyanBright(path.basename(outputFile))} exists. Skipping.`, 'yellowBright');
      continue;
    }

    try {
      await convertMedia(file, outputFile, format, scale, fps);
      completedFiles++;
      log(`Completed ${completedFiles} of ${mediaFiles.length} files.`);
    } catch (err) {
      log(`Failed to convert ${file}: ${err}`, 'redBright');
    }
  }

  const endTime = Date.now();
  const totalTime = ((endTime - startTime) / 1000).toFixed(2);
  log(`All files processed. Total time: ${chalk.cyanBright(totalTime)} seconds.`);
};

main();
