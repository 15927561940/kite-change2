FROM node:20-alpine AS frontend-builder

WORKDIR /app/ui

# 先复制依赖文件，利用Docker层缓存
COPY ui/package.json ui/pnpm-lock.yaml ./

# 安装pnpm并安装依赖
RUN npm install -g pnpm@latest && \
    pnpm install --frozen-lockfile

# 复制源代码并构建
COPY ui/ ./
RUN pnpm run build

FROM golang:1.24-alpine AS backend-builder

# 安装git（某些Go依赖可能需要）
RUN apk add --no-cache git

WORKDIR /app

# 先复制go mod文件，利用Docker层缓存
COPY go.mod go.sum ./
RUN go mod download

# 复制源代码（排除不必要的文件）
COPY *.go ./
COPY pkg/ ./pkg/
COPY cmd/ ./cmd/ 2>/dev/null || true

# 从前端构建阶段复制静态文件
COPY --from=frontend-builder /app/static ./static

# 构建Go应用
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o kite .

FROM gcr.io/distroless/static:nonroot

WORKDIR /app

COPY --from=backend-builder /app/kite .

EXPOSE 8080

CMD ["./kite"]
