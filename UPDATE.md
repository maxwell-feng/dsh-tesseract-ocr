# Update Guide

English | [简体中文](UPDATE.zh.md)

> Verified against DeepSeek Harness **0.1.5-rc.2**.

This document outlines how to upgrade `dsh-tesseract-ocr` to the latest release and verify compatibility.

---

## 1. Upgrade Instructions

### Upgrading via npm
```bash
dsh plugin --profile web update dsh-tesseract-ocr@latest
```
or pin version:
```bash
dsh plugin --profile web add dsh-tesseract-ocr@0.7.0
```

### Upgrading via Git Checkout
```bash
cd /path/to/dsh-tesseract-ocr
git pull origin master
pnpm install
npm run build
```
or refresh via GitHub link:
```bash
dsh plugin --profile web add github:maxwell-feng/dsh-tesseract-ocr
```

### Upgrading via Tarball
```bash
dsh plugin --profile web add ./dsh-tesseract-ocr-0.7.0.tgz
```

---

## 2. Verification and Rollback

Launch the profile:
```bash
dsh web
```
In a text-only model session, attach an image containing text and confirm the model answers based on the recognized text.

To roll back:
```bash
dsh plugin --profile web add dsh-tesseract-ocr@0.4.0
```
