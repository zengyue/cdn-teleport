import path from 'node:path';
import sharp from 'sharp';
import fs from 'node:fs/promises';

// 支持的图片格式 (不包括 webp，因为不需要处理)
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// 检查是否为支持的图片文件
function isSupportedImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

// 获取目录下所有图片文件（支持递归子目录）
async function getImageFilesFromDirectory(
  dirPath: string,
  recursive: boolean = false
): Promise<string[]> {
  const imageFiles: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && isSupportedImageFile(entry.name)) {
        // webp 文件不存在，可以处理
        imageFiles.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        // 递归处理子目录
        const subDirFiles = await getImageFilesFromDirectory(
          fullPath,
          recursive
        );
        imageFiles.push(...subDirFiles);
      }
    }
  } catch (error) {
    console.error(`❌ 无法读取目录: ${dirPath}`, error);
  }

  return imageFiles;
}

// 检查路径是否包含通配符
function hasWildcard(imagePath: string): boolean {
  return imagePath.includes('*');
}

// 处理通配符路径
async function processWildcardPath(wildcardPath: string): Promise<string[]> {
  const results: string[] = [];

  // 如果路径以 /* 结尾，表示要递归处理整个目录
  if (wildcardPath.endsWith('/*')) {
    const basePath = wildcardPath.slice(0, -2); // 移除 /*
    try {
      const stats = await fs.stat(basePath);
      if (stats.isDirectory()) {
        results.push(basePath);
      }
    } catch (error) {
      console.error(`❌ 无法访问路径: ${basePath}`, error);
    }
  }

  return results;
}

const convertFiles = [
  {
    image: 'files/*',
    width: 1024,
    height: 1024,
  },
];

async function main() {
  // 收集所有需要转换的文件
  const allFilesToConvert: Array<{
    image: string;
    width: number;
    height: number;
  }> = [];

  for (const config of convertFiles) {
    try {
      // 检查是否包含通配符
      if (hasWildcard(config.image)) {
        const matchedPaths = await processWildcardPath(config.image);

        for (const matchedPath of matchedPaths) {
          const imageFiles = await getImageFilesFromDirectory(
            matchedPath,
            true
          ); // 递归处理

          // 将目录下的每个图片文件添加到转换列表
          for (const imageFile of imageFiles) {
            allFilesToConvert.push({
              image: imageFile,
              width: config.width,
              height: config.height,
            });
          }
        }
      } else {
        const targetPath = path.resolve(config.image);
        const stats = await fs.stat(targetPath);

        if (stats.isDirectory()) {
          const imageFiles = await getImageFilesFromDirectory(
            targetPath,
            false
          ); // 不递归，保持原有行为

          // 将目录下的每个图片文件添加到转换列表
          for (const imageFile of imageFiles) {
            allFilesToConvert.push({
              image: imageFile,
              width: config.width,
              height: config.height,
            });
          }
        } else if (stats.isFile()) {
          if (isSupportedImageFile(config.image)) {
            allFilesToConvert.push(config);
          }
        }
      }
    } catch (error) {
      console.error(`❌ 无法访问路径: ${config.image}`, error);
    }
  }

  for (const file of allFilesToConvert) {
    try {
      const inputPath = path.resolve(file.image);

      // 直接生成 webp 输出路径
      const outputPath = inputPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');

      // 检查输出文件是否已存在
      try {
        await fs.access(outputPath);
        continue;
      } catch (error) {
        // 文件不存在，继续转换
      }

      // 检查输入文件是否存在
      try {
        await fs.access(inputPath);
      } catch (error) {
        console.error(`❌ 文件不存在: ${inputPath}`);
        continue;
      }

      // 使用 sharp 转换图片
      await sharp(inputPath)
        .resize(file.width, file.height, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toFile(outputPath);

      console.log(`✅ 成功转换: ${file.image} -> ${outputPath}`);

      // 获取文件大小对比
      const inputStats = await fs.stat(inputPath);
      const outputStats = await fs.stat(outputPath);
      const savings = (
        ((inputStats.size - outputStats.size) / inputStats.size) *
        100
      ).toFixed(1);

      console.log(`   原始大小: ${(inputStats.size / 1024).toFixed(1)}KB`);
      console.log(`   压缩后: ${(outputStats.size / 1024).toFixed(1)}KB`);
      console.log(`   节省: ${savings}%`);
    } catch (error) {
      console.error(`❌ 转换失败: ${file.image}`, error);
    }
  }

  console.log('转换完成！');
}

main();
