手动打包
docker build -t your-registry/kite:v1.0.2 .

#修改镜像后部署
kubectl apply -f deploy/install.yaml
