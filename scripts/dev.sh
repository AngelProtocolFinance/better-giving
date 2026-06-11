#!/usr/bin/env bash
mprocs \
  --names "dev,wsproxy,ngrok,qstash" \
  "react-router dev" \
  "docker compose up neon-wsproxy" \
  "ngrok http --url skink-driving-imp.ngrok-free.app 4200" \
  "pnpm dlx @upstash/qstash-cli dev"
