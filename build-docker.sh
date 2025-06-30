#!/bin/bash

# Docker构建优化脚本
set -e

VERSION=${1:-v0.9.36}
REGISTRY="registry.cn-hongkong.aliyuncs.com/bobo-k8s-01"
IMAGE_NAME="kite-cursor"
FULL_TAG="${REGISTRY}/${IMAGE_NAME}:${VERSION}"

echo "🚀 构建Docker镜像: ${FULL_TAG}"

# 检查Docker Buildx是否可用
if ! docker buildx version >/dev/null 2>&1; then
    echo "❌ Docker Buildx 不可用，请升级Docker版本"
    exit 1
fi

# 创建并使用buildx builder（如果不存在）
if ! docker buildx inspect kite-builder >/dev/null 2>&1; then
    echo "📦 创建Docker Buildx Builder..."
    docker buildx create --name kite-builder --use
fi

echo "🔍 可用的构建选项:"
echo "1. 标准构建 (原始Dockerfile)"
echo "2. 优化构建 (缓存优化)"  
echo "3. 并行构建 (BuildKit并行)"
echo "4. 生产构建 (多平台)"

read -p "请选择构建模式 [1-4]: " choice

case $choice in
    1)
        echo "📦 使用标准构建..."
        docker build -f Dockerfile -t "${FULL_TAG}" .
        ;;
    2)
        echo "📦 使用优化构建..."
        docker build -f Dockerfile.optimized -t "${FULL_TAG}" .
        ;;
    3)
        echo "📦 使用并行构建..."
        export DOCKER_BUILDKIT=1
        docker buildx build \
            --builder kite-builder \
            --platform linux/amd64 \
            --file Dockerfile.parallel \
            --tag "${FULL_TAG}" \
            --load \
            .
        ;;
    4)
        echo "📦 使用生产构建 (多平台)..."
        export DOCKER_BUILDKIT=1
        docker buildx build \
            --builder kite-builder \
            --platform linux/amd64,linux/arm64 \
            --file Dockerfile.parallel \
            --tag "${FULL_TAG}" \
            --push \
            .
        echo "✅ 镜像已推送到远程仓库"
        exit 0
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo "✅ 构建完成!"
echo "📦 镜像标签: ${FULL_TAG}"

# 显示镜像大小
echo "📊 镜像信息:"
docker images "${FULL_TAG}" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

# 询问是否推送
read -p "🚀 是否推送到远程仓库? [y/N]: " push_choice
if [[ $push_choice =~ ^[Yy]$ ]]; then
    echo "📤 推送镜像到远程仓库..."
    docker push "${FULL_TAG}"
    echo "✅ 推送完成!"
fi