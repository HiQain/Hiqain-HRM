#!/bin/bash
set -e
npm install -f
npm run push --workspace=@workspace/db
