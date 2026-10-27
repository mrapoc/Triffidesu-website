#!/bin/sh
# 20i runs this after pulling the live branch (My20i, Git Version Control,
# Deployment Script). The clone sits beside public_html, so copy it across.
# No --delete: the Instagram sync's files in public_html must survive.
set -eu
src=$(cd "$(dirname "$0")" && pwd)
rsync -rl --checksum --exclude=.git --exclude=.20i-deploy.sh "$src/" "$src/../public_html/"
