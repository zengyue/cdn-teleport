import path from 'node:path';
import fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// 支持的视频格式
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

// 检查是否为支持的视频文件
function isSupportedVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.includes(ext);
}

// 获取目录下所有视频文件（支持递归子目录）
async function getVideoFilesFromDirectory(
  dirPath: string,
  recursive: boolean = false
): Promise<string[]> {
  const videoFiles: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && isSupportedVideoFile(entry.name)) {
        videoFiles.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        // 递归处理子目录
        const subDirFiles = await getVideoFilesFromDirectory(
          fullPath,
          recursive
        );
        videoFiles.push(...subDirFiles);
      }
    }
  } catch (error) {
    console.error(`❌ 无法读取目录: ${dirPath}`, error);
  }

  return videoFiles;
}

// 检查 FFmpeg 是否可用
async function checkFFmpeg(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch (error) {
    console.error('❌ FFmpeg 未安装或不在 PATH 中');
    console.error('请安装 FFmpeg: brew install ffmpeg');
    return false;
  }
}

// 提取视频首帧为 WebP 格式
async function extractPoster(
  videoPath: string,
  outputPath: string,
  quality: number = 75
): Promise<void> {
  try {
    // 使用 FFmpeg 提取第一帧为 WebP 格式
    // -i: 输入文件
    // -vframes 1: 只提取一帧
    // -c:v libwebp: 使用 WebP 编码器
    // -quality: WebP 质量 (0-100, 数字越大质量越高)
    // -y: 覆盖输出文件
    const command = `ffmpeg -i "${videoPath}" -vframes 1 -c:v libwebp -quality ${quality} -y "${outputPath}"`;

    await execAsync(command);
    console.log(`✅ 成功提取首帧: ${videoPath} -> ${outputPath}`);
  } catch (error) {
    console.error(`❌ 提取首帧失败: ${videoPath}`, error);
    throw error;
  }
}

// 提取视频最后一帧为 WebP 格式
async function extractLastFrame(
  videoPath: string,
  outputPath: string,
  quality: number = 75
): Promise<void> {
  try {
    // 使用更简单可靠的方法：直接从视频末尾提取最后一帧
    // -sseof -0.04: 从视频结尾前0.04秒开始（约1帧的时间）
    // -i: 输入文件
    // -vframes 1: 只提取一帧
    // -c:v libwebp: 使用 WebP 编码器
    // -quality: WebP 质量 (0-100, 数字越大质量越高)
    // -y: 覆盖输出文件
    const extractCommand = `ffmpeg -sseof -0.04 -i "${videoPath}" -vframes 1 -c:v libwebp -quality ${quality} -y "${outputPath}"`;
    await execAsync(extractCommand);

    console.log(`✅ 成功提取最后一帧: ${videoPath} -> ${outputPath}`);
  } catch (error) {
    console.error(`❌ 提取最后一帧失败: ${videoPath}`, error);
    throw error;
  }
} // 通用的视频帧提取函数
async function extractFrames(
  useLastFrame: boolean = false,
  onlyMissingPosters: boolean = false
) {
  // 检查 FFmpeg 是否可用
  if (!(await checkFFmpeg())) {
    process.exit(1);
  }

  const frameType = useLastFrame ? '最后一帧' : '首帧';
  const actionDesc = onlyMissingPosters
    ? `为未生成 poster.webp 的视频提取${frameType}作为 poster`
    : `提取视频${frameType}`;

  console.log(`🔍 正在扫描 monet 目录下的所有视频文件（${actionDesc}）...`);

  // 递归扫描 monet 目录下的所有视频文件
  const allVideoFiles = await getVideoFilesFromDirectory('monet', true);

  if (allVideoFiles.length === 0) {
    console.log('📹 未找到任何视频文件');
    return;
  }

  const checkDesc = onlyMissingPosters
    ? '个视频文件需要检查'
    : '个视频文件需要处理';
  console.log(`📹 找到 ${allVideoFiles.length} ${checkDesc}`);

  const defaultQuality = 75; // 统一使用 75 质量
  let processedCount = 0;
  let skippedCount = 0;

  for (const videoFile of allVideoFiles) {
    try {
      const inputPath = path.resolve(videoFile);

      // 生成输出路径 (同名但扩展名改为 _poster.webp)
      const ext = path.extname(inputPath);
      const outputPath = inputPath.replace(ext, '_poster.webp');

      // 检查输出文件是否已存在
      try {
        await fs.access(outputPath);
        const skipMsg = onlyMissingPosters
          ? `⏭️  跳过已有 poster 的视频: ${path.basename(inputPath)}`
          : `⏭️  跳过已存在的文件: ${outputPath}`;
        console.log(skipMsg);
        skippedCount++;
        continue;
      } catch (error) {
        // 文件不存在，继续处理
      }

      // 检查输入文件是否存在
      try {
        await fs.access(inputPath);
      } catch (error) {
        console.error(`❌ 文件不存在: ${inputPath}`);
        continue;
      }

      // 提取帧
      if (useLastFrame) {
        await extractLastFrame(inputPath, outputPath, defaultQuality);
      } else {
        await extractPoster(inputPath, outputPath, defaultQuality);
      }

      // 获取文件大小信息
      const outputStats = await fs.stat(outputPath);
      const sizeDesc = onlyMissingPosters ? 'poster' : frameType;
      console.log(
        `   ${sizeDesc}大小: ${(outputStats.size / 1024).toFixed(1)}KB`
      );
      processedCount++;
    } catch (error) {
      console.error(`❌ 处理失败: ${videoFile}`, error);
    }
  }

  const completionMsg = onlyMissingPosters
    ? `🎉 视频${frameType} poster 提取完成！处理了 ${processedCount} 个文件，跳过了 ${skippedCount} 个文件`
    : `🎉 视频${frameType}提取完成！${
        processedCount > 0 ? `处理了 ${processedCount} 个文件，` : ''
      }${skippedCount > 0 ? `跳过了 ${skippedCount} 个文件` : ''}`;

  console.log(completionMsg);
}

// 自动扫描 monet 目录下的所有视频文件并提取最后一帧作为 poster（只处理未生成 poster.webp 的视频）
async function extractLastFrames() {
  await extractFrames(true, true);
}

// 自动扫描 monet 目录下的所有视频文件
async function main() {
  await extractFrames(false, false);
}

// 如果直接运行此脚本
const isMainModule =
  process.argv[1] === import.meta.url ||
  process.argv[1]?.endsWith('extract-poster.ts');
if (isMainModule) {
  // 检查命令行参数，判断是提取首帧还是最后一帧
  const args = process.argv.slice(2);
  const extractLast = args.includes('--last') || args.includes('-l');

  if (extractLast) {
    extractLastFrames().catch(console.error);
  } else {
    main().catch(console.error);
  }
}

export {
  extractPoster,
  extractLastFrame,
  extractFrames,
  getVideoFilesFromDirectory,
  isSupportedVideoFile,
};
