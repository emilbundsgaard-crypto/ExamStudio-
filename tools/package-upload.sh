#!/usr/bin/env bash
# Builds the site and assembles a folder that can be uploaded as-is to a PHP web host
# (e.g. Simply.com) – result: upload/StudioExam/
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf upload && mkdir -p upload/StudioExam
cp -R dist/. upload/StudioExam/
cp server/.htaccess upload/StudioExam/.htaccess
mkdir -p upload/StudioExam/api
cp server/api/ask.php server/api/.htaccess server/api/.env.example upload/StudioExam/api/
cp server/api/.env.example upload/StudioExam/api/.env
echo "Ready: upload/StudioExam ($(du -sh upload/StudioExam | cut -f1), $(find upload/StudioExam -type f | wc -l) files)"
