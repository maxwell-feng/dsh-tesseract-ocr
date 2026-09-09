# 更新说明文档 (Update Guide)

[English](UPDATE.md) | 简体中文

> 本版本已在 DeepSeek Harness **0.1.5-alpha.1** 最新发布版本上全面验证。

本文档介绍如何将 **dsh-tesseract-ocr** 插件升级至最新版本。

---

## 1. 升级指令

### 从 npm 升级
```bash
dsh plugin --profile web update dsh-tesseract-ocr@latest
```
或指定版本：
```bash
dsh plugin --profile web add dsh-tesseract-ocr@0.4.0
```

### 从 Git 仓库升级
```bash
cd /path/to/dsh-tesseract-ocr
git pull origin main
pnpm install
npm run build
```
或更新 profile：
```bash
dsh plugin --profile web add github:maxwell-feng/dsh-tesseract-ocr
```

### 从 Tarball 升级
```bash
dsh plugin --profile web add ./dsh-tesseract-ocr-0.4.0.tgz
```

---

## 2. 验证与回滚

启动服务并验证：
```bash
dsh web
```
在纯文本模型会话中附加一张包含文字的图片，确认模型能识别并返回图片中的内容。

若需回滚至上一版本：
```bash
dsh plugin --profile web add dsh-tesseract-ocr@0.3.8
```
