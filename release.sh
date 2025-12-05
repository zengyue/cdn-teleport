#!/bin/bash

# 如果任何命令失败，立即退出
set -e

# 检查是否提供了版本类型 (patch, minor, major) 和提交消息
if [ -z "$1" ] || [ -z "$2" ]; then
  echo "错误: 请提供版本类型和提交消息。"
  echo "用法: $0 <version_type> \"commit_message\""
  echo "例如: $0 patch \"fix: correct a typo\""
  exit 1
fi

VERSION_TYPE=$1
COMMIT_MESSAGE=$2

echo "🚀 开始发布流程..."

# 1. 添加所有文件到暂存区
echo "git add ."
git add .

# 2. 提交你的功能或修复更改
echo "git commit -m \"$COMMIT_MESSAGE\""
git commit -m "$COMMIT_MESSAGE"

# 3. 使用 npm version 更新版本号，并创建发布的 commit 和 tag
#    -m 选项自定义了版本 commit 的消息, %s 会被替换为新的版本号
echo "npm version $VERSION_TYPE -m \"chore(release): %s\""
npm version "$VERSION_TYPE" -m "chore(release): %s"

# 4. 推送所有提交和标签
echo "git push --follow-tags"
git push --follow-tags

echo "✅ 发布成功！"
