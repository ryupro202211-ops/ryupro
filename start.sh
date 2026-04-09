#!/bin/bash
NODE_PATH="/Users/ryuheiotsuka/Library/Caches/ms-playwright-go/1.50.1/node"
SERVER_SCRIPT="server.js"

echo "Starting ryupro web server..."
"$NODE_PATH" "$SERVER_SCRIPT"
